import { MemoryCache, KVCache } from '../server/core/cache.ts';
import { D1MarketCache } from '../server/storage/d1Cache.ts';
import { D1ResearchStore } from '../server/storage/d1Store.ts';
import { createDefaultResearchStore } from '../server/storage/researchStore.ts';
import { createDefaultRouter, createMarketHandler, createResearchHandler } from '../server/core/http.ts';
import type { CachedCandles } from '../server/core/providerRouter.ts';

interface Env {
  MARKET_KV?: { get: (key: string, type: 'json') => Promise<unknown>; put: (key: string, value: string, options: { expirationTtl: number }) => Promise<void> };
  DB?: unknown;
  [key: string]: unknown;
}

let marketHandler: ((request: Request) => Promise<Response>) | undefined;
let researchHandler: ((request: Request) => Promise<Response>) | undefined;
let cacheKind = '';

function ensure(env: Env): void {
  // D1 (catalog + scans + bar cache) wins over KV; KV wins over process memory.
  const nextKind = env.DB ? 'd1' : env.MARKET_KV ? 'kv' : 'memory';
  if (marketHandler && nextKind === cacheKind) return;
  cacheKind = nextKind;
  const cache = (env.DB
    ? new D1MarketCache<CachedCandles>(env.DB)
    : env.MARKET_KV
      ? new KVCache<CachedCandles>(env.MARKET_KV as never)
      : new MemoryCache<CachedCandles>()) as Parameters<typeof createDefaultRouter>[0];
  const store = env.DB ? new D1ResearchStore(env.DB) : createDefaultResearchStore();
  const router = createDefaultRouter(cache, env as Record<string, string | undefined>);
  marketHandler = createMarketHandler(router);
  // Workers cannot keep long background jobs alive after a response; the dashboard drives scan/sync steps.
  researchHandler = createResearchHandler(router, { store, backgroundScan: !env.DB });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    ensure(env);
    const path = new URL(request.url).pathname;
    const handler = path.startsWith('/api/catalog') || path.startsWith('/api/scans') || path.startsWith('/api/snapshots')
      ? researchHandler!
      : marketHandler!;
    return handler(request);
  },
};
