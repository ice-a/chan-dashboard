import { computed, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';import { INSTRUMENTS } from '../config/instruments';
import { fetchMarketData, errorMessage } from '../services/marketApi';
import { applyRankChanges, computeAsset, rankResonance } from '../domain/resonance';
import type { AnalysisRecord, DashboardSummary, InstrumentDetail } from '../../shared/dashboard';
import type { ProviderStatus } from '../../shared/market';
import { useHistoryStore } from './history';

export const useDashboardStore = defineStore('dashboard', () => {
  const records = shallowRef<AnalysisRecord[]>([]);
  const details = new Map<string, InstrumentDetail>();
  const loading = ref(false);
  const completed = ref(0);
  const refreshError = ref('');
  const nextRefreshAt = ref<number | null>(null);
  const autoRefresh = ref(true);
  const frequencySeconds = ref(300);
  const online = ref(navigator.onLine);
  const providers = ref<ProviderStatus[]>([]);
  let generation = 0;
  let activeController: AbortController | undefined;

  const snapshotLoading = ref(false);
  /** Load the latest server-published full-market snapshot into the UI. */
  async function loadSnapshotPage(pageSize = 500): Promise<number> {
    snapshotLoading.value = true;
    try {
      const items: AnalysisRecord[] = [];
      let cursor: string | null = null;
      let total = 0;
      do {
        const requestUrl = `/api/snapshots/current/rankings?limit=${pageSize}${cursor ? `&cursor=${cursor}` : ''}`;
        const body = await fetch(requestUrl).then((r) => r.json()) as { ok: boolean; page: { items: AnalysisRecord[]; total: number; nextCursor: string | null } };
        if (!body.ok) break;
        items.push(...body.page.items);
        total = body.page.total;
        cursor = body.page.nextCursor;
        // Publish progressively so the ranking table fills in while later pages stream.
        records.value = [...items];
      } while (cursor);
      if (items.length) details.clear();
      return total;
    } finally { snapshotLoading.value = false; }
  }

  async function loadInstrumentDetail(id: string): Promise<InstrumentDetail | null> {
    const body = await fetch(`/api/snapshots/current/instruments/${encodeURIComponent(id)}/detail`).then((r) => r.json());
    return body.detail ?? null;
  }

  const summary = computed<DashboardSummary>(() => {
    const ready = records.value.filter((record) => record.status === 'ready');
    const times = ready.map((r) => r.snapshot!.receivedAt).sort();
    const dates = ready.map((r) => r.snapshot!.sourceDate).sort();
    return {
      total: ready.length, ready: ready.length,
      stale: ready.filter((r) => r.snapshot!.stale).length,
      failed: records.value.filter((r) => r.status === 'unavailable').length,
      sampleSize: ready.filter((r) => !r.snapshot!.stale).length,
      lastSuccessAt: times.at(-1) ?? null, latestMarketDate: dates.at(-1) ?? null, algorithmVersion: 'legacy-v1',
    };
  });

  async function refresh(manual = false): Promise<void> {
    if (loading.value) {
      if (!manual) return;
      activeController?.abort();
    }
    const current = ++generation;
    const currentController = new AbortController();
    activeController = currentController;
    loading.value = true;
    refreshError.value = '';
    completed.value = 0;
    const previous = records.value;
    const results: AnalysisRecord[] = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < INSTRUMENTS.length) {
        const index = cursor++;
        const instrument = INSTRUMENTS[index];
        try {
          const response = await fetchMarketData(instrument.id, currentController.signal);
          if (response.ok) {
            const asset = computeAsset(response.data.candles);
            const { candles: _candles, instrument: _instrument, ...metadata } = response.data;
            if (asset) {
              results[index] = {
                instrument, status: 'ready', chan: asset.chan, momentum: asset.momentum,
                chanScore: null, momentumScore: null, resonance: null, quadrant: null, rank: null, rankDelta: null,
                snapshot: { ...metadata, candleCount: response.data.candles.length }, attempts: response.data.attempts, error: null,
              };
              details.set(instrument.id, { candles: response.data.candles, structure: asset.structure, snapshot: results[index].snapshot! });
            } else results[index] = unavailable(instrument, '有效历史K线不足130根', []);
          } else results[index] = previous[index]?.status === 'ready'
            ? { ...previous[index], error: errorMessage(response), attempts: response.error.attempts, snapshot: previous[index].snapshot ? { ...previous[index].snapshot!, stale: true } : null }
            : unavailable(instrument, errorMessage(response), response.error.attempts);
          if (!response.ok && previous[index]?.status === 'ready' && results[index].snapshot) details.get(instrument.id)!.snapshot = results[index].snapshot;
        } catch (error) {
          if (currentController.signal.aborted) return;
          const message = error instanceof Error ? error.message : '网络请求失败';
          results[index] = previous[index]?.status === 'ready' ? { ...previous[index], error: message, snapshot: previous[index].snapshot ? { ...previous[index].snapshot!, stale: true } : null } : unavailable(instrument, message, []);
          if (previous[index]?.status === 'ready' && results[index].snapshot) details.get(instrument.id)!.snapshot = results[index].snapshot;
        } finally {
          if (generation === current && !currentController.signal.aborted) completed.value++;
        }
      }
    };
    try {
      await Promise.all(Array.from({ length: 6 }, worker));
      if (generation !== current || currentController.signal.aborted) return;
      const complete = results.filter(Boolean);
      rankResonance(complete);
      applyRankChanges(complete, previous);
      records.value = complete;
      if (complete.some((r) => r.status === 'ready')) useHistoryStore().capture(complete);
      nextRefreshAt.value = Date.now() + frequencySeconds.value * 1000;
      if (!complete.some((r) => r.status === 'ready')) refreshError.value = '本轮未取得有效行情。可打开“数据诊断”检查各数据源状态。';
    } catch (error) {
      if (generation === current) refreshError.value = error instanceof Error ? error.message : '刷新失败，请稍后重试';
    } finally {
      if (generation === current) { loading.value = false; nextRefreshAt.value = Date.now() + frequencySeconds.value * 1000; }
    }
  }

  function cancel(): void {
    if (!loading.value) return;
    generation++;
    activeController?.abort();
    activeController = undefined;
    loading.value = false;
    nextRefreshAt.value = Date.now() + frequencySeconds.value * 1000;
  }

  async function loadProviders(): Promise<void> {
    try {
      const response = await fetch('/api/market/providers');
      const body = await response.json() as { providers: ProviderStatus[] };
      providers.value = body.providers;
    } catch { /* Individual market errors are shown in diagnostics. */ }
  }

  function getDetail(id: string): InstrumentDetail | undefined { return details.get(id); }
  function getRecord(id: string | null): AnalysisRecord | null { return id ? records.value.find((record) => record.instrument.id === id) ?? null : null; }

  return { records, loading, completed, refreshError, nextRefreshAt, autoRefresh, frequencySeconds, online, providers, summary, snapshotLoading, refresh, cancel, loadProviders, getDetail, getRecord, loadSnapshotPage, loadInstrumentDetail };
});

function unavailable(instrument: AnalysisRecord['instrument'], error: string, attempts: AnalysisRecord['attempts']): AnalysisRecord {
  return { instrument, status: 'unavailable', chan: null, momentum: null, snapshot: null, chanScore: null, momentumScore: null, resonance: null, quadrant: null, rank: null, rankDelta: null, error, attempts };
}
