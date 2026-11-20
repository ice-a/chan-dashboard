import { ref } from 'vue';
import { defineStore } from 'pinia';
import { fetchServerSignals, type ServerSignalEvent } from '../services/serverSignals';

/** Server-published signal events (persisted, cross-device, unlike the local history store). */
export const useServerSignalsStore = defineStore('serverSignals', () => {
  const events = ref<ServerSignalEvent[]>([]);
  const loaded = ref(false);
  const unavailable = ref(false);
  async function load(force = false): Promise<void> {
    if (loaded.value && !force) return;
    try {
      events.value = await fetchServerSignals({ limit: 200 });
      unavailable.value = false;
    } catch {
      unavailable.value = true;
    } finally {
      loaded.value = true;
    }
  }
  return { events, loaded, unavailable, load };
});
