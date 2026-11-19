import type { CatalogInstrument, CatalogPage, CatalogSnapshot, CatalogSummary, ResearchSnapshot, ScanRun } from '../../shared/catalog.ts';
import type { InstrumentDetail } from '../../shared/dashboard.ts';

export interface ResearchStore {
  publishCatalog(snapshot: CatalogSnapshot): Promise<void>;
  currentCatalog(): Promise<CatalogSnapshot | null>;
  catalogSummary(): Promise<CatalogSummary>;
  findInstrument(id: string): Promise<CatalogInstrument | undefined>;
  listCatalog(query: { market?: string; q?: string; cursor?: string; limit?: number }): Promise<CatalogPage>;
  createScan(catalogVersion: string, instrumentIds?: string[]): Promise<ScanRun>;
  scan(id: string): Promise<ScanRun | null>;
  latestScan(): Promise<ScanRun | null>;
  updateScan(run: ScanRun): Promise<void>;
  publishResearch(snapshot: ResearchSnapshot): Promise<void>;
  currentResearch(): Promise<ResearchSnapshot | null>;
  detail(snapshotId: string, instrumentId: string): Promise<InstrumentDetail | undefined>;
}

export class MemoryResearchStore implements ResearchStore {
  private catalog: CatalogSnapshot | null = null;
  private research: ResearchSnapshot | null = null;
  private scans = new Map<string, ScanRun>();
  private details = new Map<string, InstrumentDetail>();
  async publishCatalog(snapshot: CatalogSnapshot): Promise<void> { this.catalog = snapshot; }
  async currentCatalog(): Promise<CatalogSnapshot | null> { return this.catalog; }
  async catalogSummary(): Promise<CatalogSummary> { const { summarizeCatalog } = await import('../../shared/catalog.ts'); return summarizeCatalog(this.catalog); }
  async findInstrument(id: string): Promise<CatalogInstrument | undefined> { return this.catalog?.instruments.find((item) => item.id === id); }
  async listCatalog(query: { market?: string; q?: string; cursor?: string; limit?: number }): Promise<CatalogPage> {
    const all = this.catalog?.instruments.filter((item) => (!query.market || item.market === query.market) && (!query.q || `${item.id} ${item.name}`.toLowerCase().includes(query.q.toLowerCase()))) ?? [];
    const start = Math.max(0, Number(query.cursor) || 0), limit = Math.min(200, Math.max(1, query.limit ?? 50));
    return { instruments: all.slice(start, start + limit), nextCursor: start + limit < all.length ? String(start + limit) : null, total: all.length };
  }
  async createScan(catalogVersion: string, instrumentIds?: string[]): Promise<ScanRun> {
    const instruments = this.catalog?.instruments.filter((item) => !instrumentIds || instrumentIds.includes(item.id)) ?? [];
    if (!instruments.length) throw new Error('当前目录没有可扫描标的');
    const run: ScanRun = { id: crypto.randomUUID(), catalogVersion, status: 'running', startedAt: new Date().toISOString(), finishedAt: null, total: instruments.length, counts: { pending: instruments.length, running: 0, succeeded: 0, insufficient_history: 0, no_data: 0, mapping_review: 0, failed_terminal: 0 }, items: instruments.map((item) => ({ instrumentId: item.id, status: 'pending', attemptCount: 0, lastError: null })) };
    this.scans.set(run.id, run); return run;
  }
  async scan(id: string): Promise<ScanRun | null> { return this.scans.get(id) ?? null; }
  async latestScan(): Promise<ScanRun | null> { return [...this.scans.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).at(0) ?? null; }
  async updateScan(run: ScanRun): Promise<void> { this.scans.set(run.id, run); }
  async publishResearch(snapshot: ResearchSnapshot): Promise<void> { this.research = snapshot; }
  async currentResearch(): Promise<ResearchSnapshot | null> { return this.research; }
  async detail(snapshotId: string, instrumentId: string): Promise<InstrumentDetail | undefined> { return this.details.get(`${snapshotId}:${instrumentId}`); }
  /** Store a detail produced during a scan so the research drawer can load it later. */
  saveDetail(snapshotId: string, instrumentId: string, detail: InstrumentDetail): void { this.details.set(`${snapshotId}:${instrumentId}`, detail); }
}

export function createDefaultResearchStore(): ResearchStore {
  return new MemoryResearchStore();
}
