import { routes, asset } from "@/lib/us/routes";
import { color } from "@/lib/us/tokens";

// Shared footer for the guides hub and guide articles.
export default function GuideFooter() {
  const linkStyle = { color: color.tertiary, textDecoration: "none" };
  return (
    <footer style={{ background: color.bg, borderTop: `1px solid ${color.hairline}` }}>
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "32px 20px",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <img src={asset("brand/apgo-logo.png")} alt="APGO" style={{ height: 22 }} />
        <nav
          aria-label="Legal"
          style={{ display: "flex", gap: 24, fontSize: 13, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase" }}
        >
          <a href={routes.privacy} className="us-nav-link" style={linkStyle}>Privacy</a>
          <a href={routes.terms} className="us-nav-link" style={linkStyle}>Terms</a>
          <a href={routes.contact} className="us-nav-link" style={linkStyle}>Contact</a>
        </nav>
        <span style={{ fontSize: 13, color: color.quiet2 }}>© {new Date().getFullYear()} APGO</span>
      </div>
    </footer>
  );
}
