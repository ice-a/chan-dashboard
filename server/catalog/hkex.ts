import type { CatalogInstrument } from '../../shared/catalog.ts';
import type { CatalogAdapter, CatalogFetchContext, CatalogPart } from './types.ts';

export const hkexCatalog: CatalogAdapter = {
  id: 'hkex',
  async fetchCatalog(context: CatalogFetchContext): Promise<CatalogPart[]> {
    const response = await context.fetch('https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx', { signal: AbortSignal.timeout(context.timeoutMs) });
    if (!response.ok) throw new Error(`港交所目录HTTP ${response.status}`);
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false });
    const instruments: CatalogInstrument[] = [];
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const symbol = String(row[0] ?? '').trim().padStart(5, '0');
      const name = String(row[1] ?? '').trim();
      const category = String(row[2] ?? '').trim();
      const subCategory = String(row[3] ?? '').trim();
      if (!/^\d{5}$/.test(symbol) || !name || category !== 'Equity' || subCategory !== 'Equity Securities (Main Board)') continue;
      instruments.push({ id: `HK:${symbol}`, symbol, name, market: 'HK', kind: 'stock', currency: 'HKD', exchange: 'HKEX', providers: { eastmoney: `116.${symbol}`, tencent: `hk${symbol}` }, listingStatus: 'listed', listedAt: null, catalogSource: 'hkex', catalogVersion: 'pending', mappingStatus: 'ready' });
    }
    if (!instruments.length) throw new Error('港交所目录未解析出有效普通股或ETF');
    return [{ source: 'hkex', market: 'HK', scope: '港交所主板普通股（ETF独立目录待补）', declaredTotal: instruments.length, fetchedCount: rows.length, includedCount: instruments.length, pages: 1, instruments, sourceDate: response.headers.get('last-modified') }];
  },
};
