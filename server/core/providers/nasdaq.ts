import type { Instrument } from '../../../shared/market.ts';
import { asRecord, assertSymbol, fetchJson, isUnclosedDaily, normalizeCandles } from '../marketValidation.ts';
import { providerError } from './types.ts';
import type { MarketProvider, ProviderContext } from './types.ts';

export const nasdaqProvider: MarketProvider = {
  id: 'nasdaq',
  name: 'Nasdaq',
  async fetchDaily(instrument: Instrument, context: ProviderContext) {
    if (instrument.market !== 'US') throw providerError(this.id, 'unsupported_market', '仅支持美股历史日线');
    return context.runLimited(this.id, async () => {
      const now = new Date();
      const start = new Date(now.getTime() - 650 * 86400_000);
      const format = (date: Date) => date.toISOString().slice(0, 10);
      const params = new URLSearchParams({ assetclass: instrument.kind === 'etf' ? 'etf' : 'stocks', fromdate: format(start), todate: format(now), limit: '300' });
      const url = new URL(`https://api.nasdaq.com/api/quote/${encodeURIComponent(instrument.symbol)}/historical?${params}`);
      const root = asRecord(await fetchJson(url, this.id, context.fetch, context.timeoutMs, context.signal), this.id);
      const data = asRecord(root.data, this.id);
      assertSymbol(instrument, data.symbol, this.id);
      const table = asRecord(data.tradesTable, this.id);
      if (!Array.isArray(table.rows)) throw providerError(this.id, 'invalid_response', '未返回历史日线数组');
      const rows = table.rows.map((row) => {
        const record = asRecord(row, this.id);
        const match = typeof record.date === 'string' ? record.date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/) : null;
        if (!match) throw providerError(this.id, 'invalid_response', '历史日线日期无效');
        const number = (value: unknown) => typeof value === 'string' ? value.replace(/[$,]/g, '') : value;
        return [`${match[3]}-${match[1]}-${match[2]}`, number(record.open), number(record.close), number(record.high), number(record.low), number(record.volume)];
      });
      const candles = normalizeCandles(rows, this.id);
      return { candles, isUnclosed: isUnclosedDaily(instrument, candles.at(-1)!.date), adjustment: 'split' };
    });
  },
};
