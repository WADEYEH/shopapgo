"use client";

import { useState } from "react";
import Link from "next/link";
import { asset, routes } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";
import { config } from "@/lib/us/config";
import { track } from "@/lib/us/analytics";
import AmazonCta from "./AmazonCta";
import RoutineSelector from "./RoutineSelector";

// Per-product content for the routine section. Copy is FTC-reviewed; do not edit.
const PANEL = {
  d204: {
    word: "DRY",
    accent: color.dry,
    name: "Atomic Colored Glaze",
    tag: "D204",
    when: "After drying",
    lasts: "6 months",
    contents: "300 mL / 10.1 fl oz",
    footageLabel: "Real footage · Dry-surface application",
    meta: "Atomic Colored Glaze · D204 · 300 mL · Up to 6 months",
    heading: "The finishing step, on your terms.",
    body: "Wash, dry fully, then in the shade: spray one panel, spread, buff with a clean microfiber. A separate finish—without the hours a wax used to ask for.",
    steps: [
      { img: "application/d204-step-1.webp", alt: "Spraying Atomic Colored Glaze onto dry paint", cap: "Spray" },
      { img: "application/d204-step-2.webp", alt: "Spreading with an applicator cloth", cap: "Spread" },
      { img: "application/d204-step-3.webp", alt: "Buffing with a clean microfiber towel", cap: "Buff" },
    ],
    cta: "Buy Dry · Atomic Colored Glaze",
    playLabel: "Play Dry application video",
    pendingLabel: "Dry application video pending approval",
  },
  d215: {
    word: "WET",
    accent: color.wet,
    name: "Atomic Glaze Coating",
    tag: "D215",
    when: "Before final drying",
    lasts: "4 months",
    contents: "200 mL / 6.8 fl oz",
    footageLabel: "Real footage · Wet-surface application",
    meta: "Atomic Glaze Coating · D215 · 200 mL · Up to 4 months",
    heading: "Finish while the water is still on the paint.",
    body: "Rinse, then while the paint is still wet: spray, spread with a wet cloth, and dry the car as usual. No extra step—the finish goes on the way to the towel.",
    steps: [
      { img: "application/d215-step-1.webp", alt: "Rinsing the vehicle", cap: "Wash" },
      { img: "application/d215-step-2.webp", alt: "Wet hood paint after washing", cap: "Keep wet" },
      { img: "application/d215-step-3.webp", alt: "Spraying Atomic Glaze Coating onto wet paint", cap: "Spray" },
      { img: "application/d215-step-4.webp", alt: "Drying the hood with a clean towel", cap: "Dry" },
    ],
    cta: "Buy Wet · Atomic Glaze Coating",
    playLabel: "Play Wet application video",
    pendingLabel: "Wet application video pending approval",
  },
};

const specKey = { color: color.quiet, letterSpacing: ".08em", textTransform: "uppercase", fontSize: 11, paddingTop: 2 };

function ProductCard({ sku, selected, onPick }) {
  const p = PANEL[sku];
  const wash = config.products[sku].washResistance || "—";
  return (
    <button
      data-product-card={sku}
      aria-pressed={selected}
      onClick={() => onPick(sku)}
      style={{
        background: selected ? color.surface : color.bg,
        border: 0,
        borderTop: `4px solid ${p.accent}`,
        padding: "clamp(18px,2vw,28px)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        textAlign: "left",
        cursor: "pointer",
        color: color.text,
        fontFamily: "inherit",
        position: "relative",
        transition: "background .18s",
      }}
    >
      {selected && (
        <span
          style={{
            position: "absolute",
            right: 16,
            top: 14,
            fontSize: 11,
            letterSpacing: ".14em",
            fontWeight: 700,
            color: p.accent,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: p.accent,
              color: color.bg,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
            }}
          >
            ✓
          </span>
          SELECTED
        </span>
      )}
      <span style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: CONDENSED, fontWeight: 800, fontSize: 44, lineHeight: 1, color: p.accent, letterSpacing: ".04em" }}>{p.word}</span>
        <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 20, textTransform: "uppercase", lineHeight: 1 }}>{p.name}</span>
        <span style={{ fontSize: 11, letterSpacing: ".14em", color: color.quiet, border: `1px solid ${color.border}`, padding: "2px 6px", borderRadius: 4 }}>{p.tag}</span>
      </span>
      <span style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 18px", fontSize: 14, lineHeight: 1.35 }}>
        <span style={specKey}>When</span>
        <span>{p.when}</span>
        <span style={specKey}>Lasts up to</span>
        <span>
          <strong style={{ fontWeight: 600, color: p.accent }}>{p.lasts}</strong>
        </span>
        <span style={specKey}>Wash resistance</span>
        <span>{wash}</span>
        <span style={specKey}>Contents</span>
        <span>{p.contents}</span>
      </span>
    </button>
  );
}

function VideoCard({ sku, playing, onPlay }) {
  const p = PANEL[sku];
  const videoReady = config.videoReady;
  const other = sku === "d204" ? "d215" : "d204";
  return (
    <div data-video-card={sku} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ position: "relative", aspectRatio: "16/9", background: color.surface, overflow: "hidden" }}>
        {!playing ? (
          <>
            <img
              src={asset(`video/${sku}-poster.webp`)}
              alt=""
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: videoReady ? 1 : 0.55 }}
            />
            <button
              aria-label={videoReady ? p.playLabel : p.pendingLabel}
              aria-disabled={!videoReady}
              onClick={() => videoReady && onPlay(sku)}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%,-50%)",
                width: 64,
                height: 64,
                borderRadius: "50%",
                border: 0,
                background: color.orange,
                color: color.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: videoReady ? "pointer" : "not-allowed",
                fontSize: 22,
                paddingLeft: 5,
              }}
            >
              ▶
            </button>
          </>
        ) : (
          <video
            controls
            autoPlay
            playsInline
            preload="none"
            poster={asset(`video/${sku}-poster.webp`)}
            src={asset(`video/${sku}-application.mp4`)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
            onPlay={() => {
              const o = document.querySelector(`[data-video-card="${other}"] video`);
              if (o) o.pause();
              track("video_start", { sku });
            }}
          >
            <track kind="captions" srcLang="en" label="English" src={asset(`video/${sku}-captions-en.vtt`)} default />
          </video>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase", color: color.tertiary }}>{p.footageLabel}</span>
        <span style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: color.quiet }}>
          {videoReady ? "Real footage · English captions" : "Real application video pending approval"}
        </span>
      </div>
    </div>
  );
}

function Panel({ sku, playing, onPlay }) {
  const p = PANEL[sku];
  return (
    <div
      id={sku}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,400px),1fr))",
        gap: "clamp(28px,4vw,64px)",
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "clamp(16px,2vw,24px)" }}>
        <VideoCard sku={sku} playing={playing} onPlay={onPlay} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: CONDENSED, fontWeight: 800, fontSize: 52, lineHeight: 1, color: p.accent, letterSpacing: ".04em" }}>{p.word}</span>
          <span style={{ fontSize: 13, letterSpacing: ".16em", textTransform: "uppercase", color: color.tertiary }}>{p.meta}</span>
        </div>
        <h3
          style={{
            margin: 0,
            fontFamily: CONDENSED,
            fontWeight: 800,
            fontSize: "clamp(40px,4.6vw,68px)",
            lineHeight: 0.9,
            textTransform: "uppercase",
            textWrap: "balance",
          }}
        >
          {p.heading}
        </h3>
        <p style={{ margin: 0, fontSize: "clamp(16px,1.3vw,18px)", lineHeight: 1.5, color: color.secondary, maxWidth: 520, textWrap: "pretty" }}>{p.body}</p>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${p.steps.length},1fr)`, gap: 8 }}>
          {p.steps.map((s) => (
            <figure key={s.cap} style={{ margin: 0, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <img src={asset(s.img)} alt={s.alt} style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", display: "block" }} />
              <figcaption style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: color.quiet }}>{s.cap}</figcaption>
            </figure>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", paddingTop: 4 }}>
          <AmazonCta
            sku={sku}
            placement="product"
            style={{
              background: color.orange,
              color: color.bg,
              height: 56,
              padding: "0 28px",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontWeight: 700,
              fontSize: 16,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {p.cta}
          </AmazonCta>
          <span style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: color.quiet }}>Opens Amazon.com</span>
          <Link className="us-text-link" href={sku === "d204" ? routes.coloredGlaze : routes.glazeCoating}>Application guide <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </div>
  );
}

export default function RoutineSection({ sku, onPick }) {
  // Which product's video is playing (null, "d204" or "d215"). Playing one stops the other.
  const [playing, setPlaying] = useState(null);
  return (
    <section id="compare" style={{ background: color.raised, borderTop: `1px solid ${color.hairline}` }}>
      <div
        style={{
          maxWidth: 1312,
          margin: "0 auto",
          padding: "clamp(56px,7vw,104px) clamp(20px,4.4vw,64px)",
          display: "flex",
          flexDirection: "column",
          gap: "clamp(32px,4vw,56px)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,400px),1fr))",
            gap: "clamp(20px,3vw,48px)",
            alignItems: "end",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ color: color.orange, fontSize: 13, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase" }}>Dry or Wet</div>
            <h2
              style={{
                margin: 0,
                fontFamily: CONDENSED,
                fontWeight: 800,
                fontSize: "clamp(44px,6vw,92px)",
                lineHeight: 0.88,
                textTransform: "uppercase",
                textWrap: "balance",
              }}
            >
              Same finish. Pick your moment.
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: "clamp(16px,1.3vw,19px)", lineHeight: 1.5, color: color.tertiary, maxWidth: 520, textWrap: "pretty" }}>
            Both work the same way—spray, spread, towel. The only decision is <em style={{ color: color.text, fontStyle: "normal" }}>when</em> you apply.
          </p>
        </div>
        <div className="us-routine-picker">
          <p id="routine-q">When do you prefer to apply?</p>
          <RoutineSelector sku={sku} onPick={onPick} labelledBy="routine-q" />
          <span className="us-sr-only" aria-live="polite">Selected · {PANEL[sku].name}</span>
          <Link href={routes.wetOrDry} className="us-text-link">Compare dry &amp; wet <span aria-hidden="true">→</span></Link>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))",
            gap: 2,
            background: color.hairline,
            border: `1px solid ${color.hairline}`,
          }}
        >
          <ProductCard sku="d204" selected={sku === "d204"} onPick={onPick} />
          <ProductCard sku="d215" selected={sku === "d215"} onPick={onPick} />
        </div>
        <Panel key={sku} sku={sku} playing={playing === sku} onPlay={setPlaying} />
        <p style={{ margin: 0, fontSize: 13, color: color.quiet, lineHeight: 1.5 }}>Use only as directed. Read and follow the current product label before use.</p>
      </div>
    </section>
  );
}
