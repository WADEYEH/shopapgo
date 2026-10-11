// The frame around every back office page (D50): the side navigation (a slide-in menu on phones), the language switch
// (D49), who is signed in, their team-email switch (I12) and the staging tag.
import { lang, setLang, t } from "./i18n.js";
import { el, icon, notice } from "./ui.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// soon: in a later PR (3-10); owner: owners only.
const NAV = [
  { key: "dashboard", href: "#/", icon: "dashboard" },
  { key: "orders", href: "#/orders", icon: "orders", badge: true },
  { key: "checkouts", href: "#/checkouts", icon: "checkouts" },
  { key: "products", href: "#/products", icon: "products" },
  { key: "customers", href: "#/customers", icon: "customers", soon: true },
  { key: "messages", href: "#/messages", icon: "messages" },
  { key: "reports", href: "#/reports", icon: "reports", soon: true },
  { key: "activity", href: "#/activity", icon: "activity" },
  { key: "members", href: "#/members", icon: "members", owner: true },
];
const ROUTE_NAV = { order: "orders", product: "products" };

const state = { active: "dashboard", me: null, ordersBadge: 0 };

export function renderNav(active = state.active) {
  state.active = active;
  const current = ROUTE_NAV[active] ?? active;
  $("[data-admin-nav-links]").replaceChildren(
    ...NAV.filter((item) => !item.owner || state.me?.role === "owner").map((item) =>
      el("li", {},
        el("a", { class: "nav-link", href: item.href, "data-nav": item.key, "aria-current": item.key === current ? "page" : null },
          icon(item.icon),
          el("span", { class: "nav-link__label" }, t(`nav.${item.key}`)),
          item.badge && state.ordersBadge > 0 && el("span", { class: "nav-link__count", "data-nav-count": true, title: t("nav.ordersBadge") }, String(state.ordersBadge)),
          item.soon && el("span", { class: "nav-link__soon" }, t("nav.soon")),
        ))),
  );
  for (const button of $$("[data-lang]")) button.setAttribute("aria-pressed", String(button.dataset.lang === lang()));
  $("[data-admin-lang-toggle]").textContent = lang() === "zh" ? "EN" : "中文";
  $("[data-admin-lang-toggle]").setAttribute("aria-label", t("nav.switchLanguage"));
  renderWho();
}

// The orders that need someone (review, problems, disputes), next to Orders.
export function setOrdersBadge(count) {
  state.ordersBadge = Number(count) || 0;
  renderNav();
}

function renderWho() {
  const who = $("[data-admin-whoami]");
  if (!state.me) return;
  who.replaceChildren(el("strong", {}, state.me.email ?? state.me.id), el("span", {}, t(`role.${state.me.role}`)));
  who.hidden = false;
  renderTeamAlerts();
}

// ---------- Team emails (I12): each person turns their own on or off; at least one person keeps them ----------

function renderTeamAlerts() {
  const button = $("[data-admin-team-alerts]");
  const on = state.teamAlerts;
  if (on === null || on === undefined) return; // a sign-in that is not on the member list has no setting
  button.textContent = t(on ? "nav.teamEmailsOn" : "nav.teamEmailsOff");
  button.setAttribute("aria-pressed", String(on));
  button.title = t(on ? "nav.teamEmailsOnTitle" : "nav.teamEmailsOffTitle");
  button.hidden = false;
}

function closeMenu() {
  const nav = $("[data-admin-nav]");
  nav.removeAttribute("data-open");
  $("[data-admin-scrim]").hidden = true;
  $("[data-admin-menu]").setAttribute("aria-expanded", "false");
}

export function initShell({ adminApi, whoami }) {
  state.me = whoami?.actor ?? null;
  state.teamAlerts = whoami?.teamAlerts ?? null;
  for (const tag of $$("[data-admin-env]")) tag.hidden = whoami?.site !== "staging";

  const menu = $("[data-admin-menu]");
  menu.replaceChildren(icon("menu", 24));
  menu.addEventListener("click", () => {
    const nav = $("[data-admin-nav]");
    const open = !nav.hasAttribute("data-open");
    nav.toggleAttribute("data-open", open);
    $("[data-admin-scrim]").hidden = !open;
    menu.setAttribute("aria-expanded", String(open));
    if (open) $(".nav-link", nav)?.focus();
  });
  $("[data-admin-scrim]").addEventListener("click", closeMenu);
  $("[data-admin-nav]").addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("[data-admin-nav]").hasAttribute("data-open")) {
      closeMenu();
      menu.focus();
    }
  });

  for (const button of $$("[data-lang]")) button.addEventListener("click", () => setLang(button.dataset.lang));
  $("[data-admin-lang-toggle]").addEventListener("click", () => setLang(lang() === "zh" ? "en" : "zh"));

  $("[data-admin-team-alerts]").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      state.teamAlerts = (await adminApi("/admin/api/me/alerts", { method: "POST", body: { on: !state.teamAlerts } })).teamAlerts;
      renderTeamAlerts();
      $("[data-admin-message]").replaceChildren(notice("success", t("nav.teamEmails"), t(state.teamAlerts ? "nav.teamEmailsNowOn" : "nav.teamEmailsNowOff")));
    } catch (error) {
      $("[data-admin-message]").replaceChildren(notice("warning", t("nav.teamEmailsNotChanged"), error.message));
    } finally {
      button.disabled = false;
    }
  });
  renderNav();
}

export const me = () => state.me;
