import type { Candle } from '../../../shared/market.ts';
import type { ChanAnalysis } from '../../../shared/dashboard.ts';
import { biArea } from './structure.ts';
import { buildChanStructure } from './detail.ts';
import type { ChanStructure } from './detail.ts';

const BASE: Record<string, number> = {
  '一买候选(底背驰)': 88, '二买候选(回踩不破前低)': 80, '二买/回升初段': 74,
  '三买区(中枢上方)': 70, '三买后留意顶背驰': 55, '中枢震荡/无明确信号': 45,
  '回调中(二买观察)': 50, '中枢下方(弱势)': 25, '一卖候选(顶背驰)': 15, '数据不足/笔未成形': 30,
};

/** Preserve the original dashboard's scoring as a labelled, testable algorithm version. */
export function analyzeChan(rows: Candle[], structure?: ChanStructure): ChanAnalysis | null {
  if (rows.length < 130) return null;
  const { fractals: fx, strokes: bis, pivots, macd: { dif, hist } } = structure ?? buildChanStructure(rows);
  const lastClose = rows.at(-1)!.close;
  const chg20 = (lastClose / rows.at(-21)!.close - 1) * 100;
  const result = {
    observation: '中枢震荡/无明确信号', legacyPoint: '中枢震荡/无明确信号', direction: null as 'up' | 'down' | null,
    divergence: '—', reason: '有效笔不足，结构尚未清晰', pivotHigh: null as number | null, pivotLow: null as number | null,
    lastBiRange: null as [number, number] | null, area: null as number | null,
    candleCount: rows.length, fractalCount: fx.length, strokeCount: bis.length, pivotCount: pivots.length,
  };
  if (bis.length < 2) {
    result.legacyPoint = '数据不足/笔未成形';
    result.observation = '有效笔不足，等待结构形成';
    return { ...result, score: refine(result.legacyPoint, result.direction, chg20, lastClose, null) };
  }
  const lastBi = bis.at(-1)!;
  result.direction = lastBi.direction;
  const previous = bis.slice(0, -1).reverse().find((b) => b.direction === lastBi.direction);
  const area = biArea(lastBi, hist);
  result.area = round(area);
  if (previous) {
    const previousArea = biArea(previous, hist);
    if (lastBi.direction === 'down' && lastBi.ep < previous.ep && area < previousArea * 0.9 && area > 0) result.divergence = '底背驰(力度减弱)';
    if (lastBi.direction === 'up' && lastBi.ep > previous.ep && area < previousArea * 0.9 && area > 0) result.divergence = '顶背驰(力度减弱)';
  }
  const pivot = pivots.at(-1);
  const zg = pivot?.zg ?? null;
  const zd = pivot?.zd ?? null;
  result.pivotHigh = zg === null ? null : round(zg, 3);
  result.pivotLow = zd === null ? null : round(zd, 3);
  const difPositive = dif.at(-1)! >= 0;
  let point = '中枢震荡/无明确信号';
  let reason = '';
  if (pivot && zg !== null && lastClose > zg) {
    point = '三买区(中枢上方)';
    reason = `收盘价位于最近笔中枢上沿 ${zg.toFixed(2)} 上方，属于趋势延续观察状态，不等同于已确认三买`;
    if (result.divergence.startsWith('顶背驰')) { point = '三买后留意顶背驰'; reason = '位于中枢上方但末段上涨力度减弱，需关注回撤风险'; }
  } else if (pivot && zd !== null && lastClose < zd) {
    point = '中枢下方(弱势)';
    reason = `收盘价位于最近笔中枢下沿 ${zd.toFixed(2)} 下方，结构偏弱`;
    if (result.divergence.startsWith('底背驰')) { point = '一买候选(底背驰)'; reason = '相邻同向下跌笔创新低但MACD力度减弱，仅为背驰观察'; }
  } else if (result.divergence.startsWith('底背驰') && lastBi.direction === 'down') {
    point = '一买候选(底背驰)'; reason = '下跌段出现相邻同向笔MACD力度减弱，等待进一步结构确认';
  } else if (result.divergence.startsWith('顶背驰') && lastBi.direction === 'up') {
    point = '一卖候选(顶背驰)'; reason = '上涨段出现相邻同向笔MACD力度减弱，注意回撤风险';
  } else if (lastBi.direction === 'up' && difPositive) {
    point = '二买/回升初段'; reason = '末笔向上且DIF位于零轴上方，为回升观察状态';
  } else if (lastBi.direction === 'down') {
    point = '回调中(二买观察)'; reason = '末笔向下回调，等待底分型及低点结构确认';
  }
  if (lastBi.direction === 'down' && bis.length >= 3) {
    const previousDown = bis.slice(0, -1).reverse().find((b) => b.direction === 'down');
    if (previousDown && lastBi.ep > previousDown.ep && !result.divergence.startsWith('底背驰') && point.startsWith('回调')) {
      point = '二买候选(回踩不破前低)'; reason = `回调低点 ${lastBi.ep.toFixed(2)} 高于前低 ${previousDown.ep.toFixed(2)}，为回踩观察状态`;
    }
  }
  result.legacyPoint = point;
  result.observation = point === '三买区(中枢上方)' ? '中枢上方 / 趋势延续观察' : point;
  result.reason = reason;
  result.lastBiRange = [round(lastBi.sp, 3), round(lastBi.ep, 3)];
  return { ...result, score: refine(point, result.direction, chg20, lastClose, zg) };
}

function refine(point: string, direction: 'up' | 'down' | null, change20: number, close: number, zg: number | null): number {
  let score = BASE[point] ?? 45;
  if (direction === 'up') score += 6;
  if (direction === 'down') score -= 4;
  if (change20 >= 5 && change20 <= 15) score += 3;
  else if (change20 >= 0 && change20 < 5) score += 1;
  else if (change20 < -10) score -= 5;
  if (change20 > 20) score -= 3;
  if (zg && close > zg) {
    const deviation = (close / zg - 1) * 100;
    if (deviation <= 8) score += 4;
    else if (deviation <= 20) score += 1;
    else score -= 4;
  }
  return round(Math.max(0, Math.min(100, score)), 1);
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
