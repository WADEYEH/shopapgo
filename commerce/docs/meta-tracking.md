# Meta tracking: Pixel + Conversions API (CAPI)

The browser Pixel (`public/js/meta-pixel.js`) and the Worker's server-side Conversions API send the **same events with
the same `event_id`**, so Meta deduplicates them. Dataset (pixel) id `2606879866471418` (public). Server code:
`worker/meta-capi.js`, `worker/meta-attribution.js`, wiring in `worker/index.js`; browser code: `public/js/meta-pixel.js`
and `components/shop/checkout/CheckoutPage.js` (attribution, `checkout_session_created`, order items on `purchase`).

**Production only.** The Pixel runs only on the live hosts (`www.shopapgo.com`, `shopapgo.com`, `store.shopapgo.com`;
the last two answer 301 to www since the 10/16 cutover, so in practice www). `META_DATASET_ID` is set only in
`[env.production.vars]` of `wrangler.toml`; staging and local dev have none, so the whole CAPI path is skipped there
(no Graph request, no attribution rows, Airwallex metadata unchanged). The back office (`admin.shopapgo.com`) has no
tracking code at all.

Status (10/21): live since 10/16; the test code (`META_TEST_EVENT_CODE`) was deleted on 10/16, so events count as real.
Still to do: check the first real order's Purchase in Events Manager (C15, docs/commerce-plan.md).

## Events

| Event | Browser (from the store's `apgo:analytics` events) | Server (Worker) | `event_id` |
|---|---|---|---|
| `PageView` | every page load | — | — |
| `ViewContent` | `view_item` on a product page (the page's own `items[]` / `value`; no price = no `value`) | — | — |
| `AddToCart` | `add_to_cart` with `items[]`; a DRY+WET pair sends one per product | — | — |
| `InitiateCheckout` | `checkout_session_created`, right after `POST /api/checkout/session` or `POST /api/checkout/paypal/order` succeeds (a reused session does not fire it again) | the same moment, after the provider order is created | `ic_<orderId>` |
| `AddPaymentInfo` | `add_payment_info` | — | — |
| `Purchase` | `purchase` once the order is paid (value and items from `GET /api/orders/:id`) | `afterSettle`: the one call that moves the order to paid (Airwallex webhook or Retrieve poll, PayPal capture, `PAYMENT.CAPTURE.COMPLETED` or the order poll) | `purchase_<orderId>` |

`view_cart`, `begin_checkout`, `add_shipping_info`, `remove_from_cart` and the landing events are not sent to Meta.
`orderId` is the `APGO-US-…` id (`orderId` in the session response, `id` in `GET /api/orders/:id`).

`InitiateCheckout` is not `begin_checkout`: `begin_checkout` fires when the checkout page opens, before any order exists;
both halves wait for the moment the Worker creates the order, so they share `ic_<orderId>`. PayPal uses the same ids
(`eventIds.initiateCheckout`, `eventIds.purchase` in the PayPal responses; see [paypal.md](paypal.md)), and `Purchase`
only after capture returns `status: "paid"` (a PayPal payment still pending is not a purchase).

Every commerce event carries what is available of: `content_type: "product"`, `content_ids` (SKUs, upper case: `D204`,
`D215`), `contents` (`[{ id, quantity, item_price }]`), `value` (items + shipping + tax, the amount paid), `currency:
"USD"`, `num_items` (InitiateCheckout, Purchase). Server `value` is always D1 `total_cents / 100`; the browser's
`item_price` is `lineCents / qty / 100`. No price is written in the pixel code; without a price from the API the event
goes without `value` / `item_price`.

Server events also carry `action_source = website`, `event_source_url` (the attributed `sourceUrl`, else
`<origin>/checkout?order=<id>`), `event_time` (order `created_at` / `paid_at`, seconds), and `user_data` hashed with
SHA-256 as Meta requires: `em` (trim, lowercase), `ph` (digits, country code 1; only if a phone exists), `fn`, `ln`
(lowercase, punctuation removed), `ct`, `st` (two letters), `zp` (5 digits), `country` (`us`). Not hashed (the API needs
them raw): `client_ip_address`, `client_user_agent`, `fbc`, `fbp`. Empty fields are omitted.

Graph API version: `META_GRAPH_VERSION` in `worker/meta-capi.js` (`v26.0`, checked 2026-10-05). Bump it deliberately;
old versions are retired.

## Attribution (browser → Worker)

`POST /api/checkout/session` (and the PayPal order) carry an optional `attribution` object; every key is optional:

```json
"attribution": { "fbp": "fb.1.1700000000000.1234567890", "fbc": "fb.1.1700000000001.IwAR...", "fbclid": "IwAR...", "sourceUrl": "https://www.shopapgo.com/checkout" }
```

- `fbp` / `fbc`: the `_fbp` / `_fbc` cookies as they are. `fbclid`: from the URL, else from the `_fbc` cookie.
  `sourceUrl`: `location.href` when the session is created.
- The Worker also reads the cookies, `CF-Connecting-IP` and `User-Agent` (body first, then cookie; a `fbclid` without
  `fbc` becomes `fb.1.<ms>.<fbclid>`). Everything is validated; invalid values are dropped, never stored.
- Stored in `order_attribution` (one row per order). Not part of the session cache key, so cookies appearing late never
  make a second order or PaymentIntent. `fbc`, `fbp` and `event_source_url` also go into the PaymentIntent `metadata`
  (no personal data); `source` and `order_id` are written last and cannot be overwritten.
- `_fbc` backup cookie: when the URL has `fbclid` and there is no `_fbc`, the Pixel writes
  `_fbc=fb.1.<ms>.<fbclid>` (90 days, `Domain=.shopapgo.com`, `SameSite=Lax`); an existing `_fbc` is never overwritten.

## Idempotency, retries, cron (server)

- `order_meta_events` has `PRIMARY KEY (order_id, event_name)`. A send first **claims** the row (`INSERT OR IGNORE`,
  status `sending`); a second webhook, a parallel poll or a second cron run loses the claim and sends nothing. Status
  `sending → sent | failed`.
- Per request: up to 3 tries, only for network errors, timeouts, 429 and 5xx. Success = HTTP 2xx with
  `events_received >= 1`.
- The cron job `meta_retry` (production cron every 5 minutes, worker/cron.js) re-sends `failed` rows with the
  **original** `event_id` and `event_time`: back-off 5 min × 2^(attempts−1), at most 6 h, at most 24 attempts; rows stuck
  in `sending` for > 10 min are taken over; events older than 6 days are not retried (Meta rejects events older than 7
  days). It also sweeps paid orders of the last 6 days with **no** `Purchase` row and sends them once.
- Failures never affect checkout or the webhook answer.
- `error` holds only an HTTP status and Meta's numeric codes / `fbtrace_id`, never message text, personal data or the token.
- Browser: `trackPurchaseOnce` fires `purchase` once per order per tab, and `meta-pixel.js` keeps its own guard
  (`sessionStorage["apgo_meta_purchase_<orderId>"]`); the shared `eventID` lets Meta deduplicate with the server event.

## Logging

One JSON line per send outcome (`meta_capi {...}`): `at`, `event_name`, `event_id`, `http_status`, `events_received`,
`fbtrace_id`, `attempts`, `outcome`. Never logged: email, phone, name, address, IP, user agent, fbc/fbp, token, body.

## Settings

| Name | Kind | Notes |
|---|---|---|
| `META_DATASET_ID` | var, `[env.production.vars]` = `"2606879866471418"` | Not a secret. Unset = CAPI off. |
| `META_CAPI_ACCESS_TOKEN` | **secret** (`wrangler secret put … --env production`) | Events Manager → Settings → Conversions API. Never in code, toml, tests or logs. Only the owner types it. |
| `META_TEST_EVENT_CODE` | secret, testing only | Marks events as test events. Must **not** exist in production: the daily settings check reports it (worker/config-check.js). |

## Privacy

Global Privacy Control (D46, `worker/privacy.js`): with `Sec-GPC: 1` (or `privacy.gpc` in the body) the Pixel stops
before loading anything (no `fbq`, no cookie), the checkout keeps no attribution, the order is recorded in
`order_privacy`, and the Worker skips InitiateCheckout and Purchase for it. `HONOR_GPC = "false"` turns this off. GA4
is not affected. No cookie-consent banner (owner decision); the privacy policy describes the Pixel and CAPI (D67).

## Checking it

Automated: `tests/meta-pixel.test.mjs`, `tests/meta-pixel.spec.mjs` (browser, on faked live hosts, fbevents stubbed),
`tests/commerce-meta-capi.test.mjs` (server).

On production: Events Manager → dataset `2606879866471418` (or the Meta Pixel Helper extension). Open
`https://www.shopapgo.com/?fbclid=test123`: `PageView`, then `ViewContent` on a product page and the `_fbc` cookie;
Add to cart → `AddToCart`; checkout → `InitiateCheckout` with `ic_APGO-US-…`; after payment → `Purchase` with
`purchase_APGO-US-…`, shown once with a Browser and a Server copy. D1:
`SELECT order_id, event_name, status, attempts, error FROM order_meta_events;` → `sent`. On staging, previews and
localhost the Network tab must show no request to `connect.facebook.net`.

## Known limits

- The Pixel still handles the old landing `[data-add-to-cart]` buttons (a `ViewContent` on load and an `AddToCart` from
  `/api/store/config` prices); no page has them today.
- `ViewContent`/`AddToCart` need one `GET /api/store/config` per page (shared for the page's life).
