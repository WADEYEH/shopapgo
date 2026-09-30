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
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>{title} · APGO</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600;700&display=swap">
    <link rel="stylesheet" href="css/commerce.css">
    <script type="module" src="js/commerce/shared.js"></script>
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

mail = f'<a href="mailto:{EMAIL}">{EMAIL}</a>'
OPERATOR = ("APGO is operated by 光世代科技有限公司 (Taiwan Business ID 24705400), "
            "No. 3, Ln. 56, Fengshan St., Xinzhuang Dist., New Taipei City, Taiwan.")

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
        "We share data only with service providers that help us run the store: Airwallex (payments), Cloudflare (hosting, security and our order database), and the carrier or fulfillment partner that delivers your order. We do not sell your personal information."),
    sec("How long we keep it",
        "We keep order records for as long as needed to fulfil the order, handle returns and meet tax and accounting rules, then delete or anonymize them."),
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
        "Prices are in US dollars and are shown at checkout before you pay. The total includes the shipping method you choose and any sales tax we are required to collect. Payments are processed by Airwallex; we do not see or store your card number."),
    sec("Shipping",
        "We ship to addresses in the United States. The delivery estimate for each shipping method is shown at checkout and is an estimate, not a guarantee. Risk of loss passes to you on delivery."),
    sec("Returns and refunds", "See our <a href=\"returns.html\">Returns &amp; Refunds</a> page, which forms part of these terms."),
    sec("Use of the products",
        "Use each product only on the surfaces and in the way its current label and instructions describe. If you are unsure whether a surface is covered, contact us before use. Results depend on preparation, conditions and application."),
    sec("Limitation of liability",
        "To the extent the law allows, APGO is not liable for indirect or consequential losses, and our total liability for an order is limited to the amount you paid for it. Nothing here limits rights you have under law that cannot be limited, including any rights under applicable consumer protection law."),
    sec("Governing law", "These terms are governed by the laws of the State of [to be confirmed with counsel], without regard to conflict-of-law rules."),
    sec("Contact", f"Questions about these terms: {mail}."),
]))

pages["returns"] = ("Returns &amp; Refunds", "Support", "r", "".join([
    sec("Our promise",
        "If something is wrong with your order, we will make it right. This page covers orders placed on this store. For Amazon orders, use Your Orders on Amazon."),
    sec("Returns",
        items=["You may return an unopened, unused product within 30 days of delivery for a refund of the product price.",
               "Opened or used products can be returned only if they are defective or were not what you ordered.",
               f"To start a return, email {mail} with your order number and the reason. We will reply with return instructions. Please do not ship anything back before you hear from us."]),
    sec("Damaged, defective or wrong item",
        f"Email {mail} within 30 days of delivery with your order number and a photo of the item and packaging. We will send a replacement or refund you in full, including the original shipping you paid, and cover the return shipping if a return is needed."),
    sec("Return shipping", "For other returns, you pay the cost of shipping the item back."),
    sec("How refunds work",
        "After we receive and check the returned item, we refund the product price to the original payment method through Airwallex. Banks usually post the refund within 5–10 business days. Express shipping fees are not refunded unless the return is because of our error."),
    sec("Order changes and cancellations",
        f"We can cancel an order that has not shipped yet. Email {mail} as soon as possible with your order number."),
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
        title=title, eyebrow=eyebrow, slug=slug, updated=UPDATED, body=body, footer=footer(cur)), encoding="utf-8")
    print("wrote", slug + ".html")

# Keep the store pages' footer in step with the policy pages.
import re
for name in ("cart", "checkout"):
    f = ROOT / f"{name}.html"
    s = f.read_text(encoding="utf-8")
    new = re.sub(r'    <footer class="shop-footer">.*?</footer>', lambda m: footer(), s, flags=re.S)
    if new != s:
        f.write_text(new, encoding="utf-8"); print("footer updated", name + ".html")
