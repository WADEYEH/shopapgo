// Small helpers for the back office pages: money, a DOM builder, icons, badges, price rows and notices.
// Plain browser module, no build step. Text is always set as text, never parsed as HTML.
import { t } from "./i18n.js";

export const money = (cents, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents ?? 0) / 100);

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// Line icons (24 × 24, stroke): [element, attributes] lists.
const ICONS = {
  dashboard: [["rect", { x: 3, y: 3, width: 7, height: 9, rx: 1 }], ["rect", { x: 14, y: 3, width: 7, height: 5, rx: 1 }], ["rect", { x: 14, y: 12, width: 7, height: 9, rx: 1 }], ["rect", { x: 3, y: 16, width: 7, height: 5, rx: 1 }]],
  orders: [["path", { d: "M6 3h12v18l-3-2-3 2-3-2-3 2z" }], ["path", { d: "M9 8h6M9 12h6" }]],
  checkouts: [["circle", { cx: 9, cy: 20, r: 1.5 }], ["circle", { cx: 18, cy: 20, r: 1.5 }], ["path", { d: "M2 3h3l3 12h11l2-8H7" }]],
  products: [["path", { d: "M3 7l9-4 9 4-9 4z" }], ["path", { d: "M3 7v10l9 4 9-4V7" }], ["path", { d: "M12 11v10" }]],
  customers: [["circle", { cx: 9, cy: 8, r: 3.5 }], ["path", { d: "M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" }], ["path", { d: "M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.6 3.5 5.2" }]],
  messages: [["path", { d: "M4 5h16v11H8l-4 4z" }], ["path", { d: "M8 9h8M8 12h5" }]],
  reports: [["path", { d: "M4 20V10M10 20V4M16 20v-7M22 20H2" }]],
  activity: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "M12 7v5l3 2" }]],
  members: [["path", { d: "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" }]],
  search: [["circle", { cx: 11, cy: 11, r: 7 }], ["path", { d: "M20 20l-4-4" }]],
  back: [["path", { d: "M15 6l-6 6 6 6" }]],
  next: [["path", { d: "M9 6l6 6-6 6" }]],
  check: [["path", { d: "M5 12l5 5 9-10" }]],
  menu: [["path", { d: "M4 7h16M4 12h16M4 17h16" }]],
  close: [["path", { d: "M6 6l12 12M18 6L6 18" }]],
  external: [["path", { d: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" }]],
  info: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "M12 11v6M12 7.5v.5" }]],
  download: [["path", { d: "M12 4v11M7 10l5 5 5-5M5 20h14" }]],
};
const SVG = "http://www.w3.org/2000/svg";

export function icon(name, size = 20) {
  const svg = document.createElementNS(SVG, "svg");
  for (const [key, value] of Object.entries({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) svg.setAttribute(key, String(value));
  for (const [tag, attrs] of ICONS[name] ?? []) {
    const part = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs)) part.setAttribute(key, String(value));
    svg.append(part);
  }
  return svg;
}

// tone: ok (green) | warn (orange) | bad (pink) | neutral (grey) | muted
export const badge = (tone, text, attrs = {}) => el("span", { class: `badge badge--${tone}`, ...attrs }, text);

// rows: [{ label, value }]
export function priceRows(rows, total, totalLabel = t("money.total")) {
  const dl = el("dl", { class: "price-rows" });
  for (const row of rows) dl.append(el("div", { class: `price-row${row.class ? ` ${row.class}` : ""}` }, el("dt", {}, row.label), el("dd", {}, row.value)));
  if (total) dl.append(el("div", { class: "price-row price-row--total" }, el("dt", {}, totalLabel), el("dd", {}, total)));
  return dl;
}

// tone: success | warning | info
export function notice(tone, title, body) {
  return el(
    "div",
    { class: `notice notice--${tone}`, role: tone === "warning" ? "alert" : "status" },
    title && el("span", { class: "notice__title" }, title),
    body && el("span", { class: "notice__body" }, body),
  );
}

export const card = (attrs, ...children) => el("section", { ...attrs, class: `card${attrs.class ? ` ${attrs.class}` : ""}` }, ...children);
export const cardHead = (title, ...extra) => el("div", { class: "card__head" }, el("h2", { class: "card__title" }, title), ...extra);

// A labelled form control: field("id", "Label", control, "hint").
export const field = (id, label, control, hint) =>
  el("div", { class: "field" }, el("label", { class: "field__label", for: id }, label), control, hint && el("span", { class: "field__hint" }, hint));

// The product's routine tile (DRY pink, WET green).
export const routineTile = (routine, size = "md") => el("span", { class: `tile tile--${size} tile--${routine === "wet" ? "wet" : "dry"}`, "aria-hidden": "true" }, routine === "wet" ? "WET" : "DRY");

export const usPhone = (value) => (/^\+1\d{10}$/.test(value ?? "") ? `(${value.slice(2, 5)}) ${value.slice(5, 8)}-${value.slice(8)}` : value || "—");
