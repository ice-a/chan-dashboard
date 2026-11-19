<template>
  <header class="hero">
    <div class="hero-top">
      <div class="identity"><span class="brand-mark">缠</span><span>QUANTITATIVE RESEARCH <i /> VOL. 01</span></div>
      <div class="hero-top-right">
        <div class="theme-switch" role="group" aria-label="界面主题">
          <button v-for="option in themeOptions" :key="option.id" :class="{ active: theme === option.id }" :aria-pressed="theme === option.id" :aria-label="option.label" :title="option.label" @click="setTheme(option.id)" />
        </div>
        <span class="hero-tag"><span /> DAILY MARKET INTELLIGENCE</span>
      </div>
    </div>
    <div class="hero-body">
      <div>
        <p class="eyebrow">STRUCTURE MEETS MOMENTUM</p>
        <h1>看见结构与趋势的<span>共振。</span></h1>
        <p class="hero-description">缠论结构 × 市场动量，在二维视角中辨认同向的力量。</p>
      </div>
      <div class="hero-coordinate" aria-hidden="true"><span class="axis-x">CHAN</span><span class="axis-y">MOMENTUM</span><i v-for="n in 4" :key="n" /><b>共振</b></div>
    </div>
    <div class="hero-bottom">
      <span>历史日线 · 复权口径可追溯</span>
      <span>{{ universeLabel }}</span>
      <span>港股 / 美股 / A股</span>
      <span>多源自动降级</span>
      <span class="edition">ALGORITHM / LEGACY-V1</span>
    </div>
  </header>
</template>
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { INSTRUMENTS } from '../config/instruments';
import { useCatalogOverview } from '../composables/useCatalogOverview';
import { useTheme, type ThemeId } from '../composables/useTheme';

const { overview, refresh } = useCatalogOverview();
const { theme, setTheme } = useTheme();
const themeOptions: { id: ThemeId; label: string }[] = [
  { id: 'light', label: '浅色主题' }, { id: 'dark', label: '深色主题' }, { id: 'sepia', label: '暖砂主题' },
];

const universeLabel = computed(() => {
  const summary = overview.value.summary;
  if (!summary || !summary.total) {
    const stocks = INSTRUMENTS.filter((item) => item.kind === 'stock').length;
    const etfs = INSTRUMENTS.length - stocks;
    return `${stocks} 个股 + ${etfs} ETF · 测试池`;
  }
  const stockCount = Object.values(summary.markets).reduce((sum, market) => sum + market.stocks, 0);
  const etfCount = Object.values(summary.markets).reduce((sum, market) => sum + market.etfs, 0);
  return `${summary.total.toLocaleString()} 只全市场 · ${stockCount.toLocaleString()} 个股 + ${etfCount.toLocaleString()} ETF`;
});

onMounted(() => { void refresh(); });
</script>
