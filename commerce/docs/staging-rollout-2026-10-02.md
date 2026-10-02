# shopapgo commerce staging rollout — 2026-10-02

## Source and deployment

- Repository: WADEYEH/shopapgo, branch `codex/us-commerce`.
- Application commit: `b3ebc54` (October 1 commerce integration).
- Worker: `apgo-us-store-staging`.
- Deployed version: `00fba81b-2ffd-44bf-aeac-b2a0fe37d6d3`.
- Previous version: `ecbd17c7-d1ec-4a68-a341-ba1921a55acb`.
- Store: https://staging.shopapgo.com.
- Admin: https://admin-staging.shopapgo.com/admin/.
- Existing D1 schema was reapplied using only `CREATE IF NOT EXISTS`; existing order rows were retained.
- Airwallex remains sandbox (`demo`); cart express checkout is disabled.
- No production deployment or production checkout enablement was performed.

## Checks completed

- Staging bundle dry run succeeded.
- Unauthenticated storefront, cart, JavaScript asset and public config requests return 401 with `noindex, nofollow, noarchive`.
- Store host `/admin` and admin host `/` return 404.
- `/robots.txt` is available and disallows crawling.
- Unsigned `POST /api/webhooks/airwallex` returns 400 `invalid_signature`.
- Production `/us` still returns 200.
- D1 still contains 2 paid and 5 pending orders, zero webhook events and zero MCF records after deployment.

## Sandbox webhook activated; actual payment delivery verification pending

The owner completed Airwallex password reauthentication. The subscription is now created and its signing secret is configured on the staging Worker:

- Name: `APGO staging payment status`.
- Destination: `https://staging.shopapgo.com/api/webhooks/airwallex`.
- Account: Sandbox Business (single selected account).
- Events: `payment_intent.succeeded`, `payment_intent.cancelled`.
- API version: account's current `2026-08-21`.
- Webhook ID: `wh_LcAsYlGhxOCm5gp3iLFlryaR-McL2DuT`.

`AIRWALLEX_WEBHOOK_SECRET` was stored in the staging Worker's Cloudflare Secrets. The temporary local transfer file was removed; no secret belongs in this document or Git.

An isolated, locally signed `apgo.integration.signature_probe` event returned 200 (`duplicate:false`); repeating it returned 200 (`duplicate:true`); a bad signature returned 400 (`invalid_signature`). This probe contains no PaymentIntent or customer data and cannot settle an order. It verifies the deployed signing-secret configuration, not actual Airwallex delivery.

Verify with an actual sandbox event: a pending order becomes paid without visiting `GET /api/orders/:id`, a redelivery is acknowledged without repeating paid-order side effects, and an invalid signature remains rejected. A locally self-signed request or a dashboard synthetic event alone does not prove real Airwallex delivery.

The next actual checkout test requires the existing staging login. It was not available to this session, and Chrome could not open the protected checkout. Airwallex's Events list contained no delivered events yet after registration. Neither production checkout nor a real shipment was enabled.

Resend and automatic Amazon MCF are not activated in this rollout. The existing staging login credentials remain in the owner's password vault; they have not been changed or recovered from Cloudflare.

The 29 backend tests passed on October 2, including signed payment settlement, duplicate deliveries, invalid signatures, late deliveries and amount mismatches. These are local mocked-provider tests, not proof of real Airwallex webhook delivery.
