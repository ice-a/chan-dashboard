import type { Candle } from '../../shared/market.ts';
import type { ComputedAsset, AnalysisRecord } from '../../shared/dashboard.ts';
import { analyzeChan } from './chan/analyze.ts';
import { buildChanStructure } from './chan/detail.ts';
import { analyzeMomentum, crossSectionScores } from './momentum/analyze.ts';

export function computeAsset(candles: Candle[]): ComputedAsset | null {
  const structure = buildChanStructure(candles);
  const chan = analyzeChan(candles, structure);
  const momentum = analyzeMomentum(candles);
  return chan && momentum ? { chan, momentum, structure } : null;
}

export function rankResonance(records: AnalysisRecord[], percentileScores?: Map<NonNullable<AnalysisRecord['momentum']>, number>): AnalysisRecord[] {
  const eligible = records.filter((record) => record.chan && record.momentum);
  const scores = percentileScores ?? crossSectionScores(eligible.map((record) => record.momentum!));
  for (const record of eligible) {
    const chan = record.chan!.score;
    const momentum = scores.get(record.momentum!)!;
    record.chanScore = chan;
    record.momentumScore = momentum;
    record.resonance = Math.round(Math.sqrt(Math.max(0, chan) * Math.max(0, momentum)) * 10) / 10;
    const strongChan = chan >= 78, strongMomentum = momentum >= 70;
    record.quadrant = strongChan && strongMomentum ? 'resonance' : strongChan ? 'structure' : strongMomentum ? 'momentum' : 'weak';
  }
  const ordered = [...eligible].sort((a, b) => (b.resonance! - a.resonance!) || (b.momentumScore! - a.momentumScore!) || a.instrument.id.localeCompare(b.instrument.id));
  ordered.forEach((record, index) => { record.rank = index + 1; });
  return records;
}

export function applyRankChanges(records: AnalysisRecord[], previous: AnalysisRecord[]): void {
  const previousRanks = new Map(previous.filter((r) => r.rank !== null).map((r) => [r.instrument.id, r.rank!]));
  for (const record of records) {
    const oldRank = previousRanks.get(record.instrument.id);
    record.rankDelta = oldRank === undefined || record.rank === null ? null : oldRank - record.rank;
  }
}
