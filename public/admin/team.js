// The site-wide Activity log (M9-19) and Members (owners only, M9-09, M9-10). API: commerce/worker/admin.js
// (/admin/api/activity, /members...). Everything is rendered as text, never HTML.
import { formatDate, t } from "./i18n.js";
import { badge, el, field, notice } from "./ui.js";

const $ = (selector, root = document) => root.querySelector(selector);

const actionLabel = (action) => (t(`action.${action}`) === `action.${action}` ? action : t(`action.${action}`));
const role = (value) => t(`role.${value}`);
const via = (value) => (t(`via.${value}`) === `via.${value}` ? value : t(`via.${value}`));

function syncText(sync) {
  if (!sync) return "";
  if (sync.status === "synced") return sync.added || sync.removed ? t("members.syncedCounts", { added: sync.added, removed: sync.removed }) : t("members.synced");
  if (sync.status === "not_configured") return t("members.syncNotSetUp");
  return t("members.syncFailed", { detail: sync.detail });
}

function describe(entry) {
  const parts = [];
  if (entry.action === "member.role_changed" && entry.before && entry.after) parts.push(`${role(entry.before.role)} → ${role(entry.after.role)}`);
  if (entry.action === "member.added" && entry.after) parts.push(t("activity.asRole", { role: role(entry.after.role) }));
  if (entry.action.startsWith("access_list.") && entry.detail) parts.push(syncText(entry.detail));
  if (entry.detail?.trackingNumber) parts.push(`${entry.detail.carrier ?? ""} ${entry.detail.trackingNumber}`.trim());
  if (entry.detail?.kind && entry.action === "order.email.retry") parts.push(`${entry.detail.kind}: ${entry.detail.result}`);
  return parts.filter(Boolean).join(" · ");
}

// ---------- Activity ----------

export async function renderActivity(host, { adminApi, isCurrent }) {
  const state = { entries: [], nextCursor: null, filters: {} };
  const results = el("div", { "data-admin-activity": true, "aria-live": "polite" });
  const person = el("select", { id: "activity-actor", name: "actor" }, el("option", { value: "" }, t("activity.everyone")));
  const submit = el("button", { class: "btn btn--ghost", type: "submit" }, t("activity.show"));
  const form = el("form", { class: "filters", "data-admin-activity-filter": true },
    field("activity-actor", t("activity.person"), el("span", { class: "select" }, person)),
    field("activity-from", t("activity.from"), el("input", { id: "activity-from", type: "date", name: "from" })),
    field("activity-to", t("activity.to"), el("input", { id: "activity-to", type: "date", name: "to" })),
    submit);

  const render = () => {
    if (!state.entries.length) return results.replaceChildren(el("p", { class: "hint" }, t("activity.none")));
    results.replaceChildren(
      el("ul", { class: "record-list" }, ...state.entries.map((entry) => {
        const target = entry.source === "order" && entry.target
          ? el("a", { href: `#/orders/${encodeURIComponent(entry.target)}` }, entry.target)
          : entry.target && entry.action.startsWith("product.") ? el("a", { href: `#/products/${encodeURIComponent(entry.target.toLowerCase())}` }, entry.target)
          : entry.target;
        return el("li", { class: "record", "data-activity-action": entry.action },
          el("div", { class: "record__head" }, el("strong", {}, actionLabel(entry.action)), target || null, el("small", {}, formatDate(entry.at))),
          el("p", { class: "record__meta" }, t("activity.by", { who: entry.actor, via: entry.via ? ` (${via(entry.via)})` : "" })),
          describe(entry) ? el("p", { class: "record__text" }, describe(entry)) : null,
          entry.reason && el("p", { class: "record__why" }, t("activity.reason", { reason: entry.reason })));
      })),
      ...[state.nextCursor && el("button", { class: "btn btn--text", type: "button", onclick: () => load() }, t("activity.older"))].filter(Boolean),
    );
  };

  async function load({ reset = false } = {}) {
    submit.disabled = true;
    try {
      const params = new URLSearchParams(state.filters);
      if (!reset && state.nextCursor) params.set("cursor", state.nextCursor);
      const page = await adminApi(`/admin/api/activity?${params}`);
      if (!isCurrent()) return;
      state.entries = reset ? page.entries : [...state.entries, ...page.entries];
      state.nextCursor = page.nextCursor;
      if (page.actors) {
        const chosen = person.value;
        person.replaceChildren(el("option", { value: "" }, t("activity.everyone")), ...page.actors.map((actor) => el("option", { value: actor }, actor)));
        person.value = page.actors.includes(chosen) ? chosen : "";
      }
      render();
    } catch (error) {
      results.replaceChildren(notice("warning", t("activity.unavailable"), error.message));
    } finally {
      submit.disabled = false;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    // The dates are the viewer's own calendar days; "to" includes the whole day.
    const day = (value, add = 0) => {
      if (!value) return null;
      const date = new Date(`${value}T00:00:00`);
      date.setDate(date.getDate() + add);
      return date.toISOString();
    };
    state.filters = Object.fromEntries(Object.entries({ actor: data.actor, from: day(data.from), to: day(data.to, 1) }).filter(([, value]) => value));
    load({ reset: true });
  });

  host.replaceChildren(
    el("header", { class: "page-head" }, el("p", { class: "eyebrow" }, t("activity.eyebrow")), el("h1", { class: "page-title" }, t("nav.activity"))),
    el("section", { class: "card", "data-admin-activity-section": true }, el("p", { class: "hint" }, t("activity.intro")), form, results),
  );
  await load({ reset: true });
}

// ---------- Members (owners only) ----------

export async function renderMembers(host, { adminApi, isCurrent, me }) {
  const results = el("div", { "data-admin-members": true, "aria-live": "polite" });
  const message = el("div", { "data-members-message": true, "aria-live": "polite" });
  let data = await adminApi("/admin/api/members");
  if (!isCurrent()) return;

  const outcome = (title, result) => notice(
    result.sync?.status === "failed" ? "warning" : "success",
    title,
    [
      result.notified ? t("members.notified", { sent: result.notified.sent, skipped: result.notified.skipped ? t("members.notEmailed", { n: result.notified.skipped }) : "", failed: result.notified.failed ? t("members.emailFailed", { n: result.notified.failed }) : "" }) : "",
      syncText(result.sync),
    ].filter(Boolean).join(" "),
  );

  async function act(path, body, title, button) {
    if (button) button.disabled = true;
    try {
      const result = await adminApi(path, { method: "POST", body });
      data = { ...data, members: result.members ?? data.members, accessList: result.accessList ?? data.accessList };
      render();
      message.replaceChildren(outcome(title, result));
    } catch (error) {
      message.replaceChildren(notice("warning", t("actions.notChanged"), error.message));
      if (button) button.disabled = false;
    }
  }

  function signInNotice() {
    if (!data.accessSignIn) return notice("info", t("members.signIn"), t("members.sharedLogin"));
    const list = data.accessList;
    if (!list.configured) return notice("warning", t("members.syncNotSetUpTitle"), t("members.syncNotSetUpBody"));
    const last = list.last;
    const retry = el("button", { class: "btn btn--ghost btn--sm", type: "button", "data-members-sync": true }, t("members.syncNow"));
    retry.addEventListener("click", () => act("/admin/api/members/sync", {}, t("members.cloudflareList"), retry));
    return el("div", { class: "button-row" },
      last?.status === "failed"
        ? notice("warning", t("members.notUpdated"), `${last.detail} (${formatDate(last.at)})`)
        : notice("success", t("members.cloudflareList"), last ? t("members.upToDate", { at: formatDate(last.at) }) : t("members.notUpdatedYet")),
      retry);
  }

  function memberRow(member) {
    const reason = el("input", { type: "text", name: "reason", maxlength: "300", autocomplete: "off", "aria-label": t("members.reasonFor", { email: member.email }) });
    const select = el("select", { name: "role", "aria-label": t("members.roleFor", { email: member.email }) },
      ...["owner", "member"].map((value) => el("option", { value, selected: value === member.role }, role(value))));
    const save = el("button", { class: "btn btn--ghost btn--sm", type: "button" }, t("members.changeRole"));
    const remove = el("button", { class: "btn btn--danger-ghost btn--sm", type: "button" }, t("members.remove"));
    save.addEventListener("click", () => {
      if (select.value === member.role) return message.replaceChildren(notice("info", t("members.noChange"), t("members.alreadyRole", { email: member.email, role: role(member.role) })));
      act("/admin/api/members/role", { email: member.email, role: select.value, reason: reason.value }, t("members.roleChanged", { email: member.email }), save);
    });
    remove.addEventListener("click", () => {
      if (!window.confirm(t("members.removeConfirm", { email: member.email }))) return;
      act("/admin/api/members/remove", { email: member.email, reason: reason.value }, t("members.removed", { email: member.email }), remove);
    });
    return el("li", { class: "record", "data-member": member.email },
      el("div", { class: "record__head" },
        el("strong", {}, member.email),
        badge(member.role === "owner" ? "ok" : "neutral", role(member.role)),
        member.email === me?.email && el("small", {}, t("members.you")),
        member.status === "active" && el("small", { "data-member-alerts": String(Boolean(member.teamAlerts)) }, t(member.teamAlerts ? "nav.teamEmailsOn" : "nav.teamEmailsOff")),
        el("small", {}, t("members.addedBy", { who: member.addedBy, at: formatDate(member.addedAt) }))),
      el("details", { class: "disclosure" },
        el("summary", {}, t("members.change")),
        el("div", { class: "form-grid" },
          el("label", { class: "field" }, el("span", { class: "field__label" }, t("members.role")), el("span", { class: "select" }, select)),
          el("label", { class: "field" }, el("span", { class: "field__label" }, t("members.reason")), reason),
          el("div", { class: "button-row form-grid__wide" }, save, remove))));
  }

  function addForm() {
    const form = el("form", { class: "form-grid form-grid--add", "data-member-add": true, novalidate: true },
      el("label", { class: "field" }, el("span", { class: "field__label" }, t("members.email")), el("input", { type: "email", name: "email", required: true, maxlength: "254", autocomplete: "off", inputmode: "email" })),
      el("label", { class: "field" }, el("span", { class: "field__label" }, t("members.role")),
        el("span", { class: "select" }, el("select", { name: "role" }, el("option", { value: "member" }, role("member")), el("option", { value: "owner" }, role("owner"))))),
      el("label", { class: "field" }, el("span", { class: "field__label" }, t("members.reason")), el("input", { type: "text", name: "reason", maxlength: "300", autocomplete: "off" })),
      el("button", { class: "btn btn--primary", type: "submit" }, t("members.add")));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(form));
      if (!body.email.trim()) return message.replaceChildren(notice("warning", t("members.missingEmail"), t("members.missingEmailBody")));
      act("/admin/api/members", body, t("members.added", { email: body.email.trim().toLowerCase() }), $("button[type=submit]", form));
    });
    return form;
  }

  function render() {
    const active = data.members.filter((member) => member.status === "active");
    const former = data.members.filter((member) => member.status !== "active");
    results.replaceChildren(
      signInNotice(),
      el("ul", { class: "record-list", "data-member-list": true }, ...active.map(memberRow)),
      el("h2", { class: "sub__title" }, t("members.addTitle")),
      addForm(),
      message,
      ...[former.length && el("details", { class: "disclosure" },
        el("summary", {}, t("members.former", { n: former.length })),
        el("ul", { class: "record-list" }, ...former.map((member) => el("li", { class: "record" }, el("span", {}, member.email), el("small", {}, t("members.removedBy", { who: member.updatedBy, at: formatDate(member.updatedAt) }))))))].filter(Boolean),
    );
  }

  render();
  host.replaceChildren(
    el("header", { class: "page-head" }, el("p", { class: "eyebrow" }, t("members.eyebrow")), el("h1", { class: "page-title" }, t("nav.members"))),
    el("section", { class: "card", "data-admin-members-section": true }, el("p", { class: "hint" }, t("members.intro")), results),
  );
}
