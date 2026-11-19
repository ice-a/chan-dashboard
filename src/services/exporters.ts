import type { AnalysisRecord, InstrumentDetail } from '../../shared/dashboard';
import type { SignalEvent } from './signalHistory';
import { MARKET_LABELS, PROVIDER_LABELS } from '../../shared/market';
import { QUADRANT_LABELS } from '../../shared/dashboard';

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

export function rankingCsv(records: AnalysisRecord[]): string {
  return toCsv(['标的ID', '代码', '名称', '市场', '类型', '排名', '象限', '缠论分', '动量分', '共振分', '20日收益%', '60日收益%', '120日收益%', '结构观察', '数据源', '复权', '行情日期', '接收时间', '盘中', '陈旧', '算法版本', '截面口径'], records.map((record) => [
    record.instrument.id, record.instrument.symbol, record.instrument.name, MARKET_LABELS[record.instrument.market], record.instrument.kind,
    record.rank, record.quadrant ? QUADRANT_LABELS[record.quadrant] : null, record.chanScore, record.momentumScore, record.resonance,
    record.momentum?.return20, record.momentum?.return60, record.momentum?.return120, record.chan?.observation,
    record.snapshot ? PROVIDER_LABELS[record.snapshot.provider] : null, record.snapshot?.adjustment, record.snapshot?.sourceDate, record.snapshot?.receivedAt,
    record.snapshot?.isUnclosed, record.snapshot?.stale, 'legacy-v1', '本轮全部有效标的；自选仅过滤显示',
  ]));
}

export function signalsCsv(events: SignalEvent[]): string {
  return toCsv(['标的ID', '分类', '变化', '原状态', '新状态', '象限', '排名', '行情日期', '记录时间', '观察性质'], events.map((event) => [event.instrumentId, event.category, event.summary, event.previous, event.current, QUADRANT_LABELS[event.quadrant], event.rank, event.sourceDate, event.observedAt, event.isUnclosed ? '盘中观察' : '日线观察']));
}

export function instrumentJson(record: AnalysisRecord, detail: InstrumentDetail): string {
  return JSON.stringify({ schemaVersion: 1, algorithmVersion: 'legacy-v1', exportedAt: new Date().toISOString(), coordinateNotice: '分型/笔使用合并K线索引；合并K线含原始起止索引；MACD基于合并收盘价。', record, detail }, null, 2);
}

export function download(content: string, filename: string, type: 'csv' | 'json'): void {
  const blob = new Blob([content], { type: type === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadRanking(records: AnalysisRecord[]): void { download(rankingCsv(records), `chan-ranking-${new Date().toISOString().slice(0, 10)}.csv`, 'csv'); }
export function downloadInstrument(record: AnalysisRecord, detail: InstrumentDetail): void { download(instrumentJson(record, detail), `${record.instrument.id.replace(':', '-')}-detail.json`, 'json'); }
export function downloadSignals(events: SignalEvent[]): void { download(signalsCsv(events), `chan-signals-${new Date().toISOString().slice(0, 10)}.csv`, 'csv'); }
