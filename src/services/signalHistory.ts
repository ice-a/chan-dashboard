import type { AnalysisRecord, Quadrant } from '../../shared/dashboard';
import { QUADRANT_LABELS } from '../../shared/dashboard';

export type SignalCategory = 'resonance' | 'structure' | 'rank';

export interface SignalEvent {
  id: string;
  instrumentId: string;
  category: SignalCategory;
  observedAt: string;
  sourceDate: string;
  isUnclosed: boolean;
  summary: string;
  previous: string;
  current: string;
  quadrant: Quadrant;
  rank: number;
}

interface StoredState { quadrant: Quadrant; observation: string; rank: number }
export interface SignalHistory { version: 1; events: SignalEvent[]; states: Record<string, StoredState> }

export const HISTORY_KEY = 'chan-signal-history-v1';
export const HISTORY_LIMIT = 240;
export const emptyHistory = (): SignalHistory => ({ version: 1, events: [], states: {} });

export function validateHistory(value: unknown): SignalHistory {
  if (!value || typeof value !== 'object') return emptyHistory();
  const history = value as Partial<SignalHistory>;
  const events = Array.isArray(history.events) ? history.events.filter(isEvent).slice(0, HISTORY_LIMIT) : [];
  const states = history.states && typeof history.states === 'object' ? Object.fromEntries(Object.entries(history.states).filter((entry): entry is [string, StoredState] => isState(entry[1]))) : {};
  return { version: 1, events, states };
}

export function mergeSignals(records: AnalysisRecord[], history: SignalHistory, now = new Date()): SignalHistory {
  const states = { ...history.states };
  const events: SignalEvent[] = [];
  for (const record of records) {
    if (record.status !== 'ready' || record.snapshot?.stale || !record.quadrant || !record.chan || record.rank === null) continue;
    const id = record.instrument.id;
    const previous = states[id];
    const current: StoredState = { quadrant: record.quadrant, observation: record.chan.observation, rank: record.rank };
    states[id] = current;
    if (!previous) continue;
    const observedAt = record.snapshot!.receivedAt || now.toISOString();
    const append = (category: SignalCategory, before: string, after: string, summary: string) => {
      const event: SignalEvent = { id: `${id}:${observedAt}:${category}`, instrumentId: id, category, observedAt, sourceDate: record.snapshot!.sourceDate, isUnclosed: record.snapshot!.isUnclosed, summary, previous: before, current: after, quadrant: record.quadrant!, rank: record.rank! };
      if (!events.some((existing) => existing.id === event.id) && !history.events.some((existing) => existing.id === event.id)) events.push(event);
    };
    if (previous.quadrant !== record.quadrant) {
      const wasResonance = previous.quadrant === 'resonance', isResonance = record.quadrant === 'resonance';
      append(isResonance || wasResonance ? 'resonance' : 'structure', QUADRANT_LABELS[previous.quadrant], QUADRANT_LABELS[record.quadrant], isResonance ? '进入双高共振' : wasResonance ? '退出双高共振' : '象限发生变化');
    }
    if (previous.observation !== record.chan.observation) append('structure', previous.observation, record.chan.observation, '结构观察发生变化');
    if (Math.abs(previous.rank - record.rank) >= 5) append('rank', `第 ${previous.rank} 名`, `第 ${record.rank} 名`, record.rank < previous.rank ? `排名上升 ${previous.rank - record.rank} 位` : `排名下降 ${record.rank - previous.rank} 位`);
  }
  return { version: 1, states, events: [...events.reverse(), ...history.events].slice(0, HISTORY_LIMIT) };
}

function isEvent(value: unknown): value is SignalEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<SignalEvent>;
  return typeof event.id === 'string' && typeof event.instrumentId === 'string' && ['resonance', 'structure', 'rank'].includes(event.category ?? '') && typeof event.observedAt === 'string' && typeof event.summary === 'string' && typeof event.quadrant === 'string' && typeof event.rank === 'number';
}
function isState(value: unknown): value is StoredState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<StoredState>;
  return typeof state.quadrant === 'string' && ['resonance', 'structure', 'momentum', 'weak'].includes(state.quadrant) && typeof state.observation === 'string' && typeof state.rank === 'number';
}
