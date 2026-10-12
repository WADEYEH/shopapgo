// One order (M9 订单页, D50): where it is (progress), what was bought and paid, refunds and disputes, Amazon, the
// timeline with the internal notes (I10, M9-18), the customer and the address. The changes people make (confirm,
// cancel, change the address) are in ./order-actions.js. API: GET /admin/api/orders/:id (worker/admin.js
// adminOrderView); writes: ship, MCF submit/sync/cancel, cancel and refund, refund sync, email retry, notes, and the
// owners' Refund (D51, D55; POST /admin/api/orders/:id/refund, commerce/worker/admin-refunds.js).
import { formatDate, lang, t, when } from "./i18n.js";
import { badge, card, cardHead, el, icon, money, notice, priceRows, routineTile, usPhone } from "./ui.js";
import { downloadFile } from "./api.js";
import { cancelReason, holdText, renderOrderActions } from "./order-actions.js";

const $ = (selector, root = document) => root.querySelector(selector);
const providerName = (provider) => (provider === "paypal" ? "PayPal" : "Airwallex");
const NOTE_MAX = 1000;

// ---------- where the order is ----------

function paymentState(order) {
  const refunded = order.refunds?.refundedCents ?? 0;
  if (order.status === "pending") return "awaiting";
  if (order.status === "review") return "review";
  if (order.disputes?.some((dispute) => dispute.status === "open")) return "disputed";
  if (order.refunds?.records?.some((record) => record.status === "FAILED") || order.refundRequest?.status === "failed") return "refund_failed";
  if (refunded > 0 && refunded >= order.totalCents) return "refunded";
  if (refunded > 0) return "partly_refunded";
  if (order.status === "cancelled" && !order.paidAt) return "cancelled";
  return "paid";
}

function shippingState(order) {
  const core = order.core;
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "review") return "review";
  if (order.fulfillment) return "shipped";
  if (order.status !== "paid") return null;
  if (core?.holds?.some((hold) => hold.code !== "review")) return "on_hold";
  if (core?.stage === "fulfilling") return "with_amazon";
  if (order.mcf?.stockout) return "out_of_stock";
  if (["failed", "rejected"].includes(order.mcf?.record?.status)) return "not_sent";
  if (core?.coolingOff?.active) return "cooling_off";
  return "waiting";
}

const PAYMENT_TONE = { paid: "ok", review: "warn", disputed: "bad", refund_failed: "bad", partly_refunded: "warn", refunded: "muted", cancelled: "muted", awaiting: "muted" };
const SHIPPING_TONE = { review: "warn", cooling_off: "neutral", waiting: "neutral", with_amazon: "warn", out_of_stock: "bad", not_sent: "bad", on_hold: "warn", shipped: "ok", cancelled: "muted" };

const minutesLeft = (iso) => Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 60_000));

// Paid → cooling-off → with Amazon → shipped.
function progress(order) {
  const core = order.core;
  if (!core || order.status === "cancelled" || order.status === "pending") return null;
  const stage = core.stage;
  // The step the order is at (0 paid … 3 shipped); the ones before it are done. Shipped: all done.
  const now = stage === "review" ? 0 : stage === "shipped" ? 4 : stage === "fulfilling" ? 2 : core.coolingOff?.active ? 1 : 2;
  const step = (key, index, detail) => {
    const state = index < now ? "done" : index === now ? "now" : "later";
    return el("li", { class: `step step--${state}`, "data-step": key, "aria-current": state === "now" ? "step" : null },
      el("span", { class: "step__mark" }, state === "done" ? icon("check", 16) : String(index + 1)),
      el("span", { class: "step__text" }, el("span", { class: "step__label" }, t(`progress.${key}`)), el("span", { class: "step__detail" }, detail)));
  };
  const record = order.mcf?.record;
  return el("ol", { class: "steps card", "aria-label": t("progress.label"), "data-order-stage": stage },
    ["paid", "cooling", "amazon", "shipped"].map((key, index) => step(key, index, {
      paid: stage === "review" ? t("progress.review") : when(order.paidAt),
      cooling: core.coolingOff?.active ? t("progress.minutesLeft", { n: minutesLeft(core.coolingOff.endsAt) }) : core.coolingOff?.endsAt ? t("progress.endedAt", { time: when(core.coolingOff.endsAt) }) : t("progress.coolingHint"),
      amazon: record?.submittedAt ? when(record.submittedAt) : core.coolingOff?.active ? t("progress.goesAt", { time: when(core.coolingOff.endsAt) }) : t("progress.amazonHint"),
      shipped: order.fulfillment ? when(order.fulfillment.shippedAt) : t("progress.shippedHint"),
    }[key])));
}

// ---------- the parts of the page ----------

function itemsCard(order) {
  const count = order.lines.reduce((sum, line) => sum + line.qty, 0);
  return card({ "aria-label": t("order.items"), "data-order-items": true },
    cardHead(t("order.items"), el("span", { class: "card__meta" }, t("orders.items", { n: count }))),
    el("ul", { class: "line-list" }, ...order.lines.map((line) =>
      el("li", { class: "line" },
        routineTile(line.routine ?? (String(line.sku).toUpperCase() === "D215" ? "wet" : "dry"), "sm"),
        el("span", { class: "line__text" },
          el("a", { class: "line__name", href: `#/products/${encodeURIComponent(line.id ?? String(line.sku).toLowerCase())}` }, line.name),
          el("span", { class: "line__meta" }, `${line.sku} · ${line.size}`)),
        el("span", { class: "line__qty" }, `${money(line.unitCents)} × ${line.qty}`),
        el("span", { class: "line__total" }, money(line.lineCents))))),
    priceRows([
      { label: t("money.subtotal", { n: count }), value: money(order.subtotalCents) },
      { label: t("money.shipping", { method: t(`shippingMethod.${order.shippingMethod}`) }), value: order.shippingCents ? money(order.shippingCents) : t("money.free") },
      { label: t("money.tax"), value: money(order.taxCents) },
    ], money(order.totalCents)),
    order.core?.coolingOff?.active && el("p", { class: "callout" }, t("order.coolingNote", { time: when(order.core.coolingOff.endsAt) })));
}

function facts(pairs) {
  return el("dl", { class: "facts" }, ...pairs.filter(Boolean).flatMap(([label, value]) => [el("dt", {}, label), el("dd", {}, value ?? "—")]));
}

function paymentCard(order, ctx) {
  const paypal = order.paymentProvider === "paypal";
  const refunds = order.refunds;
  const feedback = el("p", { class: "hint", role: "status" });
  const sync = paypal ? null : el("button", { class: "btn btn--ghost btn--sm", type: "button", disabled: !order.paymentIntentId }, t("refunds.sync"));
  sync?.addEventListener("click", async () => {
    sync.disabled = true;
    feedback.textContent = t("refunds.checking");
    try {
      const result = await ctx.adminApi(`/admin/api/orders/${encodeURIComponent(order.id)}/refunds/sync`, { method: "POST", body: {} });
      ctx.show(result.order);
    } catch (error) {
      feedback.textContent = error.message;
      sync.disabled = false;
    }
  });
  const checks = order.sandboxRefundChecks && order.status === "paid" ? el("div", { class: "sandbox-checks" },
    el("p", { class: "hint" }, t("refunds.sandbox")),
    ...[["above_limit", "refunds.sandboxAbove"], ["fully_refunded", "refunds.sandboxFull"]].map(([scenario, label]) => {
      const button = el("button", { type: "button", class: "btn btn--text btn--sm" }, t(label));
      button.addEventListener("click", async () => {
        button.disabled = true;
        feedback.textContent = t("refunds.sandboxChecking");
        try {
          const { result } = await ctx.adminApi(`/admin/api/orders/${encodeURIComponent(order.id)}/refunds/sandbox-check`, { method: "POST", body: { scenario } });
          feedback.textContent = `${result.outcome}: ${result.detail}${result.httpStatus ? ` HTTP ${result.httpStatus} · ${result.code}` : ""}`;
        } catch (error) {
          feedback.textContent = error.message;
        } finally {
          button.disabled = false;
        }
      });
      return button;
    })) : null;
  const asked = order.refundRequest;
  const askedState = asked && (asked.status === "requested" ? t("refunds.askedAccepted") : asked.status === "failed" ? t("refunds.askedFailed", { error: asked.error ?? "" }) : t("refunds.askedInProgress"));
  const again = asked?.status === "failed" && order.core?.cancellation?.reason === "out_of_stock"
    ? el("button", { class: "btn btn--primary btn--sm", type: "button", "data-cancel-refund": true }, t("refunds.tryAgain")) : null;
  again?.addEventListener("click", () => cancelAndRefund(order, again, feedback, ctx));
  const failures = order.paymentFailures ?? [];
  return card({ "aria-label": t("order.payment"), "data-order-payment": true },
    cardHead(t("order.payment"), badge(PAYMENT_TONE[paymentState(order)] ?? "neutral", t(`payment.${paymentState(order)}`))),
    priceRows([
      { label: t("money.paidByCustomer"), value: order.paidAt ? money(order.totalCents) : money(0) },
      { label: t("money.refunded"), value: money(refunds?.refundedCents ?? 0), class: refunds?.refundedCents ? "price-row--bad" : "" },
      refunds?.pendingCents ? { label: t("money.refundPending"), value: money(refunds.pendingCents) } : null,
    ].filter(Boolean)),
    facts([
      [t("order.method"), order.paymentProvider ? providerName(order.paymentProvider) : "—"],
      [t("order.paymentId"), order.paymentIntentId || "—"],
      [t("order.paidAt"), order.paidAt ? formatDate(order.paidAt) : order.status === "review" ? t("order.paidReview") : "—"],
    ]),
    el("section", { class: "sub", "aria-label": t("refunds.title"), "data-order-refunds": true },
      el("h3", { class: "sub__title" }, t("refunds.title")),
      refunds?.records?.some((item) => item.status === "FAILED") && notice("warning", t("refunds.failedTitle"), t("refunds.failedBody", { where: providerName(order.paymentProvider) })),
      el("p", { class: "hint" }, order.refund?.allowed ? t("refunds.hereHint", { where: providerName(order.paymentProvider) }) : paypal ? t("refunds.paypalHint") : t("refunds.airwallexHint")),
      el("p", { class: "hint" }, refunds?.records?.length
        ? t("refunds.summary", { refunded: money(refunds.refundedCents), pending: money(refunds.pendingCents), hold: refunds.hold ? t("refunds.onHold") : "" })
        : paypal ? t("refunds.noneRecorded") : t("refunds.noneSync")),
      ...(refunds?.records ?? []).map((item) => facts([
        [t("refunds.refund"), item.id], [t("refunds.status"), t(`refundStatus.${item.status}`) === `refundStatus.${item.status}` ? item.status : t(`refundStatus.${item.status}`)],
        [t("refunds.amount"), money(item.amountCents)], [t("refunds.updated"), formatDate(item.updatedAt)],
        item.failureCode && [t("refunds.failureCode"), item.failureCode],
      ])),
      asked && el("div", { "data-refund-request": asked.status },
        el("p", { class: "hint" }, t("refunds.asked", { amount: money(asked.amountCents), where: providerName(asked.provider), state: askedState, at: formatDate(asked.at) })),
        again),
      refundRequests(order),
      refundPanel(order, ctx),
      el("div", { class: "button-row" }, sync, checks),
      feedback),
    disputesSection(order),
    el("section", { class: "sub", "data-payment-failures": true },
      el("h3", { class: "sub__title" }, t("failures.title")),
      el("p", { class: "hint" }, failures.length ? t("failures.hint") : t("failures.none")),
      ...failures.map((failure) => facts([
        [t("failures.time"), formatDate(failure.occurredAt)],
        [t("failures.attempt"), failure.attemptId],
        [t("failures.event"), failure.event],
        [t("failures.code"), failure.code || "—"],
        [t("failures.providerCode"), failure.providerCode || "—"],
        [t("failures.reason"), failure.message || t("failures.noReason")],
        [t("failures.trace"), failure.traceId || "—"],
      ]))),
  );
}

// ---------- refund from here (owners, D51, D55, M9-25) ----------

// Refunds asked from this page: how much, why, who, and how it went.
function refundRequests(order) {
  const requests = order.refund?.requests ?? [];
  if (!requests.length) return null;
  return el("ul", { class: "record-list", "data-refund-requests": true }, ...requests.map((request) => el("li", { class: "record", "data-refund-request-id": request.id, "data-status": request.status },
    el("div", { class: "record__head" },
      el("strong", {}, money(request.amountCents)),
      badge({ requested: "ok", failed: "bad", not_cancelled: "warn" }[request.status] ?? "neutral", t(`refund.status.${request.status}`)),
      el("small", {}, `${request.by} · ${formatDate(request.at)}`)),
    el("p", { class: "record__text" }, [t(`refund.reason.${request.reason}`), request.note, request.notify ? null : t("refund.notNotified")].filter(Boolean).join(" · ")),
    request.error && el("p", { class: "record__warn" }, request.error))));
}

// The Refund button and its panel. Members see neither (M9-25); an owner sees why when it cannot be used.
function refundPanel(order, ctx) {
  const panel = order.refund;
  if (!panel || panel.why === "owner_only") return null;
  if (!panel.allowed) return el("p", { class: "hint", "data-refund-why": panel.why }, t(`refund.why.${panel.why}`));
  const where = providerName(order.paymentProvider);
  const message = el("div", { "aria-live": "polite", "data-refund-message": true });
  let key = null;
  const amount = el("input", { id: "refund-amount", type: "text", inputmode: "decimal", autocomplete: "off", value: (panel.refundableCents / 100).toFixed(2), disabled: panel.fullOnly, "data-refund-amount": true });
  const reason = el("select", { id: "refund-reason", "data-refund-reason": true },
    el("option", { value: "" }, t("refund.choose")), ...panel.reasons.map((code) => el("option", { value: code }, t(`refund.reason.${code}`))));
  const note = el("input", { id: "refund-note", type: "text", maxlength: "300", autocomplete: "off", "data-refund-note": true });
  const notify = el("input", { id: "refund-notify", type: "checkbox", checked: true, "data-refund-notify": true });
  const cancelFirst = panel.canCancelFirst ? el("input", { id: "refund-cancel", type: "checkbox", checked: true, "data-refund-cancel": true }) : null;
  const summary = el("p", { class: "callout", "data-refund-summary": true });
  const go = el("button", { class: "btn btn--danger", type: "submit", "data-refund-go": true }, t("refund.go"));
  const keep = el("button", { class: "btn btn--ghost", type: "button" }, t("refund.keep"));
  const open = el("button", { class: "btn btn--primary", type: "button", "data-refund-open": true }, t("refund.open"));
  const cents = () => Math.round(Number(String(amount.value).replace(/[$,\s]/g, "")) * 100);
  const check = el("label", { class: "check" }, notify, el("span", {}, t("refund.notify")));
  const describe = () => {
    const value = Number.isFinite(cents()) && cents() > 0 ? money(cents()) : "—";
    const what = cancelFirst?.checked ? t("refund.summaryCancel", { amount: value, where })
      : panel.canCancelFirst ? t("refund.summaryDirect", { amount: value, where })
      : t("refund.summaryShipped", { amount: value, where });
    summary.textContent = `${what} ${t(notify.checked ? "refund.summaryEmail" : "refund.summaryNoEmail")}`;
  };
  for (const input of [amount, notify, cancelFirst].filter(Boolean)) input.addEventListener(input === amount ? "input" : "change", describe);
  describe();
  const form = el("form", { class: "confirm", role: "alertdialog", hidden: true, "aria-labelledby": "refund-title", "data-refund-form": true, novalidate: true },
    el("p", { class: "confirm__title", id: "refund-title" }, t("refund.title", { id: order.id })),
    el("p", { class: "hint" }, t(panel.fullOnly ? "refund.fullOnly" : "refund.upTo", { amount: money(panel.refundableCents) })),
    el("div", { class: "field" }, el("label", { class: "field__label", for: "refund-amount" }, t("refund.amount")), amount),
    el("div", { class: "field" }, el("label", { class: "field__label", for: "refund-reason" }, t("refund.reason")), el("span", { class: "select" }, reason)),
    el("div", { class: "field" }, el("label", { class: "field__label", for: "refund-note" }, t("refund.note")), note, el("span", { class: "field__hint" }, t("refund.noteHint"))),
    cancelFirst && el("label", { class: "check" }, cancelFirst, el("span", {}, t("refund.cancelFirst"))),
    check,
    summary,
    el("div", { class: "button-row" }, go, keep),
    message);
  open.addEventListener("click", () => {
    key = crypto.randomUUID();
    form.hidden = false;
    open.hidden = true;
    reason.focus();
  });
  keep.addEventListener("click", () => {
    form.hidden = true;
    open.hidden = false;
    message.replaceChildren();
    open.focus();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const amountCents = panel.fullOnly ? panel.refundableCents : cents();
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > panel.refundableCents) return message.replaceChildren(notice("warning", t("refund.checkTitle"), t("refund.checkAmount", { amount: money(panel.refundableCents) })));
    if (!reason.value) return message.replaceChildren(notice("warning", t("refund.checkTitle"), t("refund.checkReason")));
    if (reason.value === "other" && !note.value.trim()) return message.replaceChildren(notice("warning", t("refund.checkTitle"), t("refund.checkNote")));
    go.disabled = true;
    message.replaceChildren(el("p", { class: "hint" }, t("refund.sending", { where })));
    try {
      const { result, order: next } = await ctx.adminApi(`/admin/api/orders/${encodeURIComponent(order.id)}/refund`, {
        method: "POST", body: { key, amountCents, reason: reason.value, note: note.value.trim(), notify: notify.checked, cancelFirst: Boolean(cancelFirst?.checked) },
      });
      const text = {
        requested: () => notice("success", t("refund.doneTitle"), `${t("refund.done", { amount: money(amountCents), where })}${result.cancelled ? ` ${t("refund.doneCancelled")}` : ""}`),
        already_requested: () => notice("info", t("refund.doneTitle"), t("refund.already")),
        in_progress: () => notice("info", t("refund.doneTitle"), t("refund.inProgress")),
        failed: () => notice("warning", t("refund.failedTitle"), t("refund.failedBody", { where, error: result.error ?? "" })),
        not_cancelled: () => notice("warning", t("refund.notCancelledTitle"), t("refund.notCancelledBody", { error: result.error ?? "" })),
      }[result.outcome] ?? (() => null);
      ctx.show(next, text());
    } catch (error) {
      go.disabled = false;
      message.replaceChildren(notice("warning", t("refund.failedTitle"), error.message));
    }
  });
  return el("div", { class: "refund-panel", "data-refund-panel": true }, open, form);
}

// Disputes (worker/disputes.js): answered in the provider's dashboard; shown with the deadline. The evidence page
// (worker/evidence.js, M5-12) is saved as PDF and uploaded there.
function disputesSection(order) {
  if (!order.disputes?.length) return null;
  const message = el("div", { "aria-live": "polite", "data-evidence-message": true });
  const evidence = el("button", { class: "btn btn--ghost btn--sm", type: "button", "data-evidence": true }, icon("download", 16), t("evidence.download"));
  evidence.addEventListener("click", async () => {
    evidence.disabled = true;
    try {
      const name = await downloadFile(`/admin/api/orders/${encodeURIComponent(order.id)}/evidence`);
      message.replaceChildren(notice("success", t("evidence.downloaded"), t("evidence.downloadedText", { name })));
    } catch (error) {
      message.replaceChildren(notice("warning", t("evidence.failed"), error.message));
    } finally {
      evidence.disabled = false;
    }
  });
  return el("section", { class: "sub", "aria-label": t("disputes.title"), "data-order-disputes": true },
    el("h3", { class: "sub__title" }, t("disputes.title")),
    el("p", { class: "hint" }, t("disputes.hint", { where: providerName(order.disputes[0].provider) })),
    el("div", { class: "button-row" }, evidence),
    message,
    ...order.disputes.map((dispute) => facts([
      [t("disputes.dispute"), `${providerName(dispute.provider)} ${dispute.id}`],
      [t("disputes.status"), dispute.status === "open" ? t("disputes.open", { status: dispute.providerStatus || t("disputes.needsResponse") }) : t(`disputes.${dispute.status}`)],
      [t("disputes.amount"), money(dispute.amountCents)],
      dispute.reason && [t("disputes.reason"), dispute.reason],
      dispute.status === "open" && [t("disputes.respondBy"), formatDate(dispute.dueAt)],
      [t("disputes.updated"), formatDate(dispute.updatedAt)],
    ])));
}

// ---------- Amazon MCF ----------

async function mcfAction(order, action, button, message, ctx) {
  button.disabled = true;
  message.replaceChildren();
  try {
    const result = await ctx.adminApi(`/admin/api/orders/${encodeURIComponent(order.id)}/mcf/${action}`, { method: "POST", body: {} });
    const outcome = result.result ?? {};
    const text =
      action === "cancel" ? t(`mcf.cancel.${outcome.outcome}`, { reason: outcome.reason ?? "" })
      : action === "submit" ? t(`mcf.submit.${outcome.outcome}`, { reason: outcome.reason ?? "" })
      : outcome.shipped ? t(outcome.email === "sent" ? "mcf.sync.shippedEmailed" : "mcf.sync.shipped", { email: outcome.email ?? "none" })
      : outcome.outcome === "failed" ? t("mcf.sync.failed", { reason: outcome.reason ?? "" })
      : t("mcf.sync.notYet");
    ctx.show(result.order, notice(outcome.outcome === "failed" ? "warning" : "success", t(action === "sync" ? "mcf.statusTitle" : "mcf.title"), text));
  } catch (error) {
    button.disabled = false;
    message.replaceChildren(notice("warning", t("mcf.requestFailed"), error.message));
  }
}

async function cancelAndRefund(order, button, message, ctx) {
  if (!confirm(t("mcf.cancelRefundConfirm", { id: order.id, amount: money(order.totalCents), where: providerName(order.paymentProvider) }))) return;
  button.disabled = true;
  message.replaceChildren();
  try {
    const result = await ctx.adminApi(`/admin/api/orders/${encodeURIComponent(order.id)}/cancel-refund`, { method: "POST", body: {} });
    const refund = result.result?.refund ?? {};
    ctx.show(result.order, refund.refund === "failed"
      ? notice("warning", t("mcf.cancelledRefundFailed"), t("mcf.cancelledRefundFailedBody", { error: refund.error ?? "", where: providerName(result.order.paymentProvider) }))
      : notice("success", t("mcf.cancelledRefunded"), t(refund.refund === "already_requested" ? "mcf.alreadyAsked" : "mcf.refundAsked")));
  } catch (error) {
    button.disabled = false;
    message.replaceChildren(notice("warning", t("mcf.cancelRefundFailed"), error.message));
  }
}

function mcfCard(order, ctx) {
  const mcf = order.mcf;
  if (!mcf || (order.status !== "paid" && !mcf.record)) return null;
  const message = el("div", { "data-mcf-message": true, "aria-live": "polite" });
  const record = mcf.record;
  const status = record ? t(`mcf.status.${record.status}`) : t("mcf.notSent");
  const children = [cardHead(t("mcf.title"), badge(record?.status === "shipped" ? "ok" : record?.status === "submitted" ? "warn" : ["failed", "rejected"].includes(record?.status) ? "bad" : "muted", status))];
  if (!record) {
    children.push(el("p", { class: "hint", "data-mcf-mode": mcf.mode },
      order.refunds?.hold ? t("mcf.refundHold")
      : mcf.mode === "off" ? t("mcf.off")
      : mcf.mode === "not_configured" ? t("mcf.notReady", { reason: mcf.reason })
      : mcf.coolingOffEndsAt ? t("mcf.goesAt", { time: when(mcf.coolingOffEndsAt) })
      : t("mcf.notSentYet")));
  } else {
    const check = record.check && (t(`mcf.check.${record.check.status}`) + (record.check.status === "mismatch" ? `: ${record.check.detail}` : ""));
    children.push(el("div", { "data-mcf-record": record.status }, facts([
      [t("mcf.f.status"), status],
      record.mcfStatus && [t("mcf.f.amazonStatus"), record.mcfStatus],
      [t("mcf.f.orderId"), record.sellerOrderId],
      record.serviceTier && [t("mcf.f.service"), record.serviceTier],
      [t("mcf.f.attempts"), String(record.attempts)],
      record.submittedAt && [t("mcf.f.sent"), formatDate(record.submittedAt)],
      record.lastSyncedAt && [t("mcf.f.lastSync"), formatDate(record.lastSyncedAt)],
      record.carrier && [t("mcf.f.carrier"), record.carrier],
      record.trackingNumber && [t("mcf.f.tracking"), record.trackingNumber],
      record.errorMessage && [t("mcf.f.error"), `${record.errorKind ? `${record.errorKind}: ` : ""}${record.errorMessage}`],
      record.note && [t("mcf.f.note"), record.note],
      check && [t("mcf.f.check"), check],
    ])));
    if (mcf.mode !== "ready" && mcf.reason) children.push(el("p", { class: "hint", "data-mcf-mode": mcf.mode }, mcf.mode === "off" ? t("mcf.offNow") : t("mcf.notReady", { reason: mcf.reason })));
  }
  if (mcf.stockout) {
    const button = el("button", { class: "btn btn--primary", type: "button", "data-cancel-refund": true }, t("mcf.cancelRefund"));
    button.addEventListener("click", () => cancelAndRefund(order, button, message, ctx));
    children.push(el("div", { class: "form-stack", "data-stockout": mcf.stockout.days },
      notice("warning", t("mcf.stockoutTitle", { n: mcf.stockout.days }), t("mcf.stockoutBody", { since: formatDate(mcf.stockout.since) })),
      el("div", { class: "button-row" }, button)));
  } else if (record?.check?.status === "mismatch") {
    children.push(notice("warning", t("mcf.mismatchTitle"), t("mcf.mismatchBody", { detail: record.check.detail })));
  }
  const actions = [];
  if (mcf.canCancelAtAmazon) {
    const button = el("button", { class: "btn btn--ghost", type: "button", "data-mcf-cancel": true }, t("mcf.cancelAtAmazon"));
    button.addEventListener("click", () => {
      if (confirm(t("mcf.cancelAtAmazonConfirm", { id: record.sellerOrderId }))) mcfAction(order, "cancel", button, message, ctx);
    });
    actions.push(button);
  }
  if (mcf.canSubmit && !order.refunds?.hold) {
    const button = el("button", { class: "btn btn--primary", type: "button", "data-mcf-submit": true }, t(record ? "mcf.retry" : "mcf.send"));
    button.addEventListener("click", () => mcfAction(order, "submit", button, message, ctx));
    actions.push(button);
  }
  if (mcf.canSync) {
    const button = el("button", { class: "btn btn--ghost", type: "button", "data-mcf-sync": true }, t("mcf.sync"));
    button.addEventListener("click", () => mcfAction(order, "sync", button, message, ctx));
    actions.push(button);
  }
  if (actions.length) children.push(el("div", { class: "button-row" }, ...actions));
  children.push(message);
  return card({ "aria-label": t("mcf.title"), "data-admin-mcf": mcf.mode }, ...children);
}

// ---------- shipping by hand (when Amazon MCF is off) ----------

// Every package Amazon shipped (F6) and what the carrier last said; a returned one is marked (F9).
const PACKAGE_TONE = { DELIVERED: "ok", RETURNING: "bad", RETURNED: "bad", UNDELIVERABLE: "bad", RETURN_RECEIVED_IN_FC: "bad" };
function packagesList(packages) {
  if (!packages?.length) return null;
  return el("ul", { class: "record-list", "data-packages": packages.length }, ...packages.map((pkg, index) => el("li", { class: "record", "data-package": pkg.trackingNumber },
    el("div", { class: "record__head" },
      el("strong", {}, t("packages.package", { n: index + 1 })),
      pkg.status ? badge(PACKAGE_TONE[pkg.status] ?? "neutral", t(`packages.status.${pkg.status}`) === `packages.status.${pkg.status}` ? pkg.status : t(`packages.status.${pkg.status}`), { "data-package-status": pkg.status }) : el("span", { class: "muted" }, t("packages.noStatus")),
      pkg.checkedAt && el("small", {}, t("packages.checked", { at: formatDate(pkg.checkedAt) }))),
    el("p", { class: "record__text" }, `${pkg.carrier} ${pkg.trackingNumber}`, pkg.trackingUrl && [" · ", el("a", { href: pkg.trackingUrl, rel: "noopener noreferrer", target: "_blank" }, t("ship.openTracking"))]),
    pkg.deliveredAt && el("p", { class: "hint" }, t("packages.delivered", { at: formatDate(pkg.deliveredAt) })),
    pkg.returnedAt && el("p", { class: "record__warn" }, t("packages.returned", { at: formatDate(pkg.returnedAt) })))));
}

function fulfilmentCard(order, ctx) {
  const shipped = order.fulfillment;
  const head = cardHead(t("ship.title"));
  if (shipped) {
    return card({ "data-admin-fulfillment": "shipped", "aria-label": t("ship.title") }, head, packagesList(shipped.packages), facts([
      [t("ship.status"), t("shipping.shipped")],
      [t("ship.shippedAt"), formatDate(shipped.shippedAt)],
      [t("ship.carrier"), shipped.carrier],
      [t("ship.tracking"), shipped.trackingNumber],
      shipped.trackingUrl && [t("ship.link"), el("a", { href: shipped.trackingUrl, rel: "noopener noreferrer", target: "_blank" }, t("ship.openTracking"))],
      [t("ship.by"), shipped.shippedBy],
    ]));
  }
  const locked = (text) => card({ "data-admin-fulfillment": "locked", "aria-label": t("ship.title") }, head, el("p", { class: "hint" }, text));
  if (order.disputes?.some((dispute) => dispute.status === "open")) return locked(t("ship.lockedDispute"));
  if (order.refunds?.hold) return locked(t("ship.lockedRefund"));
  if (order.status !== "paid") return locked(t("ship.lockedNotPaid"));
  const input = (name, label, attrs = {}, hint) => el("div", { class: "field" },
    el("label", { class: "field__label", for: `ship-${name}` }, label, attrs.required && el("span", { class: "req", "aria-hidden": "true" }, " *")),
    el("input", { id: `ship-${name}`, name, autocomplete: "off", ...attrs }),
    hint && el("span", { class: "field__hint" }, hint));
  const message = el("div", { "data-ship-message": true, "aria-live": "polite" });
  const submit = el("button", { class: "btn btn--primary", type: "submit" }, t("ship.mark"));
  const form = el("form", { class: "form-stack", "data-ship-form": true, novalidate: true },
    input("carrier", t("ship.carrier"), { required: true, maxlength: "60", placeholder: t("ship.carrierPlaceholder") }),
    input("trackingNumber", t("ship.tracking"), { required: true, maxlength: "80" }),
    input("trackingUrl", t("ship.trackingUrl"), { type: "url", inputmode: "url", maxlength: "500", placeholder: "https://" }, t("ship.httpsOnly")),
    message, submit,
    el("p", { class: "field__hint" }, t("ship.emailHint")));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (!data.carrier.trim() || !data.trackingNumber.trim()) return message.replaceChildren(notice("warning", t("ship.missing"), t("ship.missingBody")));
    submit.disabled = true;
    try {
      const result = await ctx.adminApi(`/admin/api/orders/${encodeURIComponent(order.id)}/ship`, { method: "POST", body: data });
      ctx.show(result.order, notice("success", t("ship.marked"), result.email.status === "sent" ? t("ship.emailAccepted") : t("ship.savedEmail", { status: result.email.status })));
    } catch (error) {
      submit.disabled = false;
      message.replaceChildren(notice("warning", t("ship.notMarked"), error.message));
      // Someone else shipped it first: reload, keeping the explanation visible.
      if (error.code === "already_shipped") ctx.reload(notice("warning", t("ship.notMarked"), error.message));
    }
  });
  return card({ "data-admin-fulfillment": "open", "aria-label": t("ship.title") }, head, el("p", { class: "hint" }, t("ship.manualHint")), form);
}

// ---------- timeline: notes, emails and everything that happened ----------

export const EMAIL_KIND = (kind) => {
  if (kind.startsWith("refund:team-failed:")) return t("email.kind.refundTeamFailed", { id: kind.slice(19) });
  if (kind.startsWith("refund:failed:")) return t("email.kind.refundFailed", { id: kind.slice(14) });
  if (kind.startsWith("refund:")) return t("email.kind.refund", { id: kind.slice(7) });
  if (kind.startsWith("address:")) return t("email.kind.address");
  if (kind.startsWith("duplicate:")) return t("email.kind.duplicate", { ref: kind.slice(10) });
  if (kind === "delay:stockout") return t("email.kind.delay");
  return t(`email.kind.${kind}`) === `email.kind.${kind}` ? kind : t(`email.kind.${kind}`);
};

function emailStatus(mail) {
  if (mail.deliveryStatus === "accepted") return t("email.status.accepted");
  if (mail.deliveryStatus) return t(`email.delivery.${mail.deliveryStatus}`) === `email.delivery.${mail.deliveryStatus}` ? mail.deliveryStatus : t(`email.delivery.${mail.deliveryStatus}`);
  if (mail.status === "sent") return t("email.status.legacySent");
  return t(`email.status.${mail.status}`) === `email.status.${mail.status}` ? mail.status : t(`email.status.${mail.status}`);
}

function auditText(entry) {
  const d = entry.detail ?? {};
  const label = t(`action.${entry.action}`) === `action.${entry.action}` ? entry.action : t(`action.${entry.action}`);
  const extra = [];
  if (d.trackingNumber) extra.push(`${d.carrier ?? ""} ${d.trackingNumber}`.trim());
  if (entry.action === "order.email.retry" && d.kind) extra.push(`${EMAIL_KIND(d.kind)}: ${d.result}`);
  if (entry.action === "order.cancelled" && d.reason) extra.push(cancelReason(d.reason));
  if (d.reason && entry.action !== "order.cancelled") extra.push(String(d.reason));
  if (d.amountCents) extra.push(money(d.amountCents));
  if (d.error) extra.push(String(d.error));
  return [label, ...extra].join(" · ");
}

function timelineCard(order, ctx) {
  const notes = [...(order.notes ?? [])];
  const list = el("ol", { class: "timeline", "data-order-timeline": true });
  const render = () => {
    const entries = [
      ...notes.map((note) => ({ at: note.at, kind: "note", note })),
      ...(order.emails ?? []).map((mail) => ({ at: mail.updatedAt, kind: "email", mail })),
      ...(order.audit ?? []).map((entry) => ({ at: entry.at, kind: "event", entry })),
      order.paidAt && { at: order.paidAt, kind: "event", text: t("timeline.paid", { amount: money(order.totalCents), where: order.paymentProvider ? providerName(order.paymentProvider) : "" }) },
      { at: order.createdAt, kind: "event", text: t("timeline.created") },
    ].filter(Boolean).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    list.replaceChildren(...entries.map((entry) => {
      if (entry.kind === "note") {
        return el("li", { class: "timeline__item timeline__item--note", "data-note": entry.note.id },
          el("div", { class: "note" },
            el("p", { class: "note__head" }, el("span", { class: "note__tag" }, t("notes.tag")), el("span", {}, `${entry.note.author} · ${formatDate(entry.note.at)}`)),
            el("p", { class: "note__body" }, entry.note.body)));
      }
      if (entry.kind === "email") {
        const mail = entry.mail;
        const label = EMAIL_KIND(mail.kind);
        const retry = mail.canRetry ? el("button", { type: "button", class: "btn btn--ghost btn--sm" }, t("email.retry", { label })) : null;
        retry?.addEventListener("click", async () => {
          retry.disabled = true;
          try {
            const result = await ctx.adminApi(`/admin/api/orders/${encodeURIComponent(order.id)}/emails/${encodeURIComponent(mail.kind)}/retry`, { method: "POST", body: {} });
            ctx.show(result.order);
          } catch (error) {
            retry.after(notice("warning", t("email.retryFailed"), error.message));
            retry.disabled = false;
          }
        });
        return el("li", { class: "timeline__item", "data-email": mail.kind },
          el("p", { class: "timeline__line" }, el("span", {}, `${t("email.prefix")} ${label}: ${emailStatus(mail)}`), el("time", {}, formatDate(entry.at))),
          mail.providerId && el("p", { class: "timeline__sub" }, t("email.messageId", { id: mail.providerId, n: mail.attempts })),
          mail.nextAttemptAt && el("p", { class: "timeline__sub" }, t("email.nextAttempt", { at: formatDate(mail.nextAttemptAt) })),
          mail.detail && el("p", { class: "timeline__sub" }, mail.detail),
          retry);
      }
      const by = entry.entry?.actor ? ` · ${entry.entry.actor}` : "";
      return el("li", { class: "timeline__item", "data-event": entry.entry?.action ?? "order" },
        el("p", { class: "timeline__line" }, el("span", {}, entry.text ?? `${auditText(entry.entry)}${by}`), el("time", {}, formatDate(entry.at))));
    }));
  };
  render();

  const box = el("textarea", { id: "note-input", rows: "3", maxlength: String(NOTE_MAX), placeholder: t("notes.placeholder"), "data-note-input": true });
  const post = el("button", { class: "btn btn--primary", type: "submit", disabled: true, "data-note-post": true }, t("notes.post"));
  const message = el("div", { "aria-live": "polite" });
  box.addEventListener("input", () => {
    post.disabled = !box.value.trim();
  });
  const form = el("form", { class: "note-form", "data-note-form": true },
    el("label", { class: "field__label", for: "note-input" }, t("notes.label")),
    box,
    el("div", { class: "note-form__foot" }, el("span", { class: "hint" }, t("notes.help")), post),
    message);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = box.value.trim();
    if (!body) return;
    post.disabled = true;
    try {
      const result = await ctx.adminApi(`/admin/api/orders/${encodeURIComponent(order.id)}/notes`, { method: "POST", body: { body } });
      notes.splice(0, notes.length, ...result.notes);
      box.value = "";
      message.replaceChildren();
      render();
    } catch (error) {
      post.disabled = false;
      message.replaceChildren(notice("warning", t("notes.notSaved"), error.message));
    }
  });
  return card({ "aria-label": t("order.timeline"), "data-order-notes": true }, cardHead(t("order.timeline")), form, list);
}

// ---------- aside ----------

function customerCard(order) {
  const s = order.shipping ?? {};
  // The customer's data was deleted for a privacy request (D53): only the amounts and the state are left.
  if (s.erased) return card({ "aria-label": t("order.customer"), "data-order-customer": "erased" }, cardHead(t("order.customer")), el("p", { class: "hint" }, t("customers.erasedOrder", { state: s.state ?? "—" })));
  return card({ "aria-label": t("order.customer"), "data-order-customer": true },
    cardHead(t("order.customer")),
    order.paidAt && el("p", {}, el("a", { href: `#/customers/${encodeURIComponent(order.id)}`, "data-customer-link": true }, t("customers.open"))),
    el("p", { class: "aside-name" }, `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || "—"),
    facts([
      [t("order.email"), el("a", { href: `mailto:${order.email}` }, order.email)],
      [t("order.phone"), s.phone ? el("a", { href: `tel:${s.phone}` }, usPhone(s.phone)) : "—"],
      [t("order.marketing"), t(order.marketingOptIn ? "order.marketingYes" : "order.marketingNo")],
    ]));
}

function addressCard(order) {
  const s = order.shipping ?? {};
  if (s.erased) return null;
  const check = s.addressCheck?.status;
  const tone = { verified: "ok", corrected: "ok", kept_original: "ok", no_unit_confirmed: "ok", unverified: "warn" }[check] ?? "muted";
  return card({ "aria-label": t("order.shipTo"), "data-order-address-card": true },
    cardHead(t("order.shipTo")),
    el("address", { class: "address" },
      `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim(), el("br"),
      s.street, s.street2 && [el("br"), s.street2], el("br"),
      `${s.city}, ${s.state} ${s.zip}`, el("br"),
      t("order.unitedStates")),
    check ? badge(tone, t(`addressCheck.${check}`), { "data-address-check": check }) : el("span", { class: "muted" }, t("addressCheck.none")));
}

function checksCard(order) {
  const holds = order.core?.holds ?? [];
  const notification = order.notification
    ? `${t(`notification.${order.notification.status}`) === `notification.${order.notification.status}` ? order.notification.status : t(`notification.${order.notification.status}`)}${order.notification.channels.length ? ` (${order.notification.channels.map((c) => `${c.channel}: ${c.status}`).join(", ")})` : ""}`
    : order.status === "paid" ? t("notification.notRecorded") : "—";
  return card({ "aria-label": t("order.checks"), "data-order-checks": true },
    cardHead(t("order.checks")),
    holds.length
      ? el("ul", { class: "check-list" }, ...holds.map((hold) => el("li", { class: "check-list__item check-list__item--warn" }, el("span", { class: "dot dot--warn" }), holdText(hold))))
      : el("p", { class: "all-clear" }, icon("check", 16), t("order.noHolds")),
    facts([[t("order.teamNotified"), notification]]));
}

// ---------- the page ----------

export async function renderOrder(host, ctx) {
  const id = ctx.route.id;
  const order = await ctx.adminApi(`/admin/api/orders/${encodeURIComponent(id)}`);
  if (!ctx.isCurrent()) return;
  const outcome = el("div", { class: "outcome", "data-order-outcome": true, "aria-live": "polite" });
  const page = {
    ...ctx,
    // Show the order as the Worker now has it, with what happened on top.
    show(next, result) {
      draw(next);
      outcome.replaceChildren(...[result].filter(Boolean));
    },
    async reload(result) {
      draw(await ctx.adminApi(`/admin/api/orders/${encodeURIComponent(id)}`));
      if (result) outcome.replaceChildren(result);
    },
  };
  function draw(current) {
    const payment = paymentState(current);
    const shipping = shippingState(current);
    host.replaceChildren(
      el("a", { class: "back-link", href: "#/orders" }, icon("back", 16), t("nav.orders")),
      el("div", { "data-admin-detail-body": true },
        el("header", { class: "page-head page-head--split" },
          el("div", { class: "page-head__id" },
            el("h1", { class: "page-title page-title--id" }, current.id),
            badge(PAYMENT_TONE[payment] ?? "neutral", t(`payment.${payment}`), { "data-payment": payment }),
            shipping && badge(SHIPPING_TONE[shipping] ?? "neutral", t(`shipping.${shipping}`), { "data-shipping": shipping }),
            el("p", { class: "page-sub" }, [formatDate(current.paidAt || current.createdAt), current.paymentProvider && providerName(current.paymentProvider)].filter(Boolean).join(" · ")))),
        outcome,
        progress(current),
        ...(current.core?.holds ?? []).filter((hold) => hold.code !== "review").map((hold) => notice("warning", t("order.onHold"), holdText(hold))),
        el("div", { class: "split" },
          el("div", { class: "split__main" },
            renderOrderActions(current, { adminApi: ctx.adminApi, onChange: (next, result) => page.show(next, result) }),
            itemsCard(current),
            paymentCard(current, page),
            mcfCard(current, page),
            fulfilmentCard(current, page),
            timelineCard(current, page)),
          el("aside", { class: "split__aside" }, customerCard(current), addressCard(current), checksCard(current)))),
    );
  }
  draw(order);
  // The language may change while the page is open: words follow, the data stays.
  host.dataset.lang = lang();
}
