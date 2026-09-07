"use client";

import { amazonUrlFor } from "@/lib/us/config";
import { track } from "@/lib/us/analytics";

// Outbound Amazon CTA. Enabled only when the runtime config gates pass (see lib/us/config.js);
// otherwise it renders without an href, with aria-disabled, and swallows clicks.
export default function AmazonCta({ sku, placement, children, style, className = "us-btn" }) {
  const url = amazonUrlFor(sku);
  const disabled = !url;
  const onClick = (e) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    track("amazon_referral_click", { sku, placement });
  };
  return (
    <a
      data-amazon-cta
      data-sku={sku}
      data-placement={placement}
      href={url}
      target="_blank"
      rel="noopener"
      aria-disabled={disabled ? "true" : "false"}
      onClick={onClick}
      title="Opens Amazon.com"
      className={className}
      style={style}
    >
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}
