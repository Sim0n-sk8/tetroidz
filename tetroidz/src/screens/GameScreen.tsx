import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import useGameLogic, { PIECES } from '../hooks/useGameLogic';

const GameScreen = () => {
  const {
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
    ghostY,
  } = useGameLogic();

  return (
    <View style={styles.container}>
      <View style={styles.statsContainer}>
        <Text style={styles.statsText}>Score: {score}</Text>
        <Text style={styles.statsText}>Lines: {linesCleared}</Text>
        <Text style={styles.statsText}>Time: {timeElapsed}</Text>
      </View>

      <View style={styles.sidePanels}>
        <View style={styles.preview}>
          <Text style={styles.previewText}>Hold</Text>
          <View style={styles.previewBox}>
            {holdPiece ? (
              (PIECES[holdPiece.name]).map((row, y) => (
                <View key={y} style={{ flexDirection: 'row' }}>
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
              <View key={y} style={{ flexDirection: 'row' }}>
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
              let borderColor = '#333';

              const ghostDropY = ghostY();
              currentPiece.shape.forEach((r, dy) =>
                r.forEach((v, dx) => {
                  if (v && x === pos.x + dx && y === ghostDropY + dy) {
                    if (!color) {
                      color = currentPiece.color + '55';
                    }
                  }
                })
              );

              currentPiece.shape.forEach((r, dy) =>
                r.forEach((v, dx) => {
                  if (v && x === pos.x + dx && y === pos.y + dy) {
                    color = currentPiece.color;
                    borderColor = '#fff';
                  }
                })
              );

              if (flashLines.includes(y)) {
                color = '#fff';
                borderColor = '#fff';
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
            <TouchableOpacity onPress={hardDrop} style={styles.btn}>
              <Text style={styles.btnText}>Hard Drop</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

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
    statsContainer: { position: 'absolute', top: 40, left: 20 },
    statsText: { color: "#fff", fontSize: 18, marginBottom: 5, fontWeight: 'bold' },
    sidePanels: { position: "absolute", top: 40, right: 20, flexDirection: "row", justifyContent: "space-between", width: "auto" },
    preview: { alignItems: "center", marginLeft: 20 },
    previewBox: { borderWidth: 1, borderColor: '#444', padding: 4, backgroundColor: '#333' },
    previewText: { color: "#fff", fontSize: 14, marginBottom: 4, fontWeight: 'bold' },
  });

export default GameScreen;
