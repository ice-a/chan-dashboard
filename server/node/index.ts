import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { MemoryCache } from '../core/cache.ts';
import { D1MarketCache } from '../storage/d1Cache.ts';
import { D1ResearchStore } from '../storage/d1Store.ts';
import { LibSqlDatabase } from '../storage/libsqlD1.ts';
import { createDefaultRouter, createMarketHandler, createResearchHandler, json } from '../core/http.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = resolve(root, 'dist');
const cliToken = process.argv.includes('--research-token') ? process.argv[process.argv.indexOf('--research-token') + 1] : undefined;
// TURSO_DATABASE_URL (libsql:// 远程或 file: 本地文件) 开启持久化；未配置时使用进程内存。
const libSqlUrl = process.env.TURSO_DATABASE_URL;
const router = libSqlUrl
  ? createDefaultRouter(new D1MarketCache(new LibSqlDatabase(createClient({ url: libSqlUrl, authToken: process.env.TURSO_AUTH_TOKEN || undefined }))), process.env)
  : createDefaultRouter(new MemoryCache(), process.env);
const researchStore = libSqlUrl
  ? new D1ResearchStore(new LibSqlDatabase(createClient({ url: libSqlUrl, authToken: process.env.TURSO_AUTH_TOKEN || undefined })), { driver: 'server' })
  : undefined;
const researchHandler = createResearchHandler(router, researchStore ? { store: researchStore, adminToken: cliToken } : (cliToken ? { adminToken: cliToken } : {}));
const marketHandler = createMarketHandler(router);
// Catalog sync and full scans must not be bound by the short request timeout.
const LONG_PATHS = new Set(['/api/catalog/sync', '/api/scans']);
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      const isLong = LONG_PATHS.has(url.pathname) || /^\/api\/scans\/[^/]+\/retry$/.test(url.pathname);
      const signal = isLong ? undefined : AbortSignal.timeout(30_000);
      const handler = url.pathname.startsWith('/api/catalog') || url.pathname.startsWith('/api/scans') || url.pathname.startsWith('/api/snapshots') ? researchHandler : marketHandler;
      // Forward the request body so POST payloads (instrumentIds, scores, ...) reach the handler.
      const hasBody = (req.method === 'POST' || req.method === 'PUT') && Number(req.headers['content-length'] ?? 1) > 0;
      // Stream bodies on Node's undici require duplex: 'half'.
      const response = await handler(new Request(url, { method: req.method, signal, headers: req.headers as Record<string, string>, ...(hasBody ? { body: Readable.toWeb(req) as ReadableStream, duplex: 'half' as const } : {}) }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    const requested = decodeURIComponent(url.pathname);
    let path = resolve(dist, `.${requested}`);
    if (path !== dist && !path.startsWith(`${dist}${sep}`)) { res.writeHead(403).end(); return; }
    try { if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html'); } catch { path = resolve(dist, 'index.html'); }
    const body = await readFile(path);
    res.writeHead(200, {
      'content-type': mime[extname(path)] ?? 'application/octet-stream',
      'cache-control': path.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error(error);
    const response = json({ error: '服务器暂时无法处理请求' }, 500);
    res.writeHead(500, Object.fromEntries(response.headers));
    res.end(await response.text());
  }
}).listen(Number(process.env.PORT) || 8787, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`Chan dashboard: http://${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT || 8787}`);
});
