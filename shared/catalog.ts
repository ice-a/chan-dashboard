import type { Instrument, Market, ProviderId } from './market';

export type CatalogSource = 'sse' | 'szse' | 'bse' | 'hkex' | 'nasdaq' | 'sec' | 'eastmoney' | 'fixture';
export type ListingStatus = 'listed' | 'suspended' | 'delisted' | 'unknown';
export type MappingStatus = 'ready' | 'mapping_review';

export interface CatalogInstrument extends Instrument {
  exchange: string;
  listingStatus: ListingStatus;
  listedAt: string | null;
  catalogSource: CatalogSource;
  catalogVersion: string;
  mappingStatus: MappingStatus;
}

export interface CatalogSourceReport {
  source: CatalogSource;
  market: Market;
  scope: string;
  status: 'complete' | 'failed';
  declaredTotal: number | null;
  fetchedCount: number;
  includedCount: number;
  excludedCount: number;
  pages: number;
  sourceDate: string | null;
  error?: string;
}

export interface CatalogSnapshot {
  version: string;
  createdAt: string;
  complete: boolean;
  instruments: CatalogInstrument[];
  sources: CatalogSourceReport[];
}

export interface CatalogPage {
  instruments: CatalogInstrument[];
  nextCursor: string | null;
  total: number;
}

export interface CatalogSummary {
  version: string | null;
  createdAt: string | null;
  complete: boolean;
  total: number;
  markets: Record<Market, { total: number; stocks: number; etfs: number; mappingReview: number }>;
  sources: CatalogSourceReport[];
}

export interface ScanItemStatus {
  instrumentId: string;
  status: 'pending' | 'running' | 'succeeded' | 'insufficient_history' | 'no_data' | 'mapping_review' | 'failed_terminal';
  attemptCount: number;
  lastError: string | null;
  detail?: unknown;
}

export interface ScanRun {
  id: string;
  catalogVersion: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  total: number;
  counts: Record<ScanItemStatus['status'], number>;
  items: ScanItemStatus[];
}

export interface ResearchSnapshot {
  id: string;
  catalogVersion: string;
  createdAt: string;
  algorithmVersion: 'legacy-v1';
  complete: boolean;
  total: number;
  records: import('./dashboard').AnalysisRecord[];
  diagnostics: ScanItemStatus[];
}

/** Lightweight snapshot header without loading every record (D1-friendly). */
export interface ResearchBrief {
  id: string;
  catalogVersion: string;
  createdAt: string;
  algorithmVersion: 'legacy-v1';
  complete: boolean;
  total: number;
  ready: number;
  stale: number;
  failed: number;
  quadrants: Record<string, number>;
}

/** One claim returned by a scan step: the item plus its catalog instrument. */
export interface ClaimedScanItem {
  item: ScanItemStatus;
  instrument: CatalogInstrument;
}

export interface RankEntry {
  instrumentId: string;
  name: string;
  market: Market;
  kind: 'stock' | 'etf';
  chanScore: number;
  raw: number;
}

export interface RankedScore {
  instrumentId: string;
  name: string;
  market: Market;
  kind: 'stock' | 'etf';
  momentumScore: number;
  resonance: number;
  quadrant: string;
  rank: number;
}

export function isCatalogId(id: string): boolean {
  return /^(CN|HK|US):[A-Z0-9][A-Z0-9.-]{0,19}$/.test(id);
}

export function summarizeCatalog(snapshot: CatalogSnapshot | null): CatalogSummary {
  const markets = { CN: { total: 0, stocks: 0, etfs: 0, mappingReview: 0 }, HK: { total: 0, stocks: 0, etfs: 0, mappingReview: 0 }, US: { total: 0, stocks: 0, etfs: 0, mappingReview: 0 } };
  for (const instrument of snapshot?.instruments ?? []) {
    const group = markets[instrument.market];
    group.total++;
    if (instrument.kind === 'etf') group.etfs++; else group.stocks++;
    if (instrument.mappingStatus === 'mapping_review') group.mappingReview++;
  }
  return { version: snapshot?.version ?? null, createdAt: snapshot?.createdAt ?? null, complete: snapshot?.complete ?? false, total: snapshot?.instruments.length ?? 0, markets, sources: snapshot?.sources ?? [] };
}

export function providerSymbol(provider: ProviderId, instrument: CatalogInstrument): string | undefined {
  return instrument.providers[provider];
}
