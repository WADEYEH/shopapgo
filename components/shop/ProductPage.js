"use client";

import { useEffect, useRef, useState } from "react";
import { BEFORE_AFTER, BRAND, MIN_VERIFIED_REVIEWS, PRODUCTS, QUIZ, REVIEWS, SEO, SKUS, productPath } from "@/lib/shop/catalog";
import { MAX_QTY, addToCart } from "@/lib/shop/cart";
import { averageRating, reviewsToShow } from "@/lib/shop/reviews";
import { priceCents, priceText, useStoreConfig } from "@/lib/shop/store-config";
import { track } from "@/lib/us/analytics";
import { SITE_URL } from "@/lib/site";

// A product page (D204 DRY / D215 WET), one per product URL (D39).
// - Prices only from /api/store/config (commerce/worker/pricing.js); nothing here knows a price.
// - No unconfirmed promises: terms the brand has not confirmed (pair price, shipping, returns, guarantee) are not here.
// - Reviews and before/after photos (lib/shop/catalog: REVIEWS, BEFORE_AFTER) stay hidden until real.
// The other routine is its own page: the DRY / WET switch, the quiz and the comparison link to it.

const word = (sku) => (PRODUCTS[sku].routine === "dry" ? "DRY" : "WET");
const absolute = (path) => new URL(path, SITE_URL).href;

function analyticsItems(lines, config) {
  return lines.map(({ sku, qty }) => {
    const cents = priceCents(config, sku);
    return {
      item_id: PRODUCTS[sku].sku,
      item_name: `${PRODUCTS[sku].word} · ${PRODUCTS[sku].name}`,
      item_category: PRODUCTS[sku].routine,
      quantity: qty,
      ...(cents !== null ? { price: cents / 100 } : {}),
    };
  });
}

const FAQ = [
  ["Which one should I choose?", "Choose by routine. Dry if you prefer a separate step after drying; Wet if you prefer to apply while the paint is still wet."],
  ["Can I use it over wax?", "Apply to clean, bare paint. Remove existing wax first so the coating can bond to the surface."],
  ["What surfaces can I use it on?", "Use each product only on surfaces identified by its current label. Contact APGO when a surface is not listed."],
];

function ProductJsonLd({ sku, config }) {
  const p = PRODUCTS[sku];
  const seo = SEO[sku];
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${p.name} (${word(sku)})`,
    sku: p.sku,
    description: seo.description,
    brand: { "@type": "Brand", name: BRAND },
    image: [absolute(seo.image)],
  };
  // A price only from the live config and only once the owner approved pricing: a placeholder price must never reach
  // search engines.
  const cents = priceCents(config, sku);
  if (config?.estimate === false && cents !== null) {
    data.offers = { "@type": "Offer", url: absolute(seo.path), priceCurrency: config.currency || "USD", price: (cents / 100).toFixed(2) };
  }
  return <script type="application/ld+json" id="pdp-jsonld" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

function Gallery({ sku }) {
  const p = PRODUCTS[sku];
  const images = [
    { src: SEO[sku].image, alt: `APGO ${p.name} ${p.size}`, fit: "contain" },
    ...p.steps.slice(0, 3).map(([file, caption]) => ({ src: `/assets/application/${file}.webp`, alt: `${p.word} application, step: ${caption}`, fit: "cover" })),
  ];
  const [index, setIndex] = useState(0);
  const current = images[index];
  return (
    <div className="pdp-gallery">
      <div className="pdp-stage">
        <span className="pdp-ghost" aria-hidden="true" data-ghost="">{word(sku)}</span>
        <span className="pdp-glow" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="pdp-stage__img" data-gallery-main="" data-fit={current.fit} src={current.src} alt={current.alt} width="1400" height="1400" />
      </div>
      <ul className="pdp-thumbs" data-thumbs="" aria-label="Product images">
        {images.map((image, i) => (
          <li key={image.src}>
            <button type="button" className="pdp-thumb" aria-label={`Show image ${i + 1} of ${images.length}`} aria-pressed={i === index} data-thumb={i} onClick={() => setIndex(i)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.src} alt="" width="120" height="120" loading="lazy" data-fit={image.fit} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HowTo({ sku }) {
  const p = PRODUCTS[sku];
  const [playing, setPlaying] = useState(false);
  const poster = `/assets/video/${sku}-poster.webp`;
  const play = () => {
    setPlaying(true);
    track("video_play", { sku, placement: "pdp" });
  };
  return (
    <section className="pdp-section" aria-labelledby="pdp-how-title">
      <div className="pdp-wrap pdp-section__inner">
        <div className="pdp-head"><p className="eyebrow eyebrow--plain">How to apply</p><h2 className="heading-guide-h2" id="pdp-how-title">Under 15 minutes. No machine.</h2></div>
        <div className="pdp-how">
          <div className="pdp-video" data-video="">
            <div className="pdp-video__frame" data-video-frame="">
              {playing ? (
                <video className="pdp-video__player" data-video-player="" controls autoPlay playsInline preload="none" poster={poster} src={`/assets/video/${sku}-application.mp4`}>
                  <track kind="captions" srcLang="en" label="English" src={`/assets/video/${sku}-v3-captions-en.vtt`} default />
                </video>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="pdp-video__poster" data-video-poster="" src={poster} alt="" loading="lazy" width="1600" height="900" />
                  <button className="pdp-video__play" type="button" data-video-play="" aria-label={`Play ${p.word.toLowerCase()} application video`} onClick={play}><span aria-hidden="true">▶</span></button>
                </>
              )}
            </div>
            <p className="pdp-video__caption"><span data-video-caption="">{p.videoCaption}</span><span className="pdp-video__status">Real footage · English captions</span></p>
          </div>
          <div className="pdp-how__steps">
            <ol className="pdp-steps" data-steps="" style={{ "--steps": String(p.steps.length) }}>
              {p.steps.map(([file, caption]) => (
                <li key={file}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/assets/application/${file}.webp`} alt={`${p.word} application: ${caption}`} loading="lazy" width="600" height="450" />
                  <span>{caption}</span>
                </li>
              ))}
            </ol>
            <p className="pdp-note" data-scope="">Use on: {p.scope} Use only as directed.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Quiz({ sku, onAdd }) {
  const [answers, setAnswers] = useState([]);
  const inputs = useRef([]);
  const focusNext = useRef(null);
  useEffect(() => {
    if (focusNext.current === null) return;
    inputs.current[focusNext.current]?.focus();
    focusNext.current = null;
  }, [answers]);

  const answer = (index, yes) => {
    setAnswers((previous) => previous.slice(0, index).concat([yes]));
    if (index + 1 < QUIZ.length) focusNext.current = index + 1; // keyboard users move on to the next question
  };

  let result = null;
  if (answers.length === QUIZ.length) {
    const score = { d204: 0, d215: 0 };
    answers.forEach((yes, i) => (score[yes ? QUIZ[i].yes : QUIZ[i].no] += 1));
    const rec = score.d204 >= score.d215 ? "d204" : "d215";
    const r = PRODUCTS[rec];
    result = (
      <div className="quiz__result" data-quiz-result="" data-routine={r.routine} aria-live="polite">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={SEO[rec].image} alt="" width="72" height="72" />
        <div className="quiz__rec">
          <span className="label label--xs">Your routine</span>
          <span className="quiz__rec-name"><span className={`routine routine--md routine--${r.routine}`}>{word(rec)}</span><span className="product-name">{r.name}</span></span>
        </div>
        {rec === sku ? (
          <button className="btn" type="button" data-pdp-add="" data-placement="quiz" onClick={() => onAdd("quiz")}>Add to cart <span aria-hidden="true">→</span></button>
        ) : (
          <a className="btn" href={productPath(rec)} data-switch-to={rec}>Switch to {r.word} <span aria-hidden="true">→</span></a>
        )}
      </div>
    );
  }

  return (
    <section className="pdp-section pdp-section--raised" aria-labelledby="pdp-quiz-title">
      <div className="pdp-wrap pdp-section__inner">
        <div className="pdp-head"><p className="eyebrow eyebrow--plain">Not sure?</p><h2 className="heading-guide-h2" id="pdp-quiz-title">Three questions. Your routine.</h2></div>
        <form className="quiz" data-quiz="" onSubmit={(event) => event.preventDefault()}>
          {QUIZ.map((item, i) => {
            const locked = i > answers.length;
            return (
              <div key={item.q} className="quiz__q" role="group" aria-labelledby={`quiz-label-${i}`} data-quiz-q={i} data-state={locked ? "locked" : "open"}>
                <span className="quiz__legend" id={`quiz-label-${i}`}>{i + 1}. {item.q}</span>
                <div className="quiz__opts">
                  {[["yes", "Yes"], ["no", "No"]].map(([value, label], j) => (
                    <label key={value} className="quiz__opt">
                      <input
                        ref={j === 0 ? (node) => { inputs.current[i] = node; } : undefined}
                        type="radio"
                        name={`quiz-${i}`}
                        value={value}
                        disabled={locked}
                        checked={answers[i] === (value === "yes")}
                        onChange={() => answer(i, value === "yes")}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </form>
        {result}
      </div>
    </section>
  );
}

function Compare({ sku, config, onAdd }) {
  const rows = [
    ["Product", (p) => p.name],
    ["When", (p) => p.when],
    ["Lasts up to", (p) => p.lasts],
    ["Contents", (p) => `${p.size} / ${p.oz}`],
    ["Price", (p, s) => priceText(priceCents(config, s), config?.currency)],
  ];
  const cell = (s) => (s === sku ? "is-current" : undefined);
  return (
    <section className="pdp-section" aria-labelledby="pdp-compare-title">
      <div className="pdp-wrap pdp-section__inner">
        <div className="pdp-head"><p className="eyebrow eyebrow--plain">Dry vs Wet</p><h2 className="heading-guide-h2" id="pdp-compare-title">Same finish. Pick your moment.</h2></div>
        <table className="pdp-compare" data-compare="">
          <caption className="visually-hidden">Dry and Wet compared</caption>
          <thead>
            <tr>
              <td />
              {SKUS.map((s) => (
                <th key={s} scope="col" data-col={s} data-routine={PRODUCTS[s].routine} className={cell(s)}>
                  <span className="routine routine--md">{word(s)}</span> <span className="pdp-viewing">✓ Viewing</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody data-compare-body="">
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {SKUS.map((s) => <td key={s} data-col={s} className={cell(s)}>{value(PRODUCTS[s], s)}</td>)}
              </tr>
            ))}
            <tr>
              <td />
              {SKUS.map((s) => (
                <td key={s} data-col={s} className={cell(s)}>
                  {s === sku ? (
                    <button className="btn btn--md" type="button" data-pdp-add="" data-placement="compare" onClick={() => onAdd("compare")}>Add to cart <span aria-hidden="true">→</span></button>
                  ) : (
                    <a className="btn btn--text" href={productPath(s)} data-switch-to={s}>View {PRODUCTS[s].word} <span className="glyph" aria-hidden="true">→</span></a>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ProductPage({ sku }) {
  const p = PRODUCTS[sku];
  const other = p.other;
  const o = PRODUCTS[other];
  const seo = SEO[sku];
  const { status, config } = useStoreConfig();
  const [qty, setQty] = useState(1);
  const [pair, setPair] = useState(false);
  const [added, setAdded] = useState("");
  const [sticky, setSticky] = useState(false);
  const buyRow = useRef(null);

  const currency = config?.currency || "USD";
  const maxQty = config?.maxQtyPerLine ?? MAX_QTY;
  const lines = pair ? [{ sku, qty }, { sku: other, qty: 1 }] : [{ sku, qty }];
  const prices = lines.map((line) => priceCents(config, line.sku));
  const total = prices.every((cents) => cents !== null) ? lines.reduce((sum, line, i) => sum + prices[i] * line.qty, 0) : null;
  const reviews = reviewsToShow(REVIEWS[sku], MIN_VERIFIED_REVIEWS);
  const photos = BEFORE_AFTER[sku];

  // One view_item per page view, once the config has answered (with the price when there is one).
  useEffect(() => {
    if (status === "loading") return;
    const cents = priceCents(config, sku);
    track("view_item", {
      sku,
      placement: "pdp",
      currency: config?.currency || "USD",
      ...(cents !== null ? { value: cents / 100 } : {}),
      items: analyticsItems([{ sku, qty: 1 }], config),
    });
    document.documentElement.dataset.pdpReady = "true";
  }, [status, config, sku]);

  // The sticky add-to-cart bar shows once the main buy row has scrolled above the viewport. A scroll listener (not an
  // IntersectionObserver) so a jump straight past the row (anchor, End key) is handled too.
  useEffect(() => {
    const row = buyRow.current;
    if (!row) return undefined;
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
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    document.body.dataset.stickyBar = sticky ? "on" : "off";
  }, [sticky]);
  useEffect(() => () => {
    delete document.body.dataset.stickyBar;
  }, []);

  const add = (placement) => {
    const items = analyticsItems(lines, config);
    lines.forEach((line, i) => {
      addToCart(line.sku, line.qty, {
        placement: `pdp-${placement}`,
        pair,
        currency,
        ...(prices[i] !== null ? { value: (prices[i] * line.qty) / 100 } : {}),
        items: [items[i]],
      });
    });
    setAdded(lines.map((line) => `${PRODUCTS[line.sku].word} · ${PRODUCTS[line.sku].name} × ${line.qty}`).join(" + "));
    if (pair && total !== null) track("pdp_pair_added", { value: total / 100, currency });
  };

  return (
    <>
      <noscript><p className="pdp-noscript">Turn on JavaScript to see prices and add products to your cart.</p></noscript>
      <ProductJsonLd sku={sku} config={config} />
      <main id="main" data-routine={p.routine} data-sku={sku}>
        {/* 1. Hero: sticky gallery + buy box */}
        <section className="pdp-hero" aria-labelledby="pdp-title">
          <div className="pdp-wrap pdp-hero__wrap">
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <a href="/products">Shop</a><span aria-hidden="true">/</span><span aria-current="page" data-crumb="">{p.word} · {p.name}</span>
            </nav>
            <div className="pdp-hero__grid">
              <Gallery key={sku} sku={sku} />
              <div className="pdp-buy">
                <div className="pdp-id">
                  <span className={`routine routine--xl routine--${p.routine}`} data-routine-word="">{word(sku)}</span>
                  <span className="label pdp-id__when" data-when="">{p.when}</span>
                  <span className="sku-tag" data-sku-tag="">{p.sku}</span>
                </div>
                <h1 className="heading-guide-h1 pdp-title" id="pdp-title" data-name="">{p.name}</h1>
                {reviews.length > 0 && (
                  <p className="pdp-rating" data-rating="">★ {averageRating(reviews).toFixed(1)} · {reviews.length} verified reviews</p>
                )}
                <p className="body pdp-promise" data-promise="">{p.promise}</p>

                <nav className="pdp-switch" aria-label="Routine" data-switch="">
                  {SKUS.map((s) => (
                    <a key={s} className="pdp-switch__opt" href={productPath(s)} aria-current={s === sku ? "page" : undefined} data-switch-to={s === sku ? undefined : s}>
                      <span className="pdp-switch__face"><span className="routine routine--sm">{word(s)}</span> {PRODUCTS[s].switchLabel}</span>
                    </a>
                  ))}
                </nav>

                <label className="check pdp-pair" data-pair-card="">
                  <span className="check__control"><input type="checkbox" data-pair="" checked={pair} onChange={(event) => setPair(event.target.checked)} /><span className="check__box" aria-hidden="true" /></span>
                  <span className="pdp-pair__text">
                    <span className="check__label" data-pair-label="">Add {o.word} too — try both routines</span>
                    <span className="check__description">Both routines in one order</span>
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="pdp-pair__img" data-pair-img="" src={SEO[other].image} alt="" width="56" height="56" />
                </label>

                <div className="pdp-buyrow" data-buyrow="" ref={buyRow}>
                  <div className="pdp-price">
                    <span className="label" data-size="">{pair ? "Dry + Wet" : `${p.size} · ${p.oz}`}</span>
                    <span className="pdp-price__value" data-price="" aria-live="polite">{priceText(total, currency)}</span>
                  </div>
                  <div className="qty" role="group" aria-label="Quantity">
                    <button type="button" aria-label="Decrease quantity" data-qty-dec="" disabled={qty <= 1} onClick={() => setQty((n) => Math.max(1, n - 1))}>−</button>
                    <output data-qty="" aria-live="polite">{qty}</output>
                    <button type="button" aria-label="Increase quantity" data-qty-inc="" disabled={qty >= maxQty} onClick={() => setQty((n) => Math.min(maxQty, n + 1))}>+</button>
                  </div>
                  <button className="btn pdp-add" type="button" data-pdp-add="" data-placement="buybox" onClick={() => add("buybox")}>Add to cart <span aria-hidden="true">→</span></button>
                </div>
                {status === "unavailable" && <p className="pdp-price-note label" data-price-note="">Price unavailable right now. You can still add to your cart.</p>}
                <div className="pdp-added" data-added="" aria-live="polite">
                  {added && (
                    <div className="notice notice--success" role="status">
                      <span className="notice__title">Added to cart</span>
                      <span className="notice__body">{added} · <a href="/cart">View cart →</a></span>
                    </div>
                  )}
                </div>

                <ul className="pdp-trust" aria-label="About the product">
                  <li><strong>Made in Taiwan</strong><span>Since 2011</span></li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Benefit strip */}
        <section className="pdp-benefits" aria-label="Key facts">
          <div className="pdp-wrap">
            <ul className="pdp-benefits__grid" data-benefits="">
              {p.benefits.map(([value, unit, caption]) => (
                <li key={caption} className="pdp-benefit">
                  <span className="pdp-benefit__value">{value}<span className="pdp-benefit__unit">{unit}</span></span>
                  <span className="pdp-benefit__caption">{caption}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 3. Before / after: only with a real photo pair */}
        {photos?.before?.src && photos?.after?.src && (
          <section className="pdp-section pdp-section--raised" data-result="" aria-labelledby="pdp-result-title">
            <div className="pdp-wrap pdp-section__inner">
              <div className="pdp-head"><p className="eyebrow eyebrow--plain">The result</p><h2 className="heading-guide-h2" id="pdp-result-title">See the difference on real paint.</h2><p className="body body--sm">Same panel, same light, before and after one {p.word.toLowerCase()} application.</p></div>
              <div className="pdp-result">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <figure className="pdp-photo"><img src={photos.before.src} alt={photos.before.alt || "Paint before"} loading="lazy" /><figcaption>Before</figcaption></figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <figure className="pdp-photo pdp-photo--after"><img src={photos.after.src} alt={photos.after.alt || "Paint after"} loading="lazy" /><figcaption>After</figcaption></figure>
              </div>
            </div>
          </section>
        )}

        {/* 4. How to apply */}
        <HowTo key={`how-${sku}`} sku={sku} />

        {/* 5. Fit quiz */}
        <Quiz key={`quiz-${sku}`} sku={sku} onAdd={add} />

        {/* 6. Dry vs Wet */}
        <Compare sku={sku} config={config} onAdd={add} />

        {/* 7. Reviews: only with 3 verified reviews (FTC 16 CFR 465) */}
        {reviews.length > 0 && (
          <section className="pdp-section pdp-section--raised" data-reviews="" aria-labelledby="pdp-reviews-title">
            <div className="pdp-wrap pdp-section__inner">
              <div className="pdp-head"><p className="eyebrow eyebrow--plain">Reviews</p><h2 className="heading-guide-h2" id="pdp-reviews-title">From drivers who use it.</h2></div>
              <ul className="pdp-reviews">
                {reviews.map((review, i) => (
                  <li key={i} className="pdp-review">
                    <span className="pdp-review__stars" role="img" aria-label={`${review.rating} out of 5 stars`}>{"★".repeat(Math.round(review.rating))}</span>
                    <p className="pdp-review__quote">{review.quote}</p>
                    <span className="label">{[review.author, review.model, "Verified buyer"].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* 8. Guarantee section intentionally omitted until its terms are confirmed by the brand. */}

        {/* 9. FAQ */}
        <section className="pdp-section" aria-labelledby="pdp-faq-title">
          <div className="pdp-wrap pdp-section__inner">
            <div className="pdp-faq-grid">
              <div className="pdp-head"><p className="eyebrow eyebrow--plain">Before you order</p><h2 className="heading-guide-h2" id="pdp-faq-title">Straight answers.</h2></div>
              <div className="faq">
                {FAQ.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
                <details><summary>Shipping and returns?</summary><p>Shipping options and their cost are shown at checkout. Return terms are on our <a href="/returns">Returns &amp; Refunds</a> page.</p></details>
              </div>
            </div>
          </div>
        </section>

        {/* 10. Keep reading */}
        <section className="pdp-section" aria-labelledby="pdp-more-title">
          <div className="pdp-wrap pdp-section__inner">
            <h2 className="heading-guide-h2" id="pdp-more-title">Keep reading</h2>
            <div className="pdp-more">
              <a className="pdp-more__card" data-more-other="" href={productPath(other)}>
                <span className="pdp-more__cat">{o.word} routine · {o.sku}</span>
                <span className="pdp-more__title">{o.name}</span>
                <span className="pdp-more__cta">See the {o.word} product page <span aria-hidden="true">→</span></span>
              </a>
              <a className="pdp-more__card" href="/#technology">
                <span className="pdp-more__cat">Basics · The technology</span>
                <span className="pdp-more__title">How APGO works</span>
                <span className="pdp-more__cta">See how it works <span aria-hidden="true">→</span></span>
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Sticky add-to-cart: appears once the main buy row has scrolled out of view */}
      <aside className="pdp-sticky" data-sticky="" data-visible={String(sticky)} aria-label="Quick add to cart" aria-hidden={!sticky} inert={!sticky}>
        <div className="pdp-sticky__inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={seo.image} alt="" width="44" height="44" data-sticky-img="" />
          <div className="pdp-sticky__text">
            <span className="pdp-sticky__line"><span className={`routine routine--sm routine--${p.routine}`} data-sticky-word="">{word(sku)}</span><span className="pdp-sticky__price" data-sticky-price="">{priceText(total, currency)}</span></span>
            <span className="pdp-sticky__name" data-sticky-name="">{pair ? "Dry + Wet pair" : p.name}</span>
          </div>
          <button className="btn btn--md" type="button" data-pdp-add="" data-placement="sticky" onClick={() => add("sticky")}>Add to cart <span aria-hidden="true">→</span></button>
        </div>
      </aside>
    </>
  );
}
