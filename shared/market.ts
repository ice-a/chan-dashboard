export type Market = 'CN' | 'HK' | 'US';
export type ProviderId = 'eastmoney' | 'tencent' | 'nasdaq';
export type AssetKind = 'stock' | 'etf';
export type DataInterval = '1d';
export type Adjustment = 'qfq' | 'split';

export interface Instrument {
  id: string;
  symbol: string;
  name: string;
  market: Market;
  kind: AssetKind;
  currency: 'CNY' | 'HKD' | 'USD';
  providers: Partial<Record<ProviderId, string>>;
}

export interface Candle {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

export type CacheStatus = 'miss' | 'hit' | 'stale';
export type ProviderErrorCode = 'timeout' | 'http' | 'rate_limit' | 'unavailable' | 'invalid_response' | 'symbol_mismatch' | 'insufficient_data' | 'unsupported_market';

export interface ProviderFailure {
  provider: ProviderId;
  code: ProviderErrorCode;
  message: string;
  status?: number;
  retryable: boolean;
}

export interface ProviderAttempt {
  provider: ProviderId;
  ok: boolean;
  durationMs: number;
  error?: ProviderFailure;
}

export interface MarketData {
  instrument: Instrument;
  candles: Candle[];
  provider: ProviderId;
  interval: DataInterval;
  adjustment: Adjustment;
  sourceDate: string;
  receivedAt: string;
  cache: CacheStatus;
  stale: boolean;
  isUnclosed: boolean;
  attempts: ProviderAttempt[];
}

export interface MarketSuccess {
  ok: true;
  data: MarketData;
}

export interface MarketFailure {
  ok: false;
  instrument: Instrument;
  error: {
    code: 'all_providers_failed' | 'invalid_instrument';
    message: string;
    attempts: ProviderAttempt[];
  };
  staleData?: MarketData;
}

export type MarketResponse = MarketSuccess | MarketFailure;

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  role: 'primary' | 'fallback';
  note: string;
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  eastmoney: '东方财富',
  tencent: '腾讯行情',
  nasdaq: 'Nasdaq',
};

export const MARKET_LABELS: Record<Market, string> = {
  CN: 'A股',
  HK: '港股',
  US: '美股',
};

export function instrumentId(market: Market, symbol: string): string {
  return `${market}:${symbol.toUpperCase()}`;
}
