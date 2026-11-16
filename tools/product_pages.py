#!/usr/bin/env python3
"""Write one static share page per catalogue product (standard library only).

    python3 tools/product_pages.py

Run it from anywhere after adding, renaming or removing a catalogue card in index.html
(run tools/share_images.py first: it makes the preview JPEGs this script points to).
Each product gets p/<slug>/index.html: a small real product page (photo, name, price, size,
description line) with its own Open Graph tags for link previews (WhatsApp, Facebook and X read
them without running JavaScript) and Product structured data (JSON-LD) so Google can show the
price and photo. Products priced "Price on request" get no structured data. The "View and order"
button opens /?product=<slug>#<section>, where script.js opens that product's popup. A price in a
new format stops this script until price_offer() learns it.

It also:
  * points og:image at assets/share/<slug>.jpg and reads its width and height from the JPEG,
  * stamps data-product-slug on each card's photo link in index.html (script.js reads it),
  * rewrites sitemap.xml so it lists every product page after the site's own pages,
  * deletes p/<slug>/ folders of products that no longer exist.

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

ARTICLE_RE = re.compile(r'<article\b[^>]*\bclass="[^"]*\b(?:work-card|romantic-keepsake-card)\b[^"]*"[^>]*>.*?</article>', re.S)
TRIGGER_RE = re.compile(r'<a class="lightbox-trigger" data-lightbox-trigger\b[^>]*>')
SECTION_RE = re.compile(r'<section\b[^>]*\bid="([^"]+)"')
SLUG_ATTR_RE = re.compile(r' data-product-slug="[^"]*"')
AMOUNT = r"([1-9][0-9]{0,2}(?:,[0-9]{2,3})*)"
PRICE_RE = re.compile("₹" + AMOUNT + "(?:–₹" + AMOUNT + ")?")
PAGE_CSS = ('*{box-sizing:border-box}body{margin:0;background:#ffeaf2;color:#2a0e1f;font:1rem/1.5 "Helvetica Neue",Helvetica,Arial,sans-serif}'
            'header,main{max-width:30rem;margin:0 auto;padding:0 1rem}header a{display:inline-flex;align-items:center;min-height:2.75rem;color:#8f0d49;font-weight:700;text-decoration:none}'
            'img{display:block;width:auto;max-width:100%;height:auto;max-height:55vh;margin:0 auto;border-radius:.75rem;background:#fff}'
            'h1{margin:1rem 0 .25rem;font:500 1.75rem/1.15 Georgia,"Times New Roman",serif}'
            '.price{display:inline-block;margin:.25rem 0;padding:.2rem .6rem;border-radius:999px;background:#f2a007;font-size:1.15rem;font-weight:700}'
            '.size{margin:.25rem 0;color:#6a4a5b}'
            '.order{display:flex;align-items:center;justify-content:center;min-height:3rem;margin:1.25rem 0 2rem;padding:.75rem 1rem;border-radius:999px;background:#b0125b;color:#fff;font-weight:700;text-decoration:none}'
            'a:focus-visible{outline:3px solid #b0125b;outline-offset:4px}')
# Sizes the popup also hides: they are not a real size yet.
NOT_A_SIZE_RE = re.compile(r"suggested size|confirm with saloni|custom size in inches|component size to confirm", re.I)


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
    """The catalogue cards in page order: name, photo, alt, section, price, size, description, and where they sit in the page."""
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


def assign_slugs(cards):
    """One slug per card, in order. The first card with a slug keeps it; later ones add 4 letters from their photo file name."""
    slugs, seen = [], set()
    for card in cards:
        slug = slugify(card["name"])
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


def render_page(card, slug, share_size):
    url = "%s/%s/%s/" % (SITE, PAGE_DIR, slug)
    target = "/?product=%s#%s" % (slug, card["section"])
    title = "%s | %s" % (card["name"], STUDIO)
    desc = description(card)
    image = "%s/assets/share/%s.jpg" % (SITE, slug)
    alt = card["alt"] or card["name"]
    data = product_json_ld(card)
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
{ld}  <style>{css}</style>
</head>
<body>
  <header><a href="/">{studio}</a></header>
  <main>
    <img src="/assets/{file}" alt="{alt}"{dims} fetchpriority="high">
    <h1>{name}</h1>
    <p class="price">{price}</p>
{size_line}{line_html}    <a class="order" href="{target}">View and order</a>
  </main>
</body>
</html>
""".format(
        title=esc(title), desc=esc(desc), url=url, studio=esc(STUDIO), image=esc(image), size=size, alt=esc(alt),
        ld='  <script type="application/ld+json">%s</script>\n' % data if data else "", css=PAGE_CSS,
        target=esc(target), name=esc(card["name"]), file=esc(card["file"]), price=esc(card["price"]),
        size_line='    <p class="size">Size: %s</p>\n' % esc(card["size"]) if card["size"] else "",
        line_html='    <p>%s</p>\n' % esc(card["line"]) if card["line"] else "",
        dims=' width="%s" height="%s"' % (card["width"], card["height"]) if card["width"].isdigit() and card["height"].isdigit() else "",
    )


def stamp(page, cards, slugs):
    """index.html with data-product-slug on each card's photo link, replacing any older one."""
    pieces, last = [], 0
    for card, slug in zip(cards, slugs):
        article = page[card["start"]:card["end"]]
        trigger = TRIGGER_RE.search(article)
        if not trigger:
            raise SystemExit("No photo link in the card " + card["name"])
        tag = SLUG_ATTR_RE.sub("", trigger.group(0))
        tag = tag.replace(" data-lightbox-trigger", ' data-lightbox-trigger data-product-slug="%s"' % slug, 1)
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


def build(index_html, sitemap, root=ROOT):
    """(index.html with slugs, {relative path: page}, sitemap.xml) for the cards in index_html."""
    cards = parse_cards(index_html)
    slugs = assign_slugs(cards)
    pages = {"%s/%s/index.html" % (PAGE_DIR, slug): render_page(card, slug, share_size(root, slug)) for card, slug in zip(cards, slugs)}
    return stamp(index_html, cards, slugs), pages, sitemap_with_products(sitemap, slugs)


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
    print("Wrote %d product pages in %s/, stamped index.html and updated sitemap.xml." % (len(pages), PAGE_DIR))


if __name__ == "__main__":
    sys.exit(main())
