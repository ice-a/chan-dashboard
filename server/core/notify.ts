import type { StoredSignalEvent } from './signalDiff.ts';

/**
 * Lightweight push channels, all optional and fire-and-forget:
 *  - barkUrl:    full Bark base URL including the device key
 *                (https://api.day.app/<key> or a self-hosted server)
 *  - ntfyUrl:    ntfy topic URL (https://ntfy.sh/<topic> or self-hosted)
 *  - webhookUrl: generic JSON webhook — POST {source,title,body}
 */
export interface NotifyConfig {
  barkUrl?: string;
  ntfyUrl?: string;
  webhookUrl?: string;
}

export interface NotifyPayload {
  title: string;
  body: string;
  group?: string;
  level?: string;
}

export function hasNotifier(config: NotifyConfig | undefined): boolean {
  return !!config && !!(config.barkUrl || config.ntfyUrl || config.webhookUrl);
}

/** Send to every configured channel. Returns per-channel outcome strings; never throws. */
export async function sendNotification(
  config: NotifyConfig,
  payload: NotifyPayload,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<string[]> {
  const results: string[] = [];
  const body = payload.body.slice(0, 4000);
  const group = payload.group ?? 'chan-dashboard';
  if (config.barkUrl) {
    try {
      const response = await fetchImpl(config.barkUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: payload.title, body, group, level: payload.level, sound: payload.level ? 'bell' : undefined }),
        signal: AbortSignal.timeout(8000),
      });
      results.push(`bark:${response.status}`);
    } catch { results.push('bark:error'); }
  }
  if (config.ntfyUrl) {
    try {
      // ntfy reads metadata from headers; non-ASCII titles must be URL-encoded.
      const response = await fetchImpl(config.ntfyUrl, {
        method: 'POST',
        headers: {
          title: encodeURIComponent(payload.title),
          priority: payload.level === 'timeSensitive' ? '4' : '3',
          tags: 'chart_with_upwards_trend',
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      results.push(`ntfy:${response.status}`);
    } catch { results.push('ntfy:error'); }
  }
  if (config.webhookUrl) {
    try {
      const response = await fetchImpl(config.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'chan-dashboard', title: payload.title, body }),
        signal: AbortSignal.timeout(8000),
      });
      results.push(`webhook:${response.status}`);
    } catch { results.push('webhook:error'); }
  }
  return results;
}

/** Compose the daily snapshot publication message from the run's signal events. */
export function buildFinalizeNotification(input: {
  events: StoredSignalEvent[];
  scored: number;
  total: number;
  snapshotDate: string;
}): NotifyPayload {
  const quadrants = input.events.filter((event) => event.type === 'quadrant');
  const enters = quadrants.filter((event) => event.detail.includes('进入双高共振'));
  const exits = quadrants.filter((event) => event.detail.includes('退出双高共振'));
  const rankMoves = input.events.filter((event) => event.type === 'rank');
  const lines = [
    `评分 ${input.scored}/${input.total}`,
    `象限跃迁 ${quadrants.length}（进共振 ${enters.length} · 出共振 ${exits.length}）· 排名变动 ${rankMoves.length}`,
  ];
  for (const event of quadrants.slice(0, 6)) lines.push(`${event.name}：${event.detail}`);
  if (quadrants.length > 6) lines.push(`…另有 ${quadrants.length - 6} 条象限变化`);
  return {
    title: `缠论快照发布 · ${input.snapshotDate}`,
    body: lines.join('\n'),
    group: 'chan-dashboard',
  };
}
