import type { RankedScore } from '../../shared/catalog.ts';
import { QUADRANT_LABELS } from '../../shared/dashboard.ts';

export interface StoredSignalEvent {
  id: string;
  runId: string;
  prevRunId: string | null;
  instrumentId: string;
  name: string;
  market: string;
  kind: string;
  type: 'quadrant' | 'rank';
  detail: string;
  createdAt: string;
}

/**
 * Diff two consecutive published snapshots into server-side signal events.
 * Mirrors the browser's mergeSignals rules (same thresholds), but the states
 * live in the database, so signals survive across devices and sessions.
 */
export function diffSnapshotSignals(
  runId: string,
  prevRunId: string | null,
  prevScores: RankedScore[] | null,
  nextScores: RankedScore[],
  now = new Date(),
): StoredSignalEvent[] {
  const events: StoredSignalEvent[] = [];
  const createdAt = now.toISOString();
  const prevByInstrument = new Map((prevScores ?? []).map((score) => [score.instrumentId, score]));
  for (const next of nextScores) {
    const prev = prevByInstrument.get(next.instrumentId);
    if (!prev) continue;
    const emit = (type: StoredSignalEvent['type'], detail: string) => {
      events.push({
        id: `${next.instrumentId}:${createdAt}:${type}`,
        runId, prevRunId,
        instrumentId: next.instrumentId, name: next.name, market: next.market, kind: next.kind,
        type, detail, createdAt,
      });
    };
    if (prev.quadrant !== next.quadrant) {
      const wasResonance = prev.quadrant === 'resonance';
      const isResonance = next.quadrant === 'resonance';
      const prevLabel = (QUADRANT_LABELS as Record<string, string>)[prev.quadrant] ?? prev.quadrant;
      const nextLabel = (QUADRANT_LABELS as Record<string, string>)[next.quadrant] ?? next.quadrant;
      emit('quadrant', isResonance
        ? `进入双高共振（原 ${prevLabel}）`
        : wasResonance
          ? `退出双高共振（现 ${nextLabel}）`
          : `象限变化：${prevLabel} → ${nextLabel}`);
    }
    if (Math.abs(prev.rank - next.rank) >= 5) {
      emit('rank', prev.rank > next.rank
        ? `排名上升 ${prev.rank - next.rank} 位（第 ${prev.rank} → ${next.rank}）`
        : `排名下降 ${next.rank - prev.rank} 位（第 ${prev.rank} → ${next.rank}）`);
    }
  }
  return events;
}
