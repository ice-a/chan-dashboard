import type { CacheEntry, MarketCache } from '../core/cache.ts';
import { asD1, type D1DatabaseLike } from './d1Types.ts';

interface CacheRow {
  cache_key: string;
  payload: string;
  expires_at: number;
  stale_until: number;
}

/**
 * D1-backed market cache. Replaces KV for bar caching: D1 allows far higher
 * daily read/write volume (KV free tier is only 100k reads / 1k writes a day).
 */
export class D1MarketCache<T> implements MarketCache<T> {
  readonly kind = 'd1';
  private writes = 0;
  private db: D1DatabaseLike;
  constructor(db: unknown) { this.db = asD1(db); }

  async get(key: string): Promise<CacheEntry<T> | undefined> {
    const row = await this.db.prepare('SELECT cache_key, payload, expires_at, stale_until FROM market_cache WHERE cache_key = ?').bind(key).first<CacheRow>();
    if (!row) return undefined;
    if (row.stale_until <= Date.now()) {
      // Opportunistic cleanup, bounded to keep write cost predictable.
      void this.db.prepare('DELETE FROM market_cache WHERE cache_key = ?').bind(key).run().catch(() => undefined);
      return undefined;
    }
    try { return { value: JSON.parse(row.payload) as T, expiresAt: row.expires_at, staleUntil: row.stale_until }; }
    catch { return undefined; }
  }

  async set(key: string, entry: CacheEntry<T>): Promise<void> {
    if (entry.staleUntil <= Date.now()) return;
    await this.db.prepare('INSERT OR REPLACE INTO market_cache (cache_key, payload, expires_at, stale_until) VALUES (?, ?, ?, ?)')
      .bind(key, JSON.stringify(entry.value), entry.expiresAt, entry.staleUntil).run();
    this.writes++;
    // Sweep expired rows occasionally instead of on every write.
    if (this.writes % 250 === 0) {
      await this.db.prepare('DELETE FROM market_cache WHERE stale_until <= ?').bind(Date.now()).run();
    }
  }
}
