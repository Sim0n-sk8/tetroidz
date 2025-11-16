import { useState, useEffect, useCallback, useRef } from "react";
import { saveLifetimeStats, loadLifetimeStats } from "../lib/storage";

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;

// --- Piece Shapes ---
export const PIECES = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [1, 1, 1],
    [0, 1, 0],
  ],
  L: [
    [1, 1, 1],
    [1, 0, 0],
  ],
  J: [
    [1, 1, 1],
    [0, 0, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
};

// --- Piece Colors (Fixed to standard 6-digit hex) ---
export const COLORS = {
  I: "#00FFFF", // Cyan
  O: "#FFFF00", // Yellow
  T: "#AA00FF", // Purple
  L: "#FF8C00", // Orange
  J: "#0000FF", // Blue
  S: "#00FF00", // Green
  Z: "#FF0000", // Red
};

export type PieceName = keyof typeof PIECES;

export interface Piece {
  shape: number[][];
  color: string;
  name: PieceName;
}

export interface Position {
  x: number;
  y: number;
  rotation: number; // 0, 1, 2, 3 (0 = spawn)
}

// --- SRS Wall Kick Data (Typescript fix applied here) ---
// Define commonKicks as an array of tuples [number, number]
const commonKicks: [number, number][] = [
  [0, 0],
  [-1, 0],
  [-1, 1],
  [0, -2],
  [-1, -2],
];

// Anti-Clockwise Kicks for J, L, S, T, Z pieces
const commonKicksAnti: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, -2],
  [1, -2],
];

const WALL_KICKS: Record<PieceName, Record<string, [number, number][]>> = {
  I: {
    // I-piece kicks must be explicitly typed as array of two-number tuples
    "0>1": [[0,0], [-2,0], [1,0], [-2,-1], [1,2]] as [number, number][],
    "1>0": [[0,0], [2,0], [-1,0], [2,1], [-1,-2]] as [number, number][],
    "1>2": [[0,0], [-1,0], [2,0], [-1,2], [2,-1]] as [number, number][],
    "2>1": [[0,0], [1,0], [-2,0], [1,-2], [-2,1]] as [number, number][],
    "2>3": [[0,0], [2,0], [-1,0], [2,1], [-1,-2]] as [number, number][],
    "3>2": [[0,0], [-2,0], [1,0], [-2,-1], [1,2]] as [number, number][],
    "3>0": [[0,0], [1,0], [-2,0], [1,-2], [-2,1]] as [number, number][],
    "0>3": [[0,0], [-1,0], [2,0], [-1,2], [2,-1]] as [number, number][],
  },
  J: {
    "0>1": commonKicks, "1>2": commonKicks, "2>3": commonKicks, "3>0": commonKicks,
    "1>0": commonKicksAnti, "2>1": commonKicksAnti, "3>2": commonKicksAnti, "0>3": commonKicksAnti,
  },
  L: {
    "0>1": commonKicks, "1>2": commonKicks, "2>3": commonKicks, "3>0": commonKicks,
    "1>0": commonKicksAnti, "2>1": commonKicksAnti, "3>2": commonKicksAnti, "0>3": commonKicksAnti,
  },
  S: {
    "0>1": commonKicks, "1>2": commonKicks, "2>3": commonKicks, "3>0": commonKicks,
    "1>0": commonKicksAnti, "2>1": commonKicksAnti, "3>2": commonKicksAnti, "0>3": commonKicksAnti,
  },
  T: {
    "0>1": commonKicks, "1>2": commonKicks, "2>3": commonKicks, "3>0": commonKicks,
    "1>0": commonKicksAnti, "2>1": commonKicksAnti, "3>2": commonKicksAnti, "0>3": commonKicksAnti,
  },
  Z: {
    "0>1": commonKicks, "1>2": commonKicks, "2>3": commonKicks, "3>0": commonKicks,
    "1>0": commonKicksAnti, "2>1": commonKicksAnti, "3>2": commonKicksAnti, "0>3": commonKicksAnti,
  },
  O: {} // O-piece doesn't rotate with kicks
};

// Helper function to rotate a matrix (piece shape)
const rotateMatrix = (matrix: number[][], dir: 1 | -1) => {
  const numCols = matrix[0].length;
  let newMatrix: number[][] = [];

  if (dir === 1) { // Clockwise
    newMatrix = matrix[0].map((_, i) =>
      matrix.map(row => row[i]).reverse()
    );
  } else { // Anti-Clockwise
    newMatrix = matrix[0].map((_, i) =>
      matrix.map(row => row[numCols - 1 - i])
    ).reverse();
  }
  return newMatrix;
};

const useGameLogic = () => {
  const pieceBag = useRef<PieceName[]>([]);

  const getNextPiece = (): Piece => {
    if (pieceBag.current.length === 0) {
      const pieces = Object.keys(PIECES) as PieceName[];
      // Shuffle the pieces
      for (let i = pieces.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
      }
      pieceBag.current = pieces;
    }
    const name = pieceBag.current.pop()!;
    return { shape: PIECES[name], color: COLORS[name], name };
  };

  const [board, setBoard] = useState<(string | null)[][]>(createEmptyBoard());
  const [currentPiece, setCurrentPiece] = useState<Piece>(() => getNextPiece());
  const [pos, setPos] = useState<Position>({ x: 3, y: 0, rotation: 0 });
  const [nextPiece, setNextPiece] = useState<Piece>(() => getNextPiece());
  const [holdPiece, setHoldPiece] = useState<Piece | null>(null);
  const [holdUsed, setHoldUsed] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [linesCleared, setLinesCleared] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [dropSpeed, setDropSpeed] = useState(1000);
  const [flashLines, setFlashLines] = useState<number[]>([]);
  const softDropRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  function createEmptyBoard(): (string | null)[][] {
    return Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(null));
  }

  const mergePiece = useCallback(
    (shape: number[][], px: number, py: number, color: string, baseBoard?: (string | null)[][]) => {
      const newBoard = (baseBoard ?? board).map((row) => [...row]);
      shape.forEach((row, dy) =>
        row.forEach((cell, dx) => {
          if (cell) {
            const ny = py + dy;
            const nx = px + dx;
            if (ny >= 0 && ny < BOARD_HEIGHT && nx >= 0 && nx < BOARD_WIDTH) {
                newBoard[ny][nx] = color;
            }
          }
        })
      );
      return newBoard;
    },
    [board]
  );

  const collision = useCallback(
    (shape: number[][], px: number, py: number) => {
      return shape.some((row, dy) =>
        row.some((cell, dx) => {
          if (!cell) return false;
          const nx = px + dx;
          const ny = py + dy;
          
          // Check bounds
          if (nx < 0 || nx >= BOARD_WIDTH || ny >= BOARD_HEIGHT) return true;
          
          // Check collision with non-null cells in board, avoiding checking cells above board (ny < 0)
          if (ny >= 0 && board[ny][nx] !== null) return true;
          
          return false;
        })
      );
    },
    [board]
  );

  const clearLines = useCallback(
    (b: (string | null)[][]) => {
      const newBoard: (string | null)[][] = [];
      const clearedRows: number[] = [];

      b.forEach((row, idx) => {
        if (row.every((cell) => cell !== null)) {
          clearedRows.push(idx);
        } else {
          newBoard.push(row);
        }
      });

      if (clearedRows.length > 0) {
        setFlashLines(clearedRows);
        setScore((prev) => prev + clearedRows.length * 100);
        setLinesCleared((prev) => {
          const newLinesCleared = prev + clearedRows.length;
          if (Math.floor(newLinesCleared / 10) > Math.floor(prev / 10)) {
            setDropSpeed((prevSpeed) => Math.max(100, prevSpeed - 100));
          }
          return newLinesCleared;
        });

        setTimeout(() => {
          // Re-create the empty rows at the top
          setBoard(Array.from({ length: clearedRows.length }, () => Array(BOARD_WIDTH).fill(null)).concat(newBoard));
          setFlashLines([]);
        }, 150);
      } else {
        setBoard(b);
      }
    },
    []
  );

  const tick = useCallback(() => {
    if (collision(currentPiece.shape, pos.x, pos.y + 1)) {
      const newBoard = mergePiece(currentPiece.shape, pos.x, pos.y, currentPiece.color);
      clearLines(newBoard);
      setHoldUsed(false);

      if (collision(nextPiece.shape, 3, 0)) {
        setGameOver(true);
        return;
      }

      setCurrentPiece(nextPiece);
      setPos({ x: 3, y: 0, rotation: 0 });
      setNextPiece(getNextPiece());
    } else {
      setPos((prev) => ({ ...prev, y: prev.y + 1 }));
    }
  }, [collision, currentPiece, mergePiece, pos, nextPiece, clearLines]);

  const move = (dx: number) => {
    if (!gameOver && !collision(currentPiece.shape, pos.x + dx, pos.y)) setPos((prev) => ({ ...prev, x: prev.x + dx }));
  };

  // --- Rotate with SRS ---
  const rotate = (dir: 1 | -1 = 1) => {
    if (gameOver) return;
    if (currentPiece.name === 'O') return; 

    const rotatedShape = rotateMatrix(currentPiece.shape, dir);
    const from = pos.rotation;
    const to = (from + dir + 4) % 4;
    const key = `${from}>${to}`;
    
    const kicks = WALL_KICKS[currentPiece.name]?.[key] ?? [[0,0]]; 

    for (const [kx, ky] of kicks) {
      const nx = pos.x + kx;
      const ny = pos.y - ky; // Tetris standard: positive y is down, so wall kicks subtract y
      
      if (!collision(rotatedShape, nx, ny)) {
        setCurrentPiece({ ...currentPiece, shape: rotatedShape });
        setPos({ x: nx, y: ny, rotation: to });
        return;
      }
    }
  };

  const hold = () => {
    if (gameOver || holdUsed) return;

    if (!holdPiece) {
      setHoldPiece({ ...currentPiece, shape: PIECES[currentPiece.name] }); // Store the original shape
      setCurrentPiece(nextPiece);
      setNextPiece(getNextPiece());
    } else {
      const temp = { ...currentPiece, shape: PIECES[currentPiece.name] }; 
      setCurrentPiece(holdPiece);
      setHoldPiece(temp);
    }
    setPos({ x: 3, y: 0, rotation: 0 });
    setHoldUsed(true);
  };

  const restart = () => {
    pieceBag.current = [];
    setBoard(createEmptyBoard());
    setCurrentPiece(getNextPiece());
    setNextPiece(getNextPiece());
    setHoldPiece(null);
    setPos({ x: 3, y: 0, rotation: 0 });
    setScore(0);
    setLinesCleared(0);
    setTimeElapsed(0);
    setDropSpeed(1000);
    setGameOver(false);
    setHoldUsed(false);
    setFlashLines([]);
  };

  const ghostY = () => {
    let y = pos.y;
    while (!collision(currentPiece.shape, pos.x, y + 1)) y++;
    return y;
  };

  useEffect(() => {
    const handleGameOver = async () => {
      if (gameOver) {
        if (timerRef.current) clearInterval(timerRef.current);
        const currentStats = await loadLifetimeStats() ?? { highScore: 0, totalLinesCleared: 0, totalGamesPlayed: 0, totalTime: 0 };
        const newStats = {
          highScore: Math.max(currentStats.highScore, score),
          totalLinesCleared: currentStats.totalLinesCleared + linesCleared,
          totalGamesPlayed: currentStats.totalGamesPlayed + 1,
          totalTime: currentStats.totalTime + timeElapsed,
        };
        await saveLifetimeStats(newStats);
      }
    };
    handleGameOver();
  }, [gameOver]);

  useEffect(() => {
    if (gameOver) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    if (!timerRef.current) {
      timerRef.current = setInterval(() => {
        setTimeElapsed((prev) => prev + 1);
      }, 1000);
    }

    const gameLoop = () => {
      tick();
      const intervalDuration = softDropRef.current ? 50 : dropSpeed;
      intervalRef.current = setTimeout(gameLoop, intervalDuration);
    };

    if (intervalRef.current) {
        clearTimeout(intervalRef.current);
    }
    
    intervalRef.current = setTimeout(gameLoop, dropSpeed);

    return () => {
      if (intervalRef.current) clearTimeout(intervalRef.current);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [tick, gameOver, softDropRef.current, dropSpeed]);

  const hardDrop = () => {
    if (gameOver) return;
    const dropY = ghostY();
    const newBoard = mergePiece(currentPiece.shape, pos.x, dropY, currentPiece.color);
    clearLines(newBoard);
    setHoldUsed(false);

    if (collision(nextPiece.shape, 3, 0)) {
      setGameOver(true);
      return;
    }

    setCurrentPiece(nextPiece);
    setNextPiece(getNextPiece());
    setPos({ x: 3, y: 0, rotation: 0 });
  };

  return {
    board,
    currentPiece,
    pos,
    nextPiece,
    holdPiece,
    gameOver,
    score,
    linesCleared,
    timeElapsed,
    flashLines,
    softDropRef,
    move,
    rotate,
    hold,
    restart,
    hardDrop,
    ghostY
  };
};

export default useGameLogic;
