// Unfinished checkouts (D36, M9-22, I14): checkouts nobody paid for yet, or that expired after 24 hours. Not orders, so
// not in the order list, its counts or reports. Read only; no reminder emails are sent.
// API: GET /admin/api/checkouts (commerce/worker/checkouts.js listCheckouts).
import { formatDate, t } from "./i18n.js";
import { badge, el, field, money, notice } from "./ui.js";

const TONE = { open: "neutral", expired: "muted" };

export async function renderCheckouts(host, { adminApi, isCurrent }) {
  const state = { list: [], nextBefore: null, filters: {} };
  const results = el("div", { "data-admin-checkouts": true, "aria-live": "polite" });
  const status = el("select", { id: "checkouts-status", name: "status" },
    ...["all", "open", "expired"].map((value) => el("option", { value }, t(`checkouts.status.${value}`))));
  const q = el("input", { id: "checkouts-q", type: "search", name: "q", autocomplete: "off", placeholder: t("checkouts.emailPlaceholder") });
  const submit = el("button", { class: "btn btn--ghost", type: "submit" }, t("checkouts.show"));
  const form = el("form", { class: "filters", role: "search", "data-admin-checkouts-filter": true },
    field("checkouts-status", t("checkouts.statusLabel"), el("span", { class: "select" }, status)),
    field("checkouts-q", t("checkouts.email"), q),
    submit);

  const render = (counts) => {
    if (!state.list.length) return results.replaceChildren(el("p", { class: "hint" }, t("checkouts.none")));
    results.replaceChildren(
      ...[counts && el("p", { class: "hint", "data-checkout-counts": true }, t("checkouts.counts", { open: counts.open, expired: counts.expired }))].filter(Boolean),
      el("ul", { class: "record-list" }, ...state.list.map((c) => el("li", { class: "record", "data-checkout-id": c.id },
        el("div", { class: "record__head" },
          el("strong", {}, c.id),
          badge(TONE[c.status] ?? "neutral", t(`checkouts.status.${c.status}`)),
          el("span", {}, c.purged ? t("checkouts.purged") : c.email || "—"),
          el("small", {}, t("checkouts.started", { at: formatDate(c.createdAt) }), c.expiredAt ? ` · ${t("checkouts.expired", { at: formatDate(c.expiredAt) })}` : "")),
        el("p", { class: "record__text" }, `${c.items.map((item) => `${item.qty} × ${item.name}`).join(", ")} · ${money(c.totalCents)}${c.state ? ` · ${c.state}` : ""}`),
        c.lastFailure && el("p", { class: "record__warn" }, t("checkouts.failed", { n: c.lastFailure.count, reason: c.lastFailure.message || c.lastFailure.code || t("checkouts.noReason") }))))),
      ...[state.nextBefore && el("button", { class: "btn btn--text", type: "button", onclick: () => load() }, t("checkouts.older"))].filter(Boolean),
    );
  };

  async function load({ reset = false } = {}) {
    submit.disabled = true;
    try {
      const params = new URLSearchParams(state.filters);
      if (!reset && state.nextBefore) params.set("before", state.nextBefore);
      const page = await adminApi(`/admin/api/checkouts?${params}`);
      if (!isCurrent()) return;
      state.list = reset ? page.checkouts : [...state.list, ...page.checkouts];
      state.nextBefore = page.nextBefore;
      render(page.counts);
    } catch (error) {
      results.replaceChildren(notice("warning", t("checkouts.unavailable"), error.message));
    } finally {
      submit.disabled = false;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    state.filters = Object.fromEntries(Object.entries({ status: data.status, q: String(data.q ?? "").trim() }).filter(([, value]) => value && value !== "all"));
    load({ reset: true });
  });

  host.replaceChildren(
    el("header", { class: "page-head" }, el("p", { class: "eyebrow" }, t("checkouts.eyebrow")), el("h1", { class: "page-title" }, t("nav.checkouts"))),
    el("section", { class: "card", "data-admin-checkouts-section": true }, el("p", { class: "hint" }, t("checkouts.intro")), form, results),
  );
  await load({ reset: true });
}
