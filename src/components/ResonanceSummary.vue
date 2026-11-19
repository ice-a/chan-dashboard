<template>
  <section class="summary-section" aria-labelledby="summary-title">
    <div class="section-heading"><div><span class="section-index">01</span><h2 id="summary-title">市场共振摘要</h2></div><span>随着每轮行情重新计算 · 相对排名并非收益预测</span></div>
    <div class="summary-grid">
      <button v-for="(quadrant, index) in quadrants" :key="quadrant.id" class="summary-card" :class="quadrant.id" @click="emit('select', quadrant.id)">
        <div class="summary-top"><span class="summary-number">0{{ index + 1 }}</span><span class="quadrant-label">{{ quadrant.label }}</span><span class="summary-count">{{ grouped[quadrant.id].length }}<small>只</small></span></div>
        <div class="summary-rule"><i /></div>
        <div class="summary-names">{{ names(grouped[quadrant.id]) }}</div>
        <div class="summary-bottom"><span>{{ quadrant.caption }}</span><AppIcon name="arrow" /></div>
      </button>
    </div>
    <div v-if="store.refreshError" class="error-banner" role="alert"><AppIcon name="info" />{{ store.refreshError }}<button @click="store.refresh(true)">重试</button></div>
    <div v-else-if="store.summary.stale || store.summary.failed" class="notice"><AppIcon name="info" /><span>{{ store.summary.failed }} 只未取得有效行情，{{ store.summary.stale }} 只使用限时陈旧缓存。所有数据均保留来源与时点，可打开下方“数据诊断”核对。</span></div>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useDashboardStore } from '../stores/dashboard';
import type { Quadrant } from '../../shared/dashboard';
import AppIcon from './AppIcon.vue';
const store = useDashboardStore();
const emit = defineEmits<{ select: [quadrant: Quadrant] }>();
const quadrants: { id: Quadrant; label: string; caption: string }[] = [
  { id: 'resonance', label: '双高共振', caption: '缠论 ≥ 78 · 动量 ≥ 70' },
  { id: 'structure', label: '结构先行', caption: '结构较强 · 等待动量确认' },
  { id: 'momentum', label: '动量领先', caption: '趋势较强 · 留意追高风险' },
];
const grouped = computed(() => Object.fromEntries(quadrants.map(({ id }) => [id, store.records.filter((record) => record.quadrant === id)])) as Record<Quadrant, typeof store.records>);
const names = (records: typeof store.records) => records.slice(0, 3).map((r) => r.instrument.name).join(' · ') || (store.loading ? '等待本轮行情' : '当前暂无标的');
</script>
