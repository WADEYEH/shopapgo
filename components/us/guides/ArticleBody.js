// <article> wrapper with the 680px reading column used by every guide.
export default function ArticleBody({ children }) {
  return (
    <article style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(32px,4vw,56px) 20px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 40, maxWidth: 680 }}>{children}</div>
    </article>
  );
}
