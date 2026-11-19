import type { CatalogInstrument, CatalogSourceReport } from '../../shared/catalog.ts';

export interface CatalogFetchContext {
  fetch: typeof globalThis.fetch;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface CatalogPart {
  source: CatalogSourceReport['source'];
  market: CatalogSourceReport['market'];
  scope: string;
  declaredTotal: number | null;
  sourceDate?: string | null;
  instruments: CatalogInstrument[];
  fetchedCount?: number;
  includedCount?: number;
  excludedCount?: number;
  pages?: number;
}

export interface CatalogAdapter {
  readonly id: CatalogPart['source'];
  fetchCatalog(context: CatalogFetchContext): Promise<CatalogPart[]>;
}

export async function fetchCatalogJson(url: URL, context: CatalogFetchContext, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await context.fetch(url, { headers: { accept: 'application/json', 'user-agent': 'ChanDashboard/1.0', ...headers }, signal: AbortSignal.any([context.signal ?? new AbortController().signal, AbortSignal.timeout(context.timeoutMs)]) });
  if (!response.ok) throw new Error(`目录请求HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 20_000_000) throw new Error('目录响应过大');
  return JSON.parse(text) as unknown;
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('目录响应结构无效');
  return value as Record<string, unknown>;
}

export function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/<[^>]*$/g, '').replace(/<|>/g, '').trim() : '';
}

export function assertCatalogPart(part: CatalogPart): void {
  if (part.declaredTotal !== null && part.fetchedCount !== undefined && part.declaredTotal !== part.fetchedCount) {
    throw new Error(`${part.source}/${part.scope} 目录数量不一致：声明${part.declaredTotal}，实际${part.fetchedCount}`);
  }
  const ids = new Set(part.instruments.map((item) => item.id));
  if (ids.size !== part.instruments.length) throw new Error(`${part.source}/${part.scope} 目录存在重复标的`);
  if (!part.instruments.length) throw new Error(`${part.source}/${part.scope} 目录为空`);
}
