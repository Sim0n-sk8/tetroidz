import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Font from "expo-font";

/* =========== Types =========== */
type Cell = string | null; // color or null
type Board = Cell[][];
type Shape = number[][];
type PieceName = "I" | "O" | "T" | "L" | "J" | "S" | "Z";

type Piece = {
  name: PieceName;
  shape: Shape;
  color: string;
};

/* =========== Constants =========== */
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 18;
const CELL_SIZE = 24; // px
const BASE_TICK_MS = 700; // starting fall speed
const MIN_TICK_MS = 80;
const LEVEL_UP_LINES = 10; // lines needed per level to speed up
const BEST_SCORE_KEY = "@tetris_best_score";

/* Tetromino shapes (matrix of 0/1) */
const PIECES: Record<PieceName, Shape> = {
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

const COLORS: Record<PieceName, string> = {
  I: "#55ffff",
  O: "#ffea00",
  T: "#ff55ff",
  L: "#ffaa55",
  J: "#5555ff",
  S: "#55ff55",
  Z: "#ff5555",
};

/* Random bag generator (like modern Tetris) */
function createBag(): PieceName[] {
  const names: PieceName[] = ["I", "O", "T", "L", "J", "S", "Z"];
  // Fisher-Yates shuffle
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  return names;
}

/* =========== Helpers =========== */
function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, () => null)
  );
}

function makePiece(name: PieceName): Piece {
  return { name, shape: PIECES[name], color: COLORS[name] };
}

function rotateShape(shape: Shape): Shape {
  // rotate clockwise: transpose + reverse rows
  const w = shape[0].length;
  const h = shape.length;
  const rotated: Shape = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      rotated[x][h - 1 - y] = shape[y][x];
    }
  }
  return rotated;
}

/* check collision: shape placed at (px,py) */
function collides(board: Board, shape: Shape, px: number, py: number): boolean {
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (!shape[y][x]) continue;
      const nx = px + x;
      const ny = py + y;
      if (nx < 0 || nx >= BOARD_WIDTH || ny >= BOARD_HEIGHT) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

/* Merge piece into board (returns new board) */
function mergeToBoard(board: Board, shape: Shape, px: number, py: number, color: string): Board {
  const newBoard = board.map((r) => [...r]);
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (!shape[y][x]) continue;
      const nx = px + x;
      const ny = py + y;
      if (ny >= 0 && ny < BOARD_HEIGHT && nx >= 0 && nx < BOARD_WIDTH) {
        newBoard[ny][nx] = color;
      }
    }
  }
  return newBoard;
}

/* Clear full lines and return newBoard + linesCleared */
function clearLines(board: Board): { board: Board; lines: number } {
  const remaining = board.filter((row) => row.some((cell) => !cell));
  const linesCleared = BOARD_HEIGHT - remaining.length;
  const newRows: Board = Array.from({ length: linesCleared }, () =>
    Array.from({ length: BOARD_WIDTH }, () => null)
  );
  return { board: newRows.concat(remaining) as Board, lines: linesCleared };
}

/* =========== App =========== */

export default function App(): JSX.Element {
  // load font
  const [fontsLoaded, setFontsLoaded] = useState(false);
  useEffect(() => {
    (async () => {
      await Font.loadAsync({
        PressStart2P: require("./assets/fonts/PressStart2P.ttf"),
      });
      setFontsLoaded(true);
    })();
  }, []);

  if (!fontsLoaded) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  /* Screens: home / playing */
  const [screen, setScreen] = useState<"home" | "play">("home");

  return (
    <SafeAreaView style={styles.safe}>
      {screen === "home" ? (
        <HomeScreen onStart={() => setScreen("play")} />
      ) : (
        <GameScreen onExit={() => setScreen("home")} />
      )}
    </SafeAreaView>
  );
}

/* =========== Home Screen =========== */
function HomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>TETRIS</Text>
      <Text style={styles.subtitle}>8-bit sci-fi • offline</Text>
      <TouchableOpacity style={[styles.bigBtn, styles.selectedBtn]} onPress={onStart}>
        <Text style={styles.bigBtnText}>START</Text>
      </TouchableOpacity>
      <Text style={styles.small}>Swipe controls • Hold • Next preview</Text>
    </View>
  );
}

/* =========== Core Game Screen =========== */

function GameScreen({ onExit }: { onExit: () => void }) {
  // board and pieces
  const [board, setBoard] = useState<Board>(() => createEmptyBoard());
  const [bag, setBag] = useState<PieceName[]>(() => createBag().concat(createBag())); // double bag buffer
  const [current, setCurrent] = useState<Piece>(() => makePiece(bag[0] as PieceName));
  const [nextQueue, setNextQueue] = useState<PieceName[]>(() => bag.slice(1));
  const [hold, setHold] = useState<PieceName | null>(null);
  const holdLockedRef = useRef(false); // can't hold again until placed
  const [pos, setPos] = useState({ x: 3, y: -1 }); // piece position (y can be negative initially)
  const [isPaused, setPaused] = useState(false);

  // scoring and levels
  const [score, setScore] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [level, setLevel] = useState(0);
  const [linesClearedTotal, setLinesClearedTotal] = useState(0);

  // game state
  const [gameOver, setGameOver] = useState(false);

  // tick timing
  const tickRef = useRef<number>(BASE_TICK_MS);
  const tickTimer = useRef<NodeJS.Timeout | null>(null);

  // soft-drop state when swiping down
  const softDropRef = useRef(false);

  // initialize best score
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(BEST_SCORE_KEY);
      if (raw) setBest(parseInt(raw, 10));
    })();
  }, []);

  // refill bag if low
  const ensureBag = useCallback(() => {
    if (nextQueue.length < 7) {
      const newBag = createBag();
      setNextQueue((q) => q.concat(newBag));
      setBag((b) => b.concat(newBag));
    }
  }, [nextQueue.length]);

  // spawn new piece from nextQueue
  const spawnNext = useCallback(
    (fromQueue = true) => {
      ensureBag();
      const nextName = nextQueue[0] ?? bag[0];
      if (!nextName) return; // shouldn't happen
      const piece = makePiece(nextName as PieceName);
      setCurrent(piece);
      setPos({ x: Math.floor((BOARD_WIDTH - piece.shape[0].length) / 2), y: -piece.shape.length });
      // advance queue
      setNextQueue((q) => q.slice(1));
      holdLockedRef.current = false;
    },
    [bag, ensureBag, nextQueue]
  );

  // start/reset game
  const startGame = useCallback(() => {
    setBoard(createEmptyBoard());
    const newBag = createBag().concat(createBag());
    setBag(newBag);
    setNextQueue(newBag.slice(1));
    setCurrent(makePiece(newBag[0]));
    setPos({ x: 3, y: -1 });
    setHold(null);
    holdLockedRef.current = false;
    setScore(0);
    setLevel(0);
    setLinesClearedTotal(0);
    tickRef.current = BASE_TICK_MS;
    setGameOver(false);
    setPaused(false);
  }, []);

  useEffect(() => {
    startGame();
    // cleanup on unmount
    return () => {
      if (tickTimer.current) clearInterval(tickTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // save best score
  useEffect(() => {
    if (best === null) return;
    (async () => {
      await AsyncStorage.setItem(BEST_SCORE_KEY, String(best));
    })();
  }, [best]);

  /* =========== Game Tick =========== */
  const hardDropAndLock = useCallback(() => {
    // move down until collision and lock
    let { x, y } = pos;
    while (!collides(board, current.shape, x, y + 1)) {
      y++;
    }
    const merged = mergeToBoard(board, current.shape, x, y, current.color);
    const cleared = clearLines(merged);
    if (cleared.lines > 0) {
      const points = computePoints(cleared.lines, level);
      setScore((s) => s + points);
      setLinesClearedTotal((l) => l + cleared.lines);
      adjustLevelAndSpeed(level, cleared.lines);
    }
    setBoard(cleared.board);
    // spawn
    const incoming = nextQueue[0];
    if (!incoming) {
      // refill quickly
      const newBag = createBag();
      setNextQueue(newBag);
      setCurrent(makePiece(newBag[0]));
      setPos({ x: 3, y: -1 });
      return;
    }
    setCurrent(makePiece(incoming as PieceName));
    setNextQueue((q) => q.slice(1));
    setPos({ x: 3, y: -1 });
    holdLockedRef.current = false;
    // check game over
    if (collides(board, makePiece(incoming as PieceName).shape, 3, -1)) {
      setGameOver(true);
      if (score > (best ?? 0)) setBest(score);
    }
  }, [board, current, level, nextQueue, pos, score, best]);

  const tick = useCallback(() => {
    if (isPaused || gameOver) return;
    // soft drop increases speed
    if (!collides(board, current.shape, pos.x, pos.y + 1)) {
      setPos((p) => ({ ...p, y: p.y + 1 }));
    } else {
      // lock piece
      const merged = mergeToBoard(board, current.shape, pos.x, pos.y, current.color);
      const cleared = clearLines(merged);
      if (cleared.lines > 0) {
        const points = computePoints(cleared.lines, level);
        setScore((s) => s + points);
        setLinesClearedTotal((l) => l + cleared.lines);
        adjustLevelAndSpeed(level, cleared.lines);
      }
      setBoard(cleared.board);
      // spawn next
      if (nextQueue.length === 0) {
        const newBag = createBag();
        setNextQueue(newBag);
      }
      const incoming = nextQueue[0] ?? bag[0];
      const incomingPiece = makePiece(incoming as PieceName);
      setCurrent(incomingPiece);
      setNextQueue((q) => q.slice(1));
      setPos({ x: Math.floor((BOARD_WIDTH - incomingPiece.shape[0].length) / 2), y: -incomingPiece.shape.length });
      holdLockedRef.current = false;
      // check immediate collision -> game over
      if (collides(cleared.board, incomingPiece.shape, Math.floor((BOARD_WIDTH - incomingPiece.shape[0].length) / 2), -incomingPiece.shape.length)) {
        setGameOver(true);
        if (score > (best ?? 0)) setBest(score);
      }
    }
  }, [board, current, pos, nextQueue, gameOver, isPaused, level, bag, score, best]);

  // compute tick ms based on level and base
  const computeTickMs = useCallback(() => {
    // exponential-ish speedup
    const fastest = MIN_TICK_MS;
    const range = BASE_TICK_MS - fastest;
    const factor = Math.min(1, level / 15); // by 15 levels near top speed
    const ms = Math.max(fastest, Math.round(BASE_TICK_MS - range * factor));
    return ms;
  }, [level]);

  // reset interval whenever tick interval or pause changes
  useEffect(() => {
    if (tickTimer.current) clearInterval(tickTimer.current);
    if (gameOver || isPaused) return;
    const ms = softDropRef.current ? Math.max(40, computeTickMs() / 6) : computeTickMs();
    tickTimer.current = setInterval(() => {
      tick();
    }, ms) as unknown as NodeJS.Timeout;
    return () => {
      if (tickTimer.current) clearInterval(tickTimer.current);
    };
  }, [tick, computeTickMs, isPaused, gameOver, score]);

  /* =========== Controls =========== */

  const tryMove = useCallback(
    (dx: number) => {
      if (!collides(board, current.shape, pos.x + dx, pos.y)) setPos((p) => ({ ...p, x: p.x + dx }));
    },
    [board, current.shape, pos.x, pos.y]
  );

  const tryRotate = useCallback(() => {
    const rotated = rotateShape(current.shape);
    // wall kick simple: try original x, left, right
    const tries = [0, -1, 1, -2, 2];
    for (const t of tries) {
      if (!collides(board, rotated, pos.x + t, pos.y)) {
        setCurrent((c) => ({ ...c, shape: rotated }));
        setPos((p) => ({ ...p, x: p.x + t }));
        return;
      }
    }
  }, [board, current.shape, pos.x, pos.y]);

  const handleHold = useCallback(() => {
    if (holdLockedRef.current) return;
    setHold((h) => {
      if (h === null) {
        // move current to hold, spawn next
        const curName = current.name;
        const incoming = nextQueue[0] ?? bag[0];
        setCurrent(makePiece(incoming as PieceName));
        setNextQueue((q) => q.slice(1));
        setPos({ x: 3, y: -1 });
        holdLockedRef.current = true;
        return curName;
      } else {
        // swap hold with current
        const prevHold = h;
        const newCurrent = makePiece(prevHold as PieceName);
        setCurrent(newCurrent);
        setPos({ x: 3, y: -1 });
        holdLockedRef.current = true;
        return current.name;
      }
    });
  }, [bag, current, nextQueue]);

  // pan responder for swipes
  const panRef = useRef<{ startX: number; startY: number } | null>(null);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent, gstate: PanResponderGestureState) => {
        panRef.current = { startX: gstate.x0, startY: gstate.y0 };
      },
      onPanResponderMove: (evt, gstate) => {
        const dx = gstate.moveX - (panRef.current?.startX ?? 0);
        const dy = gstate.moveY - (panRef.current?.startY ?? 0);
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        // horizontal swipe
        if (absX > 40 && absX > absY) {
          if (dx > 0) {
            tryMove(1);
          } else {
            tryMove(-1);
          }
          panRef.current = { startX: gstate.moveX, startY: gstate.moveY }; // reset to avoid repeated moves
        } else if (absY > 20 && absY > absX) {
          // vertical: downward accelerates drop while finger is moving down
          if (dy > 10) {
            // soft drop on hold
            softDropRef.current = true;
            if (tickTimer.current) {
              clearInterval(tickTimer.current);
              tickTimer.current = null;
            }
            // call tick once immediately to feel responsive
            tick();
          } else {
            softDropRef.current = false;
          }
        }
      },
      onPanResponderRelease: (evt, gstate) => {
        // if quick downward fling -> hard drop
        const vy = gstate.vy;
        const dy = gstate.moveY - (panRef.current?.startY ?? 0);
        softDropRef.current = false;
        if (dy > 80 && vy > 0.8) {
          // hard drop
          hardDropAndLock();
        }
        panRef.current = null;
      },
    })
  ).current;

  /* =========== Utility: compute points & level adjustments =========== */
  function computePoints(lines: number, curLevel: number): number {
    // Tetris scoring-ish: 40,100,300,1200 times (level+1)
    const base = [0, 40, 100, 300, 1200];
    return (base[lines] ?? 0) * (curLevel + 1);
  }

  function adjustLevelAndSpeed(curLevel: number, cleared: number) {
    const newTotal = linesClearedTotal + cleared;
    const newLevel = Math.floor(newTotal / LEVEL_UP_LINES);
    if (newLevel !== curLevel) {
      setLevel(newLevel);
    }
    // adjust tickRef if needed - tick interval recalculated automatically by computeTickMs
  }

  /* =========== UI / Render =========== */

  // create a displayed board that includes the active piece
  const displayedBoard = useRef<Board>(createEmptyBoard());
  displayedBoard.current = board.map((r) => [...r]);
  // overlay current piece
  for (let y = 0; y < current.shape.length; y++) {
    for (let x = 0; x < current.shape[y].length; x++) {
      if (!current.shape[y][x]) continue;
      const nx = pos.x + x;
      const ny = pos.y + y;
      if (ny >= 0 && ny < BOARD_HEIGHT && nx >= 0 && nx < BOARD_WIDTH) {
        displayedBoard.current[ny][nx] = current.color;
      }
    }
  }

  /* Mini preview pieces for nextQueue[0..4] and held piece */
  const previewPieces = nextQueue.slice(0, 5).map((n) => makePiece(n));

  /* Game over save best */
  useEffect(() => {
    if (gameOver) {
      if (score > (best ?? 0)) {
        setBest(score);
      }
    }
  }, [gameOver, score, best]);

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.leftCol}>
          <Text style={styles.titleSmall}>SCORE</Text>
          <Text style={styles.bigNumber}>{score}</Text>
          <Text style={styles.titleSmall}>BEST</Text>
          <Text style={styles.bigNumber}>{best ?? 0}</Text>
          <Text style={[styles.titleSmall, { marginTop: 8 }]}>LEVEL</Text>
          <Text style={styles.bigNumber}>{level}</Text>

          <TouchableOpacity
            style={[styles.smallBtn, { marginTop: 12 }]}
            onPress={() => {
              setPaused((p) => !p);
            }}
          >
            <Text style={styles.smallBtnText}>{isPaused ? "RESUME" : "PAUSE"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.smallBtn, { marginTop: 8 }]}
            onPress={() => {
              startGame();
            }}
          >
            <Text style={styles.smallBtnText}>RESTART</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.smallBtn, { marginTop: 8 }]}
            onPress={() => {
              if (score > (best ?? 0)) setBest(score);
              onExit();
            }}
          >
            <Text style={styles.smallBtnText}>HOME</Text>
          </TouchableOpacity>
        </View>

        {/* Board */}
        <View {...panResponder.panHandlers} style={styles.boardWrapper}>
          {displayedBoard.current.map((row, y) => (
            <View key={y} style={styles.row}>
              {row.map((cell, x) => (
                <View
                  key={x}
                  style={[
                    styles.cell,
                    cell && { backgroundColor: cell },
                    // subtle highlight for the active piece border
                    { borderColor: "#555", borderWidth: 2 },
                  ]}
                />
              ))}
            </View>
          ))}
        </View>

        {/* Right column: hold + preview */}
        <View style={styles.rightCol}>
          <Text style={styles.titleSmall}>HOLD</Text>
          <View style={styles.previewBox}>
            {hold ? (
              renderPreviewPiece(hold, 2)
            ) : (
              <Text style={styles.previewText}>—</Text>
            )}
          </View>
          <TouchableOpacity style={[styles.smallBtn, { marginTop: 8 }]} onPress={handleHold}>
            <Text style={styles.smallBtnText}>HOLD</Text>
          </TouchableOpacity>

          <Text style={[styles.titleSmall, { marginTop: 12 }]}>NEXT</Text>
          <View style={{ gap: 6, marginTop: 6 }}>
            {previewPieces.map((p, idx) => (
              <View key={idx} style={styles.previewBox}>
                {renderCustomPreview(p)}
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controlsRow}>
        <TouchableOpacity style={styles.controlBtn} onPress={() => tryMove(-1)}>
          <Text style={styles.controlText}>◀</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlBtn} onPress={tryRotate}>
          <Text style={styles.controlText}>⟳</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlBtn} onPress={() => tryMove(1)}>
          <Text style={styles.controlText}>▶</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={() => {
            softDropRef.current = true;
            tick(); // drop one now
            softDropRef.current = false;
          }}
        >
          <Text style={styles.controlText}>↓</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlBtn} onPress={() => hardDropAndLock()}>
          <Text style={styles.controlText}>⤓</Text>
        </TouchableOpacity>
      </View>

      {/* Game Over overlay */}
      {gameOver && (
        <View style={styles.overlay}>
          <Text style={styles.gameOverText}>GAME OVER</Text>
          <Text style={styles.small}>Score: {score}</Text>
          <TouchableOpacity
            style={[styles.smallBtn, { marginTop: 12 }]}
            onPress={() => {
              startGame();
            }}
          >
            <Text style={styles.smallBtnText}>RESTART</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.smallBtn, { marginTop: 8 }]}
            onPress={() => {
              if (score > (best ?? 0)) setBest(score);
              onExit();
            }}
          >
            <Text style={styles.smallBtnText}>EXIT</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/* =========== Small render helpers =========== */

function renderCustomPreview(piece: Piece) {
  // render an approximate preview centered in a small box
  const shape = piece.shape;
  return (
    <View style={{ padding: 2 }}>
      <View style={{ width: CELL_SIZE * 4, height: CELL_SIZE * 3, alignItems: "center", justifyContent: "center" }}>
        {shape.map((row, ry) => (
          <View key={ry} style={{ flexDirection: "row" }}>
            {row.map((v, rx) => (
              <View
                key={rx}
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  backgroundColor: v ? piece.color : "#111",
                  borderWidth: 1,
                  borderColor: "#333",
                }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function renderPreviewPiece(name: PieceName, scale = 2) {
  const piece = makePiece(name);
  return renderCustomPreview(piece);
}

/* =========== Styles =========== */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#111" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#111" },
  container: {
    flex: 1,
    backgroundColor: "#111",
    alignItems: "center",
    padding: 12,
  },
  title: {
    fontFamily: "PressStart2P",
    fontSize: 40,
    color: "#c0c0c0",
    marginTop: 8,
  },
  titleSmall: {
    fontFamily: "PressStart2P",
    fontSize: 12,
    color: "#c0c0c0",
  },
  subtitle: {
    fontFamily: "PressStart2P",
    color: "#c0c0c0",
    fontSize: 10,
    marginBottom: 12,
  },
  bigBtn: {
    padding: 12,
    backgroundColor: "#222",
    borderWidth: 2,
    borderColor: "#555",
    marginTop: 18,
  },
  selectedBtn: {
    borderColor: "#ff5555",
  },
  bigBtnText: {
    fontFamily: "PressStart2P",
    color: "#c0c0c0",
  },
  small: {
    fontFamily: "PressStart2P",
    fontSize: 10,
    color: "#c0c0c0",
  },
  topRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    marginTop: 8,
  } as any,
  leftCol: {
    width: 120,
    gap: 8,
  } as any,
  rightCol: {
    width: 120,
    gap: 8,
    alignItems: "center",
  } as any,
  boardWrapper: {
    width: BOARD_WIDTH * (CELL_SIZE + 4),
    padding: 6,
    backgroundColor: "#111",
    borderWidth: 4,
    borderColor: "#555",
    gap: 4,
  } as any,
  row: {
    flexDirection: "row",
    gap: 4,
  } as any,
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    backgroundColor: "#222",
    borderWidth: 2,
    borderColor: "#555",
  } as any,
  previewBox: {
    width: CELL_SIZE * 4,
    height: CELL_SIZE * 3,
    backgroundColor: "#111",
    borderWidth: 2,
    borderColor: "#555",
    alignItems: "center",
    justifyContent: "center",
  } as any,
  previewText: {
    fontFamily: "PressStart2P",
    color: "#c0c0c0",
  },
  bigNumber: {
    fontFamily: "PressStart2P",
    color: "#c0c0c0",
    fontSize: 16,
    marginBottom: 6,
  },
  smallBtn: {
    padding: 8,
    borderWidth: 2,
    borderColor: "#555",
    backgroundColor: "#222",
    alignItems: "center",
  } as any,
  smallBtnText: {
    fontFamily: "PressStart2P",
    color: "#c0c0c0",
    fontSize: 10,
  },
  controlsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  } as any,
  controlBtn: {
    padding: 10,
    borderWidth: 2,
    borderColor: "#555",
    backgroundColor: "#222",
  } as any,
  controlText: {
    fontFamily: "PressStart2P",
    color: "#c0c0c0",
  },
  overlay: {
    position: "absolute",
    top: "30%",
    left: "10%",
    right: "10%",
    backgroundColor: "#111",
    borderWidth: 3,
    borderColor: "#ff5555",
    padding: 12,
    alignItems: "center",
  } as any,
  gameOverText: {
    fontFamily: "PressStart2P",
    color: "#ff5555",
    fontSize: 18,
  },
  controlSmall: {
    width: 40,
    height: 40,
  },
});
