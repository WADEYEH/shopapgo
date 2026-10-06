"use client";

import { productPathFor } from "@/lib/us/routes";
import { track } from "@/lib/us/analytics";

// Same-host store CTA. Navigates to the product page; Add to cart lives there.
// Click events keep the existing GTM/Meta name amazon_referral_click so the
// container contract is unchanged.
export default function ProductCta({ sku, placement, children, style, className = "us-btn" }) {
  const href = productPathFor(sku);
  const disabled = !href;
  const onClick = (e) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    track("amazon_referral_click", { sku, placement });
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
