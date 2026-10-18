"use client";

import { addToCart, useCartQty } from "@/lib/shop/cart";
import { productPath } from "@/lib/shop/catalog";
import { contentMark, imageMark, useLiveCatalog } from "@/lib/shop/live-content";
import { onSale, outOfStock, priceCents, priceText } from "@/lib/shop/store-config";
import { useState } from "react";

const word = (p) => (p.routine === "dry" ? "DRY" : "WET");

// One product on the /products overview (D39): price from the Worker, Add to cart, a link to the product page. A product
// the Worker no longer sells (missing from its config) is not shown; one an owner stopped selling says it is not
// available, and one out of stock at Amazon says Out of stock, instead of offering Add to cart. Its name, words and photo are the ones an owner set (lib/shop/live-content.js;
// the marked elements are filled by the Worker in the page it sends).
export default function CatalogCard({ sku }) {
  const { status, config, content } = useLiveCatalog();
  const p = content[sku];
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
        <img src={p.image} alt="" width="1400" height="1400" {...imageMark(sku, 0)} />
      </a>
      <div className="catalog-card__body">
        <p className="catalog-card__id">
          <span className={`routine routine--md routine--${p.routine}`}>{word(p)}</span>
          <span className="label" {...contentMark(sku, "when")}>{p.when}</span>
          <span className="sku-tag">{p.sku}</span>
        </p>
        <h2 className="catalog-card__name"><a href={productPath(sku)} {...contentMark(sku, "name")}>{p.name}</a></h2>
        <p className="body body--sm" {...contentMark(sku, "promise")}>{p.promise}</p>
        <p className="label">{p.size} · {p.oz} · Lasts up to <span {...contentMark(sku, "lasts")}>{p.lasts}</span></p>
        <div className="catalog-card__buy">
          <span className="catalog-card__price" data-price-sku={sku}>{priceText(cents, config?.currency)}</span>
          {onSale(config, sku) ? (
            <button className="btn btn--md" type="button" data-add-to-cart={sku} data-placement="shop" onClick={add}>
              Add to cart <span aria-hidden="true">→</span>
            </button>
          ) : (
            <span className="label" data-unavailable={sku}>{outOfStock(config, sku) ? "Out of stock" : "Not available right now"}</span>
          )}
        </div>
        <p className="catalog-card__added" data-shop-added={sku} aria-live="polite">
          {added && <><span>Added · {inCart} in cart</span> <a href="/cart">View cart →</a></>}
        </p>
        <a className="btn btn--text" href={productPath(sku)}>Product details <span className="glyph" aria-hidden="true">→</span></a>
      </div>
    </li>
  );
}
