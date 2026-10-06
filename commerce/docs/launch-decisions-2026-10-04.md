# Owner launch decisions — October 4, 2026

This records the owner's answers in the shopapgo chat, using Asia/Kuala_Lumpur time. It is a decision record, not a production deployment or fulfillment authorization. Read it together with the chronological staging evidence in `staging-rollout-2026-10-02.md`; earlier placeholder/handoff snapshots are not current decisions.

## Confirmed

- Website orders will be paid through Airwallex and fulfilled using Amazon MCF from existing Amazon warehouse stock.
- Initial catalog: individual bottles only. Store product D204 maps to Amazon seller SKU `D204`, ASIN `B0HFWM2W54`; D215 maps to seller SKU `D215`, ASIN `B0HFW9CQ1R`. No cloth kit or virtual bundle is included in this decision.
- Website product prices should match Amazon. The October 4 authenticated Seller Central observation showed D204 USD 59.99 and D215 USD 29.99. These are the intended initial amounts; no ongoing Amazon price synchronization is implemented or approved by this answer. Existing test prices have not been changed by this documentation step.
- Sales region: owner said "US mainland." Exact checkout boundaries remain to be confirmed. Suggested initial definition: the 48 contiguous states and Washington, D.C.; exclusions/address eligibility must not be represented as already implemented.
- No previous MCF shipment/cost evidence is available from the team.
- Later on October 4, the owner clarified that website shipping/customer rules should align with the Amazon store's existing rules, including customer shipping fees. This supersedes the earlier recommendation to pass MCF costs through as the presumed direction. Do not treat the MCF cost preview as an approved customer fee. The exact customer policy still needs to be distinguished from FBA/Prime conditions and seller-fulfilled templates; see the shipping review addendum.
- No special packaging requirement for now. This does not establish what Amazon's actual packaging settings are; those can be checked read-only.
- Tax/collecting-entity decisions are deferred. Zero tax is not approved.
- The owner declined a real fulfillment test. Do not submit MCF orders, enable automatic fulfillment, or substitute the existing fake/sandbox orders for a real test. Genuine end-to-end fulfillment remains unverified; this answer is not authorization to waive that limitation for launch.
- Team order/exception alerts should go to `wadeyeh@apgo.com.tw`, including the previously pending production refund-failure recipient decision. Staging refund alerts already use this approved test mailbox; no production setting or new message was changed/sent here.

## Still open

- Customer shipping fees, available speeds and truthful delivery wording. Amazon determines its charge to APGO; APGO must decide the fee charged to the website customer. No approval of the existing free Standard / USD 9 Express placeholders.
- Actual MCF product-specific quote/eligibility across representative destination addresses, and any applicable surcharges. An available quantity or one address preview is not a universal delivery guarantee.
- October 4 research now includes both SKUs at Seattle/New York addresses and multi-unit previews: see [MCF shipping review](mcf-shipping-review-2026-10-04.md). The proposed customer fee model and region restrictions still require owner selection; research is not approval.
- Exact region/address restrictions, including treatment of Alaska, Hawaii, territories, PO boxes and military addresses; inspect eligibility before approving checkout rules.
- Customer-facing returns window, opened-product rules, return freight payer, refund/replacement authority and operational owner. Amazon's returns and reimbursement processes do not select the website's customer policy or perform Airwallex refunds.
- Inventory synchronization/stock-out handling and fulfillment-failure recovery. Team email selection does not determine who acts or whether an action is automatic.
- Production account/payment eligibility, credentials, database, domains, webhook configuration, admin access, approved policies and final integrated acceptance.

## Official references checked October 4

- Amazon pricing: https://supplychain.amazon.com/mcf/pricing — fulfillment charge factors and surcharges outside the 48 contiguous states and Washington, D.C.
- Amazon MCF FAQ: https://supplychain.amazon.com/mcf/faqs — merchant customer-service/refund responsibility and lost/damaged order reimbursement.
- Amazon returns: https://supplychain.amazon.com/blog/how-to-process-multi-channel-fulfillment-mcf-returns — returns to Amazon, condition inspection and merchant-managed customer refunds.

Do not treat an Amazon listing's FBA fee as the MCF fulfillment quote. A reimbursement claim is subject to eligibility and does not guarantee the customer's retail purchase amount is reimbursed to APGO.
