# V2 page blueprint — US English

Status: **proposed structure; not implementation-approved**

## Audience and page job

Primary visitor: a US DIY car owner who has just encountered APGO and does not
already know the difference between D204 and D215.

Primary job: make the coating benefits desirable, help the visitor choose the
right result and application moment, build brand trust, and leave through the
matching Amazon listing.

The page is not a stripped-down comparison table or a recreation of the Amazon
detail page. It must sell the value of the products before asking for a choice.

## Narrative spine

```text
Promise a better finish
      ↓
Show gloss, water behavior, protection, and exterior versatility
      ↓
Flagship/deep finish → D204       Coat-as-you-dry → D215
      ↓                                  ↓
See the real process and expected result
      ↓
Connect the products to APGO’s Taiwan story
      ↓
Continue to the selected Amazon product
```

The product-choice section is the page’s one complete D204/D215 comparison.
The process demonstrates the selected product; the final section confirms only
that selection instead of restarting the comparison.

## Six-section architecture

### 1. Hero — make the two-product promise clear

**Unique job:** explain the Atomic Series within one screen and create desire to
find the right finish.

Content:

- APGO Atomic Series eyebrow;
- headline: “One wash. Two ways to finish.”;
- desire-led contrast between D204’s deeper, longer-wearing dry-car finish and
  D215’s ability to add gloss/protection as the vehicle is towel-dried;
- official D204 and D215 packshots with equal visual prominence;
- one primary in-page CTA: “Find my finish”;
- Made in Taiwan / hand-applied / no-machine support line.

Do not place a default-product Amazon CTA in the hero. The shopper has not made
a choice, and neither product should look like the automatic answer.

Desktop: copy and paired products share one balanced frame.

Mobile: copy, paired products, and CTA stay compact enough that the next section
begins to appear without an endless first screen.

### 2. Product value — answer why the finishing step matters

**Unique job:** make the visitor want the category before comparing products.

Use three visually strong benefit pillars:

- tighter water beading and hydrophobic behavior;
- deeper, more reflective gloss without polishing equipment;
- care across compatible exterior paint, glass, trim, wheels, lights, and wraps.

Use real water-beading or application imagery where available. Do not repeat
capacities, step lists, product timing, or Amazon buttons here.

### 3. Product choice — make each product desirable for a different priority

**Unique job:** answer “Which result and process fit me?”

Show two equal-prominence product cards with no preselected product:

- **D204 — The deep-finish route:** dry application, flagship Atomic Series
  gloss/durability, 110° water contact angle, up to 180 days/30+ washes,
  300 mL covering 6–8 vehicles;
- **D215 — The dry-and-finish route:** turn towel-drying into the coating step,
  with up to 120 days/20-wash durability, water-based pH-neutral formula,
  200 mL.

Each card contains:

- one clear priority and application moment;
- one concise benefit-led description;
- a compact feature strip;
- a three-part process cue;
- the corresponding product packshot;
- a prominent “See it in action” link;
- one Amazon shortcut only when the listing is currently purchasable.

This replaces V1’s selector, comparison table, and two later product spotlights
with one complete decision moment.

Desktop: keep both cards side by side for the page’s one deliberate comparison.

Mobile: stack full cards; keep feature strips scannable and preserve equal visual
weight.

### 4. Real application — turn product claims into an understandable process

**Unique job:** show how the selected product is actually used.

Use D204/D215 tabs synchronized with the product cards. If the visitor reaches
this section without a selection, show two equal real-video covers rather than
an empty panel. Neither process is open. Selecting a cover becomes the active
product choice.

Each tab contains:

- one real application video or still sequence;
- four short steps;
- one concise result line;
- current-label usage note;
- captions/transcript and a non-video fallback.

Do not autoplay and do not add another Amazon CTA inside the video module.

### 5. Why APGO — give the products a memorable origin story

**Unique job:** answer “Why should I trust this unfamiliar brand?”

Use the brand line “Born in Taiwan. Built for hands-on car care.” Then tell one
short story: automotive coating development began in 2014, APGO launched in
2017, and the Atomic Series now gives DIY drivers two ways to finish a wash.

A three-point timeline and one proof line—official product photography, real
application footage, product support—are enough. Do not turn this into a long
corporate biography.

### 6. Selected Amazon handoff — confirm and exit

**Unique job:** remind the shopper what they selected and make the next action
obvious.

If D204 or D215 is selected, show only that route, one benefit-led confirmation,
its Amazon CTA, and “Change my finish.” If no product is selected, show an
in-page CTA back to the product choice. Never repeat the side-by-side comparison
at the bottom.

Price, availability, shipping, package contents, and returns are stated once in
the footer as Amazon-controlled details.

## Page-level hierarchy

| Level | Purpose | Maximum use |
| --- | --- | --- |
| H1 | Brand promise and page idea | 1 |
| H2 | One stage of the sales story | 5 |
| H3 | D204 or D215 within the one comparison section | 2 |
| Primary CTA | Advance to choice, process, or selected Amazon listing | 1 per context |
| Feature strip | Make each product’s distinct reasons-to-buy scannable | 1 per product |

Target visible body copy: approximately 600–750 words excluding legal and hidden
states. The added words belong to distinctive benefits and brand story, not
repeated dry/wet explanations.

## CTA behavior

- Header and hero point to the product choice, never directly to Amazon.
- No product is selected on first load.
- Product choice, mobile sticky, and selected final handoff are the only purchase
  contexts.
- Mobile sticky appears only after selection and disappears over the final
  handoff.
- A product with no purchasable listing shows status text in preview and no false
  public button.

Detailed states and events are in `cta-analytics-map.md`.

## V1 disposition

| V1 module | V2 action | Reason |
| --- | --- | --- |
| Header product CTA | Replace with “Find my finish” | avoid defaulting to D204 |
| Hero product CTA | Replace with in-page CTA | choice comes before referral |
| Why/use-case cards | Rewrite as three concrete benefits | sell value before choice |
| Fit selector | Merge into two full product cards | make priorities and features visible |
| Comparison table | Remove | product cards already contain the decision |
| D204 spotlight | Merge into D204 choice card | one complete product story |
| D215 spotlight | Merge into D215 choice card | one complete product story |
| Separate how-to | Merge with video | demonstration and steps belong together |
| Separate video | Merge with how-to | avoid repeating the process |
| FAQ | Replace with a small use note and one footer disclosure | keep momentum |
| Final choice | Make selection-aware | show only the selected product |

## Visual direction

Use a precise automotive-editorial system: charcoal, warm white, metallic
neutral, and one APGO accent. Give the packshots generous scale, use real water-
beading/application media, and make section changes feel like forward movement.

The three benefit tiles and two product cards are the only repeated-card systems.
Avoid turning every section into the same grid, generic sci-fi coating graphics,
fake laboratories, or decorative badges that compete with the products.
