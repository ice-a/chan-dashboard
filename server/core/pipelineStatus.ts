import type { ResearchStore } from '../storage/researchStore.ts';

export interface PipelineSourceStatus {
  source: string;
  label: string;
  status: string;
  stagedCount: number;
  declaredTotal: number | null;
  pagesDone: number;
  error: string | null;
  updatedAt: string;
  /** Retry attempts used today (cron budget is 2 per source per day). */
  retriesToday: number;
}

export interface PipelineStatus {
  /** Catalog published for the current cycle: totals + completeness. */
  catalog: { version: string | null; complete: boolean; total: number; markets: Record<string, { total: number; stocks: number; etfs: number }> } | null;
  /** Today's cron cycle bookkeeping. */
  cycle: { today: string; started: boolean; hourUtc: number; ignoreGate: boolean };
  /** Per-source sync ledger (empty between cycles). */
  sources: PipelineSourceStatus[];
  /** Latest scan run with live counts and an ETA estimate. */
  scan: {
    id: string;
    status: string;
    total: number;
    counts: Record<string, number>;
    startedAt: string;
    /** Instruments/min over the run so far. */
    ratePerMinute: number | null;
    /** Null while terminal or when the rate is zero. */
    etaHours: number | null;
  } | null;
  /** Most recent published snapshot header. */
  snapshot: { id: string; createdAt: string; total: number; ready: number; failed: number } | null;
}

const SOURCE_LABELS: Record<string, string> = {
  sse_main: '上交所主板', sse_star: '科创板', szse_stocks: '深交所股票', szse_etf: '深交所ETF',
  nasdaq_stocks: '美国股票', nasdaq_etf: '美国ETF', hkex: '港交所',
};

export async function buildPipelineStatus(store: ResearchStore, now = new Date()): Promise<PipelineStatus> {
  const today = now.toISOString().slice(0, 10);
  const [summary, latest, states, brief, lastCycle, cycleHour, ignoreGate] = await Promise.all([
    store.catalogSummary().catch(() => null),
    store.latestScan(),
    store.syncState().catch(() => []),
    store.researchBrief().catch(() => null),
    store.getAppState('cron:last-cycle-date'),
    store.getAppState('cron:cycle-hour-utc'),
    store.getAppState('cron:ignore-gate'),
  ]);

  const sources: PipelineSourceStatus[] = [];
  for (const state of states) {
    const retries = Number(await store.getAppState(`cron:sync-retry:${state.source}:${today}`) ?? '0');
    sources.push({
      source: state.source,
      label: SOURCE_LABELS[state.source] ?? state.source,
      status: state.status,
      stagedCount: state.stagedCount,
      declaredTotal: state.declaredTotal,
      pagesDone: state.pagesDone,
      error: state.error,
      updatedAt: state.updatedAt,
      retriesToday: retries,
    });
  }

  let scan: PipelineStatus['scan'] = null;
  if (latest) {
    const counts = latest.counts;
    const done = (counts.succeeded ?? 0) + (counts.failed_terminal ?? 0) + (counts.insufficient_history ?? 0) + (counts.no_data ?? 0) + (counts.mapping_review ?? 0);
    const remaining = (counts.pending ?? 0) + (counts.running ?? 0);
    const minutes = Math.max(1, (now.getTime() - new Date(latest.startedAt).getTime()) / 60_000);
    const ratePerMinute = done > 0 ? done / minutes : null;
    scan = {
      id: latest.id,
      status: latest.status,
      total: latest.total,
      counts,
      startedAt: latest.startedAt,
      ratePerMinute: ratePerMinute === null ? null : Math.round(ratePerMinute * 10) / 10,
      etaHours: ratePerMinute && remaining > 0 ? Math.round((remaining / ratePerMinute) / 60 * 10) / 10 : null,
    };
  }

  return {
    catalog: summary ? {
      version: summary.version,
      complete: summary.complete,
      total: summary.total,
      markets: summary.markets as unknown as Record<string, { total: number; stocks: number; etfs: number }>,
    } : null,
    cycle: {
      today,
      started: lastCycle === today,
      hourUtc: Number(cycleHour) || 16,
      ignoreGate: ignoreGate === '1',
    },
    sources,
    scan,
    snapshot: brief ? { id: brief.id, createdAt: brief.createdAt, total: brief.total, ready: brief.ready, failed: brief.failed } : null,
  };
}
