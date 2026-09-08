"use client";

import { useId, useState } from "react";

// "On this page" in-page table of contents. items: [{ href: "#id", label }]
export default function OnThisPage({ items, variant = "article" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <nav
      aria-label="On this page"
      className={`us-toc us-toc-${variant}`}
    >
      <span className="us-toc-title">
        On this page
      </span>
      <button className="us-toc-toggle" type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
        On this page <span aria-hidden="true" className={open ? "us-chevron is-open" : "us-chevron"}>⌄</span>
      </button>
      <ol id={id} className={open ? "is-open" : undefined}>
        {items.map((it) => (
          <li key={it.href}>
            <a href={it.href} onClick={() => setOpen(false)}>
              {it.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
