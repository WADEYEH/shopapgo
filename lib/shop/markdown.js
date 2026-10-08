// A small Markdown reader for the policy drafts in docs/legal (D41, M11): the lawyer edits those files and the site
// shows exactly them. It knows only what the drafts use: # / ## / ### headings, paragraphs, "-" and "1." lists, pipe
// tables, **bold**, *italic* and [links](url). A bracketed note that is not a link ("[legal entity name]") is an open
// point: it is returned as a placeholder, which the page marks "[TO CONFIRM: …]".
//
// Output is plain data (blocks of inline nodes); the page turns it into elements, so no HTML string is ever injected.

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^\d+\.\s+(.*)$/;
const TABLE_RULE = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;

const cells = (line) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());

// Inline text → [{ type: "text" | "strong" | "em" | "link" | "placeholder", ... }].
export function parseInline(text) {
  const nodes = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)|\[([^\]]+)\]/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) nodes.push({ type: "text", text: text.slice(last, match.index) });
    if (match[1] !== undefined) nodes.push({ type: "strong", children: parseInline(match[1]) });
    else if (match[2] !== undefined) nodes.push({ type: "em", children: parseInline(match[2]) });
    else if (match[3] !== undefined) nodes.push({ type: "link", href: match[4], children: parseInline(match[3]) });
    else nodes.push({ type: "placeholder", text: match[5] });
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push({ type: "text", text: text.slice(last) });
  return nodes;
}

// Markdown → [{ type: "heading", level, children } | { type: "paragraph", children } | { type: "list", ordered, items }
//              | { type: "table", head, rows }]
export function parseMarkdown(source) {
  const lines = String(source).replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" ")) });
    if (list) blocks.push(list);
    paragraph = [];
    list = null;
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "heading", level: heading[1].length, children: parseInline(heading[2]) });
      continue;
    }
    if (line.startsWith("|") && TABLE_RULE.test(lines[i + 1]?.trim() ?? "")) {
      flush();
      const head = cells(line).map(parseInline);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++].trim()).map(parseInline));
      i -= 1;
      blocks.push({ type: "table", head, rows });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (paragraph.length || (list && list.ordered !== ordered)) flush();
      list ??= { type: "list", ordered, items: [] };
      list.items.push(parseInline((bullet || numbered)[1]));
      continue;
    }
    if (list) flush();
    paragraph.push(line);
  }
  flush();
  return blocks;
}

// Plain text of inline nodes (titles, metadata).
export const inlineText = (nodes) =>
  nodes.map((node) => (node.type === "text" || node.type === "placeholder" ? node.text : inlineText(node.children))).join("");
