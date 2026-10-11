// Messages from the Contact us form (worker/contact.js), newest first. Each is also emailed to the support inbox;
// replies go from there. API: GET /admin/api/contact-messages?before= .
import { formatDate, t } from "./i18n.js";
import { badge, el, notice } from "./ui.js";

const EMAIL_TONE = { sent: "ok", skipped: "muted", failed: "bad", pending: "neutral" };

export async function renderMessages(host, { adminApi, isCurrent }) {
  const state = { list: [], nextBefore: null };
  const results = el("div", { "data-admin-messages": true, "aria-live": "polite" });

  const render = () => {
    if (!state.list.length) return results.replaceChildren(el("p", { class: "hint" }, t("messages.none")));
    results.replaceChildren(
      el("ul", { class: "record-list" }, ...state.list.map((m) => el("li", { class: "record", "data-message-id": m.id },
        el("div", { class: "record__head" },
          el("strong", {}, m.name),
          el("a", { href: `mailto:${m.email}` }, m.email),
          badge(EMAIL_TONE[m.emailStatus] ?? "neutral", t(`messages.email.${m.emailStatus}`) === `messages.email.${m.emailStatus}` ? m.emailStatus : t(`messages.email.${m.emailStatus}`), { title: m.emailDetail || "" }),
          el("small", {}, formatDate(m.createdAt))),
        el("p", { class: "record__text record__text--pre" }, m.message)))),
      ...[state.nextBefore && el("button", { class: "btn btn--text", type: "button", onclick: () => load() }, t("messages.older"))].filter(Boolean),
    );
  };

  async function load({ reset = false } = {}) {
    const params = new URLSearchParams();
    if (!reset && state.nextBefore) params.set("before", state.nextBefore);
    try {
      const page = await adminApi(`/admin/api/contact-messages?${params}`);
      if (!isCurrent()) return;
      state.list = reset ? page.messages : [...state.list, ...page.messages];
      state.nextBefore = page.nextBefore;
      render();
    } catch (error) {
      results.replaceChildren(notice("warning", t("messages.unavailable"), error.message));
    }
  }

  const refresh = el("button", { class: "btn btn--ghost", type: "button", "data-admin-messages-load": true, onclick: () => load({ reset: true }) }, t("messages.refresh"));
  host.replaceChildren(
    el("header", { class: "page-head page-head--split" },
      el("div", {}, el("p", { class: "eyebrow" }, t("messages.eyebrow")), el("h1", { class: "page-title" }, t("nav.messages"))),
      refresh),
    el("section", { class: "card" }, el("p", { class: "hint" }, t("messages.intro")), results),
  );
  await load({ reset: true });
}
