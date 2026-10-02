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

## Sandbox webhook activation history

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

At activation time, checkout verification was blocked by the separate staging login. The owner subsequently signed in manually; that blocker is resolved. Neither production checkout nor a real shipment was enabled.

Resend and automatic Amazon MCF are not activated in this rollout. The existing staging login credentials remain in the owner's password vault; they have not been changed or recovered from Cloudflare.

The 29 backend tests passed on October 2, including signed payment settlement, duplicate deliveries, invalid signatures, late deliveries and amount mismatches. These are local mocked-provider tests, not proof of real Airwallex webhook delivery.

## Failed-attempt reporting deployed; subscription expansion saved

- Worker version: `2056367d-c74b-4020-9aaa-1248aa9441b9`.
- Added `order_payment_failures` using the idempotent schema migration; existing 2 paid / 5 pending orders are retained. The failure table is empty and MCF still has zero records.
- Authenticated admin order details now show failed-attempt history. Public messages are predefined and the cart is retained until server-confirmed payment.
- Verification: 126 unit/backend tests passed; browser suite 125 passed / 6 integration tests skipped for missing configuration; staging bundle dry run passed.
- Deployed gates remain intact: unauthenticated store/admin requests 401 with noindex; unsigned webhook 400.
- The owner completed password reauthentication and saved the edit. Airwallex displayed "Webhook subscription updated" and the saved details contain the original success/cancellation events plus all six failed-attempt events. The list now shows **8 events** on the same Sandbox Business account, destination and API version.
- The displayed signing secret was compared with the previously configured value without logging it; it is unchanged. No secret update or Worker redeployment was needed.
- Genuine sandbox checkout and provider delivery were subsequently verified as recorded below. Local screenshots and mocked-provider tests alone do not substitute for that verification.

## Sandbox checkout scenarios

The owner signed in to `https://staging.shopapgo.com` manually in Chrome. Existing credentials were retained. Proposed reset files were removed without applying a reset or updating remote secrets. Staging and Airwallex logins are separate.

The test-card scenarios were checked against the [current official Airwallex integration guide](https://www.airwallex.com/docs/payments/test-and-go-live/test-card-numbers). The scripts' old `4000000000000002` came from the Shopify-plugin test-card list; the direct Elements/Native API scenarios now use the appropriate cards:

- Success: `4035501000000008`, any amount.
- Risk decline: `4646464646464644`, any amount; expect `payment_attempt.risk_declined`.
- Elements authentication failure: `4012000300000013`; expect `payment_attempt.authentication_failed`.

For a failed attempt, verify the original order stays pending, a corresponding attempt is recorded in the admin, and the cart is retained. Then retry with the success card and verify the order becomes paid with its earlier failure history retained. Verify genuine event delivery returns 200 and a redelivery does not repeat paid-order side effects. Changing store prices to a special trigger amount is unnecessary for these scenarios.

## Genuine browser checkout and webhook verification — completed

Tested the deployed staging site using real Airwallex demo Split Card Elements, fake customer/address data and official test cards. One D204 item totaled USD 29.90. Shipping and tax remain explicitly unapproved placeholders.

- Order: `APGO-US-MKNGJ2GAAZAW`; PaymentIntent: `int_sgpvgkz2ghmu391qfj0`.
- Authentication failure at 11:50:48 UTC: checkout displayed safe retry guidance, retained cart quantity 1 and re-enabled Place order. D1 retained `pending` and recorded attempt `att_sgpvgkz2ghmu3brtolh_91qfj0`, code `authentication_failed`, message `The user failed authentication.`
- Genuine failure event: `evt_sgpvgkz2ghmu3bs26xb_91qfj0`; received at 11:50:49.509 UTC. Airwallex lists delivery as successful, and the matching failure and event rows exist in D1.
- Replaced the card with the official success card in the same checkout, without reloading. The same order and PaymentIntent became `paid` at 11:51:57.615 UTC. Checkout displayed Order confirmed / Payment received and cart quantity 0. The previous failure history remained.
- Genuine success event: `evt_sgpvv5hnbhmu3cwrw7x_91qfj0`; Airwallex details show this subscription destination and HTTP 200.
- Re-triggered that success event in the Airwallex sandbox. After refreshing, Airwallex shows re-triggered = Yes and HTTP 200. D1 still has one success event, one notification claim and one failure record for the order; paid/updated timestamps are unchanged.
- The checkout Retrieve fallback was active during confirmation. This run proves genuine delivery and safe same-order retry; it does not isolate which of webhook versus confirmation polling performed the first paid transition. A browser-close / webhook-only settlement scenario and interactive 3DS challenge remain separate acceptance checks.
- No Worker changes or deployment were required. Resend and automatic MCF remain disabled; MCF records remain zero. No real funds, production checkout or shipments were involved.

Local proof images (ignored by Git): `review/staging-authentication-failed.jpg`, `review/staging-retry-paid.jpg`, `review/staging-webhook-delivery.jpg`. Failure persistence was verified in remote D1; the authenticated admin UI was not re-tested with this real order in this run.
