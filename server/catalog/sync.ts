import { randomUUID } from 'node:crypto';
import type { CatalogInstrument, CatalogSnapshot, CatalogSourceReport } from '../../shared/catalog.ts';
import type { CatalogAdapter, CatalogFetchContext, CatalogPart } from './types.ts';

export async function syncCatalog(adapters: CatalogAdapter[], context: CatalogFetchContext): Promise<CatalogSnapshot> {
  const instruments = new Map<string, CatalogInstrument>();
  const sources: CatalogSourceReport[] = [];
  const version = randomUUID();
  for (const adapter of adapters) {
    try {
      const parts = await adapter.fetchCatalog(context);
      for (const part of parts) {
        for (const instrument of part.instruments) {
          if (instruments.has(instrument.id)) throw new Error(`目录证券ID重复：${instrument.id}`);
          instruments.set(instrument.id, { ...instrument, catalogVersion: version });
        }
        sources.push(report(part, 'complete'));
      }
    } catch (error) {
      sources.push({ source: adapter.id, market: adapter.id === 'nasdaq' ? 'US' : adapter.id === 'hkex' ? 'HK' : 'CN', scope: '目录同步', status: 'failed', declaredTotal: null, fetchedCount: 0, includedCount: 0, excludedCount: 0, pages: 0, sourceDate: null, error: error instanceof Error ? error.message : '目录同步失败' });
    }
  }
  return { version, createdAt: new Date().toISOString(), complete: sources.every((source) => source.status === 'complete'), instruments: [...instruments.values()], sources };
}

function report(part: CatalogPart, status: 'complete' | 'failed'): CatalogSourceReport {
  return { source: part.source, market: part.market, scope: part.scope, status, declaredTotal: part.declaredTotal, fetchedCount: part.fetchedCount ?? part.instruments.length, includedCount: part.instruments.length, excludedCount: part.excludedCount ?? Math.max(0, (part.fetchedCount ?? part.instruments.length) - part.instruments.length), pages: part.pages ?? 1, sourceDate: part.sourceDate ?? null };
}
