<template>
  <section aria-labelledby="trends-title">
    <div class="section-heading"><div><span class="section-index">03</span><h2 id="trends-title">快照趋势</h2></div><span>服务端每日快照 · 排名与象限随时间变化</span></div>
    <div class="panel trends-panel">
      <div v-if="error" class="error-banner" role="alert"><AppIcon name="info" />{{ error }}</div>
      <template v-else-if="snapshots.length">
        <div class="trends-toolbar">
          <div class="trends-chips">
            <button
              v-for="item in candidateIds" :key="item"
              class="source-chip chip-toggle" :class="{ active: selected.has(item) }" type="button"
              @click="toggle(item)"
            >{{ shortName(item) }}</button>
          </div>
          <span class="trends-meta">{{ snapshots.length }} 轮快照 · 保留最近 {{ Math.min(snapshots.length, 30) }} 轮</span>
        </div>
        <div ref="chartEl" class="trends-chart" aria-label="快照排名趋势图" />
        <div v-if="!candidateIds.length" class="trends-empty"><AppIcon name="info" /><span>在排名清单收藏标的（星标）后，这里显示其排名随每日快照的变化。</span></div>
      </template>
      <div v-else class="trends-empty"><AppIcon name="info" /><span>还没有历史快照。定时扫描启用后，每天自动封口的快照会在这里积累成趋势。</span></div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption } from 'echarts';
import { useTheme } from '../composables/useTheme';
import { usePreferencesStore } from '../stores/preferences';
import AppIcon from './AppIcon.vue';

interface SnapshotBrief { id: string; createdAt: string | null; ready: number; failed: number; total: number; quadrants: Record<string, number> }
interface TrendPoint { snapshotId: string; createdAt: string | null; instrumentId: string; rank: number | null; quadrant: string | null; chanScore: number | null; momentumScore: number | null }

const MAX_SELECTED = 8;
const preferences = usePreferencesStore();
const { themeVersion } = useTheme();
const snapshots = ref<SnapshotBrief[]>([]);
const pointsBySnapshot = ref<Map<string, TrendPoint>>(new Map());
const selected = ref<Set<string>>(new Set());
const error = ref('');
const chartEl = ref<HTMLDivElement>();
let chart: ECharts | undefined;
let resizeObserver: ResizeObserver | undefined;

const candidateIds = computed(() => preferences.watchlist.slice(0, 24));
const trendInstruments = computed(() => candidateIds.value.filter((id) => selected.value.has(id)));

function shortName(id: string): string {
  const [, symbol = id] = id.split(':');
  return symbol;
}

function toggle(id: string): void {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else if (next.size < MAX_SELECTED) next.add(id);
  selected.value = next;
  void loadPoints();
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

async function loadList(): Promise<void> {
  const response = await fetch('/api/snapshots/list?limit=30').then((r) => r.json()) as { ok: boolean; snapshots?: SnapshotBrief[] };
  snapshots.value = response.snapshots ?? [];
}

async function loadPoints(): Promise<void> {
  const ids = trendInstruments.value;
  if (!ids.length) { pointsBySnapshot.value = new Map(); await nextTick(); draw(); return; }
  const response = await fetch(`/api/snapshots/trends?ids=${encodeURIComponent(ids.join(','))}&limit=30`).then((r) => r.json()) as { ok: boolean; points?: TrendPoint[] };
  const map = new Map<string, TrendPoint>();
  for (const point of response.points ?? []) map.set(`${point.snapshotId}:${point.instrumentId}`, point);
  pointsBySnapshot.value = map;
  await nextTick();
  draw();
}

function draw(): void {
  if (!chartEl.value || !snapshots.value.length) return;
  chart ??= echarts.init(chartEl.value);
  const text = cssVar('--chart-text', '#75808b');
  const line = cssVar('--chart-line', '#d9dce1');
  const grid = cssVar('--chart-grid', '#eeeae6');
  const ordered = [...snapshots.value].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  const xLabels = ordered.map((item) => item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—');
  const palette = ['#c64c40', '#32709b', '#b7792b', '#5a8a6a', '#8b5aa0', '#a05a5a', '#5a6ea0', '#7a8a3a'];
  const series = trendInstruments.value.map((id, index) => ({
    name: shortName(id), type: 'line' as const, showSymbol: true, symbolSize: 6,
    lineStyle: { width: 2 }, itemStyle: { color: palette[index % palette.length] },
    data: ordered.map((snapshot) => {
      const point = pointsBySnapshot.value.get(`${snapshot.id}:${id}`);
      return { value: point?.rank ?? null, quadrant: point?.quadrant ?? '—', chan: point?.chanScore ?? null, momentum: point?.momentumScore ?? null };
    }),
    connectNulls: false,
  }));
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    grid: { left: 48, right: 24, top: 36, bottom: 40 },
    legend: { top: 0, textStyle: { color: text, fontSize: 11 } },
    tooltip: {
      trigger: 'axis', backgroundColor: '#292230', borderWidth: 0, padding: [10, 12], textStyle: { color: '#fff', fontSize: 12 },
      valueFormatter: (value) => value == null ? '未上榜' : `第 ${value} 名`,
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params];
        const title = String((list[0] as { axisValue?: string }).axisValue ?? '');
        const rows = list.map((item) => {
          const data = (item as { data?: { value: number | null; quadrant: string; chan: number | null; momentum: number | null } }).data;
          if (!data || data.value == null) return `<br/>${(item as { seriesName?: string }).seriesName}：未上榜`;
          return `<br/>${(item as { seriesName?: string }).seriesName}：第 ${data.value} 名 · ${data.quadrant} · 缠论 ${data.chan ?? '—'} / 动量 ${data.momentum ?? '—'}`;
        });
        return `<b>${title}</b>${rows.join('')}`;
      },
    },
    xAxis: { type: 'category', data: xLabels, axisLabel: { color: text, fontSize: 10 }, axisLine: { lineStyle: { color: line } } },
    yAxis: { type: 'value', inverse: true, min: 1, name: '排名（越小越强）', nameTextStyle: { color: text, fontSize: 11 }, axisLabel: { color: text, fontSize: 10 }, splitLine: { lineStyle: { color: grid, type: 'dashed' } } },
    series,
  };
  chart.setOption(option, { notMerge: true });
}

onMounted(async () => {
  try {
    await loadList();
    const initial = candidateIds.value.slice(0, Math.min(5, MAX_SELECTED));
    selected.value = new Set(initial);
    if (snapshots.value.length && initial.length) await loadPoints();
    else await nextTick();
    draw();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '趋势数据加载失败';
  }
  resizeObserver = new ResizeObserver(() => chart?.resize());
  if (chartEl.value) resizeObserver.observe(chartEl.value);
});

watch(themeVersion, () => nextTick(draw));
watch(() => preferences.watchlist, () => {
  selected.value = new Set([...selected.value].filter((id) => candidateIds.value.includes(id)));
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.dispose();
  chart = undefined;
});
</script>

<style scoped>
.trends-panel { display: flex; flex-direction: column; gap: 12px; }
.trends-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.trends-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip-toggle { cursor: pointer; opacity: 0.6; }
.chip-toggle.active { opacity: 1; outline: 2px solid currentColor; }
.trends-meta { color: var(--text-muted, #75808b); font-size: 12px; white-space: nowrap; }
.trends-chart { width: 100%; height: 320px; }
.trends-empty { display: flex; align-items: center; gap: 8px; color: var(--text-muted, #75808b); font-size: 13px; }
.error-banner { display: flex; align-items: center; gap: 8px; color: var(--danger, #c64c40); font-size: 13px; }
</style>
