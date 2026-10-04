/*
 * APGO US store: Meta Pixel (browser side).
 *
 * Loaded with <script src="js/meta-pixel.js" defer></script> on the public store pages only
 * (never on /admin). It does nothing unless the page is served from store.shopapgo.com, so
 * staging, localhost and preview hosts never talk to Meta.
 *
 * It does NOT touch the cart code: the store already announces what happens through
 * window "apgo:analytics" CustomEvents (js/commerce/shared.js track()). This file only
 * translates those events into Meta standard events. Prices are never written here; they come
 * from /api/store/config (catalog), the checkout session quote or the server's order record.
 *
 * Deduplication with the server-side Conversions API (worker):
 *   InitiateCheckout  eventID = "ic_" + merchant order id (APGO-US-...)
 *   Purchase          eventID = "purchase_" + merchant order id
 * See docs/meta-tracking-frontend.md.
 */
(function () {
  "use strict";

  var PIXEL_ID = "2606879866471418";
  var STORE_HOSTNAME = "store.shopapgo.com";
  var FBEVENTS_URL = "https://connect.facebook.net/en_US/fbevents.js";
  var COOKIE_DOMAIN = ".shopapgo.com";
  var FBC_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
  var PURCHASE_KEY_PREFIX = "apgo_meta_purchase_";

  if (window.location.hostname !== STORE_HOSTNAME) return;

  // ---------- cookies: _fbc backup from ?fbclid= ----------

  function readCookie(name) {
    var parts = String(document.cookie || "").split(";");
    for (var i = 0; i < parts.length; i += 1) {
      var part = parts[i].replace(/^\s+/, "");
      if (part.indexOf(name + "=") === 0) {
        try {
          return decodeURIComponent(part.slice(name.length + 1));
        } catch (error) {
          return part.slice(name.length + 1);
        }
      }
    }
    return "";
  }

  function fbclidFromUrl() {
    try {
      return new URLSearchParams(window.location.search).get("fbclid") || "";
    } catch (error) {
      return "";
    }
  }

  // Meta's own script writes _fbc when it sees fbclid; this makes sure the cookie exists
  // (readable by checkout.js for the Conversions API) even if the script is blocked or late.
  function ensureFbcCookie() {
    var fbclid = fbclidFromUrl();
    if (!fbclid || readCookie("_fbc")) return;
    var value = "fb.1." + Date.now() + "." + fbclid;
    document.cookie =
      "_fbc=" + encodeURIComponent(value) +
      "; Max-Age=" + FBC_MAX_AGE_SECONDS +
      "; Path=/; Domain=" + COOKIE_DOMAIN + "; SameSite=Lax";
  }

  // ---------- Meta base code ----------

  function installBaseCode() {
    var f = function () {
      if (f.callMethod) f.callMethod.apply(f, arguments);
      else f.queue.push(arguments);
    };
    window.fbq = f;
    if (!window._fbq) window._fbq = f;
    f.push = f;
    f.loaded = true;
    f.version = "2.0";
    f.queue = [];
    var script = document.createElement("script");
    script.async = true;
    script.src = FBEVENTS_URL;
    var first = document.getElementsByTagName("script")[0];
    if (first && first.parentNode) first.parentNode.insertBefore(script, first);
    else document.head.appendChild(script);
    window.fbq("init", PIXEL_ID);
    window.fbq("track", "PageView");
  }

  ensureFbcCookie();
  // An existing fbq (another tag already initialised Meta) is reused, never initialised twice.
  if (!window.fbq) installBaseCode();

  function send(name, params, eventId) {
    try {
      if (typeof window.fbq !== "function") return;
      if (eventId) window.fbq("track", name, params, { eventID: eventId });
      else window.fbq("track", name, params);
    } catch (error) {
      // Tracking must never break the store.
    }
  }

  // ---------- catalog (prices come from the store API, never from this file) ----------

  var catalogPromise = null;

  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch("/api/store/config", { credentials: "same-origin" })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (config) { return config && config.products ? config : null; })
        .catch(function () { return null; });
    }
    return catalogPromise;
  }

  // Resolves { id: "D204", priceCents: number|null } for a cart id such as "d204".
  function productFor(config, cartId) {
    var key = String(cartId || "").toLowerCase();
    var product = config && config.products ? config.products[key] : null;
    return {
      id: product && product.sku ? product.sku : String(cartId || "").toUpperCase(),
      priceCents: product && Number.isFinite(product.priceCents) ? product.priceCents : null,
    };
  }

  var major = function (centsValue) { return Number((centsValue / 100).toFixed(2)); };

  // ---------- GA-style items -> Meta contents ----------

  // items: [{ item_id, quantity, price }] (see checkout.js: checkout_session_created / purchase)
  function contentsFromItems(items) {
    if (!Array.isArray(items)) return [];
    return items
      .filter(function (item) { return item && item.item_id; })
      .map(function (item) {
        var content = { id: String(item.item_id), quantity: Number(item.quantity) || 1 };
        if (Number.isFinite(item.price)) content.item_price = item.price;
        return content;
      });
  }

  function commerceParams(detail) {
    var contents = contentsFromItems(detail.items);
    var params = { content_type: "product", currency: detail.currency || "USD" };
    if (contents.length) {
      params.content_ids = contents.map(function (c) { return c.id; });
      params.contents = contents;
      params.num_items = contents.reduce(function (sum, c) { return sum + c.quantity; }, 0);
    }
    if (Number.isFinite(detail.value)) params.value = detail.value;
    return params;
  }

  // ---------- event handlers ----------

  var lastCheckout = null; // contents of the most recent checkout session, for AddPaymentInfo
  var sentInitiate = {};

  function onViewContent() {
    var triggers = document.querySelectorAll("[data-add-to-cart]");
    if (!triggers.length) return;
    var ids = [];
    for (var i = 0; i < triggers.length; i += 1) {
      var id = triggers[i].getAttribute("data-add-to-cart");
      if (id && ids.indexOf(id) === -1) ids.push(id);
    }
    loadCatalog().then(function (config) {
      var products = ids.map(function (id) { return productFor(config, id); });
      var params = {
        content_type: "product",
        content_ids: products.map(function (p) { return p.id; }),
        contents: products.map(function (p) {
          var content = { id: p.id, quantity: 1 };
          if (p.priceCents !== null) content.item_price = major(p.priceCents);
          return content;
        }),
        currency: (config && config.currency) || "USD",
      };
      // One product on the page: its price is the value. Several: no single value, so none is sent.
      if (products.length === 1 && products[0].priceCents !== null) params.value = major(products[0].priceCents);
      send("ViewContent", params);
    });
  }

  function onAddToCart(detail) {
    var quantity = Number(detail.quantity) > 0 ? Number(detail.quantity) : 1;
    loadCatalog().then(function (config) {
      var product = productFor(config, detail.sku);
      var content = { id: product.id, quantity: quantity };
      var params = {
        content_type: "product",
        content_ids: [product.id],
        contents: [content],
        currency: (config && config.currency) || "USD",
      };
      if (product.priceCents !== null) {
        content.item_price = major(product.priceCents);
        params.value = major(product.priceCents * quantity);
      }
      send("AddToCart", params);
    });
  }

  function onCheckoutSession(detail) {
    var orderId = detail.order_id;
    if (!orderId || sentInitiate[orderId]) return;
    sentInitiate[orderId] = true;
    lastCheckout = commerceParams(detail);
    send("InitiateCheckout", lastCheckout, "ic_" + orderId);
  }

  function onAddPaymentInfo(detail) {
    var params = {};
    if (lastCheckout) for (var key in lastCheckout) params[key] = lastCheckout[key];
    if (Number.isFinite(detail.value)) params.value = detail.value;
    params.currency = detail.currency || params.currency || "USD";
    send("AddPaymentInfo", params);
  }

  function onPurchase(detail) {
    var orderId = detail.transaction_id;
    if (!orderId) return;
    var key = PURCHASE_KEY_PREFIX + orderId;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch (error) {
      // Without storage a refresh may re-send; the shared eventID still lets Meta deduplicate.
    }
    send("Purchase", commerceParams(detail), "purchase_" + orderId);
  }

  window.addEventListener("apgo:analytics", function (event) {
    var detail = event && event.detail;
    if (!detail || typeof detail.event !== "string") return;
    switch (detail.event) {
      case "add_to_cart": return onAddToCart(detail);
      case "checkout_session_created": return onCheckoutSession(detail);
      case "add_payment_info": return onAddPaymentInfo(detail);
      case "purchase": return onPurchase(detail);
      default: return undefined;
    }
  });

  onViewContent();
})();
