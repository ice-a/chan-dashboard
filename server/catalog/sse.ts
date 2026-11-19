import type { CatalogInstrument } from '../../shared/catalog.ts';
import type { CatalogAdapter, CatalogFetchContext, CatalogPart } from './types.ts';
import { assertCatalogPart, cleanText, fetchCatalogJson, record } from './types.ts';

export const sseCatalog: CatalogAdapter = {
  id: 'sse',
  async fetchCatalog(context: CatalogFetchContext): Promise<CatalogPart[]> {
    const parts: CatalogPart[] = [];
    for (const [stockType, scope] of [['1', '上海主板A股'], ['8', '科创板']] as const) {
      const instruments: CatalogInstrument[] = [];
      let total = 0, pages = 0;
      do {
        const params = new URLSearchParams({ isPagination: 'true', stockCode: '', csrcCode: '', areaName: '', stockType, 'pageHelp.pageSize': '100', 'pageHelp.pageNo': String(pages + 1), 'pageHelp.beginPage': String(pages + 1), 'pageHelp.cacheSize': '1', 'pageHelp.endPage': String(pages + 1) });
        const root = record(await fetchCatalogJson(new URL(`https://query.sse.com.cn/security/stock/getStockListData2.do?${params}`), context, { referer: 'https://www.sse.com.cn/' }));
        const page = record(root.pageHelp);
        total = Number(page.total);
        const rows = Array.isArray(root.result) ? root.result : [];
        for (const row of rows) {
          const item = record(row);
          const symbol = cleanText(item.SECURITY_CODE_A);
          if (!/^\d{6}$/.test(symbol)) throw new Error('上交所目录证券代码无效');
          instruments.push({ id: `CN:${symbol}`, symbol, name: cleanText(item.SECURITY_ABBR_A), market: 'CN', kind: 'stock', currency: 'CNY', exchange: stockType === '1' ? 'SSE' : 'STAR', providers: { eastmoney: `1.${symbol}`, tencent: `sh${symbol}` }, listingStatus: 'listed', listedAt: cleanText(item.LISTING_DATE) || null, catalogSource: 'sse', catalogVersion: 'pending', mappingStatus: 'ready' });
        }
        pages++;
        if (!rows.length || pages > Math.ceil(total / 100) + 1) throw new Error('上交所目录出现空页或分页异常');
      } while (instruments.length < total);
      const part = { source: 'sse' as const, market: 'CN' as const, scope, declaredTotal: total, fetchedCount: instruments.length, pages, instruments };
      assertCatalogPart(part); parts.push(part);
    }
    return parts;
  },
};
