// A fake Meta Graph API (Conversions API) for tests. It is a fetch replacement; nothing reaches Meta.
//
//   const meta = createFakeMeta({ script: [{ status: 500 }, { network: true }, { status: 200 }] });
//   meta.fetch(url, init)      records the call and answers the next scripted step (default: 200 events_received 1)
//   meta.calls                 [{ url, method, headers, body (parsed), rawBody }]
//   meta.events()              every event object sent so far (calls[].body.data[0])
//
// A script step: { status, body } | { network: true } | { hang: true } (never answers until aborted).
export const FAKE_META_TOKEN = "EAAFAKEtestTOKENvalue0123456789abcdefghijklmnop";
export const FAKE_DATASET_ID = "2606879866471418";
export const FAKE_META_ENV = { META_DATASET_ID: FAKE_DATASET_ID, META_CAPI_ACCESS_TOKEN: FAKE_META_TOKEN, META_CAPI_RETRY_DELAY_MS: "0" };

export function createFakeMeta({ script = [] } = {}) {
  const steps = [...script];
  const calls = [];
  let trace = 0;
  async function handle(url, init = {}) {
    const rawBody = init.body ? String(init.body) : "";
    calls.push({ url: String(url), method: (init.method ?? "GET").toUpperCase(), headers: Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])), rawBody, body: rawBody ? JSON.parse(rawBody) : undefined });
    const step = steps.shift() ?? { status: 200 };
    if (step.network) throw new TypeError("fetch failed");
    if (step.hang) return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    const status = step.status ?? 200;
    trace += 1;
    const body = step.body ?? (status >= 200 && status < 300
      ? { events_received: 1, messages: [], fbtrace_id: `FBTRACE${trace}` }
      : { error: { message: "Some PII-ish free text ada@example.com", type: "OAuthException", code: status === 400 ? 100 : 1, error_subcode: 33, fbtrace_id: `FBERR${trace}` } });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }
  return {
    calls,
    fetch: handle,
    events: () => calls.map((c) => c.body?.data?.[0]).filter(Boolean),
  };
}
