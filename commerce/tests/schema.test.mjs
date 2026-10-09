// D1 migrations (commerce/migrations, D45): numbered files that wrangler applies once each, additive only. New tables,
// indexes and columns are fine; a DROP, RENAME, type change or data rewrite is not, so the version running before a
// deploy keeps working on the new structure and a rollback stays safe. These tests apply the migrations on top of the
// production structure (fixture exported read-only from the production D1 on 2026-10-06) and on a fresh database.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sqliteAvailable } from "./helpers/d1.mjs";
import { MIGRATION_NAME, migrations } from "./helpers/migrations.mjs";

const skip = (await sqliteAvailable()) ? false : "node:sqlite unavailable";
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const production = await read("tests/fixtures/production-schema-2026-10-06.sql");
const all = await migrations();

// Tables that exist only in this repo: the production upgrade adds them.
const ADDED = [
  "admin_audit",
  "admin_members",
  "checkout_payments",
  "contact_messages",
  "cron_runs",
  "customer_email_events",
  "customer_email_suppressions",
  "mcf_submission_queue",
  "order_cancellations",
  "order_email_delivery",
  "order_email_jobs",
  "order_message_jobs",
  "order_payment_failures",
  "order_refunds",
  "staging_fake_mcf_orders",
  "team_alerts",
];

const statements = (sql) => sql.replace(/--[^\n]*/g, "").split(";").map((part) => part.trim()).filter(Boolean);
const tables = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
const columns = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all()
  .map(({ name, type, notnull, dflt_value, pk }) => ({ name, type, notnull, dflt_value, pk }));

async function database(sql) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  db.exec(sql);
  return db;
}

// One statement is allowed when it only adds: a missing table or index, or a column a running version can ignore.
function additive(statement) {
  if (/^CREATE TABLE IF NOT EXISTS \w+/i.test(statement)) return true;
  if (/^CREATE (UNIQUE )?INDEX IF NOT EXISTS \w+ ON \w+/i.test(statement)) return true;
  const column = statement.match(/^ALTER TABLE \w+ ADD COLUMN \w+ (.*)$/is);
  if (!column) return false;
  // A NOT NULL column needs a default, or every insert from the version before the deploy would fail.
  return !/\bNOT NULL\b/i.test(column[1]) || /\bDEFAULT\b/i.test(column[1]);
}

test("migration files are numbered in order from 0001, snake_case, and the old schema.sql is gone", () => {
  assert.ok(all.length >= 2);
  all.forEach(({ name }, index) => {
    assert.match(name, MIGRATION_NAME);
    assert.equal(name.slice(0, 4), String(index + 1).padStart(4, "0"), `${name} follows ${index ? all[index - 1].name : "nothing"}`);
  });
  assert.equal(existsSync(new URL("../worker/schema.sql", import.meta.url)), false);
});

test("every migration statement only adds (D45): no DROP, RENAME, type change, or data rewrite", () => {
  for (const { name, sql } of all) {
    for (const statement of statements(sql)) assert.ok(additive(statement), `${name}: ${statement.slice(0, 90)}`);
  }
  // The rule itself.
  for (const ok of ["CREATE TABLE IF NOT EXISTS a (x TEXT)", "CREATE INDEX IF NOT EXISTS i ON a (x)", "ALTER TABLE a ADD COLUMN y TEXT", "ALTER TABLE a ADD COLUMN y INTEGER NOT NULL DEFAULT 0"]) {
    assert.ok(additive(ok), ok);
  }
  for (const bad of ["DROP TABLE a", "ALTER TABLE a RENAME TO b", "ALTER TABLE a RENAME COLUMN x TO y", "ALTER TABLE a DROP COLUMN x", "UPDATE a SET x = 1", "DELETE FROM a", "INSERT INTO a VALUES (1)", "CREATE TABLE a (x TEXT)", "ALTER TABLE a ADD COLUMN y TEXT NOT NULL"]) {
    assert.equal(additive(bad), false, bad);
  }
});

test("on the production structure, the migrations add the new tables and leave every existing column as it was", { skip }, async () => {
  const db = await database(production);
  const before = tables(db);
  assert.equal(before.length, 10);
  const shape = Object.fromEntries(before.map((table) => [table, columns(db, table)]));

  for (const { sql } of all) db.exec(sql);
  assert.deepEqual(tables(db).filter((table) => !before.includes(table)), ADDED);
  for (const table of before) {
    const now = columns(db, table);
    assert.deepEqual(now.slice(0, shape[table].length), shape[table], `${table}: existing columns unchanged (new ones may follow)`);
  }
});

test("the baseline (0001) is safe on a database that already has its tables: applying it again changes nothing", { skip }, async () => {
  const db = await database(production);
  db.exec(all[0].sql);
  const snapshot = db.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all().map((row) => ({ ...row }));
  db.exec(all[0].sql);
  assert.deepEqual(db.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all().map((row) => ({ ...row })), snapshot);
});

test("a fresh database gets the production tables with the same columns, plus the new ones", { skip }, async () => {
  const fresh = await database(all.map((m) => m.sql).join("\n"));
  const prod = await database(production);
  const shared = tables(prod);
  assert.deepEqual(tables(fresh), [...shared, ...ADDED].sort());
  // Production's columns, in order; later migrations may add more at the end (D45).
  for (const table of shared) {
    const prodColumns = columns(prod, table);
    assert.deepEqual(columns(fresh, table).slice(0, prodColumns.length), prodColumns, `${table}: production's columns first`);
  }
  assert.deepEqual(columns(fresh, "orders").slice(columns(prod, "orders").length).map((c) => c.name), ["expired_at", "purged_at"]);
});

test("every environment applies the migrations with wrangler (migrations_dir), and the scripts use them", async () => {
  const toml = await read("wrangler.toml");
  const databases = [...toml.matchAll(/\[\[(?:env\.\w+\.)?d1_databases\]\]([\s\S]*?)(?=\n\[)/g)].map((match) => match[1]);
  assert.equal(databases.length, 3, "local dev, staging and production");
  for (const block of databases) assert.match(block, /^migrations_dir = "migrations"(\s+#.*)?$/m);
  const scripts = JSON.parse(await read("package.json")).scripts;
  assert.match(scripts["db:migrate:local"], /^wrangler d1 migrations apply DB --local$/);
  assert.match(scripts["db:migrate:staging"], /^wrangler d1 migrations apply DB --env staging --remote$/);
  assert.equal(scripts["db:migrate:remote"], undefined, "production only through the Deploy workflow");
  for (const script of Object.values(scripts)) assert.doesNotMatch(script, /schema\.sql/);
});
