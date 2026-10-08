// Small helpers for the back office page (admin.js): money, a DOM builder, price rows and notices.
// Plain browser module, no build step.

export const money = (cents) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

// Small DOM builder: text is always set via textContent, never parsed as HTML.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// rows: [{ label, value, free? }]
export function priceRows(rows, total, totalLabel = "Total") {
  const dl = el("dl", { class: "price-rows" });
  for (const row of rows) {
    dl.append(el("div", { class: `price-row${row.free ? " price-row--free" : ""}` }, el("dt", {}, row.label), el("dd", {}, row.value)));
  }
  if (total) dl.append(el("div", { class: "price-row price-row--total" }, el("dt", {}, totalLabel), el("dd", {}, total)));
  return dl;
}

export function notice(tone, title, body) {
  return el(
    "div",
    { class: `notice notice--${tone}`, role: tone === "warning" ? "alert" : "status" },
    title && el("span", { class: "notice__title" }, title),
    el("span", { class: "notice__body" }, body),
  );
}
