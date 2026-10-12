// Orders (M9 订单列表, D50, M9-05, I13): paid orders only (D36), in views (to ship, review, problems, disputes by
// deadline, shipped, cancelled), with the payment and the shipping state in two columns and what someone has to do.
// API: GET /admin/api/orders?view=&q=&before= (worker/orders.js listOrders). The Amazon tools sit at the bottom.
import { formatDate, t, when } from "./i18n.js";
import { badge, el, icon, money, notice } from "./ui.js";

export const VIEWS = ["all", "to_ship", "review", "problems", "disputes", "shipped", "cancelled"];

const PAYMENT_TONE = { paid: "ok", review: "warn", disputed: "bad", refund_failed: "bad", partly_refunded: "warn", refunded: "muted", cancelled: "muted", awaiting: "muted" };
const SHIPPING_TONE = { review: "warn", cooling_off: "neutral", waiting: "neutral", with_amazon: "warn", out_of_stock: "bad", not_sent: "bad", on_hold: "warn", shipped: "ok", cancelled: "muted" };

// Older answers (and the order page's own data) may not carry the two states: read them from the status.
const paymentOf = (order) => order.payment ?? ({ paid: "paid", review: "review", cancelled: "cancelled", pending: "awaiting" }[order.status] ?? "paid");
const shippingOf = (order) => order.shipping && typeof order.shipping === "string" ? order.shipping
  : order.fulfillmentStatus === "shipped" ? "shipped"
  : order.status === "cancelled" ? "cancelled"
  : order.status === "review" ? "review"
  : order.status === "paid" ? "waiting" : null;

export const paymentBadge = (order) => {
  const state = paymentOf(order);
  return badge(PAYMENT_TONE[state] ?? "neutral", t(`payment.${state}`), { "data-payment": state });
};
export const shippingBadge = (order) => {
  const state = shippingOf(order);
  return state ? badge(SHIPPING_TONE[state] ?? "neutral", t(`shipping.${state}`), { "data-shipping": state }) : el("span", { class: "muted" }, "—");
};

function todoText(todo) {
  if (!todo) return null;
  if (todo.code === "dispute") return todo.dueAt ? t("todo.disputeBy", { date: formatDate(todo.dueAt, { time: false }) }) : t("todo.dispute");
  if (todo.code === "stockout") return t("todo.stockout", { n: todo.days ?? 0 });
  return t(`todo.${todo.code}`);
}

const providerName = (provider) => (provider === "paypal" ? "PayPal" : provider ? t("orders.card") : "—");
const items = (order) => order.items?.length ? order.items.map((line) => `${line.sku} ×${line.qty}`).join(", ") : t("orders.items", { n: order.itemCount });

export async function renderOrders(host, { route, adminApi, isCurrent, navigate, setOrdersBadge, me }) {
  const view = VIEWS.includes(route.params.get("view")) ? route.params.get("view") : "all";
  const q = route.params.get("q") ?? "";
  const query = (extra = {}) => {
    const params = new URLSearchParams({ ...(view !== "all" ? { view } : {}), ...(q ? { q } : {}), ...extra });
    return params.toString();
  };
  const go = (next) => {
    const params = new URLSearchParams({ ...(next.view && next.view !== "all" ? { view: next.view } : {}), ...(next.q ? { q: next.q } : {}) });
    navigate(`#/orders${params.toString() ? `?${params}` : ""}`);
  };

  const page = await adminApi(`/admin/api/orders?${query()}`);
  if (!isCurrent()) return;
  const counts = page.viewCounts ?? {};
  setOrdersBadge((counts.review ?? 0) + (counts.problems ?? 0) + (counts.disputes ?? 0));
  const state = { orders: page.orders, nextBefore: page.nextBefore };

  const n = page.numbers;
  const stats = n && el("section", { class: "card stat-strip", "aria-label": t("orders.stats"), "data-order-stats": true },
    ...[
      ["today", String(n.today.orders)],
      ["month", String(n.month.orders)],
      ["toShip", String(n.toShip)],
      ["shipTime", n.averageDaysToShip === null ? "—" : t("orders.days", { n: n.averageDaysToShip })],
      ["refunds", String(n.refunds.monthOrders)],
    ].map(([key, value]) => el("div", { class: "stat-strip__item" }, el("span", { class: "stat-strip__label" }, t(`orders.stat.${key}`)), el("span", { class: "stat-strip__value" }, value))));

  const chips = el("div", { class: "view-chips", role: "group", "aria-label": t("orders.views") },
    ...VIEWS.map((key) => el("button", {
      type: "button", class: "view-chip", "data-view": key, "aria-pressed": String(key === view),
      onclick: () => go({ view: key, q }),
    }, t(`orders.view.${key}`), el("span", { class: "view-chip__n" }, String(counts[key] ?? 0)))));

  const search = el("form", { class: "toolbar", role: "search", "data-admin-search": true },
    el("label", { class: "search search--grow" },
      icon("search", 18),
      el("span", { class: "visually-hidden" }, t("orders.searchLabel")),
      el("input", { type: "search", name: "q", value: q, autocomplete: "off", placeholder: t("orders.searchPlaceholder"), "aria-label": t("orders.searchLabel") })),
    el("button", { class: "btn btn--ghost", type: "submit" }, t("orders.search")),
    q && el("button", { class: "btn btn--text", type: "button", onclick: () => go({ view, q: "" }) }, t("orders.clearSearch")));
  search.addEventListener("submit", (event) => {
    event.preventDefault();
    go({ view, q: new FormData(search).get("q").toString().trim() });
  });

  const body = el("tbody", { "data-admin-list": true });
  const more = el("div", { class: "table-foot" });
  const renderRows = () => {
    body.replaceChildren(...(state.orders.length
      ? state.orders.map((order) => el("tr", { "data-order": order.id },
        el("td", { class: "nowrap" }, el("a", { class: "order-link", href: `#/orders/${encodeURIComponent(order.id)}` }, order.id)),
        el("td", { class: "nowrap muted" }, when(order.paidAt || order.createdAt)),
        el("td", {}, el("span", { class: "cell-main" }, order.erased ? t("customers.deletedName") : order.name), el("span", { class: "cell-sub" }, [order.city, order.state].filter(Boolean).join(", ") || order.email)),
        el("td", { class: "num" }, money(order.totalCents)),
        el("td", { class: "nowrap" }, providerName(order.paymentProvider)),
        el("td", {}, paymentBadge(order)),
        el("td", {}, shippingBadge(order)),
        el("td", { class: "nowrap muted" }, items(order)),
        el("td", { class: "todo" }, todoText(order.todo) ?? el("span", { class: "muted" }, "—")),
      ))
      : [el("tr", {}, el("td", { colspan: "9", class: "table-empty" }, t("orders.noneMatch")))]));
    more.replaceChildren(...[
      el("span", { class: "muted" }, t("orders.shown", { n: state.orders.length, total: Math.max(counts[view] ?? 0, state.orders.length) })),
      state.nextBefore && el("button", { class: "btn btn--ghost", type: "button", "data-admin-load-more": true, onclick: loadMore }, t("orders.more")),
    ].filter(Boolean));
  };
  async function loadMore(event) {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const next = await adminApi(`/admin/api/orders?${query({ before: state.nextBefore })}`);
      state.orders = [...state.orders, ...next.orders];
      state.nextBefore = next.nextBefore;
      renderRows();
    } catch (error) {
      button.disabled = false;
      more.append(notice("warning", t("common.unavailable"), error.message));
    }
  }
  renderRows();

  host.replaceChildren(...[
    el("header", { class: "page-head" }, el("p", { class: "eyebrow" }, t("orders.eyebrow")), el("h1", { class: "page-title" }, t("nav.orders"))),
    stats,
    el("section", { class: "card card--flush" },
      el("div", { class: "card__pad" }, chips, search, el("p", { class: "hint", "data-view-hint": view }, t(`orders.hint.${view}`))),
      el("div", { class: "table-wrap" }, el("table", { class: "tbl tbl--orders" },
        el("thead", {}, el("tr", {}, ...["order", "date", "customer", "total", "method", "payment", "shipping", "items", "todo"].map((key) => el("th", { scope: "col", class: key === "total" ? "num" : null }, t(`orders.col.${key}`))))),
        body)),
      more),
    amazonTools({ adminApi, me, reload: () => navigate(location.hash || "#/orders") }),
  ].filter(Boolean));
}

// ---------- Amazon tools: check the connection, sync every order with Amazon, and (owners) the Hold test order ----------

function amazonTools({ adminApi, me, reload }) {
  const result = el("div", { "data-admin-mcf-check-result": true, "aria-live": "polite" });
  const check = el("button", { class: "btn btn--ghost", type: "button", "data-admin-mcf-check": true }, t("amazon.check"));
  const sync = el("button", { class: "btn btn--ghost", type: "button", "data-admin-mcf-sync-all": true }, t("amazon.syncAll"));
  const hold = me?.role === "owner" ? el("button", { class: "btn btn--ghost", type: "button", "data-admin-hold-test": true }, t("amazon.holdTest")) : null;

  check.addEventListener("click", async () => {
    check.disabled = true;
    result.replaceChildren(notice("info", t("amazon.checking"), t("amazon.checkingBody")));
    try {
      const outcome = await adminApi("/admin/api/mcf/check");
      if (!outcome.ok) {
        result.replaceChildren(notice("warning", t("amazon.checkFailed"), outcome.error || t("amazon.checkFailedBody")));
      } else {
        const previews = outcome.previews || (outcome.preview ? [outcome.preview] : []);
        const available = previews.length > 0 && previews.every((preview) => preview.fulfillable === true);
        const details = [
          ...previews.map((preview) => `${preview.sku}: ${t(preview.fulfillable ? "amazon.previewOk" : "amazon.previewNo")}${preview.deliveryStart && preview.deliveryEnd ? ` ${t("amazon.estimate", { from: formatDate(preview.deliveryStart, { time: false }), to: formatDate(preview.deliveryEnd, { time: false }) })}` : ""}`),
          previews.length ? "" : t("amazon.noPreview"),
          t(outcome.autoSubmit ? "amazon.autoOn" : "amazon.autoOff"),
          t("amazon.nothingCreated"),
        ].filter(Boolean).join(" ");
        result.replaceChildren(notice(available ? "success" : "warning", t("amazon.checkOk"), details));
      }
    } catch (error) {
      result.replaceChildren(notice("warning", t("amazon.checkFailed"), error.message));
    } finally {
      check.disabled = false;
    }
  });

  sync.addEventListener("click", async () => {
    sync.disabled = true;
    try {
      const { summary } = await adminApi("/admin/api/mcf/sync", { method: "POST", body: {} });
      result.replaceChildren(notice("success", t("amazon.synced"), t("amazon.syncedBody", { checked: summary.checked, shipped: summary.shipped, failed: summary.failed ?? 0 })));
    } catch (error) {
      result.replaceChildren(notice("warning", t("amazon.syncFailed"), error.message));
    }
    sync.disabled = false;
  });

  // Owners only: the Hold test order (D26), before automatic sending is turned on.
  hold?.addEventListener("click", async () => {
    if (!confirm(t("amazon.holdConfirm"))) return;
    hold.disabled = true;
    result.replaceChildren(notice("info", t("amazon.holdTest"), t("amazon.holdCreating")));
    try {
      const { result: test } = await adminApi("/admin/api/mcf/hold-test", { method: "POST", body: {} });
      result.replaceChildren(notice(test.outcome === "passed" ? "success" : "warning", t(test.outcome === "passed" ? "amazon.holdPassed" : "amazon.holdFailed", { id: test.id }),
        test.steps.map((step) => `${t(`amazon.holdStep.${step.step}`)}: ${step.ok ? "OK" : t("amazon.holdStepFailed")}. ${step.detail}`).join(" ")));
    } catch (error) {
      result.replaceChildren(notice("warning", t("amazon.holdError"), error.message));
    } finally {
      hold.disabled = false;
    }
  });

  return el("details", { class: "card tools", "data-amazon-tools": true },
    el("summary", { class: "tools__summary" }, t("amazon.tools")),
    el("p", { class: "hint" }, t("amazon.toolsHint")),
    el("div", { class: "button-row" }, check, sync, hold),
    result);
}
