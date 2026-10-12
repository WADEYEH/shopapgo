// Reports (M9 报表, I4, I8, M9-06, M9-15, M9-16, D56): for a period of the team's days (Taiwan time), money paid,
// refunded and net, per product, per payment method and per day, and the shipping customers paid next to Amazon's fee
// estimate; the same period downloads as the orders CSV and the payments CSV for bookkeeping. Any member (D54).
// API: GET /admin/api/reports/sales, /admin/api/exports/orders.csv, /admin/api/exports/payments.csv (worker/reports.js).
import { downloadFile } from "./api.js";
import { t } from "./i18n.js";
import { card, cardHead, el, field, icon, money, notice, priceRows } from "./ui.js";

const PRESETS = ["today", "7d", "30d", "month", "last_month", "year", "custom"];
const providerName = (provider) => (provider === "paypal" ? "PayPal" : "Airwallex");

export async function renderReports(host, { route, adminApi, isCurrent, navigate }) {
  const preset = PRESETS.includes(route.params.get("preset")) ? route.params.get("preset") : "month";
  const from = route.params.get("from") ?? "";
  const to = route.params.get("to") ?? "";
  const params = new URLSearchParams({ preset, ...(preset === "custom" ? { from, to } : {}) });
  const go = (next) => navigate(`#/reports?${new URLSearchParams(next)}`);

  const chips = el("div", { class: "view-chips", role: "group", "aria-label": t("reports.period") },
    ...PRESETS.filter((key) => key !== "custom").map((key) => el("button", {
      type: "button", class: "view-chip", "data-preset": key, "aria-pressed": String(key === preset), onclick: () => go({ preset: key }),
    }, t(`reports.preset.${key}`))));
  const fromInput = el("input", { id: "report-from", type: "date", value: from, required: true });
  const toInput = el("input", { id: "report-to", type: "date", value: to, required: true });
  const custom = el("form", { class: "filters", "data-report-custom": true },
    field("report-from", t("reports.from"), fromInput),
    field("report-to", t("reports.to"), toInput),
    el("button", { class: "btn btn--ghost", type: "submit" }, t("reports.show")));
  custom.addEventListener("submit", (event) => {
    event.preventDefault();
    go({ preset: "custom", from: fromInput.value, to: toInput.value });
  });
  const head = [
    el("header", { class: "page-head" }, el("p", { class: "eyebrow" }, t("reports.eyebrow")), el("h1", { class: "page-title" }, t("nav.reports"))),
    el("section", { class: "card" }, chips, custom),
  ];

  let report;
  try {
    report = await adminApi(`/admin/api/reports/sales?${params}`);
  } catch (error) {
    if (!isCurrent()) return;
    host.replaceChildren(...head, notice("warning", t("reports.unavailable"), error.message));
    return;
  }
  if (!isCurrent()) return;
  if (!fromInput.value) fromInput.value = report.period.from;
  if (!toInput.value) toInput.value = report.period.to;

  const kpi = (key, value, tone) => el("div", { class: "card kpi", "data-report-kpi": key },
    el("span", { class: "kpi__label" }, t(`reports.kpi.${key}`)),
    el("span", { class: `kpi__value${tone ? ` kpi__value--${tone}` : ""}` }, value));
  const range = report.period.from === report.period.to ? report.period.from : `${report.period.from} – ${report.period.to}`;

  const days = report.days && report.days.length > 1 && (() => {
    const max = Math.max(1, ...report.days.map((day) => day.paidCents));
    return card({ "data-report-days": true },
      cardHead(t("reports.byDay")),
      el("div", { class: `bars${report.days.length > 14 ? " bars--dense" : ""}`, role: "img", "aria-label": t("reports.byDayLabel", { from: report.period.from, to: report.period.to }) },
        el("div", { class: "bars__plot" }, ...report.days.map((day) => el("span", {
          class: "bars__bar", style: `height: ${Math.max(2, Math.round((day.paidCents / max) * 100))}%`,
          title: `${day.day}: ${money(day.paidCents)} · ${t("orders.items", { n: day.orders })}`,
        }))),
        el("div", { class: "bars__axis" }, el("span", {}, report.days[0].day), el("span", {}, report.days.at(-1).day))));
  })();

  const table = (attrs, columns, rows) => el("div", { class: "table-wrap" }, el("table", { class: "tbl", ...attrs },
    el("thead", {}, el("tr", {}, ...columns.map(([key, num]) => el("th", { scope: "col", class: num ? "num" : null }, t(key))))),
    el("tbody", {}, ...(rows.length ? rows : [el("tr", {}, el("td", { colspan: String(columns.length), class: "table-empty" }, t("reports.nothing")))]))));

  const ship = report.shippingVsAmazon;
  const exportMessage = el("div", { "aria-live": "polite", "data-export-message": true });
  const exportButton = (kind) => {
    const button = el("button", { class: "btn btn--ghost", type: "button", "data-export": kind }, icon("download", 16), t(`reports.export.${kind}`));
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const name = await downloadFile(`/admin/api/exports/${kind}.csv?${params}`);
        exportMessage.replaceChildren(notice("success", t("reports.downloaded"), name));
      } catch (error) {
        exportMessage.replaceChildren(notice("warning", t("reports.downloadFailed"), error.message));
      } finally {
        button.disabled = false;
      }
    });
    return button;
  };

  host.replaceChildren(
    ...head,
    el("p", { class: "hint", "data-report-range": true }, t("reports.range", { range, zone: report.period.timeZone })),
    el("div", { class: "kpi-grid" },
      kpi("gross", money(report.grossCents)),
      kpi("refunds", money(report.refunds.cents), report.refunds.cents ? "bad" : null),
      kpi("net", money(report.netCents)),
      kpi("orders", String(report.orders)),
      kpi("average", money(report.averageCents))),
    el("div", { class: "split" },
      el("div", { class: "split__main" },
        days,
        card({ class: "card--flush", "data-report-products": true },
          el("div", { class: "card__pad" }, cardHead(t("reports.byProduct"))),
          table({}, [["reports.col.product"], ["reports.col.units", true], ["reports.col.sales", true]],
            report.products.map((p) => el("tr", { "data-sku": p.sku },
              el("td", {}, el("span", { class: "cell-main" }, p.name), el("span", { class: "cell-sub" }, p.sku)),
              el("td", { class: "num" }, String(p.units)), el("td", { class: "num" }, money(p.salesCents)))))),
        card({ class: "card--flush", "data-report-payments": true },
          el("div", { class: "card__pad" }, cardHead(t("reports.byPayment"))),
          table({}, [["reports.col.method"], ["reports.col.orders", true], ["reports.col.paid", true], ["reports.col.refunded", true]],
            report.payments.map((p) => el("tr", { "data-provider": p.provider },
              el("td", {}, providerName(p.provider)), el("td", { class: "num" }, String(p.orders)),
              el("td", { class: "num" }, money(p.paidCents)), el("td", { class: "num" }, money(p.refundedCents))))))),
      el("aside", { class: "split__aside" },
        card({ "data-report-money": true },
          cardHead(t("reports.money")),
          priceRows([
            { label: t("reports.products"), value: money(report.productsCents) },
            { label: t("reports.shipping"), value: money(report.shippingCents) },
            { label: t("reports.tax"), value: money(report.taxCents) },
            { label: t("reports.kpi.gross"), value: money(report.grossCents) },
            { label: t("reports.refundsCount", { n: report.refunds.count }), value: `−${money(report.refunds.cents)}`, class: report.refunds.cents ? "price-row--bad" : "" },
          ], money(report.netCents), t("reports.kpi.net")),
          el("p", { class: "hint" }, t("reports.moneyHint"))),
        card({ "data-report-shipping": true },
          cardHead(t("reports.shipVsAmazon")),
          ship.orders
            ? priceRows([
              { label: t("reports.shipCharged", { n: ship.orders }), value: money(ship.chargedCents) },
              { label: t("reports.amazonFee"), value: money(ship.feeCents) },
            ], `${ship.differenceCents < 0 ? "−" : ""}${money(Math.abs(ship.differenceCents))}`, t("reports.difference"))
            : el("p", { class: "hint" }, t("reports.noEstimates")),
          ship.withoutEstimate > 0 && el("p", { class: "hint" }, t("reports.withoutEstimate", { n: ship.withoutEstimate }))),
        card({ "data-report-exports": true },
          cardHead(t("reports.exports")),
          el("p", { class: "hint" }, t("reports.exportsHint", { range })),
          el("div", { class: "button-row" }, exportButton("orders"), exportButton("payments")),
          exportMessage))),
  );
}
