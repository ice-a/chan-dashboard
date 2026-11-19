import { createRequire } from 'node:module';
import { resolve } from 'node:path';

/** Verify the Vercel entry locally without credentials or cloud deployment. */
const { default: vercelNode } = await import('@vercel/node');
const { build } = vercelNode as unknown as { build: (options: Record<string, unknown>) => Promise<unknown> };
const require = createRequire(resolve(process.cwd(), 'package.json'));
const entrypoint = 'api/market/[...path].ts';
const workPath = process.cwd();
const fsPath = resolve(workPath, entrypoint);

await build({
  entrypoint,
  workPath,
  repoRootPath: workPath,
  files: {
    [entrypoint]: {
      type: 'FileFsRef',
      fsPath,
      mode: 0o644,
      toStream() { return require('node:fs').createReadStream(fsPath); },
    },
  },
  config: { runtime: 'nodejs', includeFiles: ['server/**', 'shared/**', 'src/config/**'] },
  meta: { isDev: true },
});
console.log('Vercel market function build passed');
