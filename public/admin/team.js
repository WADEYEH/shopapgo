// Back office: who is signed in, the site-wide Activity log, and the Members section (owners only).
// API: commerce/worker/admin.js (/admin/api/me, /activity, /members...). Everything is rendered as text, never HTML.
import { el, notice } from "./ui.js";

const $ = (selector, root = document) => root.querySelector(selector);
const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const formatDate = (iso) => (iso ? dateTime.format(new Date(iso)) : "—");

const ROLE_LABEL = { owner: "Owner", member: "Member" };
const VIA_LABEL = { access: "Cloudflare sign-in", password: "shared login", token: "script token", "staging-login": "staging login", system: "system" };
const ACTION_LABEL = {
  "member.bootstrap": "First owner set",
  "member.added": "Member added",
  "member.role_changed": "Role changed",
  "member.removed": "Member removed",
  "access_list.synced": "Cloudflare list updated",
  "access_list.sync_failed": "Cloudflare list update failed",
  "order.shipped": "Marked shipped",
  "order.email.retry": "Email retried",
  "mcf.submitted": "Sent to Amazon",
  "mcf.failed": "Sending to Amazon failed",
  "mcf.shipped": "Shipped by Amazon",
  "mcf.closed": "Closed by Amazon",
  "mcf.cancel_requested": "Amazon cancellation requested",
  "staging.refund.check": "Staging refund check",
};
const SYNC_TEXT = {
  synced: (s) => `Cloudflare list updated${s.added || s.removed ? ` (${s.added} added, ${s.removed} removed)` : ""}.`,
  not_configured: () => "Cloudflare list sync is not set up.",
  failed: (s) => `Cloudflare list not updated: ${s.detail}`,
};

export async function initTeam({ adminApi, openOrder }) {
  let me;
  try {
    me = (await adminApi("/admin/api/me")).actor;
  } catch {
    return; // signed-in identity unavailable (older Worker): the order pages still work
  }
  const who = $("[data-admin-whoami]");
  if (who) {
    who.textContent = `${me.email ?? me.id} · ${ROLE_LABEL[me.role] ?? me.role}`;
    who.hidden = false;
  }
  initActivity({ adminApi, openOrder });
  if (me.role === "owner") initMembers({ adminApi, me });
}

// ---------- Activity ----------

function describe(entry) {
  const parts = [];
  if (entry.action === "member.role_changed" && entry.before && entry.after) parts.push(`${ROLE_LABEL[entry.before.role]} → ${ROLE_LABEL[entry.after.role]}`);
  if (entry.action === "member.added" && entry.after) parts.push(`as ${ROLE_LABEL[entry.after.role]}`);
  if (entry.action.startsWith("access_list.") && entry.detail) parts.push(SYNC_TEXT[entry.detail.status]?.(entry.detail) ?? "");
  if (entry.detail?.trackingNumber) parts.push(`${entry.detail.carrier ?? ""} ${entry.detail.trackingNumber}`.trim());
  if (entry.detail?.kind && entry.action === "order.email.retry") parts.push(`${entry.detail.kind}: ${entry.detail.result}`);
  return parts.filter(Boolean).join(" · ");
}

function initActivity({ adminApi, openOrder }) {
  const section = $("[data-admin-activity-section]");
  if (!section) return;
  section.hidden = false;
  const form = $("[data-admin-activity-filter]", section);
  const host = $("[data-admin-activity]", section);
  const person = $("select[name=actor]", form);
  const state = { entries: [], nextCursor: null, filters: {} };

  const render = () => {
    if (!state.entries.length) return host.replaceChildren(el("p", { class: "body body--sm" }, "Nothing in this period."));
    host.replaceChildren(
      el("ul", { class: "admin-activity-list" }, ...state.entries.map((entry) => {
        const target = entry.source === "order" && entry.target
          ? el("a", { href: `#${entry.target}`, onclick: (event) => { event.preventDefault(); openOrder(entry.target); } }, entry.target)
          : entry.target;
        return el("li", { class: "admin-activity", "data-activity-action": entry.action },
          el("div", { class: "admin-message__head" },
            el("strong", {}, ACTION_LABEL[entry.action] ?? entry.action),
            target || null,
            el("small", {}, formatDate(entry.at)),
          ),
          el("p", { class: "admin-activity__who" }, `By ${entry.actor}${entry.via ? ` (${VIA_LABEL[entry.via] ?? entry.via})` : ""}`),
          describe(entry) ? el("p", { class: "admin-activity__what" }, describe(entry)) : null,
          entry.reason && el("p", { class: "admin-activity__why" }, `Reason: ${entry.reason}`),
        );
      })),
      ...[state.nextCursor && el("button", { class: "btn btn--sm btn--text", type: "button", onclick: () => load() }, "Load older activity")].filter(Boolean),
    );
  };

  async function load({ reset = false } = {}) {
    const button = $("button[type=submit]", form);
    button.disabled = true;
    try {
      const params = new URLSearchParams(state.filters);
      if (!reset && state.nextCursor) params.set("cursor", state.nextCursor);
      const page = await adminApi(`/admin/api/activity?${params}`);
      state.entries = reset ? page.entries : [...state.entries, ...page.entries];
      state.nextCursor = page.nextCursor;
      if (page.actors) {
        const chosen = person.value;
        person.replaceChildren(el("option", { value: "" }, "Everyone"), ...page.actors.map((actor) => el("option", { value: actor }, actor)));
        person.value = page.actors.includes(chosen) ? chosen : "";
      }
      render();
    } catch (error) {
      host.replaceChildren(notice("warning", "Activity unavailable", error.message));
    } finally {
      button.disabled = false;
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
}

// ---------- Members (owners only) ----------

function initMembers({ adminApi, me }) {
  const section = $("[data-admin-members-section]");
  if (!section) return;
  section.hidden = false;
  const host = $("[data-admin-members]", section);
  const message = el("div", { "data-members-message": true, "aria-live": "polite" });
  let data = null;

  const outcome = (title, result) => notice(
    result.sync?.status === "failed" ? "warning" : "success",
    title,
    [
      result.notified ? `Owners emailed: ${result.notified.sent}${result.notified.skipped ? `, not emailed: ${result.notified.skipped}` : ""}${result.notified.failed ? `, failed: ${result.notified.failed}` : ""}.` : "",
      result.sync ? SYNC_TEXT[result.sync.status]?.(result.sync) ?? "" : "",
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
      message.replaceChildren(notice("warning", "Not changed", error.message));
      if (button) button.disabled = false;
    }
  }

  function signInNotice() {
    if (!data.accessSignIn) {
      return notice("info", "Sign-in", "The back office still uses the shared login. Once Cloudflare Access sign-in is switched on, only the active members below can open it, each with their own Google account or email code.");
    }
    const list = data.accessList;
    if (!list.configured) return notice("warning", "Cloudflare list sync is not set up", "Add or remove the same email in Cloudflare Access as well, or people you add here cannot sign in.");
    const last = list.last;
    const retry = el("button", { class: "btn btn--sm", type: "button", "data-members-sync": true }, "Update Cloudflare list now");
    retry.addEventListener("click", () => act("/admin/api/members/sync", {}, "Cloudflare list", retry));
    return el("div", { class: "admin-members__sync" },
      last?.status === "failed"
        ? notice("warning", "Cloudflare list not updated", `${last.detail} (${formatDate(last.at)})`)
        : notice("success", "Cloudflare list", last ? `Up to date as of ${formatDate(last.at)}.` : "Not updated yet."),
      retry,
    );
  }

  function memberRow(member) {
    const reason = el("input", { type: "text", name: "reason", maxlength: "300", autocomplete: "off", "aria-label": `Reason for the change to ${member.email}` });
    const role = el("select", { name: "role", "aria-label": `Role for ${member.email}` },
      ...Object.entries(ROLE_LABEL).map(([value, label]) => el("option", { value, selected: value === member.role }, label)));
    const save = el("button", { class: "btn btn--sm", type: "button" }, "Change role");
    const remove = el("button", { class: "btn btn--sm btn--text", type: "button" }, "Remove");
    save.addEventListener("click", () => {
      if (role.value === member.role) return message.replaceChildren(notice("info", "No change", `${member.email} is already ${ROLE_LABEL[member.role].toLowerCase()}.`));
      act("/admin/api/members/role", { email: member.email, role: role.value, reason: reason.value }, `Role changed for ${member.email}`, save);
    });
    remove.addEventListener("click", () => {
      if (!window.confirm(`Remove ${member.email}? They lose access to the back office right away.`)) return;
      act("/admin/api/members/remove", { email: member.email, reason: reason.value }, `${member.email} removed`, remove);
    });
    return el("li", { class: "admin-member", "data-member": member.email },
      el("div", { class: "admin-message__head" },
        el("strong", {}, member.email),
        el("span", { class: `status status--${member.role === "owner" ? "paid" : "pending"}` }, ROLE_LABEL[member.role]),
        member.email === me.email && el("small", {}, "(you)"),
        el("small", {}, `Added by ${member.addedBy}, ${formatDate(member.addedAt)}`),
      ),
      el("details", { class: "admin-member__change" },
        el("summary", {}, "Change"),
        el("div", { class: "admin-member__controls" },
          el("label", { class: "field" }, el("span", { class: "field__label" }, "Role"), el("span", { class: "select" }, role)),
          el("label", { class: "field" }, el("span", { class: "field__label" }, "Reason (optional)"), reason),
          el("div", { class: "admin-mcf__actions" }, save, remove),
        ),
      ),
    );
  }

  function addForm() {
    const form = el("form", { class: "admin-member-add", "data-member-add": true, novalidate: true },
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Email"), el("input", { type: "email", name: "email", required: true, maxlength: "254", autocomplete: "off", inputmode: "email" })),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Role"),
        el("span", { class: "select" }, el("select", { name: "role" }, el("option", { value: "member" }, "Member"), el("option", { value: "owner" }, "Owner")))),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Reason (optional)"), el("input", { type: "text", name: "reason", maxlength: "300", autocomplete: "off" })),
      el("button", { class: "btn btn--md", type: "submit" }, "Add member"),
    );
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(form));
      if (!body.email.trim()) return message.replaceChildren(notice("warning", "Missing email", "Enter the email they sign in with."));
      act("/admin/api/members", body, `${body.email.trim().toLowerCase()} added`, $("button[type=submit]", form));
    });
    return form;
  }

  function render() {
    const active = data.members.filter((member) => member.status === "active");
    const former = data.members.filter((member) => member.status !== "active");
    host.replaceChildren(
      signInNotice(),
      el("ul", { class: "admin-message-list", "data-member-list": true }, ...active.map(memberRow)),
      el("h3", { class: "admin-subhead" }, "Add a member"),
      addForm(),
      message,
      ...[former.length && el("details", { class: "admin-member-former" },
        el("summary", {}, `Former members (${former.length})`),
        el("ul", { class: "admin-lines" }, ...former.map((member) => el("li", {}, el("span", {}, member.email), el("small", {}, `Removed by ${member.updatedBy}, ${formatDate(member.updatedAt)}`)))))].filter(Boolean),
    );
  }

  (async () => {
    try {
      data = await adminApi("/admin/api/members");
      render();
    } catch (error) {
      host.replaceChildren(notice("warning", "Members unavailable", error.message));
    }
  })();
}
