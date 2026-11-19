export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  staleUntil: number;
}

export interface MarketCache<T> {
  get(key: string): Promise<CacheEntry<T> | undefined>;
  set(key: string, entry: CacheEntry<T>): Promise<void>;
  readonly kind: string;
}

export class MemoryCache<T> implements MarketCache<T> {
  readonly kind = 'memory';
  private entries = new Map<string, CacheEntry<T>>();
  private readonly capacity: number;
  constructor(capacity = 250) { this.capacity = capacity; }
  async get(key: string): Promise<CacheEntry<T> | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.staleUntil <= Date.now()) { this.entries.delete(key); return undefined; }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }
  async set(key: string, entry: CacheEntry<T>): Promise<void> {
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
  }
}

export interface KVBinding {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
}

export class KVCache<T> implements MarketCache<T> {
  readonly kind = 'cloudflare-kv';
  private readonly kv: KVBinding;
  private readonly fallback: MemoryCache<T>;
  constructor(kv: KVBinding, fallback = new MemoryCache<T>()) { this.kv = kv; this.fallback = fallback; }
  async get(key: string): Promise<CacheEntry<T> | undefined> {
    try {
      const value = await this.kv.get(`daily:${key}`, 'json') as CacheEntry<T> | null;
      if (value && typeof value.expiresAt === 'number' && value.staleUntil > Date.now()) return value;
    } catch { /* A cache failure must not block live market requests. */ }
    return this.fallback.get(key);
  }
  async set(key: string, entry: CacheEntry<T>): Promise<void> {
    await this.fallback.set(key, entry);
    try {
      const ttl = Math.max(1, Math.ceil((entry.staleUntil - Date.now()) / 1000));
      await this.kv.put(`daily:${key}`, JSON.stringify(entry), { expirationTtl: ttl });
    } catch { /* The response is still valid if persistent caching is unavailable. */ }
  }
}
