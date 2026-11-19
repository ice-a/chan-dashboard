import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { INSTRUMENT_MAP } from '../config/instruments';
import { localStore, readJson, writeJson } from '../services/storage';

const KEY = 'chan-watchlist-v1';

export function validateWatchlist(value: unknown): string[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { ids?: unknown }).ids)) return [];
  return [...new Set((value as { ids: unknown[] }).ids.filter((id): id is string => typeof id === 'string' && INSTRUMENT_MAP.has(id)))];
}

export const usePreferencesStore = defineStore('preferences', () => {
  const storage = localStore();
  const watchlist = ref<string[]>(readJson(storage, KEY, validateWatchlist, []));
  const storageError = ref(false);
  const watchlistSet = computed(() => new Set(watchlist.value));
  function toggle(id: string): void {
    if (!INSTRUMENT_MAP.has(id)) return;
    watchlist.value = watchlistSet.value.has(id) ? watchlist.value.filter((item) => item !== id) : [...watchlist.value, id];
    storageError.value = !writeJson(storage, KEY, { version: 1, ids: watchlist.value });
  }
  function isWatched(id: string): boolean { return watchlistSet.value.has(id); }
  return { watchlist, watchlistSet, storageError, toggle, isWatched };
});
