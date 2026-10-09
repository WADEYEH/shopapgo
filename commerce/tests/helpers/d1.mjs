// A D1-compatible adapter over node:sqlite (in memory) so backend tests run the real
// SQL in worker/orders.js on a database built from the migrations (commerce/migrations). Requires Node 22.5+.
import { migrationSql } from "./migrations.mjs";

export async function createD1() {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  db.exec(await migrationSql());
  const plain = (row) => (row ? { ...row } : row);
  const executions = new WeakMap();
  return {
    raw: db,
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = statements.map((statement) => executions.get(statement)());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    prepare(sql) {
      const statement = db.prepare(sql);
      const make = (args) => {
        const execute = () => ({ meta: { changes: Number(statement.run(...args).changes) } });
        const prepared = {
          bind: (...next) => make(next),
          async first() { return plain(statement.get(...args)) ?? null; },
          async all() { return { results: statement.all(...args).map(plain) }; },
          async run() { return execute(); },
        };
        executions.set(prepared, execute);
        return prepared;
      };
      return make([]);
    },
  };
}

export async function sqliteAvailable() {
  try {
    await import("node:sqlite");
    return true;
  } catch {
    return false;
  }
}
