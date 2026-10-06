(() => {
  "use strict";

  const PRODUCTS = Object.freeze({
    d204: {
      name: "APGO Atomic Colored Glaze",
      mode: "dry",
      application: "dry-paint application",
    },
    d215: {
      name: "APGO Atomic Glaze Coating",
      mode: "wet",
      application: "wet-paint application",
    },
  });
  const VALID_SKUS = new Set(Object.keys(PRODUCTS));
  const AMAZON_PLACEMENTS = new Set(["selected", "sticky", "final"]);
  const root = document.documentElement;
  const body = document.body;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const trackedFullVideoStarts = new WeakSet();
  const trackedScrollDepths = new Set();
  const state = { selectedSku: "none", initialized: false };
  let videoObserver;
  let scrollFramePending = false;

  window.dataLayer = window.dataLayer || [];

  function track(event, payload = {}) {
    const detail = {
      event,
      page_variant: "v3_interactive_review",
      selected_sku: state.selectedSku,
      ...payload,
    };
    window.dataLayer.push(detail);
    window.dispatchEvent(new CustomEvent("apgo:analytics", { detail }));
  }

  function normalizeSku(value) {
    const sku = String(value || "").toLowerCase();
    return VALID_SKUS.has(sku) ? sku : "none";
  }

  function hashSku() {
    return normalizeSku(window.location.hash.slice(1));
  }

  function productConfig(sku) {
    return window.APGO_CONFIG?.products?.[sku] || {};
  }

  function validatedAmazonUrl(sku, placement) {
    if (!VALID_SKUS.has(sku) || !AMAZON_PLACEMENTS.has(placement)) return null;
    const config = productConfig(sku);
    if (config.linkReady !== true || typeof config.amazonUrl !== "string" || !config.amazonUrl) {
      return null;
    }

    const expectedAsin = String(config.expectedAsin || "").toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(expectedAsin)) return null;

    try {
      const url = new URL(config.amazonUrl);
      if (url.protocol !== "https:") return null;
      if (!["amazon.com", "www.amazon.com"].includes(url.hostname.toLowerCase())) return null;
      const match = url.pathname.match(/^\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i);
      if (!match) return null;
      if (match[1].toUpperCase() !== expectedAsin) return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  function setAmazonLink(link) {
    const sku = normalizeSku(link.dataset.sku);
    const placement = link.dataset.placement || "";
    const config = productConfig(sku);
    const href = validatedAmazonUrl(sku, placement);
    const status = document.querySelector(
      `[data-amazon-status][data-sku="${sku}"][data-placement="${placement}"]`,
    );

    if (href) {
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer sponsored";
      link.removeAttribute("aria-disabled");
      link.removeAttribute("tabindex");
      link.dataset.linkState = "ready";
      if (placement === "sticky") link.textContent = "Amazon ↗";
      if (status) status.textContent = "Available on Amazon";
      return;
    }

    link.removeAttribute("href");
    link.removeAttribute("target");
    link.removeAttribute("rel");
    link.setAttribute("aria-disabled", "true");
    link.setAttribute("tabindex", "-1");
    link.dataset.linkState = config.unavailable ? "unavailable" : "pending";
    if (placement === "sticky") {
      link.textContent = config.unavailable ? "Unavailable" : "Amazon pending";
    }
    if (status) {
      status.textContent = config.unavailable
        ? "Currently unavailable on Amazon"
        : "Amazon link pending";
    }
  }

  function syncAmazonLinks() {
    document.querySelectorAll("[data-amazon-cta][data-sku][data-placement]").forEach(setAmazonLink);
    syncSticky();
  }

  function replaceProductHash(sku) {
    const url = new URL(window.location.href);
    url.hash = VALID_SKUS.has(sku) ? sku : "";
    window.history.replaceState(window.history.state, "", url);
  }

  function mediaCardForSku(sku) {
    return document.querySelector(`[data-product-panel="${sku}"] [data-video-card]`);
  }

  function syncPreviewToggle(card) {
    const toggle = card?.querySelector("[data-preview-toggle]");
    if (!card || !toggle) return;
    const visible =
      card.dataset.videoMode === "preview" &&
      ["playing", "paused"].includes(card.dataset.videoState);
    toggle.hidden = !visible;
    toggle.disabled = !visible;
    toggle.textContent = card.dataset.videoState === "paused" ? "Resume preview" : "Pause preview";
  }

  function pauseCard(card, stateName = "ready") {
    const video = card?.querySelector("[data-product-video]");
    if (!card || !video) return;
    video.pause();
    if (card.dataset.videoMode === "preview" && card.dataset.videoState !== "unavailable") {
      card.dataset.videoState =
        card.dataset.userPaused === "true" ? "paused" : stateName;
    }
    syncPreviewToggle(card);
  }

  function loadVideoSource(video, src) {
    if (!src || video.dataset.loadedSrc === src) return;
    video.pause();
    video.src = src;
    video.dataset.loadedSrc = src;
    video.load();
  }

  async function startPreview(card) {
    const panel = card?.closest("[data-product-panel]");
    const sku = normalizeSku(panel?.dataset.productPanel);
    const video = card?.querySelector("[data-product-video]");
    if (
      !card ||
      !video ||
      !VALID_SKUS.has(sku) ||
      panel.hidden ||
      card.dataset.inViewport !== "true"
    ) return;
    if (productConfig(sku).videoReady !== true) return;
    if (reducedMotion.matches) {
      card.dataset.videoState = "reduced";
      return;
    }
    if (card.dataset.videoMode === "full" || card.dataset.userPaused === "true") return;

    card.dataset.videoMode = "preview";
    video.controls = false;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    loadVideoSource(video, card.dataset.previewSrc);

    try {
      await video.play();
      card.dataset.videoState = "playing";
      syncPreviewToggle(card);
    } catch {
      card.dataset.videoState = "ready";
      syncPreviewToggle(card);
    }
  }

  function resetCardToPreview(card) {
    const video = card?.querySelector("[data-product-video]");
    const track = card?.querySelector("[data-caption-track]");
    if (!card || !video || card.dataset.videoMode !== "full") return;
    video.pause();
    video.controls = false;
    video.loop = true;
    video.muted = true;
    video.removeAttribute("tabindex");
    video.removeAttribute("src");
    delete video.dataset.loadedSrc;
    video.load();
    if (track) track.removeAttribute("src");
    card.dataset.videoMode = "preview";
    card.dataset.videoState = reducedMotion.matches ? "reduced" : "ready";
    delete card.dataset.userPaused;
    syncPreviewToggle(card);
  }

  function unloadCardVideo(card) {
    const video = card?.querySelector("[data-product-video]");
    const track = card?.querySelector("[data-caption-track]");
    if (!card || !video) return;
    video.pause();
    video.controls = false;
    video.loop = true;
    video.muted = true;
    video.removeAttribute("tabindex");
    video.removeAttribute("src");
    delete video.dataset.loadedSrc;
    video.load();
    if (track) track.removeAttribute("src");
    card.dataset.videoMode = "preview";
    delete card.dataset.userPaused;
    syncPreviewToggle(card);
  }

  async function playFullVideo(card) {
    const panel = card?.closest("[data-product-panel]");
    const sku = normalizeSku(panel?.dataset.productPanel);
    const video = card?.querySelector("[data-product-video]");
    const track = card?.querySelector("[data-caption-track]");
    if (!card || !video || !VALID_SKUS.has(sku) || productConfig(sku).videoReady !== true) return;

    document.querySelectorAll("[data-video-card]").forEach((other) => {
      if (other !== card) pauseCard(other);
    });

    card.dataset.videoMode = "full";
    card.dataset.videoState = "full";
    delete card.dataset.userPaused;
    syncPreviewToggle(card);
    video.controls = true;
    video.loop = false;
    video.muted = false;
    video.playsInline = true;
    video.preload = "metadata";
    if (track && card.dataset.captionSrc) track.src = card.dataset.captionSrc;
    loadVideoSource(video, card.dataset.fullSrc);
    video.tabIndex = 0;

    try {
      await video.play();
    } catch {
      // Native controls remain available if autoplay after the user gesture is blocked.
    }
    video.focus({ preventScroll: true });
  }

  function prepareVideos() {
    document.querySelectorAll("[data-video-card]").forEach((card) => {
      const sku = normalizeSku(card.closest("[data-product-panel]")?.dataset.productPanel);
      const trigger = card.querySelector("[data-video-trigger]");
      const ready = VALID_SKUS.has(sku) && productConfig(sku).videoReady === true;

      if (!ready) {
        unloadCardVideo(card);
        card.dataset.videoState = "unavailable";
        syncPreviewToggle(card);
        if (trigger) {
          trigger.disabled = true;
          trigger.setAttribute("aria-label", `${sku.toUpperCase()} application video unavailable`);
        }
        return;
      }

      if (trigger) {
        trigger.disabled = false;
        trigger.setAttribute("aria-label", `Play the complete ${sku.toUpperCase()} application video`);
      }
      if (card.dataset.videoMode !== "full") {
        card.dataset.videoState = reducedMotion.matches ? "reduced" : "ready";
        syncPreviewToggle(card);
      }
      if (card.dataset.inViewport === "true") startPreview(card);
    });
  }

  function setupVideoObserver() {
    videoObserver?.disconnect();
    videoObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const card = entry.target;
          card.dataset.inViewport = String(entry.isIntersecting);
          if (entry.isIntersecting) startPreview(card);
          else pauseCard(card);
        });
      },
      { threshold: 0.25, rootMargin: "0px" },
    );
    document.querySelectorAll("[data-video-card]").forEach((card) => videoObserver.observe(card));
  }

  function syncSelection(sku) {
    root.dataset.v3Selected = sku;
    body.dataset.v3Selected = sku;

    document.querySelectorAll("[data-selector-radio]").forEach((radio) => {
      radio.checked = radio.value === sku;
    });
    document.querySelectorAll("[data-product-card]").forEach((card) => {
      const selected = card.dataset.productCard === sku;
      card.dataset.selected = String(selected);
      card.setAttribute("aria-current", String(selected));
      const label = card.querySelector("[data-selector-label]");
      if (label) {
        label.textContent = selected
          ? "Selected"
          : card.dataset.productCard === "d204"
            ? "Choose dry application"
            : "Choose wet application";
      }
    });

    const hasSelection = VALID_SKUS.has(sku);
    const empty = document.querySelector("[data-product-empty]");
    if (empty) empty.hidden = hasSelection;

    document.querySelectorAll("[data-product-panel]").forEach((panel) => {
      const selected = panel.dataset.productPanel === sku;
      panel.hidden = !selected;
      if (!selected) {
        const card = panel.querySelector("[data-video-card]");
        resetCardToPreview(card);
        pauseCard(card);
      }
    });

    document.querySelectorAll("[data-final-state]").forEach((item) => {
      item.hidden = item.dataset.finalState !== sku;
    });
    document.querySelectorAll("[data-sticky-state]").forEach((item) => {
      item.hidden = item.dataset.stickyState !== sku;
    });

    const live = document.querySelector("[data-selection-live]");
    if (live) {
      live.textContent = hasSelection
        ? `${PRODUCTS[sku].name} selected. ${PRODUCTS[sku].application}.`
        : "No application selected.";
    }

    syncAmazonLinks();
    window.requestAnimationFrame(() => {
      const selectedCard = mediaCardForSku(sku);
      if (selectedCard) startPreview(selectedCard);
    });
  }

  function focusSelectedProduct(sku, scrollToProduct) {
    if (!VALID_SKUS.has(sku)) return;
    const panel = document.querySelector(`[data-product-panel="${sku}"]`);
    const heading = panel?.querySelector("h2[tabindex='-1']");
    if (!panel || !heading) return;

    window.setTimeout(() => {
      if (scrollToProduct) {
        panel.scrollIntoView({
          behavior: reducedMotion.matches ? "auto" : "smooth",
          block: "start",
        });
      }
      window.setTimeout(() => heading.focus({ preventScroll: true }), scrollToProduct ? 260 : 30);
    }, 40);
  }

  function selectSku(value, options = {}) {
    const sku = normalizeSku(value);
    const previousSku = state.selectedSku;
    state.selectedSku = sku;
    syncSelection(sku);

    if (options.updateHash !== false) replaceProductHash(sku);
    if (
      options.trackSelection === true &&
      previousSku !== sku &&
      VALID_SKUS.has(sku)
    ) {
      track("fit_selector_answer", {
        previous_sku: previousSku,
        selection_source: "selector_card",
        application_mode: PRODUCTS[sku].mode,
      });
    }
    if (options.focusProduct) focusSelectedProduct(sku, options.scrollToProduct === true);
  }

  function resetSelection(placement = "final") {
    const previousSku = state.selectedSku;
    selectSku("none", { updateHash: true });
    track("routine_reset", { previous_sku: previousSku, placement });
    window.setTimeout(() => {
      document.querySelector("#choose")?.scrollIntoView({
        behavior: reducedMotion.matches ? "auto" : "smooth",
        block: "start",
      });
      document.querySelector("#choose-title")?.focus?.({ preventScroll: true });
    }, 40);
  }

  function syncSticky() {
    const sticky = document.querySelector("[data-mobile-sticky]");
    if (!sticky) return;
    const hero = document.querySelector(".v3-hero");
    const final = document.querySelector("[data-final-handoff]");
    const belowHero = hero ? window.scrollY > hero.offsetTop + hero.offsetHeight * 0.72 : false;
    const finalRect = final?.getBoundingClientRect();
    const finalIsAhead = finalRect ? finalRect.top >= window.innerHeight : true;
    const visible =
      window.innerWidth <= 760 &&
      VALID_SKUS.has(state.selectedSku) &&
      belowHero &&
      finalIsAhead;
    sticky.dataset.visible = String(visible);
    sticky.setAttribute("aria-hidden", String(!visible));
    sticky.toggleAttribute("inert", !visible);
  }

  function trackScrollDepth() {
    const documentHeight = document.documentElement.scrollHeight;
    const reachable = Math.max(1, documentHeight - window.innerHeight);
    const percent = Math.min(100, Math.round((window.scrollY / reachable) * 100));
    [25, 50, 75, 90].forEach((threshold) => {
      if (percent >= threshold && !trackedScrollDepths.has(threshold)) {
        trackedScrollDepths.add(threshold);
        track("scroll_depth", { percent: threshold });
      }
    });
  }

  function handleScroll() {
    if (scrollFramePending) return;
    scrollFramePending = true;
    window.requestAnimationFrame(() => {
      scrollFramePending = false;
      syncSticky();
      trackScrollDepth();
    });
  }

  document.addEventListener("change", (event) => {
    const radio = event.target.closest("[data-selector-radio]");
    if (!radio) return;
    selectSku(radio.value, {
      updateHash: true,
      trackSelection: true,
      focusProduct: true,
      scrollToProduct: true,
    });
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

    const switcher = event.target.closest("[data-selector-switch]");
    if (switcher) {
      selectSku(switcher.dataset.sku, {
        updateHash: true,
        trackSelection: true,
        focusProduct: true,
        scrollToProduct: false,
      });
      return;
    }

    const reset = event.target.closest("[data-routine-reset]");
    if (reset) {
      resetSelection(reset.dataset.placement || "final");
      return;
    }

    const videoTrigger = event.target.closest("[data-video-trigger]");
    if (videoTrigger) {
      playFullVideo(videoTrigger.closest("[data-video-card]"));
      return;
    }

    const previewToggle = event.target.closest("[data-preview-toggle]");
    if (previewToggle) {
      const card = previewToggle.closest("[data-video-card]");
      const video = card?.querySelector("[data-product-video]");
      if (!card || !video) return;
      if (video.paused) {
        delete card.dataset.userPaused;
        startPreview(card);
      } else {
        card.dataset.userPaused = "true";
        pauseCard(card, "paused");
      }
      return;
    }

    const routineStart = event.target.closest("[data-routine-start]");
    if (routineStart) {
      track("routine_start", { placement: routineStart.dataset.placement || "unknown" });
    }
  });

  document.querySelectorAll("[data-product-video]").forEach((video) => {
    video.addEventListener("play", () => {
      const card = video.closest("[data-video-card]");
      if (card?.dataset.videoMode !== "full" || trackedFullVideoStarts.has(video)) return;
      trackedFullVideoStarts.add(video);
      const sku = normalizeSku(card.closest("[data-product-panel]")?.dataset.productPanel);
      track("video_start", { sku, placement: "process" });
    });
  });

  document.querySelectorAll("[data-faq-item]").forEach((item) => {
    item.addEventListener("toggle", () => {
      if (item.open) track("faq_expand", { question_id: item.dataset.questionId });
    });
  });

  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("resize", handleScroll, { passive: true });
  window.addEventListener("hashchange", () => {
    const rawHash = window.location.hash.slice(1).toLowerCase();
    const sku = normalizeSku(rawHash);
    if (VALID_SKUS.has(sku)) {
      selectSku(sku, { updateHash: false, focusProduct: false });
    } else if (!rawHash) {
      selectSku("none", { updateHash: false, focusProduct: false });
    }
  });
  window.addEventListener("apgo:config-updated", () => {
    prepareVideos();
    syncAmazonLinks();
  });
  reducedMotion.addEventListener("change", () => {
    document.querySelectorAll("[data-video-card]").forEach((card) => {
      if (reducedMotion.matches) pauseCard(card, "reduced");
      else if (card.dataset.videoMode !== "full") card.dataset.videoState = "ready";
    });
    const selectedCard = mediaCardForSku(state.selectedSku);
    if (selectedCard && !reducedMotion.matches) startPreview(selectedCard);
  });

  prepareVideos();
  setupVideoObserver();
  const initialSku = hashSku();
  state.selectedSku = initialSku;
  syncSelection(initialSku);
  state.initialized = true;
  root.dataset.apgoV3Ready = "true";
  track("us_referral_landing_view", {
    preview: window.APGO_CONFIG?.preview !== false,
    selection_source: VALID_SKUS.has(initialSku) ? "hash" : "none",
  });
  syncSticky();
})();
