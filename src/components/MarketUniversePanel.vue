<template>
  <section aria-labelledby="market-title">
    <div class="section-heading"><div><span class="section-index">00</span><h2 id="market-title">全市场目录与扫描</h2></div><span>目录完整、每只有终态、失败可重试</span></div>
    <div class="panel market-panel">
      <div class="market-toolbar">
        <div class="market-stats" v-if="summary">
          <div class="market-stat"><span>目录版本</span><strong :class="{ ok: summary.complete, warn: !summary.complete }">{{ summary.complete ? '完整' : '未封口' }}<small>{{ summary.version?.slice(0, 8) }}</small></strong></div>
          <div class="market-stat"><span>标的总数</span><strong>{{ summary.total.toLocaleString() }}</strong></div>
          <div class="market-stat"><span>A股</span><strong>{{ summary.markets.CN.total.toLocaleString() }}<small>{{ summary.markets.CN.stocks.toLocaleString() }} 股 + {{ summary.markets.CN.etfs.toLocaleString() }} ETF</small></strong></div>
          <div class="market-stat"><span>港股</span><strong>{{ summary.markets.HK.total.toLocaleString() }}</strong></div>
          <div class="market-stat"><span>美股</span><strong>{{ summary.markets.US.total.toLocaleString() }}<small>{{ summary.markets.US.stocks.toLocaleString() }} 股 + {{ summary.markets.US.etfs.toLocaleString() }} ETF</small></strong></div>
        </div>
        <div class="market-actions">
          <button class="button subtle" :disabled="busy" @click="syncCatalog">{{ busy ? '同步中…' : '同步目录' }}</button>
          <button class="button primary" :disabled="busy || !summary?.total" @click="startScan">{{ scanning ? '扫描中…' : '启动全市场扫描' }}</button>
        </div>
      </div>
      <div v-if="summary?.sources?.length" class="market-sources"><div v-for="source in summary.sources" :key="source.source + source.scope" class="source-chip" :class="{ failed: source.status !== 'complete' }"><strong>{{ sourceLabel(source.source) }}</strong><span>{{ source.scope }}</span><small>{{ source.status === 'complete' ? `${source.includedCount.toLocaleString()} 只` : source.error }}</small></div></div>
      <div v-if="scan" class="scan-progress"><div class="scan-bar"><i :style="{ width: progressPercent + '%' }" /></div><div class="scan-meta"><span>{{ scan.status === 'running' ? `扫描进行中 · ${scan.total.toLocaleString()} 只` : scan.status === 'completed' ? `扫描完成 · ${scan.finishedAt ? new Date(scan.finishedAt).toLocaleTimeString('zh-CN', { hour12: false }) : ''}` : '扫描失败' }}</span><span>成功 {{ scan.counts.succeeded.toLocaleString() }} · 历史不足 {{ scan.counts.insufficient_history.toLocaleString() }} · 失败 {{ scan.counts.failed_terminal.toLocaleString() }} · 待处理 {{ scan.counts.pending.toLocaleString() }}</span><button v-if="scan.counts.failed_terminal" class="retry" :disabled="busy" @click="retryFailed">重试失败 {{ scan.counts.failed_terminal.toLocaleString() }}</button></div></div>
      <div v-if="snapshot" class="snapshot-note"><AppIcon name="info" /><span>研究快照已发布（{{ snapshot.createdAt && new Date(snapshot.createdAt).toLocaleString('zh-CN', { hour12: false }) }}）：{{ snapshot.ready.toLocaleString() }} 只有效评分，{{ snapshot.failed.toLocaleString() }} 只进入诊断。排名清单在下方“共振观察清单”按分页加载。</span></div>
      <div v-if="error" class="error-banner" role="alert"><AppIcon name="info" />{{ error }}</div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { CatalogSummary, ScanRun } from '../../shared/catalog';
import AppIcon from './AppIcon.vue';

const summary = ref<CatalogSummary | null>(null);
const scan = ref<ScanRun | null>(null);
const snapshot = ref<{ createdAt: string; ready: number; failed: number } | null>(null);
const busy = ref(false);
const scanning = ref(false);
const error = ref('');
let poll: ReturnType<typeof setInterval> | undefined;

const progressPercent = computed(() => scan.value ? Math.round((scan.value.total - scan.value.counts.pending - scan.value.counts.running) / Math.max(1, scan.value.total) * 100) : 0);
const sourceLabels: Record<string, string> = { sse: '上交所', szse: '深交所', bse: '北交所', hkex: '港交所', nasdaq: 'Nasdaq', sec: 'SEC', eastmoney: '东方财富', fixture: '内置样例' };
const sourceLabel = (source: string) => sourceLabels[source] ?? source;

async function loadSummary(): Promise<void> {
  const body = await fetch('/api/catalog/summary').then((r) => r.json());
  summary.value = body.summary;
  if (body.latestScan) {
    scan.value = body.latestScan;
    if (body.latestScan.status === 'running') { scanning.value = true; startPolling(); }
  }
  if (body.research) snapshot.value = { createdAt: body.research.createdAt, ready: body.research.ready, failed: body.research.failed };
}
async function syncCatalog(): Promise<void> {
  busy.value = true; error.value = '';
  try {
    const response = await fetch('/api/catalog/sync', { method: 'POST', headers: adminHeaders() });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? '目录同步失败');
    await loadSummary();
  } catch (e) { error.value = e instanceof Error ? e.message : '目录同步失败'; } finally { busy.value = false; }
}
async function startScan(): Promise<void> {
  busy.value = true; error.value = '';
  try {
    const response = await fetch('/api/scans', { method: 'POST', headers: { ...adminHeaders(), 'content-type': 'application/json' }, body: '{}' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? '扫描启动失败');
    scan.value = body.run;
    scanning.value = true;
    startPolling();
  } catch (e) { error.value = e instanceof Error ? e.message : '扫描启动失败'; } finally { busy.value = false; }
}
async function retryFailed(): Promise<void> {
  if (!scan.value) return;
  busy.value = true;
  try {
    const response = await fetch(`/api/scans/${scan.value.id}/retry`, { method: 'POST', headers: adminHeaders() });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? '重试失败');
    scan.value = body.run;
    startPolling();
  } catch (e) { error.value = e instanceof Error ? e.message : '重试失败'; } finally { busy.value = false; }
}
function startPolling(): void {
  if (poll) return;
  poll = setInterval(async () => {
    if (!scan.value) return;
    const body = await fetch(`/api/scans/${scan.value.id}`).then((r) => r.json());
    if (body.run) scan.value = body.run;
    if (body.run?.status !== 'running') {
      scanning.value = false;
      if (poll) { clearInterval(poll); poll = undefined; }
      await loadSummary();
    }
  }, 3000);
}
function adminHeaders(): Record<string, string> {
  const token = localStorage.getItem('chan-admin-token') ?? '';
  return token ? { 'x-admin-token': token } : {};
}
onMounted(() => { void loadSummary(); });
onBeforeUnmount(() => { if (poll) clearInterval(poll); });
</script>
