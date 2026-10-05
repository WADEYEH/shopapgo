# Meta tracking: store front end (Pixel + attribution)

Browser half of APGO US Meta tracking. The server half (Conversions API) lives in
`worker/` and is owned separately; the two must agree on the **event_id rules** and the
**attribution contract** below.

- Pixel (dataset) ID: `2606879866471418` (public value, written in `prototype/js/meta-pixel.js`)
- Code: `prototype/js/meta-pixel.js` (new), `prototype/js/commerce/checkout.js` (attribution +
  `checkout_session_created` event + order items on `purchase`)
- Pages that load it (`<script src="js/meta-pixel.js" defer>` + `<noscript>` image in `<head>`):
  `index`, `v2`, `v3`, `cart`, `checkout`, `contact`, `privacy`, `returns`, `terms`, and the generated product pages
  `product`, `products/d204`, `products/d215` (`scripts/build-product-pages.mjs`, absolute `/js/meta-pixel.js`).
  Policy pages come from `scripts/build-policy-pages.py`; change the template and re-run it.
  **Not** loaded on `/admin/` and `v3-style.html`. The pixel is deliberately not in `shared.js`
  (admin pages load that file).

## When it runs

Only when `location.hostname` is one of `store.shopapgo.com`, `shopapgo.com`, or
`www.shopapgo.com` (root cart + existing store subdomain). Staging, `localhost`, `*.pages.dev`,
preview/`workers.dev` hosts and the back-office host (`admin.shopapgo.com`) load nothing, write no
cookie and call no Meta URL. If `window.fbq` already exists it is reused (no second `init`, no
second `PageView`).

On an allowed store host the script:

1. writes the `_fbc` backup cookie (below),
2. installs Meta's standard base code (`https://connect.facebook.net/en_US/fbevents.js`),
   `fbq('init', '2606879866471418')`, `fbq('track', 'PageView')`,
3. listens to the store's own `apgo:analytics` CustomEvents and turns them into Meta standard events.

## Event mapping

| Store event (`apgo:analytics`, same object as `dataLayer`) | Meta event | `eventID` | Price source |
| --- | --- | --- | --- |
| page load of a page with `[data-add-to-cart]` buttons (v3) | `ViewContent` | none | `/api/store/config` `products[].priceCents`; `value` only when exactly one product is on the page, otherwise per-item `item_price` only |
| `view_item` (product pages: `sku`, `currency`, `value`, `items[]`) | `ViewContent` | none | the page's own `items[]`/`value` (read from `/api/store/config` by `product.js`); no price = no `value`. Product pages (`body[data-page=product]`) skip the load-time ViewContent above, so a view is sent once. Switching DRY/WET sends one for the new SKU |
| `add_to_cart` with `items[]` (product pages: also `value`, `currency`, `pair`) | `AddToCart` | none | the event's `items[]` / `value`. A DRY+WET pair dispatches one `add_to_cart` per product, so Meta gets one AddToCart per product; `pdp_pair_added` is not sent to Meta |
| `add_to_cart` without `items[]` (v3 buttons: `sku`, `quantity`) | `AddToCart` | none | `/api/store/config`; `value = price x quantity` |
| `checkout_session_created` (new, see below) | `InitiateCheckout` | `ic_<orderId>` | `/api/checkout/session` response `quote` |
| `add_payment_info` | `AddPaymentInfo` (optional extra) | none | session quote (same contents as InitiateCheckout) |
| `purchase` (`transaction_id`, `value`, `items`) | `Purchase` | `purchase_<orderId>` | `GET /api/orders/:id` (server order) |
| `view_cart`, `begin_checkout`, `add_shipping_info`, `remove_from_cart`, the landing events | not sent | | |

`orderId` is the Worker's `merchant_order_id` (`APGO-US-XXXXXXXXXXXX`), i.e. `orderId` in the
`POST /api/checkout/session` response and `id` in `GET /api/orders/:id`.

Every commerce event carries what is available of: `content_type: "product"`, `content_ids`
(**SKUs, upper case**, e.g. `D204`, from the catalog's `sku`), `contents`
(`[{ id, quantity, item_price }]`), `value`, `currency: "USD"`, and `num_items` (InitiateCheckout, Purchase).
No price exists in this repo's pixel code. If a price cannot be read from the API, the event is
still sent without `value` / `item_price`.

### Why InitiateCheckout is not `begin_checkout`

`begin_checkout` fires when the checkout page opens, before any order exists. The CAPI side sends
`InitiateCheckout` when the Worker creates the order and PaymentIntent, with `event_id =
ic_<orderId>`. The browser therefore waits for the same moment: `ensureSession()` in `checkout.js`
now calls

```js
track("checkout_session_created", { order_id, value, currency, items: [{ item_id, item_name, quantity, price }] });
```

right after `POST /api/checkout/session` succeeds, and `meta-pixel.js` sends
`fbq('track','InitiateCheckout', params, { eventID: 'ic_' + order_id })`. A card shopper triggers it
when pressing "Place order" (or earlier if a wallet button reports ready, which creates the
session); a reused session (same cart/contact/shipping/method within 50 minutes) does not fire it again.
`value` = the session quote's `totalCents / 100` (same basis as `Purchase`).
The existing dataLayer events and their parameters are unchanged; `checkout_session_created` is an
additional event (and `purchase` gained an `items` array). It is not mapped in GTM/GA4.

### Purchase and refresh safety

`checkout.js` `trackPurchaseOnce` still fires `purchase` once per order per tab session
(`apgo_us_purchase_tracked_<id>`). `meta-pixel.js` adds its own guard
(`sessionStorage["apgo_meta_purchase_<orderId>"]`), and the shared `eventID` also lets Meta
deduplicate against the server event. `value` and `items` come from the server order
(`totalCents`, `lines`). The order response has `lines[].{sku, qty, lineCents}` but no unit price,
so `item_price = lineCents / qty / 100`.

## Attribution contract (front end -> Worker)

`POST /api/checkout/session` now has an extra top-level field. Every key is optional and omitted when unknown:

```json
{
  "items": [...], "contact": {...}, "shipping": {...}, "method": "...",
  "attribution": {
    "fbp": "fb.1.1700000000000.1234567890",
    "fbc": "fb.1.1700000000001.IwAR...",
    "fbclid": "IwAR...",
    "sourceUrl": "https://store.shopapgo.com/checkout.html"
  }
}
```

- `fbp` / `fbc`: values of the `_fbp` / `_fbc` cookies as they are (the Worker must not re-format them).
- `fbclid`: `fbclid` in the current URL; if the URL has none (usual: the shopper reached checkout
  through the cart), the part after `fb.1.<ms>.` of the `_fbc` cookie.
- `sourceUrl`: `location.href` at session creation (use it for CAPI `event_source_url`).
- The field is **not** part of the session cache key, so cookies appearing late never create a second PaymentIntent.
- The current Worker ignores unknown body fields (`validateCheckout` copies named fields only), so this is safe to deploy
  before the Worker reads it; the Worker should persist it with the order for the later Purchase CAPI call.

### `_fbc` backup cookie

When the URL has `fbclid` and no `_fbc` cookie exists, the script writes
`_fbc=fb.1.<Date.now() ms>.<fbclid>`; `Max-Age` 90 days, `Path=/`, `Domain=.shopapgo.com`, `SameSite=Lax`.
An existing `_fbc` is never overwritten. (Meta's own script normally writes the cookie; this covers
blockers/late loads so checkout can still send `fbc`.)

## How to verify

Automated (`npm run test:static`, `npm run test:e2e`): `tests/meta-pixel.test.mjs` (static contract + fake-DOM
behaviour) and `tests/meta-pixel.spec.mjs` (browser flows on faked allowed store hosts
`https://store.shopapgo.com` / `https://shopapgo.com` / `https://www.shopapgo.com`, fbevents stubbed).

Manually on production after deploy:

1. Meta Events Manager -> dataset `2606879866471418` -> Test events, or the *Meta Pixel Helper* extension: open
   `https://shopapgo.com/?fbclid=test123` (or `www` / `store`) and see `PageView`, `ViewContent`; the `_fbc` cookie appears.
2. Add to cart -> `AddToCart` (value = price x qty). Go through checkout and press Place order -> `InitiateCheckout`
   with Event ID `ic_APGO-US-...`. After payment -> `Purchase` with Event ID `purchase_APGO-US-...`.
3. In Events Manager the browser and server copies of the same event (same Event ID) show as one deduplicated event.
4. Reload the confirmation page: no second `Purchase`.
5. Browser console: `window.fbq.queue` (stub only) or the Network tab filtered on `facebook` (`/tr?id=2606879866471418`).
6. On a staging/preview hostname the Network tab must show no request to `connect.facebook.net`.

## Known limits / follow-ups

- `<noscript><img ...PageView...></noscript>` sits in `<head>` as requested. It is raw text when scripting is on and
  only matters for visitors without JavaScript; being plain HTML it does not check the hostname, so a no-JS visitor on
  staging would also ping Meta (PageView only).
- AddToCart/ViewContent need one extra `GET /api/store/config` per product page view (shared, cached for the page's life).
- Wallet (Apple/Google Pay) shoppers create the session when the wallet button becomes ready, so `InitiateCheckout`
  fires at that point (the same moment the Worker's CAPI call would fire).
