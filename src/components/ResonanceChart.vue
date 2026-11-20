<template>
  <section aria-labelledby="chart-title">
    <div class="section-heading"><div><span class="section-index">03</span><h2 id="chart-title">二维共振图谱</h2></div><span>点击散点查看数据血缘与评分依据</span></div>
    <div class="panel chart-panel">
      <div class="panel-heading"><div><h3>缠论结构分 <span>×</span> 动量截面分</h3><p>横轴：结构状态 · 纵轴：池内相对动量</p></div><span class="sample-badge">{{ store.summary.sampleSize }} 个新鲜样本</span></div>
      <div v-if="!store.records.length" class="chart-placeholder"><span class="placeholder-orbit" /><strong>{{ store.loading ? '正在建立市场坐标…' : '暂无有效行情' }}</strong><span>{{ store.loading ? `${store.completed} / ${store.summary.total} · 每根K线只使用一个数据源` : '请检查数据源或稍后重试' }}</span></div>
      <div v-show="store.records.length" ref="chartEl" class="resonance-chart" role="img" aria-label="缠论结构分与动量分四象限散点图" />
      <div class="chart-legend"><span v-for="(label, id) in QUADRANT_LABELS" :key="id"><i :style="{ background: QUADRANT_COLORS[id] }" />{{ label }}<small>{{ counts[id] }}</small></span><span class="legend-note">点大小 = 共振分</span></div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useTheme } from '../composables/useTheme';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption, ScatterSeriesOption } from 'echarts';
import { useDashboardStore } from '../stores/dashboard';
import { QUADRANT_COLORS, QUADRANT_LABELS } from '../../shared/dashboard';
import type { AnalysisRecord, Quadrant } from '../../shared/dashboard';
import type { Instrument } from '../../shared/market';
const store = useDashboardStore();
const { themeVersion } = useTheme();
const emit = defineEmits<{ select: [record: AnalysisRecord] }>();
const chartEl = ref<HTMLElement>();
let chart: ECharts | undefined;
let observer: ResizeObserver | undefined;
const counts = computed(() => Object.fromEntries(Object.keys(QUADRANT_LABELS).map((key) => [key, store.records.filter((r) => r.quadrant === key).length])) as Record<Quadrant, number>);

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function draw() {
  if (!chartEl.value) return;
  chart ??= echarts.init(chartEl.value);
  const groups = Object.fromEntries(Object.keys(QUADRANT_LABELS).map((id) => [id, store.records.filter((r) => r.quadrant === id)])) as Record<Quadrant, AnalysisRecord[]>;
  const series = Object.entries(groups).map(([id, records]): ScatterSeriesOption => ({
    type: 'scatter', name: QUADRANT_LABELS[id as Quadrant],
    data: records.map((record, index) => ({
      name: record.instrument.name,
      value: [record.chanScore, record.momentumScore, record.resonance],
      instrument: record.instrument,
      label: { show: index < 2 && record.resonance! > 50 },
    })),
    symbolSize: (value) => Math.max(9, Math.min(24, Number((value as number[])[2]) / 4)),
    itemStyle: { color: QUADRANT_COLORS[id as Quadrant], opacity: 0.8, borderColor: '#fff', borderWidth: 1 },
    label: { position: 'top', distance: 5, fontSize: 10, color: '#64717d', fontFamily: 'Microsoft YaHei' },
    emphasis: { scale: 1.3, label: { show: true, fontWeight: 600 } },
  }));
  series.push({ type: 'scatter', data: [], silent: true, markArea: { silent: true, itemStyle: { color: 'rgba(192,75,57,.045)' }, label: { show: true, formatter: '共振区', color: '#b8796e', fontSize: 11, position: 'insideTopRight', padding: 12 }, data: [[{ xAxis: 78, yAxis: 70 }, { xAxis: 100, yAxis: 100 }]] } });
  const option: EChartsOption = {
    animationDuration: 450,
    tooltip: { trigger: 'item', backgroundColor: '#292230', borderWidth: 0, padding: [12, 15], textStyle: { color: '#fff', fontSize: 12 }, formatter: (params) => {
      const p = params as unknown as { data: { instrument: Instrument; value: number[] } };
      return `<strong>${escapeHtml(p.data.instrument.name)}</strong> <span style="opacity:.55">${p.data.instrument.symbol}</span><br/><span style="opacity:.65">缠论 / 动量</span> &nbsp; <b>${p.data.value[0].toFixed(0)} / ${p.data.value[1].toFixed(0)}</b><br/><span style="opacity:.65">共振分</span> &nbsp; <b>${p.data.value[2].toFixed(1)}</b>`;
    } },
    grid: { left: 52, right: 24, top: 28, bottom: 49 },
    xAxis: { type: 'value', name: '缠论结构分 →', nameLocation: 'middle', nameGap: 30, min: 0, max: 100, nameTextStyle: { color: cssVar('--chart-text', '#75808b'), fontSize: 11 }, axisLabel: { color: cssVar('--chart-text', '#9a9fa5'), fontSize: 10 }, axisLine: { lineStyle: { color: cssVar('--chart-line', '#d9dce1') } }, splitLine: { lineStyle: { color: cssVar('--chart-grid', '#eeeae6'), type: 'dashed' } } },
    yAxis: { type: 'value', name: '动量分 →', nameLocation: 'middle', nameGap: 33, min: 0, max: 100, nameTextStyle: { color: cssVar('--chart-text', '#75808b'), fontSize: 11 }, axisLabel: { color: cssVar('--chart-text', '#9a9fa5'), fontSize: 10 }, axisLine: { lineStyle: { color: cssVar('--chart-line', '#d9dce1') } }, splitLine: { lineStyle: { color: cssVar('--chart-grid', '#eeeae6'), type: 'dashed' } } },
    series,
  };
  chart.setOption(option, { notMerge: true });
}
watch(() => store.records, () => nextTick(draw), { deep: false });
watch(themeVersion, () => nextTick(draw));
onMounted(() => { draw(); chart?.on('click', (params) => { const instrument = (params.data as { instrument?: Instrument }).instrument; if (instrument) { const record = store.records.find((r) => r.instrument.id === instrument.id); if (record) emit('select', record); } }); observer = new ResizeObserver(() => chart?.resize()); observer.observe(chartEl.value!); });
onBeforeUnmount(() => { observer?.disconnect(); chart?.dispose(); });
function escapeHtml(text: string) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
</script>
