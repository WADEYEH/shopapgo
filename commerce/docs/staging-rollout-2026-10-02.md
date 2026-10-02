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

## Interactive 3DS and browser-close verification — completed

- Official challenge card `4012000300000088` displayed the simulated issuer window; entered official test OTP `1234` using keyboard input and submitted. No real SMS or card was used.
- D215 order `APGO-US-ZY9JX4J8YGG1` / intent `int_sgpvv5hnbhmu3lz5bnk` became paid at `2026-10-02T12:03:10.394Z`. Genuine event `evt_sgpvv5hnbhmu3o1a7zf_lz5bnk` returned HTTP 200. The first close attempt still allowed one confirmation-page query, so it was not used as proof of independent webhook settlement.
- A second D215 order `APGO-US-X40CXXT2TBMJ` / intent `int_sgpvv5hnbhmu3r1auvr` initially received a genuine risk rejection when reusing the challenge card. Event `evt_sgpvv5hnbhmu3roowdw_r1auvr` returned 200; D1 recorded `payment_attempt.risk_declined`, code `fraud_rejected`, message `The transaction is blocked because of risk concern.` The order remained pending. The provider risk control was not changed or bypassed.
- Retried the same order with the official always-success test card. Closed its tab while Processing was visible and before a confirmation screen. D1 independently became paid at `2026-10-02T12:08:15.107Z`; success event `evt_sgpvv5hnbhmu3t2oolf_r1auvr` returned 200.
- Wrangler tail was active before submission and stopped before reopening any confirmation page. It captured the POST webhook with response 200 and **zero** `GET /api/orders/APGO-US-X40CXXT2TBMJ` requests. The Airwallex event list also shows successful delivery. This isolates the real webhook paid transition from the browser Retrieve fallback.
- Both orders have one notification claim each. Customer confirmation email rows are `skipped` because email is not configured; MCF rows remain zero. Notification claims do not imply an email was sent.
- Proof: `review/staging-3ds-challenge.jpg`, `review/staging-3ds-webhook-events.jpg`, and sanitized `review/tmp/webhook-only-proof.json` (all ignored by Git). Raw tail output was summarized without headers or credentials and then removed.

## Email and fulfillment readiness

- Connected Resend account has one verified sending domain, `apgo.tw`, with verified DKIM and SPF records. Receiving is disabled on this Resend domain; the existing support mailbox is a separate service.
- Existing key names are `洗衣精訂閱制` and `Onboarding`. No key value was retrieved. Neither is identified as a dedicated shopapgo integration key. Staging has no `RESEND_API_KEY`, sender or reply-to configuration.
- Proposed sender: `APGO <orders@apgo.tw>`; reply-to: existing published support address `services@apgo.com.tw`. Sender confirmation and a dedicated sending-only key restricted to `apgo.tw` are needed before enabling email. Do not reuse another project's key or send test receipts to arbitrary customer addresses.
- Existing Worker templates cover confirmation and shipment, have HTML and text, and contain order details. Run `node scripts/preview-order-emails.mjs` to inspect both locally with fake data; it never sends email. Previews are in `review/tmp/order-emails/`.
- At the initial check, email delivery used an at-most-once D1 claim without provider IDs or delivery events. The implementation below replaces that limitation; real Resend configuration and acceptance testing remain outstanding.
- Amazon outbound connection and SKU-map secret names are configured on staging, but auto-submit remains off. A secret's existence alone does not prove valid authorization, valid SKUs, available inventory or current fulfillment pricing.
- The owner signed in to a new Chrome tab at `https://admin-staging.shopapgo.com/admin/`. The genuine sandbox order `APGO-US-X40CXXT2TBMJ` shows PAID, its earlier risk-decline code/reason/trace, MCF off and confirmation email skipped. Admin access and actual failure-history rendering are verified.
- Before any MCF enablement: determine the approved destination regions, shipping speeds/fees and stock-failure handling. Never send these fake sandbox orders to live Amazon fulfillment. A preview for one address is not a guarantee for all customer addresses.

## Read-only Amazon MCF verification — completed

- Staging Worker version: `035d9afa-baee-42df-a0af-69fd8448f232` (replaces UI-only version `7862ed4b-82dd-42ee-aec2-f0b008430e93`).
- Added **Check MCF connection** in the authenticated admin, with safely rendered results, disabled state while checking and retry after errors. It calls GET only and does not enable or submit fulfillment.
- The existing protected `/admin/api/mcf/check` now previews one unit of each store SKU, D204 and D215, instead of just the first mapping. Missing mappings fail the check. The response retains `preview` for compatibility and adds `previews`.
- The deployed UI returned **MCF CONNECTION VERIFIED** from the real Amazon outbound service. Both D204 and D215 are available for the sample Seattle address (400 Broad St, WA 98109); both returned delivery interval `2026-10-07T07:00:00Z` through `2026-10-08T06:59:59Z`. The admin displays this in the browser's local timezone. No shipping fee or customer promise was approved from this check.
- Automatic fulfillment remains off. Remote D1 after verification: 5 paid / 5 pending orders, **zero MCF records**, and 5 customer confirmation email rows marked skipped. No live Amazon order was created or cancelled.
- Validation: all 29 MCF backend tests and all 10 admin MCF browser tests passed; includes both product results, incomplete mappings, no write calls, retryable errors, safe error text, accessibility and mobile layout. These tests mock Amazon; the deployed admin check above used the real service. Staging Worker bundle dry run also passed.
- Screenshot: `review/staging-mcf-both-products.jpg` (ignored by Git).

Remaining payment acceptance work includes issuer insufficient-funds/authorization rejection and refund scenarios in the official Airwallex test guide, plus production-account readiness and approved sales rules. Sandbox success does not enable production checkout automatically.

## Existing Resend conventions and reliable email implementation

- Read-only account inspection: sending domain `apgo.tw` is verified (DKIM/SPF verified, sending enabled, receiving disabled). Open and click tracking are disabled. API key names remain `洗衣精訂閱制` and `Onboarding`; no new key was created or retrieved.
- Four recent messages sampled use `APGO 訂閱 <subscribe@apgo.tw>` and are delivered. The raw GET-email response for one sample explicitly has `reply_to: null`, so that message defaults replies to its From address. Resend receiving being disabled does not establish whether a separate mailbox service receives mail there.
- Existing enabled subscription endpoint: `https://sub.apgo.tw/api/resend/webhook`; events `email.bounced`, `email.complained`, `email.delivered`, `email.suppressed`. It belongs to the existing subscription integration and was left untouched.
- After reviewing the existing account and the standard approach, the owner approved storefront sender `APGO <orders@apgo.tw>` and reply-to `services@apgo.com.tw`. These are saved as staging configuration, independently of the existing subscription system. Sending stays disabled pending the dedicated key and controlled test recipient.
- Sender configuration deployed in staging Worker version `bee44be4-556d-4f34-800d-f809fceca372`; deploy output confirms both addresses and `CUSTOMER_EMAIL_ENABLED=false`. No actual message was sent.
- Added durable outbox, provider IDs, frozen payload/key retries, six-attempt limit, backoff/Retry-After, atomic leases, signed delivery event handling, bounce/complaint suppression, admin retry/audit and exact staging recipient allowlist. Retries stop after 23 hours; ambiguous legacy sends and accepted provider messages cannot be resent.
- Worker deployed to staging: `3348ff7e-5916-4a34-a77c-87fc2176b1c0`. Idempotent schema migration added three tables without altering orders. Staging cron runs every two minutes, but `CUSTOMER_EMAIL_ENABLED=false` and no sending key/sender/allowlist means it sends nothing. No historical skipped emails are automatically backfilled.
- Validation: 136 static/backend tests passed. 25 relevant admin browser scenarios passed (24 initially, then the remaining MCF assertion passed after updating its old acceptance-vs-delivery wording). Worker dry run and deployment passed. New signing verification also passes the published independent Svix test vector.
- Actual staging browser: the fake paid order `APGO-US-X40CXXT2TBMJ` displays skipped confirmation and a retry button. Clicked retry with sending disabled: it remained skipped and the admin shows `order.email.retry`; D1 audit result is skipped, outbox remains empty, and shipment/MCF records remain zero.
- Unsigned Resend POST returns 400 `invalid_signature` with staging noindex headers. The endpoint has no separate Basic gate, but its signing secret is not yet configured, so verified provider delivery has not been established.
- Proof: `review/staging-email-retry-disabled.jpg` (ignored by Git). No actual email, new Resend webhook, API key or production deployment was created during this step.
- Next: confirm a controlled test recipient, securely configure a dedicated sending-only key, create a separate signed storefront webhook, then enable staging email and verify actual confirmation/shipment delivery and rejection events. A mock test proves code behavior, not mailbox delivery. Initial paid-order email work still starts in `waitUntil`; a crash before enqueue requires operator reconciliation of the paid orders against email records.

## Controlled recipient and separate Resend webhook — configured

- The owner approved `wadeyeh@apgo.com.tw` for fake-order confirmation and shipment samples. Staging now has that exact `CUSTOMER_EMAIL_TEST_RECIPIENTS` allowlist; all other addresses remain blocked. Sending remains disabled.
- Created a separate enabled Resend webhook, ID `a7d7fe9a-ea2e-459d-ac89-594b9dcddf1a`, destination `https://staging.shopapgo.com/api/webhooks/resend`, subscribed to sent, delivered, delivery_delayed, bounced, complained, suppressed and failed. The existing subscription webhook was not changed.
- Its signing secret was saved directly into staging `RESEND_WEBHOOK_SECRET` using the masked Wrangler prompt. It is absent from source, documentation and command arguments.
- Staging version `84414b84-6442-47b8-9e9e-eddfc59ef275` deploy output confirms the allowlist and disabled email switch. Correctly signed synthetic `apgo.signature_probe` returned 200 / ignored; an unsigned request returned 400 / invalid_signature. This verifies deployed signature enforcement, not genuine Resend delivery. The unsupported probe type creates no email-event rows.
- Chrome has a prepared `shopapgo-staging` key form, Sending access restricted to `apgo.tw`. The owner must complete creation and save the resulting key to staging `RESEND_API_KEY`; no existing subscription key is reused. No actual sample was sent at this point.

## Real Resend samples and delivery callbacks — verified

- The owner created the dedicated sending key and saved it as encrypted staging `RESEND_API_KEY` through Cloudflare. Wrangler confirms the secret name only; no key value was read, printed or committed. Email is enabled on staging with the sole approved recipient allowlist. A staging-only note identifies every message as a test with no actual payment or shipment.
- Created a clearly identified email-only fixture `APGO-US-TEST20261002`, recipient `wadeyeh@apgo.com.tw`, fake address and placeholder USD 24.90 pricing. Its `paid` status is synthetic, its PaymentIntent is null, and audit action `staging.email.fixture` documents this. It is not evidence of payment settlement. The admin subsequently saved one simulated shipment with carrier `TEST ONLY - no parcel` and tracking `TEST-NO-SHIPMENT-20261002`; no carrier or Amazon operation was made.
- The first sends failed before reaching Resend because the deployed Workers runtime rejected the `redirect: error` policy. Fixed the transport to `redirect: manual` and treat all 3xx responses as permanent configuration errors without following them or forwarding credentials. Also trim outer clipboard whitespace from the sending key and classify transport failures without retaining raw exception text that could disclose it.
- Staging version `f61a1925-ed7d-4c54-b143-94fae76182d1` contains the fix. The existing two-minute cron recovered both pending emails with their original frozen payloads and idempotency keys. Confirmation: provider ID `01a0fce5-24fb-702b-b505-30e59c001ddb`, 3 attempts, delivered `2026-10-02T13:54:33.896Z`. Shipment: `01a0fce5-2e8c-76cb-8487-953f5625f9ba`, 2 attempts, delivered `2026-10-02T13:54:35.397Z` (21:54 Kuala Lumpur time).
- Resend retrieval independently confirms both messages are delivered, From `APGO <orders@apgo.tw>`, To the approved recipient, Reply-To `services@apgo.com.tw`, and both contain the test note. There is one provider message ID per kind. A confirmation retry after acceptance did not create another message.
- Genuine `email.sent` and `email.delivered` events for each ID reached the dedicated webhook successfully and are recorded in D1. The authenticated admin displays both as delivered; this means receiving-server acceptance, not proof that the owner opened them or that they landed outside spam.
- Remote D1 retains zero MCF records and one clearly simulated shipment record. Production, main and the existing subscription integration are unchanged. Bounce, complaint, suppression, malformed signature and duplicate-event behavior remain covered by tests, not claimed as newly observed real rejection scenarios.
- Validation: 138 static/backend tests passed, including valid authenticated request construction with clipboard whitespace and redirect rejection without credential forwarding. Updated the older MCF hygiene assertion to check the actual MCF auto-submit/sync gates; the independent email cron is permitted while both MCF gates stay off. Deployment passed; proof screenshot `review/staging-email-samples-delivered.png` is ignored by Git.
- Remaining before production: durable creation of the initial paid-order email job (currently starts in `waitUntil`), remaining payment/refund acceptance scenarios, approved pricing/shipping/tax/policies, production credentials and an explicitly approved real fulfillment test. This email fixture does not replace a future complete payment-to-email acceptance run.
