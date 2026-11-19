import { INSTRUMENT_MAP } from '../../src/config/instruments.ts';
import type { MarketFailure } from '../../shared/market.ts';
import type { ProviderAttempt } from '../../shared/market.ts';
import { eastmoneyProvider } from './providers/eastmoney.ts';
import { tencentProvider } from './providers/tencent.ts';
import { nasdaqProvider } from './providers/nasdaq.ts';
import { ProviderRouter } from './providerRouter.ts';
import { createDefaultResearchStore } from '../storage/researchStore.ts';
import type { ResearchStore } from '../storage/researchStore.ts';

export interface ResearchHandlerOptions {
  store?: ResearchStore;
  adminToken?: string;
  catalogTimeoutMs?: number;
}

export function createResearchHandler(router: ProviderRouter, options: ResearchHandlerOptions = {}) {
  const store = options.store ?? createDefaultResearchStore();
  const adminToken = options.adminToken ?? process.env.RESEARCH_ADMIN_TOKEN;
  const catalogTimeoutMs = options.catalogTimeoutMs ?? (Number(process.env.RESEARCH_CATALOG_TIMEOUT_MS) || 45000);
  let activeScan: Promise<void> | null = null;

  return async function handleResearch(request: Request): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/catalog/summary') {
      return json({ ok: true, summary: await store.catalogSummary(), latestScan: await store.latestScan(), research: researchBrief(await store.currentResearch()) });
    }
    if (path === '/api/catalog/instruments') {
      const page = await store.listCatalog({ market: url.searchParams.get('market') ?? undefined, q: url.searchParams.get('q') ?? undefined, cursor: url.searchParams.get('cursor') ?? undefined, limit: Number(url.searchParams.get('limit')) || 50 });
      return json({ ok: true, page });
    }
    if (path === '/api/catalog/sync' && request.method === 'POST') {
      if (!checkAdmin(request, adminToken)) return json({ error: '需要管理员令牌' }, 401);
      const { syncCatalog } = await import('../catalog/sync.ts');
      const { sseCatalog } = await import('../catalog/sse.ts');
      const { szseCatalog } = await import('../catalog/szse.ts');
      const { nasdaqCatalog } = await import('../catalog/nasdaq.ts');
      const { hkexCatalog } = await import('../catalog/hkex.ts');
      const snapshot = await syncCatalog([sseCatalog, szseCatalog, hkexCatalog, nasdaqCatalog], { fetch, timeoutMs: catalogTimeoutMs });
      await store.publishCatalog(snapshot);
      return json({ ok: true, snapshot: { version: snapshot.version, complete: snapshot.complete, total: snapshot.instruments.length, sources: snapshot.sources } });
    }
    if (path === '/api/scans' && request.method === 'POST') {
      if (!checkAdmin(request, adminToken)) return json({ error: '需要管理员令牌' }, 401);
      const body = await safeJson(request);
      const force = body?.force === true;
      if (activeScan && !force) return json({ ok: true, running: true, note: '已有扫描进行中' });
      const catalog = await store.currentCatalog();
      if (!catalog) return json({ error: '尚未同步目录' }, 409);
      const run = await store.createScan(catalog.version);
      activeScan = executeScan(store, run, router).finally(() => { activeScan = null; });
      return json({ ok: true, run });
    }
    const scanMatch = path.match(/^\/api\/scans\/([^/]+)(\/retry)?$/);
    if (scanMatch) {
      const run = await store.scan(decodeURIComponent(scanMatch[1]));
      if (!run) return json({ error: '扫描任务不存在' }, 404);
      run.counts = tally(run);
      if (run.status === 'running' && run.counts.pending === 0 && run.counts.running === 0) { run.status = 'completed'; run.finishedAt = new Date().toISOString(); await store.updateScan(run); }
      if (scanMatch[2] === '/retry') {
        if (!checkAdmin(request, adminToken)) return json({ error: '需要管理员令牌' }, 401);
        const failed = run.items.filter((item) => item.status === 'failed_terminal');
        for (const item of failed) { item.status = 'pending'; item.attemptCount = 0; }
        const rerun = { ...run, status: 'running' as const, finishedAt: null };
        await store.updateScan(rerun);
        activeScan ??= executeScan(store, rerun, router).finally(() => { activeScan = null; });
        return json({ ok: true, run: rerun, retried: failed.length });
      }
      return json({ ok: true, run });
    }
    if (path === '/api/snapshots/current') {
      const research = await store.currentResearch();
      if (!research) return json({ ok: true, snapshot: null, note: '尚未发布研究快照' });
      return json({ ok: true, snapshot: { id: research.id, catalogVersion: research.catalogVersion, createdAt: research.createdAt, complete: research.complete, total: research.total }, summary: researchBrief(research) });
    }
    if (path === '/api/snapshots/current/rankings') {
      const research = await store.currentResearch();
      if (!research) return json({ ok: false, error: { code: 'no_snapshot', message: '尚未发布研究快照' } }, 404);
      return json({ ok: true, page: pageRecords(research.records, url) });
    }
    const rankingMatch = path.match(/^\/api\/snapshots\/([^/]+)\/(rankings|summary|diagnostics)$/);
    if (rankingMatch) {
      const research = await store.currentResearch();
      if (!research || research.id !== decodeURIComponent(rankingMatch[1])) return json({ error: '快照不存在或已被新版本替换' }, 404);
      if (rankingMatch[2] === 'summary') return json({ ok: true, summary: researchBrief(research) });
      if (rankingMatch[2] === 'diagnostics') return json({ ok: true, page: pageRecords(research.diagnostics as never, url) });
      return json({ ok: true, page: pageRecords(research.records, url) });
    }
    const detailMatch = path.match(/^\/api\/snapshots\/([^/]+)\/instruments\/([^/]+)(\/detail)?$/);
    if (detailMatch) {
      const research = await store.currentResearch();
      const instrumentId = decodeURIComponent(detailMatch[2]);
      if (!research) return json({ error: '尚未发布研究快照' }, 404);
      if (detailMatch[3]) {
        const detail = await store.detail(research.id, instrumentId);
        if (!detail) return json({ error: '该标的暂无K线详情' }, 404);
        return json({ ok: true, detail: { ...detail, snapshot: { ...detail.snapshot } } });
      }
      const record = research.records.find((item) => item.instrument.id === instrumentId);
      if (!record) {
        const diagnostic = research.diagnostics.find((item) => item.instrumentId === instrumentId);
        if (!diagnostic) return json({ error: '标的不在本轮快照中' }, 404);
        return json({ ok: true, record: { instrument: { id: instrumentId }, status: 'unavailable' as const, diagnostic }, note: '该标的本轮无有效评分' });
      }
      return json({ ok: true, record });
    }
    return json({ error: 'Not found' }, 404);
  };
}

function researchBrief(research: { id: string; createdAt: string; complete: boolean; total: number; records: { status: string; quadrant?: string | null; snapshot?: { stale?: boolean } | null }[]; diagnostics: unknown[] } | null) {
  if (!research) return null;
  const ready = research.records.filter((r) => r.status === 'ready');
  return { id: research.id, createdAt: research.createdAt, complete: research.complete, total: research.total, ready: ready.length, stale: ready.filter((r) => r.snapshot?.stale).length, failed: research.diagnostics.length, quadrants: Object.fromEntries(['resonance', 'structure', 'momentum', 'weak'].map((q) => [q, ready.filter((r) => r.quadrant === q).length])) };
}

function pageRecords<T>(items: T[], url: URL): { items: T[]; total: number; nextCursor: string | null } {
  let list = items;
  const q = url.searchParams.get('q')?.toLowerCase();
  const market = url.searchParams.get('market');
  const kind = url.searchParams.get('kind');
  const quadrant = url.searchParams.get('quadrant');
  const ids = url.searchParams.get('ids')?.split(',').filter(Boolean);
  const status = url.searchParams.get('status');
  const get = (item: T, key: string) => (item as Record<string, unknown>)[key];
  const instrumentOf = (item: T) => get(item, 'instrument') as Record<string, unknown> | undefined;
  list = list.filter((item) => {
    const instrument = instrumentOf(item);
    if (market && (!instrument || instrument.market !== market)) return false;
    if (kind && instrument && instrument.kind !== kind) return false;
    if (status && get(item, 'status') !== status) return false;
    if (quadrant && get(item, 'quadrant') !== quadrant) return false;
    if (ids?.length) { const id = instrument ? String(instrument.id) : String(get(item, 'instrumentId') ?? ''); if (!ids.includes(id)) return false; }
    if (q && !JSON.stringify(item).toLowerCase().includes(q)) return false;
    return true;
  });
  const sort = url.searchParams.get('sort');
  if (sort) list = [...list].sort((a, b) => Number(get(b, sort) ?? 0) - Number(get(a, sort) ?? 0));
  const start = Math.max(0, Number(url.searchParams.get('cursor')) || 0);
  const limit = Math.min(200, Number(url.searchParams.get('limit')) || 50);
  return { items: list.slice(start, start + limit), total: list.length, nextCursor: start + limit < list.length ? String(start + limit) : null };
}

async function executeScan(store: ResearchStore, run: import('../../shared/catalog.ts').ScanRun, router: ProviderRouter): Promise<void> {
  const { computeAsset } = await import('../../src/domain/resonance.ts');
  const { crossSectionScores } = await import('../../src/domain/momentum/analyze.ts');
  const catalog = await store.currentCatalog();
  if (!catalog) return;
  const pendingItems = run.items.filter((item) => item.status === 'pending');
  const CONCURRENCY = Math.max(1, Number(process.env.RESEARCH_SCAN_CONCURRENCY) || 4);
  const results = new Map<string, import('../../shared/dashboard.ts').AnalysisRecord>();
  const details = new Map<string, import('../../shared/dashboard.ts').InstrumentDetail>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < pendingItems.length) {
      const item = pendingItems[cursor++];
      const instrument = catalog.instruments.find((i) => i.id === item.instrumentId);
      if (!instrument) { item.status = 'failed_terminal'; item.lastError = '目录缺少该标的'; continue; }
      item.status = 'running';
      item.attemptCount++;
      try {
        const data = await router.getDaily(instrument);
        if (data.candles.length < 130) { item.status = 'insufficient_history'; item.lastError = `有效日线${data.candles.length}根，不足130根`; continue; }
        const asset = computeAsset(data.candles);
        if (!asset) { item.status = 'insufficient_history'; continue; }
        const { candles: _candles, instrument: _instrument, ...metadata } = data;
        results.set(instrument.id, { instrument, status: 'ready', chan: asset.chan, momentum: asset.momentum, chanScore: null, momentumScore: null, resonance: null, quadrant: null, rank: null, rankDelta: null, snapshot: { ...metadata, candleCount: data.candles.length }, attempts: data.attempts, error: null });
        details.set(instrument.id, { candles: data.candles, structure: asset.structure, snapshot: { ...metadata, candleCount: data.candles.length } });
        item.status = 'succeeded';
      } catch (error) {
        item.status = 'failed_terminal';
        item.lastError = error instanceof Error ? error.message.slice(0, 180) : '扫描失败';
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const eligible = [...results.values()].filter((r) => r.momentum);
  const scores = crossSectionScores(eligible.map((r) => r.momentum!));
  for (const record of eligible) {
    const chan = record.chan!.score;
    const momentum = scores.get(record.momentum!)!;
    record.chanScore = chan;
    record.momentumScore = momentum;
    record.resonance = Math.round(Math.sqrt(Math.max(0, chan) * Math.max(0, momentum)) * 10) / 10;
    const hc = chan >= 78, hm = momentum >= 70;
    record.quadrant = hc && hm ? 'resonance' : hc ? 'structure' : hm ? 'momentum' : 'weak';
  }
  eligible.sort((a, b) => (b.resonance! - a.resonance!) || (b.momentumScore! - a.momentumScore!) || a.instrument.id.localeCompare(b.instrument.id));
  eligible.forEach((r, i) => { r.rank = i + 1; });
  const snapshotId = randomId();
  run.counts = tally(run);
  run.status = 'completed';
  run.finishedAt = new Date().toISOString();
  await store.updateScan(run);
  const { assertScanClosure } = await import('../../shared/integrity.ts');
  assertScanClosure(run.total, { ...run.counts, inherited: run.total - run.items.length });
  await store.publishResearch({ id: snapshotId, catalogVersion: run.catalogVersion, createdAt: new Date().toISOString(), algorithmVersion: 'legacy-v1', complete: true, total: run.total, records: eligible, diagnostics: run.items.filter((i) => i.status !== 'succeeded') });
  if (isMemoryStore(store)) for (const [instrumentId, detail] of details) store.saveDetail(snapshotId, instrumentId, detail);
}

function isMemoryStore(store: ResearchStore): store is ResearchStore & { saveDetail(snapshotId: string, instrumentId: string, detail: import('../../shared/dashboard.ts').InstrumentDetail): void } {
  return 'saveDetail' in store;
}

function randomId(): string { return crypto.randomUUID(); }

/** Derive live counters from item states so progress polling reflects reality. */
function tally(run: import('../../shared/catalog.ts').ScanRun): import('../../shared/catalog.ts').ScanRun['counts'] {
  const counts = { pending: 0, running: 0, succeeded: 0, insufficient_history: 0, no_data: 0, mapping_review: 0, failed_terminal: 0 };
  for (const item of run.items) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return counts;
}

function checkAdmin(request: Request, token?: string): boolean {
  if (!token) return false;
  return request.headers.get('x-admin-token') === token;
}

async function safeJson(request: Request): Promise<Record<string, unknown> | null> {
  try { return await request.json() as Record<string, unknown>; } catch { return null; }
}

export function createMarketHandler(router: ProviderRouter) {
  return async function handleMarket(request: Request): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Method not allowed' }, 405);
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return json({ ok: true, service: 'chan-dashboard', runtime: 'portable', time: new Date().toISOString() });
    }
    if (url.pathname === '/api/market/providers') {
      return json({ providers: [
        { id: 'eastmoney', name: '东方财富', role: 'primary', note: '前复权日线 · 默认来源' },
        { id: 'tencent', name: '腾讯行情', role: 'fallback', note: 'A股/港股前复权日线 · 自动降级' },
        { id: 'nasdaq', name: 'Nasdaq', role: 'fallback', note: '美股历史日线 · 拆股调整 · 第二备用源' },
      ], strategy: '按标的自动降级，不跨源拼接K线', cache: routerCacheKind(router) });
    }
    if (url.pathname === '/api/market/bars') {
      const id = url.searchParams.get('instrument')?.toUpperCase() ?? '';
      const instrument = INSTRUMENT_MAP.get(id);
      if (!instrument) {
        const body: MarketFailure = { ok: false, instrument: { id, symbol: id, name: '未知标的', market: 'CN', kind: 'stock', currency: 'CNY', providers: { eastmoney: '', tencent: '' } }, error: { code: 'invalid_instrument', message: '标的不在受支持的配置池中', attempts: [] } };
        return json(body, 400);
      }
      try {
        return json({ ok: true, data: await router.getDaily(instrument, request.signal) });
      } catch (error) {
        if (request.signal.aborted) return json({ error: 'Request cancelled' }, 499);
        const attempts = (error as Error & { attempts?: ProviderAttempt[] }).attempts ?? [];
        const body: MarketFailure = { ok: false, instrument, error: { code: 'all_providers_failed', message: '暂时无法取得有效行情，请稍后重试', attempts } };
        return json(body, 502);
      }
    }
    return json({ error: 'Not found' }, 404);
  };
}

function routerCacheKind(router: ProviderRouter): string {
  return (router as unknown as { options: { cache: { kind: string } } }).options.cache.kind;
}

export function createDefaultRouter(cache: ConstructorParameters<typeof ProviderRouter>[0]['cache'], env: Record<string, string | undefined> = {}): ProviderRouter {
  const numeric = (key: string, fallback: number) => Number(env[key]) > 0 ? Number(env[key]) : fallback;
  return new ProviderRouter({
    providers: [eastmoneyProvider, tencentProvider, nasdaqProvider], cache,
    timeoutMs: numeric('MARKET_REQUEST_TIMEOUT_MS', 9000),
    concurrency: numeric('MARKET_PROVIDER_CONCURRENCY', 4),
    ttlSeconds: numeric('MARKET_CACHE_TTL_SECONDS', 300),
    staleTtlSeconds: numeric('MARKET_STALE_TTL_SECONDS', 86400),
  });
}

export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
  } });
}
