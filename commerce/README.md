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

**Sync point 1 (2026-10-06).** The landing repo kept developing after the import. Its
`main` at `cbdf77e` was merged into `commerce/` with history (`9a30bfc` recorded as already
imported, then `git merge -X subtree=commerce cbdf77e`). It brought PayPal Orders v2
(`docs/paypal.md`), the Meta Pixel and Conversions API with checkout attribution
(`docs/meta-tracking.md`), the product pages (`docs/product-pages.md`), Airwallex Pay, checkout
drafts, email/password admin login and the live production settings. The legacy landing pages
(`index.html`, `v2.html`) stay out. Gaps found in the audit are listed in
`docs/design/landing-audit.md` at the repository root; later landing work is merged the same way.

## Two applications, one repository

- Root: existing Next.js brand site and its guides, still exported for Pages.
- `commerce/`: standalone package, Worker and storefront.
- Brand-site product CTAs link to the same-host store pages. On the live site,
  `www.shopapgo.com` serves those store paths (`/products/*`, `/cart`, `/checkout`,
  `/api/*`, the policy pages and their assets) from the production store Worker
  (routes in `wrangler.toml`, see `docs/ops/production-config.md`).
- Single-site switch `NEXT_PUBLIC_APGO_US_SINGLE_SITE` (`lib/us/routes.js`), on only in
  builds served together with the store pages (`scripts/build-site.mjs` sets it for the
  test site; www gets it at the cutover): Shop and the cart count in the brand header,
  Shop/Cart and the policy pages in its footer, and the named product URLs
  `/products/atomic-colored-glaze` and `/products/atomic-glaze-coating` (D39). Off, the
  brand pages keep `/products/d204` and `/products/d215`; the Worker answers those, and
  `/v3`, with a 301 to the new URLs (`worker/root-page.js`).
- `/products` is the overview of every product on sale (`prototype/products.html`,
  generated with the product pages by `scripts/build-product-pages.mjs`).
- Store footers link back to the brand site and guides. `SITE_HOME_URL` selects
  the destination, defaulting to `https://www.shopapgo.com/us` (which now redirects to `/`).

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

The single-site checks (`tests/brand-store.spec.mjs`) run against a served single
site; the header of that file has the commands (`npm run build:site`, then
`wrangler dev` on `./site`, then Playwright with `APGO_SITE_URL`). They are skipped
in the standalone store suite.

Start the Worker with `npm run commerce:dev` (port 8799). Initialize only its
local D1 with `npm --prefix commerce run db:migrate:local`. Copy
`commerce/.dev.vars.example` to a git-ignored `commerce/.dev.vars` and supply
your sandbox credentials when testing actual sandbox payment. Without those
credentials, quote/cart work but a payment cannot be created.

The brand site's Shop and cart links are same-host paths, so preview them on the
single site above rather than on `npm run dev`. Browser tests mock
Airwallex/Resend/Amazon and take no real payment or shipment.

## Integration adjustments

- All asset requests run through the Worker in every environment. Host split,
  admin authentication, root-page override and staging protection consequently
  apply to static pages as well as API requests.
- Test site: `staging.shopapgo.com` + `admin-staging.shopapgo.com` (`[env.staging]`: own Worker
  and D1, Airwallex/PayPal sandbox, Basic-auth gate, emails only to the approved test address,
  Amazon connection read-only because `MCF_AUTO_SUBMIT` stays off, no Meta). Deploy with
  `npm --prefix commerce run deploy:staging`, which first runs `worker/schema.sql` on its D1.
  The landing repo is frozen (plan D37) and no longer deploys anywhere.
- Production settings mirror the live store (`store.shopapgo.com`, `admin.shopapgo.com`, the
  production D1). This repo does not deploy production yet; `PRICING_APPROVED` stays unset here.
- D1 changes follow one rule: `worker/schema.sql` only creates missing tables and indexes and is
  re-run on every deploy. `tests/schema.test.mjs` applies it to the production structure
  (`tests/fixtures/production-schema-2026-10-06.sql`) and checks that only new tables appear.
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
