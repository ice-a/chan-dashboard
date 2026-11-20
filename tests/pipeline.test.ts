import { describe, expect, it } from 'vitest';
import { MemoryResearchStore } from '../server/storage/researchStore';
import { buildPipelineStatus } from '../server/core/pipelineStatus';
import { buildFinalizeNotification } from '../server/core/notify';
import type { StoredSignalEvent } from '../server/core/signalDiff';

const NOW = new Date('2026-11-20T17:05:00Z');

function instrument(id: string) {
  return { id, symbol: id.slice(3), name: id.slice(3), market: 'US' as const, kind: 'stock' as const, currency: 'USD' as const, providers: { nasdaq: id.slice(3) }, listingStatus: 'listed' as const, listedAt: null, exchange: 'US_MAIN', catalogSource: 'nasdaq' as const, catalogVersion: 'v1', mappingStatus: 'ready' as const };
}

async function storeWithCatalog(ids: string[]): Promise<MemoryResearchStore> {
  const store = new MemoryResearchStore();
  await store.publishCatalog({ version: 'v1', createdAt: '2026-11-20T00:00:00Z', complete: true, instruments: ids.map(instrument), sources: [] });
  return store;
}

function event(overrides: Partial<StoredSignalEvent>): StoredSignalEvent {
  return { id: 'x', runId: 'r2', prevRunId: 'r1', instrumentId: 'US:AAPL', name: 'Apple', market: 'US', kind: 'stock', type: 'quadrant', detail: '进入双高共振（原 动量领先）', createdAt: NOW.toISOString(), ...overrides };
}

describe('buildFinalizeNotification', () => {
  it('summarizes quadrant moves and caps the list', () => {
    const events = [
      event({ instrumentId: 'A', name: '甲' }),
      event({ instrumentId: 'B', name: '乙', detail: '退出双高共振（现 双弱）' }),
      event({ instrumentId: 'C', name: '丙', type: 'rank', detail: '排名上升 12 位（第 40 → 28）' }),
      ...Array.from({ length: 8 }, (_, i) => event({ instrumentId: `Q${i}`, name: `标的${i}` })),
    ];
    const payload = buildFinalizeNotification({ events, scored: 9000, total: 11321, snapshotDate: '2026-11-20' });
    expect(payload.title).toContain('2026-11-20');
    expect(payload.body).toContain('评分 9000/11321');
    // 10 quadrant events total (2 + 8), 6 listed + overflow line.
    expect(payload.body).toContain('象限跃迁 10（进共振 9 · 出共振 1）· 排名变动 1');
    expect(payload.body).toContain('另有 4 条象限变化');
  });

  it('handles the first snapshot with no events', () => {
    const payload = buildFinalizeNotification({ events: [], scored: 100, total: 120, snapshotDate: '2026-11-20' });
    expect(payload.body).toContain('象限跃迁 0（进共振 0 · 出共振 0）· 排名变动 0');
  });
});

describe('buildPipelineStatus', () => {
  it('aggregates cycle gate, scan progress and snapshot header', async () => {
    const store = await storeWithCatalog(['US:AAPL', 'US:MSFT']);
    await store.setAppState('cron:last-cycle-date', '2026-11-20');
    await store.setAppState('cron:cycle-hour-utc', '16');
    await store.setAppState('cron:ignore-gate', '0');
    await store.setAppState('cron:sync-retry:szse_stocks:2026-11-20', '2');
    await store.stageCatalogPage({ source: 'sse_main', rows: [], declaredTotal: 100, pageCount: 1, fetchedCount: 0, excludedCount: 0, nextCursor: null });
    await store.failCatalogSource('szse_stocks', 'WAF 403');
    const run = await store.createScan('v1', ['US:AAPL', 'US:MSFT']);
    const status = await buildPipelineStatus(store, NOW);
    expect(status.cycle).toEqual({ today: '2026-11-20', started: true, hourUtc: 16, ignoreGate: false });
    expect(status.sources.find((item) => item.source === 'sse_main')).toMatchObject({ status: 'complete', label: '上交所主板' });
    const failed = status.sources.find((item) => item.source === 'szse_stocks');
    expect(failed).toMatchObject({ status: 'failed', retriesToday: 2, error: 'WAF 403' });
    expect(status.scan?.id).toBe(run.id);
    expect(status.scan?.status).toBe('running');
    expect(status.scan?.total).toBe(2);
    expect(status.scan?.ratePerMinute).toBeNull(); // nothing done yet
    expect(status.snapshot).toBeNull();
  });

  it('estimates throughput and ETA once items complete', async () => {
    const store = await storeWithCatalog(['US:AAPL', 'US:MSFT', 'US:NVDA', 'US:TSLA']);
    const run = await store.createScan('v1', ['US:AAPL', 'US:MSFT', 'US:NVDA', 'US:TSLA']);
    await store.completeStep(run.id, [
      { instrumentId: 'US:AAPL', status: 'succeeded', lastError: null, record: null },
      { instrumentId: 'US:MSFT', status: 'succeeded', lastError: null, record: null },
    ] as never);
    const status = await buildPipelineStatus(store, NOW);
    expect(status.scan?.counts.succeeded).toBe(2);
    expect(status.scan?.ratePerMinute).not.toBeNull();
    expect(status.scan?.etaHours).not.toBeNull();
  });
});
