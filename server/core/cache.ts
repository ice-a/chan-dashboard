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

