import type { Candle, Instrument, Market } from '../../shared/market.ts';
import { ProviderError, providerError } from './providers/providerTypes.ts';
import type { ProviderId } from '../../shared/market.ts';

function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function normalizeCandles(rows: unknown[], provider: ProviderId): Candle[] {
  const dates = new Map<string, Candle>();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) throw providerError(provider, 'invalid_response', 'K线字段不完整');
    const [date, open, close, high, low, volume] = row;
    if (typeof date !== 'string' || !validDate(date)) throw providerError(provider, 'invalid_response', 'K线日期格式无效');
    const values = [open, close, high, low, volume].map(Number);
    if (!values.every(Number.isFinite)) throw providerError(provider, 'invalid_response', 'K线包含无效数值');
    const [o, c, h, l, v] = values;
    if (o <= 0 || c <= 0 || h <= 0 || l <= 0 || v < 0 || h < Math.max(o, c, l) || l > Math.min(o, c, h)) {
      throw providerError(provider, 'invalid_response', `${date} 的OHLCV关系无效`);
    }
    dates.set(date, { date, open: o, close: c, high: h, low: l, volume: v });
  }
  const candles = [...dates.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-300);
  if (candles.length < 130) throw providerError(provider, 'insufficient_data', `有效日线仅 ${candles.length} 根，至少需要130根`);
  return candles;
}

export function assertSymbol(instrument: Instrument, actual: unknown, provider: ProviderId): void {
  if (typeof actual !== 'string' || actual.toUpperCase() !== instrument.symbol.toUpperCase()) {
    throw providerError(provider, 'symbol_mismatch', '返回证券与请求标的不一致');
  }
}

export function isUnclosedDaily(instrument: Instrument, date: string, marketStatus?: string, now = new Date()): boolean {
  if (marketStatus) {
    const pattern = new RegExp(`${instrument.market === 'CN' ? '(?:SH|SZ)' : instrument.market}_(open|close)_`);
    const match = marketStatus.match(pattern);
    if (match) return match[1] === 'open';
  }
  const timezone: Record<Market, string> = { CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' };
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone[instrument.market], year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const localDate = `${value('year')}-${value('month')}-${value('day')}`;
  if (localDate !== date) return false;
  const minutes = Number(value('hour')) * 60 + Number(value('minute'));
  return minutes < (instrument.market === 'CN' ? 15 * 60 + 10 : 16 * 60 + 10);
}

export async function fetchJson(url: URL, provider: ProviderId, fetcher: typeof fetch, timeoutMs: number, parentSignal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(parentSignal?.reason);
  parentSignal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetcher(url, { signal: controller.signal, headers: { accept: 'application/json', 'user-agent': 'ChanDashboard/1.0' } });
    } catch (error) {
      if (parentSignal?.aborted) throw error;
      if (controller.signal.aborted) throw providerError(provider, 'timeout', `请求超过 ${timeoutMs}ms`);
      throw providerError(provider, 'unavailable', error instanceof Error ? `网络请求失败：${error.message}`.slice(0, 180) : '网络请求失败');
    }
    if (!response.ok) {
      throw providerError(provider, response.status === 429 ? 'rate_limit' : 'http', `上游返回 HTTP ${response.status}`, response.status);
    }
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 2_500_000) throw providerError(provider, 'invalid_response', '上游响应过大');
    const text = await response.text();
    if (text.length > 2_500_000) throw providerError(provider, 'invalid_response', '上游响应过大');
    try { return JSON.parse(text); } catch { throw providerError(provider, 'invalid_response', '上游未返回有效JSON'); }
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', onAbort);
  }
}

export function asRecord(value: unknown, provider: ProviderId): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw providerError(provider, 'invalid_response', '上游响应结构无效');
  return value as Record<string, unknown>;
}

export function publicFailure(error: unknown, provider: ProviderId): ProviderError {
  if (error instanceof ProviderError) return error;
  return providerError(provider, 'unavailable', error instanceof Error ? error.message.slice(0, 180) : '未知数据错误');
}
