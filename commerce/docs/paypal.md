# PayPal Checkout (Orders v2) — frontend integration contract

Direct PayPal Checkout sits **alongside** the existing Airwallex card session. It
uses the same `APGO-US-XXXXXXXXXXXX` order id, the same D1 `orders` table, the
same admin back office, and the same Meta Pixel + CAPI `event_id`s. Apple Pay
and Google Pay stay as they are (currently off). MCF is not turned on by this
work.

The payment step is choose-one: the shopper picks **Card**, **Airwallex Pay**, or
**PayPal** (when enabled). Selecting one hides the others; they can switch.
Wallet buttons are unchanged and stay outside that choice. Endpoints, payloads,
and Meta event ids below do not change.

Code: `worker/paypal.js`, handlers in `worker/index.js`. Tests:
`tests/commerce-paypal.test.mjs`.

## When to show the button

`GET /api/store/config` now includes:

```json
{
  "paypal": {
    "enabled": true,
    "clientId": "<PAYPAL_CLIENT_ID>",
    "env": "sandbox"
  }
}
```

- `enabled` is true only when `PAYPAL_CLIENT_ID` is set (it is already set on
  staging and production).
- `clientId` is **public**. Load the JS SDK with it:
  `https://www.paypal.com/sdk/js?client-id=<clientId>&currency=USD&intent=capture`.
  `env` is `"live"` or `"sandbox"` (`PAYPAL_ENV`); the SDK also infers this from
  the client id.
- `PAYPAL_CLIENT_SECRET` never leaves the Worker.
- Still honour `storeReady`. Production checkout is 503 until `PRICING_APPROVED=true`,
  for PayPal **and** cards.

Do not send the shopper to PayPal until they have a non-empty cart. Prices always
come from `POST /api/cart/quote` / the create response `quote` — never from the
browser.

## Endpoints

All JSON, `Content-Type: application/json`. Same Worker as cards
(`store.shopapgo.com`, staging `staging.shopapgo.com`, and any `www.shopapgo.com`
path route that already hits this Worker).

### `POST /api/checkout/paypal/order`

Creates a **pending** store order and a PayPal Orders v2 order (`intent: CAPTURE`).
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
  "method": "express",
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
| `items` | yes | `{ sku, qty }` only. Server re-prices from `worker/pricing.js`. |
| `contact.email` | yes | Order confirmation goes here. |
| `contact.marketingOptIn` | no | Same as card checkout. |
| `shipping` | no* | If **any** name/address field is sent, the whole US address is validated like cards. Omit it to let PayPal collect the address (`shipping_preference = GET_FROM_FILE`). \*Required when tax is configured (`config.tax.status === "configured"`) so the PayPal amount includes destination tax. Today tax is `undecided`, so email-only is allowed. |
| `method` | no | Shipping method key (`standard` / `express`). Default from config. |
| `attribution` | no | Same shape as `POST /api/checkout/session`. Optional; never part of the cache key. |

**Response `200`**

```json
{
  "orderId": "APGO-US-0A2B3C4D5E6F",
  "quote": {
    "currency": "USD",
    "lines": [{ "id": "d204", "sku": "D204", "name": "…", "qty": 1, "unitCents": 5999, "lineCents": 5999 }],
    "shippingMethod": "express",
    "subtotalCents": 11997,
    "shippingCents": 900,
    "taxCents": null,
    "totalCents": 12897
  },
  "paypal": {
    "id": "5O190127TN364715T",
    "status": "CREATED",
    "approveUrl": "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T"
  },
  "eventIds": {
    "initiateCheckout": "ic_APGO-US-0A2B3C4D5E6F",
    "purchase": "purchase_APGO-US-0A2B3C4D5E6F"
  }
}
```

Use `paypal.id` as the JS SDK `createOrder` return value. `approveUrl` is for a
redirect fallback only.

**Errors:** `400` validation (`invalid_email`, `invalid_state`, `empty_cart`, …),
`503 store_not_ready`, `502 payment_provider_error` (PayPal create failed; the
orphan store order is cancelled). Provider detail is never returned.

### `POST /api/checkout/paypal/capture`

Call from the JS SDK `onApprove` (and from the return-URL page if you use
redirect). The Worker retrieves the PayPal order, **refuses to capture** unless
PayPal returned a usable US shipping address, captures, then settles the store
order.

**Request** (either id is enough; both must match if both are sent)

```json
{ "paypalOrderId": "5O190127TN364715T" }
```

or `{ "orderId": "APGO-US-0A2B3C4D5E6F" }`.

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

`status` is `paid` or `review`. `review` means PayPal already captured but the
amount/currency disagreed **or** the address was unusable (webhook race). Do
**not** treat `review` as a successful purchase in the Pixel.

**Errors:** `400 missing_shipping_address` (PayPal has no usable US address —
**nothing was captured**), `400 invalid_request`, `404 not_found`,
`503 store_not_ready`, `502 payment_provider_error`.

Usable US address = first + last name, street, city, 2-letter US state or DC,
5-digit or ZIP+4, country `US`. PayPal `admin_area_1` of `"California"` is
normalised to `CA`. Non-US addresses are rejected.

### `GET /api/orders/:id`

Same public payload as cards (masked email, **no address**). For a pending
PayPal order this retrieves the PayPal order and, if it is `APPROVED` **and**
has a usable US address, captures and settles (so a return-URL poll works even
if `onApprove` did not run). `CREATED` / missing address stays `pending`.

When a payment just settled you may see `paymentStatus: "COMPLETED"` alongside
`status: "paid"`.

### `POST /api/webhooks/paypal`

PayPal → Worker. **Not called by the frontend.** Idempotent by PayPal event id.
Always re-reads the PayPal order before settling (same idea as the Airwallex
Retrieve fallback). Exempt from the staging Basic gate.

## Recommended JS SDK wiring

```js
paypal.Buttons({
  createOrder: async () => {
    const res = await fetch("/api/checkout/paypal/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, contact, method, attribution }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Could not start PayPal.");
    sessionStorage.setItem("apgo_paypal_order", JSON.stringify(data));
    // Pixel InitiateCheckout — same eventID as CAPI
    fbq("track", "InitiateCheckout", pixelParamsFrom(data.quote, data.orderId), {
      eventID: data.eventIds.initiateCheckout, // ic_<orderId>
    });
    return data.paypal.id;
  },
  onApprove: async (data) => {
    const res = await fetch("/api/checkout/paypal/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paypalOrderId: data.orderID }),
    });
    const result = await res.json();
    if (!res.ok || result.status !== "paid") throw new Error(result.error?.message || "Payment could not be completed.");
    fbq("track", "Purchase", pixelParamsFromOrder(result), {
      eventID: result.eventIds.purchase, // purchase_<orderId>
    });
    location.assign(`/checkout?order=${encodeURIComponent(result.orderId)}`);
  },
  onCancel: () => { /* stay on checkout; the pending order is unused */ },
}).render("#paypal-button");
```

Return / cancel URLs the Worker registers on the PayPal order (redirect
fallback):

- `{origin}/checkout?order=<id>&paypal=return`
- `{origin}/checkout?order=<id>&paypal=cancel`

`origin` is the request `Origin` / `Referer` when it is
`www.shopapgo.com`, `store.shopapgo.com`, `shopapgo.com`,
`staging.shopapgo.com`, localhost, or `*.workers.dev`. Otherwise production
defaults to `https://www.shopapgo.com` and staging to
`https://staging.shopapgo.com`.

On `&paypal=return`, either call capture or poll `GET /api/orders/:id` until
`status` is `paid` (or show an error if it stays `pending` / becomes `review`).

## Meta Pixel + CAPI (dedupe)

Same ids as cards. Do **not** invent new ones.

| Event | When (Worker) | `event_id` | When (Pixel) |
| --- | --- | --- | --- |
| `InitiateCheckout` | PayPal (or Airwallex) order created | `ic_<orderId>` | right after create succeeds |
| `Purchase` | first transition `pending` → `paid` (`afterSettle`) | `purchase_<orderId>` | after capture returns `paid`, or confirmation page (once) |

`Purchase.value` = D1 `total_cents / 100` USD. `META_TEST_EVENT_CODE` is still
honoured on CAPI (Test Events). See `docs/meta-tracking.md` and
`docs/meta-tracking-frontend.md`.

## Amounts

The PayPal order amount **is** the server quote (`total_cents`), with a
breakdown of items + shipping + tax. A succeeded capture whose amount or
currency disagrees is stored as `review`, never `paid`. Do not send browser
prices to PayPal.

If destination tax is later configured, send a full US `shipping` (or at least
`state`) on create so the quoted total includes tax. The Worker does **not**
re-price after PayPal returns a different state.

## What is stored

- `orders.id` — `APGO-US-…` (same scheme as Airwallex).
- `orders.payment_intent_id` — PayPal order id (admin still shows it as
  `paymentIntentId`).
- `order_payments` — `provider = paypal`, `provider_ref` = PayPal order id.
- `orders.shipping_json` — **replaced** on settle with the PayPal
  payer/purchase_unit address (needed later for Amazon MCF). A paid order is
  never written without that usable US address; a capture that already happened
  without one is `review`.

Card path (`POST /api/checkout/session`) is unchanged.

## Env vars (names only)

Already set on Cloudflare (do not invent or print values):

| Name | Staging | Production | Kind |
| --- | --- | --- | --- |
| `PAYPAL_CLIENT_ID` | sandbox app | live app | secret (also exposed publicly via `/api/store/config`) |
| `PAYPAL_CLIENT_SECRET` | sandbox | live | secret, Worker-only |
| `PAYPAL_ENV` | `sandbox` → `api-m.sandbox.paypal.com` | `live` → `api-m.paypal.com` | secret |
| `PAYPAL_WEBHOOK_ID` | **must be added** after Dashboard registration | **must be added** | secret |

Local: copy the names into `.dev.vars` (see `.dev.vars.example`). Optional test
override: `PAYPAL_API_BASE`, `PAYPAL_RETRY_DELAY_MS`.

`PRICING_APPROVED`, `META_DATASET_ID`, `META_CAPI_ACCESS_TOKEN`,
`META_TEST_EVENT_CODE` are unchanged.

## PayPal Dashboard — webhook the operator must register

The Worker **will not accept** webhook deliveries until `PAYPAL_WEBHOOK_ID` is
set. Capture + `GET /api/orders/:id` still settle orders without it (same as
staging Airwallex today).

1. [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/) → the
   US store app → **Webhooks** → **Add webhook**.
2. URL:
   - Production: `https://store.shopapgo.com/api/webhooks/paypal`  
     (also register `https://www.shopapgo.com/api/webhooks/paypal` if that host
     is path-routed to this Worker.)
   - Staging: `https://staging.shopapgo.com/api/webhooks/paypal` (sandbox app).
3. Event: **`PAYMENT.CAPTURE.COMPLETED`** (required). Optional:
   `CHECKOUT.ORDER.COMPLETED`.
4. Copy the **Webhook ID** into Cloudflare:
   `npx wrangler secret put PAYPAL_WEBHOOK_ID --env production`  
   (staging: `--env staging`).
5. Use the sandbox app + sandbox webhook on staging; live app + live webhook in
   production. Do not mix.

The handler verifies via `POST /v1/notifications/verify-webhook-signature`
(PayPal-Auth-Algo / Cert-Url / Transmission-* headers). A failed or missing
signature is `400` and does not settle. Redeployies are recorded in
`webhook_events` and return `{ received: true, duplicate: true }`.
