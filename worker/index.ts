import { createClient } from '@libsql/client/web';
import { MemoryCache } from '../server/core/cache.ts';
import { D1MarketCache } from '../server/storage/d1Cache.ts';
import { D1ResearchStore } from '../server/storage/d1Store.ts';
import { LibSqlDatabase } from '../server/storage/libsqlD1.ts';
import { createDefaultResearchStore } from '../server/storage/researchStore.ts';
import type { ResearchStore } from '../server/storage/researchStore.ts';
import { createDefaultRouter, createMarketHandler, createResearchHandler } from '../server/core/http.ts';
import type { ProviderRouter } from '../server/core/providerRouter.ts';
import { runCronTick } from '../server/core/cronRunner.ts';
import { hasNotifier, type NotifyConfig } from '../server/core/notify.ts';
import type { CachedCandles } from '../server/core/providerRouter.ts';

interface Env {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  CRON_SCAN_BATCH?: string;
  CRON_CYCLE_HOUR_UTC?: string;
  CRON_CN_SYNC_DEADLINE_HOURS?: string;
  NOTIFY_BARK_URL?: string;
  NOTIFY_NTFY_URL?: string;
  NOTIFY_WEBHOOK_URL?: string;
  [key: string]: unknown;
}

let marketHandler: ((request: Request) => Promise<Response>) | undefined;
let researchHandler: ((request: Request) => Promise<Response>) | undefined;
let sharedRouter: ProviderRouter | undefined;
let sharedStore: ResearchStore | undefined;
let sharedNotify: NotifyConfig | undefined;
let cacheKind = '';

function notifyFrom(env: Env): NotifyConfig | undefined {
  const config: NotifyConfig = { barkUrl: env.NOTIFY_BARK_URL, ntfyUrl: env.NOTIFY_NTFY_URL, webhookUrl: env.NOTIFY_WEBHOOK_URL };
  return hasNotifier(config) ? config : undefined;
}

function ensure(env: Env): void {
  // libSQL (Turso) carries catalog, scans, scores and the bar cache; memory is the no-config fallback.
  const nextKind = env.TURSO_DATABASE_URL ? 'libsql' : 'memory';
  if (marketHandler && nextKind === cacheKind) return;
  cacheKind = nextKind;
  let cache: Parameters<typeof createDefaultRouter>[0];
  let store: ResearchStore;
  if (env.TURSO_DATABASE_URL) {
    const client = createClient({
      url: env.TURSO_DATABASE_URL,
      authToken: typeof env.TURSO_AUTH_TOKEN === 'string' && env.TURSO_AUTH_TOKEN ? env.TURSO_AUTH_TOKEN : undefined,
    });
    const db = new LibSqlDatabase(client);
    cache = new D1MarketCache<CachedCandles>(db);
    store = new D1ResearchStore(db);
  } else {
    cache = new MemoryCache<CachedCandles>();
    store = createDefaultResearchStore();
  }
  const router = createDefaultRouter(cache, env as Record<string, string | undefined>);
  sharedRouter = router;
  sharedStore = store;
  sharedNotify = notifyFrom(env);
  marketHandler = createMarketHandler(router);
  // Workers cannot keep long background jobs alive after a response; the dashboard drives scan/sync steps,
  // and scheduled(cron) ticks advance the same persisted pipeline server-side.
  const adminToken = typeof env.RESEARCH_ADMIN_TOKEN === 'string' && env.RESEARCH_ADMIN_TOKEN ? env.RESEARCH_ADMIN_TOKEN : undefined;
  researchHandler = createResearchHandler(router, { store, backgroundScan: !env.TURSO_DATABASE_URL, adminToken, notify: sharedNotify });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    ensure(env);
    const path = new URL(request.url).pathname;
    const handler = path.startsWith('/api/catalog') || path.startsWith('/api/scans') || path.startsWith('/api/snapshots') || path.startsWith('/api/pipeline')
      ? researchHandler!
      : marketHandler!;
    return handler(request);
  },
  // Cloudflare cron trigger: advance one bounded slice of the daily
  // sync→scan→finalize cycle per tick. Persisted progress in libSQL makes
  // every tick resumable; the dashboard keeps working exactly as before.
  async scheduled(event: { cron: string }, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<void> {
    ensure(env);
    if (!env.TURSO_DATABASE_URL || !sharedRouter || !sharedStore) return;
    ctx.waitUntil(runCronTick({
      store: sharedStore,
      router: sharedRouter,
      batchSize: Number(env.CRON_SCAN_BATCH) || 16,
      cycleHourUtc: Number(env.CRON_CYCLE_HOUR_UTC) || 16,
      cnSyncDeadlineHours: Number(env.CRON_CN_SYNC_DEADLINE_HOURS) || 0,
      // Verification override: CRON_IGNORE_GATE=1 unblocks the daily gate any
      // time of day (used to confirm the pipeline live; remove once verified).
      ignoreDailyGate: env.CRON_IGNORE_GATE === '1',
      notify: sharedNotify,
    }).then((result) => console.log(`[cron ${event.cron}] ${result.action}: ${result.detail}`))
      .catch((error) => console.error('[cron] tick failed', error)));
  },
};
