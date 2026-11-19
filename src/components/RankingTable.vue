<template>
  <section aria-labelledby="ranking-title">
    <div class="section-heading"><div><span class="section-index">03</span><h2 id="ranking-title">共振观察清单</h2></div><span>按 {{ sortLabels[sortKey] }} 排序 · 点击查看结构图谱</span></div>
    <div class="panel ranking-panel">
      <div class="ranking-toolbar">
        <div class="filter-tabs" role="group" aria-label="象限筛选"><button v-for="tab in quadrantTabs" :key="tab.value" :class="{ active: quadrant === tab.value }" @click="quadrant = tab.value">{{ tab.label }}</button></div>
        <div class="market-tabs" role="group" aria-label="市场筛选"><button v-for="tab in markets" :key="tab.value" :class="{ active: market === tab.value }" @click="market = tab.value">{{ tab.label }}</button></div>
        <label class="search"><AppIcon name="search" /><input v-model="query" type="search" placeholder="代码 / 名称" aria-label="搜索代码或名称" /></label>
      </div>
      <div class="research-toolbar"><div class="watch-filter" role="group" aria-label="自选筛选"><button :class="{ active: watchOnly === 'all' }" @click="watchOnly = 'all'">全部标的</button><button :class="{ active: watchOnly === 'watchlist' }" @click="watchOnly = 'watchlist'"><AppIcon name="star" />我的自选<span>{{ preferences.watchlist.length }}</span></button><span>全池计算 · 自选仅过滤显示</span></div><button class="export-button" :disabled="!filtered.length" @click="downloadRanking(filtered)"><AppIcon name="download" />导出当前 CSV</button></div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>#</th><th>标的</th><th>市场 / 来源</th><th>象限</th><th><button @click="sortKey = 'chanScore'">缠论分 {{ sortKey === 'chanScore' ? '↓' : '' }}</button></th><th><button @click="sortKey = 'momentumScore'">动量分 {{ sortKey === 'momentumScore' ? '↓' : '' }}</button></th><th><button @click="sortKey = 'resonance'">共振分 {{ sortKey === 'resonance' ? '↓' : '' }}</button></th><th>近20日</th><th>Δ名次</th><th><span class="sr-only">收藏与详情</span></th></tr></thead>
          <tbody>
            <tr v-for="record in filtered" :key="record.instrument.id" tabindex="0" @click="emit('select', record)" @keydown.enter="emit('select', record)">
              <td class="rank">{{ record.rank }}</td>
              <td><div class="instrument"><strong>{{ record.instrument.name }}</strong><span>{{ record.instrument.symbol }}<i :class="record.instrument.kind">{{ record.instrument.kind === 'etf' ? 'ETF' : '个股' }}</i></span></div></td>
              <td><div class="source-cell"><span>{{ MARKET_LABELS[record.instrument.market] }}</span><small :class="{ stale: record.snapshot?.stale }">{{ providerName(record) }}</small></div></td>
              <td><span v-if="record.quadrant" class="quadrant-tag" :class="record.quadrant">{{ QUADRANT_LABELS[record.quadrant] }}</span></td>
              <td><ScoreBar :score="record.chanScore!" kind="chan" /></td>
              <td><ScoreBar :score="record.momentumScore!" kind="momentum" /></td>
              <td><strong class="resonance-value">{{ record.resonance!.toFixed(1) }}</strong></td>
              <td :class="trendClass(record.momentum!.return20)">{{ signed(record.momentum!.return20) }}</td>
              <td><span class="rank-delta" :class="record.rankDelta! > 0 ? 'up' : record.rankDelta! < 0 ? 'down' : ''">{{ rankDelta(record.rankDelta) }}</span></td>
              <td><div class="row-actions"><button class="row-action favorite-row" :class="{ active: preferences.isWatched(record.instrument.id) }" :aria-label="preferences.isWatched(record.instrument.id) ? `取消自选 ${record.instrument.name}` : `添加自选 ${record.instrument.name}`" :aria-pressed="preferences.isWatched(record.instrument.id)" @click.stop="preferences.toggle(record.instrument.id)"><AppIcon name="star" /></button><button class="row-action" aria-label="查看标的诊断" @click.stop="emit('select', record)"><AppIcon name="arrow" /></button></div></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!filtered.length" class="table-empty"><span class="empty-symbol">⌁</span><strong>{{ emptyTitle }}</strong><span>{{ emptyHint }}</span><button v-if="watchOnly === 'watchlist'" class="button subtle" @click="watchOnly = 'all'">查看全部标的</button></div>
      </div>
      <div class="table-footer"><span>显示 {{ filtered.length }} / {{ universeTotal }} 只有效标的</span><span>缠论 ≥ 78 且动量 ≥ 70 判为共振强势 · Δ为相对上一轮排名</span></div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDashboardStore } from '../stores/dashboard';
import { usePreferencesStore } from '../stores/preferences';
import { MARKET_LABELS, PROVIDER_LABELS } from '../../shared/market';
import type { Market } from '../../shared/market';
import { QUADRANT_LABELS } from '../../shared/dashboard';
import type { AnalysisRecord, Quadrant } from '../../shared/dashboard';
import { signed } from '../utils/format';
import { downloadRanking } from '../services/exporters';
import AppIcon from './AppIcon.vue';
import ScoreBar from './ScoreBar.vue';
const emit = defineEmits<{ select: [record: AnalysisRecord] }>();
const store = useDashboardStore();
const preferences = usePreferencesStore();
const quadrant = ref<'all' | Quadrant>('all');
const market = ref<'all' | Market>('all');
const watchOnly = ref<'all' | 'watchlist'>('all');
const query = ref('');
const sortKey = ref<'resonance' | 'chanScore' | 'momentumScore'>('resonance');
const quadrantTabs = [{ value: 'all', label: '全部' }, { value: 'resonance', label: '共振强势' }, { value: 'structure', label: '结构先行' }, { value: 'momentum', label: '动量领先' }, { value: 'weak', label: '双弱' }] as const;
const markets = [{ value: 'all', label: '全市场' }, { value: 'HK', label: '港股' }, { value: 'US', label: '美股' }, { value: 'CN', label: 'A股' }] as const;
const universeTotal = computed(() => store.loading || store.snapshotLoading ? (store.targetTotal || store.summary.total) : store.records.length);
const sortLabels = { resonance: '共振分', chanScore: '缠论分', momentumScore: '动量分' };
const filtered = computed(() => store.records.filter((r) => r.status === 'ready' && (quadrant.value === 'all' || r.quadrant === quadrant.value) && (market.value === 'all' || r.instrument.market === market.value) && (watchOnly.value === 'all' || preferences.isWatched(r.instrument.id)) && `${r.instrument.symbol} ${r.instrument.name}`.toLowerCase().includes(query.value.trim().toLowerCase())).sort((a, b) => b[sortKey.value]! - a[sortKey.value]! || a.instrument.id.localeCompare(b.instrument.id)));
const emptyTitle = computed(() => store.loading && !store.records.length ? '正在收集行情，排名将在本轮完成后生成' : watchOnly.value === 'watchlist' && !preferences.watchlist.length ? '还没有自选标的' : '当前筛选下暂无标的');
const emptyHint = computed(() => store.loading && !store.records.length ? `${store.completed} / ${store.targetTotal || store.summary.total} 标的已返回` : watchOnly.value === 'watchlist' && !preferences.watchlist.length ? '点击任意标的旁的星标，建立你的观察清单' : '尝试切换象限、市场或清空搜索条件');
function selectQuadrant(value: Quadrant) { quadrant.value = value; }
function trendClass(value: number) { return value > 0 ? 'trend-up' : value < 0 ? 'trend-down' : ''; }
function providerName(record: AnalysisRecord) { return record.snapshot ? `${PROVIDER_LABELS[record.snapshot.provider]}${record.snapshot.stale ? ' · 陈旧' : ''}` : '—'; }
function rankDelta(delta: number | null) { return delta === null ? 'NEW' : delta > 0 ? `↑ ${delta}` : delta < 0 ? `↓ ${Math.abs(delta)}` : '—'; }
defineExpose({ selectQuadrant });
</script>
