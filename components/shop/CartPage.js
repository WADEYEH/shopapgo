"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/shop/api";
import { MAX_QTY, addToCart, removeFromCart, setCartQty, useCartItems } from "@/lib/shop/cart";
import { fetchStoreConfig, isEstimate, money } from "@/lib/shop/store-config";
import { track } from "@/lib/us/analytics";
import { Estimate, Notice, PriceRows, ProductName, RoutineWord, productImage } from "@/components/shop/ui";

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
    fetchStoreConfig().then((config) => setEstimate(isEstimate(config)), () => {});
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
        setQuote(next);
        if (!viewTracked.current) {
          viewTracked.current = true;
          track("view_cart", { value: next.subtotalCents / 100, currency: next.currency, items: items.length });
        }
      },
      (failure) => {
        if (seq !== quoteSeq.current) return;
        setError(failure.message);
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
        {error && <Notice tone="warning" title="Cart unavailable">{error}</Notice>}
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
