export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readJson<T>(storage: StorageLike | undefined, key: string, validate: (value: unknown) => T, fallback: T): T {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    return raw === null ? fallback : validate(JSON.parse(raw));
  } catch { return fallback; }
}

export function writeJson(storage: StorageLike | undefined, key: string, value: unknown): boolean {
  if (!storage) return false;
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function localStore(): StorageLike | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}
