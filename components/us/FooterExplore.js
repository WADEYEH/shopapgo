"use client";

import Link from "next/link";
import { useState } from "react";

// The footer's Explore list (every guide). Phones and small tablets (≤ 900 px, us.css) show Home and All guides with a
// button for the rest, so the footer stays short; wider screens always show the whole list.
const ALWAYS = 2;

export default function FooterExplore({ items }) {
  const [open, setOpen] = useState(false);
  const more = items.length - ALWAYS;
  return (
    <nav aria-label="Explore" className={open ? "us-footer-explore is-open" : "us-footer-explore"}>
      <h2>Explore</h2>
      <ul id="us-footer-explore-list">{items.map((item) => <li key={item.href}><Link href={item.href}>{item.label}</Link></li>)}</ul>
      {more > 0 && (
        <button type="button" className="us-footer-more" aria-expanded={open} aria-controls="us-footer-explore-list" onClick={() => setOpen((value) => !value)}>
          {open ? "Fewer guides" : `More guides (${more})`} <span aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
      )}
    </nav>
  );
}
