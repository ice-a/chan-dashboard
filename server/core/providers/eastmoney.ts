import type { Instrument } from '../../../shared/market.ts';
import { asRecord, assertSymbol, fetchJson, isUnclosedDaily, normalizeCandles } from '../marketValidation.ts';
import type { MarketProvider, ProviderContext } from './types.ts';

export const eastmoneyProvider: MarketProvider = {
  id: 'eastmoney',
  name: '东方财富',
  async fetchDaily(instrument: Instrument, context: ProviderContext) {
    return context.runLimited(this.id, async () => {
      const code = instrument.providers.eastmoney;
      if (!code) throw new Error('未配置东方财富证券代码');
      const params = new URLSearchParams({
        secid: code,
        fields1: 'f1,f2,f3,f4,f5,f6',
        fields2: 'f51,f52,f53,f54,f55,f56',
        klt: '101', fqt: '1', beg: '0', end: '20500101', lmt: '300',
      });
      const url = new URL(`https://push2his.eastmoney.com/api/qt/stock/kline/get?${params}`);
      const root = asRecord(await fetchJson(url, this.id, context.fetch, context.timeoutMs, context.signal), this.id);
      const data = asRecord(root.data, this.id);
      assertSymbol(instrument, data.code, this.id);
      if (!Array.isArray(data.klines)) throw new Error('东方财富未返回K线数组');
      const rows = data.klines.map((line) => typeof line === 'string' ? line.split(',') : line);
      const candles = normalizeCandles(rows, this.id);
      return { candles, isUnclosed: isUnclosedDaily(instrument, candles.at(-1)!.date), adjustment: 'qfq' };
    });
  },
};
