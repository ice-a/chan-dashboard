import type { Instrument, MarketData, ProviderAttempt } from './market';

export type Quadrant = 'resonance' | 'structure' | 'momentum' | 'weak';
export type Direction = 'up' | 'down' | null;

export interface ChanAnalysis {
  score: number;
  observation: string;
  legacyPoint: string;
  direction: Direction;
  divergence: string;
  reason: string;
  pivotHigh: number | null;
  pivotLow: number | null;
  lastBiRange: [number, number] | null;
  area: number | null;
  candleCount: number;
  fractalCount: number;
  strokeCount: number;
  pivotCount: number;
}

export interface MomentumAnalysis {
  raw: number;
  return20: number;
  return60: number;
  return120: number;
  deviation20: number;
  deviation60: number;
  maAlignment: number;
  atrPercent: number;
  volumeRatio: number;
  riskAdjustedMomentum: number;
  last: number;
}

export type MarketSnapshot = Omit<MarketData, 'candles' | 'instrument'> & { candleCount: number };

import type { ChanStructure } from '../src/domain/chan/detail';

export interface ComputedAsset {
  chan: ChanAnalysis;
  momentum: MomentumAnalysis;
  structure: ChanStructure;
}

export interface InstrumentDetail {
  candles: import('./market').Candle[];
  structure: ChanStructure;
  snapshot: MarketSnapshot;
}

export interface AnalysisRecord {
  instrument: Instrument;
  status: 'ready' | 'unavailable';
  chanScore: number | null;
  momentumScore: number | null;
  resonance: number | null;
  quadrant: Quadrant | null;
  rank: number | null;
  rankDelta: number | null;
  chan: ChanAnalysis | null;
  momentum: MomentumAnalysis | null;
  snapshot: MarketSnapshot | null;
  attempts: ProviderAttempt[];
  error: string | null;
}

export interface DashboardSummary {
  total: number;
  ready: number;
  stale: number;
  failed: number;
  sampleSize: number;
  lastSuccessAt: string | null;
  latestMarketDate: string | null;
  algorithmVersion: 'legacy-v1';
}

export const QUADRANT_LABELS: Record<Quadrant, string> = {
  resonance: '共振强势',
  structure: '结构先行',
  momentum: '动量领先',
  weak: '双弱',
};

export const QUADRANT_COLORS: Record<Quadrant, string> = {
  resonance: '#c64c40',
  structure: '#32709b',
  momentum: '#b7792b',
  weak: '#86909b',
};
