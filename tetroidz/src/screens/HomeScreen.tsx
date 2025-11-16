import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { loadLifetimeStats, LifetimeStats } from '../lib/storage';

const HomeScreen = ({ navigation }) => {
  const [stats, setStats] = useState<LifetimeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    React.useCallback(() => {
      const fetchStats = async () => {
        setLoading(true);
        const loadedStats = await loadLifetimeStats();
        setStats(loadedStats);
        setLoading(false);
      };

      fetchStats();
    }, [])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tetroidz</Text>

      <View style={styles.statsContainer}>
        {loading ? (
          <ActivityIndicator size="large" color="#fff" />
        ) : stats ? (
          <>
            <Text style={styles.statsTitle}>Lifetime Stats</Text>
            <Text style={styles.statsText}>High Score: {stats.highScore}</Text>
            <Text style={styles.statsText}>Total Lines Cleared: {stats.totalLinesCleared}</Text>
            <Text style={styles.statsText}>Total Games Played: {stats.totalGamesPlayed}</Text>
            <Text style={styles.statsText}>Total Time Played: {Math.floor(stats.totalTime / 60)}m {stats.totalTime % 60}s</Text>
          </>
        ) : (
          <Text style={styles.statsText}>No stats yet. Play a game!</Text>
        )}
      </View>

      <Button
        title="Start Game"
        onPress={() => navigation.navigate('Game')}
        color="#841584"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  title: {
    fontSize: 48,
    marginBottom: 40,
    color: '#fff',
    fontWeight: 'bold',
  },
  statsContainer: {
    marginBottom: 40,
    alignItems: 'center',
  },
  statsTitle: {
    fontSize: 24,
    color: '#fff',
    marginBottom: 10,
  },
  statsText: {
    fontSize: 18,
    color: '#c0c0c0',
    marginBottom: 5,
  },
});

export default HomeScreen;
