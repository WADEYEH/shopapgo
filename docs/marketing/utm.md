# UTM rules (APGO US, www.shopapgo.com)

Source: external-links plan (seo-plan/external-links-plan.md, sections 1-2).

## Format
- All values **lowercase snake_case** (`a-z`, `0-9`, `_`). No spaces, no hyphens, no capitals.
- Always set `utm_source`, `utm_medium`, `utm_campaign`. Use `utm_content` for the creative / post id.
- Never tag internal links on www.shopapgo.com (it resets the session source in GA4).
- Printed material (package inserts, manuals) never prints a long tagged URL: use a `/go/` short link (see docs/marketing/go-links.md).

## utm_source
| Value | Use |
|---|---|
| amazon_insert | Package insert card QR |
| amazon_manual | Instruction manual QR |
| instagram | Instagram bio / posts / stories |
| facebook | Facebook page posts |
| tiktok | TikTok bio / posts |
| youtube | YouTube video descriptions |
| reddit | Reddit answers |
| forum | Forum posts and signatures (put the forum name in utm_content) |
| meta_ads | Meta paid ads (FB + IG) |
| directory | Google Business Profile, Bing Places, Crunchbase, trade directories |
| outreach | Blogger / detailer / media partner links |
| email | Our own email sends |
| x | X (Twitter) posts |

## utm_medium
| Value | Use |
|---|---|
| qr | Printed QR codes |
| social | Organic social posts and bios |
| paid_social | Paid social ads |
| video | Video descriptions |
| referral | Reddit/forum answers, partner and media links |
| listing | Directory / business listings |
| email | Email (only with utm_source=email) |

## utm_campaign
- `guides` for general guide traffic (default).
- Or the guide slug in snake_case (e.g. `how_to_apply_glaze_coating`) when a campaign promotes one article only.
- Seasonal/test campaigns: `guides_winter_2026`, `guides_abtest_1` etc.

## utm_content
Creative or post id, snake_case: `ad_v1_video`, `ig_post_20261020`, `reddit_t3_abc123`, `forum_autopia`, `insert_card_v1`.

## Copy rule (all channels)
Describe our product (D204/D215) only as **silicone-based spray glaze**. Never ceramic, SiO2, PPF, hardness (9H) or matte paint. Anchor text should name the topic (e.g. "how to avoid streaks"), not the product as "ceramic".

## Ready-made tracked URLs (plan section 2)
Add `&utm_content=<creative_or_post_id>` per post/ad. For Facebook/TikTok posts, reuse the Instagram rows with `utm_source=facebook` / `tiktok`; for forums, reuse the Reddit rows with `utm_source=forum`.

| Channel | Article | Tracked URL |
|---|---|---|
| Package insert QR | `how-to-apply-glaze-coating` | `https://www.shopapgo.com/us/guides/how-to-apply-glaze-coating?utm_source=amazon_insert&utm_medium=qr&utm_campaign=guides` |
| Instruction manual QR | `how-to-apply-glaze-coating` | `https://www.shopapgo.com/us/guides/how-to-apply-glaze-coating?utm_source=amazon_manual&utm_medium=qr&utm_campaign=guides` |
| Meta Ads landing | `what-is-car-glaze` | `https://www.shopapgo.com/us/guides/what-is-car-glaze?utm_source=meta_ads&utm_medium=paid_social&utm_campaign=guides` |
| Meta Ads landing | `types-of-car-paint-protection` | `https://www.shopapgo.com/us/guides/types-of-car-paint-protection?utm_source=meta_ads&utm_medium=paid_social&utm_campaign=guides` |
| Meta Ads landing | `exterior-car-detailing-steps` | `https://www.shopapgo.com/us/guides/exterior-car-detailing-steps?utm_source=meta_ads&utm_medium=paid_social&utm_campaign=guides` |
| Meta Ads landing | `how-to-wash-your-car-in-winter` | `https://www.shopapgo.com/us/guides/how-to-wash-your-car-in-winter?utm_source=meta_ads&utm_medium=paid_social&utm_campaign=guides` |
| Social post (Instagram) | `after-washing-your-car` | `https://www.shopapgo.com/us/guides/after-washing-your-car?utm_source=instagram&utm_medium=social&utm_campaign=guides` |
| Social post (Instagram) | `does-rain-damage-ceramic-coating` | `https://www.shopapgo.com/us/guides/does-rain-damage-ceramic-coating?utm_source=instagram&utm_medium=social&utm_campaign=guides` |
| Social post (Instagram) | `how-to-wash-a-ceramic-coated-car` | `https://www.shopapgo.com/us/guides/how-to-wash-a-ceramic-coated-car?utm_source=instagram&utm_medium=social&utm_campaign=guides` |
| Social post (Instagram) | `ceramic-coating-maintenance` | `https://www.shopapgo.com/us/guides/ceramic-coating-maintenance?utm_source=instagram&utm_medium=social&utm_campaign=guides` |
| Social post (Instagram) | `how-often-to-apply-ceramic-spray-coating` | `https://www.shopapgo.com/us/guides/how-often-to-apply-ceramic-spray-coating?utm_source=instagram&utm_medium=social&utm_campaign=guides` |
| Social post (Instagram) | `does-an-automatic-car-wash-remove-ceramic-coating` | `https://www.shopapgo.com/us/guides/does-an-automatic-car-wash-remove-ceramic-coating?utm_source=instagram&utm_medium=social&utm_campaign=guides` |
| Reddit answer | `ceramic-spray-streaks-high-spots` | `https://www.shopapgo.com/us/guides/ceramic-spray-streaks-high-spots?utm_source=reddit&utm_medium=referral&utm_campaign=guides` |
| Reddit answer | `can-i-apply-ceramic-coating-over-wax` | `https://www.shopapgo.com/us/guides/can-i-apply-ceramic-coating-over-wax?utm_source=reddit&utm_medium=referral&utm_campaign=guides` |
| Reddit answer | `how-to-remove-wax-before-ceramic-coating` | `https://www.shopapgo.com/us/guides/how-to-remove-wax-before-ceramic-coating?utm_source=reddit&utm_medium=referral&utm_campaign=guides` |
| Reddit answer | `clay-bar-before-ceramic-coating` | `https://www.shopapgo.com/us/guides/clay-bar-before-ceramic-coating?utm_source=reddit&utm_medium=referral&utm_campaign=guides` |
| Reddit answer | `ceramic-coating-on-windshield` | `https://www.shopapgo.com/us/guides/ceramic-coating-on-windshield?utm_source=reddit&utm_medium=referral&utm_campaign=guides` |
| Reddit answer | `how-to-prep-car-for-ceramic-spray` | `https://www.shopapgo.com/us/guides/how-to-prep-car-for-ceramic-spray?utm_source=reddit&utm_medium=referral&utm_campaign=guides` |
| YouTube description | `how-to-apply-glaze-coating` | `https://www.shopapgo.com/us/guides/how-to-apply-glaze-coating?utm_source=youtube&utm_medium=video&utm_campaign=guides` |
| YouTube description | `wet-or-dry-application` | `https://www.shopapgo.com/us/guides/wet-or-dry-application?utm_source=youtube&utm_medium=video&utm_campaign=guides` |
| YouTube description | `how-to-prep-car-for-ceramic-spray` | `https://www.shopapgo.com/us/guides/how-to-prep-car-for-ceramic-spray?utm_source=youtube&utm_medium=video&utm_campaign=guides` |
| YouTube description | `ceramic-spray-streaks-high-spots` | `https://www.shopapgo.com/us/guides/ceramic-spray-streaks-high-spots?utm_source=youtube&utm_medium=video&utm_campaign=guides` |
| Blogger / media outreach | `car-wax-vs-spray-ceramic-coating` | `https://www.shopapgo.com/us/guides/car-wax-vs-spray-ceramic-coating?utm_source=outreach&utm_medium=referral&utm_campaign=guides` |
| Blogger / media outreach | `ceramic-spray-vs-ceramic-coating` | `https://www.shopapgo.com/us/guides/ceramic-spray-vs-ceramic-coating?utm_source=outreach&utm_medium=referral&utm_campaign=guides` |
| Blogger / media outreach | `diy-ceramic-coating-vs-professional` | `https://www.shopapgo.com/us/guides/diy-ceramic-coating-vs-professional?utm_source=outreach&utm_medium=referral&utm_campaign=guides` |
| Blogger / media outreach | `is-ceramic-spray-worth-it` | `https://www.shopapgo.com/us/guides/is-ceramic-spray-worth-it?utm_source=outreach&utm_medium=referral&utm_campaign=guides` |
| Blogger / media outreach | `how-to-choose-a-ceramic-coating` | `https://www.shopapgo.com/us/guides/how-to-choose-a-ceramic-coating?utm_source=outreach&utm_medium=referral&utm_campaign=guides` |
| Blogger / media outreach | `what-is-spray-ceramic-coating` | `https://www.shopapgo.com/us/guides/what-is-spray-ceramic-coating?utm_source=outreach&utm_medium=referral&utm_campaign=guides` |
| Blogger / media outreach | `does-ceramic-coating-prevent-scratches` | `https://www.shopapgo.com/us/guides/does-ceramic-coating-prevent-scratches?utm_source=outreach&utm_medium=referral&utm_campaign=guides` |
| Instagram bio | guides index | `https://www.shopapgo.com/us/guides?utm_source=instagram&utm_medium=social&utm_campaign=guides` |
| Facebook page | guides index | `https://www.shopapgo.com/us/guides?utm_source=facebook&utm_medium=social&utm_campaign=guides` |
| TikTok bio | guides index | `https://www.shopapgo.com/us/guides?utm_source=tiktok&utm_medium=social&utm_campaign=guides` |
| Directory listing | guides index | `https://www.shopapgo.com/us/guides?utm_source=directory&utm_medium=listing&utm_campaign=guides` |
