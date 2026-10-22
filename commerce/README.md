# APGO store Worker (`commerce/`)

The Cloudflare Worker `apgo-us-store` serves all of `www.shopapgo.com` (live since 2026-10-16): the Next.js static
export in `../out` as its assets (`run_worker_first`, so every path passes the Worker), plus `/api/*` (quotes,
checkout, PayPal and Airwallex, order status, contact form, webhooks, health), the back office on `admin.shopapgo.com`,
the 301s for moved URLs and hosts, and the cron jobs (Amazon MCF, emails, reconciliation, stock). Orders live in D1;
product photos owners upload live in R2.

- Technical reference: [docs/commerce.md](docs/commerce.md); PayPal: [docs/paypal.md](docs/paypal.md); Meta Pixel and
  Conversions API: [docs/meta-tracking.md](docs/meta-tracking.md); product pages: [docs/product-pages.md](docs/product-pages.md).
- Operations (deploy, rollback, restore, back-office procedures): `../docs/ops/runbook.md`. Production settings
  (names only): `../docs/ops/production-config.md`. Plan, decisions and open items: `../docs/commerce-plan.md`.

The code came from `WADEYEH/apgo-us-amazon-landing`, which is frozen (plan D37) and no longer deploys anywhere.

## One site, two packages

- Root: the Next.js site: the brand pages, the guides and every page shoppers see (D41): `/products`, the two product
  pages, `/cart`, `/checkout` (the order page is `/checkout?order=<id>`), the policy pages (`/privacy`, `/terms`,
  `/returns`, `/shipping`, showing `docs/legal/*.md`) and `/contact` (`app/(us)/(shop)`, components in
  `components/shop`). The back office page (`public/admin/`), the Meta Pixel script (`public/js/`) and the Apple Pay
  folder (`public/apple-pay/`) ship with the site's files; images and videos are in `public/us/assets/`.
- `commerce/`: this package: the Worker (`worker/`), D1 migrations (`migrations/`), tests and tools. The store code it
  shares with the pages (product data, checkout, address and contact rules, payment helpers) is in `lib/shop/*.mjs`:
  plain ES modules both import.
- `NEXT_PUBLIC_APGO_US_SINGLE_SITE=true` (`lib/us/routes.js`; set by `scripts/build-site.mjs` for the staging and
  production builds) turns on Shop, the cart count and the policy links in the site's header and footer, and the named
  product URLs `/products/atomic-colored-glaze` and `/products/atomic-glaze-coating` (D39). Old URLs
  (`/products/d204`, `/products/d215`, `/cart.html`, `/checkout.html`, `/assets/*`, `/v3`, …) answer 301
  (`worker/redirects.js`).

## Environments

| | Hosts | Notes |
| --- | --- | --- |
| production | `www.shopapgo.com` and the bare domain (whole-host routes); `store.shopapgo.com` and `shopapgo.com` answer 301 to the same page on www (`MOVED_HOSTS`; `/api/*` and `/.well-known/*` are not redirected); back office `admin.shopapgo.com` | Worker `apgo-us-store`, D1 `apgo-us-store`, Airwallex `prod`, PayPal live. Back office behind Cloudflare Access only (Google or an email code; members managed on the back office Members page, synced to a Zero Trust list); `ADMIN_LOGIN_*` and `ADMIN_TOKEN` exist but do not open `/admin` |
| staging | `staging.shopapgo.com` (Basic-auth gate), `admin-staging.shopapgo.com` (Cloudflare Access), `store-staging.shopapgo.com` (plays the old store host) | Own Worker and D1, Airwallex and PayPal sandbox, emails only to the approved test address, orders go to a fake Amazon (`worker/fake-amazon.js`, `MCF_FAKE`) so nothing ships, Amazon stock read for real (read-only), no Meta |
| local | `http://127.0.0.1:8799` | `wrangler dev`, local D1 |

Plain settings are in `wrangler.toml` per environment; secrets are set per environment with `wrangler secret put`
(names in `../docs/ops/production-config.md`). Values never go into the repo, chat or tickets; current secrets come
from the password vault.

What production runs (details in [docs/commerce.md](docs/commerce.md)): D204 $59.99 and D215 $29.99 (owners change
price, text and photos in the back office, D52), $7.99 flat standard shipping ("most orders arrive in 3–5 business
days", D31), sales tax $0 (D68); `PRICING_APPROVED` is set, so checkout is open. Payment methods (D70): PayPal (listed
first and selected; it also takes cards as a guest checkout) and Airwallex Pay; Card, Apple Pay and Google Pay stay
hidden (`CARD_PAYMENTS_ENABLED = "false"`) until the production Airwallex account takes cards (M18, C14). Paid orders go
to Amazon MCF automatically after a one-hour change window.

## Deploys

- CI (`.github/workflows/ci.yml`) runs on every PR and push: `test:static`, `build:site`, `verify:bundle` and the
  Playwright suite here, plus the site's own tests and build.
- Staging: `.github/workflows/deploy.yml` deploys automatically after CI passes on `main` (only the run for the newest
  commit of `main`): it builds the test site, applies new D1 migrations and deploys. `npm --prefix commerce run
  deploy:staging` does the same from a laptop (staging only).
- Production: only by hand from GitHub: Actions → Deploy → target `production`, confirm `deploy production`, approved by
  a Production reviewer (D65). The run tests again, builds the production site (`build-site.mjs --production`), records
  the D1 restore point, applies migrations and deploys. Never from a laptop.
- D1 changes are numbered files in `migrations/` that wrangler applies once each (D45: they only add tables, indexes and
  columns). `tests/schema.test.mjs` applies them to the production structure
  (`tests/fixtures/production-schema-2026-10-06.sql`) and checks that every existing column stays as it was.
- Rollback, restore and the daily encrypted backup (`.github/workflows/backup-database.yml`, D77): `../docs/ops/runbook.md`.

## Local review

Node 22.5+ is required to exercise the SQLite-backed tests. Node serves the browser
test assets on Windows and Linux.

From the repository root:

```sh
npm ci
npm run commerce:install
npm run commerce:test
npm --prefix commerce run build:site
npm run commerce:test:e2e
npm run commerce:verify
```

The browser tests run against the built site (`out/`: the Next.js export, built by `build:site`
with the test-site settings), so run `build:site` again after changing the site. The single-site
checks (`tests/brand-store.spec.mjs`) also need the Worker in front of it; the header of that file
has the commands (`wrangler dev`, then Playwright with `APGO_SITE_URL`). They are skipped in the
standalone suite.

Start the Worker with `npm run commerce:dev` (port 8799). Initialize only its
local D1 with `npm --prefix commerce run db:migrate:local`. Copy
`commerce/.dev.vars.example` to a git-ignored `commerce/.dev.vars` and supply
your sandbox credentials when testing actual sandbox payment. Without those
credentials, quote/cart work but a payment cannot be created.

The site's Shop and cart links are same-host paths, so preview them on the
Worker (`npm run commerce:dev` after `build:site`) rather than on `npm run dev`. Browser tests mock
Airwallex/Resend/Amazon and take no real payment or shipment.

## Notes

- All asset requests run through the Worker in every environment. Host split, admin authentication, redirects for
  moved URLs and the staging gate consequently apply to static pages as well as API requests.
- There is no express checkout on the cart page; Apple Pay and Google Pay sit on the checkout's payment step (where
  card payments are enabled).
