const cache = new Map<string, string>();
const MAX_ENTRIES = 100;

export async function getCachedData<T>(key: string): Promise<T | null> {
  const raw = cache.get(key);
  return raw ? JSON.parse(raw) as T : null;
}

export async function setCachedData(key: string, data: unknown): Promise<void> {
  const encoded = JSON.stringify(data);
  if (encoded === undefined) return;
  cache.delete(key);
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, encoded);
}

export function clearCachedData() {
  cache.clear();
}
