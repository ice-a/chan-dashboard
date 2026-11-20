/**
 * Idempotent schema sync for an existing libSQL database: applies schema.sql
 * (all CREATE ... IF NOT EXISTS) and adds columns that ALTER-aware dumps may
 * miss on older databases (SQLite has no ADD COLUMN IF NOT EXISTS).
 *
 * Usage: node scripts/apply-schema.ts <libsql-url> [auth-token]
 *        env: TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@libsql/client';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv[2] ?? process.env.TURSO_DATABASE_URL;
const token = process.argv[3] ?? process.env.TURSO_AUTH_TOKEN;
if (!url) { console.error('用法: node scripts/apply-schema.ts <libsql-url> [token]'); process.exit(1); }

const client = createClient({ url, authToken: token || undefined });

async function main(): Promise<void> {
  const schema = await readFile(resolve(root, 'server/storage/schema.sql'), 'utf8');
  const statements = schema
    .split('\n').filter((line) => !line.trim().startsWith('--')).join('\n')
    .split(/;\s*\n/).map((s) => s.trim()).filter((s) => s.length);
  await client.batch(statements.map((sql) => ({ sql })), 'write');
  console.log(`schema: ${statements.length} statements ensured`);

  // Older databases created before a column existed need explicit ALTERs.
  const alters: string[] = ['ALTER TABLE scan_item ADD COLUMN claimed_at INTEGER'];
  for (const sql of alters) {
    try {
      await client.execute({ sql, args: [] });
      console.log(`alter ok: ${sql}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/duplicate column/i.test(message)) console.log(`alter skip (exists): ${sql}`);
      else throw error;
    }
  }
  const tables = await client.execute({ sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", args: [] });
  console.log('tables:', tables.rows.map((r) => r.name).join(', '));
}

main().catch((error) => { console.error(error); process.exit(1); });
