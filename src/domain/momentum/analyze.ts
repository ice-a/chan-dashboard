import type { Candle } from '../../../shared/market.ts';
import type { MomentumAnalysis } from '../../../shared/dashboard.ts';

export function analyzeMomentum(rows: Candle[]): MomentumAnalysis | null {
  if (rows.length < 130) return null;
  const closes = rows.map((r) => r.close);
  const n = rows.length;
  const last = closes[n - 1];
  const ret = (k: number) => (last / closes[n - 1 - k] - 1) * 100;
  const ma = (k: number) => closes.slice(-k).reduce((a, b) => a + b, 0) / k;
  const return20 = ret(20), return60 = ret(60), return120 = ret(120);
  const ma20 = ma(20), ma60 = ma(60), ma120 = ma(120);
  const deviation20 = (last / ma20 - 1) * 100, deviation60 = (last / ma60 - 1) * 100;
  const maAlignment = Number(ma20 > ma60) + Number(ma60 > ma120);
  const trueRanges = rows.slice(-14).map((row, i, slice) => {
    const index = n - slice.length + i;
    const previousClose = rows[index - 1].close;
    return Math.max(row.high - row.low, Math.abs(row.high - previousClose), Math.abs(row.low - previousClose));
  });
  const atr = trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
  const atrPercent = atr / last * 100;
  const averageVolume = (k: number) => rows.slice(-k).reduce((sum, row) => sum + row.volume, 0) / k;
  const volumeRatio = averageVolume(5) / averageVolume(20);
  const riskAdjustedMomentum = atrPercent > 0 ? return60 / atrPercent : 0;
  const raw = 0.30 * return20 + 0.40 * return60 + 0.30 * return120
    + 0.5 * deviation20 + 0.3 * deviation60 + 4.0 * maAlignment
    + 0.8 * riskAdjustedMomentum + 3.0 * (volumeRatio - 1);
  return {
    raw: round(raw, 3), return20: round(return20, 2), return60: round(return60, 2), return120: round(return120, 2),
    deviation20: round(deviation20, 2), deviation60: round(deviation60, 2), maAlignment,
    atrPercent: round(atrPercent, 2), volumeRatio: round(volumeRatio, 2), riskAdjustedMomentum: round(riskAdjustedMomentum, 2), last: round(last, 3),
  };
}

export function crossSectionScores<T extends { raw: number }>(records: T[]): Map<T, number> {
  const sorted = records.map((record) => record.raw).sort((a, b) => a - b);
  return new Map(records.map((record) => {
    let low = 0, high = sorted.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (sorted[middle] < record.raw) low = middle + 1;
      else high = middle;
    }
    return [record, Math.round(low / Math.max(1, sorted.length - 1) * 1000) / 10];
  }));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
