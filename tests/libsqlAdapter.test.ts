import { describe, expect, it, vi } from 'vitest';
import { LibSqlDatabase } from '../server/storage/libsqlD1';

function fakeClient() {
  const calls: { sql: string; args: unknown[] }[] = [];
  const batchCalls: { mode: string; count: number }[] = [];
  const client = {
    execute: vi.fn(async (stmt: { sql: string; args?: unknown[] }) => {
      calls.push({ sql: stmt.sql, args: stmt.args ?? [] });
      if (stmt.sql.startsWith('SELECT')) {
        if (stmt.sql.includes('empty')) return { columns: ['id'], rows: [], rowsAffected: 0 };
        return { columns: ['id', 'name'], rows: [{ id: 'US:AAPL', name: 'Apple' }], rowsAffected: 0 };
      }
      return { columns: [], rows: [], rowsAffected: 3 };
    }),
    batch: vi.fn(async (stmts: { sql: string; args?: unknown[] }[], mode: string) => {
      batchCalls.push({ mode, count: stmts.length });
      return stmts.map(() => ({ type: 'ok', response: { type: 'execute', result: { type: 'ok', cols: [], rows: [] } } }));
    }),
  };
  return { client, calls, batchCalls };
}

describe('libSQL D1 adapter', () => {
  it('maps prepare/bind/first onto client.execute with args', async () => {
    const { client, calls } = fakeClient();
    const db = new LibSqlDatabase(client);
    const row = await db.prepare('SELECT * FROM instrument WHERE version = ? AND id = ?').bind('v1', 'US:AAPL').first<{ id: string }>();
    expect(row).toEqual({ id: 'US:AAPL', name: 'Apple' });
    expect(calls).toEqual([{ sql: 'SELECT * FROM instrument WHERE version = ? AND id = ?', args: ['v1', 'US:AAPL'] }]);
  });

  it('returns null from first() when no rows', async () => {
    const { client } = fakeClient();
    const db = new LibSqlDatabase(client);
    const row = await db.prepare('SELECT * FROM empty').first();
    expect(row).toBeNull();
  });

  it('maps all() to { results, success }', async () => {
    const { client } = fakeClient();
    const db = new LibSqlDatabase(client);
    const page = await db.prepare('SELECT * FROM instrument').all<{ id: string }>();
    expect(page.success).toBe(true);
    expect(page.results).toEqual([{ id: 'US:AAPL', name: 'Apple' }]);
  });

  it('maps run() and reports rowsAffected in meta', async () => {
    const { client } = fakeClient();
    const db = new LibSqlDatabase(client);
    const meta = await db.prepare('UPDATE scan_item SET status = ?').bind('succeeded').run();
    expect(meta.success).toBe(true);
    expect(meta.meta?.changes).toBe(3);
  });

  it('routes batch() through client.batch in write mode and reuses bound statements', async () => {
    const { client, batchCalls } = fakeClient();
    const db = new LibSqlDatabase(client);
    const statements = [db.prepare('INSERT OR REPLACE INTO score VALUES (?)').bind('a'), db.prepare('DELETE FROM stage_row')];
    const result = await db.batch(statements);
    expect(result).toEqual([{ success: true }, { success: true }]);
    expect(batchCalls).toEqual([{ mode: 'write', count: 2 }]);
    expect(client.batch).toHaveBeenCalledWith(
      [
        { sql: 'INSERT OR REPLACE INTO score VALUES (?)', args: ['a'] },
        { sql: 'DELETE FROM stage_row', args: [] },
      ],
      'write',
    );
  });

  it('rejects a client without execute/batch', () => {
    expect(() => new LibSqlDatabase({})).toThrow();
    expect(() => new LibSqlDatabase(null)).toThrow();
  });

  it('supports empty batch as a no-op', async () => {
    const { client, batchCalls } = fakeClient();
    const db = new LibSqlDatabase(client);
    expect(await db.batch([])).toEqual([]);
    expect(batchCalls).toHaveLength(0);
  });
});
