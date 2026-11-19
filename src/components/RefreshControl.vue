<template>
  <section class="refresh-bar" aria-label="行情刷新控制">
    <div class="live-status"><span class="status-dot" :class="{ loading: store.loading, error: !!store.refreshError || !store.online }" /><div><strong>{{ statusText }}</strong><span v-if="store.loading" class="status-detail">{{ store.completed }} / {{ store.summary.total }} 标的已返回</span><span v-else class="status-detail">{{ store.summary.ready }} 只有效 · {{ store.summary.stale }} 只陈旧</span></div></div>
    <div class="refresh-stat"><span>行情最新交易日</span><strong>{{ store.summary.latestMarketDate ?? '—' }}</strong></div>
    <div class="refresh-stat"><span>最近成功接收</span><strong>{{ formatTime(store.summary.lastSuccessAt) }}</strong></div>
    <div v-if="store.snapshotLoading" class="refresh-stat"><span>快照加载</span><strong>分页传输中…</strong></div>
    <div class="refresh-stat next"><span>下次刷新</span><strong>{{ countdown }}</strong></div>
    <div class="refresh-actions">
      <label class="frequency"><span class="sr-only">刷新频率</span><select v-model.number="store.frequencySeconds" @change="store.nextRefreshAt = Date.now() + store.frequencySeconds * 1000"><option :value="60">1 分钟</option><option :value="300">5 分钟</option><option :value="900">15 分钟</option></select></label>
      <button class="button subtle" @click="store.autoRefresh = !store.autoRefresh"><AppIcon :name="store.autoRefresh ? 'pause' : 'play'" />{{ store.autoRefresh ? '暂停' : '继续' }}</button>
      <button class="button primary" :disabled="store.loading || !store.online" @click="store.refresh(true)"><AppIcon name="refresh" :class="{ spinning: store.loading }" />{{ store.loading ? '更新中' : '立即刷新' }}</button>
    </div>
    <div v-if="store.loading" class="load-progress" :style="{ width: `${store.completed / store.summary.total * 100}%` }" />
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useDashboardStore } from '../stores/dashboard';
import { formatTime } from '../utils/format';
import AppIcon from './AppIcon.vue';
defineProps<{ countdown: string }>();
const store = useDashboardStore();
const statusText = computed(() => !store.online ? '网络已断开' : store.loading ? '正在获取最新行情' : store.refreshError ? '行情服务异常' : store.summary.stale ? '已更新 · 含陈旧缓存' : store.records.length ? '行情已更新' : '准备连接行情源');
</script>
