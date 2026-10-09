// The D1 migrations (commerce/migrations/NNNN_name.sql) in the order wrangler applies them, for tests that build a
// database the way staging and production get theirs.
import { readdir, readFile } from "node:fs/promises";

export const MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url);
export const MIGRATION_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;

export async function migrations() {
  const names = (await readdir(MIGRATIONS_DIR)).filter((name) => MIGRATION_NAME.test(name)).sort();
  return Promise.all(names.map(async (name) => ({ name, sql: await readFile(new URL(name, MIGRATIONS_DIR), "utf8") })));
}

export async function migrationSql() {
  return (await migrations()).map((migration) => migration.sql).join("\n");
}
