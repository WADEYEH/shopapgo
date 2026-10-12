// Products (M9 商品, D50): the list with price, stock and sales, and one product's page with its sales over 14 days,
// stock at Amazon, details, changes and the owners' stop-selling switch (A4, M2-04, M9-07). API: GET
// /admin/api/products[/:id], POST /admin/api/products/:id/sale (worker/products.js).
//
// Owners change the price, words and photos here (D52; D61–D64, PR 3-12; worker/product-content.js): edit, then a
// review of before and after (the Worker says what would change), then publish: live at once. Every publish is a
// version; any version, or the site's original, can be put back. Photos are made smaller in this browser before they
// are uploaded (WebP, 1600 pixels at most). Members see everything and change nothing.
import { formatDate, t } from "./i18n.js";
import { badge, card, cardHead, el, field, icon, money, notice, routineTile } from "./ui.js";

const stockText = (stock) => (stock?.connected ? String(stock.available ?? "—") : t("products.stockNotConnected"));
const saleBadge = (product) => (product.onSale ? badge("ok", t("products.onSale"), { "data-on-sale": "true" }) : badge("bad", t("products.stopped"), { "data-on-sale": "false" }));

// The fields an owner can change, in the order the editor shows them; seoTitle and seoDescription may stay empty (the
// site's own then).
const TEXT = ["name", "promise", "when", "lasts", "scope", "seoTitle", "seoDescription"];
const LONG = new Set(["promise", "scope", "seoDescription"]);
const AUTOMATIC = new Set(["seoTitle", "seoDescription"]);
const fieldLabel = (key) => t(`products.f.${key}`);
const MAX_SIDE = 1600;

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
            product.image ? el("img", { class: "product-thumb", src: product.image, alt: "", width: "56", height: "56" }) : routineTile(product.routine),
            el("span", {}, el("span", { class: "cell-main" }, product.name), el("span", { class: "cell-sub" }, `${product.sku} · ${product.size}`)))),
          el("td", {}, saleBadge(product), product.edited && badge("neutral", t("products.edited"), { "data-edited": true })),
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

// A photo the owner chose, made smaller here: WebP (JPEG where the browser cannot make WebP), 1600 pixels at most on
// the longer side, under 2 MB. Returns { blob, width, height }.
async function preparePhoto(file) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error(t("products.photoUnreadable"));
  if (Math.min(bitmap.width, bitmap.height) < 200) throw new Error(t("products.photoTooSmall"));
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = Object.assign(document.createElement("canvas"), { width, height });
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  const encode = (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await encode("image/webp", 0.86);
  if (blob?.type !== "image/webp") blob = await encode("image/jpeg", 0.88);
  for (const quality of [0.75, 0.6]) if (blob && blob.size > 2 * 1024 * 1024) blob = await encode(blob.type, quality);
  if (!blob || blob.size > 2 * 1024 * 1024) throw new Error(t("products.photoTooLarge"));
  return { blob, width, height };
}

// What a change looks like in the review and the versions: text as it is, the price in dollars, photos as small images.
function shownValue(key, value) {
  if (key === "priceCents") return money(value);
  if (key === "images") return el("span", { class: "photo-strip" }, ...(value ?? []).map((image) => el("img", { src: image.src, alt: image.alt ?? "", title: image.alt ?? "", width: "48", height: "48" })));
  return value || "—";
}
const changesTable = (changes) => el("table", { class: "tbl tbl--diff", "data-content-diff": true },
  el("thead", {}, el("tr", {}, el("th", { scope: "col" }, t("products.diffField")), el("th", { scope: "col" }, t("products.before")), el("th", { scope: "col" }, t("products.after")))),
  el("tbody", {}, ...Object.entries(changes).map(([key, change]) => el("tr", { "data-change": key },
    el("th", { scope: "row" }, fieldLabel(key)),
    el("td", { class: "diff-before" }, shownValue(key, change.before)),
    el("td", { class: "diff-after" }, shownValue(key, change.after))))));

export async function renderProduct(host, { route, adminApi, isCurrent, me }) {
  const product = await adminApi(`/admin/api/products/${encodeURIComponent(route.id)}`);
  if (!isCurrent()) return;
  const owner = me?.role === "owner";
  const outcome = el("div", { "aria-live": "polite", "data-product-outcome": true });
  const path = (action) => `/admin/api/products/${encodeURIComponent(product.id)}/${action}`;

  // editing: draw the editor in place of the details.
  function draw(current, result, editing = false) {
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
          current.image ? el("img", { class: "product-thumb product-thumb--lg", src: current.image, alt: "", width: "72", height: "72" }) : routineTile(current.routine, "lg"),
          el("div", {},
            el("div", { class: "page-head__id" }, el("h1", { class: "page-title page-title--product" }, current.name), saleBadge(current)),
            el("p", { class: "page-sub" }, `${current.sku} · ${current.size} · ${current.routine === "wet" ? "WET" : "DRY"} · ${money(current.priceCents)}`))),
        current.page && el("a", { class: "btn btn--ghost", href: current.page, target: "_blank", rel: "noopener" }, t("products.viewOnSite"), icon("external", 16))),
      outcome,
      el("div", { class: "split" },
        el("div", { class: "split__main" },
          editing ? editorCard(current) : null,
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
          editing ? null : detailsCard(current)),
        el("aside", { class: "split__aside" },
          saleCard(current),
          current.content && versionsCard(current),
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

  function detailsCard(current) {
    const live = current.content?.live;
    const edit = el("button", { class: "btn btn--primary", type: "button", "data-edit-product": true }, t("products.edit"));
    edit.addEventListener("click", () => draw(current, null, true));
    return card({ "data-product-details": true },
      cardHead(t("products.details"), current.content?.version ? badge("neutral", t("products.versionN", { n: current.content.version })) : null),
      live && el("div", { class: "photo-strip photo-strip--lg", "data-product-photos": true }, ...live.images.map((image) => el("img", { src: image.src, alt: image.alt, width: "96", height: "96" }))),
      el("dl", { class: "facts" }, ...[
        [t("products.f.name"), current.name],
        [t("products.f.promise"), current.details.promise],
        [t("products.f.when"), current.details.when],
        [t("products.f.lasts"), current.details.lasts],
        [t("products.f.size"), [current.size, current.oz].filter(Boolean).join(" · ")],
        [t("products.f.price"), money(current.priceCents)],
        [t("products.f.scope"), current.details.scope],
        live && [t("products.f.seoTitle"), live.seoTitle],
        live && [t("products.f.seoDescription"), live.seoDescription],
        [t("products.f.sku"), current.sku],
        [t("products.f.amazonSku"), current.amazonSku ?? t("products.notMapped")],
        [t("products.f.page"), current.page],
      ].filter(Boolean).flatMap(([label, value]) => [el("dt", {}, label), el("dd", {}, value ?? "—")])),
      current.content?.updatedAt && el("p", { class: "hint" }, t("products.lastPublished", { who: current.content.updatedBy, at: formatDate(current.content.updatedAt) })),
      current.content && (owner ? el("div", { class: "button-row" }, edit) : el("p", { class: "hint", "data-owner-only": true }, t("products.editOwnerOnly"))));
  }

  // The editor: every field with what is live now, the price, and the photos (first = main photo). Review asks the
  // Worker what would change (nothing is saved); Publish saves it, live at once.
  function editorCard(current) {
    const content = current.content;
    const message = el("div", { "aria-live": "polite", "data-edit-message": true });
    const review = el("div", { "data-edit-review": true });
    const inputs = {};
    const placeholderOf = (key) => (key === "seoTitle" ? content.original.seoTitle : key === "seoDescription" ? t("products.seoAuto") : "");
    for (const key of TEXT) {
      const value = AUTOMATIC.has(key) ? content.overrides[key] ?? "" : content.live[key];
      const attrs = { id: `edit-${key}`, maxlength: String(content.limits[key]), "data-edit-field": key, placeholder: placeholderOf(key) || null };
      inputs[key] = LONG.has(key) ? el("textarea", { ...attrs, rows: key === "promise" ? "2" : "3" }, value) : el("input", { ...attrs, type: "text", value, autocomplete: "off" });
    }
    const price = el("input", { id: "edit-price", type: "text", inputmode: "decimal", value: (content.live.priceCents / 100).toFixed(2), autocomplete: "off", "data-edit-field": "priceCents" });

    // The photos: { src, alt (the owner's own description, "" = automatic), auto (what shows without one) }.
    let photos = (content.overrides.images ?? content.defaults.images).map((image, index) => ({ src: image.src, alt: content.overrides.images ? image.alt ?? "" : "", auto: content.live.images[index]?.alt ?? "" }));
    const photoList = el("ol", { class: "photo-list", "data-edit-photos": true });
    const photoMessage = el("div", { "aria-live": "polite" });
    const upload = el("input", { id: "edit-photo", type: "file", accept: "image/webp,image/jpeg,image/png", class: "visually-hidden", "data-photo-upload": true });
    const uploadButton = el("label", { class: "btn btn--sm", for: "edit-photo" }, t("products.photoAdd"));
    const drawPhotos = () => {
      photoList.replaceChildren(...photos.map((photo, index) => {
        const alt = el("input", { type: "text", value: photo.alt, maxlength: String(content.limits.alt), placeholder: photo.auto || t("products.photoAltAuto"), "aria-label": t("products.photoAlt", { n: index + 1 }), "data-photo-alt": index });
        alt.addEventListener("input", () => { photo.alt = alt.value; });
        const move = (to) => {
          photos.splice(to, 0, photos.splice(index, 1)[0]);
          drawPhotos();
        };
        const button = (label, action, attrs, disabled = false) => {
          const node = el("button", { class: "btn btn--sm btn--ghost", type: "button", disabled, ...attrs }, label);
          node.addEventListener("click", action);
          return node;
        };
        return el("li", { class: "photo-item", "data-photo": photo.src },
          el("img", { src: photo.src, alt: "", width: "72", height: "72" }),
          el("div", { class: "photo-item__body" },
            el("span", { class: "cell-sub" }, index === 0 ? t("products.photoMain") : t("products.photoN", { n: index + 1 })),
            alt),
          el("div", { class: "button-row" },
            button("↑", () => move(index - 1), { "aria-label": t("products.photoUp"), "data-photo-up": index }, index === 0),
            button("↓", () => move(index + 1), { "aria-label": t("products.photoDown"), "data-photo-down": index }, index === photos.length - 1),
            button(t("products.photoRemove"), () => { photos.splice(index, 1); drawPhotos(); }, { "data-photo-remove": index }, photos.length === 1)));
      }));
      uploadButton.hidden = photos.length >= content.limits.images;
    };
    upload.addEventListener("change", async () => {
      const file = upload.files?.[0];
      upload.value = "";
      if (!file) return;
      photoMessage.replaceChildren(notice("info", t("products.photoUploading")));
      try {
        const image = await preparePhoto(file);
        const { image: saved } = await adminApi(path("images"), { method: "POST", image });
        photos.push({ src: saved.src, alt: "", auto: "" });
        drawPhotos();
        photoMessage.replaceChildren(notice("success", t("products.photoUploaded")));
      } catch (error) {
        photoMessage.replaceChildren(notice("warning", t("products.photoNotUploaded"), error.message));
      }
    });
    const resetPhotos = el("button", { class: "btn btn--sm btn--text", type: "button", "data-photo-reset": true }, t("products.photoReset"));
    resetPhotos.addEventListener("click", () => {
      photos = content.defaults.images.map((image) => ({ src: image.src, alt: "", auto: image.alt }));
      drawPhotos();
    });
    drawPhotos();

    // What the Worker gets: every field, the price in cents, the photos.
    const draft = () => {
      const dollars = price.value.trim().replace(/^\$/, "");
      if (!/^\d{1,4}(\.\d{1,2})?$/.test(dollars)) throw Object.assign(new Error(t("products.priceInvalid")), { field: "priceCents" });
      return {
        ...Object.fromEntries(TEXT.map((key) => [key, inputs[key].value])),
        priceCents: Math.round(Number(dollars) * 100),
        images: photos.map(({ src, alt }) => ({ src, alt: alt.trim() })),
      };
    };
    const send = (dryRun) => adminApi(path("content"), { method: "POST", body: { content: draft(), expectedVersion: content.version, dryRun } });

    const reviewButton = el("button", { class: "btn btn--primary", type: "button", "data-edit-review-button": true }, t("products.review"));
    const cancel = el("button", { class: "btn btn--ghost", type: "button", "data-edit-cancel": true }, t("products.cancelEdit"));
    cancel.addEventListener("click", () => draw(current));
    reviewButton.addEventListener("click", async () => {
      message.replaceChildren();
      review.replaceChildren();
      reviewButton.disabled = true;
      try {
        const { changes } = await send(true);
        if (!Object.keys(changes).length) {
          message.replaceChildren(notice("info", t("products.noDiff")));
          return;
        }
        const publish = el("button", { class: "btn btn--primary", type: "button", "data-edit-publish": true }, t("products.publish"));
        const back = el("button", { class: "btn btn--ghost", type: "button" }, t("products.backToEdit"));
        back.addEventListener("click", () => {
          review.replaceChildren();
          reviewButton.focus();
        });
        publish.addEventListener("click", async () => {
          publish.disabled = true;
          try {
            const result = await send(false);
            draw(result.product, notice("success", t("products.publishedTitle"), t("products.publishedBody", { n: result.version })));
          } catch (error) {
            publish.disabled = false;
            message.replaceChildren(notice("warning", t("products.notPublished"), error.message));
          }
        });
        review.replaceChildren(el("div", { class: "confirm", role: "group", "aria-labelledby": "review-title" },
          el("p", { class: "confirm__title", id: "review-title" }, t("products.reviewTitle")),
          changesTable(changes),
          changes.priceCents && el("p", { class: "callout", "data-price-change": true }, t("products.priceNote")),
          el("div", { class: "button-row" }, publish, back)));
        publish.focus();
      } catch (error) {
        message.replaceChildren(notice("warning", t("products.notReviewed"), error.message));
        (error.field === "priceCents" ? price : inputs[error.field])?.focus();
      } finally {
        reviewButton.disabled = false;
      }
    });

    return card({ "data-product-editor": true },
      cardHead(t("products.editTitle"), badge("neutral", t("products.versionN", { n: content.version }))),
      el("p", { class: "callout", "data-ftc": true }, t("products.ftc")),
      el("div", { class: "form-stack" },
        el("div", { class: "form-grid" },
          field("edit-name", fieldLabel("name"), inputs.name),
          field("edit-price", fieldLabel("price"), price, t("products.priceHint"))),
        field("edit-promise", fieldLabel("promise"), inputs.promise),
        el("div", { class: "form-grid" },
          field("edit-when", fieldLabel("when"), inputs.when),
          field("edit-lasts", fieldLabel("lasts"), inputs.lasts, t("products.lastsHint"))),
        field("edit-scope", fieldLabel("scope"), inputs.scope),
        el("div", { class: "sub" },
          el("h3", { class: "sub__title" }, t("products.photos")),
          el("p", { class: "hint" }, t("products.photosHint", { n: content.limits.images })),
          photoList,
          el("div", { class: "button-row" }, upload, uploadButton, resetPhotos),
          photoMessage),
        el("div", { class: "sub" },
          el("h3", { class: "sub__title" }, t("products.search")),
          field("edit-seoTitle", fieldLabel("seoTitle"), inputs.seoTitle, t("products.seoTitleHint")),
          field("edit-seoDescription", fieldLabel("seoDescription"), inputs.seoDescription, t("products.seoDescriptionHint"))),
        message,
        el("div", { class: "button-row" }, reviewButton, cancel),
        review));
  }

  // Every publish, newest first, and the original. Putting one back shows what would change first.
  function versionsCard(current) {
    const content = current.content;
    const box = el("div", { "aria-live": "polite", "data-restore-box": true });
    const restore = async (version, button) => {
      box.replaceChildren();
      button.disabled = true;
      const send = (dryRun) => adminApi(path("restore"), { method: "POST", body: { version, expectedVersion: content.version, dryRun } });
      try {
        const { changes } = await send(true);
        if (!Object.keys(changes).length) {
          box.replaceChildren(notice("info", t("products.noDiff")));
          return;
        }
        const go = el("button", { class: "btn btn--primary btn--sm", type: "button", "data-restore-confirm": version }, t("products.restoreConfirm"));
        const keep = el("button", { class: "btn btn--ghost btn--sm", type: "button" }, t("products.keep"));
        keep.addEventListener("click", () => box.replaceChildren());
        go.addEventListener("click", async () => {
          go.disabled = true;
          try {
            const result = await send(false);
            draw(result.product, notice("success", t("products.restoredTitle"), t(version === 0 ? "products.restoredOriginal" : "products.restoredBody", { n: version })));
          } catch (error) {
            go.disabled = false;
            box.replaceChildren(notice("warning", t("products.notRestored"), error.message));
          }
        });
        box.replaceChildren(el("div", { class: "confirm", role: "group", "aria-labelledby": "restore-title" },
          el("p", { class: "confirm__title", id: "restore-title" }, t(version === 0 ? "products.restoreOriginalTitle" : "products.restoreTitle", { n: version })),
          changesTable(changes),
          el("p", { class: "hint" }, t("products.restoreNote")),
          el("div", { class: "button-row" }, go, keep)));
        go.focus();
      } catch (error) {
        box.replaceChildren(notice("warning", t("products.notRestored"), error.message));
      } finally {
        button.disabled = false;
      }
    };
    const restoreButton = (version) => {
      const button = el("button", { class: "btn btn--sm btn--ghost", type: "button", "data-restore": version }, t(version === 0 ? "products.restoreOriginal" : "products.restore"));
      button.addEventListener("click", () => restore(version, button));
      return button;
    };
    const row = (version, title, meta) => el("li", { "data-version": version },
      el("span", { class: "history__what" }, title, version === content.version ? [" ", badge("ok", t("products.liveNow"))] : null),
      meta && el("span", { class: "history__meta" }, meta),
      owner && version !== content.version ? restoreButton(version) : null);
    return card({ "data-product-versions": true },
      cardHead(t("products.versions")),
      el("ul", { class: "history" },
        ...content.versions.map((entry) => row(entry.version,
          entry.restoredFrom === null ? t("products.versionN", { n: entry.version }) : t("products.versionRestored", { n: entry.version, from: entry.restoredFrom }),
          [entry.changed.length ? entry.changed.map(fieldLabel).join(t("products.listSep")) : null, `${entry.by} · ${formatDate(entry.at)}`].filter(Boolean).join(" · "))),
        row(0, t("products.original"), t("products.originalText"))),
      box,
      !owner && el("p", { class: "hint" }, t("products.editOwnerOnly")));
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
