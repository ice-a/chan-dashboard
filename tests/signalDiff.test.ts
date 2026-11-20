import { describe, expect, it } from 'vitest';
import { diffSnapshotSignals } from '../server/core/signalDiff';
import type { RankedScore } from '../shared/catalog';

function score(id: string, name: string, quadrant: string, rank: number): RankedScore {
  return { instrumentId: id, name, market: 'US', kind: 'stock', momentumScore: 50, resonance: 50, quadrant, rank };
}

describe('server-side snapshot signal diff', () => {
  it('emits quadrant and rank events with the same thresholds as the browser', () => {
    const prev = [score('US:AAPL', 'Apple', 'momentum', 10), score('US:MSFT', 'Microsoft', 'resonance', 3), score('US:NVDA', 'NVIDIA', 'weak', 50)];
    const next = [score('US:AAPL', 'Apple', 'resonance', 12), score('US:MSFT', 'Microsoft', 'structure', 3), score('US:NVDA', 'NVIDIA', 'weak', 44)];
    const events = diffSnapshotSignals('run2', 'run1', prev, next, new Date('2026-11-21T00:00:00Z'));
    expect(events.map((e) => `${e.instrumentId}:${e.type}`)).toEqual(['US:AAPL:quadrant', 'US:MSFT:quadrant', 'US:NVDA:rank']);
    expect(events[0].detail).toContain('进入双高共振');
    expect(events[1].detail).toContain('退出双高共振');
    expect(events[2].detail).toContain('排名上升 6 位');
    expect(events[0].prevRunId).toBe('run1');
    expect(events[0].runId).toBe('run2');
  });

  it('skips new instruments and identical states', () => {
    const prev = [score('US:AAPL', 'Apple', 'resonance', 1)];
    const next = [score('US:AAPL', 'Apple', 'resonance', 2), score('US:TSLA', 'Tesla', 'weak', 99)];
    expect(diffSnapshotSignals('run2', 'run1', prev, next)).toEqual([]);
  });

  it('produces no events on the first snapshot (no previous)', () => {
    const next = [score('US:AAPL', 'Apple', 'resonance', 1)];
    expect(diffSnapshotSignals('run1', null, null, next)).toEqual([]);
  });

  it('emits exit-resonance wording when leaving the top quadrant', () => {
    const prev = [score('US:AAPL', 'Apple', 'resonance', 1)];
    const next = [score('US:AAPL', 'Apple', 'structure', 1)];
    const events = diffSnapshotSignals('run2', 'run1', prev, next);
    expect(events).toHaveLength(1);
    expect(events[0].detail).toContain('退出双高共振');
  });
});
