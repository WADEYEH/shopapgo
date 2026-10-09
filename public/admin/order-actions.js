// Back office, order detail: where the order stands (stage, cooling-off, holds) and the people-driven changes
// (confirm a review order, cancel, change the address in the cooling-off period). API: commerce/worker/order-core.js
// through POST /admin/api/orders/:id/confirm | cancel | address. Every change asks for a reason.
import { el, money, notice } from "./ui.js";

const $ = (selector, root = document) => root.querySelector(selector);


const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const formatDate = (iso) => (iso ? dateTime.format(new Date(iso)) : "—");

const STAGE = {
  checkout: ["Awaiting payment", "pending"],
  review: ["Needs review", "review"],
  paid: ["Paid", "paid"],
  fulfilling: ["With Amazon", "to-ship"],
  shipped: ["Shipped", "shipped"],
  cancelled: ["Cancelled", "cancelled"],
};
const PROVIDER = { airwallex: "Airwallex", paypal: "PayPal" };

// The stage line under the order number: the stage, the cooling-off period and anything holding the order.
export function renderStage(order) {
  const core = order.core;
  if (!core) return null;
  const [label] = STAGE[core.stage] ?? [core.stage];
  const parts = [el("span", { class: "admin-stage__label" }, "Stage: ", el("strong", { "data-order-stage": core.stage }, label))];
  if (core.coolingOff?.active) parts.push(el("span", { class: "admin-stage__note" }, `Cooling-off until ${formatDate(core.coolingOff.endsAt)}: it goes to Amazon after that.`));
  return el("div", { class: "admin-stage" },
    el("p", {}, ...parts),
    ...core.holds.map((hold) => notice("warning", "On hold", hold.message)),
  );
}

function refundReminder(payment) {
  if (!payment?.paidCents) return null;
  const left = payment.paidCents - (payment.refundedCents ?? 0);
  if (left <= 0) return notice("success", "Refunded", `${money(payment.refundedCents)} has been refunded.`);
  return notice("warning", "Refund the payment", `Refund ${money(left)} in ${PROVIDER[payment.provider] ?? "the payment provider"}. The order does not refund by itself; the refund shows up here once ${PROVIDER[payment.provider] ?? "the provider"} reports it.`);
}

export function renderOrderActions(order, { adminApi, onChange }) {
  const core = order.core;
  if (!core) return null;
  const message = el("div", { "data-order-action-message": true, "aria-live": "polite" });
  const children = [el("h4", {}, "Order")];

  if (core.cancellation) {
    const c = core.cancellation;
    children.push(notice("info", "Cancelled", `${core.cancelReasons?.[c.reason] ?? c.reason}${c.note ? `: ${c.note}` : ""}. By ${c.by}, ${formatDate(c.at)}.${c.amazonCancel ? " Amazon was asked to cancel the shipment." : ""}`));
    children.push(refundReminder(core.payment));
  }

  async function run(action, body, button, success) {
    button.disabled = true;
    try {
      const result = await adminApi(`/admin/api/orders/${encodeURIComponent(order.id)}/${action}`, { method: "POST", body });
      onChange(result.order, success(result));
    } catch (error) {
      message.replaceChildren(notice("warning", "Not changed", error.message));
      button.disabled = false;
    }
  }

  const field = (id, label, control, hint) => el("div", { class: "field" }, el("label", { class: "field__label", for: id }, label), control, hint && el("span", { class: "field__hint" }, hint));

  if (core.actions.confirm) {
    const reason = el("input", { id: "order-confirm-reason", type: "text", maxlength: "300", autocomplete: "off" });
    const button = el("button", { class: "btn btn--md", type: "button" }, "Confirm order");
    button.addEventListener("click", () => {
      if (!reason.value.trim()) return message.replaceChildren(notice("warning", "Reason needed", "Write why the payment is fine."));
      run("confirm", { reason: reason.value }, button, () => notice("success", "Order confirmed", "It is now paid; the customer gets the confirmation email and it goes to Amazon after the cooling-off period."));
    });
    children.push(el("div", { class: "admin-ship__form", "data-order-confirm": true },
      el("p", { class: "body body--sm" }, "The amount paid did not match. Check the payment in the provider, then confirm or cancel."),
      field("order-confirm-reason", "Why it is fine", reason), button));
  }

  if (core.actions.changeAddress) {
    const s = order.shipping ?? {};
    const input = (name, label, attrs = {}) => field(`order-address-${name}`, label, el("input", { id: `order-address-${name}`, name, value: s[name] ?? "", autocomplete: "off", ...attrs }));
    const form = el("form", { class: "admin-ship__form admin-address-form", "data-order-address": true, novalidate: true },
      el("div", { class: "admin-address-grid" },
        input("firstName", "First name", { maxlength: "50" }),
        input("lastName", "Last name", { maxlength: "50" }),
        input("street", "Street address", { maxlength: "60" }),
        input("street2", "Apt, suite, unit (optional)", { maxlength: "60" }),
        input("city", "City", { maxlength: "50" }),
        input("state", "State (2 letters)", { maxlength: "2" }),
        input("zip", "ZIP", { maxlength: "10", inputmode: "numeric" }),
      ),
      el("label", { class: "admin-check" }, el("input", { type: "checkbox", name: "noUnit" }), " This address has no apartment or unit number"),
      field("order-address-reason", "Why it changes", el("input", { id: "order-address-reason", name: "reason", maxlength: "300", autocomplete: "off" })),
      el("button", { class: "btn btn--md", type: "submit" }, "Save address"),
    );
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      if (!String(data.reason ?? "").trim()) return message.replaceChildren(notice("warning", "Reason needed", "Write why the address changes."));
      const shipping = Object.fromEntries(["firstName", "lastName", "street", "street2", "city", "state", "zip"].map((key) => [key, data[key] ?? ""]));
      run("address", { shipping, reason: data.reason, noUnit: data.noUnit === "on" }, $("button[type=submit]", form), () => notice("success", "Address changed", "The new address was checked and is what Amazon will get."));
    });
    children.push(el("details", { class: "admin-order-change" }, el("summary", {}, "Change the address (cooling-off period only)"), form));
  }

  if (core.actions.cancel) {
    const reason = el("select", { id: "order-cancel-reason" },
      el("option", { value: "" }, "Choose a reason"),
      ...Object.entries(core.cancelReasons ?? {}).filter(([value]) => value !== "full_refund").map(([value, label]) => el("option", { value }, label)));
    const note = el("input", { id: "order-cancel-note", type: "text", maxlength: "300", autocomplete: "off" });
    const button = el("button", { class: "btn btn--md", type: "button" }, "Cancel order");
    button.addEventListener("click", () => {
      if (!reason.value) return message.replaceChildren(notice("warning", "Reason needed", "Choose why the order is cancelled."));
      const withAmazon = core.stage === "fulfilling" ? " Amazon is asked to cancel the shipment first; if Amazon cannot, nothing changes." : "";
      if (!window.confirm(`Cancel order ${order.id}?${withAmazon}`)) return;
      run("cancel", { reason: reason.value, note: note.value }, button, (result) => el("div", {}, notice("success", "Order cancelled", "The order will not ship."), refundReminder(result.result.payment)));
    });
    children.push(el("details", { class: "admin-order-change", "data-order-cancel": true },
      el("summary", {}, core.stage === "fulfilling" ? "Cancel the order (asks Amazon first)" : "Cancel the order"),
      el("div", { class: "admin-ship__form" },
        field("order-cancel-reason", "Reason", el("span", { class: "select" }, reason)),
        field("order-cancel-note", "Details (needed for Other)", note),
        button)));
  }

  if (children.length === 1) return null;
  children.push(message);
  return el("section", { class: "admin-ship admin-order-actions", "aria-label": "Order", "data-order-actions": core.stage }, ...children.filter(Boolean));
}
