import { describe, expect, it } from 'vitest';
import { analyzeChan } from '../src/domain/chan/analyze';
import { buildChanStructure } from '../src/domain/chan/detail';
import { computeAsset } from '../src/domain/resonance';
import { validateWatchlist } from '../src/stores/preferences';
import { readJson, writeJson } from '../src/services/storage';
import type { StorageLike } from '../src/services/storage';
import { emptyHistory, HISTORY_LIMIT, mergeSignals, validateHistory } from '../src/services/signalHistory';
import { csvCell, instrumentJson, rankingCsv } from '../src/services/exporters';
import { INSTRUMENT_MAP } from '../src/config/instruments';
import type { AnalysisRecord } from '../shared/dashboard';
import type { Candle } from '../shared/market';

const candles: Candle[] = Array.from({ length: 150 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10), open: 100 + i, close: 101 + i, high: 103 + i, low: 99 + i, volume: 1000 + i }));
function record(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  const asset = computeAsset(candles)!;
  return { instrument: INSTRUMENT_MAP.get('US:AAPL')!, status: 'ready', chanScore: asset.chan.score, momentumScore: 80, resonance: 80, quadrant: 'resonance', rank: 1, rankDelta: 0, chan: asset.chan, momentum: asset.momentum, snapshot: { provider: 'nasdaq', interval: '1d', adjustment: 'split', sourceDate: '2026-11-19', receivedAt: '2026-11-19T08:00:00.000Z', cache: 'miss', stale: false, isUnclosed: false, candleCount: 150, attempts: [] }, attempts: [], error: null, ...overrides };
}

describe('research chart data', () => {
  it('shares identical structure and MACD with the legacy score', () => {
    const structure = buildChanStructure(candles);
    expect(structure.macd.dea).toHaveLength(structure.macd.dif.length);
    expect(analyzeChan(candles, structure)).toEqual(analyzeChan(candles));
    expect(computeAsset(candles)!.structure).toEqual(structure);
  });
  it('retains original index ranges across multiple containment merges', () => {
    const source: Candle[] = [{ date: '2026-01-01', open: 10, close: 11, high: 12, low: 9, volume: 10 }, { date: '2026-01-02', open: 11, close: 10, high: 11.5, low: 9.5, volume: 20 }, { date: '2026-01-03', open: 10, close: 10.5, high: 11, low: 10, volume: 30 }];
    const structure = buildChanStructure(source);
    expect(structure.merged).toHaveLength(1);
    expect(structure.merged[0]).toMatchObject({ startIndex: 0, endIndex: 2, startDt: '2026-01-01', endDt: '2026-01-03' });
  });
});

describe('local preferences and storage', () => {
  it('filters unknown IDs and duplicate or malformed watchlist data', () => {
    expect(validateWatchlist({ ids: ['US:AAPL', 'US:AAPL', 'UNKNOWN', 7] })).toEqual(['US:AAPL']);
    expect(validateWatchlist(null)).toEqual([]);
    expect(validateWatchlist({ ids: 'US:AAPL' })).toEqual([]);
  });
  it('recovers from broken JSON and does not throw on unavailable storage', () => {
    const values = new Map<string, string>([['watch', '{bad']]);
    const storage: StorageLike = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } };
    expect(readJson(storage, 'watch', validateWatchlist, [])).toEqual([]);
    expect(writeJson(storage, 'watch', { ids: ['US:AAPL'] })).toBe(true);
    expect(readJson(storage, 'watch', validateWatchlist, [])).toEqual(['US:AAPL']);
    expect(writeJson(undefined, 'watch', {})).toBe(false);
  });
});

describe('bounded local signal history', () => {
  it('creates no events for the first baseline and ignores identical refreshes', () => {
    const baseline = mergeSignals([record()], emptyHistory());
    expect(baseline.events).toHaveLength(0);
    expect(mergeSignals([record()], baseline).events).toHaveLength(0);
  });
  it('records quadrant and structure changes with unclosed data explicitly marked', () => {
    const baseline = mergeSignals([record()], emptyHistory());
    const changed = record({ quadrant: 'structure', rank: 8, snapshot: { ...record().snapshot!, receivedAt: '2026-11-19T09:00:00.000Z', isUnclosed: true }, chan: { ...record().chan!, observation: '回调观察' } });
    const result = mergeSignals([changed], baseline);
    expect(result.events).toHaveLength(3);
    expect(result.events.every((event) => event.isUnclosed)).toBe(true);
    expect(mergeSignals([changed], result).events).toHaveLength(3);
  });
  it('skips stale and unavailable results and caps event history', () => {
    const baseline = mergeSignals([record()], emptyHistory());
    const stale = record({ snapshot: { ...record().snapshot!, stale: true } });
    expect(mergeSignals([stale], baseline).events).toHaveLength(0);
    const events = Array.from({ length: HISTORY_LIMIT + 30 }, (_, i) => ({ id: String(i), instrumentId: 'US:AAPL', category: 'rank' as const, observedAt: '2026-11-19T08:00:00.000Z', sourceDate: '2026-11-19', isUnclosed: false, summary: '排名变化', previous: '1', current: '2', quadrant: 'weak' as const, rank: i }));
    expect(validateHistory({ version: 1, events, states: {} }).events).toHaveLength(HISTORY_LIMIT);
    expect(validateHistory({ events: 'broken' }).events).toEqual([]);
  });
});

describe('export integrity', () => {
  it('escapes CSV cells and prevents spreadsheet formula evaluation', () => {
    expect(csvCell('a,"b"\n')).toBe('"a,""b""\n"');
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell(null)).toBe('');
    expect(rankingCsv([record()])).toContain('legacy-v1');
  });
  it('includes real candles and coordinate metadata in instrument JSON', () => {
    const asset = computeAsset(candles)!;
    const exported = JSON.parse(instrumentJson(record(), { candles, structure: asset.structure, snapshot: record().snapshot! }));
    expect(exported.detail.candles).toHaveLength(150);
    expect(exported.coordinateNotice).toContain('合并K线');
    expect(exported.algorithmVersion).toBe('legacy-v1');
  });
});
