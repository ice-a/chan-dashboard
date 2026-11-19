import { MemoryCache } from '../../server/core/cache.ts';
import { createDefaultRouter, createMarketHandler } from '../../server/core/http.ts';

const handler = createMarketHandler(createDefaultRouter(new MemoryCache(), process.env));

export default { fetch: handler };
export const config = { runtime: 'nodejs' };
