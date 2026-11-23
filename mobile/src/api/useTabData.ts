import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { isAxiosError } from 'axios';
import { apiClient } from './client';
import { getCachedData, setCachedData } from '../utils/cache';

type Result<T> = { scope: string; data: T | null; loading: boolean; error: string | null };

export function useTabData<T>(
  path: string,
  scope: string,
  parse: (value: unknown) => T,
) {
  const [result, setResult] = useState<Result<T>>();
  const request = useRef<AbortController | null>(null);
  const focused = useRef(false);

  const reload = useCallback(async () => {
    if (!focused.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const key = `panel_${scope}_${path}`;
    setResult(previous => ({
      scope,
      data: previous?.scope === scope ? previous.data : null,
      loading: true,
      error: null,
    }));

    const cached = getCachedData<unknown>(key).then(value => {
      if (controller.signal.aborted || value == null) return;
      try {
        const data = parse(value);
        setResult(previous =>
          previous?.scope === scope && previous.loading && previous.data == null
            ? { ...previous, data }
            : previous
        );
      } catch {
        // A previous version of the app may have saved a different response shape.
      }
    });

    try {
      const response = await apiClient.get<unknown>(path, { signal: controller.signal });
      const data = parse(response.data);
      if (controller.signal.aborted) return;
      setResult({ scope, data, loading: false, error: null });
      await setCachedData(key, data);
    } catch (error) {
      await cached;
      if (controller.signal.aborted) return;
      const status = isAxiosError(error) ? error.response?.status : undefined;
      const detail = isAxiosError(error) ? error.response?.data?.error : undefined;
      const message = status === 401
        ? 'Muda wa kuingia umeisha. Toka kwenye akaunti kisha ingia tena.'
        : typeof detail === 'string' && detail.trim()
          ? detail
          : 'Imeshindikana kupakia taarifa. Jaribu tena.';
      setResult(previous => ({
        scope,
        data: previous?.scope === scope ? previous.data : null,
        loading: false,
        error: message,
      }));
    }
  }, [path, scope, parse]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    void reload();
    return () => {
      focused.current = false;
      request.current?.abort();
    };
  }, [reload]));

  const current = result?.scope === scope ? result : null;
  return {
    data: current?.data ?? null,
    loading: current?.loading ?? true,
    error: current?.error ?? null,
    reload,
  };
}
