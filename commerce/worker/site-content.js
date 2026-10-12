// The site's pages with what owners changed in the products' words and photos (D52, D62; M9-27).
//
// The pages are built once (the Next.js export in out/). An owner's change is live without a new build because the
// Worker edits the page it sends:
//   * window.__APGO_CONTENT = { [sku]: what changed } at the top of <head>, so the page's own first render
//     (lib/shop/live-content.js) shows the same words and React takes the page over without a difference;
//   * the text of each element marked data-content (+ data-content-sku), and the src and description of each photo
//     marked data-content-img (components/shop/ProductPage.js and CatalogCard.js mark them);
//   * on a product page: its search title and description, the social preview tags and the schema.org data, and the
//     same title, description and photo in Next.js's own copy of the page (in the HTML, and the .txt file it loads
//     when a shopper moves between pages) so the title does not change back.
// With nothing changed the files go out untouched. Words owners changed are plain text (no < or >, checked by
// worker/product-content.js) and are escaped again here.
import { SKUS, productPath } from "../../lib/shop/product-data.mjs";
import { jsonLdText, productContent, productJsonLd } from "../../lib/shop/product-content.mjs";
import { readOverrides } from "./product-content.js";

const SITE = "https://www.shopapgo.com";
const BS = String.fromCharCode(92);
// Pages and Next.js page data: no file extension, .html or .txt.
const PAGE_PATH = /^(?:\/[^.]*|\/.*\.(?:html|txt))$/;
const FRESH_MS = 10_000;

// Escaped the way React writes text and attributes, so the original words are found as they are in the file.
const html = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
// A JSON string as Next.js writes it inside its inline <script> (the page data, itself a JSON string there).
const inScript = (text) => JSON.stringify(JSON.stringify(text)).slice(1, -1)
  .replace(/&/g, `${BS}u0026`).replace(/</g, `${BS}u003c`).replace(/>/g, `${BS}u003e`);
const replaceAll = (text, from, to) => (from === to ? text : text.split(from).join(to));
const attr = (attrs, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1] ?? null;

// The product a page is about: /products/<slug>, with .html, .txt or a trailing slash.
export function productOfPath(pathname) {
  return SKUS.find((sku) => [productPath(sku), `${productPath(sku)}.html`, `${productPath(sku)}.txt`, `${productPath(sku)}/`].includes(pathname)) ?? null;
}

// Every part of a product page's head that names it, before and after (only what differs).
function headChanges(sku, overrides) {
  const before = productContent(sku, {});
  const after = productContent(sku, overrides);
  const absolute = (path) => new URL(path, SITE).href;
  return [
    [before.seoTitle, after.seoTitle],
    [before.seoDescription, after.seoDescription],
    [absolute(before.image), absolute(after.image)],
  ].filter(([from, to]) => from !== to);
}

const MARKED_TEXT = /<([a-z][a-z0-9]*)(\s(?:[^<>]*?\s)?data-content="([A-Za-z]+)"[^<>]*)>([^<]*)<\/\1>/g;
const MARKED_IMG = /<img(\s(?:[^<>]*?\s)?data-content-img="(\d+)"[^<>]*?)(\/?)>/g;

// html: one page. overrides: { [sku]: what changed } (see readOverrides). pathname: the page's path.
export function rewriteSiteHtml(page, { pathname, overrides }) {
  if (!overrides || !Object.keys(overrides).length) return page;
  const live = Object.fromEntries(Object.keys(overrides).filter((sku) => SKUS.includes(sku)).map((sku) => [sku, productContent(sku, overrides[sku])]));
  let out = page.replace(MARKED_TEXT, (whole, tag, attrs, field, _text) => {
    const content = live[attr(attrs, "data-content-sku")];
    if (!content || typeof content[field] !== "string") return whole;
    return `<${tag}${attrs}>${html(content[field])}</${tag}>`;
  });
  out = out.replace(MARKED_IMG, (whole, attrs, index, close) => {
    const image = live[attr(attrs, "data-content-sku")]?.images[Number(index)];
    if (!image) return whole;
    let next = attrs.replace(/(\ssrc=")[^"]*"/, `$1${html(image.src)}"`);
    if (attr(attrs, "alt")) next = next.replace(/(\salt=")[^"]*"/, `$1${html(image.alt)}"`);
    if (attr(attrs, "data-fit") !== null) next = next.replace(/(\sdata-fit=")[^"]*"/, `$1${image.fit}"`);
    return `<img${next}${close}>`;
  });
  // React asks the browser to fetch the main photos early: the new photo instead of the old one.
  for (const [sku, content] of Object.entries(live)) {
    const before = productContent(sku, {}).image;
    out = replaceAll(out, `<link rel="preload" as="image" href="${html(before)}"/>`, `<link rel="preload" as="image" href="${html(content.image)}"/>`);
  }

  const sku = productOfPath(pathname);
  if (sku && overrides[sku]) {
    for (const [from, to] of headChanges(sku, overrides[sku])) {
      // <title>, the meta tags (description, og:*, twitter:*) and Next.js's copy of them.
      out = replaceAll(out, `>${html(from)}</title>`, `>${html(to)}</title>`);
      out = replaceAll(out, ` content="${html(from)}"`, ` content="${html(to)}"`);
      out = replaceAll(out, inScript(from), inScript(to));
    }
    const jsonLd = jsonLdText(productJsonLd(sku, live[sku], { siteUrl: SITE }));
    out = out.replace(/(<script type="application\/ld\+json" id="pdp-jsonld">)[\s\S]*?(<\/script>)/, (_whole, open, close) => `${open}${jsonLd}${close}`);
  }

  // The changes for the page's first render, before any of its own scripts.
  const data = JSON.stringify(overrides).replace(/</g, `${BS}u003c`);
  const script = `<script>window.__APGO_CONTENT=${data}</script>`;
  const charset = /<meta charSet="utf-8"\/>/i.exec(out);
  if (charset) return out.slice(0, charset.index + charset[0].length) + script + out.slice(charset.index + charset[0].length);
  return out.replace(/<head>/i, `<head>${script}`);
}

// A product page's Next.js data (/products/<slug>.txt), loaded when a shopper moves to it inside the site.
export function rewritePageData(text, { pathname, overrides }) {
  const sku = productOfPath(pathname);
  if (!sku || !overrides?.[sku]) return text;
  let out = text;
  for (const [from, to] of headChanges(sku, overrides[sku])) out = replaceAll(out, JSON.stringify(from), JSON.stringify(to));
  return out;
}

// The changes for every page, read at most every 10 seconds per Worker instance (a page view should not wait on the
// database each time); a publish here clears it at once (forgetLiveContent).
const memo = new WeakMap();
export async function liveContent(env, nowMs = Date.now()) {
  const cached = memo.get(env.DB);
  if (cached && nowMs - cached.at < FRESH_MS) return cached.value;
  const value = await readOverrides(env.DB);
  memo.set(env.DB, { at: nowMs, value });
  return value;
}
export const forgetLiveContent = (env) => memo.delete(env.DB);

const withoutValidators = (request) => {
  const headers = new Headers(request.headers);
  headers.delete("If-None-Match");
  headers.delete("If-Modified-Since");
  return new Request(request, { headers });
};

// The site's files (env.ASSETS) with the products' live words and photos in its pages.
export async function serveSite(request, env, { nowMs = Date.now() } = {}) {
  const { pathname } = new URL(request.url);
  if (request.method !== "GET" || !PAGE_PATH.test(pathname) || !env.DB) return env.ASSETS.fetch(request);
  const overrides = await liveContent(env, nowMs);
  if (!Object.keys(overrides).length) return env.ASSETS.fetch(request);
  // The browser's copy may be the page before the change: ask for the whole file.
  const response = await env.ASSETS.fetch(withoutValidators(request));
  if (response.status !== 200) return response;
  const type = response.headers.get("Content-Type") || "";
  let body;
  if (/^text\/html\b/i.test(type)) body = rewriteSiteHtml(await response.text(), { pathname, overrides });
  else if (pathname.endsWith(".txt") && productOfPath(pathname)) body = rewritePageData(await response.text(), { pathname, overrides });
  else return response;
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("ETag");
  headers.delete("Last-Modified");
  return new Response(body, { status: 200, headers });
}
