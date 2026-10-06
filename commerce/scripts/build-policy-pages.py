#!/usr/bin/env python3
"""Generates prototype/{privacy,terms,returns,contact}.html from one template.
Edit the text here, run `python3 scripts/build-policy-pages.py`, commit both."""
import pathlib, html

ROOT = pathlib.Path(__file__).resolve().parent.parent / "prototype"
EMAIL = "services@apgo.com.tw"
UPDATED = "October 1, 2026"

FOOTER = """    <footer class="shop-footer">
      <div class="shop-footer__inner">
        <img src="assets/brand/apgo-logo.png" alt="APGO" width="89" height="24">
        <nav class="shop-footer__links" aria-label="Legal and support">
          <a href="https://www.shopapgo.com/us" data-site-home>APGO website</a>
          <a href="https://www.shopapgo.com/us/guides" data-site-guides>Guides</a>
          <a href="privacy.html"{p}>Privacy Policy</a>
          <a href="terms.html"{t}>Terms of Sale</a>
          <a href="returns.html"{r}>Returns &amp; Refunds</a>
          <a href="contact.html"{c}>Contact</a>
        </nav>
        <span>© <span data-year>2026</span> APGO.</span>
      </div>
    </footer>"""

def footer(cur=None):
    marks = {k: (' aria-current="page"' if k == cur else "") for k in "ptrc"}
    return FOOTER.format(**marks)

PAGE = """<!doctype html>
<html lang="en">
  <head>
    <script src="js/site-links.js" defer></script>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>{title} · APGO</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600;700&display=swap">
    <link rel="stylesheet" href="css/commerce.css">
    <script src="js/meta-pixel.js" defer></script>
    <script type="module" src="js/commerce/shared.js"></script>
    <noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=2606879866471418&ev=PageView&noscript=1"></noscript>
  </head>
  <body data-page="{slug}">
    <header class="shop-header">
      <div class="shop-header__inner">
        <a class="shop-header__logo" href="./" aria-label="APGO home"><img src="assets/brand/apgo-logo.png" alt="APGO" width="89" height="24"></a>
        <nav class="shop-header__nav" aria-label="Store">
          <a href="cart.html">Cart · <span data-cart-count>0</span></a>
        </nav>
      </div>
    </header>

    <main class="shop-main legal" id="main">
      <div class="shop-intro">
        <p class="eyebrow">{eyebrow}</p>
        <h1 class="heading-guide-h1">{title}</h1>
        <p class="body body--muted">Last updated {updated}</p>
      </div>
      <p class="legal__draft" role="note" data-policy-draft>Draft for owner and counsel approval before the store takes live payments. Items in this page that are business decisions are listed in docs/commerce.md.</p>
{body}
    </main>

{footer}
  </body>
</html>
"""

def sec(h, *paras, items=None):
    out = f'      <section class="legal__section">\n        <h2>{h}</h2>\n'
    for p in paras:
        out += f"        <p>{p}</p>\n"
    if items:
        out += "        <ul>\n" + "".join(f"          <li>{i}</li>\n" for i in items) + "        </ul>\n"
    return out + "      </section>\n"

def tc(text):
    """Visible marker for a business term the owner has not decided yet."""
    return f"<mark data-to-confirm>[TO CONFIRM: {text}]</mark>"

mail = f'<a href="mailto:{EMAIL}">{EMAIL}</a>'
OPERATOR = ("APGO is operated by 光世代科技有限公司 (Taiwan Business ID 24705400), "
            "No. 3, Ln. 56, Fengshan St., Xinzhuang Dist., New Taipei City, Taiwan.")

LEGEND = ('      <p class="legal__confirm-note" data-confirm-legend>Highlighted items marked '
          '<mark data-to-confirm>[TO CONFIRM]</mark> are business terms the owner has not decided yet. '
          'They are placeholders, not commitments.</p>\n')

pages = {}

pages["privacy"] = ("Privacy Policy", "Legal", "p", "".join([
    sec("Who we are", OPERATOR + f" Questions about this policy: {mail}."),
    sec("What we collect when you order",
        "We collect only what is needed to take and deliver your order:",
        items=["Contact details: email address, and your name and shipping address (street, city, state, ZIP).",
               "Order details: the products and quantities, amounts, shipping method, order number and status.",
               "An optional marketing checkbox. It is off unless you turn it on, and ordering never depends on it.",
               "Technical data needed to keep checkout working and secure, such as your IP address and browser type."]),
    sec("Payment card data",
        "Payments are processed by Airwallex. Card details are typed into secure fields hosted by Airwallex, so they go directly to Airwallex and never reach or get stored on APGO systems. We receive the payment result and order reference only. See Airwallex’s own privacy notice for how it handles that data."),
    sec("How we use it",
        items=["To process payment, prepare and ship your order, and send order-related messages.",
               "To answer your support questions and handle returns and refunds.",
               "To prevent fraud and meet legal, tax and accounting obligations.",
               "To send product news only if you ticked the marketing checkbox. You can opt out at any time."]),
    sec("What stays in your browser",
        "Your cart (product codes and quantities, no prices) is saved in your browser’s local storage so it survives a page reload. You can clear it in your browser settings at any time. Where analytics is enabled on this site, it is used to understand how pages perform, not to sell your data."),
    sec("Who we share it with",
        "We share data with service providers that help us run the store: Airwallex (payments), Cloudflare (hosting, security and our order database), and the carrier or fulfillment partner that delivers your order ("+tc("which fulfillment partner(s) will be used")+"). For advertising measurement we also share data with Meta Platforms, as described under “Advertising and Meta Pixel” below. " + tc("TO CONFIRM with counsel: how this sharing is described, including the statement below about not selling personal information") + " We do not sell your personal information."),
    sec("Advertising and Meta Pixel " + tc("TO CONFIRM with counsel"),
        "This store uses the Meta Pixel (a script that runs in your browser) and Meta’s Conversions API (a connection from our servers to Meta). We use them to measure how our ads perform and to improve how they are delivered.",
        "We send Meta these events: viewing a product, adding to cart, starting checkout, and completing a purchase.",
        "With those events we may send Meta:",
        items=["Your email address, name, and address details (city, state, ZIP code), each hashed before it is sent. Hashing turns a value into a scrambled code; it is not the same as removing it, and Meta may be able to match it to its own accounts.",
               "Your IP address and your browser’s user agent (the browser and device type it reports).",
               "Meta’s browser cookies, <code>_fbp</code> and <code>_fbc</code>, when they are present.",
               "Order value and product identifiers for the items involved."]),
    sec("Advertising data we store on our side " + tc("TO CONFIRM with counsel"),
        "To send those events from our own systems, we store your IP address, your browser’s user agent, and advertising attribution parameters from the link you arrived on (for example <code>fbclid</code>) with your order in our order database, which is hosted on Cloudflare. We keep this with the order record for the period described in “How long we keep it” " + tc("TO CONFIRM with counsel: whether this advertising data needs its own retention period") + "."),
    sec("Opting out of Meta advertising measurement " + tc("TO CONFIRM with counsel"),
        f"You can choose not to take part in several ways: use the ad preferences in your Facebook or Instagram account settings to control how Meta uses your activity for ads; block or delete cookies in your browser settings (this stops <code>_fbp</code> and <code>_fbc</code> from being set or read, though order data we keep for the order itself is unaffected); or email {mail} and tell us you want to opt out, and we will act on your request as described in “Your choices”. Meta’s own privacy policy explains what Meta does with the data it receives."),
    sec("How long we keep it",
        "We keep order records for " + tc("retention period") + " so we can fulfil the order, handle returns and meet tax and accounting rules, then delete or anonymize them."),
    sec("Your choices",
        f"You can ask us to access, correct or delete your personal information, or stop marketing messages, by emailing {mail}. We will verify it is you and respond within a reasonable time. If you live in a state with privacy laws that give you additional rights (for example California), contact us and we will honor them as required."),
    sec("Children", "The store is not directed to children under 13 and we do not knowingly collect their data."),
    sec("Changes", "If we change this policy we will update the date above."),
]))

pages["terms"] = ("Terms of Sale", "Legal", "t", "".join([
    sec("About these terms", OPERATOR + " By placing an order on this store you agree to these terms. They apply to purchases made here, not to purchases made on Amazon or other retailers, which follow the terms of that retailer."),
    sec("Orders",
        "Placing an order is an offer to buy. We accept it when payment is confirmed, and you will see an order number on the confirmation page. We may cancel and fully refund an order we cannot fulfil, such as for a pricing error, stock shortage or suspected fraud."),
    sec("Prices and payment",
        "Prices are in US dollars and are shown at checkout before you pay. The total includes the shipping method you choose (" + tc("shipping fees and any free-shipping terms") + ") and any sales tax (" + tc("whether, where and at what rate sales tax is collected") + "). Payments are processed by Airwallex; we do not see or store your card number."),
    sec("Shipping",
        "We ship to " + tc("shipping regions, currently planned: addresses in the United States") + ". Shipping methods and delivery times: " + tc("shipping methods and delivery time for each") + ". Any delivery estimate is an estimate, not a guarantee. Risk of loss passes to you " + tc("when risk of loss passes, counsel to confirm") + "."),
    sec("Returns and refunds", "See our <a href=\"returns.html\">Returns &amp; Refunds</a> page, which forms part of these terms."),
    sec("Use of the products",
        "Use each product only on the surfaces and in the way its current label and instructions describe. If you are unsure whether a surface is covered, contact us before use. Results depend on preparation, conditions and application."),
    sec("Limitation of liability",
        "To the extent the law allows, APGO is not liable for indirect or consequential losses, and our total liability for an order is limited to " + tc("liability cap, counsel to confirm") + ". Nothing here limits rights you have under law that cannot be limited, including any rights under applicable consumer protection law."),
    sec("Governing law", "These terms are governed by the laws of " + tc("governing law and jurisdiction, to be set with counsel") + ", without regard to conflict-of-law rules."),
    sec("Contact", f"Questions about these terms: {mail}."),
]))

pages["returns"] = ("Returns &amp; Refunds", "Support", "r", "".join([
    sec("Our approach",
        "If something is wrong with your order, contact us and we will work it out with you. This page covers orders placed on this store. For Amazon orders, use Your Orders on Amazon."),
    sec("Returns",
        items=["Return window: " + tc("return window, number of days and whether it counts from delivery") + ".",
               "Condition of returned products: " + tc("whether only unopened, unused products are accepted") + ".",
               "Opened or used products: " + tc("whether opened or used products are accepted, for example only if defective or not as ordered") + ".",
               f"To start a return, email {mail} with your order number and the reason. We will reply with return instructions. Please do not ship anything back before you hear from us."]),
    sec("Damaged, defective or wrong item",
        f"Email {mail} with your order number and a photo of the item and packaging, within " + tc("reporting window after delivery") + ". What we offer: " + tc("replacement, refund or both, and whether original and return shipping are covered") + "."),
    sec("Return shipping", "Who pays for shipping the item back: " + tc("return shipping cost for change-of-mind returns") + "."),
    sec("How refunds work",
        "After we receive and check the returned item, we refund to the original payment method through Airwallex. Refund amount: " + tc("what is refunded, product price and/or shipping fees") + ". Refund timing: " + tc("refund processing time") + "."),
    sec("Order changes and cancellations",
        f"Email {mail} as soon as possible with your order number if you want to change or cancel an order. Cancellation rules: " + tc("whether and until when an order can be cancelled, for example before it ships") + "."),
    sec("Questions", f"{mail}, Mon–Fri, 09:00–18:00 Taiwan time (UTC+8)."),
]))

pages["contact"] = ("Contact", "Support", "c", "".join([
    sec("Reach APGO", "We answer product and order questions by email and phone."),
    '''      <section class="legal__section legal__card">
        <h2>Customer support</h2>
        <dl class="legal__facts">
          <div><dt>Email</dt><dd><a href="mailto:services@apgo.com.tw">services@apgo.com.tw</a></dd></div>
          <div><dt>Phone</dt><dd><a href="tel:+886229030101">+886 2 2903 0101</a></dd></div>
          <div><dt>Hours</dt><dd>Mon–Fri, 09:00–18:00 Taiwan time (UTC+8)</dd></div>
          <div><dt>Operated by</dt><dd><span lang="zh-Hant">光世代科技有限公司</span><br>Taiwan Business ID 24705400<br><address>No. 3, Ln. 56, Fengshan St., Xinzhuang Dist., New Taipei City, Taiwan</address></dd></div>
        </dl>
      </section>
''',
    sec("Before you write", "Please include your order number if you have one. For returns, see <a href=\"returns.html\">Returns &amp; Refunds</a>. For Amazon orders, use Your Orders on Amazon."),
]))

for slug, (title, eyebrow, cur, body) in pages.items():
    (ROOT / f"{slug}.html").write_text(PAGE.format(
        title=title, eyebrow=eyebrow, slug=slug, updated=UPDATED, body=(LEGEND + body if "data-to-confirm" in body else body), footer=footer(cur)), encoding="utf-8", newline="\n")
    print("wrote", slug + ".html")

# Keep the store pages' footer in step with the policy pages.
import re
for name in ("cart", "checkout"):
    f = ROOT / f"{name}.html"
    s = f.read_text(encoding="utf-8")
    new = re.sub(r'    <footer class="shop-footer">.*?</footer>', lambda m: footer(), s, flags=re.S)
    if new != s:
        f.write_text(new, encoding="utf-8", newline="\n"); print("footer updated", name + ".html")
