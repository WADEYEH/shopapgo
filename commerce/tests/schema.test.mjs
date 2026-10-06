// D1 migration policy (worker/schema.sql): every deploy re-runs the whole file, so it may only create tables and indexes
// that are missing. These tests apply it on top of the production structure (fixture exported read-only from the
// production D1 on 2026-10-06) and check that it only adds the new tables, never changes an existing one, and that a
// re-run is a no-op. A fresh database (next.shopapgo.com) must end up with the same columns as production.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sqliteAvailable } from "./helpers/d1.mjs";

const skip = (await sqliteAvailable()) ? false : "node:sqlite unavailable";
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const schema = await read("worker/schema.sql");
const production = await read("tests/fixtures/production-schema-2026-10-06.sql");

// Tables that exist only in this repo (payment failures, refunds, customer email outbox): the production upgrade adds them.
const ADDED = [
  "customer_email_events",
  "customer_email_suppressions",
  "order_email_delivery",
  "order_email_jobs",
  "order_message_jobs",
  "order_payment_failures",
  "order_refunds",
];

const statements = (sql) => sql.replace(/--[^\n]*/g, "").split(";").map((part) => part.trim()).filter(Boolean);
const tables = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
const columns = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all()
  .map(({ name, type, notnull, dflt_value, pk }) => ({ name, type, notnull, dflt_value, pk }));
const objects = (db) => db.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all().map((row) => ({ ...row }));

async function database(sql) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  db.exec(sql);
  return db;
}

test("schema.sql only creates tables and indexes that are missing: no ALTER, DROP or data changes", () => {
  const all = statements(schema);
  assert.ok(all.length > 20);
  for (const statement of all) {
    assert.match(statement, /^CREATE (TABLE|(UNIQUE )?INDEX) IF NOT EXISTS /, statement.slice(0, 80));
  }
});

test("on the production structure, schema.sql adds the new tables, leaves the existing ones untouched and re-runs as a no-op", { skip }, async () => {
  const db = await database(production);
  const before = tables(db);
  assert.equal(before.length, 10);
  const shape = Object.fromEntries(before.map((table) => [table, columns(db, table)]));

  db.exec(schema);
  assert.deepEqual(tables(db).filter((table) => !before.includes(table)), ADDED);
  for (const table of before) assert.deepEqual(columns(db, table), shape[table], `${table} unchanged`);

  const snapshot = objects(db);
  db.exec(schema);
  assert.deepEqual(objects(db), snapshot);
});

test("a fresh database gets the production tables with the same columns, plus the new ones", { skip }, async () => {
  const fresh = await database(schema);
  const prod = await database(production);
  const shared = tables(prod);
  assert.deepEqual(tables(fresh), [...shared, ...ADDED].sort());
  for (const table of shared) assert.deepEqual(columns(fresh, table), columns(prod, table), `${table}: same columns as production`);
});
