<template>
  <section aria-labelledby="signals-title">
    <div class="section-heading"><div><span class="section-index">06</span><h2 id="signals-title">信号动态</h2></div><span>服务端每日快照对比 · 本机观察补充</span></div>
    <div class="panel signal-panel">
      <div class="signal-toolbar">
        <div class="signal-filters" role="group" aria-label="信号来源与分类筛选">
          <button :class="{ active: source === 'server' }" @click="switchSource('server')">服务端信号<span>{{ serverFiltered.length }}</span></button>
          <button :class="{ active: source === 'local' }" @click="switchSource('local')">本机记录<span>{{ history.events.length }}</span></button>
        </div>
        <div class="signal-filters" role="group" aria-label="信号分类筛选">
          <button v-for="tab in tabs" :key="tab.value" :class="{ active: category === tab.value }" @click="category = tab.value">{{ tab.label }}<span>{{ count(tab.value) }}</span></button>
        </div>
        <div class="signal-actions">
          <span v-if="source === 'server'">{{ serverUnavailable ? '当前快照暂无服务端信号' : '来自已发布快照的自动对比' }}</span>
          <span v-else>仅本机保存 · 最多 {{ HISTORY_LIMIT }} 条</span>
          <button v-if="source === 'local'" :disabled="!localFiltered.length" @click="downloadSignals(localFiltered)"><AppIcon name="download" />导出</button>
          <button v-if="source === 'local'" :disabled="!history.events.length" @click="confirmClear = true">清空</button>
        </div>
      </div>
      <div v-if="source === 'local' && confirmClear" class="clear-confirm" role="alert"><AppIcon name="info" /><span>清空当前浏览器保存的全部信号历史？此操作不影响收藏，且无法撤销。</span><button @click="confirmClear = false">取消</button><button class="danger" @click="clearHistory">确认清空</button></div>
      <div v-if="filtered.length" class="signal-list">
        <template v-if="source === 'server'">
          <button v-for="event in visibleServer" :key="event.id" class="signal-event" @click="openServer(event)">
            <span class="signal-event-icon" :class="event.type"><AppIcon :name="event.type === 'rank' ? 'chart' : 'database'" /></span>
            <span class="signal-event-body"><strong>{{ event.name }}<small>{{ event.instrumentId }}</small></strong><span>{{ event.detail }}</span></span>
            <span class="signal-event-meta"><span>{{ MARKET_LABELS[event.market] ?? event.market }}</span><time>{{ event.createdAt.slice(0, 10) }}</time><small>{{ relativeTime(event.createdAt) }}</small></span>
            <AppIcon name="arrow" />
          </button>
        </template>
        <template v-else>
          <button v-for="event in visibleLocal" :key="event.id" class="signal-event" @click="open(event)">
            <span class="signal-event-icon" :class="event.category"><AppIcon :name="event.category === 'rank' ? 'chart' : event.category === 'structure' ? 'database' : 'clock'" /></span>
            <span class="signal-event-body"><strong>{{ instrument(event.instrumentId)?.name ?? event.instrumentId }}<small>{{ event.instrumentId }}</small></strong><span>{{ event.summary }}</span><span class="signal-transition">{{ event.previous }}<i>→</i>{{ event.current }}</span></span>
            <span class="signal-event-meta"><span :class="event.isUnclosed ? 'intraday' : ''">{{ event.isUnclosed ? '盘中观察' : '日线观察' }}</span><time>{{ event.sourceDate }}</time><small>{{ relativeTime(event.observedAt) }}</small></span>
            <AppIcon name="arrow" />
          </button>
        </template>
        <button v-if="filtered.length > visibleCount" class="signal-more" @click="visibleCount += 8">查看更早变化 · 还有 {{ filtered.length - visibleCount }} 条</button>
      </div>
      <div v-else class="signal-empty">
        <span class="signal-empty-icon"><AppIcon name="clock" /></span>
        <div v-if="source === 'server'">
          <strong>{{ serverUnavailable ? '服务端信号尚未开通' : '暂无服务端信号' }}</strong>
          <p>{{ serverUnavailable ? '需要 libSQL 存储驱动（当前为内存模式），或等待第一轮快照对比。' : '每日快照封口后，系统会自动对比相邻两轮排名与象限，在这里生成跨设备的信号记录。首轮发布后开始积累。' }}</p>
        </div>
        <div v-else>
          <strong>{{ history.events.length ? '当前分类暂无信号' : '第一轮，先建立观察基线' }}</strong>
          <p>{{ history.events.length ? '可切换分类查看其他本机记录。' : '之后若出现进入/退出共振、结构观察变化或排名变化超过5位，会在这里留下记录。不会把每个分数波动当成新信号。' }}</p>
        </div>
      </div>
      <div class="signal-note"><AppIcon name="info" /><span>{{ source === 'server' ? '服务端信号来自相邻已发布快照的自动对比（象限跃迁、排名变化≥5位），跨设备保存，随快照轮转保留 30 轮。这里是研究日志，不是交易提醒。' : '本机记录仅来自当前浏览器与当前地址，非跨设备云同步。盘中事件仅作观察；陈旧数据不产生新信号。这里是研究日志，不是交易提醒。' }}</span></div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useHistoryStore } from '../stores/history';
import { useServerSignalsStore } from '../stores/serverSignals';
import { INSTRUMENT_MAP } from '../config/instruments';
import { downloadSignals } from '../services/exporters';
import { HISTORY_LIMIT } from '../services/signalHistory';
import type { SignalCategory, SignalEvent } from '../services/signalHistory';
import type { ServerSignalEvent } from '../services/serverSignals';
import AppIcon from './AppIcon.vue';
const emit = defineEmits<{ select: [id: string] }>();
const history = useHistoryStore();
const serverSignals = useServerSignalsStore();
const source = ref<'server' | 'local'>('server');
const category = ref<'all' | SignalCategory>('all');
const confirmClear = ref(false);
const visibleCount = ref(8);
const MARKET_LABELS: Record<string, string> = { CN: 'A股', HK: '港股', US: '美股' };
const localTabs: { value: 'all' | SignalCategory; label: string }[] = [{ value: 'all', label: '全部' }, { value: 'resonance', label: '共振变化' }, { value: 'structure', label: '结构变化' }, { value: 'rank', label: '排名变化' }];
const serverTabs: { value: 'all' | SignalCategory; label: string }[] = [{ value: 'all', label: '全部' }, { value: 'resonance', label: '象限跃迁' }, { value: 'rank', label: '排名变化' }];
const tabs = computed(() => source.value === 'server' ? serverTabs : localTabs);

const serverFiltered = computed(() => serverSignals.events.filter((event) => category.value === 'all' || (category.value === 'rank' ? event.type === 'rank' : event.type === 'quadrant')));
const localFiltered = computed(() => history.events.filter((event) => category.value === 'all' || event.category === category.value));
const filtered = computed<unknown[]>(() => source.value === 'server' ? serverFiltered.value : localFiltered.value);
const visibleServer = computed(() => serverFiltered.value.slice(0, visibleCount.value));
const visibleLocal = computed(() => localFiltered.value.slice(0, visibleCount.value));
const serverUnavailable = computed(() => serverSignals.loaded && !serverSignals.events.length && serverSignals.unavailable);
const count = (value: string) => source.value === 'server'
  ? (value === 'all' ? serverSignals.events.length : (value === 'rank' ? serverSignals.events.filter((e) => e.type === 'rank').length : serverSignals.events.filter((e) => e.type === 'quadrant').length))
  : (value === 'all' ? history.events.length : history.events.filter((event) => event.category === value).length);
const instrument = (id: string) => INSTRUMENT_MAP.get(id);
function switchSource(next: 'server' | 'local'): void {
  source.value = next;
  visibleCount.value = 8;
  // 'structure' has no server equivalent; snap back to all when switching sources.
  if (next === 'server' && category.value === 'structure') category.value = 'all';
  if (next === 'server') void serverSignals.load(true);
}
function openServer(event: ServerSignalEvent) { emit('select', event.instrumentId); }
function open(event: SignalEvent) { if (INSTRUMENT_MAP.has(event.instrumentId)) emit('select', event.instrumentId); }
function clearHistory() { history.clear(); confirmClear.value = false; }
function relativeTime(date: string) { const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000)); return seconds < 60 ? '刚刚' : seconds < 3600 ? `${Math.floor(seconds / 60)} 分钟前` : seconds < 86400 ? `${Math.floor(seconds / 3600)} 小时前` : `${Math.floor(seconds / 86400)} 天前`; }
onMounted(() => { void serverSignals.load(); });
</script>
