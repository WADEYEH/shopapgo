// Unfinished checkouts (D36, M9-22, I14): checkouts nobody paid for yet, or that expired after 24 hours. Not orders, so
// not in the order list, its counts or reports. Read only; no reminder emails are sent.
// API: GET /admin/api/checkouts (commerce/worker/checkouts.js listCheckouts).
// Payment lookup (M9 付款查询, M9-23): ask Airwallex or PayPal about one payment, read only, no card or payer details.
// API: GET /admin/api/airwallex/intents/:id, /admin/api/paypal/orders/:id (commerce/worker/payment-lookup.js).
import { formatDate, t } from "./i18n.js";
import { badge, el, field, money, notice } from "./ui.js";

const TONE = { open: "neutral", expired: "muted" };

// What support needs from the answer: status, amount, when, and why it failed.
function lookupFacts(provider, data) {
  const rows = provider === "paypal"
    ? [
      [t("lookup.status"), data.status],
      [t("lookup.amount"), data.purchase_units?.[0]?.amount ? `${data.purchase_units[0].amount.value} ${data.purchase_units[0].amount.currency_code}` : "—"],
      [t("lookup.capture"), (data.purchase_units?.[0]?.captures ?? []).map((c) => [c.status, c.status_details?.reason].filter(Boolean).join(" · ")).join(", ") || "—"],
      [t("lookup.created"), formatDate(data.create_time)],
      [t("lookup.updated"), formatDate(data.update_time)],
      [t("lookup.environment"), data.env],
    ]
    : [
      [t("lookup.status"), data.status],
      [t("lookup.amount"), `${data.amount} ${data.currency}`],
      [t("lookup.order"), data.merchant_order_id || "—"],
      [t("lookup.method"), data.latest_payment_attempt?.payment_method || "—"],
      [t("lookup.attempt"), data.latest_payment_attempt?.status || "—"],
      [t("lookup.failure"), [data.latest_payment_attempt?.failure_code, data.latest_payment_attempt?.provider_original_response_msg].filter(Boolean).join(" · ") || "—"],
      [t("lookup.created"), formatDate(data.created_at)],
      [t("lookup.updated"), formatDate(data.updated_at)],
    ];
  return el("dl", { class: "facts", "data-lookup-result": provider }, ...rows.flatMap(([label, value]) => [el("dt", {}, label), el("dd", {}, value ?? "—")]));
}

function lookupCard(adminApi) {
  const provider = el("select", { id: "lookup-provider", name: "provider" },
    el("option", { value: "airwallex" }, "Airwallex"), el("option", { value: "paypal" }, "PayPal"));
  const id = el("input", { id: "lookup-id", name: "id", type: "text", autocomplete: "off", spellcheck: "false", placeholder: "int_… / 5O190127TN364715T", required: true });
  const submit = el("button", { class: "btn btn--ghost", type: "submit" }, t("lookup.go"));
  const result = el("div", { "aria-live": "polite", "data-lookup-output": true });
  const form = el("form", { class: "filters", "data-lookup-form": true },
    field("lookup-provider", t("lookup.provider"), el("span", { class: "select" }, provider)),
    field("lookup-id", t("lookup.id"), id),
    submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = id.value.trim();
    if (!value) return;
    const path = provider.value === "paypal" ? `/admin/api/paypal/orders/${encodeURIComponent(value.toUpperCase())}` : `/admin/api/airwallex/intents/${encodeURIComponent(value)}`;
    submit.disabled = true;
    result.replaceChildren(el("p", { class: "hint" }, t("common.loading")));
    try {
      result.replaceChildren(lookupFacts(provider.value, await adminApi(path)));
    } catch (error) {
      result.replaceChildren(notice("warning", t("lookup.failed"), error.message));
    } finally {
      submit.disabled = false;
    }
  });
  return el("section", { class: "card", "data-payment-lookup": true },
    el("h2", { class: "card__title" }, t("lookup.title")),
    el("p", { class: "hint" }, t("lookup.hint")),
    form, result);
}

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
    lookupCard(adminApi),
  );
  await load({ reset: true });
}
