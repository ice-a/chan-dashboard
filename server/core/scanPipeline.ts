import type { ProviderRouter } from './providerRouter.ts';
import type { ResearchStore, CompletedItem } from '../storage/researchStore.ts';

/**
 * Shared scan pipeline used by both the HTTP handlers (browser-driven and
 * Node background scans) and the cron runner: one claimed batch → per
 * instrument bars fetch + legacy-v1 compute → terminal-state writeback.
 */
export async function processClaimed(router: ProviderRouter, claimed: Awaited<ReturnType<ResearchStore['claimStep']>>): Promise<CompletedItem[]> {
  const { computeAsset } = await import('../../src/domain/resonance.ts');
  return Promise.all(claimed.map(async (entry): Promise<CompletedItem> => {
    try {
      const data = await router.getDaily(entry.instrument);
      if (data.candles.length < 130) {
        return { instrumentId: entry.instrument.id, status: 'insufficient_history', lastError: `有效日线${data.candles.length}根，不足130根`, record: null };
      }
      const asset = computeAsset(data.candles);
      if (!asset) return { instrumentId: entry.instrument.id, status: 'insufficient_history', lastError: '结构或动量数据不足', record: null };
      const { candles: _candles, instrument: _instrument, ...metadata } = data;
      return {
        instrumentId: entry.instrument.id, status: 'succeeded', lastError: null,
        record: {
          instrument: entry.instrument, status: 'ready', chan: asset.chan, momentum: asset.momentum,
          chanScore: null, momentumScore: null, resonance: null, quadrant: null, rank: null, rankDelta: null,
          snapshot: { ...metadata, candleCount: data.candles.length }, attempts: data.attempts, error: null,
        },
      };
    } catch (error) {
      return { instrumentId: entry.instrument.id, status: 'failed_terminal', lastError: error instanceof Error ? error.message.slice(0, 180) : '扫描失败', record: null };
    }
  }));
}

/**
 * Close out a scan whose items are all terminal: pull compact scoring input,
 * rank with the shared pure function, persist scores, then finalize (which
 * validates closure and publishes the snapshot). Safe to re-run after partial
 * failure — raws/scores/finalize are idempotent for a finished run.
 */
export async function finalizeRanked(store: ResearchStore, scanId: string): Promise<number> {
  const { rankRawEntries } = await import('../../src/domain/resonance.ts');
  const entries: Awaited<ReturnType<ResearchStore['rawsPage']>>['rows'] = [];
  let cursor = 0;
  for (let guard = 0; guard < 100; guard++) {
    const page = await store.rawsPage(scanId, cursor, 5000);
    entries.push(...page.rows);
    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  const scores = rankRawEntries(entries);
  for (let i = 0; i < scores.length; i += 500) await store.saveScores(scanId, scores.slice(i, i + 500));
  await store.finalizeScan(scanId);
  return scores.length;
}
