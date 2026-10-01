// A D1-compatible adapter over node:sqlite (in memory) so backend tests run the real
// SQL in worker/orders.js and worker/schema.sql. Requires Node 22.5+.
import { readFile } from "node:fs/promises";

export async function createD1() {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  db.exec(await readFile(new URL("../../worker/schema.sql", import.meta.url), "utf8"));
  const plain = (row) => (row ? { ...row } : row);
  return {
    raw: db,
    prepare(sql) {
      const statement = db.prepare(sql);
      const make = (args) => ({
        bind: (...next) => make(next),
        async first() { return plain(statement.get(...args)) ?? null; },
        async all() { return { results: statement.all(...args).map(plain) }; },
        async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; },
      });
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
