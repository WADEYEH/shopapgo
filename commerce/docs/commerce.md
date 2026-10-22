# APGO US store: technical reference

The Cloudflare Worker `apgo-us-store` (`commerce/worker/`) serves all of `www.shopapgo.com`: the Next.js static export
(`../out`) as its assets, the store API (`/api/*`), the back office (`admin.shopapgo.com`), the 301s for moved URLs and
hosts, and the cron jobs. Orders are in D1; product photos owners upload are in R2. Every page shoppers see is a page
of the Next.js site (D41); `/v3` and the old plain HTML store pages answer 301.

This file names settings and secrets but never their values.

## Status

Live since the cutover on 2026-10-16: `www.shopapgo.com` and the bare domain are served by this Worker,
`store.shopapgo.com` and `shopapgo.com` answer 301 to the same page on www (`MOVED_HOSTS`; `/api/*` and `/.well-known/*`
are not redirected), and the back office is on `admin.shopapgo.com` behind Cloudflare Access. Checkout is open
(`PRICING_APPROVED` is set), Amazon MCF auto-submit and customer emails are on, and production deploys only from GitHub
with approval (D65).

- Plan, decisions (D…) and open items (C…, §8.1): `docs/commerce-plan.md` at the repository root.
- Operations (deploy, rollback, restore, back-office procedures, after-sales): `docs/ops/runbook.md`.
- Production settings and secret names: `docs/ops/production-config.md`.
- Design specs: `docs/design/modules/`, `docs/design/scenarios.md`, `docs/design/traceability.md`.

### Known limits

- Production Airwallex has no card payments yet (M18): Card, Apple Pay and Google Pay are hidden there
  (`CARD_PAYMENTS_ENABLED = "false"`, D70) until C14. Apple Pay and Google Pay have not been verified on real devices.
- No express checkout on the cart page (see "Apple Pay and Google Pay").
- A manual shipment cannot be edited or undone once saved (a wrong tracking number needs a database fix).
- No after-sales case system yet (C26): returns, reshipments and lost parcels are handled by hand (runbook §27).

## Environments and settings

`wrangler.toml` keeps the top level for local dev (placeholder D1 id) and defines `[env.staging]` and
`[env.production]`. Wrangler does not inherit bindings, vars or assets into `[env.*]`, and secrets are per environment.

| | local dev | `staging` | `production` |
|---|---|---|---|
| Worker | `wrangler dev` | `apgo-us-store-staging` | `apgo-us-store` |
| Hosts | `http://127.0.0.1:8799` | `staging.shopapgo.com` (Basic-auth gate), `admin-staging.shopapgo.com` (Cloudflare Access), `store-staging.shopapgo.com` (plays the old store host: pages 301 to staging) | `www.shopapgo.com` and `shopapgo.com` (whole-host routes; the bare domain 301s to www), `store.shopapgo.com` (301 to www), `admin.shopapgo.com` (Cloudflare Access) |
| D1 | local SQLite | `apgo-us-store-staging` | `apgo-us-store` |
| R2 (`PRODUCT_IMAGES`) | local copy | `apgo-us-store-images-staging` | `apgo-us-store-images` |
| `AIRWALLEX_ENV` | `demo` | `demo` (sandbox; anything but `prod` is sandbox) | `prod` |
| PayPal | sandbox (`.dev.vars`) | sandbox | live |
| `SITE_ENV` | unset | `staging` | unset |
| Amazon MCF | off | fake Amazon (`MCF_FAKE`), real Amazon stock read-only | on (`MCF_AUTO_SUBMIT`, `MCF_SYNC_CRON`) |
| Cron | none | every 2 minutes | every 5 minutes |
| Placement | — | `aws:ap-northeast-3` (next to its D1) | `aws:us-east-1` (next to its D1) |

The Cloudflare Pages project that served www before the cutover stays until after 10/30 (C30); the www DNS record
still points at it, but the Worker routes run in front. Moving www back is a two-step rollback (Worker version plus
routes, `npm run rollback:routes`; runbook §24).

### Secrets (names only)

Set with `npx wrangler secret put <NAME> --env staging|production`; locally in `.dev.vars` (git-ignored; template
`.dev.vars.example`). The full production list is in `docs/ops/production-config.md`; `worker/config-check.js` compares
the live settings with `wrangler.toml` every day and after every deploy and emails the team when they differ (D59).

| Secret | Used for |
| --- | --- |
| `AIRWALLEX_CLIENT_ID`, `AIRWALLEX_API_KEY`, `AIRWALLEX_WEBHOOK_SECRET` | Airwallex API and webhook signature |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`, `PAYPAL_WEBHOOK_ID` | PayPal Orders v2 ([paypal.md](paypal.md)) |
| `PRICING_APPROVED` | `"true"` opens checkout with `AIRWALLEX_ENV=prod` (set as a secret in production) |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | customer and team emails, delivery events |
| `AMAZON_OUTBOUND_BASE_URL`, `OUTBOUND_INTERNAL_TOKEN`, `MCF_SKU_MAP_JSON` | Amazon MCF through amazon-spapi-mcp |
| `META_CAPI_ACCESS_TOKEN` | Meta Conversions API (production) |
| `GA4_API_SECRET` | GA4 refund events (production) |
| `GOOGLE_ADDRESS_VALIDATION_KEY` | address check at checkout |
| `TURNSTILE_SECRET_KEY` | Contact us bot check |
| `ACCESS_LIST_API_TOKEN` | keeps the Cloudflare Access email list equal to the back-office members |
| `HEALTHCHECK_PING_URL` | heartbeat after every cron run |
| `ADMIN_LOGIN_EMAIL`, `ADMIN_LOGIN_PASSWORD`, `ADMIN_TOKEN` | logins used only while `ADMIN_ACCESS` is off; `ADMIN_TOKEN` opens the staging back office for scripts (with an Access service token) |
| `STAGING_BASIC_AUTH_USER`, `STAGING_BASIC_AUTH_PASSWORD` | staging site gate |
| `ORDER_NOTIFY_WEBHOOK_URL`, `ORDER_NOTIFY_WEBHOOK_SECRET` | optional webhook channel for new paid orders |

Plain variables (in `wrangler.toml`) are explained in the section of their feature below: `AIRWALLEX_ENV`, `SITE_ENV`,
`SITE_HOST`, `MOVED_HOSTS`, `ADMIN_HOST`, `ADMIN_ACCESS`, `ACCESS_*`, `ADMIN_OWNER_EMAIL`, `CONFIG_PROFILE`,
`CARD_PAYMENTS_ENABLED`, `AIRWALLEX_PAY_ENABLED`, `APPLE_PAY_ENABLED`, `GOOGLE_PAY_ENABLED`, `PAYMENT_AUTO_CAPTURE`,
`WALLET_MERCHANT_NAME`, `PRICING_JSON`, `CUSTOMER_EMAIL_*`, `ORDER_NOTIFY_EMAIL_*`, `REFUND_ALERT_EMAIL_TO`,
`CONTACT_EMAIL_TO`, `TURNSTILE_SITE_KEY`, `MCF_*`, `META_DATASET_ID`, `GA4_MEASUREMENT_ID`.

The password vault is the source of truth for secret values. Never put them in the repo, chat or tickets; if one
leaks, rotate it (runbook §21).

## How it fits together

```text
/cart, /checkout (Next.js)  ─┐                      ┌─ worker/pricing.js    THE pricing source (prices · shipping · tax, cents)
  components/shop            │                      ├─ worker/catalog.js    quote engine, /api/store/config
  lib/shop                   │                      ├─ worker/checkout.js   input validation · order ids
                             ├─ /api/* ─ worker/index.js ─ worker/checkouts.js  one checkout per shopping trip (D36)
public/admin/ ───────────────┘                      ├─ worker/airwallex.js  token · PaymentIntent · webhook HMAC
                                                    ├─ worker/paypal.js     Orders v2 create · capture · webhook verify
                                                    ├─ worker/orders.js     D1 orders + webhook idempotency
                                                    ├─ worker/order-core.js stages, cooling-off, holds, cancel, address change
                                                    ├─ worker/admin.js      back-office API (auth in admin-identity.js)
                                                    ├─ worker/customer-email.js, notify.js, team-alerts.js   emails
                                                    ├─ worker/mcf.js, amazon-mcf.js   Amazon MCF (via amazon-spapi-mcp)
                                                    └─ worker/cron.js       the scheduled jobs
Airwallex.js split card elements + Drop-in restricted to airwallex_pay; PayPal JS SDK Buttons
```

1. The browser keeps only `{ sku, qty }` in `localStorage` (`apgo_us_cart_v1`). Every price it shows comes from
   `POST /api/cart/quote`.
2. On the payment step, `POST /api/checkout/session` (Card, wallets, Airwallex Pay) or `POST /api/checkout/paypal/order`
   validates contact and address (the same rules and the Google address check), re-prices the cart, opens the checkout
   in D1 as `pending` and creates the payment. A retry, a refresh, a second tab or another payment method reuses the
   same checkout (`checkoutId`, D36); its id becomes the order number. Only the PaymentIntent's `client_secret` or the
   PayPal order id reaches the browser.
3. The shopper chooses one method. Production (D70): **PayPal** (listed first and selected; it also takes cards as a
   guest checkout) and **Airwallex Pay**. Where card payments are enabled (staging), **Card** is selected first and
   Apple Pay / Google Pay sit above the chooser. Card calls `cardNumber.confirm({ intent_id, client_secret })`;
   Airwallex Pay mounts Drop-in on the same PaymentIntent.
4. `payment_intent.succeeded` (webhook), the PayPal capture or `GET /api/orders/:id` (the order page's poll, also
   after 3DS or PayPal redirects) settles the order. A payment whose amount or currency differs from the stored total
   becomes `review`. The first call that moves the checkout out of `pending` (a guarded `UPDATE`) triggers the
   confirmation email, the team notification, Meta Purchase and the Amazon queue, so racing webhook and poll act once.
5. Paid orders wait a one-hour cooling-off period (D23, `ORDER_COOLING_OFF_MINUTES`), then the cron sends them to
   Amazon MCF; the cron also reads shipment status back.

Order stages (`worker/order-core.js`): checkout (`pending`, not an order yet), `review`, paid, fulfilling (with
Amazon), shipped, cancelled. Unpaid checkouts expire after 24 hours and lose their personal data after 30 days.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/store/config` | products (price, `onSale`, `inStock`, live content), shipping methods, tax status, wallet flags, `cards.enabled`, `airwallexPay.enabled`, PayPal `{ enabled, clientId, env }`, the Turnstile site key, ship-to states, `storeReady`, `estimate` |
| `POST /api/cart/quote` | `{ items, state?, method? }` → priced lines and totals |
| `POST /api/checkout/address` | `{ shipping }` → address check before payment (`worker/address-check.js`) |
| `POST /api/checkout/session` | `{ items, contact, shipping, method, checkoutId? }` → `{ orderId, quote, intent }` |
| `POST /api/checkout/paypal/order` | `{ items, contact, shipping?, method?, checkoutId? }` → `{ orderId, quote, paypal, eventIds }` ([paypal.md](paypal.md)) |
| `POST /api/checkout/paypal/capture` | `{ paypalOrderId }` or `{ orderId }` → settle the same order |
| `GET /api/orders/:id` | status, lines, totals, masked email (no address); syncs pending Airwallex / PayPal payments |
| `POST /api/contact` | Contact us form (`worker/contact.js`) |
| `GET /api/health` | 200 while the cron keeps running, 503 once it stopped |
| `POST /api/webhooks/airwallex` | HMAC-verified (`x-timestamp` + raw body), idempotent by event id; a genuine delivery older than 5 minutes is settled from the Retrieve API |
| `POST /api/webhooks/paypal` | PayPal-verified (`PAYPAL_WEBHOOK_ID`), idempotent by event id; captures, refunds, reversals, denials, disputes |
| `POST /api/webhooks/resend` | Svix-signed email delivery events |
| `GET /.well-known/apple-developer-merchantid-domain-association` | Apple Pay domain file (from `public/apple-pay/`; 404 until added) |
| `GET /media/products/*` | product photos uploaded in the back office (R2) |
| `/admin/`, `/admin/api/*` | back office (only on `ADMIN_HOST`; see "Order back office") |

Starting a payment, the address check and quotes are rate-limited per client address (`worker/rate-limit.js`:
10, 20 and 60 a minute): 429 when over.

The cart and checkout are Next.js pages (D41): `app/(us)/(shop)/cart` and `app/(us)/(shop)/checkout` (the order page is
`/checkout?order=<id>`), built in `components/shop/CartPage.js` and `components/shop/checkout/`, on the field rules and
payment helpers in `lib/shop/` (the address rules are the Worker's own, `address-rules.mjs`). Both are `noindex`.
`/cart.html` and `/checkout.html` answer 301 to them with the query string kept, so payment returns registered earlier
still land on the order page.

Adding to the cart from any page: link to `/cart?add=d204`, or call `addToCart()` from `lib/shop/cart.js`.

## Product pages and the overview (`/products`, `/products/atomic-colored-glaze`, `/products/atomic-glaze-coating`)

Next.js pages of the site (D41), built from the Claude Design **product-v2** kit (source and decisions:
[product-pages.md](product-pages.md)), inside the site's own header and footer.

| Address | Source | Notes |
|---|---|---|
| `/products` | `app/(us)/(shop)/products/page.js` | Every product on sale (`components/shop/CatalogCard.js`). A product missing from `/api/store/config` is hidden. |
| `/products/atomic-colored-glaze` | `app/(us)/(shop)/products/[slug]/page.js` | DRY, Atomic Colored Glaze (`components/shop/ProductPage.js`). |
| `/products/atomic-glaze-coating` | same | WET, Atomic Glaze Coating. |

Old addresses answer 301 with the query string kept (`worker/redirects.js`): `/products/d204` and `/products/d215`
(also `.html` or a trailing slash) to the named pages (D39), and `/product` (also `.html`) to `/products`.

* **Data:** names, routines, copy, URLs and SEO in `lib/shop/product-data.mjs`, read through `lib/shop/catalog.js`.
  The Worker reads the same file. Owners change the price, name, texts and photos in the back office (D52,
  `worker/product-content.js`); the Worker writes the live content into the page HTML as it serves it
  (`worker/site-content.js`). Images and videos are the site's files in `public/us/assets/`; the old `/assets/*` URLs
  answer 301 there.
* **Styles:** `app/(us)/(shop)/shop.css`, the store styles scoped under `.shop`, so they never reach the brand pages.
* **Prices come only from `/api/store/config`** (`worker/pricing.js` plus the back-office price, read by
  `lib/shop/store-config.js`): the buy box, the sticky bar, the compare table, the overview and the analytics `value`.
  The exported HTML has no price. If the config cannot be loaded the price reads "—" and the cart still works.
* **Stock** (C4): the Worker reads Amazon's sellable quantity every 15 minutes (`worker/inventory.js`); under 5 the
  product shows Out of stock and cannot be bought. An owner can also stop selling a product. Paid orders are not
  affected (runbook §26).
* **Add to cart** (`lib/shop/cart.js`) keeps the old store pages' localStorage key and rules; the cart and checkout pages
  see the same cart, and the header count follows it live. Ticking the pair upsell also adds the other product
  (quantity 1), priced as the sum of the two config prices; no discount is invented. `add_to_cart` events
  (`apgo:analytics` / `dataLayer`) carry `sku`, `quantity`, `placement` (`pdp-buybox` / `pdp-sticky` / `pdp-quiz` /
  `pdp-compare` on the product pages, `shop` on the overview), `pair`, `currency`, `value` and `items[]`. `view_item`
  fires once per product page view.
* **The other routine is its own page:** the DRY / WET switch, the quiz result and the compare table link to it.
* **Reviews and photos are never invented.** `lib/shop/product-reviews.mjs` ships empty. The rating line and the
  reviews section appear only for a product with at least 3 *verified* reviews (FTC 16 CFR Part 465,
  `lib/shop/reviews.js`). Before/after appears only with a real photo pair.
* **SEO:** indexable (D71) and in the sitemap (37 pages in all). Per-page title, description, canonical and og tags
  (absolute www URLs) and a Product JSON-LD (`lib/shop/product-content.mjs`) whose `offers` carry the price,
  availability, shipping details ($7.99, 3–5 business days in transit, no AK/HI) and the return policy (30 days, by mail,
  `returnFees` = customer pays). `offers` appear only while `/api/store/config` says `estimate: false` (pricing
  approved). Staging sends `X-Robots-Tag: noindex`.
* **Meta Pixel:** the site's root layout loads `/js/meta-pixel.js` on every page ([meta-tracking.md](meta-tracking.md)).
* **Entry points:** Shop in the site header and footer, the product buttons on the home page and the guides, and the
  product name in cart lines and the checkout summary (new tab there, so a shopper mid-checkout keeps the form).
* Tests: `tests/product-pages.test.mjs` (static contract), `tests/product-pages.spec.mjs` (Playwright on the built
  site: both products and the overview, add to cart and analytics, pair, sticky bar, config prices, hide rules,
  JSON-LD, 390 / 1440 overflow, axe, 44 px targets, keyboard) and the site's `tests/us-store.test.cjs`.

## Policy pages and Contact us (`/privacy`, `/terms`, `/returns`, `/shipping`, `/contact`)

Next.js pages of the site (D41), in its own header and footer; indexable (D71).

* **Policy pages** show `docs/legal/*.md` exactly as written (`components/shop/PolicyPage.js`, read at build time by
  `lib/shop/markdown.js`, which knows headings, paragraphs, lists, tables, bold, italic and links). The texts are final,
  effective October 16, 2026, seller WEI SYUAN TECHNOLOGY CO., LTD.; the text's own first line ("*Effective date: …*")
  shows under the title. Edit the file and deploy to change a page. A bracketed note that is not a link would show as
  `[TO CONFIRM: …]`; there are none now. `tests/policy-pages.test.mjs` checks that the texts agree with the store's
  rules (shipping cost and time, where we ship, the returns window).
* **Contact us** (D28): the support details (`lib/us/company.js`) and a form (`components/shop/ContactForm.js`) with
  name, email and message. `POST /api/contact` (`worker/contact.js`) checks the same rules
  (`lib/shop/contact-rules.mjs`), saves the message in D1 (`contact_messages`), then emails it to `CONTACT_EMAIL_TO`
  through Resend (same sender as the order emails) with the shopper as Reply-To. Saved even when the email cannot go
  out; the back office lists every message under "Customer messages". Abuse limits (M12-06): a field only robots fill,
  5 messages an hour per address (a salted hash that changes daily, never the address), 60 an hour overall, and
  Cloudflare Turnstile (`TURNSTILE_SITE_KEY` var, `TURNSTILE_SECRET_KEY` secret; set in both environments). Staging
  sends only to the approved test recipient.

## Prices, shipping and tax: one source (`worker/pricing.js`)

Every number that changes what a shopper pays lives in **`worker/pricing.js`** (`DEFAULT_PRICING`): product prices,
shipping methods and fees, the default shipping method, the per-line quantity cap (10), currency and the tax settings.
Owners change a product's price in the back office (D52); that price replaces the default for new quotes (paid orders
keep theirs).

| Setting | Value |
| --- | --- |
| D204 Atomic Colored Glaze | $59.99 |
| D215 Atomic Glaze Coating | $29.99 |
| Shipping | `standard` only: $7.99 per order, "Most orders arrive in 3–5 business days" (D31); Amazon MCF Standard |
| Sales tax | $0 everywhere (D68: no sales tax collected at launch, reviewed every quarter, C13); `tax.status` reads `undecided` while every rate is 0 |
| Capture | immediately (`PAYMENT_AUTO_CAPTURE`, default `true`) |

- The quote engine (`worker/catalog.js`), `/api/cart/quote`, `/api/checkout/session`, the PayPal order and
  `/api/store/config` all read it through `resolvePricing(env)` and the live product prices.
- The browser holds no price at all. Cart, checkout, summary and the wallet buttons render what the Worker returned.
  `tests/commerce-pricing.test.mjs` fails if a price or tax rate appears in `lib/shop/` or `components/shop/`, or a
  literal price in `catalog.js` / `index.js`.

**Change a number without editing code**: set the optional, non-secret Worker variable `PRICING_JSON` (a *partial*
override of `DEFAULT_PRICING`):

```jsonc
// wrangler.toml [vars]  (or `npx wrangler secret put PRICING_JSON`, or .dev.vars locally)
PRICING_JSON = '{"products":{"d204":{"priceCents":3490}},"tax":{"defaultRateBps":0,"stateRatesBps":{},"shippingTaxable":false}}'
```

Rules: money is integer cents; tax rates are basis points (725 = 7.25%); `shippingMethods`, when given, replaces the
whole list. The value is validated (integers, known SKUs/states, sane ranges, USD only). **An invalid value is refused,
never silently replaced**: `/api/cart/quote` and `/api/checkout/session` answer `503 store_not_ready` and log
`pricing_config_invalid`. If a state rate is ever added, `tax.status` becomes `configured` and a PayPal order then
needs the shipping address up front.

**Production gate.** With `AIRWALLEX_ENV=prod` the store answers `503 store_not_ready` for checkout (cards and PayPal)
unless `PRICING_APPROVED=true`. It is set in production (as a secret), and `worker/config-check.js` checks every day
that it still is (C23). The sandbox (`demo`) is never blocked.

**Estimate / `[TO CONFIRM]` markers.** While `PRICING_APPROVED` is not `"true"`, `/api/store/config` returns
`pricingApproved: false` and `estimate: true`, and the cart and checkout show a yellow `[TO CONFIRM]` marker next to
shipping, delivery wording and tax. Staging and local dev show them; production does not.

## Apple Pay and Google Pay (Airwallex-native)

Hidden in production until Airwallex enables cards (`CARD_PAYMENTS_ENABLED = "false"`, D70, C14); shown on staging.

**Approach.** Airwallex.js ships dedicated elements: `createElement("applePayButton", …)` and
`createElement("googlePayButton", …)`. They take the PaymentIntent's `intent_id` + `client_secret`, `countryCode`, and
`amount: { value, currency }` (value = the intent's major-unit amount, as a string), open the wallet sheet themselves
and confirm the intent when the shopper authorises. There is **no separate `confirm()`** and no card data reaches us.
Google Pay also gets `origin` and `merchantInfo.merchantName`. Airwallex handles Apple's and Google's gateway
registration (web only); we do not need our own Apple Merchant ID, certificates or a Google merchant id.

**Where it appears.** On the checkout **Payment** step, above the payment-method chooser, with an "Or pay another way"
divider. The checkout and PaymentIntent are the same ones the card form and Airwallex Pay use, so trying a wallet and
then paying another way does not create a second order.

**Hidden unless it can really work** (`lib/shop/wallets.mjs`):

1. The operator allows it: `APPLE_PAY_ENABLED` / `GOOGLE_PAY_ENABLED` (default on; `"false"` hides one), and
   `CARD_PAYMENTS_ENABLED` is not `"false"` (Airwallex charges wallets as cards).
2. Cheap device pre-check: Apple Pay needs `ApplePaySession.canMakePayments()` (Safari / iOS / macOS with a wallet);
   Google Pay needs a secure context.
3. The button sits in a collapsed, non-focusable slot and is revealed only when Airwallex fires the element's `ready`
   event. No `ready` within 10 s, an SDK failure, or an element error leaves it hidden.

Wallet `error` shows "The wallet payment didn't go through…" and rebuilds the PaymentIntent; `cancel` just clears
messages.

**PaymentIntent `payment_method_options`.** `/api/checkout/session` sends
`payment_method_options: { card: { auto_capture } }` (default `true`); the same flag goes to both wallet elements as
`autoCapture`. `PAYMENT_AUTO_CAPTURE=false` switches both to "authorise only" (you must then capture from the
Airwallex app/API). Other optional settings: `WALLET_MERCHANT_NAME` (label on the wallet sheet, default `APGO`) and
`WALLET_EAGER_SESSION=true` (create the order/PaymentIntent before probing; only if a wallet refuses to report `ready`
without an intent).

**No cart-page express checkout.** A real express flow needs the address from the wallet sheet and shipping/tax
recomputed in the sheet, a separate server flow; the unfinished cart-page block was removed with the Next.js cart (D41).

### Turning them on (Airwallex web app, sandbox first, then production)

1. **Payments → Settings → Apple Pay → Enable** and **Google Pay → Enable** (accept the terms shown).
2. **Apple Pay domain** (Apple Pay only): **Add domain** with the exact host (`www.shopapgo.com` for production, not
   registered yet; it is registered with C14), download the domain verification file, save it as
   `public/apple-pay/apple-developer-merchantid-domain-association` (no extension; a public token, safe to commit),
   deploy, check that `https://<domain>/.well-known/apple-developer-merchantid-domain-association` downloads it (200,
   `application/octet-stream`; the Worker serves it because Wrangler does not upload dot-folders), then press **Verify**.
3. Test on real devices: Safari with a card in Wallet, Chrome signed in with a card, both on HTTPS. Headless CI and
   `http://localhost` cannot; the automated tests mock feature detection.

Until then the buttons never become `ready` and stay hidden.

## Airwallex Pay

The production Airwallex account has **Airwallex Pay** enabled; Visa/Mastercard cards return
`card_brand_not_supported` there (M18), so Airwallex Pay is the working Airwallex method in production.

**How it is mounted.** There is no dedicated `createElement('airwallexPay')` type. The payment step mounts Drop-in
restricted to that one method (`lib/shop/airwallex-pay.mjs`):

```js
createElement('dropIn', {
  intent_id,
  client_secret,
  currency,              // from the PaymentIntent
  country_code: 'US',
  methods: ['airwallex_pay'],
  alwaysShowMethodLabel: true,
  shopper_email,         // checkout contact
  shopper_name,          // shipping first + last
})
```

The Drop-in iframe has its own confirm button. On `success` the page uses the same confirmation poll as card / wallets
(`GET /api/orders/:id` plus the Airwallex webhook). The PaymentIntent needs no extra fields.

**Choose-one UX.** The methods are radios; selecting one hides the others. With cards disabled the order is PayPal,
Airwallex Pay (PayPal selected); with cards enabled it is Airwallex Pay, Card, PayPal (Card selected).

**Operator flags.** `AIRWALLEX_PAY_ENABLED=false` hides Airwallex Pay (default on). `CARD_PAYMENTS_ENABLED=false` hides
Card, Apple Pay and Google Pay. `GET /api/store/config` reports `cards: { enabled }` and `airwallexPay: { enabled }`.

Code: `lib/shop/airwallex-pay.mjs`, wiring in `components/shop/checkout/CheckoutPage.js`. Tests:
`tests/airwallex-pay.test.mjs`.

## PayPal

PayPal Orders v2 is a payment path on the same checkouts and orders tables: [paypal.md](paypal.md) has the endpoints,
address rules, PENDING captures (D72), declined cards (C20), Meta `event_id`s and the webhook events.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars    # fill in Airwallex / PayPal SANDBOX credentials (+ ADMIN_TOKEN)
npm run db:migrate:local           # re-run after pulling: applies the new numbered files in migrations/ only
npm run build:site                 # the site the Worker serves: the Next.js export in ../out, test settings
npm run dev                        # http://127.0.0.1:8799/  ·  /cart?add=d204  ·  /admin/
```

Without `ADMIN_HOST` (local dev, tests) one host serves both the store and `/admin/`.

Airwallex sandbox test cards: `4035 5010 0000 0008` (success), any future expiry, any CVC. 3DS challenge:
`4012 0003 0000 0088` (OTP `1234`). Risk decline: `4646 4646 4646 4644` (any amount). Elements authentication failure:
`4012 0003 0000 0013`.

Webhooks cannot reach `localhost`; locally the order page settles the order through the retrieve fallback. To exercise
the webhook path, expose the dev server (e.g. `cloudflared tunnel --url http://127.0.0.1:8799`) and register
`<tunnel>/api/webhooks/airwallex` in the sandbox web app.

### Airwallex sandbox smoke tests

```bash
npm run smoke:airwallex                       # API flow, success card
npm run smoke:airwallex -- --card declined    # decline path
npm run smoke:airwallex -- --base http://127.0.0.1:8799   # reuse a running `npm run dev`
npm run smoke:airwallex:browser               # browser flow through the Airwallex.js iframes (-- --card declined, -- --headed)
```

The API smoke starts `wrangler dev` with a local D1, logs in to the sandbox, creates a real PaymentIntent through
`POST /api/checkout/session`, confirms it with the success card server-side, polls `GET /api/orders/:id` until `paid`,
posts a locally signed `payment_intent.succeeded` when `AIRWALLEX_WEBHOOK_SECRET` is set, and checks the back office
when `ADMIN_TOKEN` is set. It prints only set/EMPTY per variable, refuses `AIRWALLEX_ENV=prod`, and exits `0` pass ·
`1` fail · `2` blocked. Some Airwallex accounts restrict server-side card confirmation; the browser flow is then the
authoritative test, and 3DS cards can only be completed in a browser. Screenshots go to `review/`.

The browser smoke also runs against staging (`--base https://staging.shopapgo.com --credentials <file>`, a git-ignored
KEY=VALUE file with the staging Basic login and `ADMIN_TOKEN`); its back-office check cannot pass Cloudflare Access on
`admin-staging`, so check the order there in a browser.

## Order back office (`/admin/`)

Served **only on its own hostname** (`ADMIN_HOST`: `admin.shopapgo.com`, staging `admin-staging.shopapgo.com`); every
other host answers 404 for `/admin*`, even with valid credentials. The page is `public/admin/` (Traditional Chinese,
zh-TW, with an English switch), its API `/admin/api/*` (`worker/admin.js`).

**What it does**

- Home: today's and this month's revenue, what needs attention (the same list as the daily digest), shipping progress,
  latest orders, connection status, products.
- Orders: views (all, to ship, review, problems, disputes, shipped, cancelled), search by order number, name, email,
  phone; the order page shows progress, items, payment and refunds, disputes, Amazon fulfilment, manual shipment,
  timeline with internal notes, customer, address and pre-shipping checks.
- Order actions (each needs a reason, recorded in the order history and the activity log): confirm a `review` order;
  cancel (an order already with Amazon is cancelled only after Amazon reads back Cancelled, C19); change the address in
  the one-hour cooling-off window; **Cancel at Amazon** (stop only the Amazon order); **Retry send to Amazon**;
  **Cancel and refund** for an Amazon stock-out; refund in full or in part (owners only, D51, D55; not while a dispute
  is open); mark shipped by hand; resend a customer email.
- Disputes with deadlines and a printable evidence export (`worker/evidence.js`).
- Customers (by email; orders, addresses, messages, notes) with privacy export and delete (D53) and privacy requests
  with a 45-day deadline.
- Reports for any period and CSV exports (orders; payments and refunds with provider fee, net received and provider
  reference, C20).
- Products: price, name, texts and photos with versions and restore (owners, D52), stop / resume selling, Amazon stock
  every 15 minutes (C4) with "refresh now".
- Unfinished checkouts (D36) and a read-only payment lookup by Airwallex PaymentIntent or PayPal order id.
- Customer messages (Contact us), the site-wide activity log, and Members (owners only).

**Sign-in** (`worker/admin-identity.js`). With `ADMIN_ACCESS = "true"` (production since 10/18, staging since 10/15)
Cloudflare Access signs people in (Google or an email code, 24-hour session) and sends a signed token; the Worker checks
it (team public keys, `ACCESS_AUD`, issuer, expiry) and looks the email up in `admin_members` on **every** request, so a
removed member is out at the next click. Owners manage members on the Members page; the list is copied to the Zero
Trust email list behind the Access policy (`worker/access-list.js`, `ACCESS_LIST_ID`, `ACCESS_LIST_API_TOKEN`). Roles:
owners can do everything including members, refunds, product content and stop selling; members do the daily work. The
first owner is `ADMIN_OWNER_EMAIL`. Every action is recorded under the person's email.

In production there is no service token: scripts cannot reach the back office, and `ADMIN_LOGIN_*` / `ADMIN_TOKEN` stay
set but do not open `/admin`. On staging, `ADMIN_TOKEN` (member role) still works for scripts that also send an Access
service token. With `ADMIN_ACCESS` off (local dev, tests) the older logins apply (`worker/admin-auth.js`, constant-time
compares): HTTP Basic `ADMIN_LOGIN_EMAIL` / `ADMIN_LOGIN_PASSWORD`, or `ADMIN_TOKEN` (≥ 16 characters) as Bearer or Basic
password, or on staging with `ADMIN_ACCEPT_SITE_BASIC="true"` the site's Basic login; with none configured `/admin/`
answers 503 `admin_not_configured`.

**Protection.** All responses send `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store`. Writes are `POST`
only, need `Content-Type: application/json` and, when the browser sends `Origin` / `Sec-Fetch-Site`, must be
same-origin (else 403). `run_worker_first` routes every path through the Worker, so static files cannot be fetched
around the gate. The back office shows customer addresses and emails: keep credentials out of chat, tickets and the
repo.

### Separate back-office host (`worker/hosts.js`, `ADMIN_HOST`)

- Host = `ADMIN_HOST`: only `/admin`, `/admin/*` (the page's own files too), `/robots.txt` and the site logo
  (`/us/assets/brand/apgo-logo.png`) are served, and `/` redirects to `/admin/`; any other path (store pages, `/api/*`,
  webhooks, Apple Pay file) is 404. Every response carries `X-Robots-Tag: noindex, nofollow`. It is exempt from the
  staging Basic gate.
- Any other host: `/admin` and `/admin/*` answer **404**.
- The admin page calls `/admin/api/*` same-origin, so the CSRF guard is evaluated against the admin host; requests
  carrying the store origin are rejected (403).
- Team emails link to `https://<ADMIN_HOST>/admin/`.
- Tests: `tests/hosts.test.mjs` (host split, 404s, CSRF, `wrangler.toml` routes), `tests/admin-auth.test.mjs`,
  `tests/admin-members.test.mjs`.

### Moved hosts (`worker/redirects.js`, `SITE_HOST`, `MOVED_HOSTS`)

On a host listed in `MOVED_HOSTS` (production `store.shopapgo.com,shopapgo.com`; staging `store-staging.shopapgo.com`),
page requests (GET, HEAD) answer 301 to the same path on `SITE_HOST`, with old product URLs resolved in one hop and
the query string kept. `/api/*` and `/.well-known/*` are answered there, not redirected.

## Team notifications

- **New paid order** (`worker/notify.js`): sent once per order when it first becomes `paid` (an `order_notifications`
  row is claimed first, so races cannot double-send), in `ctx.waitUntil`. Channels, each opt-in: Resend email
  (`RESEND_API_KEY` + `ORDER_NOTIFY_EMAIL_TO` + `ORDER_NOTIFY_EMAIL_FROM`; on in production) and a webhook
  (`ORDER_NOTIFY_WEBHOOK_URL`, https, JSON `{ event: "order.paid", text, order }`, optional HMAC with
  `ORDER_NOTIFY_WEBHOOK_SECRET`: `X-APGO-Timestamp`, `X-APGO-Signature: sha256=hex(HMAC-SHA256(secret, timestamp + "." +
  body))`). Content: order id, total, items, destination state, shipping method, back-office link; **no customer
  email, street address or card data**. A failure is logged and recorded per channel; it never changes the order.
- **Team alerts** (`worker/team-alerts.js`): things someone has to look at (review orders, holds, refused state
  changes, failed Amazon sends, stock-outs, Amazon copy mismatches, missing tracking after 2 business days, disputes,
  failed refunds, PayPal reversals and denials, PayPal PENDING captures, reconciliation findings, signature failures,
  unverified addresses). Each alert is sent once (key claimed in `team_alerts`). Recipients: active back-office people
  who chose to get them (owners by default). A **daily digest** lists what is still open (runbook §16).

## Fulfilment (mark as shipped)

Payment status and fulfilment status are separate. `orders.status` is `pending | paid | review | cancelled` (an unpaid
checkout can also be `expired`); fulfilment is **`unfulfilled`** (no record) or **`shipped`** and lives in `order_fulfillments`. Normally Amazon MCF
ships and the status sync marks the order shipped; the manual form is for anything shipped another way.

- **Manual:** open a paid order → carrier (required), tracking number (required), tracking link (optional, `https://`
  only) → **Mark as shipped** (`POST /admin/api/orders/:id/ship`). Only `paid` orders (409 `not_paid`); one shipment
  record per order (409 `already_shipped`; the primary key makes two simultaneous clicks ship once and send one
  email); carrier ≤ 60 and tracking number ≤ 80 characters, no control characters; the link must be an `https` URL
  without credentials.
- **Packages:** Amazon shipments with several boxes keep every tracking number in `order_packages`; the shipment email
  lists them all, and each package's carrier status is read daily until delivered or 30 days old.
- **Audit:** every shipment writes `order_audit` (`order.shipped`, actor, carrier, tracking, time; append-only).

D1 changes are numbered files in `migrations/` that wrangler applies once each, before the deploy (D45: additive only;
`docs/ops/runbook.md` §7). A rollback to an older Worker works on the newer schema.

## Customer emails

Sent through Resend from `APGO <orders@shopapgo.com>` (reply-to `services@apgo.com.tw`; SPF, DKIM, DMARC pass) by
`worker/customer-email.js`, each kind once per order:

| Email | When | Content |
| --- | --- | --- |
| Order confirmation | the order first becomes `paid` | order number, items, subtotal / shipping / tax / total, shipping address, payment method, delivery estimate ("Most orders arrive within 3–5 business days.", the shipping policy's, only once pricing is approved), link to the order page, support email |
| Shipment | a tracking number arrives (Amazon sync or manual) | the above plus carrier, tracking number(s) and the carrier's tracking link |
| Refund accepted / refund failed | the payment provider reports it | amount and reference; no arrival-date promise |
| Stock-out delay | Amazon first reports a stock-out | the order is delayed; cancelled and refunded in full if not shipped within 3 days |
| Cancellation, address change, duplicate payment refunded | after those events | the facts of the change |

- **Durable delivery:** `order_email_delivery` stores a frozen payload, a stable Resend idempotency key, the provider
  message ID, attempt count, due time and an atomic lease. Retries reuse exactly the same payload and key. `review`,
  unpaid and cancelled orders get no order email. `sent` means API acceptance, **not proven delivery**; the back office
  shows the delivery state.
- **Safe by default:** with no `RESEND_API_KEY` or sender, an email is **skipped and recorded**.
  `CUSTOMER_EMAIL_ENABLED=false` turns customer email off. Staging additionally requires exact
  `CUSTOMER_EMAIL_TEST_RECIPIENTS` and adds `CUSTOMER_EMAIL_POLICY_NOTE` (a test note); neither may be set in
  production (the config check says so).
- **Never affects the order:** HTTP failures, missing response IDs and 10-second timeouts are recorded without raw
  responses, recipients or keys. With `CUSTOMER_EMAIL_RETRY_CRON=true` the cron retries network/5xx/429 errors with
  Retry-After and exponential backoff, six attempts at most; after 23 hours a missing-ID send stops for review before
  Resend's 24-hour idempotency key expires. Permanent 4xx errors need repair and an explicit retry from the order page.
  Accepted messages, bounces, complaints and expired ambiguous records are never sent again.
- **Delivery events:** `POST /api/webhooks/resend` verifies the Svix HMAC with a five-minute tolerance, dedupes by
  `svix-id` and reconciles out-of-order events (accepted, delivered, delayed, bounced, complained, suppressed,
  failed). Bounce, complaint and suppression stop future customer sends to that recipient.
- **Transactions:** the guarded pending-to-paid update and its email instruction (`order_email_jobs`) commit together;
  shipments and refunds create their instructions (`order_message_jobs`) atomically too. `waitUntil` processes them at
  once and the cron recovers anything interrupted. All customer-supplied text is HTML-escaped.
- `node scripts/preview-order-emails.mjs` renders the confirmation and shipment emails with fake data into
  `review/tmp/order-emails/` (never sends).

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | secret, shared with the team emails |
| `CUSTOMER_EMAIL_FROM` | sender; falls back to `ORDER_NOTIFY_EMAIL_FROM` |
| `CUSTOMER_EMAIL_REPLY_TO` | reply-to |
| `CUSTOMER_EMAIL_ENABLED` | `false` disables customer emails |
| `CUSTOMER_EMAIL_RETRY_CRON` | `true` lets the cron recover instructions and retry due outbox rows |
| `CUSTOMER_EMAIL_POLICY_NOTE` | optional paragraph appended to every customer message (staging test note only) |
| `CUSTOMER_EMAIL_TEST_RECIPIENTS` | required staging allowlist, exact comma-separated emails |
| `RESEND_WEBHOOK_SECRET` | secret for the Resend delivery-event subscription |
| `REFUND_ALERT_EMAIL_TO`, `REFUND_ALERT_EMAIL_ENABLED` | staff alert for a failed refund |

## Amazon MCF (Multi-Channel Fulfillment from FBA stock)

All stock sits in Amazon FBA, so orders are fulfilled by **Amazon MCF**. **This Worker holds no Amazon credentials.**
`worker/amazon-mcf.js` calls the internal *outbound* endpoints of the **amazon-spapi-mcp** Worker
(`https://amazon-mcp.apgo.tw`, source in `amazon-spapi-mcp/`, see its README), which keeps the Login-with-Amazon
credentials and talks to SP-API Fulfillment Outbound. In production it is on (`MCF_AUTO_SUBMIT`, `MCF_SYNC_CRON`,
switched on after the Hold test order passed at the cutover); staging talks to a fake Amazon (`MCF_FAKE`,
`worker/fake-amazon.js`, runbook §10). The code default is off.

### The outbound endpoints

Auth: `Authorization: Bearer <OUTBOUND_INTERNAL_TOKEN>` (missing/wrong → 401). Base URL: `AMAZON_OUTBOUND_BASE_URL`
(must be `https://`). All JSON; top level snake_case, nested `address` / `destination_address` / `items[]` camelCase;
replies are the raw SP-API JSON (Fulfillment Outbound **v2020-07-01** shapes); errors `{ error, spapiStatus, details }`,
validation failures 400 with `issues`.

| Endpoint | Client function | Notes |
| --- | --- | --- |
| `POST /internal/outbound/preview` | `getFulfillmentPreview` | read-only: fee + arrival window per speed |
| `POST /internal/outbound/orders` | `createFulfillmentOrder` | **REAL order** (ships, uses FBA stock). `seller_fulfillment_order_id` (≤ 40 chars) is the idempotency key: a known id answers `alreadyExists` and is **never re-created** |
| `GET /internal/outbound/orders/:id` | `getFulfillmentOrder` | status, shipments, carrier, tracking; 404 → `null` |
| `GET /internal/outbound/orders?query_start_date=&next_token=` | `listFulfillmentOrders` | pages can be empty yet carry `nextToken`; the client follows them (max 20 pages) |
| `POST /internal/outbound/orders/:id/cancel` | `cancelFulfillmentOrder` | no body |
| `GET /internal/outbound/tracking/:packageNumber` | `getPackageTracking` | numeric, from `fulfillmentShipmentPackage[].packageNumber` |
| `GET /internal/outbound/inventory?skus=` | stock (`worker/inventory.js`) | read-only: sellable, inbound, reserved |

`GET /admin/api/mcf/check` (the back office's **Check Amazon connection**) is a read-only test: it lists MCF orders and
previews one unit of each SKU to a sample address. The **Hold test order** (owners) creates a Hold order at Amazon,
reads it back and cancels it (runbook §15).

### Behaviour

```text
payment succeeds (the guarded "pending → paid" UPDATE)
   └─ MCF_AUTO_SUBMIT on at payment time? → queued (mcf_submission_queue), cooling-off ORDER_COOLING_OFF_MINUTES (60)
cron mcf_submit, after the cooling-off, nothing holding the order (review, refund, dispute)
   └─ claim order_mcf row → POST /internal/outbound/orders (seller_fulfillment_order_id = our order id) → "submitted"
        → read Amazon's copy back and compare items, quantities and address (mismatch → team alert)
        failure → row "failed" + error (payment untouched) → back office "Retry send to Amazon"
cron mcf_sync (or the back-office buttons) → GET /internal/outbound/orders/:id
   COMPLETE / COMPLETE_PARTIALLED + tracking → markShipped() (actor "mcf") → shipment email
```

* **Settings:** `MCF_AUTO_SUBMIT=true` **and** `AMAZON_OUTBOUND_BASE_URL`, `OUTBOUND_INTERNAL_TOKEN` **and**
  `MCF_SKU_MAP_JSON` (`{"D204":"<seller SKU>","D215":"<seller SKU>"}`; every line must be mapped). Anything missing →
  "on but not ready" with the reason (names only). Orders paid while auto-submit was off are never sent automatically.
* **Ship speed:** `standard` → `STANDARD` (override `MCF_SHIPPING_MAP_JSON`, not set).
* **Recipient** = the order address (plus `phone` when the address has one). `displayable_order_id` = our order id.
  `notification_emails` is **not sent** unless `MCF_NOTIFY_AMAZON_EMAIL=true` (not set), so the only shipping email
  the shopper gets is ours. No declared value, no packing-slip text; Amazon's default MCF packaging applies.
* **Cancel:** an order with Amazon is cancelled only after Amazon reads back `Cancelled` (C19); until then it stays as
  it is and the back office says Amazon has not confirmed yet.
* **Stock-out:** a stock-out reported by Amazon, at create or later, follows the stock-out steps: delay email to the
  customer, team alert, a daily retry, a reminder on day 3, and **Cancel and refund** when the owner decides (runbook
  §15).
* **Table** `order_mcf` (one row per order): `status` (`submitting | submitted | shipped | failed | rejected`), Amazon's
  `mcf_status`, `attempts`, `service_tier`, `error_kind` / `error_message` (short, no credentials), `note`, carrier /
  tracking, `submitted_at`, `last_synced_at`. No row = never sent.

### No duplicate shipments

1. **One automatic submission per order:** the `order_mcf` primary key is claimed before anything is sent; webhook
   redeliveries, the order-page poll and racing clicks lose the claim (`duplicate`) without calling Amazon.
2. **`seller_fulfillment_order_id` = our order id** (`APGO-US-` + 12 chars = 20 ≤ 40). A known id answers
   `alreadyExists` and is never created twice; the Worker adopts that order.
3. **Retries only reuse that id.** Network errors, timeouts, 429 and 5xx are retried up to 3 times (0.5 s, 1 s backoff,
   10 s timeout) with the *same* body. A timeout is ambiguous, so before recording a failure, and before any manual
   retry, the Worker asks `GET …/orders/:id`; if Amazon has it, the row is adopted as `submitted`.
4. **A new id only when Amazon itself closed the old order** (`CANCELLED` / `UNFULFILLABLE` / `INVALID` → `rejected`):
   the retry sends `<order id>-R2`, `-R3`…
5. A 400 (bad address, unmapped SKU, no stock) is final: stored with Amazon's `details`, fixed, then retried with the
   button.

Error classes (`McfError.kind`): `config` (missing settings / invalid input / gateway 503, nothing sent) · `auth`
(**401 = wrong `OUTBOUND_INTERNAL_TOKEN`**; Amazon `spapiStatus` 401/403 = the SP-API app lacks the Amazon Fulfillment
role) · `rate_limited` (429, retried) · `transient` (network/timeout/5xx, retried) · `invalid` (400 incl. `issues`,
409/413/415) · `not_found` · `unexpected`.

### Status sync → "shipped" (idempotent, one email)

* Trigger: the cron (`MCF_SYNC_CRON=true`) or the back-office **Sync** buttons; bounded to 25 orders per run.
* `COMPLETE` (or `COMPLETE_PARTIALLED`) with at least one tracking number (from the order, else the per-package tracking
  endpoint) → `markShipped()` (actor `mcf`, one-time insert) → the shipment email (claimed once). Carrier = Amazon's
  carrier code (`AMZL` → "Amazon Logistics", `UPS`, `USPS`, `FEDEX`…).
* Already shipped by hand, or by a racing sync → no second record, no second email.
* `COMPLETE` without tracking yet → waits; the next sync picks it up. No tracking 2 business days after sending → team
  alert.
* `UNFULFILLABLE` / `CANCELLED` / `INVALID` → `rejected`, error shown, retry offered; the order stays unshipped.
* A failed poll only writes a note; it never turns a submitted order into a failure.
* Amazon shipping an order that is cancelled or refunded is recorded and the team is alerted (runbook §15).

| Variable | Kind | Purpose |
| --- | --- | --- |
| `AMAZON_OUTBOUND_BASE_URL` | secret | `https://amazon-mcp.apgo.tw` (https only) |
| `OUTBOUND_INTERNAL_TOKEN` | secret | bearer for the outbound endpoints (the gateway holds the same value) |
| `MCF_SKU_MAP_JSON` | secret | our SKU → Amazon seller SKU |
| `MCF_AUTO_SUBMIT` | var | `"true"` queues paid orders for Amazon |
| `MCF_SYNC_CRON` | var | `"true"` lets the cron sync statuses |
| `MCF_FAKE` | var, staging only | the fake Amazon; anywhere else it stops all sending |
| `MCF_SHIPPING_MAP_JSON`, `MCF_NOTIFY_AMAZON_EMAIL` | var, optional | not set |
| `ORDER_COOLING_OFF_MINUTES` | var, optional | default 60 |
| `MCF_TIMEOUT_MS`, `MCF_RETRY_DELAY_MS` | var, optional | tuning overrides |

Tests: `tests/commerce-mcf.test.mjs` (fake outbound endpoints in `tests/helpers/fake-amazon-mcf.mjs`; `fetch` is
replaced, Amazon is never called), `tests/fulfillment.test.mjs`, `tests/inventory.test.mjs` and
`tests/admin-mcf.spec.mjs` (Playwright). `npm run capture:admin-mcf` writes back-office screenshots to `review/`.

## Meta Conversions API (server-side events)

Production only. The Worker sends `InitiateCheckout` (when the Airwallex PaymentIntent **or** the PayPal order is
created) and `Purchase` (when the order turns paid, exactly once) to Meta's Conversions API, deduplicated against the
browser Pixel by `event_id` (`ic_<orderId>`, `purchase_<orderId>`). `Purchase.value` is the D1 `total_cents / 100` in
USD. Code: `worker/meta-capi.js`, `worker/meta-attribution.js`.

* **Switch:** `META_DATASET_ID` (a plain var, only in `[env.production.vars]`). Unset = the whole feature is skipped.
  The token is the secret `META_CAPI_ACCESS_TOKEN`.
* **Global Privacy Control** (D46): when the browser sends it, nothing is stored for Meta and no event is sent for that
  order (`order_privacy`).
* **Tables:** `order_attribution` (fbp, fbc, fbclid, source URL, client IP and user agent; IP and UA are deleted after
  30 days) and `order_meta_events` (`PK(order_id, event_name)`, status, attempts, a PII-free error code).
* **Reliability:** an atomic claim prevents double sends; 3 tries per request; failures are re-sent by the cron with
  the original `event_id` and `event_time`, stopping after 6 days (Meta rejects events older than 7).
* **Logs:** time, event name, event id, HTTP status, `events_received`, `fbtrace_id`. Never email, phone, name, IP,
  token or payload.
* Full detail, including the browser Pixel: [meta-tracking.md](meta-tracking.md).

GA4: purchases are browser events through GTM; refunds are sent by the Worker through the Measurement Protocol
(`worker/ga4.js`, production only, `GA4_MEASUREMENT_ID` + `GA4_API_SECRET`).

## Airwallex integration notes

Checked against the Airwallex docs (API auth, PaymentIntents, webhooks, Airwallex.js split card elements): login
endpoint and headers, 30-minute token reuse, major-unit amounts (`toMajor`), hex HMAC-SHA256 over
`x-timestamp + raw body` verified before parsing, split-element init (`{ env, enabledElements: ["payments"] }`,
`cardNumber`/`expiry`/`cvc`, `confirm({ intent_id, client_secret })`), no card data touching our server.

| Area | Behaviour (`worker/airwallex.js`, `worker/index.js`) |
| --- | --- |
| Create PaymentIntent idempotency | `request_id` = the checkout id for its first PaymentIntent, then `-2`, `-3`… (`nextRequestId`); Airwallex returns the original intent on retry |
| Transient errors | 10 s timeout; GET and keyed creates retry on network errors / 429 / 5xx (3 tries, backoff); creates without a `request_id` never retry |
| 401 | re-logs in once and replays |
| Login | retries transient failures; token cache keyed by base + client id + `x-login-as`; optional `AIRWALLEX_LOGIN_AS` |
| Failed create | the checkout stays open for the next try; provider detail is logged (`code`, `source`) but never shown to the shopper |
| PaymentIntent payload | `customer` (email, names), `order` with products and `shipping.fee_amount`, `metadata.order_id`, `payment_method_options` |
| Webhook body | 400 on non-JSON / non-event bodies |
| Late webhooks | a genuine (signed) late delivery is accepted and settled from the Retrieve API |

A webhook secret from the wrong account (sandbox vs. production each have their own) shows up as 400s; repeated
signature failures alert the team (C20). The `client_secret` is returned to the browser by design and never logged.

### Webhook subscriptions

| Provider | Production | Staging |
| --- | --- | --- |
| Airwallex | `https://www.shopapgo.com/api/webhooks/airwallex`, version 2026-08-21, all events (payments, payment attempts, refunds, disputes) | `https://staging.shopapgo.com/api/webhooks/airwallex` (sandbox; payment, attempt, refund and dispute events) |
| PayPal | `https://www.shopapgo.com/api/webhooks/paypal`, 8 events ([paypal.md](paypal.md)) | `https://staging.shopapgo.com/api/webhooks/paypal` (sandbox app), same 8 events |

Resend delivery events arrive at `https://www.shopapgo.com/api/webhooks/resend` (production). Every event is checked against the provider's current state before it changes anything; payments that are not ours
are ignored; a provider that is briefly unreachable gets an error so it redelivers.

### Failed payment attempts

Airwallex `payment_attempt.authentication_failed`, `.authorization_failed`, `.risk_declined`, `.failed_to_process`,
`.capture_failed` and `.expired` events are matched to the checkout by `payment_intent_id` (a provided
`merchant_order_id` must match). `worker/payment-failures.js` stores one row per attempt in `order_payment_failures`:
attempt/event ids, failure code, provider code, a bounded/redacted reason, trace id and timestamps; never the raw
payload, card details or `failure_details.details`. PayPal declines are recorded in the same table (C20,
[paypal.md](paypal.md)).

Failed attempts leave the checkout `pending` so the customer can retry; repeated deliveries cannot add a second row and
older events cannot replace a newer reason. A storage error returns 500 so Airwallex retries. The back office shows
**Failed payment attempts** on the order and in Unfinished checkouts; the public order API exposes only a predefined
customer message while the checkout is pending. The cart is cleared only after the server confirms that the order is
paid. `node scripts/capture-payment-failures.mjs` regenerates screenshots with synthetic local fixtures.

### Refunds, disputes and reconciliation

- **Refunds** are made by an owner in the back office (`worker/admin-refunds.js`: shipped or cancelled orders in full
  or in part; unshipped orders in full, cancelling first by default; one request per press with a fixed provider
  request id, so it never refunds twice) or in the Airwallex / PayPal dashboards. Either way the signed refund events
  (`refund.received`, `.accepted`, `.settled`, `.failed`; PayPal `PAYMENT.CAPTURE.REFUNDED` / `.REVERSED`) are read
  back from the provider and stored in `order_refunds`; an owner can also **Sync refunds** from Airwallex.
- The payment stays `paid`; refund totals are separate. A full refund before shipping cancels the order (asking Amazon
  first); a partial one holds shipping and alerts the team; after shipping it is only recorded. Accepted refunds email
  the customer once (`refund:<provider-refund-id>`); a failed refund emails the customer and alerts the staff
  (`REFUND_ALERT_EMAIL_TO`). Refunds are never retried automatically. If a second payment succeeds for the same
  checkout, the later one is refunded automatically, the only refund the system makes by itself.
- **Disputes** (Airwallex `payment_dispute.*`, PayPal `CUSTOMER.DISPUTE.*`): recorded with reason, amount and deadline;
  unshipped orders are held; the team is alerted, again 3 days before the deadline; a lost dispute counts as a full
  refund.
- **Daily reconciliation** (`worker/reconcile.js`): the last 3 days of payments are compared with the providers; a
  payment the provider shows as paid but we missed becomes an order, and a paid order the provider does not confirm is
  reported, not changed.
- **Fees** (C20): each payment's provider fee and net amount are read from PayPal or Airwallex (`payment_fees`) for the
  reports and the payments CSV.
- A sandbox-only diagnostic, `POST /admin/api/orders/:id/refunds/sandbox-check`, sends two fixed invalid refund requests
  on staging; production answers 404.

## Staging

Staging is this repo's test site (`[env.staging]`); deploys are automatic after CI passes on `main`, or
`npm run deploy:staging` (= `build:site` + `db:migrate:staging` + `wrangler deploy --env staging`).

### Staging protections (`worker/staging.js`, active only when `SITE_ENV=staging`)

With `SITE_ENV` unset (local dev and production) the module is a pass-through.

- Every response gets `X-Robots-Tag: noindex, nofollow, noarchive`, and `GET /robots.txt` answers `User-agent: *` /
  `Disallow: /`.
- The whole site is behind **HTTP Basic auth** (`STAGING_BASIC_AUTH_USER`, `STAGING_BASIC_AUTH_PASSWORD`; missing
  secrets fail closed with 503). `run_worker_first` makes static pages and images go through the Worker too.
- **Not** behind the gate: `/robots.txt`, the payment and email webhooks (they verify their own signatures), and the
  admin host (Cloudflare Access).
- Payments are sandbox only (Airwallex `demo`, PayPal sandbox), so no real charge can happen; emails go only to
  `CUSTOMER_EMAIL_TEST_RECIPIENTS`; orders go to the fake Amazon. In the fake, a recipient name containing `STOCKOUT`,
  `MISMATCH` or `REJECT` plays out a stock-out, a mismatched Amazon copy or a refused send (runbook §10, §15).
- Never put production keys into staging.

### Custom domains

`[env.staging]` routes `staging.shopapgo.com`, `admin-staging.shopapgo.com` and `store-staging.shopapgo.com` as custom
domains (zone `shopapgo.com`); `wrangler deploy --env staging` creates the DNS records and certificates.
`workers_dev = true` keeps `https://apgo-us-store-staging.<account>.workers.dev` working (no back office there).
Production routes `store.shopapgo.com` and `admin.shopapgo.com` as custom domains and `www.shopapgo.com/*` and
`shopapgo.com/*` as zone routes.

## Cron (`worker/cron.js`)

Every 5 minutes in production, every 2 on staging. Each job runs on its own and is recorded in `cron_runs`:
`checkouts` (expiry, 30-day purge), `payments` (dispute reminders, daily reconciliation), `fulfillment` (stock-out
retries, missing tracking), `digest`, `mcf_submit`, `mcf_sync`, `email_retry`, `meta_retry`, `tracking`, `ga4`,
`config` (daily), `stock` (every 15 minutes), `retention` (daily), `fees`. `GET /api/health` answers 503 once the last
run is older than 30 minutes, and `HEALTHCHECK_PING_URL` is pinged after every run (`/fail` when a job failed).

## Tests

- `tests/commerce-unit.test.mjs` (node:test): pricing, validation, order ids, webhook signatures, order status
  transitions.
- `tests/commerce-backend.test.mjs` (node:test, Node 22.5+ for `node:sqlite`): the real Worker `fetch` handler over an
  in-memory SQLite D1 stand-in with `fetch` stubbed: PaymentIntent payload and idempotency, webhook settle / dedupe /
  bad signature / late delivery / amount mismatch, notify-once across racing polls, admin auth, notification payloads,
  fulfilment and customer email, Airwallex client token cache / 401 refresh / retry rules.
- `tests/commerce-paypal.test.mjs`, `tests/paypal-checkout.test.mjs`, `tests/paypal.spec.mjs`: PayPal.
- `tests/commerce-pricing.test.mjs`: pricing defaults, `PRICING_JSON` overrides and validation, tax, prod gate, no price
  in front-end code.
- `tests/airwallex-pay.test.mjs`, `tests/commerce-wallets.test.mjs`, `tests/wallets.spec.mjs`: Airwallex Pay and the
  wallets (feature-detection mocks, `ready` gating, flags, Apple domain-file route). `npm run capture:wallets` writes
  screenshots to `review/`.
- `tests/commerce-mcf.test.mjs`, `tests/fulfillment.test.mjs`, `tests/inventory.test.mjs`, `tests/admin-mcf.spec.mjs`,
  `tests/stock.spec.mjs`: Amazon MCF and stock, against a fake Amazon.
- `tests/commerce-meta-capi.test.mjs` with `tests/helpers/fake-meta-capi.mjs`: Meta CAPI; Meta is never called.
- `tests/commerce-refunds.test.mjs`, `tests/customers-refunds.test.mjs`, `tests/payment-events.test.mjs`,
  `tests/customer-email-delivery.test.mjs`, `tests/customer-message-jobs.test.mjs`, `tests/notifications.test.mjs`:
  refunds, disputes, emails.
- `tests/order-core.test.mjs`, `tests/checkouts.test.mjs`, `tests/hardening.test.mjs`, `tests/platform.test.mjs`,
  `tests/schema.test.mjs`, `tests/hosts.test.mjs`, `tests/staging.test.mjs`: order stages, checkouts, limits, settings,
  schema, hosts.
- `tests/admin*.spec.mjs` and `tests/admin-*.test.mjs`: the back office (Playwright with `/admin/api/*` stubbed: list,
  filters, order actions, refunds, disputes, members, products, overflow, axe).
- `tests/commerce.spec.mjs`, `tests/order-page.spec.mjs`, `tests/checkout-rules.spec.mjs`,
  `tests/estimate-markers.spec.mjs`: cart and checkout against the real catalog and validation modules with `/api/*`
  and the payment SDKs stubbed.
- `tests/product-pages.*`, `tests/policy-pages.*`, `tests/contact.test.mjs`, `tests/single-site.test.mjs`,
  `tests/brand-store.spec.mjs`: the site's store pages (the last one only against a served site).

`npm run test:static` runs the node:test files; `npm run test:e2e` runs Playwright against the built site.
