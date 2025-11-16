import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from "react-native";

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 18;

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

const COLORS = {
  I: "#55ffff",
  O: "#ffd900ff",
  T: "#ff55ff",
  L: "#ffaa55",
  J: "#5555ff",
  S: "#55ff55",
  Z: "#ff5555",
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
}

export default function Tetris() {
  const [board, setBoard] = useState<(string | null)[][]>(createEmptyBoard());
  const [currentPiece, setCurrentPiece] = useState<Piece>(randomPiece());
  const [pos, setPos] = useState<Position>({ x: 3, y: 0 });
  const [nextPiece, setNextPiece] = useState<Piece>(randomPiece());
  const [holdPiece, setHoldPiece] = useState<Piece | null>(null);
  const [holdUsed, setHoldUsed] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [flashLines, setFlashLines] = useState<number[]>([]);
  const softDropRef = useRef(false);

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
          if (cell && py + dy >= 0) newBoard[py + dy][px + dx] = color;
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
          if (nx < 0 || nx >= BOARD_WIDTH || ny >= BOARD_HEIGHT) return true;
          return board[ny][nx] !== null;
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
      setPos({ x: 3, y: 0 });
      setNextPiece(randomPiece());
    } else {
      setPos((prev) => ({ ...prev, y: prev.y + 1 }));
    }
  }, [collision, currentPiece, mergePiece, pos, nextPiece, clearLines]);

  const move = (dx: number) => {
    if (!collision(currentPiece.shape, pos.x + dx, pos.y)) setPos((prev) => ({ ...prev, x: prev.x + dx }));
  };

  const rotate = () => {
    const rotated = currentPiece.shape[0].map((_, i) => currentPiece.shape.map((row) => row[i]).reverse());
    if (!collision(rotated, pos.x, pos.y)) setCurrentPiece({ ...currentPiece, shape: rotated });
  };

  const hold = () => {
    if (holdUsed) return;
    if (!holdPiece) {
      setHoldPiece(currentPiece);
      setCurrentPiece(nextPiece);
      setNextPiece(randomPiece());
    } else {
      const temp = currentPiece;
      setCurrentPiece(holdPiece);
      setHoldPiece(temp);
    }
    setPos({ x: 3, y: 0 });
    setHoldUsed(true);
  };

  const restart = () => {
    setBoard(createEmptyBoard());
    setCurrentPiece(randomPiece());
    setNextPiece(randomPiece());
    setHoldPiece(null);
    setPos({ x: 3, y: 0 });
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

const intervalRef = useRef<number | null>(null);

useEffect(() => {
  if (gameOver) return;
  if (intervalRef.current) clearInterval(intervalRef.current);

  intervalRef.current = setInterval(() => {
    tick();
    if (softDropRef.current) tick();
  }, 500);

  return () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  };
}, [tick, gameOver]);

const hardDrop = () => {
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
  setPos({ x: 3, y: 0 });
};

  return (
    <View style={styles.container}>
      <View style={styles.sidePanels}>
        <View style={styles.preview}>
          <Text style={styles.previewText}>Next</Text>
          {nextPiece.shape.map((row, y) => (
            <View key={y} style={{ flexDirection: "row" }}>
              {row.map((cell, x) => (
                <View key={x} style={[styles.cell, { width: 16, height: 16, margin: 1 }, cell ? { backgroundColor: nextPiece.color } : undefined]} />
              ))}
            </View>
          ))}
        </View>

        {holdPiece && (
          <View style={styles.preview}>
            <Text style={styles.previewText}>Hold</Text>
            {holdPiece.shape.map((row, y) => (
              <View key={y} style={{ flexDirection: "row" }}>
                {row.map((cell, x) => (
                  <View key={x} style={[styles.cell, { width: 16, height: 16, margin: 1 }, cell ? { backgroundColor: holdPiece.color } : undefined]} />
                ))}
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.board}>
        {board.map((row, y) => (
          <View key={y} style={styles.row}>
            {row.map((cell, x) => {
              let color = cell;
              let borderColor = "#555";

              // Ghost piece
              currentPiece.shape.forEach((r, dy) =>
                r.forEach((v, dx) => {
                  if (v && x === pos.x + dx && y === ghostY() + dy) {
                    if (!color) color = currentPiece.color + "55";
                  }
                })
              );

              // Current piece
              currentPiece.shape.forEach((r, dy) =>
                r.forEach((v, dx) => {
                  if (v && x === pos.x + dx && y === pos.y + dy) {
                    color = currentPiece.color;
                    borderColor = "#fff";
                  }
                })
              );

              // Flash lines
              if (flashLines.includes(y)) color = "#fff";

              return <View key={x} style={[styles.cell, { borderColor }, color ? { backgroundColor: color } : undefined]} />;
            })}
          </View>
        ))}
      </View>

      <Text style={styles.score}>Score: {score}</Text>

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
            <TouchableOpacity onPress={rotate} style={styles.btn}>
              <Text style={styles.btnText}>↑</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={hold} style={styles.btn}>
              <Text style={styles.btnText}>⇅</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.rightControls}>
            <TouchableOpacity onPress={() => move(-1)} style={styles.btn}>
              <Text style={styles.btnText}>←</Text>
            </TouchableOpacity>

            <Pressable
  onPress={() => hardDrop()}
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
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111", justifyContent: "center", alignItems: "center" },
  board: { backgroundColor: "#111", padding: 4, borderWidth: 4, borderColor: "#555" },
  row: { flexDirection: "row" },
  cell: { width: 24, height: 24, backgroundColor: "#222", borderWidth: 2, borderColor: "#555" },
  controlsWrapper: { marginTop: 16, flexDirection: "row", justifyContent: "space-between", width: "60%" },
  leftControls: { flexDirection: "column", gap: 12, alignItems: "center" },
  rightControls: { flexDirection: "row", gap: 12, alignItems: "center" },
  btn: { padding: 12, borderWidth: 2, borderColor: "#555", backgroundColor: "#222", minWidth: 48, alignItems: "center" },
  btnText: { color: "#c0c0c0", fontSize: 20, fontFamily: "PressStart2P", textAlign: "center" },
  gameOver: { color: "#ff5555", fontFamily: "PressStart2P", fontSize: 24 },
  score: { color: "#fff", fontFamily: "PressStart2P", fontSize: 12, marginTop: 8 },
  sidePanels: { position: "absolute", top: 40, flexDirection: "row", justifyContent: "space-between", width: "90%" },
  preview: { alignItems: "center" },
  previewText: { color: "#fff", fontFamily: "PressStart2P", fontSize: 12, marginBottom: 4 },
});
