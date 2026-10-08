const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { ROOT, compile } = require("./fixture.cjs");

// lib/shop/markdown.js: the reader behind the policy pages (components/shop/PolicyPage.js), which show the drafts in
// docs/legal exactly as written. JSON round trips: values built in the vm come from another realm.
const md = compile("lib/shop/markdown.js");
const plain = (value) => JSON.parse(JSON.stringify(value));
const parse = (text) => plain(md.parseMarkdown(text));
const inline = (text) => plain(md.parseInline(text));

test("inline: bold, italic, links, and a bracketed note that is not a link is an open point", () => {
  assert.deepEqual(inline("Shipping is **$7.99 per order**."), [
    { type: "text", text: "Shipping is " },
    { type: "strong", children: [{ type: "text", text: "$7.99 per order" }] },
    { type: "text", text: "." },
  ]);
  assert.deepEqual(inline("Email [services@apgo.com.tw](mailto:services@apgo.com.tw) or [legal entity name]"), [
    { type: "text", text: "Email " },
    { type: "link", href: "mailto:services@apgo.com.tw", children: [{ type: "text", text: "services@apgo.com.tw" }] },
    { type: "text", text: " or " },
    { type: "placeholder", text: "legal entity name" },
  ]);
  assert.deepEqual(inline("*Draft. Effective date: [to be set at launch].*"), [
    { type: "em", children: [{ type: "text", text: "Draft. Effective date: " }, { type: "placeholder", text: "to be set at launch" }, { type: "text", text: "." }] },
  ]);
});

test("blocks: headings, paragraphs joined across lines, bullet and numbered lists, tables", () => {
  const blocks = parse([
    "# Shipping Policy",
    "",
    "## Where we ship",
    "",
    "We ship only to",
    "the 48 states.",
    "",
    "- Alaska",
    "- P.O. boxes",
    "",
    "1. Contact us",
    "2. We email instructions",
    "",
    "| Provider | Purpose |",
    "|---|---|",
    "| Airwallex, PayPal | Payments |",
    "| Resend | Order emails |",
  ].join("\n"));
  assert.deepEqual(blocks.map((block) => block.type), ["heading", "heading", "paragraph", "list", "list", "table"]);
  assert.equal(blocks[0].level, 1);
  assert.equal(md.inlineText(blocks[2].children), "We ship only to the 48 states.");
  assert.equal(blocks[3].ordered, false);
  assert.equal(blocks[3].items.length, 2);
  assert.equal(blocks[4].ordered, true);
  assert.deepEqual(blocks[5].head.map((cell) => md.inlineText(cell)), ["Provider", "Purpose"]);
  assert.deepEqual(blocks[5].rows.map((row) => row.map((cell) => md.inlineText(cell))), [["Airwallex, PayPal", "Payments"], ["Resend", "Order emails"]]);
});

test("every policy draft reads cleanly: one title, sections, no stray Markdown left in the text", () => {
  for (const file of ["privacy-policy.md", "terms-of-sale.md", "returns-and-refunds.md", "shipping-policy.md"]) {
    const blocks = parse(fs.readFileSync(path.join(ROOT, "docs/legal", file), "utf8"));
    assert.equal(blocks.filter((block) => block.type === "heading" && block.level === 1).length, 1, file);
    assert.ok(blocks.filter((block) => block.type === "heading" && block.level === 2).length >= 3, file);
    const text = JSON.stringify(blocks.map((block) => block.children ?? block.items ?? [block.head, block.rows]));
    assert.doesNotMatch(text, /\*\*|\]\(|^#/m, `${file}: unparsed Markdown`);
  }
});
