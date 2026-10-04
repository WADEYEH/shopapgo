# Meta tracking: Pixel + Conversions API (CAPI)

The browser Pixel (front end, `prototype/js/meta-pixel.js`, owned by the web engineer) and this Worker's server-side Conversions API send the **same events with the same
`event_id`**, so Meta deduplicates them. This document covers the Worker (backend) half. Code: `worker/meta-capi.js`, `worker/meta-attribution.js`, wiring in `worker/index.js`.

**Production only.** `META_DATASET_ID` is set only in `[env.production.vars]` of `wrangler.toml`. Staging and local dev have no dataset id, so the whole CAPI path is skipped:
no Graph request, no attribution rows, Airwallex metadata unchanged. (The Pixel is not loaded on staging either, by owner decision.)

## Events

| Event | When (Worker) | `event_id` | `event_time` | `value` |
|---|---|---|---|---|
| `InitiateCheckout` | `POST /api/checkout/session`, right after the Airwallex PaymentIntent is created | `ic_<merchant_order_id>` | order `created_at` (seconds) | D1 `total_cents / 100` |
| `Purchase` | `afterSettle`: the one call that moves the order pending → paid (webhook `payment_intent.succeeded` **or** the `GET /api/orders/:id` Retrieve poll) | `purchase_<merchant_order_id>` | `paid_at` (seconds) | D1 `total_cents / 100` |

`merchant_order_id` is the `APGO-US-…` order id. Both events: `action_source = website`, `event_source_url` = the attributed `sourceUrl` (falls back to
`<origin>/checkout.html?order=<id>`), `custom_data = { value, currency: "USD", content_type: "product", content_ids: [SKU…], contents: [{id, quantity, item_price}], order_id }`.
`value` is the amount the customer pays (items + shipping + tax), always from D1 `total_cents / 100` (5999 → 59.99). `GET /api/orders/:id` lines also carry `unitCents` (= `lineCents / qty`) so the front end can send the same `contents[].item_price`. `content_ids` are the upper-case SKUs (`D204`, `D215`), same as the Pixel. Airwallex receives dollars; D1 stores cents; the two are
never mixed.

`user_data` (SHA-256 hex, normalised as Meta requires): `em` (trim, lowercase), `ph` (digits only, US country code 1 added; sent only if a phone exists, none is collected today),
`fn`, `ln` (trim, lowercase, punctuation removed), `ct` (lowercase letters), `st` (two-letter lowercase), `zp` (first 5 digits), `country` (`us`). Not hashed: `client_ip_address`,
`client_user_agent`, `fbc`, `fbp`. Empty fields are omitted. Hashed values are sent as one-element arrays (accepted by the API).

`test_event_code` is added to the request only when `META_TEST_EVENT_CODE` is set.
Graph API version: constant `META_GRAPH_VERSION` in `worker/meta-capi.js` (`v26.0`, checked against Meta's changelog on 2026-10-05). Bump it deliberately; old versions are retired.

## Data flow

1. The front end sends `POST /api/checkout/session` with an optional `attribution: { fbp, fbc, fbclid, sourceUrl }` (every field optional; older clients send none).
2. The Worker also reads the `_fbp` / `_fbc` cookies, `CF-Connecting-IP` and `User-Agent`. Precedence: body, then cookie. If there is a `fbclid` but no `fbc`, it builds
   `fb.1.<ms>.<fbclid>`. All input is validated (format regexes, length caps, http(s) URL without credentials/fragment ≤ 500 chars); invalid values are dropped, never stored.
3. Stored in `order_attribution` (one row per order, new table). The checkout-session idempotency (`request_id` = order id, the front end's session cache key) does not include attribution, so a
   changed or missing attribution never creates a second order or PaymentIntent.
4. `fbc`, `fbp`, `event_source_url` are also put into the PaymentIntent `metadata` (no PII; key ≤ 50, value ≤ 500 chars). `source` and `order_id` are written last and cannot be overwritten.
5. `InitiateCheckout` is sent (background, `ctx.waitUntil`). Failure never affects checkout.
6. On payment, `afterSettle` sends `Purchase` the same way. Failure never affects the webhook answer (it stays 200; a bad signature stays 400).

## Idempotency, retries, cron

* `order_meta_events` has `PRIMARY KEY (order_id, event_name)`. A send first **claims** the row (`INSERT OR IGNORE`, status `sending`); a second webhook, a parallel Retrieve poll or a second cron run
  loses the claim and sends nothing. Status goes `sending → sent | failed`.
* Per request: up to 3 tries with short back-off, only for network errors, timeouts, 429 and 5xx. Other 4xx (bad token, bad payload) are not retried inline.
  Success requires HTTP 2xx with `events_received >= 1`.
* `failed` rows are re-sent by `scheduled()` (production cron `*/15 * * * *`), with the **original** `event_id` and `event_time`. A compare-and-swap UPDATE takes the row, so two cron runs never
  both send it. Back-off between cron attempts is 5 min × 2^(attempts−1), capped at 6 h, at most 24 attempts; rows stuck in `sending` for > 10 min are taken over. Events older than 6 days are
  not retried (Meta rejects events older than 7 days).
* The cron also sweeps paid orders from the last 6 days (≥ 3 min old) that have **no** `Purchase` row at all (e.g. the Worker was cut off before the claim) and sends them once.
* `scheduled()` is one handler: MCF status sync (a no-op unless `MCF_SYNC_CRON=true`) and the Meta re-send run side by side.
* `error` holds only an HTTP status and Meta's numeric codes / `fbtrace_id` (e.g. `http_400 type=OAuthException code=190 subcode=… trace=…`), never Meta's message text, PII or the token.

## Logging

One JSON line per send attempt outcome (`meta_capi {...}`): `at`, `event_name`, `event_id`, `http_status`, `events_received`, `fbtrace_id`, `attempts`, `outcome` (plus a short error code).
Never logged: email, phone, name, address, IP, user agent, fbc/fbp, token, request body.

## Secrets and variables

| Name | Kind | Where | Notes |
|---|---|---|---|
| `META_DATASET_ID` | var | `wrangler.toml` `[env.production.vars]` = `"2606879866471418"` | Not a secret. Unset = CAPI off. |
| `META_CAPI_ACCESS_TOKEN` | **secret** | `wrangler secret put … --env production` | From Events Manager → Settings → Conversions API. Never in code/toml/tests/logs. |
| `META_TEST_EVENT_CODE` | secret/var, test only | `wrangler secret put … --env production` | Only while checking Test Events (`TEST27938`); delete it afterwards. |
| `AIRWALLEX_WEBHOOK_SECRET` | **secret** | `wrangler secret put … --env production` | Production webhook signing secret (must match the Airwallex production webhook). |

**宸瑋 sets these himself**; nobody else (and no script/agent) should type or store them:

```bash
npx wrangler secret put META_CAPI_ACCESS_TOKEN --env production
npx wrangler secret put AIRWALLEX_WEBHOOK_SECRET --env production
npx wrangler secret put META_TEST_EVENT_CODE --env production      # only during testing
# later, to stop test mode:
npx wrangler secret delete META_TEST_EVENT_CODE --env production
```

## Airwallex production webhook (register in the Airwallex production dashboard)

* URL: `https://store.shopapgo.com/api/webhooks/airwallex`
* Events: `payment_intent.succeeded`, `payment_intent.cancelled`
* Copy its signing secret into `AIRWALLEX_WEBHOOK_SECRET` (above).

## Deploy (documented only: this branch did not deploy anything)

There is no `db:migrate:production` / `deploy:production` npm script. Staging scripts exist (`npm run db:migrate:staging`, `npm run deploy:staging`) but staging has CAPI off.
Production, after the prerequisites in `docs/commerce.md` "Go-live checklist" (real D1 id in `[[env.production.d1_databases]]`, routes uncommented, secrets set):

```bash
# 1. add the two new tables (schema.sql is idempotent: CREATE TABLE IF NOT EXISTS)
npx wrangler d1 execute apgo-us-store --env production --remote --file worker/schema.sql
# 2. deploy the Worker (this also registers the cron trigger)
npx wrangler deploy --env production
```

`PRICING_APPROVED` is still unset, so production checkout answers 503 until the owner approves prices, shipping and tax; CAPI will not fire before that.

## Verifying in Meta Events Manager

1. Set `META_TEST_EVENT_CODE` (value `TEST27938`, the code shown in Events Manager → Test events) and `META_CAPI_ACCESS_TOKEN`, then deploy.
2. Open Events Manager → dataset `2606879866471418` → **Test events**. Place a low-value test order on `store.shopapgo.com` (with the Pixel on the page).
3. Expect, for each event, a **Browser** and a **Server** entry with the same Event ID (`ic_APGO-US-…`, `purchase_APGO-US-…`) shown as deduplicated; `Purchase` value equals the amount paid
   in USD; user data shows matched fields; Event Match Quality improves with `em`, `fn`, `ln`, `zp`, `fbc`, `fbp`.
4. Check the Worker log (`wrangler tail --env production`): `meta_capi` lines with `http_status: 200`, `events_received: 1`, a `fbtrace_id`.
5. Check D1: `SELECT order_id, event_name, event_id, status, attempts, error FROM order_meta_events;` → `sent`.
6. Delete `META_TEST_EVENT_CODE` so real events are not flagged as test events.

## Privacy

No cookie-consent banner (owner decision). The Worker stores `client_ip` and `client_user_agent` in `order_attribution` and sends them to Meta unhashed (as the API requires for matching); all
other personal fields are hashed first. Update the privacy policy page accordingly (counsel).
