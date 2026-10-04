// Product page (D204 DRY / D215 WET): one template, switched in place.
//
// - Prices: only from /api/store/config (worker/pricing.js). Nothing here knows a price.
// - Cart: shared.js `cart` (localStorage { sku, qty }); analytics: shared.js `track` -> apgo:analytics.
// - Placeholders (pair price, shipping and returns terms) carry a [TO CONFIRM] mark in the HTML;
//   reviews and before/after photos come from product-reviews.js and stay hidden/labelled until real.
import { MAX_LINE_QTY, api, cart, el, money, renderCartCount, toConfirm, track } from "./shared.js";
import { BRAND, PRODUCTS, QUIZ, SEO, SKUS, productFile, productPath } from "./product-data.js";
import { BEFORE_AFTER, MIN_VERIFIED_REVIEWS, REVIEWS } from "./product-reviews.js";

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const state = {
  sku: "d204",
  qty: 1,
  pair: false,
  config: null,
  answers: [],
  image: 0,
};

// ---------- helpers ----------

function skuFromLocation() {
  const fixed = document.body.dataset.sku;
  if (SKUS.includes(fixed)) return fixed;
  const fromPath = location.pathname.match(/\/products\/(d204|d215)(?:\.html)?\/?$/i);
  if (fromPath) return fromPath[1].toLowerCase();
  const query = (new URLSearchParams(location.search).get("sku") || "").toLowerCase();
  if (SKUS.includes(query)) return query;
  const hash = location.hash.replace("#", "").toLowerCase();
  if (hash === "wet" || hash === "d215") return "d215";
  return "d204";
}

const product = (sku = state.sku) => PRODUCTS[sku];
const other = (sku = state.sku) => PRODUCTS[sku].other;
const word = (sku) => (PRODUCTS[sku].routine === "dry" ? "DRY" : "WET");
const maxQty = () => state.config?.maxQtyPerLine ?? MAX_LINE_QTY;
const centsOf = (sku) => state.config?.products?.[sku]?.priceCents;
// Unknown until config arrives; a failed config load counts as "not approved" (markers stay on).
const isEstimate = () => state.config?.estimate !== false;

function unitLines() {
  const lines = [{ sku: state.sku, qty: state.qty }];
  if (state.pair) lines.push({ sku: other(), qty: 1 });
  return lines;
}

function totalCents() {
  let total = 0;
  for (const { sku, qty } of unitLines()) {
    const cents = centsOf(sku);
    if (typeof cents !== "number") return null;
    total += cents * qty;
  }
  return total;
}

const priceText = (cents) => (typeof cents === "number" ? money(cents) : "—");

function analyticsItems(lines) {
  return lines.map(({ sku, qty }) => ({
    item_id: PRODUCTS[sku].sku,
    item_name: `${PRODUCTS[sku].word} · ${PRODUCTS[sku].name}`,
    item_category: PRODUCTS[sku].routine,
    quantity: qty,
    ...(typeof centsOf(sku) === "number" ? { price: centsOf(sku) / 100 } : {}),
  }));
}

// ---------- head: title, canonical, og, JSON-LD ----------

function setMeta(selector, attribute, value) {
  const node = $(selector);
  if (node) node.setAttribute(attribute, value);
}

function updateHead() {
  const seo = SEO[state.sku];
  const abs = (path) => new URL(path, location.origin).href;
  document.title = seo.title;
  setMeta('meta[name="description"]', "content", seo.description);
  setMeta('link[rel="canonical"]', "href", abs(seo.path));
  setMeta('meta[property="og:title"]', "content", seo.title);
  setMeta('meta[property="og:description"]', "content", seo.description);
  setMeta('meta[property="og:url"]', "content", abs(seo.path));
  setMeta('meta[property="og:image"]', "content", abs(seo.image));
  setMeta('meta[property="og:type"]', "content", "product");

  const p = product();
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${p.name} (${word(state.sku)})`,
    sku: p.sku,
    description: seo.description,
    brand: { "@type": "Brand", name: BRAND },
    image: [abs(seo.image)],
  };
  // Price only from the live config and only once the owner approved pricing: a placeholder
  // price must never be published to search engines.
  const cents = centsOf(state.sku);
  if (state.config && state.config.estimate === false && typeof cents === "number") {
    data.offers = {
      "@type": "Offer",
      url: abs(seo.path),
      priceCurrency: state.config.currency || "USD",
      price: (cents / 100).toFixed(2),
    };
  }
  const script = $("#pdp-jsonld");
  if (script) script.textContent = JSON.stringify(data);
}

// ---------- rendering ----------

function verifiedReviews(sku) {
  return (REVIEWS[sku] || []).filter((review) => review && review.verified === true && Number.isFinite(review.rating));
}

function renderHero() {
  const p = product();
  const sku = state.sku;
  $("main").dataset.routine = p.routine;
  $("[data-crumb]").textContent = `${p.word} · ${p.name}`;
  const routineWord = $("[data-routine-word]");
  routineWord.textContent = word(sku);
  routineWord.className = `routine routine--xl routine--${p.routine}`;
  $("[data-when]").textContent = p.when;
  $("[data-sku-tag]").textContent = p.sku;
  $("[data-name]").textContent = p.name;
  $("[data-promise]").textContent = p.promise;
  $("[data-ghost]").textContent = word(sku);
  for (const input of $$('input[name="routine"]')) input.checked = input.value === sku;

  // Rating line: only with real, verified reviews.
  const reviews = verifiedReviews(sku);
  const rating = $("[data-rating]");
  if (reviews.length >= MIN_VERIFIED_REVIEWS) {
    const average = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    rating.textContent = `★ ${average.toFixed(1)} · ${reviews.length} verified reviews`;
    rating.hidden = false;
  } else {
    rating.hidden = true;
  }

  // Pair upsell
  const o = PRODUCTS[other()];
  $("[data-pair-label]").textContent = `Add ${o.word} too — try both routines`;
  const pairImg = $("[data-pair-img]");
  pairImg.src = SEO[other()].image;
  $("[data-pair]").checked = state.pair;

  // Gallery
  renderGallery();

  // Nav highlight
  for (const link of $$("[data-nav-sku]")) {
    if (link.dataset.navSku === sku) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function galleryImages() {
  const p = product();
  return [
    { src: SEO[state.sku].image, alt: `APGO ${p.name} ${p.size}`, fit: "contain" },
    ...p.steps.slice(0, 3).map(([file, caption]) => ({
      src: `/assets/application/${file}.webp`,
      alt: `${p.word} application, step: ${caption}`,
      fit: "cover",
    })),
  ];
}

function renderGallery() {
  const images = galleryImages();
  state.image = Math.min(state.image, images.length - 1);
  const main = $("[data-gallery-main]");
  const current = images[state.image];
  main.src = current.src;
  main.alt = current.alt;
  main.dataset.fit = current.fit;
  $("[data-thumbs]").replaceChildren(
    ...images.map((image, index) =>
      el(
        "li",
        {},
        el(
          "button",
          {
            type: "button",
            class: "pdp-thumb",
            "aria-label": `Show image ${index + 1} of ${images.length}`,
            "aria-pressed": String(index === state.image),
            "data-thumb": index,
            onclick: () => {
              state.image = index;
              renderGallery();
            },
          },
          el("img", { src: image.src, alt: "", width: 120, height: 120, loading: "lazy", "data-fit": image.fit }),
        ),
      ),
    ),
  );
}

function renderPrice() {
  const p = product();
  const total = totalCents();
  $("[data-price]").textContent = priceText(total);
  $("[data-size]").textContent = state.pair ? "Dry + Wet" : `${p.size} · ${p.oz}`;
  $("[data-qty]").textContent = String(state.qty);
  $("[data-qty-dec]").disabled = state.qty <= 1;
  $("[data-qty-inc]").disabled = state.qty >= maxQty();
  const note = $("[data-price-note]");
  note.replaceChildren();
  if (!state.config) {
    note.append("Price unavailable right now. You can still add to your cart.");
  } else if (isEstimate()) {
    note.append("Price shown is a placeholder ", toConfirm());
  }
  note.hidden = note.childNodes.length === 0;
  // Sticky bar
  $("[data-sticky-word]").textContent = word(state.sku);
  $("[data-sticky-word]").className = `routine routine--sm routine--${p.routine}`;
  $("[data-sticky-price]").textContent = priceText(total);
  $("[data-sticky-name]").textContent = state.pair ? "Dry + Wet pair" : p.name;
  $("[data-sticky-img]").src = SEO[state.sku].image;
  // Add buttons
  for (const label of $$("[data-add-label]")) {
    label.replaceChildren(`Add ${p.word} to cart `, el("span", { "aria-hidden": "true" }, "→"));
  }
}

function renderBenefits() {
  $("[data-benefits]").replaceChildren(
    ...product().benefits.map(([value, unit, caption]) =>
      el(
        "li",
        { class: "pdp-benefit" },
        el("span", { class: "pdp-benefit__value" }, value, el("span", { class: "pdp-benefit__unit" }, unit)),
        el("span", { class: "pdp-benefit__caption" }, caption),
      ),
    ),
  );
}

function renderResult() {
  const section = $("[data-result]");
  const photos = BEFORE_AFTER[state.sku];
  const grid = $("[data-result-grid]");
  const p = product();
  $("[data-result-lede]").textContent = `Same panel, same light, before and after one ${p.word.toLowerCase()} application.`;
  if (photos?.before?.src && photos?.after?.src) {
    grid.replaceChildren(
      el("figure", { class: "pdp-photo" }, el("img", { src: photos.before.src, alt: photos.before.alt || "Paint before", loading: "lazy" }), el("figcaption", {}, "Before")),
      el("figure", { class: "pdp-photo pdp-photo--after" }, el("img", { src: photos.after.src, alt: photos.after.alt || "Paint after", loading: "lazy" }), el("figcaption", {}, "After")),
    );
    section.hidden = false;
  } else if (isEstimate()) {
    // Pre-launch placeholders, clearly labelled. Hidden once pricing is approved (production).
    const slot = (label, text, extra = "") =>
      el(
        "div",
        { class: `pdp-slot ${extra}`, "data-slot": label.toLowerCase() },
        el("span", { class: "pdp-slot__label" }, label),
        el("span", { class: "pdp-slot__text" }, text),
        el("span", {}, toConfirm("TO CONFIRM: real photo pending")),
      );
    grid.replaceChildren(
      slot("Before photo", "Real customer or in-house photo, same angle"),
      slot("After photo", "Same panel after one application", "pdp-slot--after"),
    );
    section.hidden = false;
  } else {
    grid.replaceChildren();
    section.hidden = true;
  }
}

function renderHow() {
  const p = product();
  const sku = state.sku;
  $("[data-video-caption]").textContent = p.videoCaption;
  const frame = $("[data-video-frame]");
  // Reset to the poster state when the routine changes.
  if (!$("[data-video-poster]", frame)) {
    frame.replaceChildren(
      el("img", { class: "pdp-video__poster", "data-video-poster": "", alt: "", loading: "lazy", width: 1600, height: 900 }),
      el("button", { class: "pdp-video__play", type: "button", "data-video-play": "", "aria-label": "Play application video" }, el("span", { "aria-hidden": "true" }, "▶")),
    );
  }
  $("[data-video-poster]").src = `/assets/video/${sku}-poster.webp`;
  $("[data-video-play]").setAttribute("aria-label", `Play ${p.word.toLowerCase()} application video`);
  $("[data-steps]").style.setProperty("--steps", String(p.steps.length));
  $("[data-steps]").replaceChildren(
    ...p.steps.map(([file, caption]) =>
      el(
        "li",
        {},
        el("img", { src: `/assets/application/${file}.webp`, alt: `${p.word} application: ${caption}`, loading: "lazy", width: 600, height: 450 }),
        el("span", {}, caption),
      ),
    ),
  );
  $("[data-scope]").textContent = `Use on: ${p.scope} Use only as directed.`;
}

function playVideo() {
  const sku = state.sku;
  const frame = $("[data-video-frame]");
  const poster = `/assets/video/${sku}-poster.webp`;
  const video = el(
    "video",
    { class: "pdp-video__player", controls: true, autoplay: true, playsinline: true, preload: "none", poster, src: `/assets/video/${sku}-application.mp4`, "data-video-player": "" },
    el("track", { kind: "captions", srclang: "en", label: "English", src: `/assets/video/${sku}-v3-captions-en.vtt`, default: true }),
  );
  frame.replaceChildren(video);
  video.play?.().catch(() => {});
  track("video_play", { sku, placement: "pdp" });
}

function renderQuiz() {
  const form = $("[data-quiz]");
  const answers = state.answers;
  QUIZ.forEach((_, i) => {
    const group = $(`[data-quiz-q="${i}"]`, form);
    const locked = i > answers.length;
    group.dataset.state = locked ? "locked" : "open";
    for (const input of $$("input", group)) {
      input.disabled = locked;
      input.checked = answers[i] === (input.value === "yes");
    }
  });
  const result = $("[data-quiz-result]");
  if (answers.length < QUIZ.length) {
    result.hidden = true;
    result.replaceChildren();
    return;
  }
  const score = { d204: 0, d215: 0 };
  answers.forEach((yes, i) => (score[yes ? QUIZ[i].yes : QUIZ[i].no] += 1));
  const rec = score.d204 >= score.d215 ? "d204" : "d215";
  const r = PRODUCTS[rec];
  result.dataset.routine = r.routine;
  result.replaceChildren(
    el("img", { src: SEO[rec].image, alt: "", width: 72, height: 72 }),
    el(
      "div",
      { class: "quiz__rec" },
      el("span", { class: "label label--xs" }, "Your routine"),
      el("span", { class: "quiz__rec-name" }, el("span", { class: `routine routine--md routine--${r.routine}` }, word(rec)), el("span", { class: "product-name" }, r.name)),
    ),
    rec === state.sku
      ? el("button", { class: "btn", type: "button", "data-pdp-add": "", "data-placement": "quiz" }, "Add to cart ", el("span", { "aria-hidden": "true" }, "→"))
      : el("button", { class: "btn", type: "button", "data-switch-to": rec }, `Switch to ${r.word} `, el("span", { "aria-hidden": "true" }, "→")),
  );
  result.hidden = false;
}

function renderCompare() {
  const rows = [
    ["Product", (p) => p.name],
    ["When", (p) => p.when],
    ["Lasts up to", (p) => p.lasts],
    ["Contents", (p) => `${p.size} / ${p.oz}`],
    ["Price", (p) => priceText(centsOf(p.sku.toLowerCase()))],
  ];
  const body = $("[data-compare-body]");
  body.replaceChildren(
    ...rows.map(([label, value]) =>
      el(
        "tr",
        {},
        el("th", { scope: "row" }, label),
        ...SKUS.map((sku) => el("td", { "data-col": sku, class: sku === state.sku ? "is-current" : "" }, value(PRODUCTS[sku]))),
      ),
    ),
    el(
      "tr",
      {},
      el("td"),
      ...SKUS.map((sku) =>
        el(
          "td",
          { "data-col": sku, class: sku === state.sku ? "is-current" : "" },
          sku === state.sku
            ? el("button", { class: "btn btn--md", type: "button", "data-pdp-add": "", "data-placement": "compare" }, "Add to cart ", el("span", { "aria-hidden": "true" }, "→"))
            : el("button", { class: "btn btn--text", type: "button", "data-switch-to": sku }, `View ${PRODUCTS[sku].word} `, el("span", { class: "glyph", "aria-hidden": "true" }, "→")),
        ),
      ),
    ),
  );
  for (const th of $$("thead [data-col]")) {
    th.classList.toggle("is-current", th.dataset.col === state.sku);
    th.dataset.routine = PRODUCTS[th.dataset.col].routine;
  }
}

function renderReviews() {
  const section = $("[data-reviews]");
  const reviews = verifiedReviews(state.sku);
  if (reviews.length < MIN_VERIFIED_REVIEWS) {
    section.hidden = true;
    $("[data-reviews-list]").replaceChildren();
    return;
  }
  $("[data-reviews-list]").replaceChildren(
    ...reviews.map((review) =>
      el(
        "li",
        { class: "pdp-review" },
        el("span", { class: "pdp-review__stars", role: "img", "aria-label": `${review.rating} out of 5 stars` }, "★".repeat(Math.round(review.rating))),
        el("p", { class: "pdp-review__quote" }, review.quote),
        el("span", { class: "label" }, [review.author, review.model, "Verified buyer"].filter(Boolean).join(" · ")),
      ),
    ),
  );
  section.hidden = false;
}

function renderMore() {
  const o = PRODUCTS[other()];
  const card = $("[data-more-other]");
  card.href = productFile(other());
  card.replaceChildren(
    el("span", { class: "pdp-more__cat" }, `${o.word} routine · ${o.sku}`),
    el("span", { class: "pdp-more__title" }, o.name),
    el("span", { class: "pdp-more__cta" }, `See the ${o.word} product page `, el("span", { "aria-hidden": "true" }, "→")),
  );
}

function renderAll() {
  renderHero();
  renderPrice();
  renderBenefits();
  renderResult();
  renderHow();
  renderQuiz();
  renderCompare();
  renderReviews();
  renderMore();
  updateHead();
}

// ---------- actions ----------

function setCountLabel() {
  renderCartCount();
  const count = cart.count();
  for (const link of $$("[data-cart-link]")) link.setAttribute("aria-label", `Cart, ${count} ${count === 1 ? "item" : "items"}`);
}

function addToCart(placement) {
  const lines = unitLines();
  const value = totalCents();
  const items = analyticsItems(lines);
  const pair = lines.length > 1;
  for (const [index, line] of lines.entries()) {
    const cents = centsOf(line.sku);
    cart.add(line.sku, line.qty, {
      placement: `pdp-${placement}`,
      pair,
      currency: state.config?.currency || "USD",
      ...(typeof cents === "number" ? { value: (cents * line.qty) / 100 } : {}),
      items: [items[index]],
    });
  }
  const added = $("[data-added]");
  const summary = lines.map((line) => `${PRODUCTS[line.sku].word} · ${PRODUCTS[line.sku].name} × ${line.qty}`).join(" + ");
  added.replaceChildren(
    el(
      "div",
      { class: "notice notice--success", role: "status" },
      el("span", { class: "notice__title" }, "Added to cart"),
      el("span", { class: "notice__body" }, summary, " · ", el("a", { href: "/cart.html" }, "View cart →")),
    ),
  );
  setCountLabel();
  if (typeof value === "number" && pair) track("pdp_pair_added", { value, currency: state.config?.currency || "USD" });
}

function switchTo(sku, { push = true } = {}) {
  if (!SKUS.includes(sku) || sku === state.sku) return;
  state.sku = sku;
  state.pair = false;
  state.image = 0;
  state.answers = [];
  $("[data-added]").replaceChildren();
  if (push) {
    const fixed = document.body.dataset.sku;
    if (fixed || /\/products\//.test(location.pathname)) {
      history.replaceState(null, "", location.pathname.replace(/d2(?:04|15)(\.html)?$/i, (_, ext = "") => sku + ext) + location.search);
      document.body.dataset.sku = sku;
    } else {
      history.replaceState(null, "", `${location.pathname}${location.search}#${PRODUCTS[sku].routine}`);
    }
  }
  renderAll();
  trackView();
}

function trackView() {
  const cents = centsOf(state.sku);
  track("view_item", {
    sku: state.sku,
    placement: "pdp",
    currency: state.config?.currency || "USD",
    ...(typeof cents === "number" ? { value: cents / 100 } : {}),
    items: analyticsItems([{ sku: state.sku, qty: 1 }]),
  });
}

// ---------- sticky add-to-cart bar ----------

function setSticky(visible) {
  const bar = $("[data-sticky]");
  bar.dataset.visible = String(visible);
  bar.toggleAttribute("inert", !visible);
  bar.setAttribute("aria-hidden", String(!visible));
  document.body.dataset.stickyBar = visible ? "on" : "off";
}

// Shown once the main buy row has scrolled above the viewport. A scroll listener (not an
// IntersectionObserver) so a jump straight past the row (anchor, End key) is handled too.
function watchBuyRow() {
  const row = $("[data-buyrow]");
  if (!row) return;
  let frame = 0;
  const update = () => {
    frame = 0;
    setSticky(row.getBoundingClientRect().bottom < 0);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  update();
}

// ---------- events ----------

function bind() {
  document.addEventListener("click", (event) => {
    const add = event.target.closest?.("[data-pdp-add]");
    if (add) {
      event.preventDefault();
      addToCart(add.dataset.placement || "buybox");
      return;
    }
    const to = event.target.closest?.("[data-switch-to]");
    if (to) {
      event.preventDefault();
      switchTo(to.dataset.switchTo);
      window.scrollTo({ top: 0 });
      return;
    }
    if (event.target.closest?.("[data-video-play]")) playVideo();
  });

  for (const input of $$('input[name="routine"]')) input.addEventListener("change", () => switchTo(input.value));
  $("[data-pair]").addEventListener("change", (event) => {
    state.pair = event.target.checked;
    renderPrice();
  });
  $("[data-qty-dec]").addEventListener("click", () => {
    state.qty = Math.max(1, state.qty - 1);
    renderPrice();
  });
  $("[data-qty-inc]").addEventListener("click", () => {
    state.qty = Math.min(maxQty(), state.qty + 1);
    renderPrice();
  });
  $("[data-quiz]").addEventListener("change", (event) => {
    const fieldset = event.target.closest("[data-quiz-q]");
    if (!fieldset) return;
    const index = Number(fieldset.dataset.quizQ);
    state.answers = state.answers.slice(0, index).concat([event.target.value === "yes"]);
    renderQuiz();
    // Move on to the next question for keyboard users.
    const next = $(`[data-quiz-q="${index + 1}"] input`);
    if (next && !next.disabled) next.focus();
  });
  window.addEventListener("hashchange", () => {
    if (document.body.dataset.sku) return;
    switchTo(skuFromLocation(), { push: false });
  });
  window.addEventListener("apgo:cart-updated", setCountLabel);
}

async function loadConfig() {
  try {
    state.config = await api("/api/store/config");
  } catch {
    state.config = null; // The page still works; prices read "—" and the cart is quoted at checkout.
  }
}

async function init() {
  state.sku = skuFromLocation();
  setSticky(false);
  bind();
  setCountLabel();
  renderAll();
  await loadConfig();
  renderAll();
  trackView();
  watchBuyRow();
  document.documentElement.dataset.pdpReady = "true";
}

init();
