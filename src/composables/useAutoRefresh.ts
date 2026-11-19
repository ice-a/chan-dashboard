import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useDashboardStore } from '../stores/dashboard';

export function useAutoRefresh() {
  const store = useDashboardStore();
  const countdown = ref('—');
  let timer: ReturnType<typeof setInterval> | undefined;

  function tick() {
    if (!store.autoRefresh || store.loading || document.hidden || !store.online) {
      countdown.value = !store.online ? '等待网络' : document.hidden ? '后台暂停' : store.autoRefresh ? '计算中' : '已暂停';
      return;
    }
    const left = Math.max(0, (store.nextRefreshAt ?? Date.now()) - Date.now());
    if (left <= 0) { void store.refresh(); return; }
    const seconds = Math.ceil(left / 1000);
    countdown.value = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function onVisibility() { if (!document.hidden && store.autoRefresh && (store.nextRefreshAt ?? 0) <= Date.now()) void store.refresh(); }
  function onOnline() { store.online = true; void store.refresh(); }
  function onOffline() { store.online = false; }

  onMounted(() => {
    timer = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    tick();
  });
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    store.cancel();
  });
  return { countdown };
}
