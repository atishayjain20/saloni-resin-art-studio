#!/usr/bin/env python3
"""Write one static share page per catalogue product (standard library only).

    python3 tools/product_pages.py

Run it from anywhere after adding, renaming or removing a catalogue card in index.html.
Link previews (WhatsApp, Facebook, X) come from crawlers that run no JavaScript, so each
product gets p/<slug>/index.html with its own Open Graph tags. Visitors are sent on to
/?product=<slug>#<section> where script.js opens that product's popup.

It also:
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


def esc(value):
    return html.escape(value, quote=True)


def render_page(card, slug):
    url = "%s/%s/%s/" % (SITE, PAGE_DIR, slug)
    target = "/?product=%s#%s" % (slug, card["section"])
    title = "%s | %s" % (card["name"], STUDIO)
    desc = description(card)
    image = "%s/assets/%s" % (SITE, card["file"])
    alt = card["alt"] or card["name"]
    size = ""
    if card["width"].isdigit() and card["height"].isdigit():
        size = '  <meta property="og:image:width" content="%s">\n  <meta property="og:image:height" content="%s">\n' % (card["width"], card["height"])
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
  <style>body{{margin:0;padding:2rem 1rem;background:#fff6e9;color:#3a2a25;font:1rem/1.5 system-ui,sans-serif;text-align:center}}main{{max-width:28rem;margin:0 auto}}img{{max-width:100%;height:auto;border-radius:.75rem}}a{{color:#9b2c5c;font-weight:700}}</style>
</head>
<body>
  <script>location.replace({redirect});</script>
  <main>
    <h1>{name}</h1>
    <p>{desc}</p>
    <p><a href="{target}">See {name} on the {studio} home page</a></p>
    <noscript><p>JavaScript is off, so use this link: <a href="{target}">open {name} on the home page</a>.</p></noscript>
    <img src="/assets/{file}" alt="{alt}"{dims}>
  </main>
</body>
</html>
""".format(
        title=esc(title), desc=esc(desc), url=url, studio=esc(STUDIO), image=esc(image), size=size, alt=esc(alt),
        redirect=json.dumps(target), target=esc(target), name=esc(card["name"]), file=esc(card["file"]),
        dims=' width="%s" height="%s"' % (card["width"], card["height"]) if size else "",
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


def build(index_html, sitemap):
    """(index.html with slugs, {relative path: page}, sitemap.xml) for the cards in index_html."""
    cards = parse_cards(index_html)
    slugs = assign_slugs(cards)
    pages = {"%s/%s/index.html" % (PAGE_DIR, slug): render_page(card, slug) for card, slug in zip(cards, slugs)}
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
