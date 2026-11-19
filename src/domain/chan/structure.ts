import type { Candle } from '../../../shared/market.ts';

export interface MergedBar {
  dt: string;
  h: number;
  l: number;
  o: number;
  c: number;
  v: number;
  startDt: string;
  endDt: string;
  startIndex: number;
  endIndex: number;
}

export function processContain(bars: Candle[]): MergedBar[] {
  if (!bars.length) return [];
  const mapped = (bar: Candle, index: number): MergedBar => ({ dt: bar.date, h: bar.high, l: bar.low, o: bar.open, c: bar.close, v: bar.volume, startDt: bar.date, endDt: bar.date, startIndex: index, endIndex: index });
  const output: MergedBar[] = [mapped(bars[0], 0)];
  for (let i = 1; i < bars.length; i++) {
    const k = mapped(bars[i], i);
    const last = output.at(-1)!;
    const contain = (k.h >= last.h && k.l <= last.l) || (k.h <= last.h && k.l >= last.l);
    if (contain) {
      if (last.c >= last.o) { last.h = Math.max(last.h, k.h); last.l = Math.max(last.l, k.l); }
      else { last.h = Math.min(last.h, k.h); last.l = Math.min(last.l, k.l); }
      last.dt = k.dt;
      last.endDt = k.endDt;
      last.endIndex = k.endIndex;
      last.v += k.v;
    } else output.push(k);
  }
  return output;
}

export interface Fractal { idx: number; type: 'top' | 'bottom'; price: number; dt: string }
export interface Stroke { si: number; ei: number; sp: number; ep: number; direction: 'up' | 'down'; sdt: string; edt: string }
export interface Pivot { zg: number; zd: number; start: number; end: number; sdt: string; edt: string; nbi: number }

export function findFenxing(bars: MergedBar[]): Fractal[] {
  const result: Fractal[] = [];
  for (let i = 1; i < bars.length - 1; i++) {
    const a = bars[i - 1], b = bars[i], c = bars[i + 1];
    if (b.h > a.h && b.h > c.h && b.l > a.l && b.l > c.l) result.push({ idx: i, type: 'top', price: b.h, dt: b.dt });
    else if (b.l < a.l && b.l < c.l && b.h < a.h && b.h < c.h) result.push({ idx: i, type: 'bottom', price: b.l, dt: b.dt });
  }
  return result;
}

export function buildBi(fx: Fractal[]): Stroke[] {
  const strokes: Stroke[] = [];
  if (fx.length < 2) return strokes;
  let anchor = fx[0];
  for (let i = 1; i < fx.length; i++) {
    const f = fx[i];
    if (f.type === anchor.type) {
      if ((f.type === 'bottom' && f.price < anchor.price) || (f.type === 'top' && f.price > anchor.price)) anchor = f;
      continue;
    }
    if (f.idx - anchor.idx >= 4) {
      strokes.push({ si: anchor.idx, ei: f.idx, sp: anchor.price, ep: f.price, direction: anchor.type === 'bottom' ? 'up' : 'down', sdt: anchor.dt, edt: f.dt });
      anchor = f;
    }
  }
  return strokes;
}

export function findZhongshu(bis: Stroke[]): Pivot[] {
  const pivots: Pivot[] = [];
  let i = 0;
  while (i + 2 < bis.length) {
    const three = bis.slice(i, i + 3);
    const zg = Math.min(...three.map((b) => Math.max(b.sp, b.ep)));
    const zd = Math.max(...three.map((b) => Math.min(b.sp, b.ep)));
    if (zg > zd) {
      let j = i + 3;
      while (j < bis.length) {
        const b = bis[j];
        if (Math.max(b.sp, b.ep) >= zd && Math.min(b.sp, b.ep) <= zg) j++;
        else break;
      }
      pivots.push({ zg, zd, start: i, end: j - 1, sdt: bis[i].sdt, edt: bis[j - 1].edt, nbi: j - i });
      i = j;
    } else i++;
  }
  return pivots;
}

export function biArea(bi: Stroke, hist: number[]): number {
  return hist.slice(bi.si, bi.ei + 1).reduce((sum, value) => {
    if (bi.direction === 'up' && value > 0) return sum + value;
    if (bi.direction === 'down' && value < 0) return sum - value;
    return sum;
  }, 0);
}
