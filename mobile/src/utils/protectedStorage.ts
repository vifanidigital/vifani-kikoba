import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const SESSION_TOKEN_KEY = 'vifani_token';
export const BIOMETRIC_CREDENTIALS_KEY = 'vifani_bio_creds';
const transient = new Map<string, string>();

export async function getProtectedItem(key: string) {
  return await SecureStore.isAvailableAsync() ? SecureStore.getItemAsync(key) : transient.get(key) ?? null;
}

export async function setProtectedItem(key: string, value: string) {
  if (await SecureStore.isAvailableAsync()) await SecureStore.setItemAsync(key, value);
  else transient.set(key, value);
}

export async function removeProtectedItem(key: string) {
  transient.delete(key);
  if (await SecureStore.isAvailableAsync()) await SecureStore.deleteItemAsync(key);
}

export async function clearLegacySensitiveStorage() {
  const legacyKeys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith('vifani_cache_v1_'));
  await AsyncStorage.multiRemove([SESSION_TOKEN_KEY, BIOMETRIC_CREDENTIALS_KEY, ...legacyKeys]);
}
