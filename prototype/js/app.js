(() => {
  "use strict";

  const PRODUCT_COPY = Object.freeze({
    d204: {
      label: "D204",
      applicationMode: "dry-surface routine",
    },
    d215: {
      label: "D215",
      applicationMode: "wet-surface routine",
    },
  });

  const VALID_SKUS = new Set(Object.keys(PRODUCT_COPY));
  const SELECTED_CTA_SELECTOR = "[data-selected-amazon-cta]";
  const FIXED_CTA_SELECTOR = "[data-amazon-cta][data-sku]";
  const ALL_CTA_SELECTOR = `${FIXED_CTA_SELECTOR}, ${SELECTED_CTA_SELECTOR}`;
  const state = {
    selectedSku: "d204",
    activeVideo: null,
    trackedVideoStarts: new WeakSet(),
    scrollDepths: new Set(),
  };

  function normalizeSku(value) {
    return VALID_SKUS.has(String(value).toLowerCase())
      ? String(value).toLowerCase()
      : "d204";
  }

  function readConfig() {
    const raw = window.APGO_CONFIG || {};
    const products = raw.products || {};

    return {
      preview: raw.preview !== false,
      supportEmail:
        typeof raw.supportEmail === "string" ? raw.supportEmail.trim() : "",
      products: {
        d204: { ...(products.d204 || {}) },
        d215: { ...(products.d215 || {}) },
      },
    };
  }

  function productConfig(sku) {
    return readConfig().products[normalizeSku(sku)] || {};
  }

  function isAmazonUrl(value) {
    if (!value || typeof value !== "string") return false;

    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      return (
        url.protocol === "https:" &&
        (hostname === "amazon.com" || hostname.endsWith(".amazon.com"))
      );
    } catch {
      return false;
    }
  }

  function isSafeVideoUrl(value) {
    if (!value || typeof value !== "string") return false;

    try {
      const url = new URL(value, window.location.href);
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        (url.origin === window.location.origin || url.protocol === "https:")
      );
    } catch {
      return false;
    }
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function setCtaLabel(element, sku) {
    const label = `Buy ${PRODUCT_COPY[sku].label} on Amazon`;
    const labelNode = element.querySelector(
      "[data-cta-label], .cta__label, .button__label",
    );
    if (labelNode) labelNode.textContent = label;
    element.dataset.resolvedSku = sku;
    element.setAttribute("data-sku", sku);
    return label;
  }

  function setCtaAvailability(element, sku) {
    const config = productConfig(sku);
    const url = typeof config.amazonUrl === "string" ? config.amazonUrl.trim() : "";
    const ready = config.linkReady === true && isAmazonUrl(url);
    const label = setCtaLabel(element, sku);
    const status = element.querySelector("[data-cta-status]");

    element.dataset.linkState = ready ? "ready" : "unavailable";
    element.classList.toggle("is-disabled", !ready);

    if (ready) {
      if (element instanceof HTMLAnchorElement) {
        element.href = url;
        element.target = "_blank";
        element.rel = "noopener noreferrer sponsored";
        element.removeAttribute("tabindex");
      }
      if (element instanceof HTMLButtonElement) element.disabled = false;
      element.removeAttribute("aria-disabled");
      element.setAttribute("aria-label", `${label}. Opens Amazon.com in a new tab.`);
      if (status) {
        status.textContent = "Opens Amazon.com";
        status.hidden = false;
      }
      return;
    }

    if (element instanceof HTMLAnchorElement) {
      element.removeAttribute("href");
      element.removeAttribute("target");
      element.removeAttribute("rel");
      element.tabIndex = -1;
    }
    if (element instanceof HTMLButtonElement) element.disabled = true;
    element.setAttribute("aria-disabled", "true");
    element.setAttribute("aria-label", `${PRODUCT_COPY[sku].label} Amazon link pending`);
    if (status) {
      status.textContent = "Amazon link pending";
      status.hidden = false;
    }
  }

  function refreshCtas() {
    document.querySelectorAll(FIXED_CTA_SELECTOR).forEach((element) => {
      setCtaAvailability(element, normalizeSku(element.dataset.sku));
    });

    document.querySelectorAll(SELECTED_CTA_SELECTOR).forEach((element) => {
      setCtaAvailability(element, state.selectedSku);
    });
  }

  function ensureLiveRegion() {
    let liveRegion = document.querySelector("[data-selection-live]");
    if (liveRegion) return liveRegion;

    liveRegion = document.createElement("p");
    liveRegion.dataset.selectionLive = "";
    liveRegion.className = "sr-only";
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("aria-atomic", "true");
    Object.assign(liveRegion.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      padding: "0",
      margin: "-1px",
      overflow: "hidden",
      clip: "rect(0, 0, 0, 0)",
      whiteSpace: "nowrap",
      border: "0",
    });
    document.body.append(liveRegion);
    return liveRegion;
  }

  function track(eventName, parameters = {}) {
    const payload = { event: eventName, ...parameters };
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
    window.dispatchEvent(
      new CustomEvent("apgo:analytics", {
        detail: payload,
      }),
    );
  }

  function updateSelectorUi(sku) {
    const matchingInputs = document.querySelectorAll(
      'input[type="radio"][value="d204"], input[type="radio"][value="d215"]',
    );
    matchingInputs.forEach((input) => {
      if (
        input.matches("[data-routine-option]") ||
        input.name === "application-routine" ||
        input.name === "routine"
      ) {
        input.checked = normalizeSku(input.value) === sku;
      }
    });

    document.querySelectorAll("[data-product-card]").forEach((card) => {
      const selected = normalizeSku(card.dataset.productCard) === sku;
      card.classList.toggle("is-selected", selected);
      card.dataset.selected = String(selected);
      if (card.getAttribute("role") === "option") {
        card.setAttribute("aria-selected", String(selected));
      }
      const indicator = card.querySelector("[data-selected-indicator]");
      if (indicator) indicator.hidden = !selected;
    });

    document.querySelectorAll("[data-routine-choice][data-sku]").forEach((choice) => {
      const selected = normalizeSku(choice.dataset.sku) === sku;
      choice.classList.toggle("is-selected", selected);
      choice.setAttribute("aria-pressed", String(selected));
    });
  }

  function updateHash(sku) {
    const url = new URL(window.location.href);
    url.hash = sku;
    window.history.replaceState(window.history.state, "", url);
  }

  function selectSku(nextSku, options = {}) {
    const sku = normalizeSku(nextSku);
    const previousSku = state.selectedSku;
    state.selectedSku = sku;
    document.body.dataset.selectedSku = sku;
    document.documentElement.dataset.selectedSku = sku;
    updateSelectorUi(sku);
    refreshCtas();

    if (options.updateHash !== false) updateHash(sku);

    if (options.announce !== false) {
      ensureLiveRegion().textContent = `${PRODUCT_COPY[sku].label} selected. ${PRODUCT_COPY[sku].applicationMode}.`;
    }

    if (options.track === true && previousSku !== sku) {
      track("fit_selector_answer", {
        selected_sku: sku,
        application_mode: sku === "d204" ? "dry" : "wet",
      });
    }
  }

  function bindSelector() {
    document.addEventListener("change", (event) => {
      const input = event.target.closest(
        'input[type="radio"][value="d204"], input[type="radio"][value="d215"]',
      );
      if (!input) return;
      if (
        !input.matches("[data-routine-option]") &&
        input.name !== "application-routine" &&
        input.name !== "routine"
      ) {
        return;
      }
      selectSku(input.value, { track: true });
    });

    document.addEventListener("click", (event) => {
      const choice = event.target.closest("[data-routine-choice][data-sku]");
      if (!choice) return;
      selectSku(choice.dataset.sku, { track: true });
    });

    window.addEventListener("hashchange", () => {
      const sku = window.location.hash.slice(1).toLowerCase();
      if (VALID_SKUS.has(sku)) {
        selectSku(sku, {
          updateHash: false,
          announce: true,
          track: false,
        });
      }
    });
  }

  function bindCtaAnalytics() {
    document.addEventListener("click", (event) => {
      const cta = event.target.closest(ALL_CTA_SELECTOR);
      if (!cta) return;

      if (cta.dataset.linkState !== "ready") {
        event.preventDefault();
        return;
      }

      track("amazon_referral_click", {
        sku: normalizeSku(cta.dataset.resolvedSku || cta.dataset.sku),
        placement: cta.dataset.placement || "unknown",
      });
    });
  }

  function resolveVideoSource(card, sku) {
    const config = productConfig(sku);
    const trigger = card.querySelector("[data-video-trigger]");
    const video = card.querySelector("video");
    const source =
      config.videoUrl ||
      card.dataset.videoSrc ||
      trigger?.dataset.videoSrc ||
      video?.dataset.src ||
      "";
    return typeof source === "string" ? source.trim() : "";
  }

  function pauseOtherVideos(currentVideo) {
    document.querySelectorAll("[data-video-card] video").forEach((video) => {
      if (video !== currentVideo && !video.paused) video.pause();
    });
  }

  function attachVideoEvents(video, sku) {
    if (video.dataset.apgoBound === "true") return;
    video.dataset.apgoBound = "true";
    video.addEventListener("play", () => {
      pauseOtherVideos(video);
      state.activeVideo = video;
      if (!state.trackedVideoStarts.has(video)) {
        state.trackedVideoStarts.add(video);
        track("video_start", { sku });
      }
    });
  }

  function prepareVideoCard(card) {
    const sku = normalizeSku(card.dataset.videoCard);
    const config = productConfig(sku);
    const trigger = card.querySelector("[data-video-trigger]");
    const existingVideo = card.querySelector("video");

    if (existingVideo) {
      existingVideo.autoplay = false;
      existingVideo.removeAttribute("autoplay");
      existingVideo.setAttribute("playsinline", "");
      existingVideo.preload = "none";
      if (existingVideo.getAttribute("src")) {
        existingVideo.dataset.src = existingVideo.getAttribute("src");
        existingVideo.removeAttribute("src");
      }
      existingVideo.querySelectorAll("source[src]").forEach((source) => {
        source.dataset.src = source.getAttribute("src");
        source.removeAttribute("src");
      });
      attachVideoEvents(existingVideo, sku);
    }

    const source = resolveVideoSource(card, sku);
    const available = config.videoReady === true && isSafeVideoUrl(source);
    card.dataset.videoState = available ? "ready" : "unavailable";

    if (!trigger) return;
    if (available) {
      trigger.removeAttribute("aria-disabled");
      if (trigger instanceof HTMLButtonElement) trigger.disabled = false;
      trigger.removeAttribute("tabindex");
    } else {
      trigger.setAttribute("aria-disabled", "true");
      if (trigger instanceof HTMLButtonElement) trigger.disabled = true;
      else trigger.tabIndex = -1;
    }
  }

  function hydrateVideo(card) {
    const sku = normalizeSku(card.dataset.videoCard);
    const config = productConfig(sku);
    const source = resolveVideoSource(card, sku);
    if (config.videoReady !== true || !isSafeVideoUrl(source)) return null;

    let video = card.querySelector("video");
    const mount = card.querySelector("[data-video-mount]") || card;
    if (!video) {
      video = document.createElement("video");
      video.controls = true;
      video.setAttribute("playsinline", "");
      video.preload = "none";
      const poster = card.dataset.videoPoster;
      if (poster) video.poster = poster;
      mount.replaceChildren(video);
    }

    video.autoplay = false;
    video.removeAttribute("autoplay");
    video.controls = true;
    video.preload = "none";
    if (!video.getAttribute("src")) video.src = source;
    attachVideoEvents(video, sku);
    card.dataset.videoState = "hydrated";
    return video;
  }

  function bindVideos() {
    document.querySelectorAll("[data-video-card]").forEach(prepareVideoCard);

    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-video-trigger]");
      if (!trigger) return;
      const card = trigger.closest("[data-video-card]");
      if (!card || card.dataset.videoState === "unavailable") {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      const video = hydrateVideo(card);
      if (video) {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {
            // Native controls remain available when browser autoplay policy blocks play().
          });
        }
      }
    });
  }

  function bindFaqAnalytics() {
    document.querySelectorAll("details[data-faq-item], [data-faq] details").forEach(
      (details, index) => {
        details.addEventListener("toggle", () => {
          if (!details.open) return;
          track("faq_expand", {
            question_id: details.dataset.questionId || `faq-${index + 1}`,
          });
        });
      },
    );
  }

  function populateSupportEmail() {
    const email = readConfig().supportEmail;
    const valid = isValidEmail(email);

    document.querySelectorAll("[data-support-email]").forEach((element) => {
      if (!valid) {
        if (element instanceof HTMLAnchorElement) element.removeAttribute("href");
        element.hidden = true;
        element.setAttribute("aria-hidden", "true");
        return;
      }

      element.hidden = false;
      element.removeAttribute("aria-hidden");
      if (element instanceof HTMLAnchorElement) element.href = `mailto:${email}`;
      if (element.matches("[data-populate-email]")) element.textContent = email;
    });

    document.querySelectorAll("[data-support-email-unavailable]").forEach((element) => {
      element.hidden = valid;
    });
  }

  function updateRobotsMeta() {
    const config = readConfig();
    const bothLinksReady = ["d204", "d215"].every((sku) => {
      const product = config.products[sku];
      return product.linkReady === true && isAmazonUrl(product.amazonUrl);
    });
    const mayIndex = config.preview === false && bothLinksReady;
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.append(robots);
    }
    robots.content = mayIndex ? "index,follow" : "noindex,nofollow";
    document.documentElement.dataset.preview = String(!mayIndex);
  }

  function bindScrollDepth() {
    const thresholds = [25, 50, 75, 90];
    let scheduled = false;

    const check = () => {
      scheduled = false;
      const root = document.documentElement;
      const scrollable = Math.max(root.scrollHeight - window.innerHeight, 1);
      const depth = Math.min(100, Math.round((window.scrollY / scrollable) * 100));
      thresholds.forEach((threshold) => {
        if (depth >= threshold && !state.scrollDepths.has(threshold)) {
          state.scrollDepths.add(threshold);
          track("scroll_depth", { percent: threshold });
        }
      });
    };

    window.addEventListener(
      "scroll",
      () => {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(check);
      },
      { passive: true },
    );
  }

  function bindMobileSticky() {
    const sticky = document.querySelector("[data-mobile-sticky]");
    const hero = document.querySelector("[data-hero], #hero");
    const finalChoice = document.querySelector("[data-final-cta], #final-choice");
    if (!sticky || !hero) return;

    const media = window.matchMedia("(max-width: 767px)");
    const update = () => {
      const heroRect = hero.getBoundingClientRect();
      const finalRect = finalChoice?.getBoundingClientRect();
      const afterHero = heroRect.bottom <= 0;
      const finalVisible = Boolean(
        finalRect && finalRect.top < window.innerHeight && finalRect.bottom > 0,
      );
      const visible = media.matches && afterHero && !finalVisible;
      sticky.classList.toggle("is-visible", visible);
      sticky.dataset.visible = String(visible);
      sticky.setAttribute("aria-hidden", String(!visible));
    };

    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    if (typeof media.addEventListener === "function") media.addEventListener("change", update);
    update();
  }

  function bindMobileMenu() {
    const toggle = document.querySelector("[data-menu-toggle]");
    const menu = document.querySelector("[data-mobile-menu]");
    if (!toggle || !menu) return;

    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      menu.hidden = !open;
      document.body.classList.toggle("menu-open", open);
    };

    setOpen(false);
    toggle.addEventListener("click", () => {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    menu.addEventListener("click", (event) => {
      if (event.target.closest('a[href^="#"]')) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  function refreshRuntimeConfig() {
    refreshCtas();
    populateSupportEmail();
    updateRobotsMeta();
    document.querySelectorAll("[data-video-card]").forEach(prepareVideoCard);
  }

  function init() {
    const hashSku = window.location.hash.slice(1).toLowerCase();
    const initialSku = VALID_SKUS.has(hashSku) ? hashSku : "d204";
    ensureLiveRegion();
    bindSelector();
    selectSku(initialSku, {
      updateHash: false,
      announce: false,
      track: false,
    });
    bindCtaAnalytics();
    bindVideos();
    bindFaqAnalytics();
    bindScrollDepth();
    bindMobileSticky();
    bindMobileMenu();
    populateSupportEmail();
    updateRobotsMeta();
    window.addEventListener("apgo:config-updated", refreshRuntimeConfig);
    track("us_referral_landing_view", {
      selected_sku: initialSku,
      preview: readConfig().preview,
    });
    document.documentElement.dataset.apgoReady = "true";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
