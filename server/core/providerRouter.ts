import type { Instrument, MarketData, ProviderAttempt, ProviderId } from '../../shared/market.ts';
import type { MarketProvider, ProviderContext, ProviderData } from './providers/types.ts';

function supportsProvider(provider: ProviderId, instrument: Instrument): boolean {
  if (provider === 'nasdaq') return instrument.market === 'US';
  if (provider === 'tencent') return instrument.market !== 'US';
  return true;
}
import { publicFailure } from './marketValidation.ts';
import type { MarketCache } from './cache.ts';

export interface CachedCandles extends ProviderData { receivedAt: string }

export interface RouterOptions {
  providers: MarketProvider[];
  cache: MarketCache<CachedCandles>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  concurrency?: number;
  ttlSeconds?: number;
  staleTtlSeconds?: number;
}

export class ProviderRouter {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly active = new Map<ProviderId, number>();
  private readonly queues = new Map<ProviderId, Array<() => void>>();
  private readonly options: RouterOptions;
  constructor(options: RouterOptions) {
    this.options = options;
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  async getDaily(instrument: Instrument, signal?: AbortSignal): Promise<MarketData> {
    const attempts: ProviderAttempt[] = [];
    let stale: { data: CachedCandles; provider: ProviderId } | undefined;
    for (const provider of this.providersFor(instrument)) {
      const key = `${instrument.id}:1d:qfq:${provider.id}`;
      const cached = await this.options.cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return this.result(instrument, cached.value, provider.id, 'hit', [...attempts, { provider: provider.id, ok: true, durationMs: 0 }]);
      }
      if (cached && !stale) stale = { data: cached.value, provider: provider.id };
      const startedAt = performance.now();
      try {
        const fresh = await provider.fetchDaily(instrument, this.context(signal));
        const receivedAt = new Date().toISOString();
        const value: CachedCandles = { ...fresh, receivedAt };
        const ttl = fresh.isUnclosed ? Math.min(this.options.ttlSeconds ?? 300, 60) : (this.options.ttlSeconds ?? 300);
        await this.options.cache.set(key, { value, expiresAt: Date.now() + ttl * 1000, staleUntil: Date.now() + (this.options.staleTtlSeconds ?? 86400) * 1000 });
        attempts.push({ provider: provider.id, ok: true, durationMs: Math.round(performance.now() - startedAt) });
        return this.result(instrument, value, provider.id, 'miss', attempts);
      } catch (error) {
        if (signal?.aborted) throw error;
        attempts.push({ provider: provider.id, ok: false, durationMs: Math.round(performance.now() - startedAt), error: publicFailure(error, provider.id).failure });
      }
    }
    if (stale) return this.result(instrument, stale.data, stale.provider, 'stale', attempts);
    const error = new Error('所有行情数据源均不可用') as Error & { attempts: ProviderAttempt[] };
    error.attempts = attempts;
    throw error;
  }

  /** Order providers by market capability so scans do not probe sources that cannot serve the instrument. */
  private providersFor(instrument: Instrument): MarketProvider[] {
    const all = this.options.providers;
    const capable = all.filter((provider) => supportsProvider(provider.id, instrument));
    return capable.length ? capable : all;
  }

  private result(instrument: Instrument, value: CachedCandles, provider: ProviderId, cache: MarketData['cache'], attempts: ProviderAttempt[]): MarketData {
    return {
      instrument, candles: value.candles, provider, interval: '1d', adjustment: value.adjustment,
      sourceDate: value.candles.at(-1)!.date, receivedAt: value.receivedAt, cache,
      stale: cache === 'stale', isUnclosed: value.isUnclosed, attempts,
    };
  }

  private context(signal?: AbortSignal): ProviderContext {
    return {
      fetch: this.fetcher, signal, timeoutMs: this.options.timeoutMs ?? 9000,
      runLimited: (provider, task) => this.limit(provider, task),
    };
  }

  private async limit(provider: ProviderId, task: () => Promise<ProviderData>): Promise<ProviderData> {
    const concurrency = Math.max(1, Math.min(8, this.options.concurrency ?? 4));
    while ((this.active.get(provider) ?? 0) >= concurrency) {
      await new Promise<void>((resolve) => {
        const queue = this.queues.get(provider) ?? [];
        queue.push(resolve);
        this.queues.set(provider, queue);
      });
    }
    this.active.set(provider, (this.active.get(provider) ?? 0) + 1);
    try { return await task(); } finally {
      this.active.set(provider, this.active.get(provider)! - 1);
      this.queues.get(provider)?.shift()?.();
    }
  }
}
