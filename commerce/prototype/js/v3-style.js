(() => {
  const html = document.documentElement;
  const body = document.body;
  const validFrames = new Set(["hero", "d204", "d215"]);

  function renderFrame() {
    const hashFrame = window.location.hash.slice(1).toLowerCase();
    const frame = validFrames.has(hashFrame) ? hashFrame : "hero";
    body.dataset.v3Frame = frame;
    body.dataset.v3Selected = frame === "hero" ? "none" : frame;
    html.dataset.apgoV3StyleReady = "true";
  }

  window.addEventListener("hashchange", renderFrame);
  renderFrame();
})();
