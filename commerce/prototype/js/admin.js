// Order back office. The Worker gates this page and /admin/api/* with HTTP Basic
// auth, so the browser re-sends the credentials on every fetch; nothing secret is
// stored by this page. The writes are "Mark as shipped" (POST .../ship) and the Amazon MCF buttons
// (POST .../mcf/submit, .../mcf/sync, /admin/api/mcf/sync), all JSON.
import { el, money, notice, priceRows } from "./commerce/shared.js";

const $ = (selector, root = document) => root.querySelector(selector);
const STATUSES = ["all", "paid", "pending", "review", "cancelled"];
const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const formatDate = (iso) => (iso ? dateTime.format(new Date(iso)) : "—");

const FULFILLMENT_TABS = [["all", "Any shipping"], ["unfulfilled", "To ship"], ["shipped", "Shipped"]];

const state = { status: "all", fulfillment: "all", q: "", fulfillmentCounts: {}, orders: [], nextBefore: null, counts: {}, selected: null, loading: false };

async function adminApi(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Could not reach the server.");
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    // non-JSON (e.g. static server without the Worker)
  }
  if (!response.ok || !data) {
    const reason =
      response.status === 503 ? "The back office is not configured (its access secret is not set)."
      : response.status === 401 ? "You are signed out. Reload the page and sign in again."
      : data?.error?.message || "The back office is unavailable.";
    const error = new Error(reason);
    error.status = response.status;
    error.code = data?.error?.code;
    throw error;
  }
  return data;
}

function statusBadge(status) {
  return el("span", { class: `status status--${status}` }, status);
}

function shipBadge(order) {
  const value = order.fulfillmentStatus;
  if (value === "shipped") return el("span", { class: "status status--shipped" }, "shipped");
  return order.status === "paid" ? el("span", { class: "status status--to-ship" }, "to ship") : null;
}

function renderTabs() {
  $("[data-admin-tabs]").replaceChildren(
    ...STATUSES.map((status) => {
      const n = status === "all" ? Object.values(state.counts).reduce((a, b) => a + b, 0) : state.counts[status] ?? 0;
      return el(
        "button",
        {
          type: "button",
          class: "admin-tab",
          "aria-pressed": String(state.status === status),
          onclick: () => {
            state.status = status;
            load({ reset: true });
          },
        },
        status === "all" ? "All" : status,
        el("span", { class: "admin-tab__n" }, String(n)),
      );
    }),
  );
}

function renderFulfillmentTabs() {
  $("[data-admin-fulfillment-tabs]").replaceChildren(
    ...FULFILLMENT_TABS.map(([value, label]) =>
      el(
        "button",
        {
          type: "button",
          class: "admin-tab",
          "data-fulfillment": value,
          "aria-pressed": String(state.fulfillment === value),
          onclick: () => {
            state.fulfillment = value;
            load({ reset: true });
          },
        },
        label,
        value !== "all" && el("span", { class: "admin-tab__n" }, String(state.fulfillmentCounts[value] ?? 0)),
      ),
    ),
  );
}

function renderList() {
  const list = $("[data-admin-list]");
  if (state.orders.length === 0) {
    list.replaceChildren(el("li", { class: "admin-empty" }, state.loading ? "Loading…" : "No orders match."));
  } else {
    list.replaceChildren(
      ...state.orders.map((order) =>
        el(
          "li",
          {},
          el(
            "button",
            {
              type: "button",
              class: "admin-row",
              "data-order": order.id,
              "aria-current": String(state.selected === order.id),
              onclick: () => select(order.id),
            },
            el("span", { class: "admin-row__id" }, statusBadge(order.status), shipBadge(order), order.id),
            el("span", { class: "admin-row__total" }, money(order.totalCents)),
            el("span", { class: "admin-row__meta" }, `${order.name} · ${order.email} · ${order.itemCount} item${order.itemCount === 1 ? "" : "s"} · ${order.state}`),
            el("span", { class: "admin-row__when" }, formatDate(order.paidAt || order.createdAt)),
          ),
        ),
      ),
    );
  }
  $("[data-admin-more]").hidden = !state.nextBefore;
}

async function load({ reset = false } = {}) {
  if (reset) {
    state.orders = [];
    state.nextBefore = null;
  }
  state.loading = true;
  renderTabs();
  renderFulfillmentTabs();
  renderList();
  const params = new URLSearchParams();
  if (state.status !== "all") params.set("status", state.status);
  if (state.fulfillment !== "all") params.set("fulfillment", state.fulfillment);
  if (state.q) params.set("q", state.q);
  if (!reset && state.nextBefore) params.set("before", state.nextBefore);
  try {
    const page = await adminApi(`/admin/api/orders?${params}`);
    state.orders = reset ? page.orders : [...state.orders, ...page.orders];
    state.nextBefore = page.nextBefore;
    state.counts = page.counts;
    state.fulfillmentCounts = page.fulfillmentCounts ?? {};
    $("[data-admin-message]").replaceChildren();
  } catch (error) {
    $("[data-admin-message]").replaceChildren(notice("warning", "Orders unavailable", error.message));
  }
  state.loading = false;
  renderTabs();
  renderFulfillmentTabs();
  renderList();
}

function renderFulfillment(order) {
  const shipped = order.fulfillment;
  if (shipped) {
    return el(
      "section",
      { class: "admin-ship", "data-admin-fulfillment": "shipped", "aria-label": "Fulfilment" },
      el("h4", {}, "Fulfilment"),
      el(
        "dl",
        { class: "admin-facts" },
        el("dt", {}, "Status"), el("dd", {}, "Shipped"),
        el("dt", {}, "Shipped"), el("dd", {}, formatDate(shipped.shippedAt)),
        el("dt", {}, "Carrier"), el("dd", {}, shipped.carrier),
        el("dt", {}, "Tracking"), el("dd", {}, shipped.trackingNumber),
        shipped.trackingUrl && el("dt", {}, "Link"),
        shipped.trackingUrl && el("dd", {}, el("a", { href: shipped.trackingUrl, rel: "noopener noreferrer", target: "_blank" }, "Open tracking page")),
        el("dt", {}, "By"), el("dd", {}, shipped.shippedBy),
      ),
    );
  }
  if (order.status !== "paid") {
    return el(
      "section",
      { class: "admin-ship", "data-admin-fulfillment": "locked", "aria-label": "Fulfilment" },
      el("h4", {}, "Fulfilment"),
      el("p", { class: "body body--sm" }, "Only paid orders can be marked shipped."),
    );
  }
  const field = (name, label, attrs = {}, hint) =>
    el(
      "div",
      { class: "field" },
      el("label", { class: "field__label", for: `ship-${name}` }, label, attrs.required && [" ", el("span", { class: "req", "aria-hidden": "true" }, "*")]),
      el("input", { id: `ship-${name}`, name, autocomplete: "off", ...attrs }),
      hint && el("span", { class: "field__hint" }, hint),
    );
  const message = el("div", { "data-ship-message": true, "aria-live": "polite" });
  const submit = el("button", { class: "btn btn--md", type: "submit" }, "Mark as shipped");
  const form = el(
    "form",
    { class: "admin-ship__form", "data-ship-form": true, novalidate: true },
    field("carrier", "Carrier", { required: true, maxlength: "60", placeholder: "e.g. UPS, USPS, FedEx" }),
    field("trackingNumber", "Tracking number", { required: true, maxlength: "80" }),
    field("trackingUrl", "Tracking link (optional)", { type: "url", inputmode: "url", maxlength: "500", placeholder: "https://" }, "https only."),
    message,
    submit,
    el("p", { class: "field__hint" }, "The customer is emailed the tracking details when email is configured."),
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (!data.carrier.trim() || !data.trackingNumber.trim()) {
      message.replaceChildren(notice("warning", "Missing details", "Enter the carrier and tracking number."));
      return;
    }
    submit.disabled = true;
    try {
      const result = await adminApi(`/admin/api/orders/${encodeURIComponent(order.id)}/ship`, { method: "POST", body: data });
      renderDetail(result.order);
      $("[data-admin-detail-body]").prepend(
        notice("success", "Marked as shipped", result.email.status === "sent" ? "The customer was emailed." : `Saved. Customer email: ${result.email.status}.`),
      );
      const row = state.orders.find((o) => o.id === order.id);
      if (row) Object.assign(row, { fulfillmentStatus: "shipped", shippedAt: result.order.fulfillment?.shippedAt ?? null });
      load({ reset: true });
    } catch (error) {
      submit.disabled = false;
      message.replaceChildren(notice("warning", "Not marked as shipped", error.message));
      // Someone else shipped it first: reload the record, keeping the explanation visible.
      if (error.code === "already_shipped") {
        await select(order.id, { focus: false });
        $("[data-admin-detail-body]").prepend(notice("warning", "Not marked as shipped", error.message));
        load({ reset: true });
      }
    }
  });
  return el("section", { class: "admin-ship", "data-admin-fulfillment": "open", "aria-label": "Fulfilment" }, el("h4", {}, "Fulfilment"), form);
}

// ---------- Amazon MCF ----------

const MCF_STATUS_LABEL = { submitting: "Sending…", submitted: "Sent to Amazon", shipped: "Shipped by Amazon", failed: "Failed", rejected: "Closed by Amazon" };

async function mcfAction(order, action, button, message) {
  button.disabled = true;
  message.replaceChildren();
  try {
    const result = await adminApi(`/admin/api/orders/${encodeURIComponent(order.id)}/mcf/${action}`, { method: "POST", body: {} });
    renderDetail(result.order);
    const outcome = result.result ?? {};
    const text =
      action === "submit"
        ? { submitted: "Sent to Amazon MCF.", failed: "Amazon did not accept the order; see the error below.", duplicate: "Already being sent.", skipped: outcome.reason || "Nothing was sent." }[outcome.outcome]
        : outcome.shipped ? `Amazon shipped it. Order marked shipped${outcome.email === "sent" ? " and the customer was emailed." : `; customer email: ${outcome.email ?? "none"}.`}`
        : outcome.outcome === "failed" ? `Sync failed: ${outcome.reason ?? "try again"}`
        : "Synced. Amazon has not shipped it yet.";
    $("[data-admin-detail-body]").prepend(notice(outcome.outcome === "failed" ? "warning" : "success", action === "submit" ? "Amazon MCF" : "MCF status", text ?? "Done."));
    load({ reset: true });
  } catch (error) {
    button.disabled = false;
    message.replaceChildren(notice("warning", "MCF request failed", error.message));
  }
}

function renderMcf(order) {
  const mcf = order.mcf;
  if (!mcf || (order.status !== "paid" && !mcf.record)) return null;
  const message = el("div", { "data-mcf-message": true, "aria-live": "polite" });
  const record = mcf.record;
  const facts = [];
  const fact = (label, value) => value && facts.push(el("dt", {}, label), el("dd", {}, value));
  if (record) {
    fact("Status", MCF_STATUS_LABEL[record.status] ?? record.status);
    fact("Amazon status", record.mcfStatus);
    fact("Amazon order id", record.sellerOrderId);
    fact("Service", record.serviceTier);
    fact("Attempts", String(record.attempts));
    fact("Sent", record.submittedAt && formatDate(record.submittedAt));
    fact("Last sync", record.lastSyncedAt && formatDate(record.lastSyncedAt));
    fact("Carrier", record.carrier);
    fact("Tracking", record.trackingNumber);
    fact("Error", record.errorMessage && `${record.errorKind ? `${record.errorKind}: ` : ""}${record.errorMessage}`);
    fact("Note", record.note);
  }
  const children = [el("h4", {}, "Amazon MCF")];
  if (!record) {
    children.push(
      el(
        "p",
        { class: "body body--sm", "data-mcf-mode": mcf.mode },
        mcf.mode === "off" ? "MCF not enabled — ship this order manually (the Fulfilment form below)."
        : mcf.mode === "not_configured" ? `MCF is on but not ready: ${mcf.reason}`
        : "Not sent to Amazon MCF yet.",
      ),
    );
  } else {
    children.push(el("dl", { class: "admin-facts", "data-mcf-record": record.status }, ...facts));
    if (mcf.mode !== "ready" && mcf.reason) children.push(el("p", { class: "field__hint", "data-mcf-mode": mcf.mode }, mcf.mode === "off" ? "MCF_AUTO_SUBMIT is off now; the record above is from earlier." : `MCF is not ready: ${mcf.reason}`));
  }
  const actions = [];
  if (mcf.canSubmit) {
    const button = el("button", { class: "btn btn--md", type: "button", "data-mcf-submit": true }, record ? "Retry send to Amazon" : "Send to Amazon MCF");
    button.addEventListener("click", () => mcfAction(order, "submit", button, message));
    actions.push(button);
  }
  if (mcf.canSync) {
    const button = el("button", { class: "btn btn--md btn--text", type: "button", "data-mcf-sync": true }, "Sync MCF status");
    button.addEventListener("click", () => mcfAction(order, "sync", button, message));
    actions.push(button);
  }
  if (actions.length) children.push(el("div", { class: "admin-mcf__actions" }, ...actions));
  children.push(message);
  return el("section", { class: "admin-ship admin-mcf", "data-admin-mcf": mcf.mode, "aria-label": "Amazon MCF" }, ...children);
}

function renderHistory(order) {
  const emailLabel = { confirmation: "Order confirmation", shipment: "Shipment notice" };
  const emails = order.emails ?? [];
  const audit = order.audit ?? [];
  if (!emails.length && !audit.length) return null;
  return el(
    "section",
    { class: "admin-history", "aria-label": "History" },
    el("h4", {}, "Customer emails and history"),
    el(
      "ul",
      { class: "admin-lines" },
      ...emails.map((mail) => el("li", {}, el("span", {}, `${emailLabel[mail.kind] ?? mail.kind}: ${mail.status}`), el("span", {}, formatDate(mail.updatedAt)), mail.detail && el("small", {}, mail.detail))),
      ...audit.map((entry) => el("li", {}, el("span", {}, `${entry.action} by ${entry.actor}`), el("span", {}, formatDate(entry.at)))),
    ),
  );
}

function renderPaymentFailures(order) {
  const failures = order.paymentFailures ?? [];
  return el("section", { class: "admin-history", "data-payment-failures": true },
    el("h4", {}, "Failed payment attempts"),
    el("p", { class: "body body--sm" }, failures.length
      ? "A failed attempt does not cancel the order. The customer can try another payment method."
      : "No failed payment attempts recorded."),
    ...failures.map((failure) => el("dl", { class: "admin-facts" },
      el("dt", {}, "Time"), el("dd", {}, formatDate(failure.occurredAt)),
      el("dt", {}, "Attempt"), el("dd", {}, failure.attemptId),
      el("dt", {}, "Event"), el("dd", {}, failure.event),
      el("dt", {}, "Failure code"), el("dd", {}, failure.code || "—"),
      el("dt", {}, "Provider code"), el("dd", {}, failure.providerCode || "—"),
      el("dt", {}, "Reason"), el("dd", {}, failure.message || "No detailed reason supplied by the payment provider."),
      el("dt", {}, "Trace ID"), el("dd", {}, failure.traceId || "—"))),
  );
}

function renderDetail(order) {
  const { shipping } = order;
  const address = el(
    "address",
    { class: "admin-address" },
    `${shipping.firstName} ${shipping.lastName}`,
    el("br"),
    shipping.street,
    shipping.street2 && [el("br"), shipping.street2],
    el("br"),
    `${shipping.city}, ${shipping.state} ${shipping.zip}`,
    el("br"),
    "United States",
  );
  const notification = order.notification
    ? `${order.notification.status}${order.notification.channels.length ? ` (${order.notification.channels.map((c) => `${c.channel}: ${c.status}`).join(", ")})` : ""}`
    : order.status === "paid" ? "not recorded" : "—";
  const body = $("[data-admin-detail-body]");
  body.replaceChildren(
    el("h3", {}, order.id),
    el("p", {}, statusBadge(order.status), shipBadge(order)),
    el(
      "dl",
      { class: "admin-facts" },
      el("dt", {}, "Payment"), el("dd", {}, order.status === "paid" ? `Paid ${formatDate(order.paidAt)}` : order.status === "review" ? "Succeeded, amount mismatch — verify in Airwallex" : order.status === "cancelled" ? "Cancelled / not paid" : "Awaiting payment"),
      el("dt", {}, "Intent"), el("dd", {}, order.paymentIntentId || "—"),
      el("dt", {}, "Created"), el("dd", {}, formatDate(order.createdAt)),
      el("dt", {}, "Email"), el("dd", {}, el("a", { href: `mailto:${order.email}` }, order.email)),
      el("dt", {}, "Marketing"), el("dd", {}, order.marketingOptIn ? "Opted in" : "No"),
      el("dt", {}, "Notification"), el("dd", {}, notification),
    ),
    el("h4", {}, "Ship to"),
    address,
    el("h4", {}, `Items · ${order.shippingMethod} shipping`),
    el(
      "ul",
      { class: "admin-lines" },
      ...order.lines.map((line) =>
        el(
          "li",
          {},
          el("span", {}, `${line.qty} × ${line.name}`),
          el("span", {}, money(line.lineCents)),
          el("small", {}, `${line.sku} · ${line.size} · ${money(line.unitCents)} each`),
        ),
      ),
    ),
    priceRows(
      [
        { label: "Subtotal", value: money(order.subtotalCents) },
        { label: "Shipping", value: order.shippingCents ? money(order.shippingCents) : "Free" },
        { label: "Tax", value: money(order.taxCents) },
      ],
      money(order.totalCents),
    ),
    renderPaymentFailures(order),
    ...[renderMcf(order)].filter(Boolean),
    renderFulfillment(order),
    ...[renderHistory(order)].filter(Boolean),
  );
  $("[data-admin-detail-empty]").hidden = true;
  body.hidden = false;
}

async function select(orderId, { focus = true } = {}) {
  state.selected = orderId;
  history.replaceState(null, "", `#${encodeURIComponent(orderId)}`);
  renderList();
  try {
    renderDetail(await adminApi(`/admin/api/orders/${encodeURIComponent(orderId)}`));
    if (focus) $("[data-admin-detail]").focus({ preventScroll: false });
  } catch (error) {
    $("[data-admin-detail-body]").replaceChildren(notice("warning", "Order unavailable", error.message));
    $("[data-admin-detail-body]").hidden = false;
    $("[data-admin-detail-empty]").hidden = true;
  }
}

$("[data-admin-search]").addEventListener("submit", (event) => {
  event.preventDefault();
  state.q = new FormData(event.currentTarget).get("q").toString().trim();
  load({ reset: true });
});
$("[data-admin-load-more]").addEventListener("click", () => load());
$("[data-admin-mcf-sync-all]").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const { summary } = await adminApi("/admin/api/mcf/sync", { method: "POST", body: {} });
    await load({ reset: true });
    if (state.selected) await select(state.selected, { focus: false });
    // After the reload, which clears the message area.
    $("[data-admin-message]").replaceChildren(
      notice("success", "MCF status synced", `Checked ${summary.checked} order${summary.checked === 1 ? "" : "s"}; ${summary.shipped} newly shipped${summary.failed ? `, ${summary.failed} could not be checked` : ""}.`),
    );
  } catch (error) {
    $("[data-admin-message]").replaceChildren(notice("warning", "MCF sync failed", error.message));
  }
  button.disabled = false;
});

await load({ reset: true });
const initial = decodeURIComponent(window.location.hash.slice(1));
if (initial) select(initial, { focus: false });
