// The back office speaks Chinese or English (D49): Chinese unless the person picked English, remembered in this browser.
// Every word on the pages comes from ./strings.js through t(); data (names, addresses, order numbers, what customers
// wrote) is shown as it is. Messages the Worker sends with an error are English and shown as they are when there is no
// translation for their code (./api.js).
import { STRINGS } from "./strings.js";

export const LANGS = ["zh", "en"];
// Only the language choice is kept in the browser; nothing about the person or their sign-in.
const LANG_KEY = "apgo_admin_lang";
const listeners = new Set();

function stored() {
  try {
    const value = localStorage.getItem(LANG_KEY);
    return LANGS.includes(value) ? value : "zh";
  } catch {
    return "zh";
  }
}

let current = stored();

export const lang = () => current;

export function setLang(next) {
  if (!LANGS.includes(next) || next === current) return;
  current = next;
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    // private window: the choice lasts until the page is closed
  }
  document.documentElement.lang = next === "zh" ? "zh-Hans" : "en";
  for (const listener of listeners) listener(next);
}

export const onLangChange = (listener) => listeners.add(listener);

// t("nav.orders"), t("orders.shown", { n: 3, total: 9 }). An entry is { zh, en }; each is a string with {name} holes or a
// function of the values (for plurals). A missing key shows the key, so a gap is visible rather than blank.
export function t(key, values = {}) {
  const entry = STRINGS[key];
  if (!entry) return key;
  const text = entry[current] ?? entry.en;
  if (typeof text === "function") return text(values);
  return text.replace(/\{(\w+)\}/g, (_, name) => (values[name] ?? "").toString());
}

// The static page's words: elements marked data-t (text), data-t-label (aria-label) or data-t-placeholder.
export function applyStatic(root = document) {
  document.documentElement.lang = current === "zh" ? "zh-Hans" : "en";
  for (const node of root.querySelectorAll("[data-t]")) node.textContent = t(node.dataset.t);
  for (const node of root.querySelectorAll("[data-t-label]")) node.setAttribute("aria-label", t(node.dataset.tLabel));
  for (const node of root.querySelectorAll("[data-t-placeholder]")) node.setAttribute("placeholder", t(node.dataset.tPlaceholder));
}

const locale = () => (current === "zh" ? "zh-CN" : "en-US");

// Dates in the viewer's own time zone.
export function formatDate(iso, { time = true } = {}) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale(), time ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(date);
}

// "Today 10:42", "Yesterday 21:15", or the date.
export function when(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const time = new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  const day = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(date)) / 86_400_000);
  if (diff === 0) return t("time.today", { time });
  if (diff === 1) return t("time.yesterday", { time });
  return new Intl.DateTimeFormat(locale(), { month: "short", day: "numeric" }).format(date);
}

export const longDate = (date = new Date()) =>
  new Intl.DateTimeFormat(locale(), { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(date);
