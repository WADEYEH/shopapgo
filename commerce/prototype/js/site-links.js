// Brand/guides navigation has a working HTML fallback. Local Worker preview can
// point these links back to the local Next.js site without sharing cart storage.
fetch("/api/store/config").then((response) => response.ok ? response.json() : null).then((config) => {
  if (!config?.siteLinks) return;
  for (const [key, selector] of [["home", "[data-site-home]"], ["guides", "[data-site-guides]"]]) {
    for (const node of document.querySelectorAll(selector)) node.href = config.siteLinks[key];
  }
}).catch(() => {});
