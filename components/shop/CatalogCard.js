"use client";

import { addToCart, useCartQty } from "@/lib/shop/cart";
import { PRODUCTS, SEO, productPath } from "@/lib/shop/catalog";
import { priceCents, priceText, useStoreConfig } from "@/lib/shop/store-config";
import { useState } from "react";

const word = (p) => (p.routine === "dry" ? "DRY" : "WET");

// One product on the /products overview (D39): price from the Worker, Add to cart, a link to the product page. A product
// the Worker no longer sells (missing from its config) is not shown.
export default function CatalogCard({ sku }) {
  const p = PRODUCTS[sku];
  const { status, config } = useStoreConfig();
  const inCart = useCartQty(sku);
  const [added, setAdded] = useState(false);
  if (status === "ready" && !config.products?.[sku]) return null;

  const cents = priceCents(config, sku);
  const add = () => {
    addToCart(sku, 1, {
      placement: "shop",
      currency: config?.currency || "USD",
      ...(cents !== null ? { value: cents / 100 } : {}),
    });
    setAdded(true);
  };

  return (
    <li className="catalog-card" data-shop-card={sku}>
      <a className="catalog-card__media" href={productPath(sku)} tabIndex={-1} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={SEO[sku].image} alt="" width="1400" height="1400" />
      </a>
      <div className="catalog-card__body">
        <p className="catalog-card__id">
          <span className={`routine routine--md routine--${p.routine}`}>{word(p)}</span>
          <span className="label">{p.when}</span>
          <span className="sku-tag">{p.sku}</span>
        </p>
        <h2 className="catalog-card__name"><a href={productPath(sku)}>{p.name}</a></h2>
        <p className="body body--sm">{p.promise}</p>
        <p className="label">{p.size} · {p.oz} · Lasts up to {p.lasts}</p>
        <div className="catalog-card__buy">
          <span className="catalog-card__price" data-price-sku={sku}>{priceText(cents, config?.currency)}</span>
          <button className="btn btn--md" type="button" data-add-to-cart={sku} data-placement="shop" onClick={add}>
            Add to cart <span aria-hidden="true">→</span>
          </button>
        </div>
        <p className="catalog-card__added" data-shop-added={sku} aria-live="polite">
          {added && <><span>Added · {inCart} in cart</span> <a href="/cart">View cart →</a></>}
        </p>
        <a className="btn btn--text" href={productPath(sku)}>Product details <span className="glyph" aria-hidden="true">→</span></a>
      </div>
    </li>
  );
}
