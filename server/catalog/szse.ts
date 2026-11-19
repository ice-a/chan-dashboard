import type { CatalogInstrument } from '../../shared/catalog.ts';
import type { CatalogAdapter, CatalogFetchContext, CatalogPart } from './types.ts';
import { assertCatalogPart, cleanText, fetchCatalogJson, record } from './types.ts';

export const szseCatalog: CatalogAdapter = {
  id: 'szse',
  async fetchCatalog(context: CatalogFetchContext): Promise<CatalogPart[]> {
    const parts: CatalogPart[] = [];
    for (const [catalogId, scope] of [['1110', '深圳主板及创业板A股'], ['1105', '深圳ETF']] as const) {
      const instruments: CatalogInstrument[] = [];
      let total = 0, pages = 0, pageCount = 1;
      do {
        const url = new URL(`https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=${catalogId}&TABKEY=tab1&PAGENO=${pages + 1}`);
        const root = await fetchCatalogJson(url, context, { referer: 'https://www.szse.cn/' });
        if (!Array.isArray(root)) throw new Error('深交所目录响应无效');
        const tab = root.map(record).find((item) => record(item.metadata).tabkey === 'tab1');
        if (!tab) throw new Error('深交所目录缺少A股/基金页');
        const metadata = record(tab.metadata);
        total = Number(metadata.recordcount);
        pageCount = Number(metadata.pagecount);
        const rows = Array.isArray(tab.data) ? tab.data : [];
        for (const row of rows) {
          const item = record(row);
          const symbol = cleanText(catalogId === '1110' ? item.agdm : item.sys_key);
          if (!/^\d{6}$/.test(symbol)) throw new Error('深交所目录证券代码无效');
          const kind = catalogId === '1105' ? cleanText(item.jjlb) : '';
          if (catalogId === '1105' && kind !== 'ETF') continue;
          instruments.push({ id: `CN:${symbol}`, symbol, name: cleanText(catalogId === '1110' ? item.agjc : item.jjjcurl), market: 'CN', kind: catalogId === '1105' ? 'etf' : 'stock', currency: 'CNY', exchange: 'SZSE', providers: { eastmoney: `0.${symbol}`, tencent: `sz${symbol}` }, listingStatus: 'listed', listedAt: cleanText(catalogId === '1110' ? item.agssrq : item.ssrq) || null, catalogSource: 'szse', catalogVersion: 'pending', mappingStatus: 'ready' });
        }
        pages++;
        if (!rows.length || pages > pageCount) throw new Error('深交所目录出现空页或分页异常');
      } while (pages < pageCount);
      const part = { source: 'szse' as const, market: 'CN' as const, scope, declaredTotal: total, fetchedCount: total, includedCount: instruments.length, excludedCount: total - instruments.length, pages, instruments };
      assertCatalogPart(part);
      if (!part.instruments.length) throw new Error(`${scope}目录为空`);
      parts.push(part);
    }
    return parts;
  },
};
