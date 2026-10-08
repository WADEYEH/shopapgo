// Checkout rules and helpers, shared with the Worker and tested on their own: field rules (address-rules.js, the
// Worker checks the same way), the in-progress form kept for a refresh (checkout-draft.js), and the options each
// payment method takes (wallets.js: Apple Pay / Google Pay, airwallex-pay.js, paypal.js). None of them touch the page.
//
// The files still live in commerce/prototype/js/commerce/ next to the Worker's copy of the rules; they move into this
// folder with the cleanup (D41, docs/commerce-plan.md §6, step 7). Everything imports this file, so nothing else
// changes then.
export * from "../../commerce/prototype/js/commerce/address-rules.js";
export * from "../../commerce/prototype/js/commerce/checkout-draft.js";
export * from "../../commerce/prototype/js/commerce/wallets.js";
export * from "../../commerce/prototype/js/commerce/paypal.js";
export * from "../../commerce/prototype/js/commerce/airwallex-pay.js";
