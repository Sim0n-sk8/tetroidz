import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LifetimeStats {
  highScore: number;
  totalLinesCleared: number;
  totalGamesPlayed: number;
  totalTime: number;
}

const LIFETIME_STATS_KEY = 'lifetimeStats';

export const saveLifetimeStats = async (stats: LifetimeStats): Promise<void> => {
  try {
    const jsonValue = JSON.stringify(stats);
    await AsyncStorage.setItem(LIFETIME_STATS_KEY, jsonValue);
  } catch (e) {
    console.error('Error saving lifetime stats:', e);
  }
};

export const loadLifetimeStats = async (): Promise<LifetimeStats | null> => {
  try {
    const jsonValue = await AsyncStorage.getItem(LIFETIME_STATS_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (e) {
    console.error('Error loading lifetime stats:', e);
    return null;
  }
};
