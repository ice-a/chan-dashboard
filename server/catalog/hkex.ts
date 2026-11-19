import type { CatalogAdapter, CatalogFetchContext, CatalogPart } from './types.ts';
import { parseHkexWorkbookRows } from '../../shared/hkexWorkbook.ts';

export const hkexCatalog: CatalogAdapter = {
  id: 'hkex',
  async fetchCatalog(context: CatalogFetchContext): Promise<CatalogPart[]> {
    const response = await context.fetch('https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx', { signal: AbortSignal.timeout(context.timeoutMs) });
    if (!response.ok) throw new Error(`港交所目录HTTP ${response.status}`);
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false });
    // Shared parser applies the truncation guard (≥1000 main-board equities).
    const instruments = parseHkexWorkbookRows(rows);
    return [{ source: 'hkex', market: 'HK', scope: '港交所主板普通股（ETF独立目录待补）', declaredTotal: instruments.length, fetchedCount: rows.length, includedCount: instruments.length, pages: 1, instruments, sourceDate: response.headers.get('last-modified') }];
  },
};
