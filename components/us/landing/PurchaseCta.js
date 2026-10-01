"use client";

import { addToCartUrl } from "@/lib/us/store";
import { track } from "@/lib/us/analytics";
import AmazonCta from "./AmazonCta";

export default function PurchaseCta({ sku, placement, children, style, className = "us-btn" }) {
  const href = addToCartUrl(sku);
  if (!href) return <AmazonCta {...{ sku, placement, style, className }}>{children}</AmazonCta>;
  return (
    <div className="us-purchase-actions" style={{ marginLeft: style?.marginLeft, width: style?.width }}>
      <a href={href} data-store-add={sku} className={className} style={style}
        onClick={() => track("store_cart_entry", { sku, placement })}>
        Add to cart <span aria-hidden="true">→</span>
      </a>
      <AmazonCta sku={sku} placement={placement} className="us-store-amazon-option">Or shop on Amazon</AmazonCta>
    </div>
  );
}
