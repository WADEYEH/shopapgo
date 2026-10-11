// Order page: the people-driven changes (confirm a review order, cancel, change the address in the cooling-off period).
// API: commerce/worker/order-core.js through POST /admin/api/orders/:id/confirm | cancel | address. Every change asks
// for a reason; cancelling asks again before it happens.
import { formatDate, lang, t } from "./i18n.js";
import { cardHead, el, field, money, notice } from "./ui.js";

const $ = (selector, root = document) => root.querySelector(selector);
const PROVIDER = { airwallex: "Airwallex", paypal: "PayPal" };

export const cancelReason = (code, fallback) => (t(`cancelReason.${code}`) !== `cancelReason.${code}` ? t(`cancelReason.${code}`) : fallback ?? code);

// Why the order waits (worker/order-core.js orderHolds): the Worker's sentence in English, a translation in Chinese.
export const holdText = (hold) => (lang() === "en" || t(`hold.${hold.code}`) === `hold.${hold.code}` ? hold.message : t(`hold.${hold.code}`));

export function refundReminder(payment) {
  if (!payment?.paidCents) return null;
  const left = payment.paidCents - (payment.refundedCents ?? 0);
  const where = PROVIDER[payment.provider] ?? t("actions.theProvider");
  if (left <= 0) return notice("success", t("actions.refunded"), t("actions.refundedBody", { amount: money(payment.refundedCents) }));
  return notice("warning", t("actions.refundThePayment"), t("actions.refundThePaymentBody", { amount: money(left), where }));
}

export function renderOrderActions(order, { adminApi, onChange }) {
  const core = order.core;
  if (!core) return null;
  const message = el("div", { "data-order-action-message": true, "aria-live": "polite" });
  const children = [cardHead(t("actions.title"))];

  if (core.cancellation) {
    const c = core.cancellation;
    children.push(notice("info", t("actions.cancelled"), t("actions.cancelledBody", {
      reason: `${cancelReason(c.reason, core.cancelReasons?.[c.reason])}${c.note ? `: ${c.note}` : ""}`,
      by: c.by,
      at: formatDate(c.at),
      amazon: c.amazonCancel ? t("actions.amazonAsked") : "",
    })));
    children.push(refundReminder(core.payment));
  }

  async function run(action, body, button, success) {
    button.disabled = true;
    try {
      const result = await adminApi(`/admin/api/orders/${encodeURIComponent(order.id)}/${action}`, { method: "POST", body });
      onChange(result.order, success(result));
    } catch (error) {
      message.replaceChildren(notice("warning", t("actions.notChanged"), error.message));
      button.disabled = false;
    }
  }

  if (core.actions.confirm) {
    const reason = el("input", { id: "order-confirm-reason", type: "text", maxlength: "300", autocomplete: "off" });
    const button = el("button", { class: "btn btn--primary", type: "button" }, t("actions.confirm"));
    button.addEventListener("click", () => {
      if (!reason.value.trim()) return message.replaceChildren(notice("warning", t("actions.reasonNeeded"), t("actions.confirmReasonNeeded")));
      run("confirm", { reason: reason.value }, button, () => notice("success", t("actions.confirmed"), t("actions.confirmedBody")));
    });
    children.push(el("div", { class: "form-stack", "data-order-confirm": true },
      el("p", { class: "hint" }, t("actions.confirmHint")),
      field("order-confirm-reason", t("actions.confirmReason"), reason), button));
  }

  if (core.actions.changeAddress) {
    const s = order.shipping ?? {};
    const input = (name, label, attrs = {}) => field(`order-address-${name}`, label, el("input", { id: `order-address-${name}`, name, value: s[name] ?? "", autocomplete: "off", ...attrs }));
    const form = el("form", { class: "form-stack", "data-order-address": true, novalidate: true },
      el("div", { class: "form-grid" },
        input("firstName", t("address.firstName"), { maxlength: "50" }),
        input("lastName", t("address.lastName"), { maxlength: "50" }),
        input("street", t("address.street"), { maxlength: "60" }),
        input("street2", t("address.street2"), { maxlength: "60" }),
        input("city", t("address.city"), { maxlength: "50" }),
        input("state", t("address.state"), { maxlength: "2" }),
        input("zip", t("address.zip"), { maxlength: "10", inputmode: "numeric" }),
      ),
      el("label", { class: "check" }, el("input", { type: "checkbox", name: "noUnit" }), t("address.noUnit")),
      field("order-address-reason", t("actions.addressReason"), el("input", { id: "order-address-reason", name: "reason", maxlength: "300", autocomplete: "off" })),
      el("button", { class: "btn btn--primary", type: "submit" }, t("actions.saveAddress")),
    );
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      if (!String(data.reason ?? "").trim()) return message.replaceChildren(notice("warning", t("actions.reasonNeeded"), t("actions.addressReasonNeeded")));
      const shipping = Object.fromEntries(["firstName", "lastName", "street", "street2", "city", "state", "zip"].map((key) => [key, data[key] ?? ""]));
      run("address", { shipping, reason: data.reason, noUnit: data.noUnit === "on" }, $("button[type=submit]", form), () => notice("success", t("actions.addressChanged"), t("actions.addressChangedBody")));
    });
    children.push(el("details", { class: "disclosure", "data-order-change-address": true }, el("summary", {}, t("actions.changeAddress")), form));
  }

  if (core.actions.cancel) {
    const reason = el("select", { id: "order-cancel-reason" },
      el("option", { value: "" }, t("actions.chooseReason")),
      ...Object.entries(core.cancelReasons ?? {}).filter(([value]) => value !== "full_refund").map(([value, label]) => el("option", { value }, cancelReason(value, label))));
    const note = el("input", { id: "order-cancel-note", type: "text", maxlength: "300", autocomplete: "off" });
    const button = el("button", { class: "btn btn--danger", type: "button" }, t("actions.cancelOrder"));
    button.addEventListener("click", () => {
      if (!reason.value) return message.replaceChildren(notice("warning", t("actions.reasonNeeded"), t("actions.cancelReasonNeeded")));
      const withAmazon = core.stage === "fulfilling" ? ` ${t("actions.cancelAsksAmazon")}` : "";
      if (!window.confirm(`${t("actions.cancelConfirm", { id: order.id })}${withAmazon}`)) return;
      run("cancel", { reason: reason.value, note: note.value }, button, (result) => el("div", {}, notice("success", t("actions.orderCancelled"), t("actions.orderCancelledBody")), refundReminder(result.result.payment)));
    });
    children.push(el("details", { class: "disclosure disclosure--danger", "data-order-cancel": true },
      el("summary", {}, t(core.stage === "fulfilling" ? "actions.cancelWithAmazon" : "actions.cancel")),
      el("div", { class: "form-stack" },
        field("order-cancel-reason", t("actions.reason"), el("span", { class: "select" }, reason)),
        field("order-cancel-note", t("actions.details"), note),
        button)));
  }

  if (children.length === 1) return null;
  children.push(message);
  return el("section", { class: "card", "aria-label": t("actions.title"), "data-order-actions": core.stage }, ...children.filter(Boolean));
}
