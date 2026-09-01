(() => {
  "use strict";

  const VALID_SKUS = new Set(["d204", "d215"]);
  const AMAZON_PLACEMENTS = new Set(["choice", "sticky", "final"]);
  const state = { selectedSku: "none" };
  const root = document.documentElement;
  const body = document.body;

  window.dataLayer = window.dataLayer || [];

  function track(event, payload = {}) {
    window.dataLayer.push({
      event,
      page_variant: "v2_visual_review",
      selected_sku: state.selectedSku,
      ...payload,
    });
  }

  function normalizeSku(value) {
    const sku = String(value || "").toLowerCase();
    return VALID_SKUS.has(sku) ? sku : "none";
  }

  function getProductConfig(sku) {
    return window.APGO_CONFIG?.products?.[sku] || {};
  }

  function getAmazonLink(sku, placement) {
    if (!VALID_SKUS.has(sku) || !AMAZON_PLACEMENTS.has(placement)) return null;
    const product = getProductConfig(sku);
    if (product.linkReady !== true || !product.amazonUrl) return null;

    try {
      const url = new URL(product.amazonUrl);
      if (url.protocol !== "https:") return null;
      if (!["amazon.com", "www.amazon.com"].includes(url.hostname.toLowerCase())) return null;
      const match = url.pathname.match(/^\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i);
      if (!match) return null;
      if (product.expectedAsin && match[1].toUpperCase() !== String(product.expectedAsin).toUpperCase()) return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  function setAmazonLink(element) {
    const sku = normalizeSku(element.dataset.sku);
    const placement = element.dataset.placement || "";
    const product = getProductConfig(sku);
    const href = getAmazonLink(sku, placement);
    const status = document.querySelector(
      `[data-amazon-status][data-sku="${sku}"][data-placement="${placement}"]`,
    );

    if (href) {
      element.href = href;
      element.target = "_blank";
      element.rel = "noopener noreferrer sponsored";
      element.removeAttribute("aria-disabled");
      element.removeAttribute("tabindex");
      element.dataset.linkState = "ready";
      if (status) status.textContent = "Available on Amazon";
      return;
    }

    element.removeAttribute("href");
    element.removeAttribute("target");
    element.removeAttribute("rel");
    element.setAttribute("aria-disabled", "true");
    element.setAttribute("tabindex", "-1");
    element.dataset.linkState = product.unavailable ? "unavailable" : "pending";
    if (status) {
      status.textContent = product.unavailable
        ? "Currently unavailable on Amazon"
        : "Amazon link pending";
    }
  }

  function syncAmazonLinks() {
    document.querySelectorAll("[data-amazon-cta][data-sku][data-placement]").forEach(setAmazonLink);
    syncSticky();
  }

  function setHash(sku) {
    const next = sku === "none"
      ? `${window.location.pathname}${window.location.search}`
      : `${window.location.pathname}${window.location.search}#${sku}`;
    window.history.replaceState(null, "", next);
  }

  function syncSticky() {
    const sticky = document.querySelector("[data-mobile-sticky]");
    if (!sticky) return;
    sticky.querySelectorAll("[data-sticky-state]").forEach((item) => {
      item.hidden = item.dataset.stickyState !== state.selectedSku;
    });

    const selectedLink = sticky.querySelector(
      `[data-sticky-state="${state.selectedSku}"] [data-amazon-cta]`,
    );
    const hero = document.querySelector(".v2-hero");
    const final = document.querySelector("[data-final-handoff]");
    const belowHero = hero ? window.scrollY > hero.offsetTop + hero.offsetHeight * .72 : false;
    const finalRect = final?.getBoundingClientRect();
    const finalVisible = finalRect ? finalRect.top < window.innerHeight && finalRect.bottom > 0 : false;
    const canShow = window.innerWidth <= 560
      && VALID_SKUS.has(state.selectedSku)
      && Boolean(selectedLink?.getAttribute("href"))
      && belowHero
      && !finalVisible;
    sticky.dataset.visible = String(canShow);
  }

  function syncSelection(sku) {
    body.dataset.v2Selected = sku;
    root.dataset.v2Selected = sku;

    document.querySelectorAll("[data-product-radio]").forEach((radio) => {
      radio.checked = radio.value === sku;
    });
    document.querySelectorAll("[data-product-card]").forEach((card) => {
      card.setAttribute("aria-current", String(card.dataset.productCard === sku));
    });
    document.querySelectorAll("[data-process-choice]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.sku === sku));
    });

    const empty = document.querySelector("[data-process-empty]");
    if (empty) empty.hidden = VALID_SKUS.has(sku);
    document.querySelectorAll("[data-process-panel]").forEach((panel) => {
      const isSelected = panel.dataset.processPanel === sku;
      if (!isSelected) {
        const video = panel.querySelector("video");
        const card = panel.querySelector("[data-video-card]");
        video?.pause();
        if (card?.dataset.videoState === "playing") card.dataset.videoState = "ready";
      }
      panel.hidden = !isSelected;
    });
    document.querySelectorAll("[data-final-state]").forEach((panel) => {
      panel.hidden = panel.dataset.finalState !== sku;
    });

    const live = document.querySelector("[data-selection-live]");
    if (live) {
      live.textContent = sku === "none"
        ? "No finish selected."
        : `${sku.toUpperCase()} selected. The process and final Amazon handoff now match ${sku.toUpperCase()}.`;
    }
    syncSticky();
  }

  function selectSku(value, source, options = {}) {
    const sku = normalizeSku(value);
    const previousSku = state.selectedSku;
    state.selectedSku = sku;
    syncSelection(sku);
    setHash(sku);

    if (source && source !== "initial" && source !== "hash") {
      track("fit_selector_answer", {
        previous_sku: previousSku,
        selection_source: source,
        application_mode: sku === "d204" ? "dry" : sku === "d215" ? "wet" : "none",
      });
    }

    if (options.scrollToProcess && VALID_SKUS.has(sku)) {
      window.setTimeout(() => {
        document.querySelector("#process")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }

  function resetSelection(source = "final") {
    const previousSku = state.selectedSku;
    document.querySelectorAll("[data-video-card]").forEach((card) => {
      const video = card.querySelector("video");
      video?.pause();
    });
    selectSku("none", "initial");
    track("routine_reset", { previous_sku: previousSku, placement: source });
    document.querySelector("#choose")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function prepareVideos() {
    document.querySelectorAll("[data-video-card]").forEach((card) => {
      const panel = card.closest("[data-process-panel]");
      const sku = normalizeSku(panel?.dataset.processPanel);
      const trigger = card.querySelector("[data-video-trigger]");
      const ready = getProductConfig(sku).videoReady === true && Boolean(card.dataset.videoSrc);
      card.dataset.videoState = ready ? "ready" : "unavailable";
      if (trigger) {
        trigger.disabled = !ready;
        if (!ready) trigger.setAttribute("aria-label", `${sku.toUpperCase()} application video unavailable`);
      }
    });
  }

  async function playVideo(trigger) {
    const card = trigger.closest("[data-video-card]");
    const panel = trigger.closest("[data-process-panel]");
    const video = card?.querySelector("video");
    const sku = normalizeSku(panel?.dataset.processPanel);
    if (!card || !video || !VALID_SKUS.has(sku) || card.dataset.videoState === "unavailable") return;

    if (!video.getAttribute("src")) {
      video.src = card.dataset.videoSrc;
      video.load();
    }
    card.dataset.videoState = "playing";
    if (card.dataset.started !== "true") {
      card.dataset.started = "true";
      track("video_start", { sku, placement: "process" });
    }
    try {
      await video.play();
    } catch {
      card.dataset.videoState = "ready";
    }
  }

  document.addEventListener("change", (event) => {
    const radio = event.target.closest("[data-product-radio]");
    if (radio) selectSku(radio.value, "product_card");
  });

  document.addEventListener("click", (event) => {
    const disabledAmazon = event.target.closest('[data-amazon-cta][aria-disabled="true"]');
    if (disabledAmazon) {
      event.preventDefault();
      return;
    }

    const amazon = event.target.closest("[data-amazon-cta][href]");
    if (amazon) {
      track("amazon_referral_click", {
        sku: normalizeSku(amazon.dataset.sku),
        placement: amazon.dataset.placement,
      });
      return;
    }

    const productChoice = event.target.closest("[data-product-choice]");
    if (productChoice) {
      selectSku(productChoice.dataset.sku, "product_card", { scrollToProcess: true });
      return;
    }

    const processChoice = event.target.closest("[data-process-choice]");
    if (processChoice) {
      selectSku(processChoice.dataset.sku, "process_tab");
      return;
    }

    const videoTrigger = event.target.closest("[data-video-trigger]");
    if (videoTrigger) {
      playVideo(videoTrigger);
      return;
    }

    const reset = event.target.closest("[data-routine-reset]");
    if (reset) {
      resetSelection(reset.dataset.placement || "final");
      return;
    }

    const routineStart = event.target.closest("[data-routine-start]");
    if (routineStart) {
      track("routine_start", { placement: routineStart.dataset.placement || "unknown" });
    }
  });

  window.addEventListener("scroll", syncSticky, { passive: true });
  window.addEventListener("resize", syncSticky, { passive: true });
  window.addEventListener("hashchange", () => {
    selectSku(normalizeSku(window.location.hash.slice(1)), "hash");
  });
  window.addEventListener("apgo:config-updated", () => {
    prepareVideos();
    syncAmazonLinks();
  });

  prepareVideos();
  syncAmazonLinks();
  const initialSku = normalizeSku(window.location.hash.slice(1));
  state.selectedSku = initialSku;
  syncSelection(initialSku);
  root.dataset.apgoV2Ready = "true";
  track("us_referral_landing_view", {
    selected_sku: initialSku,
    selection_source: initialSku === "none" ? "none" : "hash",
  });
})();
