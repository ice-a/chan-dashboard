<template>
  <section class="source-panel" aria-labelledby="sources-title">
    <div class="source-heading"><AppIcon name="database" /><div><h3 id="sources-title">数据链路</h3><p>每根K线只使用一个来源 · 服务端缓存 · 逐标的自动降级</p></div><button @click="expanded = !expanded" :aria-expanded="expanded">{{ expanded ? '收起诊断' : '数据诊断' }}<AppIcon name="arrow" /></button></div>
    <div class="source-flow">
      <div v-for="provider in store.providers" :key="provider.id" class="provider" :class="{ fallback: provider.role === 'fallback' }"><span class="provider-status" /><div><strong>{{ provider.name }}</strong><span>{{ provider.note }}</span></div><span class="provider-role">{{ provider.role === 'primary' ? '主数据源' : '备用源' }}</span></div>
      <div class="flow-arrow">→</div><div class="provider"><span class="provider-status neutral" /><div><strong>标准化计算</strong><span>OHLCV校验 · 缠论 × 动量</span></div><span class="provider-role">本地计算</span></div>
    </div>
    <div v-if="expanded" class="diagnostics">
      <div class="diagnostics-head"><span>标的</span><span>状态 / 来源</span><span>行情日 / K线</span><span>接收时间</span><span /></div>
      <button v-for="record in store.records" :key="record.instrument.id" class="diagnostic-row" @click="emit('select', record)">
        <span><strong>{{ record.instrument.name }}</strong><small>{{ record.instrument.id }}</small></span>
        <span :class="record.status === 'ready' ? record.snapshot?.stale ? 'text-warning' : 'text-success' : 'text-error'">{{ record.status === 'ready' ? record.snapshot?.stale ? '陈旧缓存' : '正常' : '不可用' }}<small>{{ record.snapshot ? PROVIDER_LABELS[record.snapshot.provider] : '无有效来源' }}</small></span>
        <span>{{ record.snapshot?.sourceDate ?? '—' }}<small>{{ record.snapshot?.candleCount ?? 0 }} 根 · {{ record.snapshot?.isUnclosed ? '盘中' : '日线' }}</small></span>
        <span>{{ formatTime(record.snapshot?.receivedAt ?? null) }}<small>{{ record.snapshot?.cache === 'hit' ? '服务端缓存' : record.snapshot?.cache === 'stale' ? '过期回退' : '上游请求' }}</small></span>
        <AppIcon name="arrow" />
      </button>
      <div v-if="!store.records.length" class="diagnostic-empty">{{ store.loading ? '数据诊断将在本轮刷新后显示' : '暂无诊断记录' }}</div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useDashboardStore } from '../stores/dashboard';
import { PROVIDER_LABELS } from '../../shared/market';
import type { AnalysisRecord } from '../../shared/dashboard';
import { formatTime } from '../utils/format';
import AppIcon from './AppIcon.vue';
const store = useDashboardStore();
const expanded = ref(false);
const emit = defineEmits<{ select: [record: AnalysisRecord] }>();
</script>
