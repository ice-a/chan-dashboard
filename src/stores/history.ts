import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { HISTORY_KEY, emptyHistory, mergeSignals, validateHistory } from '../services/signalHistory';
import type { SignalEvent } from '../services/signalHistory';
import type { AnalysisRecord } from '../../shared/dashboard';
import { localStore, readJson, writeJson } from '../services/storage';

export const useHistoryStore = defineStore('history', () => {
  const storage = localStore();
  const history = ref(readJson(storage, HISTORY_KEY, validateHistory, emptyHistory()));
  const storageError = ref(false);
  const events = computed<SignalEvent[]>(() => history.value.events);
  function capture(records: AnalysisRecord[]): void {
    history.value = mergeSignals(records, history.value);
    storageError.value = !writeJson(storage, HISTORY_KEY, history.value);
  }
  function clear(): void {
    history.value = emptyHistory();
    storageError.value = !writeJson(storage, HISTORY_KEY, history.value);
  }
  return { history, events, storageError, capture, clear };
});
