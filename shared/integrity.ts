import { randomUUID } from 'node:crypto';
import type { CatalogSnapshot } from './catalog';

export function createCatalogSnapshot(parts: { source: import('./catalog').CatalogSourceReport; instruments: import('./catalog').CatalogInstrument[] }[]): CatalogSnapshot {
  if (!parts.length || parts.some((part) => part.source.status !== 'complete')) throw new Error('目录来源未完整，禁止发布为全量目录');
  const instruments = new Map<string, import('./catalog').CatalogInstrument>();
  for (const part of parts) for (const instrument of part.instruments) {
    if (instruments.has(instrument.id)) throw new Error(`跨来源标的ID重复：${instrument.id}`);
    instruments.set(instrument.id, instrument);
  }
  return { version: randomUUID(), createdAt: new Date().toISOString(), complete: true, instruments: [...instruments.values()], sources: parts.map((part) => part.source) };
}

export function assertScanClosure(total: number, counts: Record<string, number>): void {
  const terminal = ['succeeded', 'insufficient_history', 'no_data', 'mapping_review', 'failed_terminal', 'inherited'].reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  if (terminal !== total) throw new Error(`扫描未封口：目录${total}，终态/继承${terminal}`);
}
