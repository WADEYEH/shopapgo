// The scheduled run (wrangler.toml [triggers], every 5 minutes in production) and its health.
//
// Every job runs on its own (one failing job never stops the others) and each run is recorded in cron_runs: when the
// job started and finished, its last success and last error. "_tick" is the run as a whole.
//
// A cron that stops cannot report itself, so two things watch it from outside (M12 §5, docs/ops/runbook.md):
// - GET /api/health answers 503 once the last run is older than CRON_STALE_MINUTES (default 30); an uptime monitor
//   can poll it.
// - HEALTHCHECK_PING_URL (secret, optional, https only; e.g. a Healthchecks.io check) is pinged at the end of every run,
//   with "/fail" appended when a job failed. When the pings stop, that service emails the team.
import { scheduledMcfSubmissions, scheduledMcfSync } from "./mcf.js";
import { scheduledCheckouts } from "./checkout-jobs.js";
import { scheduledCustomerEmailRetry } from "./customer-email.js";
import { scheduledMetaRetry } from "./meta-capi.js";

export const CRON_JOBS = {
  checkouts: scheduledCheckouts,
  mcf_submit: scheduledMcfSubmissions,
  mcf_sync: scheduledMcfSync,
  email_retry: scheduledCustomerEmailRetry,
  meta_retry: scheduledMetaRetry,
};
export const TICK = "_tick";
const DEFAULT_STALE_MINUTES = 30;

const clip = (value, max = 300) => String(value ?? "").slice(0, max);

async function recordStart(db, job, at) {
  await db
    .prepare(
      `INSERT INTO cron_runs (job, last_started_at, runs) VALUES (?, ?, 1)
       ON CONFLICT(job) DO UPDATE SET last_started_at = excluded.last_started_at, runs = cron_runs.runs + 1`,
    )
    .bind(job, at)
    .run();
}

async function recordEnd(db, job, at, error) {
  if (error) {
    await db.prepare("UPDATE cron_runs SET last_finished_at = ?, last_error = ? WHERE job = ?").bind(at, clip(error), job).run();
  } else {
    await db.prepare("UPDATE cron_runs SET last_finished_at = ?, last_ok_at = ?, last_error = NULL WHERE job = ?").bind(at, at, job).run();
  }
}

// Bookkeeping must never break the jobs themselves (for example a database that has not run migration 0002 yet).
async function safely(work) {
  try {
    await work();
  } catch (error) {
    console.error("cron_bookkeeping_failed", { message: clip(error?.message ?? error, 200) });
  }
}

function pingUrl(env, failed) {
  try {
    const url = new URL(String(env.HEALTHCHECK_PING_URL ?? "").trim());
    if (url.protocol !== "https:") return null;
    if (failed) url.pathname = `${url.pathname.replace(/\/$/, "")}/fail`;
    return url.toString();
  } catch {
    return null;
  }
}

// Runs every job, records the run and pings the dead-man switch. Returns { jobs: { name: "ok" | error message } }.
export async function runScheduled(env, { jobs = CRON_JOBS, now = () => new Date() } = {}) {
  const db = env.DB;
  const started = now().toISOString();
  if (db) await safely(() => recordStart(db, TICK, started));
  const outcome = {};
  await Promise.all(
    Object.entries(jobs).map(async ([name, job]) => {
      if (db) await safely(() => recordStart(db, name, now().toISOString()));
      let error = null;
      try {
        await job(env);
      } catch (caught) {
        error = clip(caught?.message ?? caught);
        console.error("cron_job_failed", { job: name, message: error });
      }
      outcome[name] = error ?? "ok";
      if (db) await safely(() => recordEnd(db, name, now().toISOString(), error));
    }),
  );
  const failed = Object.values(outcome).some((value) => value !== "ok");
  if (db) await safely(() => recordEnd(db, TICK, now().toISOString(), failed ? "a job failed" : null));
  const ping = pingUrl(env, failed);
  if (ping) {
    try {
      await fetch(ping, { method: "GET", signal: AbortSignal.timeout(5000) });
    } catch (error) {
      console.error("cron_ping_failed", { message: clip(error?.message ?? error, 200) });
    }
  }
  return { jobs: outcome };
}

const staleMinutes = (env) => {
  const value = Number(env.CRON_STALE_MINUTES);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_STALE_MINUTES;
};

// { ok, cron: { lastRunAt, stale } }: ok is false when the cron has not finished a run for CRON_STALE_MINUTES (or never
// has). No personal data, no error text: safe for a public uptime check.
export async function cronHealth(env, { now = () => new Date() } = {}) {
  let lastRunAt = null;
  try {
    const row = await env.DB.prepare("SELECT last_finished_at FROM cron_runs WHERE job = ?").bind(TICK).first();
    lastRunAt = row?.last_finished_at ?? null;
  } catch {
    lastRunAt = null;
  }
  const age = lastRunAt ? now().getTime() - Date.parse(lastRunAt) : Infinity;
  const stale = !(age <= staleMinutes(env) * 60_000);
  return { ok: !stale, cron: { lastRunAt, stale } };
}
