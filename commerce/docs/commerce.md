# APGO US store: cart + Airwallex checkout

Direct-to-consumer cart and checkout for D204 / D215, paid through Airwallex.
The Amazon referral landing pages are unchanged; the store lives in its own
pages and a Cloudflare Worker.

> Scope note: `IMPLEMENTATION_CONTRACT.md` forbids cart UI and unverified prices
> on the **landing pages** (it governs `index.html`; it has not been amended).
> The store pages below are separate, `noindex`, and keep all prices server-side.
> Only the in-progress **`v3.html`** has cart entry points (see "Landing entry
> points"); `index.html` and `v2.html` are unchanged and still link only to Amazon.
> The landing page never shows a price or a cart total.

## Handoff

Start here if you are taking over the project. **This section contains no passwords, tokens or keys, only their names and where they live.**

### Status in one paragraph

The cart, Airwallex card checkout, wallet buttons at the checkout step, policy pages, protected back office (mark as shipped, customer emails, optional Amazon MCF)
are built and covered by tests. **Staging is deployed; production is not.** Nothing has taken a real payment. Prices, shipping, tax and policy wording are placeholders
(shown with yellow `[TO CONFIRM]` markers while `PRICING_APPROVED` is not `"true"`).

### Where things run

| What | URL |
| --- | --- |
| Staging storefront (Basic-auth gate, noindex, Airwallex **sandbox**) | https://staging.shopapgo.com |
| Staging back office (own host, `ADMIN_TOKEN` or the staging site login) | https://admin-staging.shopapgo.com/admin/ |
| Staging fallback (same Worker, `workers_dev = true`) | `https://apgo-us-store-staging.<cloudflare-account>.workers.dev` (back office answers 404 here; use the admin host) |
| Production (planned, **not deployed**) | `https://store.shopapgo.com`, back office `https://admin.shopapgo.com/admin/` |

The `www` host (Cloudflare Pages project `shopapgo`) is a separate site and is untouched by this repo's Worker.

### Environments and secret names (names only)

Plain vars live in `wrangler.toml` (`[env.staging.vars]`, `[env.production.vars]`); the D1 `database_id` values there are identifiers, not secrets, and production is still the
`00000000-…` placeholder. Secrets are set per environment with `npx wrangler secret put <NAME> --env staging|production` (local: `.dev.vars`, git-ignored; template: `.dev.vars.example`).

| Secret name | Used for | Staging today |
| --- | --- | --- |
| `AIRWALLEX_CLIENT_ID`, `AIRWALLEX_API_KEY` | Airwallex API (sandbox keys on staging, production keys on prod) | set (sandbox) |
| `AIRWALLEX_WEBHOOK_SECRET` | webhook signature | set October 2; genuine sandbox success and authentication-failure deliveries verified, including success redelivery (see `staging-rollout-2026-10-02.md`) |
| `ADMIN_TOKEN` | back office login (>= 16 chars) | set |
| `STAGING_BASIC_AUTH_USER`, `STAGING_BASIC_AUTH_PASSWORD` | staging site gate (and the staging back-office login) | set |
| `RESEND_API_KEY` | team notification + customer emails | not set (no email is sent) |
| `ORDER_NOTIFY_WEBHOOK_URL`, `ORDER_NOTIFY_WEBHOOK_SECRET` | team notification webhook (optional) | not set |
| `AMAZON_OUTBOUND_BASE_URL`, `OUTBOUND_INTERNAL_TOKEN` | Amazon MCF through amazon-spapi-mcp | set |

Plain (non-secret) variables: `AIRWALLEX_ENV`, `SITE_ENV`, `ROOT_PAGE`, `ADMIN_HOST`, `ADMIN_ACCEPT_SITE_BASIC`, `EXPRESS_CHECKOUT`, `PRICING_APPROVED`, `PRICING_JSON`,
`PAYMENT_AUTO_CAPTURE`, `APPLE_PAY_ENABLED`, `GOOGLE_PAY_ENABLED`, `WALLET_MERCHANT_NAME`, `CUSTOMER_EMAIL_FROM`, `CUSTOMER_EMAIL_REPLY_TO`, `CUSTOMER_EMAIL_POLICY_NOTE`,
`CUSTOMER_EMAIL_ENABLED`, `ORDER_NOTIFY_EMAIL_TO`, `ORDER_NOTIFY_EMAIL_FROM`, `MCF_AUTO_SUBMIT`, `MCF_SKU_MAP_JSON`, `MCF_SHIPPING_MAP_JSON`, `MCF_SYNC_CRON`, `MCF_NOTIFY_AMAZON_EMAIL`.
Each is explained in the section named after its feature below.

### Where the credentials are

- **The password vault is the source of truth** (ask the owner for access to the APGO entries: staging Basic login, staging `ADMIN_TOKEN`, Airwallex sandbox keys).
- `~/.apgo-staging-credentials` on the owner's Mac is **out of date**; do not use it, and do not copy it anywhere. Scripts that take `--credentials <file>` need a current file you
  create locally (git-ignored location, `chmod 600`), never one inside the repo.
- Never put credentials in the repo, in chat or in tickets. If one leaks, rotate it (`wrangler secret put` a new value; Airwallex web app for API keys).

### Decisions still open (owner / counsel)

Prices D204 / D215 (placeholders $29.90 / $24.90) · shipping methods and fees · sales tax · how delivery time is described · return terms (window, accepted products, remedy) ·
governing law (準據法) in the Terms · customer-service copy (see `docs/customer-email-policy-note.md` and the `[TO CONFIRM]` marks in the policy pages) ·
whether Amazon also sends its own shipment notice (`MCF_NOTIFY_AMAZON_EMAIL`, default off, so only our email goes out).

### Production is not deployed: how to go live

Follow "Go-live checklist for production" under "Environments: staging and production" and "Before switching `AIRWALLEX_ENV` to `prod`". In short: create the production D1 and
run the schema, set production secrets, register the Airwallex production webhook, bind `store.shopapgo.com` and `admin.shopapgo.com`, set `ADMIN_HOST`, approve the numbers and only then set
`PRICING_APPROVED = "true"` (until then production answers 503 on checkout by design), then one real low-value order. Do **not** set `EXPRESS_CHECKOUT` in production.

### Amazon MCF automatic shipping

Paid orders can be fulfilled from FBA stock through the **internal outbound endpoints of amazon-spapi-mcp** (`AMAZON_OUTBOUND_BASE_URL`, bearer `OUTBOUND_INTERNAL_TOKEN`; this Worker holds no Amazon
credentials). It is **off by default** (`MCF_AUTO_SUBMIT` unset). Details: "Amazon MCF". The outbound API has no sandbox: the first real order creates a real shipment and MCF fee.

### Suggested first test order

1. On staging, pay once with the Airwallex sandbox card `4035 5010 0000 0008` and check the order shows as paid in the admin host. (`node scripts/airwallex-browser-smoke.mjs` does this.)
2. Mark it shipped by hand in the back office; confirm the "email skipped" message (no Resend configured) or, once Resend is set up, the email arrives.
3. Only later, deliberately: enable MCF for **one** small order to the owner's own address (`MCF_AUTO_SUBMIT=true` only for that moment), watch it in the back office, then turn it off again.
4. In production, start with one real low-value order after the go-live checklist.

### Known limits

- A shipment cannot be cancelled or edited once saved (a wrong tracking number needs a database fix); no partial shipments or multiple parcels; no refunds or post-payment cancellations in the back office.
- A failed customer email is recorded and shown but **not retried automatically**.
- The audit trail's actor is always the literal `admin` (one shared token). Named users need Cloudflare Access or similar.
- **Cart-page express checkout** (wallet block on the cart page) exists as front end only and is **off by default**: clicking the wallet button does **not** complete a payment yet. `EXPRESS_CHECKOUT`
  is set to `"false"` on staging and production and **must not be enabled** until the express payment flow is built.
- Apple Pay and Google Pay have **not been verified on real devices** (needs Safari with a card in Wallet, a registered Apple Pay domain, and Chrome with a Google account); automated tests mock feature detection.
- Staging has a sandbox Airwallex webhook registered; genuine success and authentication-failure delivery and same-order retry are verified. Production still needs its own webhook.

## How it fits together

```text
prototype/cart.html ─┐                    ┌─ worker/pricing.js   THE pricing source (prices · shipping · tax, cents)
                     │                    ├─ worker/catalog.js   quote engine that applies pricing.js
                     │                    ├─ worker/wallets.js   Apple Pay / Google Pay config + domain file route
prototype/checkout.html ─ /api/* ─ worker/index.js ─ worker/checkout.js  input validation · order ids
  js/commerce/*.js   │                    ├─ worker/orders.js    D1 orders + webhook idempotency
  css/commerce.css   │                    ├─ worker/airwallex.js token · PaymentIntent · webhook HMAC
                     │                    ├─ worker/notify.js    new paid-order notification (opt-in)
prototype/admin/ ────┘                    ├─ worker/admin.js     ADMIN_TOKEN gate + /admin/api/*
                                          ├─ worker/fulfillment.js  mark shipped · validation · audit log
                                          ├─ worker/customer-email.js  order confirmation + shipment emails (Resend, opt-in)
                                          ├─ worker/amazon-mcf.js  Amazon MCF client (bearer call to the amazon-spapi-mcp outbound endpoints)
                                          └─ worker/mcf.js         MCF order flow: submit · retry · status sync (opt-in, default OFF)
                     └─ Airwallex.js split card elements (cardNumber / expiry / cvc, iframes)
```

1. The browser keeps only `{ sku, qty }` in `localStorage` (`apgo_us_cart_v1`).
   Every price it shows comes from `POST /api/cart/quote`.
2. On **Place order**, `POST /api/checkout/session` validates contact/address,
   re-prices the cart, stores a `pending` order in D1 and creates an Airwallex
   PaymentIntent (`merchant_order_id` = order id). Only the intent's
   `client_secret` reaches the browser.
3. The browser calls `cardNumber.confirm({ intent_id, client_secret })`. A
   declined card can be retried; the same PaymentIntent is reused while the
   cart/address is unchanged and younger than 50 minutes.
4. `payment_intent.succeeded` (webhook) or `GET /api/orders/:id` (retrieve
   fallback, used after 3DS redirects) marks the order `paid`. A succeeded
   intent whose amount/currency differs from the stored total becomes `review`.
   The first call that moves an order out of `pending` (a guarded `UPDATE`)
   triggers the new-order notification, so webhook/poll races notify once.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/store/config` | prices, shipping methods, tax status, wallet flags, US states, Airwallex env, `storeReady` |
| `POST /api/cart/quote` | `{ items, state?, method? }` → priced lines and totals |
| `POST /api/checkout/session` | `{ items, contact, shipping, method }` → `{ orderId, quote, intent }` |
| `GET /api/orders/:id` | status, lines, totals, masked email (no address) |
| `GET /.well-known/apple-developer-merchantid-domain-association` | Apple Pay domain file (served from `prototype/apple-pay/`, `application/octet-stream`; 404 until you add it) |
| `POST /api/webhooks/airwallex` | HMAC-verified (`x-timestamp` + raw body), idempotent by event id; a genuine delivery older than 5 minutes is settled from the Retrieve API, not from its stale body |
| `GET /admin/` · `GET /admin/api/orders[?status&fulfillment&q&before]` · `GET /admin/api/orders/:id` | order back office, `ADMIN_TOKEN` required (below) |
| `POST /admin/api/orders/:id/ship` | `{ carrier, trackingNumber, trackingUrl? }` → marks a **paid** order shipped, emails the customer; `ADMIN_TOKEN` + JSON + same-origin (see "Fulfilment") |

| `POST /admin/api/orders/:id/mcf/submit` · `POST /admin/api/orders/:id/mcf/sync` · `POST /admin/api/mcf/sync` | Amazon MCF: (re)send a paid order · sync one order's status · sync every order waiting on Amazon; `ADMIN_TOKEN` + JSON + same-origin (see "Amazon MCF") |

Adding to the cart from any page: link to `cart.html?add=d204`, or use
`<button data-add-to-cart="d215" data-placement="hero">` (add `data-go-to-cart`
to jump to the cart) on a page that loads `js/commerce/shared.js`.

## Landing entry points (v3 only)

`prototype/v3.html` loads `js/commerce/landing-cart.js` (a module that shares
`shared.js` and the `apgo_us_cart_v1` cart with the store pages):

- **Header:** a Cart link with an item-count badge (hidden at 0, `aria-label`
  "Cart, N items"; icon-only at ≤ 760 px so the header does not crowd). The badge
  follows the cart across tabs.
- **Selected product panel** and **final handoff** (D204 / D215): a primary
  **Add to cart** button, a polite inline confirmation ("Added · N in cart · View
  cart →"), then the **Amazon link as the outlined secondary option**
  ("Or shop on Amazon"). Amazon links keep their existing fail-closed
  validation, status line and `amazon_referral_click` event.
- **Mobile sticky bar:** Add to cart + a compact Amazon link; the add is
  announced through a visually hidden live region.
- Add-to-cart does not navigate; the shopper opens the cart from the header or
  the inline link. The `add_to_cart` event carries `sku`, `quantity`, `placement`
  (`selected` / `final` / `sticky`).
- Review shots: `npm run capture:v3-cart` →
  `review/v3-cart-{d204,d215}-{desktop,mobile}.png`, `v3-cart-header-*.png`,
  `v3-cart-sticky-mobile.png`.

`index.html` / `v2.html` are intentionally not wired. To add the entry there, load
`js/commerce/landing-cart.js` and add the same markup; first amend
`IMPLEMENTATION_CONTRACT.md` (root integrator).

## Prices, shipping and tax: one source (`worker/pricing.js`)

Every number that changes what a shopper pays lives in **`worker/pricing.js`**
(`DEFAULT_PRICING`): product prices, shipping methods and fees, the default
shipping method, the per-line quantity cap, currency, and the tax settings. Nothing
else in the repository contains a price:

- The quote engine (`worker/catalog.js`), `/api/cart/quote`,
  `/api/checkout/session` (the PaymentIntent amount) and `/api/store/config` all read
  it through `resolvePricing(env)`.
- The browser holds no price at all. Cart, checkout, summary and the wallet buttons
  render what the Worker returned, so front end and back end cannot disagree.
  `tests/commerce-pricing.test.mjs` fails if a price or tax rate appears in
  `prototype/js/commerce/`, or a literal price in `catalog.js` / `index.js`.
- Playwright mocks and unit tests import the same module (no duplicated `2990`).

**Change a number without editing code**: set the optional, non-secret Worker
variable `PRICING_JSON` (a *partial* override of `DEFAULT_PRICING`):

```jsonc
// wrangler.toml [vars]  (or `npx wrangler secret put PRICING_JSON`, or .dev.vars locally)
PRICING_JSON = '{"products":{"d204":{"priceCents":3490}},"shippingMethods":{"standard":{"label":"Standard","detail":"5–7 business days","amountCents":499}},"tax":{"defaultRateBps":0,"stateRatesBps":{},"shippingTaxable":false}}'
```

Rules: money is integer cents; tax rates are basis points (725 = 7.25%);
`shippingMethods`, when given, replaces the whole list. The value is validated
(integers, known SKUs/states, sane ranges, USD only). **An invalid value is refused,
never silently replaced**: `/api/cart/quote` and `/api/checkout/session` answer
`503 store_not_ready` and log `pricing_config_invalid`.

**Tax is configurable but undecided.** `tax.defaultRateBps` is `0` and
`tax.stateRatesBps` is `{}`, so every order is taxed $0.00 and `/api/store/config`
reports `tax.status = "undecided"`. `tax.shippingTaxable` (default `false`) controls
whether the shipping fee is in the taxable base. The structure does not imply any tax
regime; choosing one is the owner's (and their accountant's) decision.

**Production gate.** With `AIRWALLEX_ENV=prod` the store answers
`503 store_not_ready` for checkout until `PRICING_APPROVED=true` is set. So the
placeholder numbers cannot go live by accident; you flip the switch only after
deciding them (see the go-live list). The sandbox (`demo`) is never blocked.

## Apple Pay and Google Pay (Airwallex-native)

**Approach (per the Airwallex docs, Oct 2026).** Airwallex.js ships dedicated
elements: `createElement("applePayButton", …)` and `createElement("googlePayButton", …)`.
They take the PaymentIntent's `intent_id` + `client_secret`, `countryCode`, and
`amount: { value, currency }` (value = the intent's major-unit amount, as a string),
open the wallet sheet themselves and confirm the intent when the shopper authorises.
There is **no separate `confirm()`** and no card data reaches us. Google Pay also
gets `origin` and `merchantInfo.merchantName`. Airwallex handles Apple's and
Google's gateway registration (web only); we do not need our own Apple Merchant ID,
certificates or a Google merchant id.

**Where it appears.** On the checkout **Payment** step, above the card fields, with
an "Or pay by card" divider. The order and PaymentIntent are the same ones the card
form uses, so a shopper who tries a wallet and then pays by card does not create a
second order. Settlement is unchanged: `payment_intent.succeeded` webhook or
`GET /api/orders/:id` (retrieve fallback), then the same notification.

**Hidden unless it can really work** (`prototype/js/commerce/wallets.js`):

1. The operator allows it (`APPLE_PAY_ENABLED` / `GOOGLE_PAY_ENABLED`, default on; set
   `"false"` to hide one).
2. Cheap device pre-check: Apple Pay needs `ApplePaySession.canMakePayments()` to be
   true (Safari / iOS / macOS with a wallet); Google Pay needs a secure context.
3. The button sits in a collapsed, non-focusable slot and is revealed only when
   Airwallex fires the element's `ready` event (Google/Apple confirmed the device can
   pay). No `ready` within 10 s, an SDK failure, or an element error leaves it hidden.

A device with no wallet sees exactly the old card-only page; the card flow is
untouched. Wallet `error` shows "The wallet payment didn't go through…" and rebuilds
the PaymentIntent; `cancel` just clears messages.

**PaymentIntent `payment_method_options`.** `/api/checkout/session` now sends
`payment_method_options: { card: { auto_capture } }` (default `true`). Airwallex
documents `auto_capture` on the card options and states that holds/authorisation
apply to cards **including Apple Pay and Google Pay**; the same flag is also passed to
both wallet elements as `autoCapture`. `PAYMENT_AUTO_CAPTURE=false` switches both to
"authorise only" (you must then capture from the Airwallex app/API; not needed for
normal fulfilment). Sandbox accepted these options when probed (HTTP 201).

Other optional settings: `WALLET_MERCHANT_NAME` (label on the wallet sheet, default
`APGO`; Airwallex recommends your statement-descriptor business name) and
`WALLET_EAGER_SESSION=true` (create the order/PaymentIntent before probing and pass
it at element creation; only use it if a wallet refuses to report `ready` without an
intent).

**Cart-page express checkout: front end exists, default off (flag-gated, payment not wired).** The front end
has an express block on the cart page (`prototype/js/commerce/cart-wallets.js`, the
`[data-express]` section of `cart.html`). The Worker switches it with
`EXPRESS_CHECKOUT` through `/api/store/config` → `expressCheckout`:

* `EXPRESS_CHECKOUT = "true"` (exactly that string) turns it on; unset or anything else
  is off and the block never loads Airwallex. **Staging sets it** (`[env.staging.vars]`);
  **production does not**.
* It only mounts the wallet buttons the same way the checkout step does (no
  intent/order is created) and shows them when the device supports a wallet and
  Airwallex reports `ready`; otherwise it stays collapsed. It reads `airwallexEnv` and
  the `wallets` object (`countryCode`, `merchantName`, `autoCapture`, `applePay`,
  `googlePay`) from the same config; the amount comes from the server quote, never from
  the browser.
* **Clicking the wallet button does not complete a payment yet.** The true express flow
  (Airwallex collects the address in the wallet sheet, so the intent must be created
  *after* the address is known and shipping/tax recomputed in the sheet via
  `shippingAddressChange` / `shippingMethodChange`; Google Pay's express element also
  needs `gatewayMerchantId`) is a separate server flow and is not built. Keep
  `EXPRESS_CHECKOUT` off in production until it is, and until shipping/tax are approved.
  The checkout-step buttons above already give one-tap payment after the address step.

**Estimate / `[TO CONFIRM]` markers.** While `PRICING_APPROVED` is not `"true"`,
`/api/store/config` returns `pricingApproved: false` and `estimate: true`. The cart
summary (Shipping, Tax) and the checkout shipping options and summary then show a
yellow `[TO CONFIRM]` marker (same style as the policy pages, `mark[data-to-confirm]`)
next to the placeholder shipping fee, delivery wording and tax. Once `PRICING_APPROVED`
is `"true"` (`pricingApproved: true`, `estimate: false`) the markers disappear.
Staging and local dev show them; production shows none only after approval.

### What you must do (cannot be automated from this repo)

Airwallex web app, **sandbox first** (`https://www.sandbox.airwallex.com`), then again
in production:

1. **Payments → Settings → Apple Pay → Enable.** (Your account must already be enabled
   for online payments.) Accept Apple's *acceptable use guidelines for websites*.
2. **Payments → Settings → Google Pay → Enable** (accept the Google Pay terms shown).
3. **Apple Pay domain** (Apple Pay only; Google Pay has no domain file):
   1. In the Apple Pay section choose **Add domain**, enter the exact host shoppers
      use (e.g. `shop.example.com`; no `https://`; `*.workers.dev` hosts work for
      sandbox testing, production needs your real domain).
   2. **Download the domain verification file** Airwallex offers.
   3. Save it in this repo as
      `prototype/apple-pay/apple-developer-merchantid-domain-association` (no
      extension). It is a public token, safe to commit. Deploy.
   4. Open `https://<domain>/.well-known/apple-developer-merchantid-domain-association`:
      it must download the file (status 200, `application/octet-stream`). The Worker
      serves it at that path because Wrangler does not upload dot-folders.
   5. Back in Airwallex press **Verify**. Repeat for every domain (including the
      sandbox/preview one) and again in the production account.
4. Testing: Apple Pay needs real Safari on an Apple device with a card in Wallet and
   an HTTPS domain registered as above (Airwallex sandbox uses real cards with demo
   keys; see their "Apple Pay payment scenarios"). Google Pay needs Chrome signed in to
   a Google account with a card, on HTTPS. Neither can be verified in headless CI or
   on `http://localhost`; the automated tests mock feature detection.

Until steps 1–3 are done the buttons simply never become `ready` and stay hidden.

## Go-live decisions ("needs your decision before prod")

Nothing below is decided; the store refuses production traffic until
`PRICING_APPROVED=true`.

| Decision | Today (placeholder) | Where to set it |
| --- | --- | --- |
| D204 price | $29.90 | `products.d204.priceCents` |
| D215 price | $24.90 | `products.d215.priceCents` |
| Shipping methods, fees, delivery promises | Standard free (5–7 business days), Express $9.00 (2 business days) | `shippingMethods`, `defaultShippingMethod` |
| Who fulfils DTC orders / shipping regions | Amazon MCF from FBA stock is built, **off** by default (US addresses only) | `MCF_AUTO_SUBMIT`, `MCF_SKU_MAP_JSON`, see "Amazon MCF" |
| Sales tax: collect or not, rates per state, nexus/registration, or a tax service | $0 everywhere (`tax.status = undecided`) | `tax.defaultRateBps`, `tax.stateRatesBps`; or replace `computeTax` with a tax service |
| Is shipping taxable | no | `tax.shippingTaxable` |
| Max quantity per item | 10 | `maxQtyPerLine` |
| Capture immediately or authorise first | capture immediately | `PAYMENT_AUTO_CAPTURE` |
| Wallet sheet business name | `APGO` | `WALLET_MERCHANT_NAME` |
| Approve the numbers | not approved | `PRICING_APPROVED=true` (only with `AIRWALLEX_ENV=prod`) |

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars    # fill in Airwallex SANDBOX credentials (+ ADMIN_TOKEN)
npm run db:migrate:local           # re-run after pulling: schema.sql is additive/idempotent
npm run dev                        # http://127.0.0.1:8799/v3.html  ·  /cart.html?add=d204  ·  /admin/
```

Sandbox test card: `4035 5010 0000 0008`, any future expiry, any CVC.
3DS challenge: `4012 0003 0000 0088` (OTP `1234`). Risk decline: `4646 4646 4646 4644` (any amount). Elements authentication failure: `4012 0003 0000 0013`.

Browser smoke test (Airwallex.js iframes, use when the account has no native API access): start `npm run dev`, then `npm run smoke:airwallex:browser` (`-- --card declined`, `-- --headed`). Screenshots go to `review/airwallex-browser-*.png`.

Smoke test of the whole payment flow against the real sandbox: see
"Airwallex sandbox smoke test" below.

Webhooks cannot reach `localhost`; locally the confirmation page settles the
order through the retrieve fallback. To exercise the webhook path, expose the
dev server (e.g. `cloudflared tunnel --url http://127.0.0.1:8799`) and register
`<tunnel>/api/webhooks/airwallex` in the sandbox web app.

## Order back office (`/admin/`)

On staging (and planned prod) the back office is served **only on its own hostname** (`https://admin-staging.shopapgo.com/admin/`, prod plan `admin.shopapgo.com`); the store domain answers 404 for `/admin*`. See "Separate back-office host".

A page for the team (read-only apart from **Mark as shipped** and the Amazon MCF buttons, see "Fulfilment" and "Amazon MCF"): order list (status tabs with counts, search by
order id / email / name / address, "load older"), and a detail panel with the
**shipping address, items, amounts, payment status + PaymentIntent id, email,
and notification result**. Statuses: `paid`, `pending` (awaiting payment),
`review` (succeeded but amount/currency mismatch: check Airwallex before
shipping), `cancelled`.

Protection is the **`ADMIN_TOKEN` Worker secret** (≥ 16 characters):

- Browser: open `/admin/`, the native Basic-auth prompt appears; any username,
  password = `ADMIN_TOKEN`. The page and `/admin/api/*` share the `/admin/` path
  so the browser re-sends the credentials automatically. Nothing is stored by the
  page code.
- Scripts: `curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<domain>/admin/api/orders`.
- No token (or a short one) configured → everything under `/admin/` answers
  **503** (closed by default). Wrong/missing credentials → 401 with a Basic
  challenge. Comparison is constant-time (SHA-256 digests). All responses send
  `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store`; the API is GET-only
  except the write endpoints (`POST /admin/api/orders/:id/ship` and the three MCF POSTs).
- `wrangler.toml` routes `/admin` and `/admin/*` through the Worker first
  (`run_worker_first`), so static files cannot be fetched around the gate.
- Generate a value with `openssl rand -base64 32`; set it with
  `npx wrangler secret put ADMIN_TOKEN` (remote) or in `.dev.vars` (local). Rotate
  by setting a new secret. This is a single shared secret: for named per-person
  access or SSO, put Cloudflare Access in front of `/admin/*` later.
- The back office shows customer addresses and emails: keep the token out of chat,
  tickets and the repo.

## New paid-order notification

**Assessment.** Email needs an email-sending provider and a verified sender
domain; Cloudflare's own Email Service/Email Routing send needs account-level
setup (and destination verification) that we cannot assume, and a Worker cannot
speak SMTP. So the Worker ships with **two opt-in channels that need no key
unless the operator chooses one**, and with neither configured it **skips and
logs** (`order_notification_skipped`). Nothing is ever sent by default, and this
repository never sends anything.

| Channel | Enable with | Notes |
| --- | --- | --- |
| Webhook (recommended to start) | `ORDER_NOTIFY_WEBHOOK_URL` (https) | Works with Slack / Discord / Teams incoming webhooks, Zapier, Make, n8n (which can then email). JSON body `{ event: "order.paid", text, order: {...} }`; `text` is the Slack/Discord-compatible message. Optional `ORDER_NOTIFY_WEBHOOK_SECRET` adds `X-APGO-Timestamp` and `X-APGO-Signature: sha256=hex(HMAC-SHA256(secret, timestamp + "." + body))`. A webhook URL is itself a secret: set it with `wrangler secret put`. |
| Email via Resend API | `RESEND_API_KEY` + `ORDER_NOTIFY_EMAIL_TO` (comma-separated) + `ORDER_NOTIFY_EMAIL_FROM` | Needs a Resend account and a verified sender domain (user action). `ORDER_NOTIFY_EMAIL_API_URL` overrides the endpoint (tests). |

Behaviour:

- Fires when an order becomes `paid` (webhook **or** confirmation-page poll,
  whichever wins), once per order: an `order_notifications` row is claimed first
  (primary key), so duplicates/races cannot double-send. It runs in
  `ctx.waitUntil`, so it never delays the webhook response or the shopper.
- `review` and `cancelled` orders do not notify.
- Content: order id, total, items (`qty × SKU`), destination **state**, shipping
  method, link to `/admin/`. **No customer email, street address or card data**
  leaves the Worker; the details stay behind the admin login.
- A failing channel is logged (`order_notification_failed`, reason only, never
  the URL or key) and recorded per channel in D1; it never changes the order.
  The result is visible in the back office ("Notification: sent / failed /
  skipped"). There is no automatic retry yet (see the go-live list).
- Shopper emails are a separate feature with their own idempotency: see "Customer emails".

## Fulfilment (mark as shipped)

Payment status and fulfilment status are separate. `orders.status` stays
`pending | paid | review | cancelled`; fulfilment is **`unfulfilled`** (no record) or
**`shipped`** and lives in its own table, `order_fulfillments`.

- **Back office:** open a paid order → *Fulfilment* → carrier (required), tracking number
  (required), tracking link (optional, `https://` only) → **Mark as shipped**. The detail then
  shows carrier, tracking, shipped time, who did it and a link. Unpaid (`pending` / `review` /
  `cancelled`) orders show "Only paid orders can be marked shipped" instead of a form.
- **List:** a second tab row filters by shipping: *Any shipping*, *To ship* (paid and not shipped;
  the work queue, with a count) and *Shipped*. Rows carry a `to ship` / `shipped` badge.
  API: `GET /admin/api/orders?fulfillment=unfulfilled|shipped` (other values → 400); the
  response also returns `fulfillmentCounts`.
- **Rules (enforced by the Worker, not just the UI):** only `paid` orders (409 `not_paid`
  otherwise); one shipment per order (409 `already_shipped`; the `order_id` primary key makes
  two simultaneous clicks ship once and send one email); carrier ≤ 60 and tracking number ≤ 80
  characters, no control characters (blocks header/line injection into the email); tracking link
  must be an `https` URL without credentials. There is no "un-ship" or edit yet (see decisions).
- **Protection:** same `ADMIN_TOKEN` (Bearer or the browser's Basic prompt) as the rest of
  `/admin/`. The write is **POST only** (other methods → 405 with `Allow: POST`), needs
  `Content-Type: application/json` (a cross-site `<form>` cannot send it) and, when the browser
  sends `Origin` / `Sec-Fetch-Site`, must be same-origin (else 403). This matters because a
  browser re-sends Basic credentials by itself. Bearer scripts (`curl -H "Authorization: Bearer …"
  -H "Content-Type: application/json" -d '{"carrier":"UPS","trackingNumber":"…"}'`) work unchanged.
- **Audit:** every shipment writes `order_audit` (`order.shipped`, actor, carrier, tracking,
  time; append-only) and stamps `shipped_at` / `shipped_by` on the fulfilment row. The actor is
  the literal `admin` because there is one shared token (named users need Cloudflare Access).
  The detail panel shows the history.

### Migration (existing databases)

`npm run db:migrate:local|remote` re-runs `worker/schema.sql` every time, and SQLite/D1 cannot
re-run an added-column statement without erroring. So this change adds **only new tables**, all
`CREATE TABLE/INDEX IF NOT EXISTS`: `order_fulfillments`, `order_emails`, `order_audit`.
`orders` is untouched; an existing order with no fulfilment row simply reads as `unfulfilled`.
Run `npm run db:migrate:remote` **before** deploying this Worker (the order detail queries the new
tables). Re-running is safe (tested three times against an in-memory DB and twice against local D1).
Rollback: the old Worker ignores the new tables.

## Customer emails

Two emails go to the shopper through the same Resend API as the team notification
(`worker/customer-email.js`):

| Email | When | Content |
| --- | --- | --- |
| Order confirmation | once, when the order first becomes `paid` (webhook or confirmation-page poll, whichever settles it; same guarded `UPDATE` as the team notification) | order number, items, subtotal / shipping / tax / total, shipping address, plain text + simple HTML |
| Shipment notice | when an admin marks the order shipped | the above plus carrier, tracking number and (if given) tracking link |

- **Durable delivery:** `order_email_delivery` stores a frozen payload, stable Resend idempotency
  key, provider message ID, attempt count, due time and atomic lease. Retries reuse exactly the
  same payload/key. `review`, unpaid and cancelled orders get no email. The original
  `order_emails` table remains a compatibility projection: `sent` means API acceptance,
  **not proven delivery**. The admin shows the distinct delivery state and provider ID.
- **Opt-in, safe by default:** with no `RESEND_API_KEY` or sender, the email is **skipped and
  recorded**. `CUSTOMER_EMAIL_ENABLED=false` turns it off. Staging additionally requires exact
  `CUSTOMER_EMAIL_TEST_RECIPIENTS`; it never reroutes a customer's order to a test address.
- **Never affects the order:** HTTP failures, missing response IDs and 10-second timeouts are
  safely recorded without raw response messages, recipients or keys. A configured Cron Trigger
  plus `CUSTOMER_EMAIL_RETRY_CRON=true` retries network/5xx/429/concurrent-idempotency errors,
  honoring Retry-After and exponential backoff. Six attempts maximum; after 23 hours a missing-ID
  send stops for review before Resend's 24-hour idempotency key expires. Permanent 4xx errors
  need operator repair and an explicit admin retry inside the safe window. Accepted messages,
  bounces, complaints and expired/legacy ambiguous records cannot be sent again.
- **Delivery events:** `POST /api/webhooks/resend` verifies the raw body's Svix HMAC and a
  five-minute timestamp tolerance, dedupes by `svix-id`, persists minimal event metadata and
  safely reconciles out-of-order events (including events arriving before the send response).
  States include accepted, delivered, delivery delayed, bounced, complained, suppressed and
  failed. Bounce/complaint/suppression prevents future customer sends to that recipient.
  Register a separate storefront webhook; do not change another app's endpoint.
- **Admin retry:** authenticated `POST /admin/api/orders/:id/emails/:kind/retry` uses the existing
  same-origin/JSON CSRF guards and records an audit entry. Historical skipped emails are only
  attempted explicitly, not swept up by cron. The outbox's frozen payload contains customer
  information; protect and retain it like the order table, never return it to public APIs.
- **No invented promises:** the templates state only facts from the order. No return policy and
  no delivery-time promise are written; if the owner approves a sentence, put it in
  `CUSTOMER_EMAIL_POLICY_NOTE` (appended verbatim to both emails). All customer-supplied text is
  HTML-escaped.
- Runs in `ctx.waitUntil` on payment (never delays the webhook); on shipping the admin request
  waits for the first send (≤ 10 s) and reports acceptance / skipped / failed, separately from delivery.

Environment (none is a secret except the key; all are optional):

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | secret, shared with the team notification |
| `CUSTOMER_EMAIL_FROM` | sender, e.g. `APGO <orders@your-domain>`; falls back to `ORDER_NOTIFY_EMAIL_FROM` |
| `CUSTOMER_EMAIL_REPLY_TO` | optional reply-to |
| `CUSTOMER_EMAIL_POLICY_NOTE` | optional approved paragraph appended to both emails |
| `CUSTOMER_EMAIL_ENABLED` | `false` disables customer emails |
| `RESEND_WEBHOOK_SECRET` | secret for the storefront's Resend subscription |
| `CUSTOMER_EMAIL_TEST_RECIPIENTS` | required staging allowlist, exact comma-separated emails |
| `CUSTOMER_EMAIL_RETRY_CRON` | `true` enables processing due outbox rows when a Cron Trigger runs |
| `ORDER_NOTIFY_EMAIL_API_URL` | endpoint override for tests/proxies (shared) |

**Decisions still open:** sender name/domain and reply-to address; whether to include a returns /
support sentence (needs the Returns page wording to be final) and any delivery-time wording
(the shipping method text "5–7 business days" is a placeholder and is deliberately *not* used);
whether to send a "payment received but under review" email; marketing opt-in is not used here
(these are transactional); provider-history review after exhausted retries; editing/undoing a shipment (today a wrong
tracking number needs a DB fix); partial shipments and multiple parcels; refunds/cancellations
after payment; named admin users.

## Amazon MCF (Multi-Channel Fulfillment from FBA stock)

All stock sits in Amazon FBA, so DTC orders are fulfilled by **Amazon MCF**. **This Worker holds no Amazon credentials.** `worker/amazon-mcf.js`
calls the internal *outbound* HTTP endpoints of the **amazon-spapi-mcp** Worker (v1.5.0+, `https://amazon-mcp.apgo.tw`), which keeps the Login-with-Amazon
credentials and talks to SP-API Fulfillment Outbound. **It is OFF by default**: nothing is sent, and no real shipment can be created, until you switch it on.

### The outbound endpoints (amazon-spapi-mcp v1.5.0)

`GET /admin/api/mcf/check` (ADMIN_TOKEN) is a read-only connection test: it lists MCF orders and previews one unit of each store SKU (D204 and D215) to a Seattle address (fee + arrival window). Missing SKU mappings fail the check. The admin's **Check MCF connection** button displays both previews and the automatic fulfillment state. It creates and cancels nothing and works while `MCF_AUTO_SUBMIT` is off.

Auth: `Authorization: Bearer <OUTBOUND_INTERNAL_TOKEN>` (missing/wrong → 401; secret unset on the MCP Worker → 503). Base URL: `AMAZON_OUTBOUND_BASE_URL`
(must be `https://`, the bearer never travels over http). All JSON; top level snake_case, nested `address` / `destination_address` / `items[]` camelCase; replies are the raw
SP-API JSON (Fulfillment Outbound **v2020-07-01** shapes); errors `{ error, spapiStatus, details }`, validation failures 400 with `issues`.

| Endpoint | Client function | Notes |
| --- | --- | --- |
| `POST /internal/outbound/preview` | `getFulfillmentPreview` | read-only: fee + arrival window per speed (`address`, `items[]`, `shipping_speed_categories`) |
| `POST /internal/outbound/orders` | `createFulfillmentOrder` | **REAL order** (ships, uses FBA stock). `seller_fulfillment_order_id` (≤ 40 chars) is the idempotency key: a known id answers `{created:false, alreadyExists:true, existing}` and is **never re-created** |
| `GET /internal/outbound/orders/:id` | `getFulfillmentOrder` | status, shipments, carrier, tracking; 404 → `null` |
| `GET /internal/outbound/orders?query_start_date=&next_token=` | `listFulfillmentOrders` | pages can be empty yet carry `nextToken`; the client follows them (max 20 pages) |
| `POST /internal/outbound/orders/:id/cancel` | `cancelFulfillmentOrder` | no body |
| `GET /internal/outbound/tracking/:packageNumber` | `getPackageTracking` | numeric, from `fulfillmentShipments[].fulfillmentShipmentPackage[].packageNumber`; used when `getOrder` lists a COMPLETE package without a tracking number |

Statuses (v2020-07-01): `RECEIVED`, `INVALID`, `PLANNING`, `PROCESSING`, `CANCELLED`, `COMPLETE`, `COMPLETE_PARTIALLED`, `UNFULFILLABLE`. Tracking =
`fulfillmentShipmentPackage[].{carrierCode, trackingNumber}`. Previews: `fulfillmentPreviews[].{shippingSpeedCategory, isFulfillable, estimatedFees[], fulfillmentPreviewShipments[].{earliest,latest}ArrivalDate}`.
Amazon-side requirement (unchanged): the SP-API app behind the MCP Worker needs the **Amazon Fulfillment** role; a 403 is shown as an `auth` error saying so.

### Behaviour

```text
payment succeeds (same guarded "pending → paid" UPDATE as notification + confirmation email)
   └─ MCF_AUTO_SUBMIT=true AND outbound connection (2 settings) AND SKU map covers the order AND shipping method has a tier?
        no  → log "mcf_skipped"; nothing stored; /admin/ shows "MCF not enabled — ship this order manually"
        yes → claim order_mcf row (primary key) → POST /internal/outbound/orders (seller_fulfillment_order_id = our order id) → status "submitted"
                 failure → row status "failed" + error (payment untouched, never throws) → admin "Retry send to Amazon"
sync (admin button, or optional cron) → GET /internal/outbound/orders/:id
   COMPLETE / COMPLETE_PARTIALLED + a package with tracking → markShipped() (carrier, tracking, actor "mcf") → shipment email
```

* **Turn it on:** `MCF_AUTO_SUBMIT=true` **and** `AMAZON_OUTBOUND_BASE_URL`, `OUTBOUND_INTERNAL_TOKEN` **and** `MCF_SKU_MAP_JSON`. Anything missing → "on but not ready" with the reason (names only, never values).
* **SKU map** (`MCF_SKU_MAP_JSON`, default empty, nothing is sent until set): `{"D204":"<Amazon seller SKU>","D215":"<Amazon seller SKU>"}`.
  Every line of the order must be mapped, or the order is not sent. Not hard-coded: the owner confirms the SKUs
  (the read-only FBA inventory check is in the hand-over report; the seller SKUs there look like `D204` / `D215`).
* **Ship speed** follows the order's shipping option: `standard` → `STANDARD`, `express` → `EXPEDITED`
  (override: `MCF_SHIPPING_MAP_JSON`; an unmapped method is not sent).
* **Recipient** = order address (name, street, street2, city, state, ZIP, country US) plus `phone` when the order's address has one (checkout does not collect a phone today,
  so normally none). `displayable_order_id` = our order id, `displayable_order_date` = paid time, `fulfillment_action` = `Ship`.
  **Amazon email notices:** `notification_emails` is **not sent by default**, so the only shipping email the shopper gets is ours (no duplicates). Set
  `MCF_NOTIFY_AMAZON_EMAIL=true` to also pass the shopper's email and let Amazon send its own notices. No declared value, no packing-slip text.
* **Table** `order_mcf` (new, `CREATE TABLE IF NOT EXISTS`, one row per order): `status` (`submitting | submitted | shipped | failed | rejected`),
  Amazon's `mcf_status`, `attempts`, `service_tier`, `error_kind` / `error_message` (short, no credentials), `note`, carrier / tracking,
  `submitted_at`, `last_synced_at`. No row = never sent. `npm run db:migrate:*` adds it; an old database that has not run it yet still serves
  `/admin/` (the MCF block just reads "not sent").
* **Back office** (`/admin/`, order detail → *Amazon MCF*): mode (off / not ready + why / ready), the record above, **Retry send to Amazon**
  (only when there is no record, or it `failed` / was `rejected`, and MCF is ready) and **Sync MCF status**; the toolbar has **Sync MCF status** for
  all waiting orders. All are `POST` + `Content-Type: application/json` + same-origin + `ADMIN_TOKEN` (the same guards as *Mark as shipped*), paid orders only.
  The retry endpoint cannot bypass the switch: with MCF off it answers `skipped` and calls nothing.

### No duplicate shipments (the important part)

1. **One automatic submission per order:** the `order_mcf` primary key is claimed before anything is sent; webhook redeliveries, the
   confirmation-page poll and racing admin clicks all lose the claim (`duplicate`) without calling Amazon.
2. **`seller_fulfillment_order_id` = our order id** (`APGO-US-` + 12 chars = 20 ≤ 40). The endpoint answers `alreadyExists` for a known id and never creates a second order, so even a repeated request cannot ship twice; the Worker adopts that existing order.
3. **Retries only reuse that id.** Network errors, timeouts, 429 and 5xx are retried up to 3 times (0.5 s, 1 s backoff, 10 s timeout) with the *same* body.
   A timeout is *ambiguous* (Amazon may have stored the order), so before recording a failure, and before any manual retry, the Worker asks `GET …/orders/:id`; if Amazon
   has it, the row is adopted as `submitted` ("Found at Amazon after an unconfirmed attempt") instead of sending again.
4. **A new id is used only when Amazon itself closed the old order** (`CANCELLED` / `UNFULFILLABLE` / `INVALID` → row `rejected`): the retry sends `<order id>-R2`, `-R3`…
   (the old id is spent at Amazon). Never for a mere failure.
5. A 400 (bad address, unmapped/unknown SKU, no stock) is final: stored with Amazon's `details` text, fixed by the owner, then retried with the button.

Error classes (`McfError.kind`): `config` (missing settings / invalid input / MCP answered 503, nothing sent) · `auth` (**401 = wrong `OUTBOUND_INTERNAL_TOKEN`**; Amazon `spapiStatus` 401/403 = app lacks the Amazon Fulfillment role) ·
`rate_limited` (429, retried) · `transient` (network/timeout/5xx, retried) · `invalid` (400 incl. validation `issues`, 409/413/415) · `not_found` (404; `getOrder` returns `null`) · `unexpected`.
There is no token handling in this Worker any more: the MCP Worker does the Login with Amazon refresh.

### Status sync → "shipped" (idempotent, one email)

* Trigger: admin **Sync MCF status** (per order or all; bounded to 25 orders per run), or the optional cron.
* `COMPLETE` (or `COMPLETE_PARTIALLED`) with at least one tracking number (from `getOrder`, else from the per-package tracking endpoint) → the existing `markShipped()` (actor `mcf`; the `order_fulfillments` primary key makes it
  a one-time insert) → the existing shipment email (claimed once per `(order, "shipment")`). Carrier = Amazon's carrier code (`AMZL` → "Amazon Logistics",
  `UPS`, `USPS`, `FEDEX`…). Several packages → their tracking numbers joined with `, ` and no tracking link; no link is invented for one package either.
* Already shipped by hand, or by a racing sync → no second record, no second email (`mcf.status = shipped`, note "Order was already marked shipped").
* Amazon `COMPLETE` with no tracking yet → waits ("Amazon shipped; waiting for a tracking number"), next sync picks it up.
* Amazon `UNFULFILLABLE` / `CANCELLED` / `INVALID` → `rejected`, error shown, retry button offered; the order stays unshipped.
* A failed poll (Amazon unreachable) only writes a note; it never turns a submitted order into a failure.
* **Cron (optional, not configured):** the Worker exports `scheduled()`; it does nothing unless `MCF_SYNC_CRON=true`. To use it add to `wrangler.toml`
  `[triggers] crons = ["*/30 * * * *"]` **and** set `MCF_SYNC_CRON=true` (both are off today).

### Environment

| Variable | Kind | Purpose |
| --- | --- | --- |
| `AMAZON_OUTBOUND_BASE_URL` | secret/var | `https://amazon-mcp.apgo.tw` (https only) |
| `OUTBOUND_INTERNAL_TOKEN` | secret (`wrangler secret put`) | bearer for the MCP outbound endpoints; empty in `.dev.vars.example` |
| `MCF_AUTO_SUBMIT` | var | `"true"` to send paid orders automatically (default off) |
| `MCF_SKU_MAP_JSON` | var | our SKU → Amazon seller SKU (default `{}` → nothing is sent) |
| `MCF_SHIPPING_MAP_JSON` | var, optional | our shipping-method key → `STANDARD` / `EXPEDITED` (defaults: standard, express) |
| `MCF_SYNC_CRON` | var, optional | `"true"` lets a configured cron sync statuses |
| `MCF_NOTIFY_AMAZON_EMAIL` | var, optional | `"true"` = also send the shopper's email to Amazon (Amazon's own shipping notices; default off) |
| `MCF_TIMEOUT_MS`, `MCF_RETRY_DELAY_MS` | var, optional | tuning overrides |

The old `SPAPI_LWA_CLIENT_ID` / `SPAPI_LWA_CLIENT_SECRET` / `SPAPI_REFRESH_TOKEN` and `MCF_API_BASE` are **no longer read**; the Amazon credentials live only in the amazon-spapi-mcp Worker.

### What you must do before turning it on (cannot be automated from this repo)

1. **Amazon Fulfillment role.** The SP-API app behind amazon-spapi-mcp must have it (and the seller must have authorised the app for Fulfillment Outbound). Without it,
   create calls fail with `spapiStatus` 403 (shown as an `auth` error).
2. **Connection secrets** on this Worker: `AMAZON_OUTBOUND_BASE_URL` and `OUTBOUND_INTERNAL_TOKEN` (set with `wrangler secret put`; the same token the MCP Worker holds as its `OUTBOUND_INTERNAL_TOKEN` secret).
3. **Confirm the SKU mapping** and set `MCF_SKU_MAP_JSON` (FBA inventory showed seller SKUs `D204` / `D215`). Check that the SKUs are FBA-fulfillable with enough stock.
4. **Test without shipping anything:** the read-only preview and list endpoints need no order. The **first real order** is a real shipment that consumes FBA stock and is charged MCF fees
   (the endpoints have no sandbox): place one small order yourself to your own address, with `MCF_AUTO_SUBMIT=true` only for that moment, watch it in `/admin/`, sync it, then decide.
5. **Decide what shoppers are told about MCF shipping** (see next section), then `npm run db:migrate:remote` **before** deploying (adds `order_mcf`).

### Shipping cost and delivery time shown to shoppers: open decision

* The store charges its own `shippingMethods` (today Standard free / Express $9.00, placeholders). **MCF fees are paid by the seller to Amazon**, separate per order
  and dependent on size/weight/speed; `getOrderPreview` (`getFulfillmentPreview` in the client) returns that estimate plus `deliveryInterval`, but
  **it is not wired into checkout** and the code never promises a date. Decide: (a) keep flat fees and accept the MCF cost as margin, (b) set the flat fees from preview
  numbers (compare with `previewOrderForMcf`/`getFulfillmentPreview` for a sample address), or (c) later call the preview at checkout (needs the ZIP; adds an Amazon call to the shopper path).
* Delivery wording: the checkout's "5–7 business days" / "2 business days" is still a placeholder. Amazon's real interval comes from the preview; decide what the page may say
  (e.g. "ships from Amazon's network", no dates) before `PRICING_APPROVED=true`. Shipment emails currently carry the carrier/tracking Amazon reports and no delivery promise.
* By default no shopper email goes to Amazon (`MCF_NOTIFY_AMAZON_EMAIL` off), so the only shipping message the shopper gets is ours.
* Unbranded packaging / packing slip are not requested (Amazon's default MCF packaging applies); say so if brand-neutral packaging is required.

Tests: `tests/commerce-mcf.test.mjs` (node:test, fake outbound endpoints in `tests/helpers/fake-amazon-mcf.mjs`; `fetch` is replaced, neither Amazon nor the MCP Worker is ever called) and
`tests/admin-mcf.spec.mjs` (Playwright, stubbed `/admin/api`). `npm run capture:admin-mcf` writes `review/admin-mcf-{off,failed,sent,shipped}-{desktop,mobile}.png`.

## Airwallex integration review

Checked against the current Airwallex docs (API auth, PaymentIntents, webhooks,
Airwallex.js split card elements). What was verified as correct: login endpoint
and headers, 30-minute token reuse, major-unit amounts (`toMajor`), hex
HMAC-SHA256 over `x-timestamp + raw body` verified before parsing, split-element
init (`{ env, enabledElements: ["payments"] }`, `cardNumber`/`expiry`/`cvc`,
`confirm({ intent_id, client_secret })`), no card data touching our server.

Changed in `worker/airwallex.js` and `worker/index.js`:

| Area | Before | Now |
| --- | --- | --- |
| Create PaymentIntent idempotency | random `request_id` per call, so a retried create made a second intent | `request_id` = the order id (≤ 64 chars); Airwallex returns the original intent on retry |
| Transient errors | none handled | 10 s timeout; GET and keyed creates retry on network errors / 429 / 5xx (3 tries, backoff); creates without a `request_id` never retry |
| 401 | cleared token but failed the request | re-logs in once and replays |
| Login | no retry, one global token | retries transient failures; token cache keyed by base + client id + `x-login-as`; optional `AIRWALLEX_LOGIN_AS` for multi-account scoped keys |
| Failed create | order left `pending` forever | order marked `cancelled` (shopper retries with a new order); provider detail is logged (`code`, `source` = offending field) but never shown to the shopper |
| PaymentIntent payload | no customer / shipping fee | adds `customer` (email, names, improves 3DS/risk), `order.shipping.fee_amount`, `metadata.order_id` |
| Webhook body | unvalidated `JSON.parse` (500 on bad body) | 400 on non-JSON / non-event bodies |
| Late webhooks | rejected (400) after 5 min, so Airwallex kept retrying | a genuine (signed) late delivery is accepted and the order is settled from the Retrieve API rather than from the stale body |
| Notification | none | once-only, see above |

Known limits, not changed: a webhook secret set in the wrong place (sandbox vs.
production web app each have their own) shows up as 400s; the `client_secret`
is returned to the browser by design and is never logged; one `payment_intent`
per checkout attempt means an edited cart after the session was created makes a
new order (same as before).

## Airwallex sandbox smoke test

`.dev.vars` ships with the Airwallex fields empty (run `awk -F= '/^AIRWALLEX/{print $1,length($2)}' .dev.vars`
to see only lengths). Once you paste your **sandbox** client id and API key
(Airwallex web app, sandbox → Developer → API keys) into `.dev.vars`:

```bash
npm run smoke:airwallex                       # success card
npm run smoke:airwallex -- --card declined    # decline path
npm run smoke:airwallex -- --base http://127.0.0.1:8799   # reuse a running `npm run dev`
```

It starts `wrangler dev` with a local D1, then: logs in to the sandbox →
`POST /api/checkout/session` (real PaymentIntent) → confirms it with test card
`4035 5010 0000 0008` server-side → polls `GET /api/orders/:id` until `paid` →
(if `AIRWALLEX_WEBHOOK_SECRET` is set) posts a locally signed
`payment_intent.succeeded` to prove signature/idempotency wiring → (if
`ADMIN_TOKEN` is set) confirms the order shows as paid with its address in the
back office. It prints only set/EMPTY per variable, never values, refuses
`AIRWALLEX_ENV=prod`, and exits `0` pass · `1` fail · `2` blocked.

Caveats: the script confirms with raw card data from the server, which some
Airwallex accounts restrict; if the sandbox rejects it the script says so, and
the browser flow (`/checkout.html`, Airwallex.js) is the authoritative test. 3DS
cards cannot be completed by a script. The webhook check is signed by the script
with the same secret, so it does not prove the secret matches the web app: for
that, register a tunnel URL (see above) and pay in the browser once.

**Status on 2026-09-30:** not yet run against the real sandbox because the
`.dev.vars` Airwallex fields are empty (blocked on keys). The script itself was
dry-run end-to-end against a local fake Airwallex API (success and declined
paths), and all Worker logic is covered by `tests/commerce-backend.test.mjs`.

## Environments: staging and production

`wrangler.toml` keeps the top level for local dev (`npm run dev`, placeholder D1 id, unchanged) and defines two environments.
Wrangler does not inherit bindings/vars/assets into `[env.*]`, and secrets are stored per environment.

| | local dev | `staging` (deployed) | `production` (planned, NOT deployed) |
|---|---|---|---|
| Worker | `wrangler dev` | `apgo-us-store-staging` | `apgo-us-store` |
| URL | http://127.0.0.1:8799 | `https://apgo-us-store-staging.<account>.workers.dev` (no custom domain; preview URLs off) | `https://store.shopapgo.com` (route commented out in `wrangler.toml`) |
| D1 | local SQLite | `apgo-us-store-staging` (own database) | `apgo-us-store` (placeholder id until created) |
| `AIRWALLEX_ENV` | `demo` | `demo` (Airwallex **sandbox**; `worker/airwallex.js` treats anything but `prod` as sandbox) | `prod` |
| `SITE_ENV` | unset | `staging` | unset |
| `ROOT_PAGE` | unset | `/v3`: `/` serves the v3 store entry (cart badge + Add to cart); `prototype/index.html` is the older Amazon-referral landing without a cart (`worker/root-page.js`) | unset |
| `PRICING_APPROVED` | unset | unset (only matters for prod) | **unset**: checkout answers 503 (payments closed) until the owner approves prices/shipping/tax |
| `EXPRESS_CHECKOUT` | unset (off) | `"true"`: cart-page Apple Pay / Google Pay block on (UI only) | **unset** (off) |
| Airwallex keys | sandbox (`.dev.vars`) | sandbox only | production keys, set by the owner |

### Staging protections (`worker/staging.js`, active only when `SITE_ENV=staging`)

With `SITE_ENV` unset (local dev and production) the module is a pass-through: no extra header, no gate, `/robots.txt` is the normal static file.

- Every response gets `X-Robots-Tag: noindex, nofollow, noarchive`, and `GET /robots.txt` answers `User-agent: *` / `Disallow: /`.
- The whole site is behind **HTTP Basic auth** (secrets `STAGING_BASIC_AUTH_USER`, `STAGING_BASIC_AUTH_PASSWORD`; missing secrets fail closed with 503).
  `run_worker_first = true` in `[env.staging.assets]` makes static pages and images go through the Worker too.
  Blocked: pages (`/`, `/v3`, policy pages, cart, checkout), static files (css/js/images), `/api/store/config`, `/api/cart/quote`,
  `/api/checkout/session`, `/api/orders/:id`, Apple Pay association file.
- **Not** behind the Basic gate: `/robots.txt` (crawlers must read it); `POST /api/webhooks/airwallex` (Airwallex cannot send our
  credentials; the handler verifies the Airwallex signature itself); `/admin` and `/admin/*` and the whole `ADMIN_HOST` hostname (their own
  `ADMIN_TOKEN` check, which is also an Authorization header, so a second gate in front would break it; one password only). A valid
  `ADMIN_TOKEN` password also passes the Basic gate, because the admin page loads its CSS/JS from gated paths.
- Why not Cloudflare Access: the Wrangler OAuth login has no Access (Zero Trust) scope, so it could not be configured from here.
  Basic auth is the fallback; Access with an email allow-list can replace it later (then unset `SITE_ENV`'s gate or keep both).
- Credentials are kept in the password vault (see "Handoff"). The older `~/.apgo-staging-credentials` file on the owner's Mac is **out of date**: do not rely on it. Names: `STAGING_BASIC_AUTH_USER`,
  `STAGING_BASIC_AUTH_PASSWORD`, `ADMIN_TOKEN`. Never commit or paste values.
- Card tests: use Airwallex sandbox test cards only, e.g. `4035 5010 0000 0008` (success), any future expiry, any CVC;
  `4646 4646 4646 4644` triggers a sandbox risk decline at any amount. No real charge can happen because staging only has sandbox keys.

### Staging secrets (`npx wrangler secret put <NAME> --env staging`)

| Secret | Value |
|---|---|
| `AIRWALLEX_CLIENT_ID`, `AIRWALLEX_API_KEY` | Airwallex **sandbox** keys (same as `.dev.vars`) |
| `ADMIN_TOKEN` | fresh random value, different from the local one |
| `STAGING_BASIC_AUTH_USER`, `STAGING_BASIC_AUTH_PASSWORD` | random; stored in the password vault (see "Handoff") |
| `AIRWALLEX_WEBHOOK_SECRET` | **set October 2**: sandbox subscription registered at `https://staging.shopapgo.com/api/webhooks/airwallex`. Genuine sandbox success and authentication-failure deliveries passed; a success redelivery returned 200 without duplicating order records. The confirmation-page Retrieve fallback is retained. See `staging-rollout-2026-10-02.md`. |
| `AMAZON_OUTBOUND_BASE_URL`, `OUTBOUND_INTERNAL_TOKEN` | set (by the amazon-spapi-mcp maintainer; values never printed). `MCF_SKU_MAP_JSON` is set too. |
| `MCF_AUTO_SUBMIT`, notification / Resend secrets | **not set** (Amazon MCF stays off, no emails sent) |

Never put production keys (`AIRWALLEX_PROD_*` or the prod API key) into staging.

### Deploy and verify staging

```bash
npm run test:static && npm run test:e2e        # must be green first
npm run deploy:staging                          # = db:migrate:staging (schema.sql, idempotent) + wrangler deploy --env staging
node scripts/staging-check.mjs --base https://staging.shopapgo.com --admin-base https://admin-staging.shopapgo.com --credentials ~/.apgo-staging-credentials
node scripts/airwallex-browser-smoke.mjs --base https://staging.shopapgo.com --admin-base https://admin-staging.shopapgo.com --credentials ~/.apgo-staging-credentials
```

The browser smoke runs a full sandbox card payment and checks `/admin/` shows the order as paid (screenshots: `review/airwallex-browser-staging-*.png`,
`review/staging-*.png`). It leaves a paid **sandbox** order in the staging D1.

### Custom domains (done on staging)

`[env.staging]` in `wrangler.toml` has `routes = [{ pattern = "staging.shopapgo.com", custom_domain = true }, { pattern = "admin-staging.shopapgo.com", custom_domain = true }]`
(zone `shopapgo.com`, same Cloudflare account as the wrangler login). `wrangler deploy --env staging` creates the proxied DNS records and the TLS
certificates itself; `workers_dev = true` keeps `https://apgo-us-store-staging.<account>.workers.dev` working. The `www` host (Pages project `shopapgo`)
and every other DNS record are untouched. Note that the zone has a wildcard `*` CNAME (-> Vercel); Custom Domains take precedence for their exact
hostnames, nothing else changes.

| Host | Serves | Protection |
|---|---|---|
| `https://staging.shopapgo.com` (and workers.dev) | storefront, `/api/*`; **`/admin*` → 404** | Basic auth (`STAGING_BASIC_AUTH_*`), `X-Robots-Tag` noindex |
| `https://admin-staging.shopapgo.com/admin/` | back office page + `/admin/api/*` + its css/js/logo only (everything else → 404) | `ADMIN_TOKEN` **or** the website Basic login (`ADMIN_ACCEPT_SITE_BASIC="true"`, one prompt only), noindex on every response, `/robots.txt` Disallow |
| planned prod `store.shopapgo.com` / `admin.shopapgo.com` | same split with `ADMIN_HOST = "admin.shopapgo.com"` | commented out in `wrangler.toml`; **not deployed** |

### Separate back-office host (`worker/hosts.js`, `ADMIN_HOST`)

The back office no longer shares the store's domain. With the plain var `ADMIN_HOST` set, the Worker splits by the request `Host`:

- Host = `ADMIN_HOST`: only `/admin`, `/admin/*` (still `ADMIN_TOKEN`, see above), `/robots.txt` and the page's own files (`/css/commerce.css`, `/css/admin.css`,
  `/js/admin.js`, `/js/commerce/shared.js`, `/assets/brand/apgo-logo.png`) are served; any other path (store pages, `/api/*`, webhook, Apple Pay file) is 404. Every response
  carries `X-Robots-Tag: noindex, nofollow`. It is exempt from the staging Basic gate (no double prompt). Login there is either `ADMIN_TOKEN` (Bearer, or Basic with any username and the token as password) or,
  when the plain var `ADMIN_ACCEPT_SITE_BASIC = "true"` (set on staging only) and `SITE_ENV=staging`, the **same Basic user + password as the website**
  (existing secrets `STAGING_BASIC_AUTH_USER` / `STAGING_BASIC_AUTH_PASSWORD`, compared in constant time via SHA-256 digests; nothing new is stored, no password is in any file).
  Empty/missing secrets never match. The site login works **only on the admin host**: the store host and workers.dev still answer 404 for `/admin*`.
  **Production:** `ADMIN_ACCEPT_SITE_BASIC` is deliberately not set, so prod accepts `ADMIN_TOKEN` only; whether prod should also accept a shared site login is the owner's decision
  (it would need a site login to exist on prod, which it does not today).
- Any other host (store domain, workers.dev): `/admin` and `/admin/*` (page and API) answer **404**, even with a valid token.
- `ADMIN_HOST` unset (local `npm run dev`, tests): one host serves both, as before.
- The admin page calls `/admin/api/*` same-origin, so the CSRF guard (`Origin` / `Sec-Fetch-Site` same-origin, JSON content type) is evaluated against the admin
  host; requests carrying the store origin are rejected (403), and writes through the store host are 404.
- "New paid order" notifications link to `https://<ADMIN_HOST>/admin/`.
- Tests: `tests/hosts.test.mjs` (host split, 404s, admin host 401/200, CSRF, `wrangler.toml` routes).

### Go-live checklist for production (none of this has been done)

- [ ] Create the production D1: `npx wrangler d1 create apgo-us-store`, paste the id into `[[env.production.d1_databases]]`, then
      `npx wrangler d1 execute apgo-us-store --env production --remote --file worker/schema.sql`.
- [ ] Bind `store.shopapgo.com`: uncomment the `routes` line in `[env.production]` (zone `shopapgo.com`; the `www` Pages project stays untouched).
- [ ] Production secrets with `--env production`: `AIRWALLEX_CLIENT_ID`, `AIRWALLEX_API_KEY` (production keys), `AIRWALLEX_WEBHOOK_SECRET`, `ADMIN_TOKEN`,
      plus optional notification / email / MCF secrets.
- [ ] Register the Airwallex production webhook `https://store.shopapgo.com/api/webhooks/airwallex` with the success/cancellation and six failed-attempt events listed below.
- [ ] Approve prices / shipping / tax (see "Before switching `AIRWALLEX_ENV` to `prod`"), then set `PRICING_APPROVED = "true"` (until then prod takes no payments).
- [ ] Decide MCF, emails, Apple Pay domain verification for `store.shopapgo.com`.
- [ ] Leave `EXPRESS_CHECKOUT` unset in production until the cart-page express payment flow is built (today it is UI only).
- [ ] `npx wrangler deploy --env production`, then one real low-value order end to end.

## Deploy (Cloudflare): single-environment reference

The commands below are the generic form. Prefer the `--env staging` / `--env production` forms above (secrets and D1 are per environment).

```bash
npx wrangler d1 create apgo-us-store          # paste database_id into wrangler.toml
npm run db:migrate:remote                      # also creates order_notifications, order_fulfillments, order_emails, order_audit, order_mcf
npx wrangler secret put AIRWALLEX_CLIENT_ID
npx wrangler secret put AIRWALLEX_API_KEY
npx wrangler secret put AIRWALLEX_WEBHOOK_SECRET
npx wrangler secret put ADMIN_TOKEN
# optional notification channels (see above)
npx wrangler secret put ORDER_NOTIFY_WEBHOOK_URL
# optional Amazon MCF (see "Amazon MCF"; stays off until MCF_AUTO_SUBMIT=true)
npx wrangler secret put AMAZON_OUTBOUND_BASE_URL
npx wrangler secret put OUTBOUND_INTERNAL_TOKEN
npx wrangler deploy
```

In Airwallex → Developer → Webhooks, subscribe `https://<domain>/api/webhooks/airwallex`
to `payment_intent.succeeded`, `payment_intent.cancelled`, and the six failed-attempt events below, then store its
secret as `AIRWALLEX_WEBHOOK_SECRET`.

### Failed payment attempts

Subscribe to these Payment Attempt events on the same account and destination:

- `payment_attempt.authentication_failed`
- `payment_attempt.authorization_failed`
- `payment_attempt.risk_declined`
- `payment_attempt.failed_to_process`
- `payment_attempt.capture_failed`
- `payment_attempt.expired`

`worker/payment-failures.js` associates the signed event's `payment_intent_id` with an existing order. A provided `merchant_order_id` must match. It stores one row per attempt in `order_payment_failures`: attempt/event identifiers, failure code, provider code, bounded/redacted reason, trace ID and timestamps. It does not retain the raw payload, card details or provider `failure_details.details`. Detailed provider reasons are not always supplied; the admin explicitly shows when no reason is available.

Failed attempts leave the order `pending` so the customer can retry. Success still settles it through the existing validated PaymentIntent path. Historical failures stay visible after payment but never revert a paid order. Repeated deliveries cannot add a second attempt row; older events cannot replace a newer reason. A storage error returns 500 before acknowledging the event so Airwallex can retry.

The authenticated order detail has a **Failed payment attempts** section; the public order API exposes only a predefined customer message while the order is pending. Card and wallet SDK errors also use safe retry guidance. The cart is cleared only after the server confirms that the order is paid, including wallet and redirect flows.

This does not cover failed PaymentIntent creation (the existing safe 502 + orphan-order cancellation handles that), browser/network failures before a payment attempt exists, refunds or disputes. Confirm actual failure-event delivery with a declined sandbox card before production. See the [official Airwallex event list](https://www.airwallex.com/docs/developer-tools/webhooks/listen-for-webhook-events/online-payments) and [PaymentAttempt failure fields](https://www.airwallex.com/docs/api/payments/payment_attempts/retrieve).

Screenshots with synthetic local fixtures can be regenerated using `node scripts/capture-payment-failures.mjs`.

## Before switching `AIRWALLEX_ENV` to `prod`

These are placeholders copied from the design-system kits, not approved terms:

- [ ] Prices in `worker/pricing.js` / `PRICING_JSON` (D204 $29.90, D215 $24.90).
- [ ] Shipping methods and costs (Standard free / Express $9.00) and what shoppers are told about MCF delivery.
- [ ] Amazon MCF: Amazon Fulfillment role on the MCP's SP-API app, outbound connection secrets, confirmed SKU map, a first real test order,
      then `MCF_AUTO_SUBMIT=true` (see "Amazon MCF"; production orders are real shipments).
- [ ] Sales tax: `tax.stateRatesBps` is empty (default rate 0), so every order is taxed $0. Decide
      the nexus/registration position or plug in a tax service.
- [ ] Set `PRICING_APPROVED=true` once the three items above are final (prod is closed without it).
- [ ] Apple Pay / Google Pay: enable both in Airwallex (sandbox, then prod) and verify the
      Apple Pay domain (see "What you must do").
- [ ] Order notification: choose and configure a team channel (webhook URL or
      Resend); add retry for failed notifications (currently logged + recorded
      only).
- [ ] Customer emails: Resend account + verified sender domain, `CUSTOMER_EMAIL_FROM`; decide the
      policy/delivery wording (see "Customer emails"); send one real test order in the sandbox.
- [ ] Back office: decide between the shared `ADMIN_TOKEN` and Cloudflare Access
      for named users. Mark shipped + tracking exists; refund, un-ship/edit and partial
      shipments do not (and who physically fulfils is still undecided).
- [ ] Run `npm run smoke:airwallex` once with real sandbox keys, then a browser
      payment with a registered sandbox webhook (tunnel), incl. a 3DS card.
- [ ] Enable card payments on the production Airwallex account and set the
      statement descriptor.
- [ ] Privacy, Terms, Returns and Contact pages linked from the store footer.
- [ ] Rate limiting on `/api/checkout/session` (Cloudflare WAF rule).
- [ ] Production Airwallex keys, webhook, and a real `database_id`.

## Tests

- `tests/commerce-unit.test.mjs` (node:test): pricing, validation, order ids,
  webhook signatures, order status transitions.
- `tests/commerce-backend.test.mjs` (node:test, Node 22.5+ for `node:sqlite`):
  the real Worker `fetch` handler over an in-memory SQLite D1 stand-in with
  `fetch` stubbed: PaymentIntent payload and idempotency key, failed-create
  cleanup, webhook settle / dedupe / bad signature / late delivery / amount
  mismatch, notify-once across racing polls, admin auth (503/401/Basic/Bearer,
  filters, search, writes limited to the ship endpoint), notification payloads (signed, no PII), Airwallex
  client token cache / 401 refresh / retry rules.
- `tests/v3-cart-entry.spec.mjs` (Playwright): v3 Add to cart in every placement,
  badge and cross-tab sync, Amazon stays as the secondary link, sticky bar,
  overflow at 320/390/1440, axe, no price on the landing page.
- `tests/admin.spec.mjs` (Playwright, `/admin/api/*` stubbed): list, filters,
  search, detail contents, unconfigured notice, overflow, axe.
- `tests/admin-fulfillment.spec.mjs` (Playwright, stubbed API built on the real email templates
  and shipment validation): ship flow, email payload content, optional link, email skipped,
  validation, no double ship, paid-only, shipping filter, 401, overflow at 320/390/1440, axe.
  `npm run capture:admin-fulfillment` writes `review/admin-fulfillment-{form,shipped}-{desktop,mobile}.png`.
- `tests/commerce-backend.test.mjs` also covers fulfilment and customer email: migration re-run,
  confirmation once, skipped/failed sends, ship rules (paid-only, once, concurrent), auth / method /
  CSRF guards, validation, list filter and counts, HTML escaping. `fetch` is stubbed: Resend is never called.
- `tests/commerce-mcf.test.mjs` (node:test) and `tests/admin-mcf.spec.mjs` (Playwright): Amazon MCF (see "Amazon MCF"):
  off by default, missing credentials / SKU map, idempotent submit and races, failure + retry button, lost-reply reconciliation,
  retry rules and error classes, sync → shipped once, cron switch. All against a fake Amazon; the real one is never called.
- `tests/commerce.spec.mjs` (Playwright): cart and full checkout against the
  real catalog/validation modules with `/api/*` and Airwallex.js stubbed;
  decline + retry, empty cart, overflow at 320/390/1440 px, axe.
- `tests/commerce-pricing.test.mjs` (node:test): pricing defaults, `PRICING_JSON`
  overrides and validation, configurable tax, prod gate, no price in front-end code.
- `tests/commerce-wallets.test.mjs` (node:test): Apple/Google Pay detection, Airwallex.js
  element options, `payment_method_options`, flags, Apple domain-file route, wrangler routing.
- `tests/wallets.spec.mjs` (Playwright, feature-detection mocks): no-wallet device shows
  nothing and pays by card; Google/Apple Pay hidden until `ready`, then shown, given the
  session and completing the order; operator off-switch; error/cancel; one order per
  checkout; eager-session fallback; `PRICING_JSON` reaches the page; overflow; axe.
  `npm run capture:wallets` writes the mobile/desktop screenshots to `review/`.
