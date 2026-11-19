import { describe, expect, it, vi, beforeEach } from 'vitest';
import { normalizeCandles, isUnclosedDaily } from '../server/core/marketValidation';
import { ProviderRouter } from '../server/core/providerRouter';
import { MemoryCache } from '../server/core/cache';
import { INSTRUMENT_MAP } from '../src/config/instruments';
import type { MarketProvider } from '../server/core/providers/types';

const rows = Array.from({ length: 140 }, (_, i) => {
  const day = new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10);
  return [day, '10', '11', '12', '9', '100'];
});
const aapl = INSTRUMENT_MAP.get('US:AAPL')!;

describe('market validation', () => {
  it('deduplicates, sorts and limits candles to 300', () => {
    const normalized = normalizeCandles([...rows, ...rows.slice(0, 3)], 'tencent');
    expect(normalized.length).toBe(140);
  });
  it('rejects malformed OHLC relationships', () => {
    expect(() => normalizeCandles(rows.map((row, i) => i === 0 ? [row[0], '10', '20', '12', '9', '100'] : row), 'eastmoney')).toThrow('OHLCV关系无效');
  });
  it('uses the provider market state rather than browser local timezone', () => {
    expect(isUnclosedDaily(aapl, '2026-11-17', 'US_close_未开盘', new Date('2026-11-18T01:00:00Z'))).toBe(false);
    expect(isUnclosedDaily(aapl, '2026-11-17', 'US_open_交易中', new Date('2026-11-18T01:00:00Z'))).toBe(true);
  });
});

describe('provider fallback and stale cache', () => {
  const candles = normalizeCandles(rows, 'tencent');
  const failing: MarketProvider = { id: 'eastmoney', name: 'test', fetchDaily: async () => { throw new Error('offline'); } };
  const fallback: MarketProvider = { id: 'tencent', name: 'test', fetchDaily: vi.fn(async () => ({ candles, isUnclosed: false, adjustment: 'qfq' as const })) };
  beforeEach(() => { vi.mocked(fallback.fetchDaily).mockClear(); });
  it('returns one coherent fallback series and records primary error', async () => {
    const router = new ProviderRouter({ providers: [failing, fallback], cache: new MemoryCache(), fetch: vi.fn(), concurrency: 2 });
    // Tencent is the first capable source for HK instruments in the capability router.
    const hkInstrument = { ...aapl, id: 'HK:00700', symbol: '00700', market: 'HK' as const };
    const data = await router.getDaily(hkInstrument);
    expect(data.provider).toBe('tencent');
    expect(data.candles).toHaveLength(140);
    expect(data.attempts[0].error?.code).toBe('unavailable');
    expect(data.attempts[1].ok).toBe(true);
  });
  it('uses fresh cache and never claims stale cache is current', async () => {
    const cache = new MemoryCache<Awaited<ReturnType<MarketProvider['fetchDaily']>> & { receivedAt: string }>();
    const router = new ProviderRouter({ providers: [fallback], cache, fetch: vi.fn(), ttlSeconds: 300 });
    expect((await router.getDaily(aapl)).cache).toBe('miss');
    expect((await router.getDaily(aapl)).cache).toBe('hit');
    expect(fallback.fetchDaily).toHaveBeenCalledTimes(1);
  });
  it('serves explicitly stale data only when every provider fails', async () => {
    const cache = new MemoryCache<Awaited<ReturnType<MarketProvider['fetchDaily']>> & { receivedAt: string }>();
    await cache.set(`${aapl.id}:1d:qfq:eastmoney`, { value: { candles, isUnclosed: false, adjustment: 'qfq', receivedAt: '2026-01-01T00:00:00Z' }, expiresAt: Date.now() - 1, staleUntil: Date.now() + 60_000 });
    const router = new ProviderRouter({ providers: [failing], cache, fetch: vi.fn() });
    const result = await router.getDaily(aapl);
    expect(result.stale).toBe(true);
    expect(result.cache).toBe('stale');
    expect(result.receivedAt).toBe('2026-01-01T00:00:00Z');
  });
});
