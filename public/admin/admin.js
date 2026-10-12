// The order back office (M9, D50): one page with a view per address, so each page can be bookmarked and shared:
//   #/                 dashboard (./dashboard.js)
//   #/orders           orders, ?view=&q= (./orders.js)       #/orders/<id>    one order (./order.js)
//   #/checkouts        unfinished checkouts (./checkouts.js)
//   #/products         products (./products.js)              #/products/<id>  one product, stop selling
//   #/customers        customers, ?q=&sort= (./customers.js) #/customers/<order number>  one customer, privacy requests
//   #/reports          reports and CSV exports, ?preset=&from=&to= (./reports.js)
//   #/messages         Contact us messages (./messages.js)
//   #/activity         activity log, #/members  members (./team.js)
// The Worker gates this page and /admin/api/* (Cloudflare Access, or until then HTTP Basic, which the browser re-sends
// on every fetch); nothing secret is stored by this page. Words come from ./strings.js in Chinese or English (D49).
import { adminApi } from "./api.js";
import { applyStatic, onLangChange, t } from "./i18n.js";
import { el, notice } from "./ui.js";
import { initShell, renderNav, setOrdersBadge } from "./shell.js";
import { renderDashboard } from "./dashboard.js";
import { renderOrders } from "./orders.js";
import { renderOrder } from "./order.js";
import { renderProduct, renderProducts } from "./products.js";
import { renderCheckouts } from "./checkouts.js";
import { renderMessages } from "./messages.js";
import { renderCustomer, renderCustomers } from "./customers.js";
import { renderReports } from "./reports.js";
import { renderActivity, renderMembers } from "./team.js";

// The back office only works on its own host (commerce/worker/hosts.js). Until the cutover the brand host (Cloudflare
// Pages) builds the same site files, this page among them, so leave for the home page there.
if (["www.shopapgo.com", "shopapgo.com"].includes(location.hostname)) location.replace("/");

const $ = (selector, root = document) => root.querySelector(selector);
const ORDER_ID = /^APGO-US-[0-9A-Z]{12}$/;

const VIEWS = {
  dashboard: { title: "nav.dashboard", render: renderDashboard },
  orders: { title: "nav.orders", render: renderOrders },
  order: { title: "nav.orders", render: renderOrder },
  checkouts: { title: "nav.checkouts", render: renderCheckouts },
  products: { title: "nav.products", render: renderProducts },
  product: { title: "nav.products", render: renderProduct },
  customers: { title: "nav.customers", render: renderCustomers },
  customer: { title: "nav.customers", render: renderCustomer },
  messages: { title: "nav.messages", render: renderMessages },
  reports: { title: "nav.reports", render: renderReports },
  activity: { title: "nav.activity", render: renderActivity },
  members: { title: "nav.members", render: renderMembers },
};

// "#/orders/APGO-US-…?x=y" → { name: "order", id, params }. Links from before the views (#APGO-US-…) still open the order.
function parseRoute() {
  const raw = decodeURIComponent(location.hash.slice(1));
  if (ORDER_ID.test(raw)) return { redirect: `#/orders/${raw}` };
  const [path, query = ""] = raw.split("?");
  const [section = "dashboard", id = null] = path.replace(/^\/+/, "").split("/").filter(Boolean);
  const name = !id ? section : { orders: "order", products: "product", customers: "customer" }[section] ?? section;
  return { name: VIEWS[name] ? name : "dashboard", id, params: new URLSearchParams(query) };
}

let whoami = null;
let renders = 0;

async function render({ focus = false } = {}) {
  const route = parseRoute();
  if (route.redirect) return location.replace(route.redirect);
  const mine = ++renders;
  const view = VIEWS[route.name];
  if (route.name === "members" && whoami?.actor?.role !== "owner") return location.replace("#/");
  document.title = `${t(view.title)} · ${t("nav.appTitle")}`;
  renderNav(route.name);
  $("[data-admin-message]").replaceChildren();
  const host = $("[data-admin-view]");
  host.dataset.view = route.name;
  host.replaceChildren(el("p", { class: "muted view-loading" }, t("common.loading")));
  if (focus) $("#main").focus({ preventScroll: true });
  window.scrollTo(0, 0);
  try {
    await view.render(host, {
      route,
      adminApi,
      me: whoami?.actor ?? null,
      isCurrent: () => mine === renders,
      navigate: (hash) => {
        if (location.hash === hash) render();
        else location.hash = hash;
      },
      message: (node) => $("[data-admin-message]").replaceChildren(...[node].filter(Boolean)),
      setOrdersBadge,
    });
  } catch (error) {
    // The page's data did not load: say why at the top (not set up, signed out, offline…).
    if (mine !== renders) return;
    host.replaceChildren();
    $("[data-admin-message]").replaceChildren(notice("warning", t("common.unavailable"), error.message));
  }
}

applyStatic();
try {
  whoami = await adminApi("/admin/api/me");
} catch {
  // An older Worker without /me, or the back office is not set up: the page says so when its data does not load.
  whoami = null;
}
initShell({ adminApi, whoami });
onLangChange(() => {
  applyStatic();
  render();
});
window.addEventListener("hashchange", () => render({ focus: true }));
// The count next to Orders: orders that need someone.
adminApi("/admin/api/orders?limit=1").then((page) => setOrdersBadge((page.viewCounts?.review ?? 0) + (page.viewCounts?.problems ?? 0) + (page.viewCounts?.disputes ?? 0)), () => {});
await render();
