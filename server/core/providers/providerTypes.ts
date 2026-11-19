import type { Candle, Instrument, ProviderFailure, ProviderId, Adjustment } from '../../../shared/market.ts';

export interface ProviderData {
  candles: Candle[];
  isUnclosed: boolean;
  adjustment: Adjustment;
}

export interface ProviderContext {
  fetch: typeof globalThis.fetch;
  signal?: AbortSignal;
  timeoutMs: number;
  runLimited: (provider: ProviderId, task: () => Promise<ProviderData>) => Promise<ProviderData>;
}

export interface MarketProvider {
  id: ProviderId;
  name: string;
  fetchDaily(instrument: Instrument, context: ProviderContext): Promise<ProviderData>;
}

export class ProviderError extends Error {
  readonly failure: ProviderFailure;
  constructor(failure: ProviderFailure) {
    super(failure.message);
    this.failure = failure;
    this.name = 'ProviderError';
  }
}

export function providerError(provider: ProviderId, code: ProviderFailure['code'], message: string, status?: number): ProviderError {
  return new ProviderError({
    provider, code, message, status,
    retryable: code === 'timeout' || code === 'unavailable' || code === 'rate_limit' || (status !== undefined && status >= 500),
  });
}
