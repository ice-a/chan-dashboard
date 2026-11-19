import type { CatalogInstrument, CatalogSourceReport } from './catalog';

/** Official HKEX workbook row shape: [Stock Code, Name, Category, Sub-Category, ...]. */
export function parseHkexWorkbookRows(rows: unknown[][]): CatalogInstrument[] {
  const instruments: CatalogInstrument[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const symbol = String(row[0] ?? '').trim().padStart(5, '0');
    const name = String(row[1] ?? '').trim();
    const category = String(row[2] ?? '').trim();
    const subCategory = String(row[3] ?? '').trim();
    if (!/^\d{5}$/.test(symbol) || !name) continue;
    if (category !== 'Equity' || subCategory !== 'Equity Securities (Main Board)') continue;
    instruments.push({
      id: `HK:${symbol}`, symbol, name, market: 'HK', kind: 'stock', currency: 'HKD',
      exchange: 'HKEX', providers: { eastmoney: `116.${symbol}`, tencent: `hk${symbol}` },
      listingStatus: 'listed', listedAt: null, catalogSource: 'hkex', catalogVersion: 'pending', mappingStatus: 'ready',
    });
  }
  if (!instruments.length) throw new Error('港交所目录未解析出有效主板普通股');
  // The official workbook lists thousands of main-board equities; a handful of
  // rows means the download was truncated on this network.
  if (instruments.length < 1000) throw new Error(`港交所工作簿疑似下载不完整（仅 ${instruments.length} 条主板普通股）`);
  return instruments;
}

export function hkexReport(instruments: CatalogInstrument[], fetchedCount: number, sourceDate: string | null): CatalogSourceReport {
  return {
    source: 'hkex', market: 'HK', scope: '港交所主板普通股（ETF独立目录待补）',
    status: 'complete', declaredTotal: instruments.length, fetchedCount,
    includedCount: instruments.length, excludedCount: Math.max(0, fetchedCount - instruments.length),
    pages: 1, sourceDate,
  };
}
