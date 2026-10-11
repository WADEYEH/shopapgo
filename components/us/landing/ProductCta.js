"use client";

import { productPathFor } from "@/lib/us/routes";
import { track } from "@/lib/us/analytics";

// Same-host store CTA. Navigates to the product page; Add to cart lives there.
// A click is GA4's select_item (which button led to which product); there is no Amazon event any more (M10 §1).
export default function ProductCta({ sku, placement, children, style, className = "us-btn" }) {
  const href = productPathFor(sku);
  const disabled = !href;
  const onClick = (e) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    track("select_item", { sku, placement, item_list_name: placement });
  };
  return (
    <a
      data-product-cta
      data-sku={sku}
      data-placement={placement}
      href={href}
      aria-disabled={disabled ? "true" : "false"}
      onClick={onClick}
      className={className}
      style={style}
    >
      {children}
    </a>
  );
}
