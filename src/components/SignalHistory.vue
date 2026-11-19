<template>
  <section aria-labelledby="signals-title">
    <div class="section-heading"><div><span class="section-index">04</span><h2 id="signals-title">本机信号动态</h2></div><span>从此刻开始，在浏览器里记录结构变化</span></div>
    <div class="panel signal-panel">
      <div class="signal-toolbar"><div class="signal-filters" role="group" aria-label="信号分类筛选"><button v-for="tab in tabs" :key="tab.value" :class="{ active: category === tab.value }" @click="category = tab.value">{{ tab.label }}<span>{{ count(tab.value) }}</span></button></div><div class="signal-actions"><span>仅本机保存 · 最多 {{ HISTORY_LIMIT }} 条</span><button :disabled="!filtered.length" @click="downloadSignals(filtered)"><AppIcon name="download" />导出</button><button :disabled="!history.events.length" @click="confirmClear = true">清空</button></div></div>
      <div v-if="confirmClear" class="clear-confirm" role="alert"><AppIcon name="info" /><span>清空当前浏览器保存的全部信号历史？此操作不影响收藏，且无法撤销。</span><button @click="confirmClear = false">取消</button><button class="danger" @click="clearHistory">确认清空</button></div>
      <div v-if="filtered.length" class="signal-list"><button v-for="event in visible" :key="event.id" class="signal-event" @click="open(event)"><span class="signal-event-icon" :class="event.category"><AppIcon :name="event.category === 'rank' ? 'chart' : event.category === 'structure' ? 'database' : 'clock'" /></span><span class="signal-event-body"><strong>{{ instrument(event.instrumentId)?.name ?? event.instrumentId }}<small>{{ event.instrumentId }}</small></strong><span>{{ event.summary }}</span><span class="signal-transition">{{ event.previous }}<i>→</i>{{ event.current }}</span></span><span class="signal-event-meta"><span :class="event.isUnclosed ? 'intraday' : ''">{{ event.isUnclosed ? '盘中观察' : '日线观察' }}</span><time>{{ event.sourceDate }}</time><small>{{ relativeTime(event.observedAt) }}</small></span><AppIcon name="arrow" /></button><button v-if="filtered.length > visibleCount" class="signal-more" @click="visibleCount += 8">查看更早变化 · 还有 {{ filtered.length - visibleCount }} 条</button></div>
      <div v-else class="signal-empty"><span class="signal-empty-icon"><AppIcon name="clock" /></span><div><strong>{{ history.events.length ? '当前分类暂无信号' : '第一轮，先建立观察基线' }}</strong><p>{{ history.events.length ? '可切换分类查看其他本机记录。' : '之后若出现进入/退出共振、结构观察变化或排名变化超过5位，会在这里留下记录。不会把每个分数波动当成新信号。' }}</p></div></div>
      <div class="signal-note"><AppIcon name="info" /><span>记录仅来自当前浏览器与当前地址，非跨设备云同步。盘中事件仅作观察；陈旧数据不产生新信号。这里是研究日志，不是交易提醒。</span></div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useHistoryStore } from '../stores/history';
import { INSTRUMENT_MAP } from '../config/instruments';
import { downloadSignals } from '../services/exporters';
import { HISTORY_LIMIT } from '../services/signalHistory';
import type { SignalCategory, SignalEvent } from '../services/signalHistory';
import AppIcon from './AppIcon.vue';
const emit = defineEmits<{ select: [id: string] }>();
const history = useHistoryStore();
const category = ref<'all' | SignalCategory>('all');
const confirmClear = ref(false);
const visibleCount = ref(8);
const tabs: { value: 'all' | SignalCategory; label: string }[] = [{ value: 'all', label: '全部' }, { value: 'resonance', label: '共振变化' }, { value: 'structure', label: '结构变化' }, { value: 'rank', label: '排名变化' }];
const filtered = computed(() => history.events.filter((event) => category.value === 'all' || event.category === category.value));
const visible = computed(() => filtered.value.slice(0, visibleCount.value));
const count = (value: string) => value === 'all' ? history.events.length : history.events.filter((event) => event.category === value).length;
const instrument = (id: string) => INSTRUMENT_MAP.get(id);
function open(event: SignalEvent) { if (INSTRUMENT_MAP.has(event.instrumentId)) emit('select', event.instrumentId); }
function clearHistory() { history.clear(); confirmClear.value = false; }
function relativeTime(date: string) { const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000)); return seconds < 60 ? '刚刚' : seconds < 3600 ? `${Math.floor(seconds / 60)} 分钟前` : seconds < 86400 ? `${Math.floor(seconds / 3600)} 小时前` : `${Math.floor(seconds / 86400)} 天前`; }
</script>
