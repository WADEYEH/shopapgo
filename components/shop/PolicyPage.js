import { readFileSync } from "node:fs";
import path from "node:path";
import { inlineText, parseMarkdown } from "@/lib/shop/markdown";

// The policy pages (/privacy, /terms, /returns, /shipping) show the drafts in docs/legal as they are (M11): the owner
// and counsel edit those files, the site follows at the next build. Read at build time; nothing runs in the browser.
// Open points in the drafts ("[legal entity name]") are marked [TO CONFIRM] until counsel settles them.

export function loadPolicy(file) {
  const blocks = parseMarkdown(readFileSync(path.join(process.cwd(), "docs", "legal", file), "utf8"));
  const heading = blocks.find((block) => block.type === "heading" && block.level === 1);
  const rest = blocks.filter((block) => block !== heading);
  // The draft's own first line ("*Draft for internal review …*") becomes the draft notice.
  const note = rest[0]?.type === "paragraph" && rest[0].children.length === 1 && rest[0].children[0].type === "em" ? rest[0] : null;
  return { title: inlineText(heading.children), note, blocks: rest.filter((block) => block !== note) };
}

const hasPlaceholder = (nodes) => nodes.some((node) => node.type === "placeholder" || (node.children && hasPlaceholder(node.children)));
const blockNodes = (block) =>
  block.type === "list" ? block.items.flat() : block.type === "table" ? [...block.head, ...block.rows.flat()].flat() : block.children;

function Inline({ nodes }) {
  return nodes.map((node, i) => {
    if (node.type === "text") return node.text;
    if (node.type === "placeholder") return <mark key={i} data-to-confirm="">{`[TO CONFIRM: ${node.text}]`}</mark>;
    if (node.type === "strong") return <strong key={i}><Inline nodes={node.children} /></strong>;
    if (node.type === "em") return <em key={i}><Inline nodes={node.children} /></em>;
    return <a key={i} href={node.href}><Inline nodes={node.children} /></a>;
  });
}

function Block({ block }) {
  if (block.type === "heading") {
    const Tag = block.level === 2 ? "h2" : "h3";
    return <Tag><Inline nodes={block.children} /></Tag>;
  }
  if (block.type === "list") {
    const Tag = block.ordered ? "ol" : "ul";
    return <Tag>{block.items.map((item, i) => <li key={i}><Inline nodes={item} /></li>)}</Tag>;
  }
  if (block.type === "table") {
    return (
      <div className="legal__table-wrap">
        <table className="legal__table">
          <thead><tr>{block.head.map((cell, i) => <th key={i} scope="col"><Inline nodes={cell} /></th>)}</tr></thead>
          <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, i) => <td key={i}><Inline nodes={cell} /></td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  return <p><Inline nodes={block.children} /></p>;
}

export default function PolicyPage({ policy }) {
  // Sections start at each "##" heading; anything before the first one is the introduction.
  const sections = [];
  for (const block of policy.blocks) {
    if (block.type === "heading" && block.level === 2) sections.push([block]);
    else if (sections.length) sections.at(-1).push(block);
    else sections.push([block]);
  }
  const placeholders = policy.blocks.some((block) => hasPlaceholder(blockNodes(block)));
  return (
    <main className="shop-main legal" id="main">
      <div className="shop-intro">
        <p className="eyebrow">Support</p>
        <h1 className="heading-guide-h1">{policy.title}</h1>
      </div>
      {policy.note && (
        <p className="legal__draft" role="note" data-policy-draft="">
          <Inline nodes={policy.note.children[0].children} />
        </p>
      )}
      {placeholders && (
        <p className="legal__confirm-note" data-confirm-legend="">
          Highlighted items marked <mark data-to-confirm="">[TO CONFIRM]</mark> are open points to settle with counsel before
          launch. They are placeholders, not commitments.
        </p>
      )}
      {sections.map((blocks, i) => (
        <section key={i} className="legal__section">
          {blocks.map((block, j) => <Block key={j} block={block} />)}
        </section>
      ))}
    </main>
  );
}
