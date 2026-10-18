"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/shop/api";
import { MAX_QTY, addToCart, removeFromCart, setCartQty, useCartItems } from "@/lib/shop/cart";
import { fetchStoreConfig, isEstimate, money, onSale, outOfStock } from "@/lib/shop/store-config";
import { PRODUCTS } from "@/lib/shop/catalog";
import { liveOverrides } from "@/lib/shop/live-content";
import { productContent } from "@/lib/shop/product-content.mjs";
import { quoteItems, track } from "@/lib/us/analytics";
import { Estimate, Notice, PriceRows, ProductName, RoutineWord, productImage } from "@/components/shop/ui";

// The notice's title when the quote refuses the cart for something in it (the Worker's error codes).
const REFUSALS = { product_unavailable: "Not available right now", out_of_stock: "Out of stock", not_enough_stock: "Not enough in stock" };

// /cart (M3 §2): the lines and quantities come from the browser's cart, every price from the Worker's quote
// (POST /api/cart/quote) for exactly those lines. Shipping and tax are settled at checkout.

function LineItem({ line }) {
  return (
    <li className="line-item" data-line={line.id}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={productImage(line.id)} alt="" width="88" height="88" />
      <div className="line-item__body">
        <span className="line-item__title">
          <RoutineWord routine={line.routine} />
          <ProductName line={line} />
          <span className="sku-tag">{line.sku}</span>
        </span>
        <span className="line-item__meta">{line.size}</span>
        <div className="line-item__controls">
          <div className="qty" role="group" aria-label={`Quantity, ${line.name}`}>
            <button type="button" aria-label="Decrease quantity" disabled={line.qty <= 1} onClick={() => setCartQty(line.id, line.qty - 1)}>−</button>
            <output aria-live="polite">{line.qty}</output>
            <button type="button" aria-label="Increase quantity" disabled={line.qty >= MAX_QTY} onClick={() => setCartQty(line.id, line.qty + 1)}>+</button>
          </div>
          <button type="button" className="line-item__remove" onClick={() => removeFromCart(line.id)}>Remove</button>
        </div>
      </div>
      <span className="line-item__price">{money(line.lineCents)}</span>
    </li>
  );
}

export default function CartPage() {
  const items = useCartItems();
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const [estimate, setEstimate] = useState(false);
  const [config, setConfig] = useState(null);
  // Why the quote refused the cart, when it was something in it that cannot be bought now: an owner stopped selling it
  // (product_unavailable, commerce/worker/products.js), it is out of stock at Amazon (out_of_stock), or the cart asks for
  // more than Amazon can ship (not_enough_stock; commerce/worker/inventory.js).
  const [refusal, setRefusal] = useState("");
  const unavailable = refusal === "product_unavailable" || refusal === "out_of_stock";
  // not_enough_stock: { sku, available }, so the shopper can lower that line with one press.
  const [shortage, setShortage] = useState(null);
  const quoteSeq = useRef(0);
  const viewTracked = useRef(false);

  // /cart?add=d204 (links from elsewhere): add one, then drop the parameter so a refresh does not add it again.
  useEffect(() => {
    const url = new URL(window.location.href);
    const sku = url.searchParams.get("add");
    if (!sku) return;
    addToCart(sku.toLowerCase());
    url.searchParams.delete("add");
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    fetchStoreConfig().then((next) => {
      setConfig(next);
      setEstimate(isEstimate(next));
    }, () => {});
  }, []);

  // A new quote for every change to the lines; an older answer that arrives late is ignored.
  useEffect(() => {
    if (items === null) return;
    const seq = ++quoteSeq.current;
    if (items.length === 0) {
      setQuote(null);
      setError("");
      return;
    }
    api("/api/cart/quote", { method: "POST", body: { items } }).then(
      (next) => {
        if (seq !== quoteSeq.current) return;
        setError("");
        setRefusal("");
        setShortage(null);
        setQuote(next);
        if (!viewTracked.current) {
          viewTracked.current = true;
          track("view_cart", { value: next.subtotalCents / 100, currency: next.currency, items: quoteItems(next.lines) });
        }
      },
      (failure) => {
        if (seq !== quoteSeq.current) return;
        setError(failure.message);
        const code = REFUSALS[failure.code] ? failure.code : "";
        setRefusal(code);
        setShortage(code === "not_enough_stock" && failure.detail?.sku ? failure.detail : null);
        if (code) fetchStoreConfig().then(setConfig, () => {});
      },
    );
  }, [items]);

  const empty = items !== null && items.length === 0;
  const canCheckout = !empty && Boolean(quote) && !error;

  return (
    <main className="shop-main" id="main">
      <div className="shop-intro">
        <p className="eyebrow">Your cart</p>
        <h1 className="heading-guide-h1" data-cart-title="">{empty ? "Your cart is empty." : "Ready when you are."}</h1>
        <p className="body body--muted" data-cart-lede="">Shipping and tax are calculated at checkout.</p>
      </div>

      <div data-cart-message="" aria-live="polite">
        {error && <Notice tone="warning" title={REFUSALS[refusal] ?? "Cart unavailable"}>{error}</Notice>}
        {unavailable && (
          <ul className="line-items" data-cart-unavailable="">
            {(items ?? []).filter((item) => !onSale(config, item.sku)).map((item) => (
              <li key={item.sku} className="line-item" data-line={item.sku}>
                <div className="line-item__body">
                  <span className="line-item__title">{PRODUCTS[item.sku] ? productContent(item.sku, liveOverrides(config, item.sku)).name : item.sku}</span>
                  <span className="line-item__meta">{outOfStock(config, item.sku) ? "Out of stock" : "Not available right now"}</span>
                </div>
                <button type="button" className="line-item__remove" onClick={() => removeFromCart(item.sku)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        {shortage && (
          <ul className="line-items" data-cart-shortage="">
            <li className="line-item" data-line={shortage.sku}>
              <div className="line-item__body">
                <span className="line-item__title">{PRODUCTS[shortage.sku] ? productContent(shortage.sku, liveOverrides(config, shortage.sku)).name : shortage.sku}</span>
                <span className="line-item__meta">Only {shortage.available} can ship right now</span>
              </div>
              <button type="button" className="line-item__remove" onClick={() => setCartQty(shortage.sku, shortage.available)}>Change to {shortage.available}</button>
            </li>
          </ul>
        )}
      </div>

      <div className="shop-grid">
        <section className="stack" aria-labelledby="cart-items-title">
          <h2 className="visually-hidden" id="cart-items-title">Items in your cart</h2>
          <ul className="line-items" data-cart-lines="">
            {!empty && quote?.lines.map((line) => <LineItem key={line.id} line={line} />)}
          </ul>
          <div className="cart-empty" data-cart-empty="" hidden={!empty}>
            <a className="btn btn--sm" href="/products">Choose Dry or Wet <span aria-hidden="true">→</span></a>
          </div>
        </section>

        <aside className="summary" aria-labelledby="summary-title">
          <h2 className="label label--xs" id="summary-title">Order summary</h2>
          <div data-cart-summary="">
            {empty && <PriceRows rows={[{ label: "Subtotal", value: money(0) }]} />}
            {!empty && quote && (
              <PriceRows
                rows={[
                  { label: "Subtotal", value: money(quote.subtotalCents) },
                  { label: "Shipping", value: <Estimate estimate={estimate}>{quote.shippingCents ? money(quote.shippingCents) : "Free"}</Estimate>, free: !quote.shippingCents },
                  { label: "Tax", value: <Estimate estimate={estimate}>Calculated at checkout</Estimate> },
                ]}
                total={money(quote.subtotalCents + quote.shippingCents)}
                totalLabel="Estimated total"
              />
            )}
          </div>
          <a
            className="btn btn--full"
            href="/checkout"
            data-checkout-button=""
            aria-disabled={canCheckout ? undefined : "true"}
            tabIndex={canCheckout ? undefined : -1}
            onClick={(event) => {
              if (!canCheckout) event.preventDefault();
            }}
          >
            Checkout <span aria-hidden="true">→</span>
          </a>
          <p className="label summary__note">Secure checkout · Payments by Airwallex</p>
        </aside>
      </div>
    </main>
  );
}
