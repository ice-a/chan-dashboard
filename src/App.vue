<template>
  <div class="app-shell">
    <DashboardHero />
    <RefreshControl :countdown="countdown" />
    <main>
      <MarketUniversePanel />
      <ResonanceSummary @select="selectQuadrant" />
      <ResonanceChart @select="selectedId = $event.instrument.id" />
      <RankingTable ref="ranking" @select="selectedId = $event.instrument.id" />
      <SnapshotTrends />
      <SignalHistory @select="selectedId = $event" />
      <DataSourcePanel @select="selectedId = $event.instrument.id" />
      <MethodologySection />
    </main>
    <footer><span class="footer-mark">缠</span><span>结构有边界，数据有来处。</span><span>CHAN × MOMENTUM · FOR RESEARCH ONLY</span></footer>
    <InstrumentDiagnostics :record="selectedRecord" @close="selectedId = null" />
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useDashboardStore } from './stores/dashboard';
import { useAutoRefresh } from './composables/useAutoRefresh';
import type { Quadrant } from '../shared/dashboard';
import DashboardHero from './components/DashboardHero.vue';
import RefreshControl from './components/RefreshControl.vue';
import MarketUniversePanel from './components/MarketUniversePanel.vue';
import ResonanceSummary from './components/ResonanceSummary.vue';
import ResonanceChart from './components/ResonanceChart.vue';
import RankingTable from './components/RankingTable.vue';
import SnapshotTrends from './components/SnapshotTrends.vue';
import SignalHistory from './components/SignalHistory.vue';
import DataSourcePanel from './components/DataSourcePanel.vue';
import MethodologySection from './components/MethodologySection.vue';
import InstrumentDiagnostics from './components/InstrumentDiagnostics.vue';
const store = useDashboardStore();
const ranking = ref<InstanceType<typeof RankingTable>>();
const selectedId = ref<string | null>(null);
const selectedRecord = computed(() => store.getRecord(selectedId.value));
const { countdown } = useAutoRefresh();
watch(() => store.frequencySeconds, (value) => localStorage.setItem('chan-refresh-seconds', String(value)));
watch(() => store.autoRefresh, (value) => { if (value) store.nextRefreshAt = Date.now() + store.frequencySeconds * 1000; else store.cancel(); });
function selectQuadrant(quadrant: Quadrant) { ranking.value?.selectQuadrant(quadrant); document.getElementById('ranking-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
onMounted(async () => {
  const saved = Number(localStorage.getItem('chan-refresh-seconds'));
  if ([60, 300, 900].includes(saved)) store.frequencySeconds = saved;
  await nextTick();
  void store.loadProviders();
  // Prefer the server-published full-market snapshot when available.
  const snapshotTotal = await store.loadSnapshotPage().catch(() => 0);
  if (!snapshotTotal) void store.refresh();
});
</script>
