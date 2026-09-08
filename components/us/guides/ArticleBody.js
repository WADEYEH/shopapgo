import OnThisPage from "./OnThisPage";

// The reading column stays server-rendered; only the responsive TOC is interactive.
export default function ArticleBody({ children, toc }) {
  return (
    <article className="us-article-layout">
      <div className="us-article-content">{children}</div>
      {toc && <aside className="us-article-sidebar"><OnThisPage items={toc} /></aside>}
    </article>
  );
}
