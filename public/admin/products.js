// Products (M9 商品, D50): the list with price, stock and sales, and one product's page with its sales over 14 days,
// stock at Amazon, details, changes and the owners' stop-selling switch (A4, M2-04, M9-07). API: GET
// /admin/api/products[/:id], POST /admin/api/products/:id/sale (worker/products.js). Editing price, text and photos
// comes with PR 3-12 (D52).
import { formatDate, t } from "./i18n.js";
import { badge, card, cardHead, el, icon, money, notice, routineTile } from "./ui.js";

const stockText = (stock) => (stock?.connected ? String(stock.available ?? "—") : t("products.stockNotConnected"));
const saleBadge = (product) => (product.onSale ? badge("ok", t("products.onSale"), { "data-on-sale": "true" }) : badge("bad", t("products.stopped"), { "data-on-sale": "false" }));

export async function renderProducts(host, { adminApi, isCurrent }) {
  const { products } = await adminApi("/admin/api/products");
  if (!isCurrent()) return;
  const stopped = products.filter((product) => !product.onSale).length;
  host.replaceChildren(
    el("header", { class: "page-head" },
      el("p", { class: "eyebrow" }, t("products.eyebrow", { n: products.length })),
      el("h1", { class: "page-title" }, t("nav.products"))),
    el("section", { class: "card card--flush" },
      el("div", { class: "card__pad" }, el("div", { class: "view-chips" },
        el("span", { class: "view-chip", "aria-pressed": "true" }, t("products.all"), el("span", { class: "view-chip__n" }, String(products.length))),
        el("span", { class: "view-chip" }, t("products.onSale"), el("span", { class: "view-chip__n" }, String(products.length - stopped))),
        el("span", { class: "view-chip" }, t("products.stopped"), el("span", { class: "view-chip__n" }, String(stopped))))),
      el("div", { class: "table-wrap" }, el("table", { class: "tbl tbl--products" },
        el("thead", {}, el("tr", {}, ...["product", "status", "stock", "price", "sold", "refunds"].map((key) => el("th", { scope: "col", class: ["price", "sold", "refunds"].includes(key) ? "num" : null }, t(`products.col.${key}`))))),
        el("tbody", {}, ...products.map((product) => el("tr", { "data-product": product.id },
          el("td", {}, el("a", { class: "product-cell", href: `#/products/${product.id}` },
            routineTile(product.routine),
            el("span", {}, el("span", { class: "cell-main" }, product.name), el("span", { class: "cell-sub" }, `${product.sku} · ${product.size}`)))),
          el("td", {}, saleBadge(product)),
          el("td", {}, el("span", { class: "cell-main muted" }, stockText(product.stock)), el("span", { class: "cell-sub" }, t("products.thresholdShort", { n: product.stock.threshold }))),
          el("td", { class: "num" }, money(product.priceCents)),
          el("td", { class: "num" }, String(product.sales.soldMonth)),
          el("td", { class: "num muted" }, String(product.sales.refunds30)))))))),
    el("div", { class: "note-grid" },
      el("div", { class: "card note-card", role: "note" }, icon("products", 22),
        el("div", {}, el("p", { class: "note-card__title" }, t("products.stockTitle")), el("p", { class: "hint" }, t("products.stockText", { n: products[0]?.stock.threshold ?? 5 })))),
      el("div", { class: "card note-card", role: "note" }, icon("info", 22),
        el("div", {}, el("p", { class: "note-card__title" }, t("products.editTitle")), el("p", { class: "hint" }, t("products.editText"))))),
  );
}

export async function renderProduct(host, { route, adminApi, isCurrent, me }) {
  const product = await adminApi(`/admin/api/products/${encodeURIComponent(route.id)}`);
  if (!isCurrent()) return;
  const owner = me?.role === "owner";
  const outcome = el("div", { "aria-live": "polite", "data-product-outcome": true });

  function draw(current, result) {
    const max = Math.max(1, ...current.sales.days.map((day) => day.qty));
    const total14 = current.sales.days.reduce((sum, day) => sum + day.qty, 0);
    const chart = el("div", { class: "bars", role: "img", "aria-label": t("products.chartLabel", { n: total14 }) },
      el("div", { class: "bars__plot" }, ...current.sales.days.map((day, index) => el("span", {
        class: `bars__bar${index === current.sales.days.length - 1 ? " bars__bar--today" : ""}`,
        style: `height: ${Math.max(2, Math.round((day.qty / max) * 100))}%`,
        title: `${day.day}: ${day.qty}`,
      }))),
      el("div", { class: "bars__axis" }, el("span", {}, current.sales.days[0]?.day ?? ""), el("span", {}, current.sales.days.at(-1)?.day ?? "")));

    const stat = (label, value) => el("div", { class: "stat" }, el("span", { class: "stat__label" }, label), el("span", { class: "stat__value" }, value));

    host.replaceChildren(
      el("a", { class: "back-link", href: "#/products" }, icon("back", 16), t("nav.products")),
      el("header", { class: "page-head page-head--split" },
        el("div", { class: "product-head" },
          routineTile(current.routine, "lg"),
          el("div", {},
            el("div", { class: "page-head__id" }, el("h1", { class: "page-title page-title--product" }, current.name), saleBadge(current)),
            el("p", { class: "page-sub" }, `${current.sku} · ${current.size} · ${current.routine === "wet" ? "WET" : "DRY"} · ${money(current.priceCents)}`))),
        current.page && el("a", { class: "btn btn--ghost", href: current.page, target: "_blank", rel: "noopener" }, t("products.viewOnSite"), icon("external", 16))),
      outcome,
      el("div", { class: "split" },
        el("div", { class: "split__main" },
          card({ "data-product-sales": true },
            cardHead(t("products.sales"), el("span", { class: "card__meta" }, t("products.salesRange"))),
            el("div", { class: "stat-grid" },
              stat(t("products.soldMonth"), String(current.sales.soldMonth)),
              stat(t("products.revenueMonth"), money(current.sales.revenueMonthCents)),
              stat(t("products.refunds30"), String(current.sales.refunds30)),
              stat(t("products.orderShare"), `${current.sales.monthOrderShare}%`)),
            chart),
          card({ "data-product-stock": true },
            cardHead(t("products.stock"), badge(current.stock.connected ? "ok" : "muted", t(current.stock.connected ? "products.stockConnected" : "products.stockNotConnected"))),
            el("div", { class: "stat-grid" },
              stat(t("products.available"), current.stock.connected ? String(current.stock.available) : "—"),
              stat(t("products.inbound"), current.stock.connected ? String(current.stock.inbound) : "—"),
              stat(t("products.reserved"), current.stock.connected ? String(current.stock.reserved) : "—"),
              stat(t("products.threshold"), String(current.stock.threshold))),
            el("p", { class: "callout" }, t("products.stockNote", { n: current.stock.threshold }))),
          card({ "data-product-details": true },
            cardHead(t("products.details")),
            el("dl", { class: "facts" }, ...[
              [t("products.f.name"), current.name],
              [t("products.f.promise"), current.details.promise],
              [t("products.f.when"), current.details.when],
              [t("products.f.lasts"), current.details.lasts],
              [t("products.f.size"), [current.size, current.oz].filter(Boolean).join(" · ")],
              [t("products.f.price"), money(current.priceCents)],
              [t("products.f.scope"), current.details.scope],
              [t("products.f.sku"), current.sku],
              [t("products.f.amazonSku"), current.amazonSku ?? t("products.notMapped")],
              [t("products.f.page"), current.page],
            ].flatMap(([label, value]) => [el("dt", {}, label), el("dd", {}, value ?? "—")])),
            el("p", { class: "callout" }, t("products.editText")))),
        el("aside", { class: "split__aside" },
          saleCard(current),
          card({ "data-product-history": true },
            cardHead(t("products.history")),
            current.history?.length
              ? el("ul", { class: "history" }, ...current.history.map((entry) => el("li", {},
                el("span", { class: "history__what" }, `${t(`action.${entry.action}`)}${entry.reason ? ` · ${entry.reason}` : ""}`),
                el("span", { class: "history__meta" }, `${entry.actor} · ${formatDate(entry.at)}`))))
              : el("p", { class: "hint" }, t("products.noChanges"))),
          card({ "data-product-channels": true },
            cardHead(t("products.channels")),
            el("div", { class: "channel" }, el("span", {}, el("span", { class: "cell-main" }, "www.shopapgo.com"), el("span", { class: "cell-sub" }, t("products.channelSite"))), saleBadge(current)),
            el("div", { class: "channel" }, el("span", {}, el("span", { class: "cell-main" }, "Amazon.com"), el("span", { class: "cell-sub" }, t("products.channelAmazon"))), badge("muted", t("products.separate")))))),
    );
    outcome.replaceChildren(...[result].filter(Boolean));
  }

  // The switch (owners only): Stop selling asks first and says what happens; Resume selling is one step.
  function saleCard(current) {
    const confirmBox = el("div", { class: "confirm", role: "alertdialog", "aria-labelledby": "stop-title", hidden: true, "data-stop-confirm": true });
    const message = el("div", { "aria-live": "polite" });
    const reason = el("input", { id: "stop-reason", type: "text", maxlength: "300", autocomplete: "off" });
    const set = async (onSale, button) => {
      button.disabled = true;
      try {
        const result = await adminApi(`/admin/api/products/${encodeURIComponent(current.id)}/sale`, { method: "POST", body: { onSale, reason: reason.value } });
        draw(result.product, notice("success", t(onSale ? "products.resumedTitle" : "products.stoppedTitle"), t(onSale ? "products.resumedBody" : "products.stoppedBody", { name: current.name })));
      } catch (error) {
        button.disabled = false;
        message.replaceChildren(notice("warning", t("products.notChanged"), error.message));
      }
    };
    const stop = el("button", { class: "btn btn--danger-ghost", type: "button", "data-stop-selling": true }, t("products.stop"));
    const resume = el("button", { class: "btn btn--primary", type: "button", "data-resume-selling": true }, t("products.resume"));
    const confirmStop = el("button", { class: "btn btn--danger", type: "button", "data-confirm-stop": true }, t("products.stopConfirm"));
    const keep = el("button", { class: "btn btn--ghost", type: "button" }, t("products.keep"));
    confirmBox.append(
      el("p", { class: "confirm__title", id: "stop-title" }, t("products.stopTitle", { name: current.name })),
      el("ul", { class: "confirm__list" }, el("li", {}, t("products.effect1")), el("li", {}, t("products.effect2")), el("li", {}, t("products.effect3"))),
      el("div", { class: "field" }, el("label", { class: "field__label", for: "stop-reason" }, t("products.reason")), reason),
      el("div", { class: "button-row" }, confirmStop, keep));
    stop.addEventListener("click", () => {
      confirmBox.hidden = false;
      stop.hidden = true;
      reason.focus();
    });
    keep.addEventListener("click", () => {
      confirmBox.hidden = true;
      stop.hidden = false;
      stop.focus();
    });
    confirmStop.addEventListener("click", () => set(false, confirmStop));
    resume.addEventListener("click", () => set(true, resume));
    return card({ class: current.onSale ? "" : "card--alert", "data-product-sale": current.onSale ? "on" : "off" },
      cardHead(t("products.sellTitle")),
      el("p", { class: "sale-state" }, el("span", { class: `dot dot--${current.onSale ? "ok" : "bad"}` }), t(current.onSale ? "products.sellingNow" : "products.stoppedNow")),
      el("p", { class: "hint" }, t(current.onSale ? "products.sellingText" : "products.stoppedText")),
      current.changedAt && el("p", { class: "hint" }, t("products.changedBy", { who: current.changedBy, at: formatDate(current.changedAt) })),
      owner ? [current.onSale ? [stop, confirmBox] : resume, message] : el("p", { class: "hint", "data-owner-only": true }, t("products.ownerOnlyMember")),
      owner && el("p", { class: "fine-print" }, t("products.ownerOnly")));
  }

  draw(product);
}
