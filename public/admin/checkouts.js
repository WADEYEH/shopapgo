// Back office: Unfinished checkouts (D36, M9-22, I14). Checkouts nobody paid for yet, or that expired after 24 hours:
// not orders, so they are not in the order list, its counts or reports. Read only; no reminder emails are sent.
// API: GET /admin/api/checkouts (commerce/worker/checkouts.js listCheckouts).
import { el, money, notice } from "./ui.js";

const $ = (selector, root = document) => root.querySelector(selector);
const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const formatDate = (iso) => (iso ? dateTime.format(new Date(iso)) : "—");
const STATUS = { open: ["Open", "pending"], expired: ["Expired", "cancelled"] };

export function initCheckouts({ adminApi }) {
  const section = $("[data-admin-checkouts-section]");
  if (!section) return;
  const form = $("[data-admin-checkouts-filter]", section);
  const host = $("[data-admin-checkouts]", section);
  const state = { list: [], nextBefore: null, filters: {} };

  const render = (counts) => {
    if (!state.list.length) return host.replaceChildren(el("p", { class: "body body--sm" }, "No unfinished checkouts."));
    host.replaceChildren(
      ...[counts && el("p", { class: "body body--sm", "data-checkout-counts": true }, `Open: ${counts.open} · Expired: ${counts.expired}`)].filter(Boolean),
      el("ul", { class: "admin-message-list" }, ...state.list.map((c) => {
        const [label, tone] = STATUS[c.status] ?? [c.status, "pending"];
        return el("li", { class: "admin-message", "data-checkout-id": c.id },
          el("div", { class: "admin-message__head" },
            el("strong", {}, c.id),
            el("span", { class: `status status--${tone}` }, label),
            el("span", {}, c.purged ? "Details deleted after 30 days" : c.email || "—"),
            el("small", {}, `Started ${formatDate(c.createdAt)}${c.expiredAt ? ` · expired ${formatDate(c.expiredAt)}` : ""}`),
          ),
          el("p", { class: "admin-message__text" }, `${c.items.map((item) => `${item.qty} × ${item.name}`).join(", ")} · ${money(c.totalCents)}${c.state ? ` · ${c.state}` : ""}`),
          c.lastFailure ? el("p", { class: "admin-checkout__failure" }, `Payment failed ${c.lastFailure.count === 1 ? "once" : `${c.lastFailure.count} times`}: ${c.lastFailure.message || c.lastFailure.code || "no reason given"}`) : null,
        );
      })),
      ...[state.nextBefore && el("button", { class: "btn btn--sm btn--text", type: "button", onclick: () => load() }, "Load older checkouts")].filter(Boolean),
    );
  };

  async function load({ reset = false } = {}) {
    const button = $("button[type=submit]", form);
    button.disabled = true;
    try {
      const params = new URLSearchParams(state.filters);
      if (!reset && state.nextBefore) params.set("before", state.nextBefore);
      const page = await adminApi(`/admin/api/checkouts?${params}`);
      state.list = reset ? page.checkouts : [...state.list, ...page.checkouts];
      state.nextBefore = page.nextBefore;
      render(page.counts);
    } catch (error) {
      host.replaceChildren(notice("warning", "Checkouts unavailable", error.message));
    } finally {
      button.disabled = false;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    state.filters = Object.fromEntries(Object.entries({ status: data.status, q: String(data.q ?? "").trim() }).filter(([, value]) => value && value !== "all"));
    load({ reset: true });
  });
}
