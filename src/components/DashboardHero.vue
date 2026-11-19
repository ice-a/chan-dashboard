<template>
  <header class="hero">
    <div class="hero-top">
      <div class="identity"><span class="brand-mark">缠</span><span>QUANTITATIVE RESEARCH <i /> VOL. 01</span></div>
      <span class="hero-tag"><span /> DAILY MARKET INTELLIGENCE</span>
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
      <span>历史日线 · 复权口径可追溯</span><span>{{ stockCount }} 个股 + {{ etfCount }} ETF</span><span>港股 / 美股 / A股</span><span>多源自动降级</span>
      <span class="edition">ALGORITHM / LEGACY-V1</span>
    </div>
  </header>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { INSTRUMENTS } from '../config/instruments';
const stockCount = computed(() => INSTRUMENTS.filter((item) => item.kind === 'stock').length);
const etfCount = computed(() => INSTRUMENTS.filter((item) => item.kind === 'etf').length);
</script>
