# PayPal Checkout (Orders v2) — integration contract

PayPal Checkout sits **alongside** the Airwallex payment session. It uses the same `APGO-US-XXXXXXXXXXXX` checkout
and order id, the same D1 `orders` table, the same back office, and the same Meta Pixel + CAPI `event_id`s.

Payment methods (D70): in production the payment step offers **PayPal** (listed first and selected; it also takes debit
and credit cards as a guest checkout, so a shopper needs no PayPal account) and **Airwallex Pay**. **Card**, Apple Pay
and Google Pay appear only where card payments are enabled (staging; production after C14). The step is choose-one:
selecting a method hides the others, and the shopper can switch.

Code: Worker `worker/paypal.js` (client), handlers in `worker/index.js`, events in `worker/payment-events.js`, declines
in `worker/payment-failures.js`. Browser: `lib/shop/paypal.mjs` (DOM-free helpers: SDK URL, request payload, session
storage) and `components/shop/checkout/CheckoutPage.js` (script loading, `paypal.Buttons()`, confirmation UX). Tests:
`tests/commerce-paypal.test.mjs`, `tests/paypal-checkout.test.mjs`, `tests/paypal.spec.mjs`.

## When to show the button

`GET /api/store/config` includes:

```json
{
  "paypal": {
    "enabled": true,
    "clientId": "<PAYPAL_CLIENT_ID>",
    "env": "live"
  }
}
```

- `enabled` is true only when `PAYPAL_CLIENT_ID` is set (it is, on staging and production).
- `clientId` is **public**. The page loads the JS SDK with it:
  `https://www.paypal.com/sdk/js?client-id=<clientId>&currency=USD&intent=capture`. `env` is `"live"` or `"sandbox"`
  (`PAYPAL_ENV`).
- `PAYPAL_CLIENT_SECRET` never leaves the Worker.
- Honour `storeReady`. Checkout is open in production (`PRICING_APPROVED` is set); without it, production would answer
  `503 store_not_ready` for PayPal **and** cards.

Do not send the shopper to PayPal until they have a non-empty cart. Prices always come from `POST /api/cart/quote` /
the create response `quote` — never from the browser.

## Endpoints

All JSON, `Content-Type: application/json`, on the site host: `www.shopapgo.com` in production,
`staging.shopapgo.com` on staging.

### `POST /api/checkout/paypal/order`

Opens (or reuses, via `checkoutId`, D36) the **pending** checkout and creates a PayPal Orders v2 order
(`intent: CAPTURE`). Each press of the PayPal button creates a new PayPal order; the checkout's older PayPal orders are
voided and can no longer be captured. The create carries a `PayPal-Request-Id` (the checkout id, then `-2`, `-3`…).
Fires Meta `InitiateCheckout` with `event_id = ic_<orderId>` (production only).

**Request**

```json
{
  "items": [{ "sku": "d204", "qty": 1 }, { "sku": "d215", "qty": 2 }],
  "contact": { "email": "ada@example.com", "marketingOptIn": false },
  "shipping": {
    "firstName": "Ada",
    "lastName": "Lee",
    "street": "100 Example Ave",
    "street2": "Apt 4",
    "city": "Austin",
    "state": "TX",
    "zip": "78701"
  },
  "method": "standard",
  "checkoutId": "APGO-US-0A2B3C4D5E6F",
  "attribution": {
    "fbp": "fb.1.1700000000000.1234567890",
    "fbc": "fb.1.1700000000001.IwAR...",
    "fbclid": "IwAR...",
    "sourceUrl": "https://www.shopapgo.com/checkout"
  }
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `items` | yes | `{ sku, qty }` only. Server re-prices from `worker/pricing.js` and the live product prices. |
| `contact.email` | yes | Order confirmation goes here. |
| `contact.marketingOptIn` | no | Same as card checkout. |
| `shipping` | no* | If **any** name/address field is sent, the whole US address is validated like cards (including the address check). The checkout page sends the address the shopper entered, and PayPal is told to use it (`shipping_preference = SET_PROVIDED_ADDRESS`). Without it PayPal collects the address (`GET_FROM_FILE`), checked by the same rules before capture. \*Required once a sales-tax rate is configured (`config.tax.status === "configured"`); today tax is $0 (D68, `undecided`). |
| `method` | no | Shipping method key; the only one is `standard`. |
| `checkoutId` | no | The checkout to reuse (retries, refreshes, a switch from another method). |
| `attribution` | no | Same shape as `POST /api/checkout/session`. |

**Response `200`**

```json
{
  "orderId": "APGO-US-0A2B3C4D5E6F",
  "quote": {
    "currency": "USD",
    "lines": [{ "id": "d204", "sku": "D204", "name": "…", "qty": 1, "unitCents": 5999, "lineCents": 5999 }],
    "shippingMethod": "standard",
    "subtotalCents": 11997,
    "shippingCents": 799,
    "taxCents": 0,
    "totalCents": 12796
  },
  "paypal": {
    "id": "5O190127TN364715T",
    "status": "CREATED",
    "approveUrl": "https://www.paypal.com/checkoutnow?token=5O190127TN364715T"
  },
  "eventIds": {
    "initiateCheckout": "ic_APGO-US-0A2B3C4D5E6F",
    "purchase": "purchase_APGO-US-0A2B3C4D5E6F"
  }
}
```

`paypal.id` is the JS SDK `createOrder` return value. `approveUrl` is for a redirect fallback only.

**Errors:** `400` validation (`invalid_email`, `invalid_state`, `empty_cart`, …), `409 checkout_closed` (the checkout
was paid meanwhile, e.g. in another tab: PayPal does not open and the page shows the order), `503 store_not_ready`,
`502 payment_provider_error` (PayPal create failed). Provider detail is never returned.

### `POST /api/checkout/paypal/capture`

Called from the JS SDK `onApprove` (and from the return-URL page). The Worker retrieves the PayPal order,
**refuses to capture** unless PayPal returned a usable US shipping address, captures, then settles the store order. An
order PayPal already captured is never captured again.

**Request** (either id is enough; both must match if both are sent)

```json
{ "paypalOrderId": "5O190127TN364715T" }
```

or `{ "orderId": "APGO-US-0A2B3C4D5E6F" }` (then the checkout's newest PayPal order).

**Response `200`**

```json
{
  "orderId": "APGO-US-0A2B3C4D5E6F",
  "status": "paid",
  "paypal": { "id": "5O190127TN364715T", "status": "COMPLETED" },
  "eventIds": {
    "initiateCheckout": "ic_APGO-US-0A2B3C4D5E6F",
    "purchase": "purchase_APGO-US-0A2B3C4D5E6F"
  }
}
```

- `status: "paid"` is the only Purchase.
- `status: "review"`: PayPal captured but the amount/currency disagreed **or** the address was unusable. Not a Purchase.
- `status: "pending"` with `paypal.status: "PENDING"`: see "PENDING captures". Not a Purchase.

The page shows the order page in all three cases.

**Errors:** `400 missing_shipping_address` (PayPal has no usable US address — **nothing was captured**),
`400 invalid_request`, `404 not_found`, `402 paypal_declined` (see "Declined cards"), `402 paypal_not_completed`
(PayPal refused the payment otherwise; nothing was charged), `409 checkout_closed`, `409 checkout_expired`,
`409 payment_replaced` (a newer PayPal order replaced this one), `503 store_not_ready`, `502 payment_provider_error`.

Usable US address = first + last name, street, city, a state we ship to (the 48 contiguous states and DC), 5-digit or
ZIP+4, country `US`. PayPal `admin_area_1` of `"California"` is normalised to `CA`. Non-US addresses are rejected.

### `GET /api/orders/:id`

Same public payload as cards (masked email, **no address**), plus `paymentProvider: "paypal"`, `paymentStatus` and a
safe `paymentFailure` message while the checkout is pending. For a pending PayPal checkout it retrieves the PayPal
order and, if it is `APPROVED` **and** has a usable US address, captures and settles (so a return-URL poll works even if
`onApprove` did not run). It never captures again after a decline; only the shopper choosing another way to pay in
PayPal does.

### `POST /api/webhooks/paypal`

PayPal → Worker. **Not called by the frontend.** Verified with PayPal (`PAYPAL_WEBHOOK_ID`), idempotent by PayPal
event id, and always re-reads the PayPal order or capture before acting. Exempt from the staging Basic gate.

## PENDING captures (D72)

PayPal can call an order `COMPLETED` while its capture is still `PENDING` (a payment under review, an eCheck, a
currency the account must accept by hand). Only a capture that is `COMPLETED` counts as paid. While it is pending:

- the checkout stays unpaid: no order, no confirmation email, no Purchase event, nothing sent to Amazon;
- the shopper's order page says the payment is being confirmed;
- the team gets one alert ("PayPal is holding the payment") with PayPal's reason.

`PAYMENT.CAPTURE.COMPLETED` (or a later poll) then settles the order and everything continues by itself. A pending
capture that PayPal denies (`PAYMENT.CAPTURE.DENIED`) took no money: the checkout stays unpaid, its order page says the
payment did not go through, and the team is told.

## Declined cards (C20)

When PayPal refuses the funding source at capture (`INSTRUMENT_DECLINED`, also `PAYER_ACTION_REQUIRED`), the capture
endpoint answers **`402 paypal_declined`** and the page calls the SDK's `actions.restart()`, so the PayPal window opens
again for the shopper to choose another card or their PayPal balance. Each capture try uses its own `PayPal-Request-Id`
(`<orderId>-capture`, then `-capture-1`, `-capture-2`…), so a new try never gets PayPal's answer to the declined one.
PayPal sends no event for this, so every decline is recorded in `order_payment_failures` (`paypal:<PayPal order id>:<n>`,
code `paypal_declined`, PayPal's issue and debug id): the back office shows it on the order and in Unfinished
checkouts, and the customer's order page explains it. Other capture refusals answer `402 paypal_not_completed`.

## Return and cancel URLs

The Worker registers these on the PayPal order (redirect fallback):

- `{origin}/checkout?order=<id>&paypal=return`
- `{origin}/checkout?order=<id>&paypal=cancel`

`origin` is the request `Origin` / `Referer` when its host is `www.shopapgo.com`, `store.shopapgo.com`, `shopapgo.com`,
`staging.shopapgo.com`, localhost, `*.workers.dev` or `*.pages.dev`. Otherwise production defaults to
`https://www.shopapgo.com` and staging to `https://staging.shopapgo.com`. On `&paypal=return` the page calls capture
with the `orderId` and then shows the order.

## Meta Pixel + CAPI (dedupe)

Same ids as cards. Do **not** invent new ones.

| Event | When (Worker) | `event_id` | When (Pixel) |
| --- | --- | --- | --- |
| `InitiateCheckout` | PayPal (or Airwallex) payment created | `ic_<orderId>` | right after create succeeds |
| `Purchase` | first transition `pending` → `paid` (`afterSettle`) | `purchase_<orderId>` | after capture returns `paid`, or on the order page (once) |

`Purchase.value` = D1 `total_cents / 100` USD. `META_TEST_EVENT_CODE` (Test Events) is honoured on CAPI when set; it is
not set in production. See [meta-tracking.md](meta-tracking.md).

## Amounts

The PayPal order amount **is** the server quote (`total_cents`), with a breakdown of items + shipping + tax. A
succeeded capture whose amount or currency disagrees is stored as `review`, never `paid`. Do not send browser prices to
PayPal. If a sales-tax rate is configured later, the full US `shipping` is required on create so the quoted total
includes tax; the Worker does **not** re-price after PayPal returns a different state.

## What is stored

- `orders.id` — `APGO-US-…` (the checkout id, same scheme as Airwallex).
- `orders.payment_intent_id` — the paying PayPal order id (the back office shows it as the payment id).
- `checkout_payments` — every PayPal order created for the checkout (`provider = paypal`, `ref` = PayPal order id),
  with its status (open, voided, succeeded, …).
- `order_payments` — `provider = paypal`, `provider_ref` = PayPal order id.
- `orders.shipping_json` — **replaced** on settle with the PayPal purchase-unit address (what Amazon MCF ships to); the
  phone and the address-check result are kept when PayPal ships to the address that was checked. A paid order is never
  written without a usable US address; a capture that already happened without one is `review`.
- `order_payment_failures` — PayPal declines (above).

## Env vars (names only)

Set on Cloudflare (do not invent or print values):

| Name | Staging | Production | Kind |
| --- | --- | --- | --- |
| `PAYPAL_CLIENT_ID` | sandbox app | live app | secret (also public via `/api/store/config`) |
| `PAYPAL_CLIENT_SECRET` | sandbox | live | secret, Worker-only |
| `PAYPAL_ENV` | `sandbox` → `api-m.sandbox.paypal.com` | `live` → `api-m.paypal.com` (checked daily, C23) | secret |
| `PAYPAL_WEBHOOK_ID` | set (sandbox webhook) | set (live webhook) | secret |

Local: copy the names into `.dev.vars` (see `.dev.vars.example`). Optional test overrides: `PAYPAL_API_BASE`,
`PAYPAL_RETRY_DELAY_MS`.

## Webhooks (set)

| Environment | PayPal app | URL |
| --- | --- | --- |
| Production | live app `MyApp_Wix_com_Ltd` (company account) | `https://www.shopapgo.com/api/webhooks/paypal` |
| Staging | sandbox "Default Application" (same account) | `https://staging.shopapgo.com/api/webhooks/paypal` |

Both subscribe to the same 8 events (`docs/ops/runbook.md` §14): `PAYMENT.CAPTURE.COMPLETED`,
`CHECKOUT.ORDER.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, `PAYMENT.CAPTURE.DENIED`,
`CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.UPDATED`, `CUSTOMER.DISPUTE.RESOLVED`. Each webhook's ID is the
environment's `PAYPAL_WEBHOOK_ID`. Use the sandbox app and webhook on staging and the live ones in production; do not mix.

What the events do: `PAYMENT.CAPTURE.COMPLETED` / `CHECKOUT.ORDER.COMPLETED` settle the order from a fresh read of the
PayPal order; refunds and reversals are recorded like Airwallex refunds (a reversal counts as a full refund and alerts
the team); a denied capture alerts the team; disputes are recorded with their deadline and hold unshipped orders
(`worker/payment-events.js`, runbook §14).

The handler verifies each delivery via `POST /v1/notifications/verify-webhook-signature` (PayPal-Auth-Algo / Cert-Url
/ Transmission-* headers). A failed or missing signature is `400` and changes nothing; repeated failures alert the team
(C20). Redeliveries are recorded in `webhook_events` and return `{ received: true, duplicate: true }`. A PayPal outage
while reading answers `502` so PayPal sends the event again. If the webhook ID were missing, deliveries would be refused,
but capture and `GET /api/orders/:id` would still settle orders.
