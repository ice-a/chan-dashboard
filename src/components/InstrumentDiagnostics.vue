<template>
  <Teleport to="body"><Transition name="drawer"><div v-if="record" class="drawer-backdrop" @click.self="emit('close')"><aside class="drawer research-drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title" tabindex="-1" @keydown.esc="emit('close')" @keydown.tab="trapFocus">
    <div class="drawer-head"><div><span class="eyebrow">INSTRUMENT RESEARCH DESK</span><h2 id="detail-title">{{ record.instrument.name }}<small>{{ record.instrument.id }}</small></h2></div><div class="drawer-head-actions"><button class="favorite-button" :class="{ active: preferences.isWatched(record.instrument.id) }" :aria-pressed="preferences.isWatched(record.instrument.id)" @click="preferences.toggle(record.instrument.id)">{{ preferences.isWatched(record.instrument.id) ? '★ 已自选' : '☆ 加自选' }}</button><button ref="closeButton" class="close-button" aria-label="关闭标的诊断" @click="emit('close')"><AppIcon name="close" /></button></div></div>
    <div class="research-tabs" role="tablist" aria-label="标的研究视图"><button role="tab" :aria-selected="tab === 'chart'" :class="{ active: tab === 'chart' }" @click="tab = 'chart'">结构图谱</button><button role="tab" :aria-selected="tab === 'diagnosis'" :class="{ active: tab === 'diagnosis' }" @click="tab = 'diagnosis'">指标与数据诊断</button><button v-if="detail" class="detail-export" @click="downloadInstrument(record, detail)">导出研究 JSON<AppIcon name="arrow" /></button></div>
    <div class="drawer-body">
      <div v-if="record.status === 'ready'" class="detail-content">
        <div class="detail-scores"><div><span>缠论结构分</span><strong>{{ record.chanScore!.toFixed(0) }}</strong><small>绝对结构评分</small></div><div><span>动量截面分</span><strong>{{ record.momentumScore!.toFixed(0) }}</strong><small>全池相对百分位</small></div><div class="accent"><span>二维共振分</span><strong>{{ record.resonance!.toFixed(1) }}</strong><small>几何平均 · 第 {{ record.rank }} 名</small></div></div>
        <section v-if="tab === 'chart'" class="chart-workspace"><div class="workspace-heading"><div><span class="eyebrow">STRUCTURE EVIDENCE</span><h3>从K线，到结构判断。</h3></div><span>{{ record.chan!.observation }}</span></div><InstrumentChart v-if="detail" :detail="detail" /><div v-else class="chart-unavailable">当前结果缺少对应K线，请刷新后重试。</div><p class="detail-reason">{{ record.chan!.reason }}</p></section>
        <template v-if="tab === 'diagnosis'">
          <section><h3><span>01</span>结构观察</h3><p class="detail-observation">{{ record.chan!.observation }}</p><p class="detail-reason">{{ record.chan!.reason }}</p><dl class="detail-grid"><div><dt>末笔方向</dt><dd>{{ record.chan!.direction === 'up' ? '向上笔' : '向下笔' }}</dd></div><div><dt>力度背驰</dt><dd>{{ record.chan!.divergence }}</dd></div><div><dt>分型 / 笔 / 中枢</dt><dd>{{ record.chan!.fractalCount }} / {{ record.chan!.strokeCount }} / {{ record.chan!.pivotCount }}</dd></div><div><dt>最近中枢区间</dt><dd>{{ record.chan!.pivotLow ?? '—' }} – {{ record.chan!.pivotHigh ?? '—' }}</dd></div></dl></section>
          <section><h3><span>02</span>动量依据</h3><div class="returns"><div><span>20 日</span><strong :class="trend(record.momentum!.return20)">{{ signed(record.momentum!.return20) }}</strong></div><div><span>60 日</span><strong :class="trend(record.momentum!.return60)">{{ signed(record.momentum!.return60) }}</strong></div><div><span>120 日</span><strong :class="trend(record.momentum!.return120)">{{ signed(record.momentum!.return120) }}</strong></div></div><dl class="detail-grid"><div><dt>MA20 / MA60 偏离</dt><dd>{{ record.momentum!.deviation20 }}% / {{ record.momentum!.deviation60 }}%</dd></div><div><dt>ATR14 / 收盘价比</dt><dd>{{ record.momentum!.atrPercent }}%</dd></div><div><dt>5日 / 20日均量比</dt><dd>{{ record.momentum!.volumeRatio }}</dd></div><div><dt>风险调整动量</dt><dd>{{ record.momentum!.riskAdjustedMomentum }}</dd></div></dl></section>
          <section><h3><span>03</span>数据血缘</h3><div class="provenance"><div><span>实际来源</span><strong>{{ PROVIDER_LABELS[record.snapshot!.provider] }}{{ record.snapshot!.stale ? ' · 陈旧缓存' : '' }}</strong></div><div><span>周期 / 复权</span><strong>日线 / {{ record.snapshot!.adjustment === 'qfq' ? '前复权' : '拆股调整' }}</strong></div><div><span>最新交易日</span><strong>{{ record.snapshot!.sourceDate }} {{ record.snapshot!.isUnclosed ? '（盘中）' : '' }}</strong></div><div><span>数据接收时间</span><strong>{{ formatTime(record.snapshot!.receivedAt) }}</strong></div><div><span>K线数量</span><strong>{{ record.snapshot!.candleCount }} 根</strong></div><div><span>缓存状态</span><strong>{{ cacheLabel(record.snapshot!.cache) }}</strong></div></div></section>
        </template>
      </div>
      <div v-else class="unavailable"><AppIcon name="info" /><h3>此标的暂无有效评分</h3><p>{{ record.error }}</p></div>
      <section v-if="tab === 'diagnosis'" class="attempts"><h3><span>04</span>本轮来源尝试</h3><div v-for="attempt in record.attempts" :key="attempt.provider" class="attempt"><span class="status-dot" :class="{ error: !attempt.ok }" /><strong>{{ PROVIDER_LABELS[attempt.provider] }}</strong><span>{{ attempt.ok ? attempt.durationMs === 0 && record.snapshot?.cache === 'hit' && attempt.provider === record.snapshot.provider ? '服务端缓存命中' : '成功' : attempt.error?.message }}</span><small>{{ attempt.durationMs }}ms</small></div><p v-if="!record.attempts.length" class="detail-reason">暂无本轮请求记录。可能使用了先前成功结果，请核对上方接收时间。</p></section>
      <p class="detail-disclaimer">legacy-v1 保留原看板的经验评分口径，结构图与评分使用同一批K线。分型、笔与中枢不构成确定性买卖点；历史与本机自选不上传服务器。仅供研究，不构成投资建议。</p>
    </div>
  </aside></div></Transition></Teleport>
</template>
<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { PROVIDER_LABELS } from '../../shared/market';
import type { AnalysisRecord } from '../../shared/dashboard';
import { formatTime, signed } from '../utils/format';
import { downloadInstrument } from '../services/exporters';
import { useDashboardStore } from '../stores/dashboard';
import { usePreferencesStore } from '../stores/preferences';
import AppIcon from './AppIcon.vue';
const InstrumentChart = defineAsyncComponent(() => import('./InstrumentChart.vue'));
const props = defineProps<{ record: AnalysisRecord | null }>();
const emit = defineEmits<{ close: [] }>();
const store = useDashboardStore();
const preferences = usePreferencesStore();
const closeButton = ref<HTMLButtonElement>();
const tab = ref<'chart' | 'diagnosis'>('chart');
const detail = computed(() => props.record ? store.getDetail(props.record.instrument.id) : undefined);
let previousFocus: HTMLElement | null = null;
watch(() => props.record?.instrument.id, async (id, previous) => {
  if (id && !previous) previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.body.style.overflow = id ? 'hidden' : '';
  if (id) { tab.value = 'chart'; await nextTick(); closeButton.value?.focus(); }
  else { previousFocus?.focus(); previousFocus = null; }
});
onBeforeUnmount(() => { document.body.style.overflow = ''; });
function trend(value: number) { return value > 0 ? 'trend-up' : value < 0 ? 'trend-down' : ''; }
function trapFocus(event: KeyboardEvent) {
  const dialog = event.currentTarget as HTMLElement;
  const buttons = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex="0"]')];
  const first = buttons[0], last = buttons.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
function cacheLabel(cache: string) { return cache === 'hit' ? '短期缓存命中' : cache === 'stale' ? '限时陈旧回退' : '新请求'; }
</script>
