// Customers (M9 顾客, I7, M9-13, D34): everyone who paid, by email (there are no accounts). The list has orders, money
// spent after refunds, the last order and the marketing choice; a customer's page has their orders, addresses, Contact
// us messages, internal notes, and their privacy requests: export the data or delete it, amounts kept (E11, M9-14,
// M11-05, D53, D54). A customer is opened by one of their order numbers, so no email is ever in an address.
// API: GET /admin/api/customers[/:ref], POST .../notes | .../privacy-requests | .../erase, GET .../export,
// POST /admin/api/privacy-requests/:id/close (worker/customers.js, worker/customer-privacy.js).
import { downloadFile } from "./api.js";
import { formatDate, t, when } from "./i18n.js";
import { badge, card, cardHead, el, field, icon, money, notice, usPhone } from "./ui.js";
import { paymentBadge, shippingBadge } from "./orders.js";

const SORTS = ["last", "orders", "spent", "name"];
const NOTE_MAX = 1000;
const today = () => new Date().toISOString().slice(0, 10);

// ---------- the list ----------

export async function renderCustomers(host, { route, adminApi, isCurrent, navigate }) {
  const q = route.params.get("q") ?? "";
  const sort = SORTS.includes(route.params.get("sort")) ? route.params.get("sort") : "last";
  const go = (next) => {
    const params = new URLSearchParams({ ...(next.q ? { q: next.q } : {}), ...(next.sort && next.sort !== "last" ? { sort: next.sort } : {}) });
    navigate(`#/customers${params.toString() ? `?${params}` : ""}`);
  };
  const query = (page) => new URLSearchParams({ ...(q ? { q } : {}), sort, ...(page ? { page: String(page) } : {}) });
  const first = await adminApi(`/admin/api/customers?${query(0)}`);
  if (!isCurrent()) return;
  const state = { customers: first.customers, nextPage: first.nextPage };

  const sortSelect = el("select", { id: "customers-sort", name: "sort", "data-customers-sort": true },
    ...SORTS.map((key) => el("option", { value: key, selected: key === sort }, t(`customers.sort.${key}`))));
  sortSelect.addEventListener("change", () => go({ q, sort: sortSelect.value }));
  const search = el("form", { class: "toolbar", role: "search", "data-customers-search": true },
    el("label", { class: "search search--grow" },
      icon("search", 18),
      el("span", { class: "visually-hidden" }, t("customers.searchLabel")),
      el("input", { type: "search", name: "q", value: q, autocomplete: "off", placeholder: t("customers.searchPlaceholder"), "aria-label": t("customers.searchLabel") })),
    el("button", { class: "btn btn--ghost", type: "submit" }, t("orders.search")),
    q && el("button", { class: "btn btn--text", type: "button", onclick: () => go({ q: "", sort }) }, t("orders.clearSearch")),
    el("label", { class: "inline-field", for: "customers-sort" }, t("customers.sortLabel"), el("span", { class: "select" }, sortSelect)));
  search.addEventListener("submit", (event) => {
    event.preventDefault();
    go({ q: new FormData(search).get("q").toString().trim(), sort });
  });

  const body = el("tbody", { "data-customers-list": true });
  const more = el("div", { class: "table-foot" });
  const renderRows = () => {
    body.replaceChildren(...(state.customers.length
      ? state.customers.map((c) => el("tr", { "data-customer": c.ref },
        el("td", {}, el("a", { class: "order-link", href: `#/customers/${encodeURIComponent(c.ref)}` }, c.name || c.email),
          el("span", { class: "cell-sub" }, c.email)),
        el("td", { class: "nowrap muted" }, c.phone ? usPhone(c.phone) : "—"),
        el("td", { class: "muted" }, [c.city, c.state].filter(Boolean).join(", ") || "—"),
        el("td", { class: "num" }, String(c.orders)),
        el("td", { class: "num" }, money(c.spentCents)),
        el("td", { class: "nowrap muted" }, when(c.lastOrderAt)),
        el("td", {}, c.marketingOptIn ? badge("ok", t("customers.marketingYes")) : el("span", { class: "muted" }, t("customers.marketingNo")))))
      : [el("tr", {}, el("td", { colspan: "7", class: "table-empty" }, t(q ? "customers.noneMatch" : "customers.none")))]));
    more.replaceChildren(...[
      el("span", { class: "muted" }, t("customers.shown", { n: state.customers.length, total: first.total })),
      state.nextPage !== null && el("button", { class: "btn btn--ghost", type: "button", "data-customers-more": true, onclick: loadMore }, t("orders.more")),
    ].filter(Boolean));
  };
  async function loadMore(event) {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const next = await adminApi(`/admin/api/customers?${query(state.nextPage)}`);
      state.customers = [...state.customers, ...next.customers];
      state.nextPage = next.nextPage;
      renderRows();
    } catch (error) {
      button.disabled = false;
      more.append(notice("warning", t("common.unavailable"), error.message));
    }
  }
  renderRows();

  host.replaceChildren(
    el("header", { class: "page-head" }, el("p", { class: "eyebrow" }, t("customers.eyebrow", { n: first.total })), el("h1", { class: "page-title" }, t("nav.customers"))),
    el("section", { class: "card card--flush" },
      el("div", { class: "card__pad" }, search, el("p", { class: "hint" }, t("customers.hint"))),
      el("div", { class: "table-wrap" }, el("table", { class: "tbl tbl--customers" },
        el("thead", {}, el("tr", {}, ...["customer", "phone", "place", "orders", "spent", "last", "marketing"].map((key) =>
          el("th", { scope: "col", class: ["orders", "spent"].includes(key) ? "num" : null }, t(`customers.col.${key}`))))),
        body)),
      more),
  );
}

// ---------- one customer ----------

export async function renderCustomer(host, ctx) {
  const ref = ctx.route.id;
  const customer = await ctx.adminApi(`/admin/api/customers/${encodeURIComponent(ref)}`);
  if (!ctx.isCurrent()) return;
  const outcome = el("div", { class: "outcome", "data-customer-outcome": true, "aria-live": "polite" });
  const show = (next, result) => {
    draw(next);
    outcome.replaceChildren(...[result].filter(Boolean));
  };

  function draw(current) {
    const back = el("a", { class: "back-link", href: "#/customers" }, icon("back", 16), t("nav.customers"));
    if (current.erased) {
      host.replaceChildren(back,
        el("header", { class: "page-head" }, el("h1", { class: "page-title" }, t("customers.erasedTitle"))),
        outcome,
        card({ "data-customer-erased": true }, el("p", {}, t("customers.erasedBody", { date: formatDate(current.erasedAt) })), el("p", { class: "hint" }, t("customers.erasedKept"))));
      return;
    }
    const stat = (label, value) => el("div", { class: "stat" }, el("span", { class: "stat__label" }, label), el("span", { class: "stat__value" }, value));
    host.replaceChildren(
      back,
      el("header", { class: "page-head page-head--split" },
        el("div", {},
          el("h1", { class: "page-title" }, current.name || current.email),
          el("p", { class: "page-sub" }, t("customers.since", { date: formatDate(current.firstOrderAt, { time: false }) })))),
      outcome,
      el("div", { class: "split" },
        el("div", { class: "split__main" },
          card({ "data-customer-numbers": true },
            el("div", { class: "stat-grid" },
              stat(t("customers.col.orders"), String(current.orders)),
              stat(t("customers.spent"), money(current.spentCents)),
              stat(t("customers.refunded"), money(current.refundedCents)),
              stat(t("customers.average"), money(current.orders ? Math.round(current.paidCents / current.orders) : 0)),
              stat(t("customers.col.last"), when(current.lastOrderAt)))),
          ordersCard(current),
          messagesCard(current),
          notesCard(current, ctx, show)),
        el("aside", { class: "split__aside" },
          contactCard(current),
          addressesCard(current),
          privacyCard(current, ctx, show))),
    );
  }
  draw(customer);
}

function ordersCard(customer) {
  return card({ class: "card--flush", "aria-label": t("customers.orders"), "data-customer-orders": true },
    el("div", { class: "card__pad" }, cardHead(t("customers.orders"), el("span", { class: "card__meta" }, t("orders.items", { n: customer.orderList.length })))),
    el("div", { class: "table-wrap" }, el("table", { class: "tbl" },
      el("thead", {}, el("tr", {}, ...["order", "date", "total", "payment", "shipping"].map((key) => el("th", { scope: "col", class: key === "total" ? "num" : null }, t(`orders.col.${key}`))))),
      el("tbody", {}, ...customer.orderList.map((order) => el("tr", { "data-order": order.id },
        el("td", { class: "nowrap" }, el("a", { class: "order-link", href: `#/orders/${encodeURIComponent(order.id)}` }, order.id)),
        el("td", { class: "nowrap muted" }, when(order.paidAt || order.createdAt)),
        el("td", { class: "num" }, money(order.totalCents)),
        el("td", {}, paymentBadge(order)),
        el("td", {}, shippingBadge(order))))))));
}

function messagesCard(customer) {
  return card({ "aria-label": t("customers.messages"), "data-customer-messages": true },
    cardHead(t("customers.messages")),
    customer.messages.length
      ? el("ul", { class: "record-list" }, ...customer.messages.map((message) => el("li", { class: "record" },
        el("div", { class: "record__head" }, el("strong", {}, message.name || "—"), el("small", {}, formatDate(message.at))),
        el("p", { class: "record__text" }, message.message))))
      : el("p", { class: "hint" }, t("customers.noMessages")));
}

function notesCard(customer, ctx, show) {
  const notes = [...customer.notes];
  const list = el("ol", { class: "timeline", "data-customer-notes-list": true });
  const render = () => list.replaceChildren(...[...notes].reverse().map((note) => el("li", { class: "timeline__item timeline__item--note", "data-note": note.id },
    el("div", { class: "note" },
      el("p", { class: "note__head" }, el("span", { class: "note__tag" }, t("notes.tag")), el("span", {}, `${note.author} · ${formatDate(note.at)}`)),
      el("p", { class: "note__body" }, note.body)))));
  render();
  const box = el("textarea", { id: "customer-note", rows: "3", maxlength: String(NOTE_MAX), placeholder: t("customers.notePlaceholder"), "data-note-input": true });
  const postButton = el("button", { class: "btn btn--primary", type: "submit", disabled: true, "data-note-post": true }, t("notes.post"));
  const message = el("div", { "aria-live": "polite" });
  box.addEventListener("input", () => {
    postButton.disabled = !box.value.trim();
  });
  const form = el("form", { class: "note-form", "data-note-form": true },
    el("label", { class: "field__label", for: "customer-note" }, t("customers.noteLabel")),
    box,
    el("div", { class: "note-form__foot" }, el("span", { class: "hint" }, t("notes.help")), postButton),
    message);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = box.value.trim();
    if (!body) return;
    postButton.disabled = true;
    try {
      const result = await ctx.adminApi(`/admin/api/customers/${encodeURIComponent(customer.ref)}/notes`, { method: "POST", body: { body } });
      notes.splice(0, notes.length, ...result.notes);
      box.value = "";
      message.replaceChildren();
      render();
    } catch (error) {
      postButton.disabled = false;
      message.replaceChildren(notice("warning", t("notes.notSaved"), error.message));
    }
  });
  return card({ "aria-label": t("customers.notes"), "data-customer-notes": true }, cardHead(t("customers.notes")), form, list);
}

function contactCard(customer) {
  return card({ "aria-label": t("order.customer"), "data-customer-contact": true },
    cardHead(t("customers.contact")),
    el("dl", { class: "facts" },
      el("dt", {}, t("order.email")), el("dd", {}, el("a", { href: `mailto:${customer.email}` }, customer.email)),
      el("dt", {}, t("order.phone")), el("dd", {}, customer.phone ? el("a", { href: `tel:${customer.phone}` }, usPhone(customer.phone)) : "—"),
      el("dt", {}, t("order.marketing")), el("dd", {}, t(customer.marketingOptIn ? "order.marketingYes" : "order.marketingNo"))));
}

function addressesCard(customer) {
  return card({ "aria-label": t("customers.addresses"), "data-customer-addresses": true },
    cardHead(t("customers.addresses")),
    ...customer.addresses.map((a) => el("address", { class: "address" },
      a.name, el("br"), a.street, a.street2 && [el("br"), a.street2], el("br"), `${a.city}, ${a.state} ${a.zip}`,
      el("br"), el("span", { class: "muted" }, t("customers.lastUsed", { date: formatDate(a.lastUsedAt, { time: false }) })))));
}

// ---------- privacy (E11, M9-14, M11-05) ----------

function privacyCard(customer, ctx, show) {
  const base = `/admin/api/customers/${encodeURIComponent(customer.ref)}`;
  const message = el("div", { "aria-live": "polite", "data-privacy-message": true });
  const requests = customer.privacyRequests ?? [];
  const blockers = customer.erasure?.blockers ?? [];

  // Open and closed requests, with the date to answer by.
  const list = requests.length
    ? el("ul", { class: "record-list" }, ...requests.map((request) => {
      const late = request.status === "open" && Date.parse(request.dueAt) < Date.now();
      const close = request.status === "open" && closeForm(request);
      return el("li", { class: "record", "data-privacy-request": request.status },
        el("div", { class: "record__head" },
          el("strong", {}, t(`privacy.kind.${request.kind}`)),
          request.status === "open" ? badge(late ? "bad" : "warn", t(late ? "privacy.late" : "privacy.open")) : badge("ok", t(`privacy.outcome.${request.outcome ?? "other"}`)),
          el("small", {}, t("privacy.received", { date: formatDate(request.receivedAt, { time: false }) }))),
        el("p", { class: "record__text" }, request.status === "open"
          ? t("privacy.dueBy", { date: formatDate(request.dueAt, { time: false }), who: request.handler })
          : t("privacy.closedBy", { who: request.closedBy ?? "—", date: formatDate(request.closedAt) })),
        request.note && el("p", { class: "hint" }, request.note),
        close);
    }))
    : el("p", { class: "hint" }, t("privacy.none"));

  function closeForm(request) {
    const outcome = el("select", { id: `close-${request.id}` }, ...["exported", "deleted", "other"].map((value) => el("option", { value, selected: (request.kind === "delete" ? "deleted" : "exported") === value }, t(`privacy.outcome.${value}`))));
    const button = el("button", { class: "btn btn--ghost btn--sm", type: "button", "data-privacy-close": request.id }, t("privacy.close"));
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await ctx.adminApi(`/admin/api/privacy-requests/${encodeURIComponent(request.id)}/close`, { method: "POST", body: { outcome: outcome.value } });
        show(await ctx.adminApi(base), notice("success", t("privacy.closedTitle"), t("privacy.closedText")));
      } catch (error) {
        button.disabled = false;
        message.replaceChildren(notice("warning", t("privacy.notSaved"), error.message));
      }
    });
    return el("div", { class: "button-row" }, el("label", { class: "inline-field", for: `close-${request.id}` }, t("privacy.answered"), el("span", { class: "select" }, outcome)), button);
  }

  // Record a new request: what was asked, the day it arrived, who answers it.
  const kind = el("select", { id: "privacy-kind", name: "kind" }, ...["access", "delete"].map((value) => el("option", { value }, t(`privacy.kind.${value}`))));
  const received = el("input", { id: "privacy-received", name: "receivedAt", type: "date", value: today(), max: today() });
  const handler = el("input", { id: "privacy-handler", name: "handler", type: "email", value: ctx.me?.email ?? "", autocomplete: "off" });
  const save = el("button", { class: "btn btn--ghost", type: "submit" }, t("privacy.record"));
  const recordForm = el("form", { class: "form-stack", hidden: true, "data-privacy-form": true },
    field("privacy-kind", t("privacy.kindLabel"), el("span", { class: "select" }, kind)),
    field("privacy-received", t("privacy.receivedLabel"), received, t("privacy.receivedHint")),
    field("privacy-handler", t("privacy.handlerLabel"), handler, t("privacy.handlerHint")),
    el("div", { class: "button-row" }, save));
  recordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      const result = await ctx.adminApi(`${base}/privacy-requests`, { method: "POST", body: { kind: kind.value, receivedAt: received.value, handler: handler.value.trim() } });
      show(result.customer, notice("success", t("privacy.recordedTitle"), t("privacy.recordedText")));
    } catch (error) {
      save.disabled = false;
      message.replaceChildren(notice("warning", t("privacy.notSaved"), error.message));
    }
  });
  const openRecord = el("button", { class: "btn btn--text btn--sm", type: "button", "data-privacy-new": true }, t("privacy.new"));
  openRecord.addEventListener("click", () => {
    recordForm.hidden = false;
    openRecord.hidden = true;
    kind.focus();
  });

  // Export: a JSON file with everything kept.
  const exportButton = el("button", { class: "btn btn--ghost", type: "button", "data-privacy-export": true }, icon("download", 16), t("privacy.export"));
  exportButton.addEventListener("click", async () => {
    exportButton.disabled = true;
    try {
      const name = await downloadFile(`${base}/export`);
      message.replaceChildren(notice("success", t("privacy.exportedTitle"), t("privacy.exportedText", { name })));
    } catch (error) {
      message.replaceChildren(notice("warning", t("privacy.exportFailed"), error.message));
    } finally {
      exportButton.disabled = false;
    }
  });

  // Delete: says what goes and what stays, lists what has to finish first, and asks for the email typed out.
  const confirmInput = el("input", { id: "erase-confirm", type: "email", autocomplete: "off", "data-erase-confirm": true });
  const eraseButton = el("button", { class: "btn btn--danger", type: "button", disabled: true, "data-erase-go": true }, t("privacy.eraseGo"));
  const keep = el("button", { class: "btn btn--ghost", type: "button" }, t("privacy.keep"));
  const eraseBox = el("div", { class: "confirm", role: "alertdialog", "aria-labelledby": "erase-title", hidden: true, "data-erase-box": true },
    el("p", { class: "confirm__title", id: "erase-title" }, t("privacy.eraseTitle")),
    el("ul", { class: "confirm__list" }, el("li", {}, t("privacy.eraseGoes")), el("li", {}, t("privacy.eraseStays")), el("li", {}, t("privacy.eraseElsewhere")), el("li", {}, t("privacy.eraseFinal"))),
    blockers.length
      ? notice("warning", t("privacy.blockedTitle"), blockers.map((b) => t(`privacy.blocker.${b.code}`, { id: b.orderId })).join(" "))
      : [field("erase-confirm", t("privacy.typeEmail", { email: customer.email }), confirmInput), el("div", { class: "button-row" }, eraseButton, keep)],
    blockers.length > 0 && el("div", { class: "button-row" }, keep));
  confirmInput.addEventListener("input", () => {
    eraseButton.disabled = confirmInput.value.trim().toLowerCase() !== customer.email.trim().toLowerCase();
  });
  const erase = el("button", { class: "btn btn--danger-ghost", type: "button", "data-erase": true }, t("privacy.erase"));
  erase.addEventListener("click", () => {
    eraseBox.hidden = false;
    erase.hidden = true;
    (blockers.length ? keep : confirmInput).focus();
  });
  keep.addEventListener("click", () => {
    eraseBox.hidden = true;
    erase.hidden = false;
    erase.focus();
  });
  eraseButton.addEventListener("click", async () => {
    eraseButton.disabled = true;
    try {
      const result = await ctx.adminApi(`${base}/erase`, { method: "POST", body: { confirm: confirmInput.value } });
      show(result.customer, notice("success", t("privacy.erasedTitle"), t("privacy.erasedText", { n: result.result.orders ?? 0 })));
    } catch (error) {
      eraseButton.disabled = false;
      message.replaceChildren(notice("warning", t("privacy.eraseFailed"), error.message));
    }
  });

  return card({ "aria-label": t("privacy.title"), "data-customer-privacy": true },
    cardHead(t("privacy.title")),
    el("p", { class: "hint" }, t("privacy.hint")),
    list, openRecord, recordForm,
    el("div", { class: "button-row" }, exportButton, erase),
    eraseBox,
    message);
}
