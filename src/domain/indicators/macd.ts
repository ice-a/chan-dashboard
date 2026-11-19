export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result = [values[0]];
  for (let i = 1; i < values.length; i++) result.push(result[i - 1] * (1 - k) + values[i] * k);
  return result;
}

export interface MacdSeries { dif: number[]; dea: number[]; hist: number[] }

export function macd(closes: number[]): MacdSeries {
  if (closes.length < 35) return { dif: closes.map(() => 0), dea: closes.map(() => 0), hist: closes.map(() => 0) };
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const dif = fast.map((value, i) => value - slow[i]);
  const dea = ema(dif, 9);
  return { dif, dea, hist: dif.map((value, i) => (value - dea[i]) * 2) };
}
