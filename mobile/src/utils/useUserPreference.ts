import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

export function useUserPreference(userId: string | undefined, name: string, fallback: boolean) {
  const key = userId ? 'vifani_pref_' + userId + '_' + name : null;
  const revision = useRef(0);
  const [cached, setCached] = useState<{ key: string; value: boolean } | null>(null);

  useFocusEffect(useCallback(() => {
    if (!key) return;
    let active = true;
    const requested = revision.current;
    void AsyncStorage.getItem(key).then(value => {
      if (active && revision.current === requested) setCached({ key, value: value === null ? fallback : value === 'true' });
    }).catch(() => {});
    return () => { active = false; };
  }, [key, fallback]));

  const setValue = async (value: boolean) => {
    if (!key) return;
    revision.current++;
    setCached({ key, value });
    try {
      await AsyncStorage.setItem(key, String(value));
    } catch {
      Alert.alert('Mipangilio', 'Chaguo limebadilika lakini halikuweza kuhifadhiwa kwenye simu.');
    }
  };
  return [cached?.key === key && cached ? cached.value : name === 'hide_balances' || fallback, setValue] as const;
}
