import type { Instrument } from '../../../shared/market.ts';
import { asRecord, assertSymbol, fetchJson, isUnclosedDaily, normalizeCandles } from '../marketValidation.ts';
import { providerError } from './types.ts';
import type { MarketProvider, ProviderContext } from './types.ts';

export const tencentProvider: MarketProvider = {
  id: 'tencent',
  name: '腾讯行情',
  async fetchDaily(instrument: Instrument, context: ProviderContext) {
    return context.runLimited(this.id, async () => {
      const code = instrument.providers.tencent;
      if (!code) throw new Error('未配置腾讯证券代码');
      const url = new URL(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,,,300,qfq`);
      const root = asRecord(await fetchJson(url, this.id, context.fetch, context.timeoutMs, context.signal), this.id);
      const data = asRecord(asRecord(root.data, this.id)[code], this.id);
      const rows = instrument.market === 'CN' ? data.qfqday : data.day;
      if (!Array.isArray(rows)) throw providerError(this.id, 'invalid_response', '未返回预期日线数组');
      const candles = normalizeCandles(rows, this.id);
      const qt = asRecord(data.qt, this.id);
      const quote = qt[code];
      if (Array.isArray(quote)) assertSymbol(instrument, quote[2]?.toString().split('.')[0], this.id);
      const market = Array.isArray(quote) ? qt.market : undefined;
      return { candles, isUnclosed: isUnclosedDaily(instrument, candles.at(-1)!.date, Array.isArray(market) && typeof market[0] === 'string' ? market[0] : undefined), adjustment: 'qfq' };
    });
  },
};
