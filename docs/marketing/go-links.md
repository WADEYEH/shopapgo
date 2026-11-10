# /go/ short links (package insert / manual QR)

302 (temporary) so targets can change without reprinting. **/go/apply is fixed** — the ads team already has it; never rename it.

| Short link | 302 target |
|---|---|
| https://www.shopapgo.com/go/apply | /us/guides/how-to-apply-glaze-coating?utm_source=amazon_insert&utm_medium=qr&utm_campaign=guides |
| https://www.shopapgo.com/go/wet-or-dry | /us/guides/wet-or-dry-application?utm_source=amazon_insert&utm_medium=qr&utm_campaign=guides |
| https://www.shopapgo.com/go/streaks | /us/guides/ceramic-spray-streaks-high-spots?utm_source=amazon_insert&utm_medium=qr&utm_campaign=guides |
| https://www.shopapgo.com/go/wash-wait | /us/guides/how-long-to-wait-to-wash-after-ceramic-spray?utm_source=amazon_insert&utm_medium=qr&utm_campaign=guides |
| https://www.shopapgo.com/go/colored | /us/guides/how-to-apply-colored-glaze?utm_source=amazon_insert&utm_medium=qr&utm_campaign=guides |
| https://www.shopapgo.com/go/guides | /us/guides?utm_source=amazon_insert&utm_medium=qr&utm_campaign=guides |

All targets verified to exist in the static export (out/us/guides/*.html) and return 200 on live.

## Status: NOT active yet — needs the store Worker owner

www.shopapgo.com/* is now routed to the store Worker (commerce/wrangler.toml, env.production routes), not plain Cloudflare Pages
(live: /api/health on www answers the Worker's JSON 404). The Worker's asset server reads public/_redirects too, so
commerce/scripts/build-site.mjs (`unsafeRedirectRules`) and commerce/tests/single-site.test.mjs reject any _redirects rule
that commerce/worker/redirects.js does not already answer. Adding the rules below to public/_redirects alone would fail that
check. This PR does not touch commerce/ (owned by another engineer). One of these is needed:

1. Worker owner adds the /go/* map to commerce/worker/redirects.js as 302 (preferred; then the lines below can also go in public/_redirects for Pages), or
2. a Cloudflare zone Single Redirect / Bulk Redirect rule (runs before Workers).

Rules, Cloudflare _redirects format:

```
/go/apply /us/guides/how-to-apply-glaze-coating?utm_source=amazon_insert&utm_medium=qr&utm_campaign=guides 302
/go/wet-or-dry /us/guides/wet-or-dry-application?utm_source=amazon_insert&utm_medium=qr&utm_campaign=guides 302
/go/streaks /us/guides/ceramic-spray-streaks-high-spots?utm_source=amazon_insert&utm_medium=qr&utm_campaign=guides 302
/go/wash-wait /us/guides/how-long-to-wait-to-wash-after-ceramic-spray?utm_source=amazon_insert&utm_medium=qr&utm_campaign=guides 302
/go/colored /us/guides/how-to-apply-colored-glaze?utm_source=amazon_insert&utm_medium=qr&utm_campaign=guides 302
/go/guides /us/guides?utm_source=amazon_insert&utm_medium=qr&utm_campaign=guides 302
```
Currently live: /go/apply → 404 (no route claims /go/*; the Worker falls through to assets).
