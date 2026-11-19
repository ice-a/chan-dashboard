import type { Candle } from '../../../shared/market.ts';
import type { MergedBar, Fractal, Stroke, Pivot } from './structure.ts';
import type { MacdSeries } from '../indicators/macd.ts';
import { processContain, findFenxing, buildBi, findZhongshu } from './structure.ts';
import { macd } from '../indicators/macd.ts';

export interface ChanStructure {
  merged: MergedBar[];
  fractals: Fractal[];
  strokes: Stroke[];
  pivots: Pivot[];
  macd: MacdSeries;
  coordinate: 'merged-bar-index';
  macdBasis: 'merged-close';
}

/** One shared structure for both the legacy score and the research chart. */
export function buildChanStructure(candles: Candle[]): ChanStructure {
  const merged = processContain(candles);
  const fractals = findFenxing(merged);
  const strokes = buildBi(fractals);
  const pivots = findZhongshu(strokes);
  return { merged, fractals, strokes, pivots, macd: macd(merged.map((bar) => bar.c)), coordinate: 'merged-bar-index', macdBasis: 'merged-close' };
}
