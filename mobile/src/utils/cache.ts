import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'vifani_cache_v1_';

export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function setCachedData(key: string, data: any): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
  } catch {
    // Puuza kama hifadhi imejaa
  }
}
