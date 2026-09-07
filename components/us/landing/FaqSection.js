"use client";

import { color, CONDENSED } from "@/lib/us/tokens";
import { landingFaq } from "@/lib/us/faq";
import { track } from "@/lib/us/analytics";

export default function FaqSection() {
  const onToggle = (q) => (e) => {
    if (e.currentTarget.open) track("faq_expand", { question: q });
  };
  return (
    <section id="faq" style={{ background: color.raised, borderTop: `1px solid ${color.hairline}` }}>
      <div
        style={{
          maxWidth: 1312,
          margin: "0 auto",
          padding: "clamp(56px,7vw,104px) clamp(20px,4.4vw,64px)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))",
          gap: "clamp(32px,5vw,96px)",
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ color: color.orange, fontSize: 13, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase" }}>Before you choose</div>
          <h2
            style={{
              margin: 0,
              fontFamily: CONDENSED,
              fontWeight: 800,
              fontSize: "clamp(40px,5.2vw,76px)",
              lineHeight: 0.9,
              textTransform: "uppercase",
              textWrap: "balance",
            }}
          >
            Straight answers.
          </h2>
          <p style={{ margin: 0, fontSize: "clamp(16px,1.3vw,19px)", lineHeight: 1.5, color: color.tertiary, maxWidth: 440 }}>
            Anything the label doesn't cover, ask APGO directly through the support address in the footer.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ height: 16 }} />
          {landingFaq.map(({ q, a }, i) => (
            <details
              key={q}
              onToggle={onToggle(q)}
              style={{
                borderTop: `1px solid ${color.border}`,
                ...(i === landingFaq.length - 1 ? { borderBottom: `1px solid ${color.border}` } : null),
              }}
            >
              <summary
                style={{
                  listStyle: "none",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                  minHeight: 64,
                  padding: "16px 0",
                  fontFamily: CONDENSED,
                  fontWeight: 700,
                  fontSize: 22,
                  textTransform: "uppercase",
                  lineHeight: 1.1,
                }}
              >
                {q}
                <span className="faq-chev" aria-hidden="true" style={{ color: color.orange, fontSize: 28, lineHeight: 1, transition: "transform .18s", flex: "none" }}>
                  +
                </span>
              </summary>
              <p style={{ margin: 0, padding: "0 0 20px", fontSize: 16, lineHeight: 1.55, color: color.tertiary, maxWidth: 600 }}>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
