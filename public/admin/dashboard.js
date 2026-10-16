// The first page (M9 首页, I5, I8, D50): four numbers, what needs someone, where orders are on their way, the latest
// orders, whether the store's connections work and the products. API: GET /admin/api/dashboard (worker/dashboard.js).
import { formatDate, longDate, t, when } from "./i18n.js";
import { badge, card, cardHead, el, icon, money, routineTile } from "./ui.js";
import { paymentBadge, shippingBadge } from "./orders.js";
import { EMAIL_KIND } from "./order.js";

// What each waiting kind says and what to do (worker/team-digest.js waitingLists keys).
const ATTENTION_TONE = { review: "warn", not_sent: "bad", stockout: "bad", no_tracking: "warn", disputes: "bad", refunds: "warn", unrefunded: "bad", emails: "warn", addresses: "warn", returned: "bad" };

function attentionDetail(item) {
  const d = item.detail ?? {};
  if (item.kind === "stockout") return t("attention.stockoutDays", { n: d.days ?? 0 });
  if (item.kind === "returned") return `${d.carrier ?? ""} ${d.tracking_number ?? ""} · ${d.status ?? ""}`.trim();
  if (item.kind === "disputes") return d.due_at ? t("attention.replyBy", { date: formatDate(d.due_at, { time: false }) }) : t("attention.replySoon");
  if (item.kind === "no_tracking") return t("attention.sentOn", { date: formatDate(d.submitted_at, { time: false }) });
  if (item.kind === "unrefunded") return t("attention.cancelledOn", { date: formatDate(d.cancelled_at, { time: false }) });
  if (item.kind === "emails") return t("attention.emailStatus", { kind: EMAIL_KIND(String(d.kind ?? "")), status: t(`email.delivery.${d.status}`) });
  if (item.kind === "not_sent" && d.mcf_status) return d.mcf_status;
  return "";
}

const HEALTH_TONE = { ok: "ok", warn: "warn", off: "muted" };

function healthDetail(item) {
  const d = item.detail ?? {};
  const key = `health.${item.key}.${item.status}`;
  const values = {
    env: d.env, from: d.from ?? "", n: d.uncheckedToday ?? 0,
    at: formatDate(d.lastSyncAt ?? d.lastRunAt ?? d.at),
    date: d.lastDate ?? "",
  };
  return t(key, values);
}

export async function renderDashboard(host, { adminApi, isCurrent, navigate, setOrdersBadge }) {
  const data = await adminApi("/admin/api/dashboard");
  if (!isCurrent()) return;
  const { numbers, pipeline, attention, health, products, latest } = data;
  const privacy = data.privacy ?? [];
  setOrdersBadge(attention.items.filter((item) => ["review", "not_sent", "stockout", "disputes", "refunds", "unrefunded"].includes(item.kind)).length);

  const search = el("form", { class: "search", role: "search", "data-dashboard-search": true },
    icon("search", 18),
    el("input", { type: "search", name: "q", autocomplete: "off", placeholder: t("dashboard.searchPlaceholder"), "aria-label": t("dashboard.searchPlaceholder") }));
  search.addEventListener("submit", (event) => {
    event.preventDefault();
    const q = new FormData(search).get("q").toString().trim();
    navigate(q ? `#/orders?q=${encodeURIComponent(q)}` : "#/orders");
  });

  const kpi = (key, value, sub, tone) => el("div", { class: "card kpi", "data-kpi": key },
    el("span", { class: "kpi__label" }, t(`dashboard.kpi.${key}`)),
    el("span", { class: `kpi__value${tone ? ` kpi__value--${tone}` : ""}` }, value),
    el("span", { class: "kpi__sub" }, sub));

  const attentionCard = card({ "aria-labelledby": "attn-h", "data-dashboard-attention": true },
    el("div", { class: "card__head" },
      el("h2", { class: "card__title", id: "attn-h" }, t("dashboard.attention")),
      attention.total + privacy.length > 0 && el("span", { class: "card__meta card__meta--accent" }, t("dashboard.attentionCount", { n: attention.total + privacy.length }))),
    // Privacy requests to answer (M11-05): overdue or close first, to the customer's page.
    privacy.length > 0 && el("ul", { class: "row-list", "data-dashboard-privacy": true }, ...privacy.map((item) =>
      el("li", {},
        el(item.ref ? "a" : "div", { class: "row-link", ...(item.ref ? { href: `#/customers/${encodeURIComponent(item.ref)}` } : {}), "data-attention": "privacy" },
          el("span", { class: `dot dot--${item.daysLeft < 0 ? "bad" : item.urgent ? "warn" : "neutral"}` }),
          el("span", { class: "row-link__text" },
            el("span", { class: "row-link__title" }, t(`attention.privacy.${item.kind}`)),
            el("span", { class: "row-link__detail" }, [item.handler, item.daysLeft < 0 ? t("attention.privacyLate", { n: -item.daysLeft }) : t("attention.privacyDue", { date: formatDate(item.dueAt, { time: false }), n: item.daysLeft })].join(" · "))),
          el("span", { class: "row-link__action" }, t("attention.privacy.action")),
          item.ref && icon("next", 18))))),
    attention.items.length
      ? el("ul", { class: "row-list" }, ...attention.items.map((item) =>
        el("li", {},
          el("a", { class: "row-link", href: `#/orders/${encodeURIComponent(item.orderId)}`, "data-attention": item.kind },
            el("span", { class: `dot dot--${ATTENTION_TONE[item.kind] ?? "warn"}` }),
            el("span", { class: "row-link__text" },
              el("span", { class: "row-link__title" }, t(`attention.${item.kind}`)),
              el("span", { class: "row-link__detail" }, [item.orderId, item.name, attentionDetail(item)].filter(Boolean).join(" · "))),
            el("span", { class: "row-link__action" }, t(`attention.${item.kind}.action`)),
            icon("next", 18)))))
      : !privacy.length && el("p", { class: "all-clear" }, icon("check", 18), t("dashboard.nothingWaiting")),
    attention.clear.length > 0 && el("div", { class: "chips chips--clear" },
      el("span", { class: "chips__label" }, t("dashboard.allClear")),
      ...attention.clear.map((kind) => el("span", { class: "chip" }, icon("check", 14), t(`attention.${kind}.clear`)))),
  );

  const stage = (key, count, hint, tone, view) => el("a", { class: `stage-tile stage-tile--${tone}`, href: `#/orders?view=${view}`, "data-pipeline": key },
    el("span", { class: "stage-tile__count" }, String(count)),
    el("span", { class: "stage-tile__label" }, t(`pipeline.${key}`)),
    el("span", { class: "stage-tile__hint" }, hint));
  const pipelineCard = card({ "aria-labelledby": "ship-h", "data-dashboard-pipeline": true },
    cardHead(t("dashboard.shipping"), el("span", { class: "card__meta" }, t("dashboard.shippingNote", { n: pipeline.coolingOffMinutes }))),
    el("div", { class: "stage-grid" },
      stage("coolingOff", pipeline.coolingOff, t("pipeline.coolingOffHint"), "neutral", "to_ship"),
      stage("waiting", pipeline.waiting, t("pipeline.waitingHint"), "muted", "to_ship"),
      stage("withAmazon", pipeline.withAmazon, pipeline.outOfStock ? t("pipeline.outOfStockHint", { n: pipeline.outOfStock }) : t("pipeline.withAmazonHint"), "warn", "to_ship"),
      stage("shippedThisWeek", pipeline.shippedThisWeek, numbers.averageDaysToShip !== null ? t("pipeline.averageDays", { n: numbers.averageDaysToShip }) : t("pipeline.shippedHint"), "ok", "shipped")));
  pipelineCard.querySelector(".card__title").id = "ship-h";

  const latestCard = card({ "aria-labelledby": "latest-h", "data-dashboard-latest": true },
    cardHead(t("dashboard.latest"), el("a", { class: "card__link", href: "#/orders" }, t("dashboard.allOrders"))),
    latest.length
      ? el("div", { class: "table-wrap" }, el("table", { class: "tbl" },
        el("thead", {}, el("tr", {}, ...["order", "customer", "total", "payment", "shipping", "time"].map((key) => el("th", { scope: "col", class: key === "total" ? "num" : null }, t(`orders.col.${key}`))))),
        el("tbody", {}, ...latest.map((order) => el("tr", {},
          el("td", { class: "nowrap" }, el("a", { class: "order-link", href: `#/orders/${encodeURIComponent(order.id)}` }, order.id)),
          el("td", {}, order.name),
          el("td", { class: "num" }, money(order.totalCents)),
          el("td", {}, paymentBadge(order)),
          el("td", {}, shippingBadge(order)),
          el("td", { class: "nowrap muted" }, when(order.paidAt || order.createdAt)))))))
      : el("p", { class: "muted" }, t("orders.none")));
  latestCard.querySelector(".card__title").id = "latest-h";

  const healthCard = card({ "aria-labelledby": "health-h", "data-dashboard-health": true },
    cardHead(t("dashboard.health")),
    el("ul", { class: "health-list" }, ...health.map((item) => el("li", { "data-health": item.key, "data-status": item.status },
      el("span", { class: `dot dot--${HEALTH_TONE[item.status] ?? "muted"}` }),
      el("span", { class: "health-list__text" },
        el("span", { class: "health-list__label" }, t(`health.${item.key}`)),
        el("span", { class: "health-list__detail" }, healthDetail(item)))))));
  healthCard.querySelector(".card__title").id = "health-h";

  const productsCard = card({ "aria-labelledby": "prod-h", "data-dashboard-products": true },
    cardHead(t("dashboard.products"), el("a", { class: "card__link", href: "#/products" }, t("dashboard.manageProducts"))),
    el("ul", { class: "mini-products" }, ...products.map((product) => el("li", {},
      el("a", { class: "mini-product", href: `#/products/${product.id}` },
        routineTile(product.routine, "sm"),
        el("span", { class: "mini-product__text" },
          el("span", { class: "mini-product__name" }, product.name),
          el("span", { class: "mini-product__meta" }, `${product.sku} · ${money(product.priceCents)} · ${t(product.stock?.connected ? "products.stockConnected" : "products.stockNotConnected")}`)),
        product.onSale ? badge("ok", t("products.onSale")) : badge("bad", t("products.stopped")))))));
  productsCard.querySelector(".card__title").id = "prod-h";

  host.replaceChildren(
    el("header", { class: "page-head page-head--split" },
      el("div", {}, el("p", { class: "eyebrow" }, longDate()), el("h1", { class: "page-title" }, t("nav.dashboard"))),
      search),
    el("section", { class: "kpi-grid", "aria-label": t("dashboard.sales") },
      kpi("today", money(numbers.today.revenueCents), t("dashboard.orders", { n: numbers.today.orders })),
      kpi("month", money(numbers.month.revenueCents), t("dashboard.orders", { n: numbers.month.orders })),
      kpi("average", money(numbers.month.averageCents), t("dashboard.thisMonth")),
      kpi("refunded", money(numbers.refunds.monthCents), t("dashboard.orders", { n: numbers.refunds.monthOrders }), numbers.refunds.monthCents ? "bad" : null)),
    el("div", { class: "split" },
      el("div", { class: "split__main" }, attentionCard, pipelineCard, latestCard),
      el("aside", { class: "split__aside" }, healthCard, productsCard)),
    el("p", { class: "fine-print" }, t("dashboard.footnote", { zone: numbers.timeZone })),
  );
}
