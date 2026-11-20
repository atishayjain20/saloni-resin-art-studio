#!/usr/bin/env python3
"""Write one static share page per catalogue product (standard library only).

    python3 tools/product_pages.py

Run it from anywhere after adding, renaming or removing a catalogue card in index.html
(run tools/share_images.py first: it makes the preview JPEGs this script points to).
Each product gets p/<slug>/index.html: a small real product page (photo, name, price, size,
description line) with its own Open Graph tags for link previews (WhatsApp, Facebook and X read
them without running JavaScript) and Product structured data (JSON-LD) so Google can show the
price and photo. Products priced "Price on request" get no structured data. The "Add to cart"
button opens /?product=<slug>&add=1#<section>, where script.js puts that product in the cart and shows its card. A price in a
new format stops this script until price_offer() learns it.
Each product page also has a path line (Home > topic > product; products no topic holds get Home > product)
with BreadcrumbList data, and a "More like this" list of 4 products from the same group (the first topic in
TOPICS that holds the product, else the cards of its home section that no topic holds): the ones that share the
most words with it first (pick_more()), then the rest of the group in card order, then "Fresh from the studio".
These links join the pages so Google can find and group all of them. The same list is stamped on each card's
photo link as data-more-like-this, so the home page popup shows it too. Each item shows the product's thumbnail (assets/thumb/<slug>.jpg, made by tools/share_images.py; the script stops if one is missing).

It also:
  * points og:image at assets/share/<slug>.jpg and reads its width and height from the JPEG,
  * stamps data-product-slug, data-more-like-this and data-thumb on each card's photo link in index.html (script.js reads them),
  * rewrites sitemap.xml so it lists every product page after the site's own pages,
  * deletes p/<slug>/ folders of products that no longer exist,
  * also writes the topic pages (/resin-clocks/ and others) from the TOPICS table below,
  * writes merchant-feed.tsv, the product list Google Merchant Center fetches every day. It holds only
    products with a photo of the real piece and one price. Each link ends in ?source=google-shopping (google.js
    marks the visit); the canonical tag and sitemap stay clean,
  * loads /google.js (cookie banner, Google tag after Accept) on every page and adds a Cookie settings button.

The slug comes from the product name. If two names give the same slug, the first card in
page order keeps it and later ones get a 4-letter suffix taken from their photo file name,
so adding a product never renames an earlier one. Renaming a card does change its slug and
breaks links already shared; the tests fail until this script has been run again.
"""
import hashlib
import html
import json
import re
import shutil
import sys
import unicodedata
import urllib.parse
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://saloniresinart.com"
STUDIO = "Saloni Resin Art Studio"
PAGE_DIR = "p"
FEED_FILE = "merchant-feed.tsv"
CORPORATE_SECTION = "corporate-resin-gifts"
CORPORATE_PAGE = "corporate-gifting/index.html"
CORPORATE_START, CORPORATE_END = "<!-- corporate-collection:start -->", "<!-- corporate-collection:end -->"
FEED_COLUMNS = ["id", "title", "description", "link", "image_link", "availability", "price", "brand", "condition", "identifier_exists"]

ARTICLE_RE = re.compile(r'<article\b[^>]*\bclass="[^"]*\b(?:work-card|romantic-keepsake-card)\b[^"]*"[^>]*>.*?</article>', re.S)
TRIGGER_RE = re.compile(r'<a class="lightbox-trigger" data-lightbox-trigger\b[^>]*>')
SECTION_RE = re.compile(r'<section\b[^>]*\bid="([^"]+)"')
SLUG_ATTR_RE = re.compile(r' data-product-slug="[^"]*"')
MORE_ATTR_RE = re.compile(r' data-more-like-this="[^"]*"')
THUMB_ATTR_RE = re.compile(r' data-thumb="[^"]*"')
THUMB_SIDE = 300
AMOUNT = r"([1-9][0-9]{0,2}(?:,[0-9]{2,3})*)"
PRICE_RE = re.compile("₹" + AMOUNT + "(?:–₹" + AMOUNT + ")?")

# Topic pages (/<slug>/): built from the home cards. Each picks cards by an explicit list of product slugs
# ("products") or one home section id ("section"), never by name. Adding or removing a topic also needs its
# sitemap.xml URL and its footer link on every hand-written page (the tests list both).
TOPICS = [
    {"slug": "resin-clocks", "link": "Resin clocks",
     "title": "Resin Clocks: Wall, Photo and Desk Clocks",
     "description": "Handmade resin wall clocks, photo clocks and a mini desk clock from Saloni Resin Art Studio in Ajmer. Shown palette or custom colours, shipped across India.",
     "heading": "Resin clocks, handmade in Ajmer",
     "intro": "Wall clocks in soft resin colours with gold or silver detail, photo clocks for a favourite picture, and a small desk clock. Choose the shown palette or ask for your own colours. Every piece is handmade by Saloni in her studio in Ajmer, Rajasthan.",
     "products": ["teal-and-gold-roman-resin-clock", "sage-and-gold-resin-clock", "lilac-and-silver-resin-clock",
                  "ivory-diamond-resin-clock", "sky-blue-roman-resin-clock", "pearl-geode-resin-clock",
                  "blue-hour-resin-clock", "a-little-blue-hour", "personalized-photo-clock",
                  "engagement-photo-clock", "mini-resin-desk-clock"]},
    {"slug": "couple-gifts", "link": "Couple gifts",
     "title": "Couple Gifts in Resin",
     "description": "Resin couple gifts: matching keychains, an anniversary calendar coaster, rose keepsakes and a photo clock, handmade by Saloni in Ajmer and shipped across India.",
     "heading": "Resin gifts for couples",
     "intro": "Keep the moment close. Matching keychains, an anniversary calendar coaster, a bracelet with a preserved petal and a clock for a favourite couple photo. Every piece is handmade by Saloni in her studio in Ajmer, Rajasthan.",
     "section": "romantic-keepsakes"},
    {"slug": "marriage-gifts", "link": "Marriage gifts",
     "title": "Marriage Gifts in Resin",
     "description": "Handmade resin marriage gifts: a ring platter, Mr and Mrs name plate, varmala frame, wedding card keepsake and engagement photo clock, made by Saloni in Ajmer.",
     "heading": "Resin marriage gifts",
     "intro": "For her, before forever. A ring platter for the ring ceremony, a name plate for the door of your first home, and frames that keep your varmala flowers and wedding invitation. Every piece is handmade by Saloni in her studio in Ajmer, Rajasthan.",
     "section": "marriage-gifts"},
    {"slug": "celebration-lights", "link": "Celebration lights",
     "title": "Resin Lights for Functions and Celebrations",
     "description": "Handmade resin tealight holders, lotus diyas, LED tealight holders and a sunflower lamp for functions and celebrations, made by Saloni in Ajmer, Rajasthan.",
     "heading": "Resin lights for functions and celebrations",
     "intro": "Tealight holders, a lotus diya pair, LED tealight holders and a sunflower lamp for a glowing corner at a function, pooja or family celebration. Every piece is handmade by Saloni in her studio in Ajmer, Rajasthan. Tealights, LEDs and bulbs are not included.",
     "products": ["lotus-diya-pair", "floral-swastik-tealight-set", "jewel-glow-tealight", "gold-fleck-lotus-light",
                  "pastel-lotus-tealight", "marigold-petal-holder", "ivory-mandala-holder", "emerald-glow-pair",
                  "sunflower-resin-lamp"]},
    {"slug": "resin-boards", "link": "Resin boards",
     "title": "Resin Boards: Name Plates and Handled Trays",
     "description": "Handmade resin name plates for your home door or desk, and handled trays, made by Saloni in Ajmer and shipped across India.",
     "heading": "Resin boards: name plates and handled trays",
     "intro": "Resin name plates for the home and desk, and handled trays. Every piece is handmade by Saloni in her studio in Ajmer, Rajasthan.",
     "products": ["mr-and-mrs-name-plate", "resin-desk-nameplate", "turquoise-tray-and-coasters", "smoky-bronze-handled-tray",
                  "champagne-white-handled-tray", "silver-icy-blue-handled-tray", "ocean-seashell-tray", "pastel-butterfly-trays"]},
]
REFERENCE_KICKER = "Reference image · final design confirmed before making"
CARD_SIZES = "(max-width: 620px) 40vw, (max-width: 1320px) 26vw, 344px"
VERSION_RE = re.compile(r'href="styles\.css\?v=(\d+)"')
# Product pages use the site stylesheet, header and footer; this only lays out the product block.
PAGE_CSS = ('.product-detail{max-width:32rem;margin:0 auto;padding:.75rem 1rem 2.5rem}'
            '.product-detail .path a,.product-detail .more a{display:inline-flex;align-items:center;min-height:2.75rem;color:#8f0d49;font-weight:700;text-decoration:none}'
            '.product-detail .photo{display:block;width:auto;max-width:100%;height:auto;max-height:58vh;margin:.25rem auto 0;border-radius:1rem;background:#fff;box-shadow:0 .75rem 2rem rgba(84,22,52,.14)}'
            '.product-detail h1{max-width:none;margin:1.1rem 0 .4rem;font-size:clamp(1.75rem,6vw,2.4rem);line-height:1.1;letter-spacing:-.02em}'
            '.product-detail .price{display:inline-block;margin:.25rem 0;padding:.2rem .7rem;border-radius:999px;background:#f2a007;font-size:1.15rem;font-weight:700}'
            '.product-detail .size{margin:.4rem 0 .25rem;color:#6a4a5b}'
            '.product-detail .order{display:flex;align-items:center;justify-content:center;min-height:3rem;margin:1.25rem 0 .4rem;padding:.75rem 1rem;border-radius:999px;background:#b0125b;color:#fff;font-weight:700;text-decoration:none}'
            '.product-detail .delivery-note{margin:0 0 1.5rem;color:#6a4a5b;font-size:.8rem;line-height:1.35;text-align:center}'
            '.product-detail .path{margin:0 0 .5rem}.product-detail .path ol,.product-detail .more ul{margin:0;padding:0;list-style:none}.product-detail .path ol{display:flex;flex-wrap:nowrap;align-items:center}'
            '.product-detail .path li{display:flex;flex:none;align-items:center;color:#6a4a5b;white-space:nowrap}.product-detail .path li span{margin:0 .4rem}'
            '.product-detail .path li[aria-current]{display:block;flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;line-height:2.75rem}'
            '.product-detail .more{margin:0}.product-detail .more h2{margin:0 0 .5rem;font-size:1.4rem;letter-spacing:-.02em}'
            '.product-detail .more ul{display:grid;grid-template-columns:repeat(2,1fr);gap:.5rem}'
            '.product-detail .more a{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:.35rem;height:100%;padding:.4rem;text-align:center}'
            '.product-detail .more a:focus-visible{outline-offset:-3px}.product-detail .more img{width:6.25rem;height:6.25rem;border-radius:.75rem;object-fit:cover}'
            '.product-detail .more span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;font-size:.9rem;line-height:1.25}'
            '.product-detail a:focus-visible{outline:3px solid #b0125b;outline-offset:4px}')
# Sizes the popup also hides: they are not a real size yet.
NOT_A_SIZE_RE = re.compile(r"suggested size|confirm with saloni|custom size in inches|component size to confirm", re.I)

# The topic page's header and footer are the ones on varmala-preservation/index.html, plus the topic links.
TOPIC_HEADER = '  <header class="site-header">\n    <div class="shell header-inner">\n      <a class="wordmark" href="../" aria-label="Saloni Resin Art Studio home">\n        <span class="wordmark-name">Saloni</span>\n        <span class="wordmark-subtitle">resin art studio</span>\n      </a>\n      <nav class="collection-nav" aria-label="Collection navigation">\n        <a href="../">Studio home</a>\n        <a href="../resin-photo-frames/">Photo frames</a>\n        <a href="../namokar-mantra-frames/">Namokar frames</a>\n        <a href="../corporate-gifting/">Corporate gifting</a>\n      </nav>\n    </div>\n  </header>\n'
TOPIC_FOOTER = '  <footer class="site-footer" id="footer">\n    <div class="shell footer-inner">\n      <div><a class="wordmark wordmark-footer" href="../"><span class="wordmark-name">Saloni</span><span class="wordmark-subtitle">resin art studio</span></a><p>Small details. Lasting feelings.</p></div>\n      <div class="footer-links"><a href="../resin-photo-frames/">Photo frames</a><a href="../namokar-mantra-frames/">Namokar frames</a><a href="../varmala-preservation/">Varmala preservation</a>{topic_links}<a href="../partners/">Partner Circle</a><a href="../corporate-gifting/">Corporate gifting</a><a href="../#customer-reviews">Reviews</a><a href="../#order">Order</a><a href="https://www.instagram.com/saloniresin_art_studio/" target="_blank" rel="noreferrer">Instagram</a></div>\n      <p class="footer-credit">© Saloni Resin Art Studio <button type="button" class="cookie-settings" data-cookie-settings hidden>Cookie settings</button></p>\n    </div>\n  </footer>\n'
TOPIC_PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#fbd3e5">
  <meta name="description" content="{desc}">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="{studio}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{image}">
  <meta property="og:image:width" content="{image_width}">
  <meta property="og:image:height" content="{image_height}">
  <meta property="og:image:alt" content="{hero_alt}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{desc}">
  <meta name="twitter:image" content="{image}">
  <meta name="twitter:image:alt" content="{hero_alt}">
  <link rel="canonical" href="{url}">
  <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="../assets/apple-touch-icon.png">
  <script type="application/ld+json">{data}</script>
  <title>{title}</title>
  <link rel="stylesheet" href="../styles.css?v={version}">
  <script class="analytics-script" src="../analytics.js?v={version}" defer></script>
  <script class="google-script" src="../google.js?v={version}" defer></script>
  <script>(function () {{ var script = document.createElement("script"); script.src = "../script.js?v={version}"; script.defer = true; document.head.appendChild(script); }}());</script>
</head>
<body class="collection-page">
  <a class="skip-link" href="#main-content">Skip to content</a>
{header}  <main id="main-content" tabindex="-1">
    <section class="collection-hero shell" aria-labelledby="collection-title">
      <div class="collection-hero-copy">
        <h1 id="collection-title">{heading}</h1>
        <p>{intro}</p>
        <div class="collection-actions">
          <a class="button button-dark" href="../#order">Start a conversation <span aria-hidden="true">↗</span></a>
          <a class="text-link" href="../">Back to the studio <span aria-hidden="true">↗</span></a>
        </div>
      </div>
      <figure class="collection-hero-image">
        <img src="../assets/{hero_file}" alt="{hero_alt}" width="{hero_width}" height="{hero_height}" loading="lazy" decoding="async">
        <figcaption>{hero_kicker}</figcaption>
      </figure>
    </section>
    <section class="collection-list shell" aria-labelledby="collection-list-title">
      <div class="collection-list-heading">
        <p class="eyebrow">The studio edit</p>
        <h2 id="collection-list-title">Pieces to explore before you order.</h2>
        <p>Open a piece to see its price and details, then order it from the studio page.</p>
      </div>
      <div class="collection-grid">
{cards}      </div>
    </section>
    <section class="collection-next shell" aria-labelledby="collection-next-title">
      <p class="eyebrow">Keep exploring</p>
      <h2 id="collection-next-title">Find another way to make it personal.</h2>
      <p>Shipping is across India. Orders use protective packaging.</p>
      <div class="collection-actions">
{next_links}      </div>
    </section>
  </main>
{footer}</body>
</html>
"""


class CardParser(HTMLParser):
    """Reads one catalogue card: photo, alt text, name, description, price and size."""

    def __init__(self):
        super().__init__()
        self.image = {}
        self.name = ""
        self.paragraphs = []
        self.rows = {}
        self._tag = None
        self._row_label = None
        self._in_caption = False
        self._text = ""

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "img" and not self.image and attributes.get("src"):
            self.image = attributes
        elif tag == "figcaption":
            self._in_caption = True
        elif self._in_caption and tag in ("strong", "h3", "p", "dt", "dd"):
            if tag == "dd" and "product-regular-price" in (attributes.get("class") or ""):
                tag = "skip"
            self._tag, self._text = tag, ""

    def handle_data(self, data):
        if self._tag:
            self._text += data

    def handle_endtag(self, tag):
        if tag == "figcaption":
            self._in_caption = False
        if not self._tag or tag != {"skip": "dd"}.get(self._tag, self._tag):
            return
        text = " ".join(self._text.split())
        if self._tag in ("strong", "h3") and not self.name:
            self.name = text
        elif self._tag == "p" and text:
            self.paragraphs.append(text)
        elif self._tag == "dt":
            self._row_label = text.lower()
        elif self._tag == "dd" and self._row_label and text:
            self.rows.setdefault(self._row_label, text)
        self._tag = None


def parse_cards(page):
    """The catalogue cards in page order: name, photo, alt, srcset, section, price, size, description, and where they sit in the page."""
    cards = []
    for match in ARTICLE_RE.finditer(page):
        article = match.group(0)
        parser = CardParser()
        parser.feed(article)
        if not parser.image.get("src") or not parser.name:
            continue
        sections = SECTION_RE.findall(page[: match.start()])
        size = parser.rows.get("size", "")
        # The first plain paragraph is the card's line about the piece; the one with " · " lists what is included.
        lines = [line for line in parser.paragraphs if " · " not in line]
        cards.append({
            "name": parser.name,
            "file": re.sub(r"^assets/", "", re.split(r"[?#]", parser.image["src"])[0]),
            "alt": parser.image.get("alt", ""),
            "width": parser.image.get("width", ""),
            "height": parser.image.get("height", ""),
            "srcset": parser.image.get("srcset", ""),
            "section": sections[-1] if sections else "",
            "price": parser.rows.get("price", ""),
            "size": "" if NOT_A_SIZE_RE.search(size) else size,
            "line": lines[0] if lines else "",
            "start": match.start(),
            "end": match.end(),
        })
    return cards


def slugify(name):
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii").lower()
    text = text.replace("&", " and ").replace("'", "").replace("’", "")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


# A renamed product keeps its old slug, so its /p/ address and Google Merchant Center ID do not change.
KEEP_SLUGS = {
    "Blue and white Namokar (Navkar) mantra frame": "blue-and-white-namokar-mantra-frame",
    "White and gold Namokar (Navkar) mantra frame": "white-and-gold-namokar-mantra-frame",
    "Pearl white Namokar (Navkar) mantra frame": "pearl-white-namokar-mantra-frame",
    "Couple Name Keychain Pair": "two-keys-one-little-us",
    "Pressed Flower Bookmark Set": "save-our-page",
    "Couple Date Calendar Coaster": "our-date-every-day",
    "Rose Petal Resin Bracelet": "the-first-rose-still-with-me",
    "Heart Resin Trinket Tray": "tiny-tray-big-feelings",
    "Couple Initials Desk Stand": "your-initial-mine-ours",
    "Pressed Flower Name Pendant": "a-little-piece-of-our-season",
    "Ocean Memory Resin Tray": "our-place-held-in-waves",
    "Preserved Rose Hexagon Frame": "rose-hexagon",
    "Couple Photo Resin Clock": "personalized-photo-clock",
    "Preserved Red Rose Resin Display": "preserved-rose-display",
    "Lilac Pearl Rakhi": "lilac-symbol-medallion",
    "Little Brother Name Rakhi": "little-brother-keepsake",
    "Om Asiausa Mantra Resin Plaque": "om-asiausa-mantra-plaque",
    "Jain Mantra Door Strips, Rose Red": "rose-mantra-door-strips",
    "Lilac Resin Trinket Tray": "lilac-scalloped-tray",
    "Pressed Bouquet Square Resin Frame": "pressed-flower-square",
    "Pressed Flower Hexagon Frame": "lilac-flower-hexagon",
    "Pressed Flower Handled Tray": "handled-flower-tray",
    "Pressed Flower Arch Frame": "your-flowers-held-close",
    "Shoreline Resin Wall Clock": "a-little-blue-hour",
    "Personalised Floral Coaster Set": "little-messages-shared",
    "Blue Ocean Resin Wall Clock": "blue-hour-resin-clock",
    "Sage and Gold Resin Wall Clock": "sage-and-gold-resin-clock",
    "Lilac and Silver Resin Wall Clock": "lilac-and-silver-resin-clock",
    "Ivory Diamond Resin Wall Clock": "ivory-diamond-resin-clock",
    "Sky Blue Roman Resin Wall Clock": "sky-blue-roman-resin-clock",
    "Teal and Gold Roman Resin Wall Clock": "teal-and-gold-roman-resin-clock",
    "Pearl Geode Resin Wall Clock": "pearl-geode-resin-clock",
    "Personalised Message Coaster Set": "personalized-message-coasters",
    "Personalised Floral Hoop Frame": "a-tiny-beginning",
    "Sunflower Resin Night Lamp": "sunflower-resin-lamp",
    "Sunflower Resin Platter Set": "sunflower-floral-keepsakes",
    "Personalised Sunflower Name Plaque": "personalised-sunflower-plaque",
    "Sunflower Name Plaque, Close-up": "sunflower-plaque-in-hand",
    "Sunflower Tray, Keychain and Heart Set": "sunflower-keepsake-set",
    "Midnight Blue 3-Tier Resin Serving Set": "midnight-blue-tiered-set",
    "Ivory Gold 3-Tier Resin Serving Set": "ivory-gold-tiered-set",
    "Champagne 2-Tier Resin Cake Stand Set": "champagne-two-tier-set",
    "Turquoise Resin Tray with 4 Coasters": "turquoise-tray-and-coasters",
    "Smoky Bronze Resin Serving Tray": "smoky-bronze-handled-tray",
    "Geode Mug and Coaster Set of 6": "gemstone-mug-collection",
    "Pastel Butterfly Resin Trays, Set of 3": "pastel-butterfly-trays",
    "Champagne White Resin Serving Tray": "champagne-white-handled-tray",
    "Silver Icy Blue Resin Serving Tray": "silver-icy-blue-handled-tray",
    "Ocean Seashell Resin Serving Tray": "ocean-seashell-tray",
    "Turquoise Geode Wine Glass": "turquoise-geode-glass",
    "Turquoise Gold Wine Glasses, Pair": "turquoise-gold-wine-glasses",
    "Turquoise Geode Wine Glasses, Pair": "turquoise-geode-glass-pair",
    "Black Gold Resin Glassware Set": "black-gold-glassware-set",
    "Jewel Resin Tealight Holder": "jewel-glow-tealight",
    "Happy Diwali Resin Tealight Holder": "happy-diwali-glow",
    "Gold Fleck Lotus Tealight Holder": "gold-fleck-lotus-light",
    "Pastel Lotus Tealight Holder": "pastel-lotus-tealight",
    "Emerald Tealight Holder Pair": "emerald-glow-pair",
    "Marigold Tealight Holder": "marigold-petal-holder",
    "Ivory Mandala Tealight Holder": "ivory-mandala-holder",
    "Shubh Labh Door Hanging Pair": "shubh-labh-welcome-pair",
    "Labh Floral Door Hanging Pair": "labh-floral-hanging-pair",
}


def assign_slugs(cards):
    """One slug per card, in order. The first card with a slug keeps it; later ones add 4 letters from their photo file name."""
    slugs, seen = [], set()
    for card in cards:
        slug = KEEP_SLUGS.get(card["name"]) or slugify(card["name"])
        if slug in seen:
            slug += "-" + hashlib.sha1(card["file"].encode("utf-8")).hexdigest()[:4]
        if slug in seen:
            raise SystemExit("Cannot make a unique slug for " + card["name"])
        seen.add(slug)
        slugs.append(slug)
    return slugs


def description(card):
    facts = card["price"] + (" · " + card["size"] if card["size"] else "")
    return (facts + ". " + card["line"] if card["line"] else facts).strip()


def price_offer(price):
    """The schema.org offer for a card price, or None for "Price on request". Stops on any other format."""
    if price == "Price on request":
        return None
    match = PRICE_RE.fullmatch(price)
    if not match:
        raise SystemExit("Unknown price format %r: extend price_offer() in tools/product_pages.py" % price)
    low, high = (value.replace(",", "") if value else None for value in match.groups())
    if high is None:
        return {"@type": "Offer", "price": low, "priceCurrency": "INR"}
    if int(high) <= int(low):
        raise SystemExit("Unknown price format %r: extend price_offer() in tools/product_pages.py" % price)
    return {"@type": "AggregateOffer", "lowPrice": low, "highPrice": high, "priceCurrency": "INR"}


def product_json_ld(card):
    """Product structured data as a JSON string, or "" when the card has no price to state."""
    offer = price_offer(card["price"])
    if offer is None:
        return ""
    data = {"@context": "https://schema.org", "@type": "Product", "name": card["name"]}
    if card["line"]:
        data["description"] = card["line"]
    data["image"] = SITE + "/assets/" + urllib.parse.quote(card["file"])
    data["brand"] = {"@type": "Brand", "name": STUDIO}
    data["offers"] = offer
    return json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")


def breadcrumb_json_ld(card, slug, topic):
    """BreadcrumbList structured data as a JSON string; says the same as the visible path line."""
    trail = [("Home", SITE + "/")]
    if topic:
        trail.append((topic["link"], "%s/%s/" % (SITE, topic["slug"])))
    trail.append((card["name"], "%s/%s/%s/" % (SITE, PAGE_DIR, slug)))
    data = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [{"@type": "ListItem", "position": number, "name": name, "item": url} for number, (name, url) in enumerate(trail, 1)],
    }
    return json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")


STOP_WORDS = frozenset("""a an and the of for with in on to your you my our us it its this that is are be by from at as or into
one two three four every all so up resin illustrative preview""".split())
WORD_RE = re.compile(r"[a-z0-9]+")
SIMILAR_WORDS = 3
MORE_COUNT = 4
STUDIO_SECTION = "studio-art"


def words(card):
    """The words that describe a card: its name, line and photo text, lower case, without 1-letter and stop words."""
    text = " ".join((card.get("name", ""), card.get("line", ""), card.get("alt", ""))).lower()
    return {word for word in WORD_RE.findall(text) if len(word) > 1 and word not in STOP_WORDS}


def pick_more(cards, slugs, groups):
    """{slug: [(card, slug) x 4]}: each product's "More like this" list. groups maps a slug to its category group,
    a list of (card, slug) in order.
      1. Similar: others in the group that share 3 or more words, most shared first, then group order.
      2. Category: the rest of the group, after the product and wrapping round.
      3. Studio: cards of the "Fresh from the studio" section (studio-art), in page order.
    Then every product that no list holds is added to the list of the product before it in its group (the 4th pick is
    replaced), so every page is linked from another. Depends only on the card order, so a rerun gives the same lists."""
    by_slug = dict(zip(slugs, cards))
    keywords = {slug: words(card) for slug, card in by_slug.items()}
    studio = [(card, slug) for card, slug in zip(cards, slugs) if card["section"] == STUDIO_SECTION]
    picks = {}
    for slug in slugs:
        group = groups[slug]
        order = [other for _, other in group]
        at = order.index(slug)
        scored = [(-len(keywords[slug] & keywords[other]), place, other) for place, other in enumerate(order) if other != slug]
        chosen = [other for score, _, other in sorted(scored) if -score >= SIMILAR_WORDS][:MORE_COUNT]
        for other in order[at + 1:] + order[:at] + [other for _, other in studio]:
            if len(chosen) == MORE_COUNT:
                break
            if other != slug and other not in chosen:
                chosen.append(other)
        picks[slug] = chosen
    for _ in range(len(slugs) + 1):
        listed = {other for chosen in picks.values() for other in chosen}
        orphans = [slug for slug in slugs if slug not in listed]
        if not orphans:
            return {slug: [(by_slug[other], other) for other in chosen] for slug, chosen in picks.items()}
        fixed = False
        for slug in orphans:
            order = [other for _, other in groups[slug]]
            at = order.index(slug)
            for before in order[:at][::-1] + order[at + 1:][::-1]:
                if len(picks[before]) == MORE_COUNT and slug in [other for _, other in groups[before]] and slug not in picks[before]:
                    picks[before][MORE_COUNT - 1] = slug
                    fixed = True
                    break
        if not fixed:
            raise SystemExit("No page can link to %s in its More like this list: add products to its group or section" % ", ".join(orphans))
    raise SystemExit("More like this lists still leave pages with no link after %d passes: fix the cards" % (len(slugs) + 1))


def merchant_feed(cards, slugs):
    """The Google Merchant Center feed (tab-separated). AI preview photos and prices that are a range or on request stay out."""
    rows = [FEED_COLUMNS]
    for card, slug in zip(cards, slugs):
        offer = price_offer(card["price"])
        if card["alt"].startswith("Illustrative preview:") or not offer or offer["@type"] != "Offer":
            continue
        about = " ".join(part for part in (card["line"], "Size: %s." % card["size"] if card["size"] else "",
                                           "Handmade to order by Saloni in Ajmer, Rajasthan.") if part)
        rows.append([slug, card["name"], about, "%s/%s/%s/?source=google-shopping" % (SITE, PAGE_DIR, slug),
                     SITE + "/assets/" + urllib.parse.quote(card["file"]), "in_stock", offer["price"] + " INR", STUDIO, "new", "no"])
    for row in rows:
        if any(re.search(r'[\t\n\r"]', value) for value in row):
            raise SystemExit("A tab, line break or double quote would break %s: fix the card %r in index.html" % (FEED_FILE, row[1]))
    return "".join("\t".join(row) + "\n" for row in rows)


def esc(value):
    return html.escape(value, quote=True)


def jpeg_size(path):
    """(width, height) from the first start-of-frame header of a JPEG, baseline or progressive."""
    data = Path(path).read_bytes()
    index = 2
    while data[:2] == b"\xff\xd8" and index + 9 < len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        if data[index + 1] in (0xC0, 0xC1, 0xC2):
            return int.from_bytes(data[index + 7:index + 9], "big"), int.from_bytes(data[index + 5:index + 7], "big")
        index += 2 + int.from_bytes(data[index + 2:index + 4], "big")
    raise SystemExit("Not a JPEG: " + str(path))


def render_page(card, slug, share_size, topic, more, version):
    url = "%s/%s/%s/" % (SITE, PAGE_DIR, slug)
    target = "/?product=%s&add=1#%s" % (slug, card["section"])
    title = "%s | %s" % (card["name"], STUDIO)
    desc = description(card)
    image = "%s/assets/share/%s.jpg" % (SITE, slug)
    alt = card["alt"] or card["name"]
    data = product_json_ld(card)
    crumbs = breadcrumb_json_ld(card, slug, topic)
    path = '<li><a href="/">Home</a></li>'
    if topic:
        path += '<li><span aria-hidden="true">›</span><a href="/%s/">%s</a></li>' % (topic["slug"], esc(topic["link"]))
    path += '<li aria-current="page"><span aria-hidden="true">›</span>%s</li>' % esc(card["name"])
    more_html = ""
    if more:
        links = "".join(
            '<li><a href="/%s/%s/"><img src="/assets/thumb/%s.jpg" alt="" width="%d" height="%d" loading="lazy" decoding="async"><span>%s</span></a></li>'
            % (PAGE_DIR, other, other, THUMB_SIDE, THUMB_SIDE, esc(other_card["name"])) for other_card, other in more)
        more_html = '    <section class="more" aria-labelledby="more-title"><h2 id="more-title">More like this</h2><ul>%s</ul></section>\n' % links
    size = '  <meta property="og:image:width" content="%d">\n  <meta property="og:image:height" content="%d">\n' % share_size
    return """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#fbd3e5">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="{url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="{studio}">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{image}">
{size}  <meta property="og:image:alt" content="{alt}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{desc}">
  <meta name="twitter:image" content="{image}">
  <meta name="twitter:image:alt" content="{alt}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
{ld}  <link rel="stylesheet" href="/styles.css?v={version}">
  <style>{css}</style>
  <script src="/google.js?v={version}" defer></script>
</head>
<body class="collection-page">
  <a class="skip-link" href="#main-content">Skip to content</a>
{header}  <main class="product-detail" id="main-content" tabindex="-1">
    <nav class="path" aria-label="Breadcrumb"><ol>{path}</ol></nav>
    <img src="/assets/{file}" alt="{alt}"{dims} class="photo" fetchpriority="high">
    <h1>{name}</h1>
    <p class="price">{price}</p>
{size_line}{line_html}    <a class="order" href="{target}">Add to cart</a>
    <p class="delivery-note">Handmade in 4–5 days · delivered in 2–5 days after dispatch</p>
{more_html}  </main>
{footer}</body>
</html>
""".format(
        title=esc(title), desc=esc(desc), url=url, studio=esc(STUDIO), image=esc(image), size=size, alt=esc(alt),
        ld=("".join('  <script type="application/ld+json">%s</script>\n' % block for block in (data, crumbs) if block)), css=PAGE_CSS,
        path=path, more_html=more_html, version=version,
        header=TOPIC_HEADER.replace('href="../', 'href="/'), footer=TOPIC_FOOTER.replace('href="../', 'href="/').replace("{topic_links}", ""),
        target=esc(target), name=esc(card["name"]), file=esc(card["file"]), price=esc(card["price"]),
        size_line='    <p class="size">Size: %s</p>\n' % esc(card["size"]) if card["size"] else "",
        line_html='    <p>%s</p>\n' % esc(card["line"]) if card["line"] else "",
        dims=' width="%s" height="%s"' % (card["width"], card["height"]) if card["width"].isdigit() and card["height"].isdigit() else "",
    )


def topic_items(topic, cards, slugs):
    """(card, slug) pairs for one topic, in the topic's own order. Stops on any slug or section that does not match the home cards."""
    name = "Topic %s" % topic.get("slug")

    def fail(problem):
        raise SystemExit("%s: %s: fix TOPICS in tools/product_pages.py" % (name, problem))

    if ("products" in topic) == ("section" in topic):
        fail('needs exactly one of "products" or "section"')
    by_slug = dict(zip(slugs, cards))
    if "products" in topic:
        chosen = list(topic["products"])
        for slug in chosen:
            if slug not in by_slug:
                fail("unknown product slug %r" % slug)
            if chosen.count(slug) > 1:
                fail("product slug %r appears twice" % slug)
    else:
        chosen = [slug for card, slug in zip(cards, slugs) if card["section"] == topic["section"]]
        if len(chosen) < 3:
            fail("section %r has %d cards, need at least 3" % (topic["section"], len(chosen)))
    return [(by_slug[slug], slug) for slug in chosen]


def asset_version(index_html):
    """The ?v= number on the home page's stylesheet link: the topic pages use the same one."""
    match = VERSION_RE.search(index_html)
    if not match:
        raise SystemExit("No styles.css?v= link in index.html: topic pages need its version")
    return match.group(1)


def topic_json_ld(topic, items):
    """CollectionPage and ItemList structured data as a JSON string. Topic pages state no price, so no Product or Offer."""
    data = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": topic["title"],
        "url": "%s/%s/" % (SITE, topic["slug"]),
        "description": topic["description"],
        "isPartOf": {"@type": "WebSite", "name": STUDIO, "url": SITE + "/"},
        "mainEntity": {
            "@type": "ItemList",
            "itemListElement": [
                {"@type": "ListItem", "position": number, "name": card["name"], "url": "%s/%s/%s/" % (SITE, PAGE_DIR, slug)}
                for number, (card, slug) in enumerate(items, 1)
            ],
        },
    }
    return json.dumps(data, ensure_ascii=False, indent=2).replace("<", "\\u003c")


def card_kicker(card):
    return REFERENCE_KICKER if card["alt"].startswith("Illustrative preview:") else "Studio collection"


def render_topic_card(card, slug):
    alt = card["alt"] or card["name"]
    srcset = ""
    if card["srcset"]:
        urls = ", ".join("../" + part.strip() for part in card["srcset"].split(","))
        srcset = ' srcset="%s" sizes="%s"' % (esc(urls), CARD_SIZES)
    pad = " " * 10
    lines = [
        '<article class="collection-card">',
        "  <figure>",
        '    <img src="../assets/%s" alt="%s" width="%s" height="%s" loading="lazy" decoding="async"%s>' % (esc(card["file"]), esc(alt), esc(card["width"]), esc(card["height"]), srcset),
        "    <figcaption>",
        '      <p class="collection-card-kicker">%s</p>' % card_kicker(card),
        "      <h2>%s</h2>" % esc(card["name"]),
    ]
    if card["line"]:
        lines.append("      <p>%s</p>" % esc(card["line"]))
    if card["size"]:
        lines.append("      <p>Size: %s</p>" % esc(card["size"]))
    lines += [
        '      <a class="button button-line collection-card-link" href="../%s/%s/">View this piece and order <span aria-hidden="true">↗</span></a>' % (PAGE_DIR, slug),
        "    </figcaption>",
        "  </figure>",
        "</article>",
    ]
    return "".join(pad + line + "\n" for line in lines)


def render_topic(topic, items, version, share_size):
    first, first_slug = items[0]
    hero_alt = first["alt"] or first["name"]
    title = "%s | %s" % (topic["title"], STUDIO)
    topic_links = "".join('<a href="../%s/">%s</a>' % (other["slug"], esc(other["link"])) for other in TOPICS)
    next_links = "".join('        <a class="button button-line" href="../%s/">%s</a>\n' % (other["slug"], esc(other["link"])) for other in TOPICS if other is not topic)
    return TOPIC_PAGE.format(
        title=esc(title), desc=esc(topic["description"]), studio=esc(STUDIO), url="%s/%s/" % (SITE, topic["slug"]),
        image="%s/assets/share/%s.jpg" % (SITE, first_slug), image_width=share_size[0], image_height=share_size[1],
        hero_alt=esc(hero_alt), data=topic_json_ld(topic, items), version=version, header=TOPIC_HEADER,
        heading=esc(topic["heading"]), intro=esc(topic["intro"]), hero_file=esc(first["file"]),
        hero_width=esc(first["width"]), hero_height=esc(first["height"]), hero_kicker=card_kicker(first),
        cards="".join(render_topic_card(card, slug) for card, slug in items), next_links=next_links,
        footer=TOPIC_FOOTER.format(topic_links=topic_links),
    )


def stamp(page, cards, slugs, more, thumbs):
    """index.html with data-product-slug, data-more-like-this (the slugs of its "More like this" list, from more) and
    data-thumb (its thumbnail, from thumbs) on each card's photo link, replacing any older ones. The popup reads them from there."""
    pieces, last = [], 0
    for card, slug in zip(cards, slugs):
        article = page[card["start"]:card["end"]]
        trigger = TRIGGER_RE.search(article)
        if not trigger:
            raise SystemExit("No photo link in the card " + card["name"])
        tag = THUMB_ATTR_RE.sub("", MORE_ATTR_RE.sub("", SLUG_ATTR_RE.sub("", trigger.group(0))))
        related = " ".join(other for _, other in more.get(slug, []))
        attributes = ' data-product-slug="%s"' % slug + (' data-more-like-this="%s"' % related if related else "") + ' data-thumb="%s"' % thumbs[slug]
        tag = tag.replace(" data-lightbox-trigger", " data-lightbox-trigger" + attributes, 1)
        pieces.append(page[last:card["start"]] + article[:trigger.start()] + tag + article[trigger.end():])
        last = card["end"]
    return "".join(pieces) + page[last:]


def sitemap_with_products(sitemap, slugs):
    """The site's own URLs stay as they are; product pages follow them."""
    prefix = "%s/%s/" % (SITE, PAGE_DIR)
    own = [loc for loc in re.findall(r"<loc>([^<]+)</loc>", sitemap) if not loc.startswith(prefix)]
    urls = own + [prefix + slug + "/" for slug in slugs]
    body = "".join("  <url>\n    <loc>%s</loc>\n  </url>\n" % loc for loc in urls)
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + "</urlset>\n"


def share_size(root, slug):
    path = Path(root) / "assets" / "share" / (slug + ".jpg")
    if not path.is_file():
        raise SystemExit("Missing %s: run tools/share_images.py first" % path.relative_to(root))
    return jpeg_size(path)


def thumb(root, slug):
    """The thumbnail's path under the site root, e.g. assets/thumb/<slug>.jpg. Stops if it is missing or not 300x300."""
    relative = "assets/thumb/%s.jpg" % slug
    path = Path(root) / relative
    if not path.is_file() or jpeg_size(path) != (THUMB_SIDE, THUMB_SIDE):
        raise SystemExit("Missing or not %dx%d: %s: run tools/share_images.py first" % (THUMB_SIDE, THUMB_SIDE, relative))
    return relative


def build(index_html, sitemap, root=ROOT):
    """(index.html with slugs, {relative path: page}, sitemap.xml): a page per card in index_html and one per topic in TOPICS."""
    cards = parse_cards(index_html)
    slugs = assign_slugs(cards)
    version = asset_version(index_html)
    seen = {PAGE_DIR}
    topic_pages = []
    # Topic checks run first, so a bad topic stops the script before anything is rendered or written.
    for topic in TOPICS:
        if topic.get("slug") in seen:
            raise SystemExit("Topic %s repeats a folder name or equals %r: fix TOPICS in tools/product_pages.py" % (topic.get("slug"), PAGE_DIR))
        seen.add(topic.get("slug"))
        topic_pages.append((topic, topic_items(topic, cards, slugs)))
    # Each product's path and "More like this" group: the first topic that holds it, else the cards of its home
    # section that no topic holds (cards a topic holds link within their topic, so counting them here would leave
    # some pages with no link pointing at them).
    placed = {}
    for topic, items in reversed(topic_pages):
        for _, slug in items:
            placed[slug] = (topic, items)
    sections = {}
    for card, slug in zip(cards, slugs):
        if slug not in placed:
            sections.setdefault(card["section"], []).append((card, slug))
    thumbs = {slug: thumb(root, slug) for slug in slugs}
    pages = {}
    topics, groups = {}, {}
    for card, slug in zip(cards, slugs):
        topics[slug], groups[slug] = placed[slug] if slug in placed else (None, sections[card["section"]])
    more = pick_more(cards, slugs, groups)
    for card, slug in zip(cards, slugs):
        pages["%s/%s/index.html" % (PAGE_DIR, slug)] = render_page(card, slug, share_size(root, slug), topics[slug], more[slug], version)
    for topic, items in topic_pages:
        pages[topic["slug"] + "/index.html"] = render_topic(topic, items, version, share_size(root, items[0][1]))
    return stamp(index_html, cards, slugs, more, thumbs), pages, sitemap_with_products(sitemap, slugs)


def corporate_collection(page, cards, slugs, root=ROOT):
    """page (corporate-gifting/index.html) with the text between its corporate-collection markers replaced by a tile for each corporate card."""
    if page.count(CORPORATE_START) != 1 or page.count(CORPORATE_END) != 1 or page.index(CORPORATE_START) > page.index(CORPORATE_END):
        raise SystemExit("%s needs one %s then one %s" % (CORPORATE_PAGE, CORPORATE_START, CORPORATE_END))
    chosen = [(card, slug) for card, slug in zip(cards, slugs) if card["section"] == CORPORATE_SECTION]
    if not chosen:
        raise SystemExit("No catalogue cards in the %s section of index.html" % CORPORATE_SECTION)
    tiles = ""
    for card, slug in chosen:
        price = card["price"]
        if price != "Price on request":
            match = PRICE_RE.fullmatch(price)
            if not match:
                raise SystemExit("Unknown price format %r: extend corporate_collection() in tools/product_pages.py" % price)
            price = "From ₹" + match.group(1)
        tiles += ('        <div role="listitem"><a class="lightbox-more-item" href="../?product=%s#%s"><img src="../%s" alt="%s" width="%d" height="%d" loading="lazy" decoding="async"><span>%s</span><span>%s</span></a></div>\n'
                  % (slug, CORPORATE_SECTION, thumb(root, slug), esc(card["alt"] or card["name"]), THUMB_SIDE, THUMB_SIDE, esc(card["name"]), esc(price)))
    block = (
        '\n    <section class="corporate-offering corporate-collection shell" id="collection" aria-labelledby="collection-title">\n'
        '      <div><p class="eyebrow">Corporate gift collection</p><h2 id="collection-title">Pieces to start from.</h2>'
        '</div>\n'
        '      <div class="catalogue-grid" role="list" aria-label="Corporate gift collection">\n' + tiles +
        '      </div>\n    </section>\n    ')
    head, rest = page.split(CORPORATE_START)
    return head + CORPORATE_START + block + CORPORATE_END + rest.split(CORPORATE_END, 1)[1]


def remove_stale_pages(root, keep):
    for folder in (Path(root) / PAGE_DIR).glob("*/"):
        relative = "%s/%s/index.html" % (PAGE_DIR, folder.name)
        if folder.is_dir() and relative not in keep:
            shutil.rmtree(folder)


def main():
    index_path, sitemap_path = ROOT / "index.html", ROOT / "sitemap.xml"
    stamped, pages, sitemap = build(index_path.read_text(encoding="utf-8"), sitemap_path.read_text(encoding="utf-8"))
    remove_stale_pages(ROOT, set(pages))
    for relative, content in pages.items():
        target = ROOT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    index_path.write_text(stamped, encoding="utf-8")
    sitemap_path.write_text(sitemap, encoding="utf-8")
    cards = parse_cards(stamped)
    slugs = assign_slugs(cards)
    (ROOT / FEED_FILE).write_text(merchant_feed(cards, slugs), encoding="utf-8")
    corporate_path = ROOT / CORPORATE_PAGE
    corporate_path.write_text(corporate_collection(corporate_path.read_text(encoding="utf-8"), cards, slugs), encoding="utf-8")
    topic_count = len(TOPICS)
    print("Wrote %d product pages in %s/, %d topic pages, stamped index.html and updated sitemap.xml." % (len(pages) - topic_count, PAGE_DIR, topic_count))


if __name__ == "__main__":
    sys.exit(main())
