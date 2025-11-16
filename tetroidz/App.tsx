import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Platform } from "react-native";

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 18;

// --- Piece Shapes ---
const PIECES = {
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
const COLORS = {
  I: "#00FFFF", // Cyan
  O: "#FFFF00", // Yellow
  T: "#AA00FF", // Purple
  L: "#FF8C00", // Orange
  J: "#0000FF", // Blue
  S: "#00FF00", // Green
  Z: "#FF0000", // Red
};

type PieceName = keyof typeof PIECES;

interface Piece {
  shape: number[][];
  color: string;
  name: PieceName;
}

interface Position {
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

export default function Tetris() {
  const [board, setBoard] = useState<(string | null)[][]>(createEmptyBoard());
  const [currentPiece, setCurrentPiece] = useState<Piece>({...randomPiece()});
  const [pos, setPos] = useState<Position>({ x: 3, y: 0, rotation: 0 });
  const [nextPiece, setNextPiece] = useState<Piece>(randomPiece());
  const [holdPiece, setHoldPiece] = useState<Piece | null>(null);
  const [holdUsed, setHoldUsed] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [flashLines, setFlashLines] = useState<number[]>([]);
  const softDropRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  function createEmptyBoard(): (string | null)[][] {
    return Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(null));
  }

  function randomPiece(): Piece {
    const keys = Object.keys(PIECES) as PieceName[];
    const name = keys[Math.floor(Math.random() * keys.length)];
    return { shape: PIECES[name], color: COLORS[name], name };
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
      setNextPiece(randomPiece());
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
      setNextPiece(randomPiece());
    } else {
      const temp = { ...currentPiece, shape: PIECES[currentPiece.name] }; 
      setCurrentPiece(holdPiece);
      setHoldPiece(temp);
    }
    setPos({ x: 3, y: 0, rotation: 0 });
    setHoldUsed(true);
  };

  const restart = () => {
    setBoard(createEmptyBoard());
    setCurrentPiece(randomPiece());
    setNextPiece(randomPiece());
    setHoldPiece(null);
    setPos({ x: 3, y: 0, rotation: 0 });
    setScore(0);
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
    if (gameOver) return;

    const gameLoop = () => {
      tick();
      // Calculate next interval duration based on softDropRef
      const intervalDuration = softDropRef.current ? 50 : 500;
      intervalRef.current = setTimeout(gameLoop, intervalDuration);
    };

    if (intervalRef.current) {
        clearTimeout(intervalRef.current);
    }
    
    // Start the loop
    intervalRef.current = setTimeout(gameLoop, 500);

    return () => {
      if (intervalRef.current) clearTimeout(intervalRef.current);
    };
  }, [tick, gameOver, softDropRef.current]);

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
    setNextPiece(randomPiece());
    setPos({ x: 3, y: 0, rotation: 0 });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.score}>Score: {score}</Text>

      <View style={styles.sidePanels}>
        <View style={styles.preview}>
          <Text style={styles.previewText}>Hold</Text>
          <View style={styles.previewBox}>
            {holdPiece ? (
              // Use original shape for display
              (PIECES[holdPiece.name]).map((row, y) => (
                <View key={y} style={{ flexDirection: "row" }}>
                  {row.map((cell, x) => (
                    <View
                      key={x}
                      style={[
                        styles.cell,
                        styles.smallCell,
                        cell ? { backgroundColor: holdPiece.color } : undefined,
                      ]}
                    />
                  ))}
                </View>
              ))
            ) : (
              <Text style={styles.previewText}>---</Text>
            )}
          </View>
        </View>

        <View style={styles.preview}>
          <Text style={styles.previewText}>Next</Text>
          <View style={styles.previewBox}>
            {nextPiece.shape.map((row, y) => (
              <View key={y} style={{ flexDirection: "row" }}>
                {row.map((cell, x) => (
                  <View
                    key={x}
                    style={[
                      styles.cell,
                      styles.smallCell,
                      cell ? { backgroundColor: nextPiece.color } : undefined,
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.board}>
        {board.map((row, y) => (
          <View key={y} style={styles.row}>
            {row.map((cell, x) => {
              let color = cell;
              let borderColor = "#333";

              // Ghost piece (rendered first to be underneath current piece)
              const ghostDropY = ghostY();
              currentPiece.shape.forEach((r, dy) =>
                r.forEach((v, dx) => {
                  if (v && x === pos.x + dx && y === ghostDropY + dy) {
                    if (!color) {
                      color = currentPiece.color + "55"; // Semi-transparent
                    }
                  }
                })
              );

              // Current piece (rendered on top)
              currentPiece.shape.forEach((r, dy) =>
                r.forEach((v, dx) => {
                  if (v && x === pos.x + dx && y === pos.y + dy) {
                    color = currentPiece.color;
                    borderColor = "#fff";
                  }
                })
              );

              // Flash lines
              if (flashLines.includes(y)) {
                color = "#fff";
                borderColor = "#fff";
              }

              return <View key={x} style={[styles.cell, { borderColor }, color ? { backgroundColor: color } : undefined]} />;
            })}
          </View>
        ))}
      </View>

      {gameOver ? (
        <>
          <Text style={styles.gameOver}>GAME OVER</Text>
          <TouchableOpacity onPress={restart} style={[styles.btn, { marginTop: 16 }]}>
            <Text style={styles.btnText}>Restart</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.controlsWrapper}>
          <View style={styles.leftControls}>
            <TouchableOpacity onPress={() => rotate(-1)} style={styles.btn}>
              <Text style={styles.btnText}>CCW</Text>
              <Text style={styles.btnSubText}>⟲</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => rotate(1)} style={styles.btn}>
              <Text style={styles.btnText}>CW</Text>
              <Text style={styles.btnSubText}>⟳</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.middleControls}>
            <TouchableOpacity onPress={hold} style={styles.btn}>
              <Text style={styles.btnText}>Hold</Text>
            </TouchableOpacity>
            <View style={styles.directionalControls}>
              <TouchableOpacity onPress={() => move(-1)} style={styles.btn}>
                <Text style={styles.btnText}>←</Text>
              </TouchableOpacity>

              <Pressable
                // Hard Drop on simple press
                onPress={() => hardDrop()}
                // Soft Drop on long press or press in/out for continuous movement
                onPressIn={() => (softDropRef.current = true)}
                onPressOut={() => (softDropRef.current = false)}
                style={styles.btn}
              >
                <Text style={styles.btnText}>↓</Text>
              </Pressable>

              <TouchableOpacity onPress={() => move(1)} style={styles.btn}>
                <Text style={styles.btnText}>→</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={hardDrop} style={styles.btn}>
              <Text style={styles.btnText}>Hard Drop</Text>
            </TouchableOpacity>
          </View>
          
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111", justifyContent: "center", alignItems: "center", paddingTop: 80 },
  board: { backgroundColor: "#111", padding: 2, borderWidth: 4, borderColor: "#555" },
  row: { flexDirection: "row" },
  cell: { width: 24, height: 24, backgroundColor: "#222", borderWidth: 1, borderColor: "#333" },
  smallCell: { width: 16, height: 16, margin: 1 },
  controlsWrapper: { marginTop: 24, flexDirection: "row", justifyContent: "space-around", width: "90%", flexWrap: 'wrap', maxWidth: 600 },
  leftControls: { flexDirection: "column", gap: 8, alignItems: "center", minWidth: 100 },
  middleControls: { flexDirection: "column", gap: 12, alignItems: "center", marginTop: 0, flex: 1, marginHorizontal: 10, maxWidth: 300 },
  directionalControls: { flexDirection: "row", gap: 12, alignItems: "center", justifyContent: 'center' },
  btn: { padding: 10, borderWidth: 2, borderColor: "#555", backgroundColor: "#222", minWidth: 60, alignItems: "center", justifyContent: 'center', borderRadius: 4 },
  btnText: { color: "#c0c0c0", fontSize: 16, textAlign: "center", fontWeight: 'bold' },
  btnSubText: { color: "#c0c0c0", fontSize: 12, textAlign: "center" },
  gameOver: { color: "#ff5555", fontSize: 24, fontWeight: 'bold', marginTop: 16 },
  score: { color: "#fff", fontSize: 18, marginBottom: 16, fontWeight: 'bold', position: 'absolute', top: 40, right: 20 },
  sidePanels: { position: "absolute", top: 40, flexDirection: "row", justifyContent: "space-between", width: "90%", paddingHorizontal: 20 },
  preview: { alignItems: "center" },
  previewBox: { borderWidth: 1, borderColor: '#444', padding: 4, backgroundColor: '#333' },
  previewText: { color: "#fff", fontSize: 14, marginBottom: 4, fontWeight: 'bold' },
});