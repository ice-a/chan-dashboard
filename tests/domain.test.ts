import { describe, expect, it } from 'vitest';
import { analyzeChan } from '../src/domain/chan/analyze';
import { buildBi, findFenxing, findZhongshu, processContain } from '../src/domain/chan/structure';
import { analyzeMomentum, crossSectionScores } from '../src/domain/momentum/analyze';
import { applyRankChanges, rankResonance } from '../src/domain/resonance';
import type { Candle } from '../shared/market';
import type { AnalysisRecord } from '../shared/dashboard';
import { INSTRUMENT_MAP } from '../src/config/instruments';

const candles: Candle[] = Array.from({ length: 150 }, (_, i) => {
  const close = 100 + Math.sin(i / 5) * 4 + i * 0.1;
  return { date: `2026-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String(i % 28 + 1).padStart(2, '0')}`, open: close - 0.4, close, high: close + 1, low: close - 1, volume: 1000 + i * 10 };
});

describe('legacy-v1 chan migration', () => {
  it('preserves the original containment direction and accumulated volume', () => {
    const merged = processContain([{ date: '2026-01-01', open: 10, close: 11, high: 12, low: 9, volume: 100 }, { date: '2026-01-02', open: 10, close: 10.5, high: 11, low: 9.5, volume: 200 }]);
    expect(merged[0]).toMatchObject({ dt: '2026-01-02', h: 12, l: 9.5, o: 10, c: 11, v: 300, startDt: '2026-01-01', endDt: '2026-01-02', startIndex: 0, endIndex: 1 });
  });
  it('extracts strict fractals and builds four-bar strokes', () => {
    const h = [1, 2, 5, 2, 1, 0, -3, 0, 1];
    const fx = findFenxing(h.map((value, i) => ({ h: value, l: value - 0.5, o: value, c: value, v: 1, dt: String(i), startDt: String(i), endDt: String(i), startIndex: i, endIndex: i })));
    expect(fx.map((f) => f.type)).toEqual(['top', 'bottom']);
    expect(buildBi(fx)[0]).toMatchObject({ direction: 'down', sp: 5, ep: -3.5 });
  });
  it('computes three-stroke pivot overlap', () => {
    const fx = [
      { idx: 0, type: 'bottom' as const, price: 1, dt: '1' }, { idx: 4, type: 'top' as const, price: 5, dt: '2' },
      { idx: 8, type: 'bottom' as const, price: 2, dt: '3' }, { idx: 12, type: 'top' as const, price: 4, dt: '4' },
      { idx: 16, type: 'bottom' as const, price: 2.5, dt: '5' }, { idx: 20, type: 'top' as const, price: 6, dt: '6' },
    ];
    expect(findZhongshu(buildBi(fx))[0]).toMatchObject({ zg: 4, zd: 2 });
  });
  it('produces a complete analysis without changing the raw candles', () => {
    const original = structuredClone(candles);
    const result = analyzeChan(candles)!;
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.candleCount).toBe(150);
    expect(result.observation).not.toBe('三买区(中枢上方)');
    expect(candles).toEqual(original);
  });
});

describe('momentum and resonance', () => {
  it('calculates fixed returns, ATR and volume ratio', () => {
    const result = analyzeMomentum(candles)!;
    expect(result.return20).toBeCloseTo((candles.at(-1)!.close / candles.at(-21)!.close - 1) * 100, 1);
    const averageVolume = (count: number) => candles.slice(-count).reduce((sum, candle) => sum + candle.volume, 0) / count;
    expect(result.volumeRatio).toBeCloseTo(averageVolume(5) / averageVolume(20), 2);
    expect(result.atrPercent).toBeGreaterThan(0);
  });
  it('returns stable tied percentile scores without input mutation', () => {
    const records = [{ raw: 2 }, { raw: 2 }, { raw: 3 }, { raw: 1 }];
    const result = crossSectionScores(records);
    expect([...result.values()]).toEqual([33.3, 33.3, 100, 0]);
    expect(records.map((r) => r.raw)).toEqual([2, 2, 3, 1]);
    expect(crossSectionScores([{ raw: 1 }]).values().next().value).toBe(0);
  });
  it('applies both thresholds and computes stable rank deltas', () => {
    const records = [95, 78, 77.9].map((score, index): AnalysisRecord => ({
      instrument: INSTRUMENT_MAP.get(['US:AAPL', 'HK:00700', 'CN:510300'][index])!,
      status: 'ready', chan: { ...analyzeChan(candles)!, score }, momentum: { ...analyzeMomentum(candles)!, raw: [100, 70, 69.5][index] },
      chanScore: null, momentumScore: null, resonance: null, quadrant: null, rank: null, rankDelta: null, snapshot: null, error: null, attempts: [],
    }));
    rankResonance(records, new Map(records.map((record) => [record.momentum!, [100, 70, 69.5][records.indexOf(record)]])));
    expect(records.map((r) => r.quadrant)).toEqual(['resonance', 'resonance', 'weak']);
    expect(records[0].resonance).toBe(97.5);
    applyRankChanges(records, [{ ...records[0], rank: 3 }]);
    expect(records[0].rankDelta).toBe(2);
    expect(records[1].rankDelta).toBeNull();
  });
});
