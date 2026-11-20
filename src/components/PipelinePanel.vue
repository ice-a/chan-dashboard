<template>
  <section aria-labelledby="pipeline-title">
    <div class="section-heading"><div><span class="section-index">01</span><h2 id="pipeline-title">自动流水线</h2></div><span>服务端定时同步 · 扫描 · 每日快照发布</span></div>
    <div class="panel market-panel">
      <div class="market-stats">
        <div class="market-stat"><span>每日周期</span><strong :class="status?.cycle.started ? 'ok' : 'warn'">{{ status ? (status.cycle.started ? '已启动' : '等待启动') : '—' }}<small>UTC {{ status?.cycle.hourUtc ?? 16 }} 点门控{{ status?.cycle.ignoreGate ? ' · 手动旁路' : '' }}</small></strong></div>
        <div class="market-stat"><span>当前目录</span><strong>{{ status?.catalog ? status.catalog.total.toLocaleString() : '—' }}<small>{{ status?.catalog ? (status.catalog.complete ? '完整' : '未封口') + ' · ' + ((status.catalog.version ?? '').slice(0, 8) || '未同步') : '未同步' }}</small></strong></div>
        <div class="market-stat"><span>最新快照</span><strong :class="status?.snapshot ? 'ok' : ''">{{ status?.snapshot ? status.snapshot.ready.toLocaleString() + ' 只有效' : '尚未发布' }}<small v-if="status?.snapshot">{{ new Date(status.snapshot.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</small><small v-else>首轮扫描封口后出现</small></strong></div>
        <div class="market-stat"><span>状态更新</span><strong>{{ updated ? new Date(updated).toLocaleTimeString('zh-CN', { hour12: false }) : '…' }}<small>每分钟自动刷新</small></strong></div>
      </div>

      <div v-if="status?.sources.length" class="market-sources">
        <div v-for="source in status.sources" :key="source.source" class="source-chip" :class="{ failed: source.status === 'failed' }">
          <strong>{{ source.label }}</strong>
          <span v-if="source.status === 'complete'">{{ source.stagedCount.toLocaleString() }} 只</span>
          <span v-else-if="source.status === 'running'">第 {{ source.pagesDone }} 页 · {{ source.stagedCount.toLocaleString() }} 只</span>
          <span v-else-if="source.status === 'failed'" :title="source.error ?? ''">同步失败<small>今日重试 {{ source.retriesToday }}/2</small></span>
          <span v-else>等待推进</span>
        </div>
      </div>

      <div v-if="status?.scan && status.scan.status === 'running'" class="scan-progress">
        <div class="scan-bar"><i :style="{ width: percentOf(status.scan) + '%' }" /></div>
        <div class="scan-meta">
          <span>全市场扫描进行中 · {{ doneOf(status.scan).toLocaleString() }} / {{ status.scan.total.toLocaleString() }}（{{ percentOf(status.scan) }}%）</span>
          <span>成功 {{ (status.scan.counts.succeeded ?? 0).toLocaleString() }} · 历史不足 {{ (status.scan.counts.insufficient_history ?? 0).toLocaleString() }} · 失败 {{ (status.scan.counts.failed_terminal ?? 0).toLocaleString() }} · 待处理 {{ (status.scan.counts.pending ?? 0).toLocaleString() }}</span>
          <span v-if="status.scan.ratePerMinute" class="pipeline-eta">约 {{ status.scan.ratePerMinute }} 只/分钟{{ status.scan.etaHours !== null ? ` · 预计还需 ${status.scan.etaHours} 小时` : '' }}</span>
        </div>
      </div>

      <div v-if="error" class="error-banner" role="alert"><AppIcon name="info" />{{ error }}</div>
      <div class="snapshot-note"><AppIcon name="info" /><span>流水线由服务端定时器每分钟推进一次：每日启动目录同步（来源失败自动重试 2 次）→ 提交目录 → 全市场扫描（每轮失败自动重试一次）→ 评分封口发布快照。无需打开页面，关掉浏览器也继续跑。</span></div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import AppIcon from './AppIcon.vue';

interface PipelineScan {
  id: string; status: string; total: number; counts: Record<string, number>;
  startedAt: string; ratePerMinute: number | null; etaHours: number | null;
}
interface PipelineStatus {
  catalog: { version: string | null; complete: boolean; total: number; markets: Record<string, { total: number }> } | null;
  cycle: { today: string; started: boolean; hourUtc: number; ignoreGate: boolean };
  sources: { source: string; label: string; status: string; stagedCount: number; declaredTotal: number | null; pagesDone: number; error: string | null; updatedAt: string; retriesToday: number }[];
  scan: PipelineScan | null;
  snapshot: { id: string; createdAt: string; total: number; ready: number; failed: number } | null;
}

const status = ref<PipelineStatus | null>(null);
const updated = ref('');
const error = ref('');
let timer: ReturnType<typeof setInterval> | undefined;

const doneOf = (scan: PipelineScan) => scan.total - (scan.counts.pending ?? 0) - (scan.counts.running ?? 0);
const percentOf = (scan: PipelineScan) => Math.min(100, Math.round(doneOf(scan) / Math.max(1, scan.total) * 100));

async function load(): Promise<void> {
  try {
    const body = await fetch('/api/pipeline/status').then((r) => r.json());
    if (body.ok) { status.value = body.status; updated.value = new Date().toISOString(); error.value = ''; }
    else error.value = String(body.error ?? '流水线状态读取失败');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '流水线状态读取失败';
  }
}

onMounted(() => { void load(); timer = setInterval(() => { void load(); }, 60_000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
.pipeline-eta { margin-left: auto; }
</style>
