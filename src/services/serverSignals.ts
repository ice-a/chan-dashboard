/** Server-side signal events (cross-snapshot diffs produced by the cron finalize). */
export interface ServerSignalEvent {
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

export async function fetchServerSignals(query: { since?: string; limit?: number } = {}): Promise<ServerSignalEvent[]> {
  const params = new URLSearchParams();
  if (query.since) params.set('since', query.since);
  params.set('limit', String(query.limit ?? 200));
  const body = await fetch(`/api/snapshots/signals?${params}`).then((r) => r.json()) as { ok: boolean; events?: ServerSignalEvent[]; note?: string };
  return body.ok && Array.isArray(body.events) ? body.events : [];
}
