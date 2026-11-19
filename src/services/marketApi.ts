import { PROVIDER_LABELS } from '../../shared/market';
import type { MarketData, MarketFailure, MarketResponse } from '../../shared/market';

export async function fetchMarketData(id: string, signal?: AbortSignal): Promise<MarketResponse> {
  const response = await fetch(`/api/market/bars?instrument=${encodeURIComponent(id)}`, { signal });
  const body = await response.json() as MarketResponse & { staleData?: MarketData };
  if (!response.ok && response.status !== 502) throw new Error(body.ok ? '行情服务异常' : body.error.message);
  if (!body.ok && body.staleData) return { ok: true, data: body.staleData };
  return body;
}

export function errorMessage(response: MarketFailure): string {
  const reasons = response.error.attempts.map((attempt) => `${PROVIDER_LABELS[attempt.provider]}：${attempt.error?.message ?? '请求失败'}`);
  return reasons.join('；') || response.error.message;
}
