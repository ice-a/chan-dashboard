import { MemoryCache, KVCache } from '../server/core/cache.ts';
import type { KVBinding } from '../server/core/cache.ts';
import { createDefaultRouter, createMarketHandler } from '../server/core/http.ts';
import type { CachedCandles } from '../server/core/providerRouter.ts';


interface Env {
  MARKET_KV?: KVBinding;
  [key: string]: string | KVBinding | undefined;
}

const memory = new MemoryCache<CachedCandles>();
let handler: ((request: Request) => Promise<Response>) | undefined;
let cacheKind = '';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const nextCacheKind = env.MARKET_KV ? 'kv' : 'memory';
    if (!handler || nextCacheKind !== cacheKind) {
      const cache = env.MARKET_KV ? new KVCache(env.MARKET_KV, memory) : memory;
      handler = createMarketHandler(createDefaultRouter(cache, Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))));
      cacheKind = nextCacheKind;
    }
    return handler(request);
  },
};
