import type { CatalogInstrument } from '../../shared/catalog.ts';
import type { CatalogAdapter, CatalogFetchContext, CatalogPart } from './types.ts';
import { assertCatalogPart, cleanText, fetchCatalogJson, record } from './types.ts';

export const nasdaqCatalog: CatalogAdapter = {
  id: 'nasdaq',
  async fetchCatalog(context: CatalogFetchContext): Promise<CatalogPart[]> {
    const parts: CatalogPart[] = [];
    for (const [type, scope] of [['stocks', '美国主要交易所股票'], ['etf', '美国ETF目录']] as const) {
      const url = new URL(`https://api.nasdaq.com/api/screener/${type}?tableonly=true&limit=25&offset=0&download=true`);
      const root = record(await fetchCatalogJson(url, context));
      const data = record(root.data);
      const rowsValue: unknown[] = Array.isArray(data.rows) ? data.rows : Array.isArray(data.table) ? [] : record(data.data ?? data.table ?? {}).rows as unknown[];
      if (!Array.isArray(rowsValue) || !rowsValue.length) throw new Error('Nasdaq目录缺少记录');
      const total = Number(root.totalrecords ?? rowsValue.length);
      const instruments: CatalogInstrument[] = [];
      const excluded: string[] = [];
      for (const row of rowsValue) {
        const item = record(row);
        const symbol = cleanText(item.symbol).toUpperCase().replace(/\s+/g, '');
        const name = cleanText(type === 'stocks' ? item.name : item.companyName);
        if (!/^[A-Z0-9][A-Z0-9./^-]{0,19}$/.test(symbol) || !name) throw new Error('Nasdaq目录证券代码无效');
        if (type === 'etf') { instruments.push(makeEtf(symbol, name, item)); continue; }
        if (!isCommonEquity(name) || symbol.includes('^') || symbol.includes('/')) { excluded.push(symbol); continue; }
        instruments.push(makeStock(symbol, name, item));
      }
      const part = { source: 'nasdaq' as const, market: 'US' as const, scope, declaredTotal: total, fetchedCount: rowsValue.length, includedCount: instruments.length, excludedCount: excluded.length, pages: 1, instruments };
      assertCatalogPart(part); parts.push(part);
    }
    return parts;
  },
};

function baseInstrument(symbol: string, name: string, item: Record<string, unknown>, kind: 'stock' | 'etf'): CatalogInstrument {
  return { id: `US:${symbol}`, symbol, name, market: 'US', kind, currency: 'USD', exchange: 'US_MAIN', providers: { nasdaq: symbol }, listingStatus: 'listed', listedAt: cleanText(item.ipoyear) || null, catalogSource: 'nasdaq', catalogVersion: 'pending', mappingStatus: 'ready' };
}
function makeStock(symbol: string, name: string, item: Record<string, unknown>): CatalogInstrument { return baseInstrument(symbol, name, item, 'stock'); }
function makeEtf(symbol: string, name: string, item: Record<string, unknown>): CatalogInstrument { return baseInstrument(symbol, name, item, 'etf'); }

function isCommonEquity(name: string): boolean {
  return !/\b(warrant|warrants|right|rights|unit|units|preferred|preference|depositary shares each representing|notes|debentures|bond|baby bond)\b/i.test(name);
}
