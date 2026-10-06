# APGO commerce integration

The October 1 store implementation now lives inside `shopapgo`, independently
of the Next.js static brand site. No deployment is performed by the import.

## Provenance and scope

Imported from `WADEYEH/apgo-us-amazon-landing`, branch
`codex/v2-content-blueprint`, at `9a30bfc68db883a31b774c43b4b40dfb431d5161`:

- `5ee653d`: draft Privacy, Terms, Returns and Contact pages and generator.
- `073dbac`: V3 landing, cart, checkout, wallets, back-office UI and media.
- `6037226`: Worker, D1 order storage, Airwallex, fulfillment and deploy tools.
- `9a30bfc`: documentation, handoff and tests.

Required older dependencies (product images, full application videos and
Amazon link configuration) are included. V1/V2 landing pages, their tests and
old Shopify/blueprint documents are not imported. V3 and its style board remain
available at `/v3.html` and `/v3-style.html`; the Worker root serves V3.

## Two applications, one repository

- Root: existing Next.js brand site and 20 guides, still exported for Pages.
- `commerce/`: standalone package, Worker and storefront on the store origin.
- Existing brand-site CTAs gain Add to cart and an Amazon alternative only
  when `NEXT_PUBLIC_APGO_US_STORE_READY=true` and
  `NEXT_PUBLIC_APGO_US_STORE_URL` is a valid HTTPS origin (HTTP loopback for dev).
- The brand site links to `cart.html?add=d204|d215`. The store consumes and removes
  the parameter; only the store origin owns `apgo_us_cart_v1`. No cross-origin
  cart-count badge is invented on the brand site.
- Store footers link back to the brand site and guides. `SITE_HOME_URL` selects
  the destination, defaulting to `https://www.shopapgo.com/us`.

## Local review

Node 22.5+ is required to exercise the SQLite-backed tests. Python 3 regenerates
the policy drafts; Node serves the browser test assets on Windows and Linux.

From the repository root:

```sh
npm ci
npm run commerce:install
npm run commerce:test
npm run commerce:test:e2e
npm run commerce:verify
```

For the six cross-origin integration checks, start both preview servers, then
from `commerce/` set `APGO_BRAND_URL=http://127.0.0.1:3012/us`,
`APGO_STORE_URL=http://127.0.0.1:8799` and
`APGO_BASE_URL=http://127.0.0.1:8799`, and run
`npx playwright test tests/brand-store.spec.mjs --workers=1`. Those checks are
skipped in the standalone store suite when no brand server is supplied.

Start the Worker with `npm run commerce:dev` (port 8799). Initialize only its
local D1 with `npm --prefix commerce run db:migrate:local`. Copy
`commerce/.dev.vars.example` to a git-ignored `commerce/.dev.vars` and supply
your sandbox credentials when testing actual sandbox payment. Without those
credentials, quote/cart work but a payment cannot be created.

To preview the brand site's purchase entries, set its `.env.local`:

```dotenv
NEXT_PUBLIC_APGO_US_STORE_URL=http://127.0.0.1:8799
NEXT_PUBLIC_APGO_US_STORE_READY=true
```

Then run `npm run dev -- --port 3012`. Local `SITE_HOME_URL` in `wrangler.toml`
matches this port. Browser tests mock Airwallex/Resend/Amazon and take no real
payment or shipment.

## Integration adjustments

- All asset requests run through the Worker in every environment. Host split,
  admin authentication, root-page override and staging protection consequently
  apply to static pages as well as API requests.
- Production has `ADMIN_HOST=admin.shopapgo.com`; its routes and D1 ID are still
  placeholders, and `PRICING_APPROVED` remains unset.
- Cart-page express wallets remain **off on staging and production** because
  the imported cart express flow is UI only. Checkout-step wallets are retained.
- Policy generator output is explicitly LF to remain deterministic on Windows.
- Original handoff documents in `docs/` describe the upstream staging state;
  they are historical evidence, not confirmation of a new deployment here.

## Remaining production work

Finalize prices, shipping, tax and policies; configure production D1, secrets,
domains and Airwallex webhook; validate 3DS and wallets on real devices; configure
customer emails and decide fulfillment. Then perform a real low-value order
before enabling the brand-site store switch. Refunds are initiated in Airwallex;
the shared-token admin can sync and display their status and hold new shipping.
It has no refund-creation, cancellation, partial shipment or tracking-edit workflow. MCF is opt-in
and requires the separate `amazon-spapi-mcp` service.

See `docs/commerce.md` for the imported architecture and service details. Do not
use its old owner credential-file paths: obtain current secrets from the vault.
