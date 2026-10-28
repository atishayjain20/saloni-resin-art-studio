from html.parser import HTMLParser
import math
from pathlib import Path
import json
import re
import unittest
import xml.etree.ElementTree as ET


def webp_dimensions(path):
    """Read dimensions from a lossless/lossy WebP header without dependencies."""
    data = path.read_bytes()
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise AssertionError(f"Not a WebP file: {path}")
    chunk = data[12:16]
    if chunk == b"VP8X":
        return (1 + int.from_bytes(data[24:27], "little"), 1 + int.from_bytes(data[27:30], "little"))
    if chunk == b"VP8 ":
        start = data.find(b"\x9d\x01\x2a")
        if start < 0:
            raise AssertionError(f"Missing VP8 frame header: {path}")
        return (int.from_bytes(data[start + 3:start + 5], "little") & 0x3fff, int.from_bytes(data[start + 5:start + 7], "little") & 0x3fff)
    if chunk == b"VP8L" and data[20] == 0x2f:
        bits = int.from_bytes(data[21:25], "little")
        return ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
    raise AssertionError(f"Unsupported WebP header: {path}")


class MarkupTreeParser(HTMLParser):
    VOID_ELEMENTS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__()
        self.roots = []
        self.stack = []

    def handle_starttag(self, tag, attrs):
        node = {"tag": tag, "attrs": dict(attrs), "children": []}
        if self.stack:
            self.stack[-1]["children"].append(node)
        else:
            self.roots.append(node)
        if tag not in self.VOID_ELEMENTS:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index]["tag"] == tag:
                del self.stack[index:]
                return


def find_nodes(node, attr):
    matches = [node] if attr in node["attrs"] else []
    for child in node["children"]:
        matches.extend(find_nodes(child, attr))
    return matches

ROOT = Path(__file__).resolve().parents[1]

FINAL_QUOTE_NOTE = "Final quote after size, materials and delivery. Saloni first confirms whether she can make it, then confirms materials, final design, price, and delivery."

ROMANTIC_CONCEPTS = (
    ("romantic-us-keychain-pair.webp", "Two keys, one little us", "Made to travel together, even when you cannot.", "599", "399", 33),
    ("romantic-floral-bookmark-set.webp", "Save our page", "Three little places to keep the chapters that feel like yours.", "999", "699", 30),
    ("romantic-calendar-coaster.webp", "Our date, every day", "The day everything changed, circled for every ordinary morning after.", "1,199", "899", 25),
    ("romantic-first-rose-bracelet.webp", "The first rose, still with me", "One petal from the beginning, made wearable.", "899", "599", 33),
    ("romantic-heart-trinket-tray.webp", "Tiny tray, big feelings", "A soft place for rings, earbuds, and the little things you share.", "499", "349", 30),
    ("romantic-initial-desk-stand.webp", "Your initial. Mine. Ours.", "Two letters, one small corner that belongs to both of you.", "999", "699", 30),
    ("romantic-botanical-pendant.webp", "A little piece of our season", "Pressed flowers and a name, kept close.", "599", "399", 33),
    ("romantic-ocean-memory-tray.webp", "Our place, held in waves", "For the beach, trip, or city that became part of your story.", "1,799", "1,299", 28),
    ("romantic-couple-scene.webp", "Our favourite little scene", "A tiny version of the everyday moment you would replay.", "999", "699", 30),
    ("romantic-couple-miniature.webp", "Your story, in 3D", "Two people, one meaningful detail, made into a shelf-sized memory.", "2,499", "1,999", 20),
)

DIWALI_NEW_CONCEPTS = (
    ("diwali-marigold-petal-holder", "diwali-marigold-petal-holder-concept.webp", "Marigold Petal Holder", "349", "249", 29, "one LED tealight holder · LED not included", "A warm marigold-inspired cup for a soft festive glow."),
    ("diwali-ivory-mandala-holder", "diwali-ivory-mandala-holder-concept.webp", "Ivory Mandala Holder", "399", "299", 25, "one LED tealight holder · LED not included", "An ivory mandala cup with a calm, hand-finished festive feel."),
    ("diwali-ruby-leaf-dish", "diwali-ruby-leaf-dish-concept.webp", "Ruby Leaf Dish", "999", "799", 20, "one decorative dish", "A ruby-red leaf dish for a small festive offering or accent."),
    ("diwali-saffron-tilak-duo", "diwali-saffron-tilak-duo-concept.webp", "Saffron Tilak Duo", "449", "349", 22, "two mini dishes", "Two saffron-toned mini dishes for tilak and rice."),
    ("diwali-pearl-rangoli-accent", "diwali-pearl-rangoli-accent-concept.webp", "Pearl Rangoli Accent", "499", "399", 20, "one decorative accent", "A pearly rangoli-inspired accent for an entryway or prayer corner."),
    ("diwali-emerald-led-holder-pair", "diwali-emerald-led-holder-pair-concept.webp", "Emerald Glow Pair", "999", "799", 20, "pair of LED tealight holders · LEDs not included", "A pair of emerald cups for a jewel-toned LED-lit arrangement."),
    ("diwali-rose-petal-offering-plate", "diwali-rose-petal-offering-plate-concept.webp", "Rose Petal Offering Plate", "599", "449", 25, "one decorative ritual plate", "A rosy ritual plate with a gentle petal-inspired edge."),
    ("diwali-golden-toran-charms", "diwali-golden-toran-charms-concept.webp", "Golden Toran Charms", "599", "449", 25, "set of three hanging charms with cords", "Three golden hanging charms to style a festive doorway or wall."),
    ("diwali-lotus-rangoli-duo", "diwali-lotus-rangoli-duo-concept.webp", "Lotus Rangoli Duo", "499", "399", 20, "set of two decorative lotus pieces", "Two lotus pieces for a small layered rangoli arrangement."),
    ("diwali-festive-keepsake-box", "diwali-festive-keepsake-box-concept.webp", "Festive Keepsake Box", "849", "649", 24, "one small lidded box · contents not included", "A small lidded box for a keepsake, note, or festive token."),
)

CORPORATE_RESIN_GIFTS = (
    ("corporate-logo-keychain", "corporate-logo-keychain-concept.webp", "Logo resin keychain", "299", "199", 33, "Price for one piece.", "Clear resin with a name/initial and subtle brand-colour accents."),
    ("corporate-floral-bookmark", "corporate-floral-bookmark-concept.webp", "Pressed-flower bookmark", "249", "149", 40, "Price for one piece.", "A slim resin bookmark for welcome kits or thoughtful team gifts."),
    ("corporate-logo-paperweight", "corporate-logo-paperweight-concept.webp", "Logo paperweight", "499", "399", 20, "Price for one piece.", "A polished desk keepsake with a logo or short message sealed inside."),
    ("corporate-desk-nameplate", "corporate-desk-nameplate-concept.webp", "Resin desk nameplate", "999", "799", 20, "Price for one piece.", "Personalised with a name, designation and brand colours."),
    ("corporate-logo-coaster-set", "corporate-logo-coaster-set-concept.webp", "Branded coaster set", "999", "749", 25, "Price for a set of four.", "Four coordinated coasters for desks, meeting rooms or client kits."),
    ("corporate-fridge-magnet", "corporate-fridge-magnet-concept.webp", "Resin fridge magnet", "249", "179", 28, "Price for one piece.", "A compact branded keepsake for events and team celebrations."),
    ("corporate-desk-logo-stand", "corporate-desk-logo-stand-concept.webp", "Mini resin desk stand", "249", "179", 28, "Price for one piece.", "A small decorative resin stand for desks, reception counters or car dashboards."),
    ("corporate-recognition-award", "corporate-recognition-award-concept.webp", "Recognition resin award", "1,299", "899", 31, "Price for one piece.", "A modern personalised memento for milestones and appreciation."),
    ("corporate-desk-organizer", "corporate-desk-organizer-concept.webp", "Resin desk organiser", "1,299", "999", 23, "Price for one piece.", "A compact pen and visiting-card holder with custom colours."),
    ("corporate-festive-hamper", "corporate-festive-hamper-concept.webp", "Corporate festive hamper", "1,999", "1,499", 25, "Price for one gift set.", "A coordinated resin gift box for festive or thank-you occasions."),
    ("corporate-business-card-holder", "corporate-business-card-holder-concept.webp", "Resin Business Card Holder", "599", "449", 25, "Price for one card holder; cards not included.", "A compact resin holder for a tidy stack of visiting cards."),
    ("corporate-phone-rest", "corporate-phone-rest-concept.webp", "Resin Phone Rest", "699", "499", 29, "Price for one phone rest; phone not included.", "A steady resin rest for a phone on a desk or bedside table."),
    ("corporate-pen-cup", "corporate-pen-cup-concept.webp", "Resin Pen Cup", "899", "699", 22, "Price for one pen cup; stationery not included.", "A polished pen cup with a clean, colourful resin finish."),
    ("corporate-desk-trinket-tray", "corporate-desk-trinket-tray-concept.webp", "Desk Trinket Tray", "599", "449", 25, "Price for one tray; contents not included.", "A small catch-all tray for a desk, console, or bedside table."),
    ("corporate-lanyard-charm", "corporate-lanyard-charm-concept.webp", "Personalised Lanyard Charm", "299", "199", 33, "Price for one charm with clasp; lanyard not included.", "A personalised charm that clips onto a lanyard or bag."),
    ("corporate-mini-photo-stand", "corporate-mini-photo-stand-concept.webp", "Mini Photo Stand", "399", "299", 25, "Price for one base with metal clip; print not included.", "A compact photo stand for a desk memory or team note."),
    ("corporate-bag-tag", "corporate-bag-tag-concept.webp", "Personalised Bag Tag", "399", "299", 25, "Price for one tag with strap.", "A personalised resin tag with a simple strap for a bag or case."),
    ("corporate-desk-clock", "corporate-desk-clock-concept.webp", "Mini Resin Desk Clock", "1,299", "999", 23, "Price for one clock with stand; battery not included.", "A small resin clock to add a considered accent to a work desk."),
    ("corporate-bookmark-keychain-duo", "corporate-bookmark-keychain-duo-concept.webp", "Welcome Keepsake Duo", "599", "449", 25, "Price for a two-piece set.", "A bookmark and keychain duo for a useful welcome keepsake."),
    ("corporate-desk-essentials-set", "corporate-desk-essentials-set-concept.webp", "Desk Essentials Set", "1,499", "1,199", 20, "Price for one pen cup and one trinket tray.", "A coordinated pen cup and trinket tray for a complete desk set."),
)


class StaticSiteContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html_path = ROOT / "index.html"
        cls.html = cls.html_path.read_text(encoding="utf-8") if cls.html_path.exists() else ""

    def test_page_has_required_sections_and_accessibility_hooks(self):
        required_ids = [
            "main-content", "hero", "diwali", "offerings", "studio-art", "hamper-rail",
            "testimonials", "order", "footer",
        ]
        for section_id in required_ids:
            with self.subTest(section_id=section_id):
                self.assertRegex(self.html, rf'id=["\']{section_id}["\']')
        self.assertIn('href="#main-content"', self.html)
        self.assertIn('aria-label="Previous', self.html)
        self.assertIn('aria-label="Next', self.html)
        self.assertIn('class="site-script"', self.html)

    def test_diwali_collection_contract(self):
        assets = [
            "diwali-jewel-glow-tealight.jpg",
            "diwali-happy-diwali-glow.webp",
            "diwali-shubh-labh-welcome-pair.jpg",
            "diwali-festive-welcome-hamper.jpeg",
            "diwali-rose-gold-festive-set.jpeg",
            "diwali-lotus-blue-festive-set.jpeg",
            "diwali-gold-fleck-lotus-light.jpeg",
            "diwali-pastel-lotus-tealight.jpeg",
            "diwali-ocean-bloom-pooja-platter.jpg",
            "diwali-golden-ganesha-pooja-plate.jpg",
            "diwali-om-mini-tilak-plate.webp",
            "diwali-lotus-diya-pair.webp",
            "diwali-peacock-mini-pooja-thali.webp",
            "diwali-floral-swastik-tealight-set.webp",
        ]
        section = re.search(r'<section\b[^>]*id=["\']diwali["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        section_html = section.group(0)
        hero_start = self.html.index('<section class="hero shell"')
        hero_end = self.html.index('</section>', hero_start) + len('</section>')
        diwali_start = self.html.index(section_html)
        self.assertLess(hero_end, diwali_start)
        self.assertNotIn('id="offerings"', self.html[hero_end:diwali_start])
        self.assertLess(diwali_start, self.html.index('<section class="intro-band shell reveal"'))
        self.assertRegex(self.html, r'<a href="#diwali"(?: data-category-shortcut="diwali")?>Browse Diwali designs')
        self.assertIn('<h2 id="diwali-title">Little lights. Lovely beginnings.</h2>', section_html)
        self.assertIn("Diwali prices ₹249–₹1,799", section_html)
        self.assertIn("Some catalogue images are illustrative or reference ideas.", self.html)
        self.assertIn('id="diwali-grid"', section_html)
        self.assertIn('class="catalogue-grid"', section_html)
        self.assertIn('role="list"', section_html)
        self.assertIn('aria-label="Diwali designs"', section_html)
        self.assertIn('aria-controls="diwali-grid"', section_html)
        self.assertIn('data-catalogue-disclosure', section_html)
        self.assertIn('aria-expanded="false"', section_html)
        all_cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*work-card[^"\']*["\'][\s\S]*?</article>', section_html)
        self.assertEqual(len(all_cards), 24)
        cards = all_cards[:14]
        self.assertEqual(section_html.count('data-lightbox-trigger'), 24)
        self.assertEqual(section_html.count('class="product-pricing"'), 24)
        card_ids = [re.search(r'id=["\']([^"\']+)["\']', card).group(1) for card in cards]
        self.assertEqual(
            card_ids[-5:],
            [
                "diwali-ganesha-plate",
                "diwali-om-mini-tilak-plate",
                "diwali-lotus-diya-pair",
                "diwali-peacock-mini-pooja-thali",
                "diwali-floral-swastik-tealight-set",
            ],
        )
        self.assertNotIn('data-order-prefill="catalogue"', section_html)
        reference_notes = {
            "diwali-jewel-glow-tealight.jpg": "Price is shown per holder.",
            "diwali-happy-diwali-glow.webp": "Price varies by size.",
            "diwali-shubh-labh-welcome-pair.jpg": "Price is shown for the pair.",
            "diwali-festive-welcome-hamper.jpeg": "Contents are confirmed before ordering.",
            "diwali-rose-gold-festive-set.jpeg": "Contents are confirmed before ordering.",
            "diwali-lotus-blue-festive-set.jpeg": "Contents are confirmed before ordering.",
            "diwali-gold-fleck-lotus-light.jpeg": "Price is shown per holder.",
            "diwali-pastel-lotus-tealight.jpeg": "Price is shown per holder.",
            "diwali-ocean-bloom-pooja-platter.jpg": "Price is shown per platter.",
            "diwali-golden-ganesha-pooja-plate.jpg": "Price is shown per plate.",
            "diwali-om-mini-tilak-plate.webp": "Price is shown per plate.",
            "diwali-lotus-diya-pair.webp": "Price is shown for the pair.",
            "diwali-peacock-mini-pooja-thali.webp": "Price is shown per thali.",
            "diwali-floral-swastik-tealight-set.webp": "Price is shown for the three-piece set.",
        }
        price_matrix = {
            "Jewel Glow Tealight": ("349", "249", "29"),
            "Shubh Labh Welcome Pair": ("499", "399", "20"),
            "Festive Welcome Hamper": ("549", "399", "27"),
            "Rose &amp; Gold Festive Set": ("1,099", "849", "23"),
            "Lotus Blue Festive Set": ("1,199", "899", "25"),
            "Gold-Fleck Lotus Light": ("399", "299", "25"),
            "Pastel Lotus Tealight": ("349", "249", "29"),
            "Ocean Bloom Pooja Platter": ("2,399", "1,799", "25"),
            "Golden Ganesha Pooja Plate": ("499", "349", "30"),
            "Om Mini Tilak Plate": ("349", "249", "29"),
            "Lotus Diya Pair": ("449", "349", "22"),
            "Peacock Mini Pooja Thali": ("599", "449", "25"),
            "Floral Swastik Tealight Set": ("499", "399", "20"),
        }
        for asset in assets:
            with self.subTest(asset=asset):
                self.assertEqual(section_html.count(f'src="assets/{asset}"'), 1)
                self.assertTrue((ROOT / "assets" / asset).is_file())
                card = next((card for card in cards if f'assets/{asset}' in card), None)
                self.assertIsNotNone(card)
                image = re.search(r'<img\b[^>]*>', card).group(0)
                self.assertRegex(image, r'\balt=["\'][^"\']{9,}["\']')
                self.assertIn('loading="lazy"', image)
                self.assertIn('decoding="async"', image)
                self.assertRegex(image, r'\bwidth=["\']\d+["\']')
                self.assertRegex(image, r'\bheight=["\']\d+["\']')
                trigger = re.search(r'<a\b[^>]*data-lightbox-trigger[^>]*href=["\']assets/' + re.escape(asset) + r'["\'][\s\S]*?</a>', card)
                self.assertIsNotNone(trigger)
                self.assertRegex(trigger.group(0), r'aria-label=["\']Open larger view: [^"\']+["\']')
                self.assertEqual(card.count('class="diwali-card-note"'), 1)
                self.assertIn(reference_notes[asset], card)
                self.assertNotIn("Reference design", card)
                if asset in {
                    "diwali-om-mini-tilak-plate.webp",
                    "diwali-lotus-diya-pair.webp",
                    "diwali-peacock-mini-pooja-thali.webp",
                    "diwali-floral-swastik-tealight-set.webp",
                }:
                    self.assertRegex(image, r'\balt=["\']Illustrative preview: [^"\']+["\']')
                    self.assertNotIn("Concept preview · made to order", card)
        for title, (regular, festive, discount) in price_matrix.items():
            with self.subTest(title=title):
                card = next((card for card in cards if f">{title}</strong>" in card), None)
                self.assertIsNotNone(card)
                pricing = re.search(r'<dl\b[^>]*class=["\'][^"\']*product-pricing[^"\']*["\'][\s\S]*?</dl>', card).group(0)
                self.assertRegex(pricing, rf'<dt[^>]*>(?:Price|From)</dt>\s*<dd[^>]*>₹{festive}</dd>')
                self.assertIn(pricing.count("<dt"), (1, 2))
        happy_diwali_card = re.search(r'<article\b[^>]*id=["\']diwali-happy-glow["\'][\s\S]*?</article>', section_html)
        self.assertIsNotNone(happy_diwali_card)
        happy_diwali_pricing = re.search(r'<dl\b[^>]*class=["\'][^"\']*product-pricing[^"\']*["\'][\s\S]*?</dl>', happy_diwali_card.group(0)).group(0)
        self.assertRegex(happy_diwali_pricing, r'<dt[^>]*>(?:Price|From)</dt>\s*<dd[^>]*>₹250–₹400</dd>')
        self.assertIn(happy_diwali_pricing.count("<dt"), (1, 2))
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".diwali-section", css)
        self.assertRegex(css, r":is\(\.work-card, \.romantic-keepsake-card, \.collection-card\) img\s*\{[^}]*aspect-ratio:\s*1\s*/\s*1[^}]*object-fit:\s*cover")
        self.assertRegex(css, r"\.diwali-section \.eyebrow, \.diwali-section \.work-card figcaption span\s*\{[^}]*color:\s*var\(--cocoa\)")
        self.assertNotRegex(css, r"\.diwali-section \.eyebrow, \.diwali-section \.work-card figcaption span\s*\{[^}]*var\(--marigold\)")
        self.assertRegex(css, r"\.diwali-section \.diwali-card-note\s*\{[^}]*color:\s*var\(--cocoa\)")
        script = (ROOT / "script.js").read_text(encoding="utf-8")
        self.assertIn('document.querySelectorAll(".catalogue-grid .work-card, .catalogue-grid .romantic-keepsake-card")', script)
        self.assertIn('card.querySelectorAll("figcaption p")', script)
        self.assertIn('button.textContent = "Request this item"', script)

    def test_diwali_expansion_appends_ten_new_concept_cards(self):
        section = re.search(r'<section\b[^>]*id=["\']diwali["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        section_html = section.group(0)
        self.assertIn("A preview of 24 festive designs for your home and your people.", section_html)
        self.assertNotIn("Crossed-out regular prices", section_html)
        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*work-card[^"\']*["\'][\s\S]*?</article>', section_html)
        self.assertEqual(len(cards), 24)
        new_ids = [item[0] for item in DIWALI_NEW_CONCEPTS]
        self.assertEqual([re.search(r'\bid=["\']([^"\']+)', card).group(1) for card in cards[-10:]], new_ids)
        self.assertEqual(section_html.count("data-lightbox-trigger"), 24)
        self.assertEqual(section_html.count('class="product-pricing"'), 24)
        for card, (_, asset, title, regular, festive, discount, unit, description) in zip(cards[-10:], DIWALI_NEW_CONCEPTS):
            with self.subTest(asset=asset):
                self.assertIn(f'assets/{asset}', card)
                self.assertIn(f">{title}</strong>", card)
                self.assertIn(description, card)
                self.assertNotIn("Concept preview · made to order", card)
                self.assertIn(unit, card)
                image = re.search(r'<img\b[^>]*>', card)
                self.assertIsNotNone(image)
                self.assertRegex(image.group(0), r'alt=["\']Illustrative preview: [^"\']+["\']')
                self.assertIn('loading="lazy"', image.group(0))
                self.assertIn('decoding="async"', image.group(0))
                self.assertIn('width="1024"', image.group(0))
                self.assertIn('height="1024"', image.group(0))
                self.assertEqual(webp_dimensions(ROOT / "assets" / asset), (1024, 1024))
                pricing = re.search(r'<dl\b[^>]*class=["\'][^"\']*product-pricing[^"\']*["\'][\s\S]*?</dl>', card)
                self.assertIsNotNone(pricing)
                self.assertRegex(pricing.group(0), rf'<dt[^>]*>(?:Price|From)</dt>\s*<dd[^>]*>₹{re.escape(festive)}</dd>')

    def test_corporate_expansion_appends_ten_new_concept_cards(self):
        section = re.search(r'<section\b[^>]*id=["\']corporate-resin-gifts["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        section_html = section.group(0)
        self.assertIn("20 branded keepsakes", section_html)
        self.assertNotIn("Crossed-out regular prices", section_html)
        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*work-card[^"\']*["\'][\s\S]*?</article>', section_html)
        self.assertEqual(len(cards), 20)
        new_ids = [item[0] for item in CORPORATE_RESIN_GIFTS[-10:]]
        self.assertEqual([re.search(r'\bid=["\']([^"\']+)', card).group(1) for card in cards[-10:]], new_ids)
        self.assertEqual(section_html.count("data-lightbox-trigger"), 20)
        self.assertEqual(section_html.count('class="product-pricing"'), 20)
        for card, (_, asset, title, regular, offer, discount, unit, description) in zip(cards[-10:], CORPORATE_RESIN_GIFTS[-10:]):
            with self.subTest(asset=asset):
                self.assertIn(f'assets/{asset}', card)
                self.assertIn(f">{title}</strong>", card)
                self.assertIn(description, card)
                self.assertNotIn("Concept preview · made to order", card)
                self.assertIn(unit, card)
                image = re.search(r'<img\b[^>]*>', card)
                self.assertIsNotNone(image)
                self.assertRegex(image.group(0), r'alt=["\']Illustrative preview: [^"\']+["\']')
                self.assertIn('loading="lazy"', image.group(0))
                self.assertIn('decoding="async"', image.group(0))
                self.assertIn('width="1024"', image.group(0))
                self.assertIn('height="1024"', image.group(0))
                self.assertEqual(webp_dimensions(ROOT / "assets" / asset), (1024, 1024))
                pricing = re.search(r'<dl\b[^>]*class=["\'][^"\']*product-pricing[^"\']*["\'][\s\S]*?</dl>', card)
                self.assertIsNotNone(pricing)
                self.assertRegex(pricing.group(0), rf'<dt[^>]*>(?:Price|From)</dt>\s*<dd[^>]*>₹{re.escape(offer)}</dd>')

    def test_diwali_anchor_offset_clears_sticky_header_at_responsive_breakpoints(self):
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertRegex(css, r"\.diwali-section\s*\{[^}]*scroll-margin-top:\s*1rem")
        self.assertRegex(css, r"@media \(max-width: 840px\) \{[\s\S]*?\.diwali-section\s*\{[^}]*scroll-margin-top:\s*3rem")
        self.assertRegex(css, r"@media \(max-width: 620px\) \{[\s\S]*?\.diwali-section\s*\{[^}]*scroll-margin-top:\s*2rem")

    def test_diwali_section_has_responsive_inner_spacing(self):
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        section_rule = re.search(r"\.diwali-section\s*\{([^}]*)\}", css)
        self.assertIsNotNone(section_rule)
        self.assertRegex(
            section_rule.group(1),
            r"padding:\s*clamp\(4rem,\s*9vw,\s*8rem\)\s+clamp\(1rem,\s*4vw,\s*3\.5rem\)",
        )

    def test_primary_navigation_has_partner_circle_link_and_clickable_pills(self):
        nav_match = re.search(r'<nav class="site-nav"[\s\S]*?</nav>', self.html)
        self.assertIsNotNone(nav_match)
        nav = nav_match.group(0)
        self.assertRegex(
            nav,
            r'<a href="#catalogue-filters" data-browse-all>Gifts[\s\S]*?'
            r'<a href="#romantic-keepsakes" data-category-shortcut="couple">Couple keepsakes[\s\S]*?'
            r'<a href="#studio-art" data-category-shortcut="frames">Resin frames[\s\S]*?'
            r'<a href="#hamper-rail" data-category-shortcut="hampers">Hampers[\s\S]*?'
            r'<a href="#customizer">Custom design[\s\S]*?'
            r'<a href="corporate-gifting/">Corporate orders[\s\S]*?'
            r'<a class="nav-cta" href="#order" data-order-prefill="general">Order',
        )
        self.assertIn('class="nav-cta" href="#order" data-order-prefill="general"', nav)
        self.assertNotIn('href="#process"', nav)
        self.assertNotIn(">The process<", nav)
        footer = re.search(r'<div class="footer-links">([\s\S]*?)</div>', self.html)
        self.assertIsNotNone(footer)
        self.assertIn('<a href="#studio-art" data-category-shortcut="frames">Resin art</a>', footer.group(0))
        self.assertIn('<a href="#order">Order</a>', footer.group(0))

        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        nav_link_rule = re.search(r"(?m)^\.site-nav a:not\(\.nav-cta\) \{([^}]*)\}", css)
        self.assertIsNotNone(nav_link_rule)
        for declaration in ("border: 1px solid", "border-radius: 999px"):
            self.assertIn(declaration, nav_link_rule.group(1))
        self.assertIn(".site-nav a:not(.nav-cta):hover", css)
        self.assertIn(".site-nav a:not(.nav-cta):focus-visible", css)
        self.assertIn("background: var(--paper)", css)
        self.assertRegex(css, r"\.site-nav \{[^}]*flex-wrap: wrap")
        self.assertRegex(css, r":root \{ --sticky-offset: 7\.5rem; \}")

    def test_removed_homepage_sections_have_no_markup_or_internal_links(self):
        for removed_id in ("process", "gallery", "resin-art"):
            with self.subTest(removed_id=removed_id):
                self.assertNotRegex(self.html, rf'\bid=["\']{removed_id}["\']')
                self.assertNotIn(f'href="#{removed_id}"', self.html)
        self.assertNotIn("Behind the scenes", self.html)
        self.assertNotIn("A few favourites", self.html)
        self.assertNotIn('id="resin-art-track"', self.html)
        self.assertNotIn("Made to be looked at twice", self.html)

    def test_seo_metadata_and_studio_namokar_label(self):
        title = "Custom Resin Art &amp; Gifts | Saloni Resin Art Studio"
        description = "Explore custom resin frames, personalized gifts and customized hampers from Saloni Resin Art Studio. Share your colours, theme and occasion with Saloni."
        self.assertEqual(self.html.count("<title>"), 1)
        self.assertIn(f"<title>{title}</title>", self.html)
        self.assertEqual(self.html.count('<meta name="description"'), 1)
        self.assertIn(f'<meta name="description" content="{description}">', self.html)
        self.assertIn(f'<meta property="og:title" content="{title}">', self.html)
        self.assertIn(f'<meta property="og:description" content="{description}">', self.html)
        self.assertIn('<meta property="og:site_name" content="Saloni Resin Art Studio">', self.html)
        self.assertIn('<meta name="twitter:card" content="summary_large_image">', self.html)
        self.assertIn(f'<meta name="twitter:title" content="{title}">', self.html)
        self.assertIn(f'<meta name="twitter:description" content="{description}">', self.html)
        self.assertEqual(self.html.count('rel="canonical"'), 1)
        self.assertIn('<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">', self.html)
        image_alt = re.search(r'<meta property="og:image:alt" content="([^"]+)">', self.html)
        self.assertIsNotNone(image_alt)
        self.assertTrue(image_alt.group(1).strip())
        self.assertNotIn('<meta name="keywords"', self.html)

        studio_card = re.search(r'<article\b[^>]*>[\s\S]*?src=["\']assets/studio-blue-mantra-frame\.jpeg["\'][\s\S]*?</article>', self.html)
        self.assertIsNotNone(studio_card)
        card = studio_card.group(0)
        self.assertIn('src="assets/studio-blue-mantra-frame.jpeg"', card)
        self.assertIn("Namokar", card)
        self.assertIn("<strong>Namokar mantra frame</strong>", card)
        self.assertNotIn("<strong>Blue mantra frame</strong>", card)

    def test_search_console_ownership_verification_tag(self):
        verification_tag = '<meta name="google-site-verification" content="DabWPBofb7rmKPDncFwmqhELfgYwyiXGu0IxJCXR0SE" />'
        self.assertEqual(self.html.count(verification_tag), 1)

    def test_local_business_jsonld_and_sitemap_match_canonical(self):
        canonical = "https://saloniresinart.com/"
        script = re.search(r'<script\b[^>]*type=["\']application/ld\+json["\']>([\s\S]*?)</script>', self.html)
        self.assertIsNotNone(script)
        business = json.loads(script.group(1))
        self.assertEqual(set(business), {"@context", "@type", "name", "url", "sameAs", "description", "telephone", "address", "areaServed", "openingHours"})
        self.assertEqual(business["@context"], "https://schema.org")
        self.assertEqual(business["@type"], "LocalBusiness")
        self.assertEqual(business["name"], "Saloni Resin Art Studio")
        self.assertEqual(business["telephone"], "+91-8209238541")
        self.assertEqual(business["address"], {
            "@type": "PostalAddress",
            "streetAddress": "House No. 61, Hathi Bhata",
            "addressLocality": "Ajmer",
            "addressRegion": "Rajasthan",
            "addressCountry": "IN",
        })
        self.assertEqual(business["areaServed"], "IN")
        self.assertEqual(business["openingHours"], "Mo-Su 11:00-16:00")
        self.assertIn(f'<link rel="canonical" href="{canonical}">', self.html)
        self.assertIn(f'<meta property="og:url" content="{canonical}">', self.html)
        self.assertEqual(business["url"], canonical)
        self.assertEqual(business["sameAs"], ["https://www.instagram.com/saloniresin_art_studio/"])
        self.assertNotRegex(script.group(1), re.compile(r"Review|AggregateRating|rating|Offer|postalCode|geo|hasMap", re.I))

        sitemap_path = ROOT / "sitemap.xml"
        self.assertTrue(sitemap_path.is_file())
        sitemap = ET.parse(sitemap_path).getroot()
        namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        self.assertEqual(sitemap.tag, "{http://www.sitemaps.org/schemas/sitemap/0.9}urlset")
        urls = sitemap.findall("sm:url", namespace)
        expected_urls = [
            canonical,
            "https://saloniresinart.com/resin-photo-frames/",
            "https://saloniresinart.com/customised-hampers/",
            "https://saloniresinart.com/namokar-mantra-frames/",
            "https://saloniresinart.com/partners/",
            "https://saloniresinart.com/corporate-gifting/",
        ]
        self.assertEqual([url.findtext("sm:loc", namespaces=namespace) for url in urls], expected_urls)
        self.assertEqual(len(urls), len(expected_urls))
        for url in urls:
            self.assertEqual(len(list(url)), 1)
        self.assertNotIn("#", sitemap_path.read_text(encoding="utf-8"))

    def test_collection_card_height_follows_content_on_desktop(self):
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        figure_rule = re.search(r"(?m)^\.collection-card figure \{([^}]*)\}", css).group(1)
        caption_rule = re.search(r"(?m)^\.collection-card figcaption \{([^}]*)\}", css).group(1)

        self.assertIn("height: auto", figure_rule)
        self.assertIn("height: auto", caption_rule)

    def test_product_card_images_share_square_cover_inset_geometry(self):
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        shared = re.search(r":is\(\.work-card, \.romantic-keepsake-card, \.collection-card\) img\s*\{([^}]*)\}", css)
        self.assertIsNotNone(shared)
        shared_rule = shared.group(1)
        self.assertRegex(shared_rule, r"aspect-ratio:\s*1\s*/\s*1")
        self.assertRegex(shared_rule, r"object-fit:\s*cover")
        self.assertRegex(shared_rule, r"object-position:\s*center")
        self.assertRegex(shared_rule, r"padding:\s*0\.5rem")
        self.assertRegex(shared_rule, r"background:\s*var\(--paper\)")

        for selector in (
            r"\.romantic-keepsake-card img",
            r"\.diwali-section \.work-card img",
            r"\.work-card img",
            r"\.work-card-hamper img",
            r"\.studio-art-section \.work-card img",
            r"\.collection-card img",
        ):
            with self.subTest(selector=selector):
                self.assertNotRegex(css, rf"{selector}\s*\{{[^}}]*(?:aspect-ratio|object-fit|object-position|padding|height):")

    def test_collection_pages_have_distinct_buying_guidance(self):
        guidance = {
            "resin-photo-frames": [
                "Choose a photo clock for a displayed portrait and everyday timepiece, or a flower-preservation frame or keepsake when the bouquet or petals are the main memory.",
                "Share the photo, flowers, date, and preferred dimensions when you enquire.",
            ],
            "customised-hampers": [
                "Tell the studio the recipient, occasion, theme, and budget; agree the contents and confirm timing before preparation.",
            ],
            "namokar-mantra-frames": [
                "Compare the three finishes—blue, white, and Navkar—then share the intended location and size.",
                "Confirm the inscription and design before production.",
            ],
        }
        for slug, required_copy in guidance.items():
            html = (ROOT / slug / "index.html").read_text(encoding="utf-8")
            self.assertIn("See current pricing, then request this design.", html)
            for sentence in required_copy:
                self.assertIn(sentence, html)
            self.assertNotIn("the existing order flow keeps the item details together", html)
            self.assertNotIn("homepage card", html)
            self.assertNotIn("order flow", html)

    def test_photo_frame_reference_image_disclosure_matches_homepage(self):
        html = (ROOT / "resin-photo-frames" / "index.html").read_text(encoding="utf-8")
        reference_alt = "Reference image: Soft-arch clear resin memory frame with dried blush roses and restrained gold flecks"

        self.assertIn(f'<meta property="og:image:alt" content="{reference_alt}">', html)
        self.assertIn(f'<meta name="twitter:image:alt" content="{reference_alt}">', html)
        self.assertEqual(html.count(f'alt="{reference_alt}"'), 2)
        self.assertEqual(html.count("Reference image · final design confirmed before making"), 2)
        self.assertNotIn("Made in Ajmer, with care.", html)

    def test_customer_facing_catalogue_copy_uses_illustrative_reference_language(self):
        pages = [self.html, (ROOT / "resin-photo-frames" / "index.html").read_text(encoding="utf-8")]
        for page in pages:
            with self.subTest(page=page[:40]):
                # Asset paths retain their established filenames; visible and
                # accessible copy must not expose the retired label.
                customer_markup = re.sub(r'\s(?:src|href)=["\'][^"\']*["\']', "", page, flags=re.IGNORECASE)
                customer_markup = re.sub(r'\scontent=["\'][^"\']*(?:/assets/|\.(?:webp|jpe?g|png|svg))[^"\']*["\']', "", customer_markup, flags=re.IGNORECASE)
                self.assertNotRegex(customer_markup, re.compile(r"\bconcept\b", re.IGNORECASE))
        self.assertIn("A preview of 14 keepsake ideas", self.html)
        self.assertIn("Corporate gifting", self.html)
        corporate = re.search(r'<section\b[^>]*id=["\']corporate-resin-gifts["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(corporate)
        self.assertNotIn("Corporate gifting concept", corporate.group(0))

    def test_collection_pages_have_unique_metadata_jsonld_and_order_links(self):
        collection_specs = {
            "resin-photo-frames": {
                "title": "Resin Photo Frames and Floral Keepsakes | Saloni Resin Art Studio",
                "description": "Explore resin photo frames and floral keepsakes made in Ajmer by Saloni Resin Art Studio.",
                "heading": "Resin photo frames for the moments worth keeping",
                "ids": ["floral-memory-frame", "personalized-photo-clock", "rose-hexagon"],
            },
            "customised-hampers": {
                "title": "Customised Hampers for Every Occasion | Saloni Resin Art Studio",
                "description": "Explore customised birthday, theme, and festive hampers from Saloni Resin Art Studio in Ajmer.",
                "heading": "Customised hampers, built around their occasion",
                "ids": ["birthday-hamper", "car-theme-hamper", "holi-hamper"],
            },
            "namokar-mantra-frames": {
                "title": "Namokar Mantra Resin Frames | Saloni Resin Art Studio",
                "description": "Explore Namokar mantra resin frames with textured finishes and gold detail from Saloni Resin Art Studio.",
                "heading": "Namokar mantra frames for a meaningful home",
                "ids": ["blue-mantra-frame", "white-mantra-frame", "navkar-resin-frame"],
            },
        }
        titles = set()
        descriptions = set()
        headings = set()
        for slug, spec in collection_specs.items():
            page_path = ROOT / slug / "index.html"
            self.assertTrue(page_path.is_file(), slug)
            html = page_path.read_text(encoding="utf-8")
            titles.add(re.search(r"<title>([^<]+)</title>", html).group(1))
            descriptions.add(re.search(r'<meta name="description" content="([^"]+)">', html).group(1))
            headings.add(re.search(r"<h1[^>]*>([^<]+)</h1>", html).group(1))
            canonical = f"https://saloniresinart.com/{slug}/"
            self.assertIn(f'<link rel="canonical" href="{canonical}">', html)
            self.assertIn(f'<meta property="og:url" content="{canonical}">', html)
            self.assertIn(f'<meta property="og:title" content="{spec["title"]}">', html)
            self.assertIn(f'<meta property="og:description" content="{spec["description"]}">', html)
            self.assertIn(f'<meta name="twitter:title" content="{spec["title"]}">', html)
            self.assertIn(f'<meta name="twitter:description" content="{spec["description"]}">', html)
            self.assertIn(f'<h1', html)
            self.assertIn(spec["heading"], html)
            scripts = re.findall(r'<script\b[^>]*type="application/ld\+json"[^>]*>([\s\S]*?)</script>', html)
            self.assertEqual(len(scripts), 1, slug)
            collection = json.loads(scripts[0])
            self.assertEqual(collection["@context"], "https://schema.org")
            self.assertEqual(collection["@type"], "CollectionPage")
            self.assertEqual(collection["url"], canonical)
            self.assertEqual(collection["name"], spec["title"].split(" | ")[0])
            self.assertTrue(collection.get("mainEntity"))
            self.assertNotRegex(scripts[0], re.compile(r"Product|Offer|AggregateRating|Review|rating|price|availability|stock", re.I))
            self.assertNotRegex(html, re.compile(r'<script\b[^>]+src=', re.I), slug)
            self.assertNotIn("₹", html, slug)
            image_tags = re.findall(r"<img\b[^>]*>", html)
            self.assertGreaterEqual(len(image_tags), 3, slug)
            for image in image_tags:
                self.assertRegex(image, r'\balt="[^"]+"')
                self.assertRegex(image, r'\bwidth="\d+"')
                self.assertRegex(image, r'\bheight="\d+"')
                self.assertIn('loading="lazy"', image)
                source = re.search(r'\bsrc="([^"]+)"', image).group(1)
                self.assertTrue((page_path.parent / source).resolve().is_file(), source)
            for card_id in spec["ids"]:
                self.assertIn("View this piece and order", html)
                self.assertIn(f'href="../#{card_id}"', html)
            self.assertIn('href="../"', html)
            self.assertIn('href="../resin-photo-frames/"', html)
            self.assertIn('href="../customised-hampers/"', html)
            self.assertIn('href="../namokar-mantra-frames/"', html)
        self.assertEqual(len(titles), len(collection_specs))
        self.assertEqual(len(descriptions), len(collection_specs))
        self.assertEqual(len(headings), len(collection_specs))

    def test_homepage_links_collections_and_stable_catalogue_cards(self):
        for slug in ("resin-photo-frames", "customised-hampers", "namokar-mantra-frames"):
            self.assertIn(f'href="{slug}/"', self.html)
        for card_id in (
            "floral-memory-frame", "personalized-photo-clock", "rose-hexagon",
            "birthday-hamper", "car-theme-hamper", "holi-hamper",
            "blue-mantra-frame", "white-mantra-frame", "navkar-resin-frame",
        ):
            self.assertRegex(self.html, rf'<article\b[^>]*\bid="{card_id}"')

    def test_homepage_uses_approved_visit_copy_without_stale_online_only_claim(self):
        self.assertIn("Visit Saloni Resin Art Studio at House No. 61, Hathi Bhata, Ajmer, Rajasthan, India.", self.html)
        self.assertIn("Open every day, 11:00 AM–4:00 PM.", self.html)
        self.assertIn("Shipping across India.", self.html)
        self.assertNotIn("Online orders only", self.html)
        self.assertNotIn("no customer visits", self.html)

    def test_hero_copy_names_searchable_offerings(self):
        hero = re.search(r'<p\b[^>]*class=["\']hero-intro["\'][\s\S]*?</p>', self.html)
        self.assertIsNotNone(hero)
        hero_copy = hero.group(0).lower()
        for phrase in ("custom resin frames", "resin art", "personalized gifts", "customized hampers"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, hero_copy)

    def test_romantic_keepsake_highlight_contract(self):
        section = re.search(r'<section\b[^>]*id=["\']romantic-keepsakes["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        section_html = section.group(0)
        self.assertIn('aria-labelledby="romantic-keepsakes-title"', section_html)
        self.assertIn("For the two of you", section_html)
        self.assertIn('<h2 id="romantic-keepsakes-title">Keep the moment close.</h2>', section_html)
        self.assertNotIn('href="#romantic-keepsakes" data-category-shortcut="couple">Explore the keepsakes', section_html)
        for phrase in (
            "Rose hexagon",
            "Personalized photo clock",
            "Say it without a speech",
            "Preserved rose display",
            "Preserved red roses, held close for a lasting moment.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, section_html)
        grid = re.search(r'<div\b[^>]*class=["\']catalogue-grid["\'][^>]*>', section_html)
        self.assertIsNotNone(grid)
        self.assertIn('id="romantic-keepsakes-grid"', grid.group(0))
        self.assertIn('role="list"', grid.group(0))
        self.assertIn('aria-label="Romantic keepsakes"', grid.group(0))
        self.assertIn('data-catalogue-disclosure', section_html)
        self.assertIn('aria-expanded="false"', section_html)

        assets = re.findall(r'<img\b[^>]*src=["\'](assets/[^"\']+)["\'][^>]*>', section_html)
        self.assertEqual(
            assets,
            [f"assets/{asset}" for asset, _, _, _, _, _ in ROMANTIC_CONCEPTS] + [
                "assets/studio-rose-hexagon-keepsake.jpeg",
                "assets/studio-personalized-photo-clock.jpeg",
                "assets/romantic-hamper.jpg",
                "assets/studio-red-rose-resin-display.jpeg",
            ],
        )
        self.assertTrue((ROOT / "assets" / "studio-red-rose-resin-display.jpeg").is_file())
        for image in re.findall(r'<img\b[^>]*>', section_html):
            with self.subTest(image=image):
                self.assertIn('loading="lazy"', image)
                self.assertIn('decoding="async"', image)
                self.assertRegex(image, r'\bwidth=["\']\d+["\']')
                self.assertRegex(image, r'\bheight=["\']\d+["\']')

        self.assertEqual(section_html.count("<h3"), 14)
        self.assertIn('data-catalogue-disclosure', section_html)
        self.assertNotIn("work-card", section_html)
        self.assertEqual(section_html.count("data-lightbox-trigger"), 14)
        for asset in assets:
            with self.subTest(lightbox_asset=asset):
                asset_name = asset.removeprefix("assets/")
                trigger = re.search(rf'<a\b[^>]*class=["\']lightbox-trigger["\'][^>]*data-lightbox-trigger[^>]*href=["\']assets/{re.escape(asset_name)}["\'][^>]*>[\s\S]*?</a>', section_html)
                self.assertIsNotNone(trigger)
                self.assertRegex(trigger.group(0), r'aria-label=["\']Open larger view: [^"\']+["\']')
        self.assertEqual(section_html.count('class="product-pricing"'), 14)
        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*romantic-keepsake-card[^"\']*["\'][\s\S]*?</article>', section_html)
        self.assertEqual(len(cards), 14)
        highlight_matrix = {
            "studio-rose-hexagon-keepsake.jpeg": ("2,999", "2,499", 17),
            "studio-personalized-photo-clock.jpeg": ("3,999", "3,000", 25),
            "romantic-hamper.jpg": ("2,499", "1,999", 20),
            "studio-red-rose-resin-display.jpeg": ("899", "599", 33),
        }
        for asset, (regular, festive, discount) in highlight_matrix.items():
            with self.subTest(asset=asset):
                card = next((card for card in cards if f"assets/{asset}" in card), None)
                self.assertIsNotNone(card)
                pricing = re.search(r'<dl\b[^>]*class=["\'][^"\']*product-pricing[^"\']*["\'][\s\S]*?</dl>', card)
                self.assertIsNotNone(pricing)
                pricing_html = pricing.group(0)
                self.assertRegex(pricing_html, rf'<dt[^>]*>(?:Price|From)</dt>\s*<dd[^>]*>₹{re.escape(festive)}</dd>')
        script = (ROOT / "script.js").read_text(encoding="utf-8")
        self.assertIn(".romantic-keepsake-card", script)
        self.assertIn('data-order-prefill", "catalogue"', script)
        for old_section_id, moved_asset in (
            ("studio-art", "studio-rose-hexagon-keepsake.jpeg"),
            ("studio-art", "studio-personalized-photo-clock.jpeg"),
            ("hamper-rail", "romantic-hamper.jpg"),
        ):
            old_section = re.search(rf'<section\b[^>]*id=["\']{old_section_id}["\'][\s\S]*?</section>', self.html)
            self.assertIsNotNone(old_section)
            with self.subTest(moved_asset=moved_asset):
                self.assertNotIn(f"assets/{moved_asset}", old_section.group(0))
                self.assertEqual(self.html.count(f'src="assets/{moved_asset}"'), 1)
        studio_section = re.search(r'<section\b[^>]*id=["\']studio-art["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(studio_section)
        for moved_asset in (
            "resin-clock.jpg",
            "resin-message-coasters.jpg",
            "navkar-resin-frame.jpg",
            "personalized-floral-hoop.jpg",
        ):
            with self.subTest(moved_asset=moved_asset):
                self.assertIn(f"assets/{moved_asset}", studio_section.group(0))
        self.assertNotIn("romantic-keepsake-notes", section_html)
        self.assertNotRegex(section_html, re.compile(r"<blockquote|<cite|Gaurav Jain|Aarti Suthar|★★★★★", re.I))

        self.assertRegex(self.html, r'<a\b[^>]*class=["\']button button-dark["\'][^>]*href=["\']#catalogue-filters["\']')
        self.assertEqual(self.html.count('class="catalogue-grid"'), 6)
        self.assertEqual(self.html.count('data-lightbox-trigger'), 96)
        self.assertEqual(self.html.count('class="product-pricing"'), 96)
        self.assertEqual(self.html.count('data-testimonial-card'), 0)

        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".romantic-keepsakes", css)
        self.assertIn(".catalogue-grid", css)
        self.assertRegex(css, r":is\(\.work-card, \.romantic-keepsake-card, \.collection-card\) img\s*\{[^}]*object-fit:\s*cover")
        self.assertRegex(css, r"\.romantic-keepsake-card figcaption > p:first-of-type, \.studio-art-section \.work-card figcaption > p:first-of-type\s*\{[^}]*font-size:\s*0\.75rem")
        self.assertRegex(css, r"\.catalogue-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4")
        medium_media = re.search(r"@media \(max-width: 840px\) \{([\s\S]*?)\n\}\n\n@media \(max-width: 620px\)", css)
        self.assertIsNotNone(medium_media)
        self.assertRegex(medium_media.group(1), r"\.catalogue-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2")
        small_media = re.search(r"@media \(max-width: 620px\) \{([\s\S]*?)\n\}\n\n@media \(prefers-reduced-motion: reduce\)", css)
        self.assertIsNotNone(small_media)
        self.assertRegex(small_media.group(1), r"\.romantic-keepsake-card\s*\{[^}]*padding:\s*0\.7rem")
        self.assertNotRegex(small_media.group(1), r"\.romantic-keepsake-card img\s*\{[^}]*height:")
        self.assertRegex(small_media.group(1), r"\.romantic-keepsake-card figcaption \.product-pricing > div\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto")
        self.assertRegex(small_media.group(1), r"\.romantic-keepsake-card figcaption \.product-pricing dd\s*\{[^}]*white-space:\s*nowrap[^}]*overflow-wrap:\s*normal")

    def test_romantic_keepsake_collection_grid_contract(self):
        section = re.search(r'<section\b[^>]*id=["\']romantic-keepsakes["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        section_html = section.group(0)
        self.assertEqual(section_html.count('id="romantic-keepsakes-grid"'), 1)
        self.assertIn('id="romantic-keepsakes-grid"', section_html)
        self.assertIn('class="catalogue-grid"', section_html)
        track = re.search(r'<div\b[^>]*class=["\']catalogue-grid["\'][^>]*>', section_html)
        self.assertIsNotNone(track)
        self.assertIn('role="list"', track.group(0))
        self.assertIn('aria-controls="romantic-keepsakes-grid"', section_html)
        self.assertIn('data-catalogue-disclosure', section_html)
        self.assertIn('aria-expanded="false"', section_html)
        self.assertIn("A preview of 14 keepsake ideas", section_html)
        self.assertNotIn("Concept previews are illustrative.", section_html)
        self.assertIn("Some catalogue images are illustrative or reference ideas.", self.html)

        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*romantic-keepsake-card[^"\']*["\'][\s\S]*?</article>', section_html)
        self.assertEqual(len(cards), 14)
        assets = re.findall(r'<img\b[^>]*src=["\'](assets/[^"\']+)["\'][^>]*>', section_html)
        self.assertEqual(
            assets[:10],
            [f"assets/{asset}" for asset, _, _, _, _, _ in ROMANTIC_CONCEPTS],
        )
        self.assertEqual(
            assets[10:],
            [
                "assets/studio-rose-hexagon-keepsake.jpeg",
                "assets/studio-personalized-photo-clock.jpeg",
                "assets/romantic-hamper.jpg",
                "assets/studio-red-rose-resin-display.jpeg",
            ],
        )
        self.assertEqual(section_html.count("data-lightbox-trigger"), 14)
        self.assertEqual(section_html.count('class="product-pricing"'), 14)
        for card_index in (0, 9, 10, 13):
            with self.subTest(card_index=card_index):
                selected_card = cards[card_index]
                selected_trigger = re.search(r'<a\b[^>]*data-lightbox-trigger[^>]*href=["\']([^"\']+)["\']', selected_card)
                self.assertIsNotNone(selected_trigger)
        for asset, title, copy, regular, festive, discount in ROMANTIC_CONCEPTS:
            with self.subTest(asset=asset):
                card = next((card for card in cards if f"assets/{asset}" in card), None)
                self.assertIsNotNone(card)
                self.assertIn(f">{title}</h3>", card)
                self.assertIn(copy, card)
                self.assertNotIn("Concept preview · made to order", card)
                self.assertIn("Illustrative preview:", card)
                self.assertNotIn(FINAL_QUOTE_NOTE, card)
                self.assertNotIn("Market reference", card)
                self.assertNotIn("Average listed price", card)
                self.assertNotIn("Regular price", card)
                self.assertNotIn("Festive price", card)
                self.assertNotIn("Discount", card)
                pricing = re.search(r'<dl\b[^>]*class=["\'][^"\']*product-pricing[^"\']*["\'][\s\S]*?</dl>', card)
                self.assertIsNotNone(pricing)
                pricing_html = pricing.group(0)
                self.assertIn(pricing_html.count("<dt"), (1, 2))
                self.assertRegex(pricing_html, rf'<dt[^>]*>(?:Price|From)</dt>\s*<dd[^>]*>₹{re.escape(festive)}</dd>')
                image = re.search(r'<img\b[^>]*>', card)
                self.assertIsNotNone(image)
                image_tag = image.group(0)
                self.assertRegex(image_tag, r'alt=["\']Illustrative preview: [^"\']+["\']')
                self.assertIn('width="1024"', image_tag)
                self.assertIn('height="1024"', image_tag)
                self.assertIn('loading="lazy"', image_tag)
                self.assertIn('decoding="async"', image_tag)
                self.assertEqual(webp_dimensions(ROOT / "assets" / asset), (1024, 1024))
                trigger = re.search(r'<a\b[^>]*data-lightbox-trigger[^>]*href=["\']([^"\']+)["\']', card)
                self.assertIsNotNone(trigger)
                self.assertEqual(trigger.group(1), f"assets/{asset}")

        for asset, _, _, _, _, _ in ROMANTIC_CONCEPTS:
            expected_count = 2 if asset in {"romantic-heart-trinket-tray.webp", "romantic-initial-desk-stand.webp"} else 1
            self.assertEqual(self.html.count(f'src="assets/{asset}"'), expected_count)
        for studio_concept in (
            "concept-floral-memory-frame.webp",
            "concept-ocean-clock.webp",
            "concept-tray-hamper.webp",
            "concept-floral-coasters.webp",
        ):
            self.assertNotIn(studio_concept, section_html)

        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertRegex(css, r"\.catalogue-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4")
        self.assertNotRegex(css, r"\.carousel-track\s*\{")
        self.assertNotRegex(css, r"\.carousel\s*\{")
        medium_media = re.search(r"@media \(max-width: 840px\) \{([\s\S]*?)\n\}\n\n@media \(max-width: 620px\)", css)
        self.assertIsNotNone(medium_media)
        self.assertRegex(medium_media.group(1), r"\.catalogue-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2")
        small_media = re.search(r"@media \(max-width: 620px\) \{([\s\S]*?)\n\}\n\n@media \(prefers-reduced-motion: reduce\)", css)
        self.assertIsNotNone(small_media)
        self.assertRegex(small_media.group(1), r"\.catalogue-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2")

    def test_mobile_catalogue_grid_uses_two_columns(self):
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        small_media = re.search(r"@media \(max-width: 620px\) \{([\s\S]*?)\n\}\n\n@media \(prefers-reduced-motion: reduce\)", css)
        self.assertIsNotNone(small_media)
        self.assertRegex(small_media.group(1), r"\.catalogue-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2")

    def test_corporate_resin_gifts_catalogue_contract(self):
        romantic_start = self.html.index('<section class="romantic-keepsakes shell"')
        romantic_end = self.html.index("</section>", romantic_start) + len("</section>")
        corporate_match = re.search(r'<section\b[^>]*id=["\']corporate-resin-gifts["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(corporate_match)
        corporate = corporate_match.group(0)
        corporate_start = corporate_match.start()
        studio_start = self.html.index('<section class="work-section studio-art-section shell"')
        self.assertLess(romantic_end, corporate_start)
        self.assertLess(corporate_start, studio_start)
        self.assertNotRegex(self.html[romantic_end:corporate_start], r'<section\b')

        self.assertIn('<a href="corporate-gifting/">Corporate orders', self.html)
        self.assertIn('<a href="corporate-gifting/">Corporate gifting</a>', self.html)
        self.assertIn('id="corporate-resin-gifts-grid"', corporate)
        self.assertIn('aria-labelledby="corporate-resin-gifts-title"', corporate)
        self.assertIn('<h2 id="corporate-resin-gifts-title">Corporate Resin Gifts</h2>', corporate)
        self.assertIn('class="catalogue-grid"', corporate)
        self.assertIn('role="list"', corporate)
        self.assertIn('aria-label="Corporate resin gifts"', corporate)
        self.assertIn('data-catalogue-disclosure', corporate)
        self.assertIn('aria-expanded="false"', corporate)
        self.assertNotIn(FINAL_QUOTE_NOTE, corporate)
        self.assertIn("Some catalogue images are illustrative or reference ideas.", self.html)

        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*work-card[^"\']*["\'][\s\S]*?</article>', corporate)
        self.assertEqual(len(cards), len(CORPORATE_RESIN_GIFTS))
        ids = [re.search(r'\bid=["\']([^"\']+)', card).group(1) for card in cards]
        self.assertEqual(ids, [item[0] for item in CORPORATE_RESIN_GIFTS])
        self.assertEqual(len(ids), len(set(ids)))
        assets = re.findall(r'<img\b[^>]*src=["\'](assets/corporate-[^"\']+\.webp)["\']', corporate)
        self.assertEqual(assets, [f"assets/{item[1]}" for item in CORPORATE_RESIN_GIFTS])
        self.assertEqual(len(assets), len(set(assets)))

        for card, (_, asset, title, regular, offer, discount, unit, description) in zip(cards, CORPORATE_RESIN_GIFTS):
            with self.subTest(asset=asset):
                self.assertIn(f">{title}</strong>", card)
                self.assertIn(description, card)
                self.assertNotIn("Concept preview · made to order", card)
                self.assertIn(unit, card)
                self.assertLessEqual(card[:card.index("<dl")].count("<p"), 2)
                image = re.search(r'<img\b[^>]*>', card)
                self.assertIsNotNone(image)
                self.assertRegex(image.group(0), r'alt=["\']Illustrative preview: [^"\']+["\']')
                self.assertIn('loading="lazy"', image.group(0))
                self.assertIn('decoding="async"', image.group(0))
                trigger = re.search(r'<a\b[^>]*class=["\']lightbox-trigger["\'][^>]*data-lightbox-trigger[^>]*href=["\']assets/' + re.escape(asset) + r'["\'][\s\S]*?</a>', card)
                self.assertIsNotNone(trigger)
                self.assertRegex(trigger.group(0), r'aria-label=["\']Open larger view: [^"\']+["\']')
                pricing = re.search(r'<dl\b[^>]*class=["\'][^"\']*product-pricing[^"\']*["\'][\s\S]*?</dl>', card)
                self.assertIsNotNone(pricing)
                pricing_html = pricing.group(0)
                self.assertRegex(pricing_html, rf'<dt[^>]*>(?:Price|From)</dt>\s*<dd[^>]*>₹{re.escape(offer)}</dd>')

        self.assertEqual(corporate.count("data-lightbox-trigger"), len(CORPORATE_RESIN_GIFTS))
        self.assertEqual(corporate.count('class="product-pricing"'), len(CORPORATE_RESIN_GIFTS))
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertRegex(css, r"\.corporate-resin-gifts-section\s*\{[^}]*scroll-margin-top:\s*3rem")
        self.assertRegex(css, r"@media \(max-width: 620px\) \{[\s\S]*?\.corporate-resin-gifts-section\s*\{[^}]*scroll-margin-top:\s*4rem")

    def test_public_metadata_uses_settled_custom_domain_url(self):
        public_url = "https://saloniresinart.com/"
        image_url = public_url + "assets/resin-clock.jpg"
        self.assertIn(f'<link rel="canonical" href="{public_url}">', self.html)
        self.assertIn(f'<meta property="og:url" content="{public_url}">', self.html)
        self.assertIn(f'<meta property="og:image" content="{image_url}">', self.html)
        self.assertIn(f'<meta name="twitter:image" content="{image_url}">', self.html)
        self.assertNotIn("atishayjain20.github.io", self.html)

    def test_discovery_files_and_favicon_are_valid(self):
        robots_path = ROOT / "robots.txt"
        self.assertTrue(robots_path.is_file())
        self.assertEqual(
            robots_path.read_text(encoding="utf-8").splitlines(),
            ["User-agent: *", "Allow: /", "Sitemap: https://saloniresinart.com/sitemap.xml"],
        )

        favicon_path = ROOT / "assets" / "favicon.svg"
        self.assertTrue(favicon_path.is_file())
        favicon = ET.parse(favicon_path).getroot()
        self.assertEqual(favicon.tag.rsplit("}", 1)[-1], "svg")
        self.assertEqual(favicon.attrib.get("viewBox", "").split(), ["0", "0", "64", "64"])
        self.assertEqual(favicon.attrib.get("width"), "64")
        self.assertEqual(favicon.attrib.get("height"), "64")

    def test_buyer_copy_and_order_questions_are_native(self):
        for phrase in (
            "Resin keepsakes from the studio",
            "Customized hampers for special moments",
            "Blue hour resin clock",
            "Personalized message coasters",
            "Namokar mantra resin frame",
            "Personalized photo clock",
            "Visit Saloni Resin Art Studio at House No. 61, Hathi Bhata, Ajmer, Rajasthan, India. Open every day, 11:00 AM–4:00 PM. Shipping across India.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.html)

        order = re.search(r'<section\b[^>]*id=["\']order["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(order)
        order_html = order.group(0)
        details = re.findall(r'<details\b[\s\S]*?</details>', order_html)
        self.assertEqual(len(details), 4)
        for question in (
            "What can I personalize?",
            "Is the preview final?",
            "How do I order?",
        ):
            with self.subTest(question=question):
                self.assertIn(f"<summary>{question}</summary>", order_html)
        self.assertNotIn("FAQPage", self.html)

    def test_document_has_one_h1_and_resolvable_local_fragments(self):
        self.assertEqual(len(re.findall(r"<h1\b", self.html, flags=re.I)), 1)
        ids = set(re.findall(r'\bid=["\']([^"\']+)', self.html))
        for fragment in re.findall(r'href=["\'](#[^"\']+)', self.html):
            with self.subTest(fragment=fragment):
                self.assertIn(fragment[1:], ids)
        self.assertNotRegex(self.html, re.compile(r'<meta\b[^>]*name=["\']robots["\'][^>]*noindex', re.I))
        self.assertNotIn("atishayjain20.github.io", (ROOT / "sitemap.xml").read_text(encoding="utf-8"))
        self.assertNotIn("atishayjain20.github.io", (ROOT / "robots.txt").read_text(encoding="utf-8"))

    def test_contact_details_are_exact_and_visible(self):
        self.assertIn('tel:8209238541', self.html)
        self.assertIn("8209238541", self.html)
        self.assertIn("https://www.instagram.com/saloniresin_art_studio/", self.html)
        self.assertIn("@saloniresin_art_studio", self.html)

    def test_published_assets_exist_and_do_not_reference_source_folder(self):
        asset_sources = re.findall(r'<img[^>]+src=["\']([^"\']+)', self.html)
        self.assertGreaterEqual(len(asset_sources), 10)
        for source in asset_sources:
            with self.subTest(source=source):
                self.assertFalse(source.startswith("http"), source)
                self.assertNotIn("work/", source)
                self.assertTrue((ROOT / source).is_file(), source)
        self.assertNotRegex(self.html, r"(?:instagramcdn|cdninstagram|fbcdn|scontent)")

    def test_images_have_meaningful_alt_and_dimensions(self):
        images = re.findall(r"<img\b[^>]*>", self.html, flags=re.I | re.S)
        self.assertGreaterEqual(len(images), 10)
        for image in images:
            with self.subTest(image=image[:80]):
                alt = re.search(r'\balt=["\']([^"\']*)', image, flags=re.I)
                self.assertIsNotNone(alt)
                self.assertGreater(len(alt.group(1).strip()), 8)
                self.assertRegex(image, r'\b(?:width|aspect-ratio)')

    def test_each_catalogue_section_contains_its_grid_and_disclosure(self):
        parser = MarkupTreeParser()
        parser.feed(self.html)
        owners = []
        for root in parser.roots:
            owners.extend(find_nodes(root, "data-catalogue-disclosure"))
        self.assertEqual(len(owners), 6)
        for disclosure in owners:
            with self.subTest(disclosure=disclosure["attrs"].get("aria-controls")):
                self.assertEqual(disclosure["attrs"].get("aria-expanded"), "false")
                self.assertTrue(disclosure["attrs"].get("aria-controls"))

    def test_catalogue_grids_have_listitem_article_children(self):
        parser = MarkupTreeParser()
        parser.feed(self.html)
        grid_ids = {
            "diwali-grid",
            "romantic-keepsakes-grid",
            "corporate-resin-gifts-grid",
            "studio-art-grid",
            "hamper-grid",
        }
        grids = []

        def collect(node):
            if node["attrs"].get("id") in grid_ids:
                grids.append(node)
            for child in node["children"]:
                collect(child)

        for root in parser.roots:
            collect(root)

        self.assertEqual({grid["attrs"].get("id") for grid in grids}, grid_ids)
        for grid in grids:
            with self.subTest(grid=grid["attrs"].get("id")):
                self.assertEqual(grid["attrs"].get("role"), "list")
                articles = [child for child in grid["children"] if child["tag"] == "article"]
                self.assertGreater(len(articles), 0)
                self.assertTrue(all(article["attrs"].get("role") == "listitem" for article in articles))

    def test_studio_art_grid_contract(self):
        section = re.search(r'<section\b[^>]*id=["\']studio-art["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        section_html = section.group(0)
        self.assertIn("Resin keepsakes from the studio", section_html)
        self.assertIn("A preview of 21 studio pieces", section_html)
        grid = re.search(r'<div\b[^>]*class=["\'][^"\']*catalogue-grid[^"\']*["\'][^>]*>', section_html)
        self.assertIsNotNone(grid)
        self.assertIn('id="studio-art-grid"', grid.group(0))
        self.assertIn('role="list"', grid.group(0))
        self.assertIn('aria-label="Art from the studio"', grid.group(0))
        self.assertIn('data-catalogue-disclosure', section_html)
        self.assertIn('aria-expanded="false"', section_html)
        self.assertIn('aria-controls="studio-art-grid"', section_html)
        self.assertEqual(self.html.count('id="studio-art"'), 1)
        self.assertEqual(self.html.count('id="studio-art-grid"'), 1)
        self.assertEqual(section_html.count('aria-controls="studio-art-grid"'), 1)

    def test_studio_art_has_labeled_keepsake_ideas_on_floral_cards(self):
        section = re.search(r'<section\b[^>]*id=["\']studio-art["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        section_html = section.group(0)
        story_notes = re.findall(r'<p\b[^>]*class=["\'][^"\']*keepsake-story[^"\']*["\'][^>]*>[\s\S]*?</p>', section_html)
        self.assertEqual(len(story_notes), 3)
        for note in story_notes:
            with self.subTest(note=note):
                self.assertIn("Keepsake idea", note)
                self.assertIn("</span> ", note)
                self.assertNotRegex(note, re.compile(r'customer|testimonial|review|said|★★★★★', re.I))
        for phrase in (
            "first bouquet",
            "handwritten note",
            "special-day flower",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, section_html.lower())

        asset_names = (
            "studio-blue-mantra-frame.jpeg",
            "studio-lilac-symbol-rakhi.jpeg",
            "studio-little-brother-rakhi.jpeg",
            "studio-white-mantra-frame.jpeg",
            "studio-lilac-scalloped-tray.jpeg",
            "studio-floral-square-keepsake.jpeg",
            "studio-floral-hexagon-keepsake.jpeg",
            "studio-floral-handled-tray.jpeg",
            "concept-floral-memory-frame.webp",
            "concept-ocean-clock.webp",
            "concept-tray-hamper.webp",
            "concept-floral-coasters.webp",
            "resin-clock.jpg",
            "resin-message-coasters.jpg",
            "navkar-resin-frame.jpg",
            "personalized-floral-hoop.jpg",
            "sunflower-resin-lamp.jpeg",
            "sunflower-floral-keepsakes.jpeg",
            "sunflower-plaque-easel.jpeg",
            "sunflower-plaque-hand.jpeg",
            "sunflower-keepsake-set.jpeg",
        )
        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*work-card[^"\']*["\'][\s\S]*?</article>', section_html)
        self.assertEqual(len(cards), 21)
        self.assertEqual(section_html.count("<figcaption>"), 21)
        for asset_name in asset_names:
            with self.subTest(asset=asset_name):
                image = re.search(rf'<img\b[^>]*src=["\']assets/{re.escape(asset_name)}["\'][^>]*>', section_html)
                self.assertIsNotNone(image)
                image_tag = image.group(0)
                self.assertEqual(section_html.count(f'src="assets/{asset_name}"'), 1)
                self.assertRegex(image_tag, r'\balt=["\'][^"\']{9,}["\']')
                self.assertRegex(image_tag, r'\bwidth=["\']\d+["\']')
                self.assertRegex(image_tag, r'\bheight=["\']\d+["\']')
                self.assertIn('loading="lazy"', image_tag)
                if asset_name not in {"resin-clock.jpg", "resin-message-coasters.jpg", "navkar-resin-frame.jpg", "personalized-floral-hoop.jpg"}:
                    self.assertIn('decoding="async"', image_tag)
        for card in cards:
            with self.subTest(card=card[:80]):
                self.assertNotIn("<button", card)

        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertNotRegex(css, r"\.studio-art-section \.work-card img\s*\{")

    def test_testimonial_section_is_compact_buying_help(self):
        parser = MarkupTreeParser()
        parser.feed(self.html)
        owners = []
        for root in parser.roots:
            owners.extend(find_nodes(root, "data-carousel"))
        testimonials = [owner for owner in owners if owner["attrs"].get("data-carousel") == "testimonials"]
        self.assertEqual(len(testimonials), 0)

        section = re.search(r'<section\b[^>]*id=["\']testimonials["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        section_html = section.group(0)
        self.assertIn('<p class="eyebrow">Before you order</p>', section_html)
        self.assertIn('<h2 id="testimonials-title">Know what your gift will include.</h2>', section_html)
        self.assertIn('Ask Saloni about your chosen product, personalisation, finish, packaging and delivery before confirming your order.', section_html)
        self.assertRegex(section_html, r'<a\b[^>]*href=["\']#order["\'][^>]*data-order-prefill=["\']general["\'][^>]*>Ask Saloni about a gift')
        self.assertNotIn('data-testimonial-card', section_html)
        self.assertNotIn('data-carousel', section_html)
        self.assertNotRegex(section_html, re.compile(r'Gaurav Jain|Atishay Jain|Aarti Suthar|Bharat Sharma|Puchki|Rating:|★★★★★|★★★★', re.I))
        self.assertNotRegex(section_html, re.compile(r'<(?:blockquote|cite)\b', re.I))
        self.assertNotRegex(self.html, re.compile(r'"@type"\s*:\s*"(?:Review|AggregateRating)"', re.I))

    def test_festive_offers_area_stays_inline_without_unsupported_claims(self):
        self.assertRegex(self.html, r'<a href="#diwali"(?: data-category-shortcut="diwali")?>Browse Diwali designs')
        self.assertIn('<p class="festive-banner shell" id="festive-offers">', self.html)
        self.assertIn('id="festive-offers"', self.html)
        self.assertIn('id="festive-offers-fallback"', self.html)
        self.assertNotRegex(self.html, r'<dialog\b[^>]*festive-offers')
        self.assertNotIn("special discounts", self.html)
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertNotIn(".offers-section", css)
        self.assertNotIn("festive-dialog", css)
        self.assertNotIn("festive-noscript", css)
        script = (ROOT / "script.js").read_text(encoding="utf-8")
        self.assertNotIn("initFestiveOffers", script)
        self.assertNotIn('aria-controls="festive-offers"', script)

    def test_studio_catalogue_prices_are_exact_and_scoped(self):
        studio_match = re.search(r'<section\b[^>]*id=["\']studio-art["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(studio_match)
        studio = studio_match.group(0)
        self.assertRegex(studio, r'Displayed prices are for pictured/base designs')
        self.assertRegex(studio, r'Size, materials, and personalisation can change the final quote; Saloni confirms the final quote')

        studio_matrix = {
            "studio-blue-mantra-frame.jpeg": ("5,499", "4,099", 25),
            "studio-lilac-symbol-rakhi.jpeg": ("499", "349", 30),
            "studio-little-brother-rakhi.jpeg": ("599", "399", 33),
            "studio-white-mantra-frame.jpeg": ("5,999", "4,599", 23),
            "studio-lilac-scalloped-tray.jpeg": ("599", "399", 33),
            "studio-floral-square-keepsake.jpeg": ("2,499", "1,999", 20),
            "studio-floral-hexagon-keepsake.jpeg": ("2,499", "1,999", 20),
            "studio-floral-handled-tray.jpeg": ("2,999", "2,299", 23),
            "concept-floral-memory-frame.webp": ("4,999", "3,999", 20),
            "concept-ocean-clock.webp": ("2,999", "2,199", 27),
            "concept-tray-hamper.webp": ("1,999", "1,499", 25),
            "concept-floral-coasters.webp": ("1,299", "999", 23),
            "resin-clock.jpg": ("2,999", "2,199", 27),
            "resin-message-coasters.jpg": ("1,799", "1,299", 28),
            "navkar-resin-frame.jpg": ("4,499", "3,499", 22),
            "personalized-floral-hoop.jpg": ("999", "599", 40),
        }
        hamper_match = re.search(r'<section\b[^>]*id=["\']hamper-rail["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(hamper_match)
        hamper = hamper_match.group(0)
        self.assertRegex(hamper, r'Displayed prices are for pictured/base designs')
        self.assertRegex(hamper, r'Size, materials, and personalisation can change the final quote; Saloni confirms the final quote')
        hamper_matrix = {
            "birthday-hamper.jpg": ("2,499", "1,799", 28),
            "car-theme-hamper.jpg": ("2,499", "1,799", 28),
            "holi-hamper.webp": ("2,199", "1,499", 32),
        }
        def assert_matrix(section_html, matrix, expected_cards=None, expected_pricing_blocks=None):
            cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*work-card[^"\']*["\'][\s\S]*?</article>', section_html)
            self.assertEqual(len(cards), expected_cards if expected_cards is not None else len(matrix))
            self.assertEqual(section_html.count('class="product-pricing"'), expected_pricing_blocks if expected_pricing_blocks is not None else len(matrix))
            for asset, (regular, festive, discount) in matrix.items():
                with self.subTest(asset=asset):
                    card = next((card for card in cards if f'assets/{asset}' in card), None)
                    self.assertIsNotNone(card)
                    pricing_blocks = re.findall(r'<dl\b[^>]*class=["\'][^"\']*product-pricing[^"\']*["\'][\s\S]*?</dl>', card)
                    self.assertEqual(len(pricing_blocks), 1)
                    pricing = pricing_blocks[0]
                    self.assertRegex(pricing, rf'<dt[^>]*>(?:Price|From)</dt>\s*<dd[^>]*>₹{re.escape(festive)}</dd>')

        assert_matrix(studio, studio_matrix, expected_cards=21, expected_pricing_blocks=21)
        assert_matrix(hamper, hamper_matrix)

        sunflower_assets = (
            "sunflower-resin-lamp.jpeg",
            "sunflower-floral-keepsakes.jpeg",
            "sunflower-plaque-easel.jpeg",
            "sunflower-plaque-hand.jpeg",
            "sunflower-keepsake-set.jpeg",
        )
        for asset in sunflower_assets:
            with self.subTest(sunflower_asset=asset):
                card = next((card for card in re.findall(r'<article\b[^>]*class=["\'][^"\']*work-card[^"\']*["\'][\s\S]*?</article>', studio) if f'assets/{asset}' in card), None)
                self.assertIsNotNone(card)
                self.assertIn("Starting at ₹599", card)
                self.assertEqual(studio.count(f'src="assets/{asset}"'), 1)

        self.assertEqual(studio.count('class="product-pricing"') + hamper.count('class="product-pricing"'), 24)
        self.assertNotIn("schema.org/Offer", self.html)

    def test_final_quote_note_lives_once_before_the_order_form(self):
        self.assertEqual(self.html.count(FINAL_QUOTE_NOTE), 1)
        order = re.search(r'<section\b[^>]*id=["\']order["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(order)
        order_html = order.group(0)
        self.assertEqual(order_html.count(FINAL_QUOTE_NOTE), 1)
        form_position = order_html.index('<p class="panel-label">Order request</p>')
        note_position = order_html.index(FINAL_QUOTE_NOTE)
        self.assertLess(note_position, form_position)
        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*(?:work-card|romantic-keepsake-card)[^"\']*["\'][\s\S]*?</article>', self.html)
        for card in cards:
            with self.subTest(card=card[:80]):
                self.assertNotIn(FINAL_QUOTE_NOTE, card)

    def test_art_lightbox_contract_preserves_product_catalogue(self):
        triggers = re.findall(r'<a\b[^>]*data-lightbox-trigger[^>]*>', self.html)
        self.assertEqual(len(triggers), 96)
        for trigger in triggers:
            with self.subTest(trigger=trigger):
                self.assertRegex(trigger, r'href=["\']assets/[^"\']+["\']')
                self.assertRegex(trigger, r'aria-label=["\'][^"\']+["\']')

        dialog_match = re.search(r'<dialog\b[^>]*id=["\']art-lightbox["\'][\s\S]*?</dialog>', self.html)
        self.assertIsNotNone(dialog_match)
        dialog = dialog_match.group(0)
        self.assertIn('id="art-lightbox"', dialog)
        self.assertRegex(dialog, r'aria-labelledby=["\'][^"\']+["\']')
        self.assertIn('id="lightbox-image"', dialog)
        self.assertIn('id="lightbox-caption"', dialog)
        self.assertIn('aria-label="Close enlarged artwork"', dialog)
        dialog_image = re.search(r'<img\b[^>]*id=["\']lightbox-image["\'][^>]*>', dialog)
        self.assertIsNotNone(dialog_image)
        self.assertNotRegex(dialog_image.group(0), r'\bsrc=')

        for section_id, cards, pricing_blocks in (("romantic-keepsakes", 14, 14), ("corporate-resin-gifts", 20, 20), ("studio-art", 21, 21), ("premium-collection", 14, 14), ("hamper-rail", 3, 3), ("diwali", 24, 24)):
            section = re.search(rf'<section\b[^>]*id=["\']{section_id}["\'][\s\S]*?</section>', self.html)
            self.assertIsNotNone(section)
            with self.subTest(section=section_id):
                card_class = 'class="work-card' if section_id != "romantic-keepsakes" else 'class="romantic-keepsake-card'
                self.assertEqual(section.group(0).count(card_class), cards)
                self.assertEqual(section.group(0).count('class="product-pricing"'), pricing_blocks)

    def test_generated_designs_are_studio_catalogue_cards(self):
        self.assertNotRegex(self.html, re.compile(r'id=["\']commission-concepts["\']|Concepts to commission|data-carousel=["\']commission-concepts["\']'))
        studio_match = re.search(r'<section\b[^>]*id=["\']studio-art["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(studio_match)
        studio = studio_match.group(0)
        expected = {
            "concept-floral-memory-frame.webp": ("Your flowers, held close", "4,999", "3,999", 20),
            "concept-ocean-clock.webp": ("A little blue hour", "2,999", "2,199", 27),
            "concept-tray-hamper.webp": ("A tray full of celebration", "1,999", "1,499", 25),
            "concept-floral-coasters.webp": ("Little messages, shared", "1,299", "999", 23),
        }
        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*work-card[^"\']*["\'][\s\S]*?</article>', studio)
        self.assertEqual(len(cards), 21)
        for asset, (title, regular, festive, discount) in expected.items():
            with self.subTest(asset=asset):
                card = next((card for card in cards if f'assets/{asset}' in card), None)
                self.assertIsNotNone(card)
                self.assertEqual(self.html.count(f'src="assets/{asset}"'), 1)
                self.assertIn(f">{title}</strong>", card)
                self.assertIn('class="work-card', card)
                self.assertNotIn('data-concept', card)
                self.assertNotIn("Concept preview · made to order", card)
                self.assertNotIn("Market reference", card)
                self.assertNotIn(FINAL_QUOTE_NOTE, card)
                pricing = re.search(r'<dl\b[^>]*class=["\'][^"\']*product-pricing[^"\']*["\'][\s\S]*?</dl>', card)
                self.assertIsNotNone(pricing)
                pricing_html = pricing.group(0)
                self.assertIn(pricing_html.count("<dt"), (1, 2))
                self.assertRegex(pricing_html, rf'<dt[^>]*>(?:Price|From)</dt>\s*<dd[^>]*>₹{re.escape(festive)}</dd>')
                image = re.search(r'<img\b[^>]*>', card)
                self.assertIsNotNone(image)
                image_tag = image.group(0)
                self.assertRegex(image_tag, r'alt=["\']Illustrative preview: [^"\']+["\']')
                self.assertIn('width="1024"', image_tag)
                self.assertIn('height="1024"', image_tag)
                self.assertIn('loading="lazy"', image_tag)
                self.assertIn('decoding="async"', image_tag)
                self.assertEqual(webp_dimensions(ROOT / f"assets/{asset}"), (1024, 1024))
                href = re.search(r'<a\b[^>]*data-lightbox-trigger[^>]*href=["\']([^"\']+)["\']', card).group(1)
                self.assertEqual(href, f"assets/{asset}")

        self.assertEqual(studio.count('data-lightbox-trigger'), 21)
        self.assertNotRegex((ROOT / "styles.css").read_text(encoding="utf-8"), r'\.concept-(?:section|card|note)')

    def test_premium_catalogue_preserves_all_photos_and_exact_price_states(self):
        section_match = re.search(r'<section\b[^>]*id=["\']premium-collection["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section_match)
        section = section_match.group(0)
        self.assertIn("Premium resin designs", section)
        self.assertIn("A preview of 14 premium design photos", section)
        self.assertIn('id="premium-collection-grid"', section)
        self.assertIn('aria-label="Premium resin designs"', section)
        self.assertIn('>View all</button>', section)
        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*work-card[^"\']*["\'][\s\S]*?</article>', section)
        self.assertEqual(len(cards), 14)
        self.assertEqual(section.count('data-lightbox-trigger'), 14)
        self.assertEqual(section.count('class="product-pricing"'), 14)
        prices = {
            "premium-midnight-blue-tiered-set.jpeg": "₹20,000–₹25,000",
            "premium-ivory-gold-tiered-set.jpeg": "₹20,000–₹25,000",
            "premium-champagne-two-tier-set.jpeg": "₹15,000",
            "premium-turquoise-tray-coasters.jpeg": "₹10,000–₹12,000",
            "premium-smoky-bronze-tray.jpeg": "Price on request",
            "premium-gemstone-mug-collection.jpeg": "Price on request",
            "premium-pastel-butterfly-trays.jpeg": "Price on request",
            "premium-champagne-white-tray.jpeg": "Price on request",
            "premium-silver-icy-blue-tray.jpeg": "Price on request",
            "premium-ocean-seashell-tray.jpeg": "₹5,000",
            "premium-turquoise-geode-glass-closeup.jpeg": "Price on request",
            "premium-turquoise-gold-wine-glasses.jpeg": "Price on request",
            "premium-turquoise-geode-glass-pair.jpeg": "Price on request",
            "premium-black-gold-glassware-set.jpeg": "₹10,000–₹12,000",
        }
        form = (ROOT / "apps-script" / "Form.html").read_text(encoding="utf-8")
        for asset, price in prices.items():
            with self.subTest(asset=asset):
                self.assertTrue((ROOT / "assets" / asset).is_file())
                self.assertEqual(section.count(f'src="assets/{asset}"'), 1)
                card = next(card for card in cards if f'assets/{asset}' in card)
                image = re.search(r'<img\b[^>]*>', card).group(0)
                self.assertRegex(image, r'alt=["\'][^"\']{9,}["\']')
                self.assertRegex(image, r'width=["\']\d+["\']')
                self.assertRegex(image, r'height=["\']\d+["\']')
                self.assertIn('loading="lazy"', image)
                self.assertIn('decoding="async"', image)
                self.assertIn(f">{price}</dd>", card)
                self.assertIn(f'"{asset}": true', form)
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertRegex(css, r'\.premium-collection-section[^}]*background:\s*#2f2522')
        self.assertIn(".premium-collection-section .premium-photo-card img", css)
        self.assertIn(".premium-collection-section .premium-photo-card figcaption .product-pricing > div:last-child dt", css)
        self.assertIn("object-fit: contain", css)

    def test_carousel_enhancement_is_progressive(self):
        self.assertEqual(self.html.count('class="catalogue-grid"'), 6)
        self.assertIn('data-catalogue-disclosure', self.html)
        self.assertIn('aria-expanded="false"', self.html)
        self.assertIn('.catalogue-grid', (ROOT / "styles.css").read_text(encoding="utf-8") if (ROOT / "styles.css").exists() else "")
        self.assertIn('DOMContentLoaded', (ROOT / "script.js").read_text(encoding="utf-8") if (ROOT / "script.js").exists() else "")

    def test_customizer_markup_contract(self):
        match = re.search(r'<section\b[^>]*id=["\']customizer["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(match)
        section = match.group(0)
        self.assertIn("Design your custom resin frame", section)
        self.assertIn('aria-labelledby="customizer-title"', section)
        self.assertIn('aria-label="Illustrative preview"', section)
        for control_id in (
            "frame-type", "border-style", "frame-preset", "filling-colour", "brush-colour",
            "border-colour", "personal-text", "reference-image", "image-size", "crop-zoom",
            "crop-x", "crop-y", "position-left", "position-centre", "position-right",
            "paint-toggle", "paint-clear",
            "customizer-reset", "copy-summary",
        ):
            with self.subTest(control_id=control_id):
                self.assertRegex(section, rf'\bid=["\']{control_id}["\']')
        self.assertIn('id="share-design"', section)
        self.assertIn('id="share-status"', section)
        self.assertIn('href="https://ig.me/m/saloniresin_art_studio"', section)
        self.assertIn("Open Saloni’s Instagram chat", section)
        self.assertRegex(section, r'<button\b[^>]*id="share-design"[^>]*type="button"[^>]*aria-describedby="share-guidance"[^>]*>Share design</button>')
        self.assertIn("Some apps may omit the text", section)
        for control_id in ("frame-type", "border-style", "frame-preset", "filling-colour", "brush-colour", "border-colour", "personal-text", "reference-image", "image-size", "crop-zoom", "crop-x", "crop-y", "position-left", "position-centre", "position-right", "paint-toggle"):
            with self.subTest(label_for=control_id):
                self.assertRegex(section, rf'<label\b[^>]*for=["\']{control_id}["\']')
        self.assertRegex(section, r'<fieldset\b[^>]*>\s*<legend[^>]*>Frame shape and size')
        self.assertRegex(section, r'<fieldset\b[^>]*>\s*<legend[^>]*>Colour story')
        self.assertRegex(section, r'<fieldset\b[^>]*>\s*<legend[^>]*>Personal details')
        self.assertRegex(section, r'<fieldset\b[^>]*>\s*<legend[^>]*>Finishing touches')
        self.assertRegex(section, r'<label\b[^>]*for=["\']personal-text["\']>Text\s*<textarea')
        self.assertNotIn("Message or mantra", section)
        self.assertIn('type="file"', section)
        self.assertRegex(section, r'accept=["\'][^"\']*(?:image/jpeg|image/png|image/webp)[^"\']*["\']')
        self.assertIn("10MB", section)
        self.assertIn('id="scene-canvas"', section)
        self.assertIn('id="customizer-summary"', section)
        self.assertIn("Images and paint stay on this device until you choose to share", section)
        self.assertIn("attach your image or a screenshot separately", section)
        self.assertIn('href="tel:8209238541"', section)
        self.assertIn('href="https://www.instagram.com/saloniresin_art_studio/"', section)

    def test_instagram_handoff_is_explicitly_manual(self):
        match = re.search(r'<section\b[^>]*id=["\']customizer["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(match)
        section = match.group(0)
        summary = re.search(r'<div class=["\']customizer-summary-card["\']>([\s\S]*?)</div>\s*</div>\s*</div>', section)
        self.assertIsNotNone(summary)
        summary_content = summary.group(1)
        self.assertIn('id="copy-summary"', summary_content)
        self.assertIn('id="copy-status"', summary_content)
        self.assertRegex(section, r'id=["\']download-preview["\'][^>]*>Download preview PNG</button>')
        self.assertRegex(section, r'id=["\']copy-summary["\'][^>]*>Copy design summary</button>')
        chat = re.search(r'<a\b[^>]*href=["\']https://ig\.me/m/saloniresin_art_studio["\'][^>]*aria-describedby=["\']instagram-chat-guidance["\'][^>]*>Open Saloni’s Instagram chat', section)
        self.assertIsNotNone(chat)
        download_position = section.index('id="download-preview"')
        copy_position = section.index('id="copy-summary"')
        chat_position = section.index('href="https://ig.me/m/saloniresin_art_studio"')
        share_position = section.index('id="share-design"')
        self.assertLess(download_position, copy_position)
        self.assertLess(copy_position, chat_position)
        self.assertLess(chat_position, share_position)
        guidance = re.search(r'<p\b[^>]*id=["\']instagram-chat-guidance["\'][^>]*>([\s\S]*?)</p>', section)
        self.assertIsNotNone(guidance)
        text = re.sub(r'<[^>]+>', ' ', guidance.group(1))
        self.assertRegex(text, r'(?i)attach the downloaded PNG.*paste the copied details.*tap Send')
        self.assertNotRegex(text, r'(?i)prefill|delivered|sent automatically')

    def test_customizer_script_contract_is_local_and_safe(self):
        script_path = ROOT / "customizer.js"
        self.assertTrue(script_path.is_file())
        script = script_path.read_text(encoding="utf-8")
        self.assertIn("10 * 1024 * 1024", script)
        self.assertIn("image/jpeg", script)
        self.assertIn("image/png", script)
        self.assertIn("image/webp", script)
        self.assertIn("URL.createObjectURL", script)
        self.assertIn("textContent", script)
        self.assertIn("navigator.clipboard", script)
        self.assertIn("paint-toggle", script)
        self.assertIn("paint-clear", script)
        self.assertIn("customizer-reset", script)
        self.assertNotIn("localStorage", script)
        self.assertNotIn("sessionStorage", script)
        self.assertNotRegex(script, re.compile(r'\bfetch\s*\('))

    def test_customizer_share_contract_is_native_and_truthful(self):
        script = (ROOT / "customizer.js").read_text(encoding="utf-8")
        self.assertIn("navigator.canShare", script)
        self.assertIn("navigator.share", script)
        self.assertIn("toDataURL(\"image/png\")", script)
        self.assertIn("files: [payload.file]", script)
        self.assertIn("text: payload.text", script)
        self.assertIn("title: payload.title", script)
        self.assertIn("AbortError", script)
        self.assertIn("state.shareInProgress", script)
        self.assertIn('shareStatus.textContent = ""', script)
        self.assertIn("Verify the photo and details before sending", script)
        self.assertIn("Download preview PNG, then Copy design summary, then open Saloni’s Instagram chat", script)
        self.assertIn("Attach the downloaded PNG, paste the copied details, then tap Send", script)

    def test_customizer_css_has_preview_and_mobile_layout_hooks(self):
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".customizer-section", css)
        self.assertIn(".customizer-preview", css)
        self.assertIn(".scene-canvas", css)
        self.assertIn(".brush-cursor", css)
        self.assertIn(".customizer-summary-card .button-line", css)
        self.assertIn(".customizer-summary-card .button-line { border-color: var(--ivory); background: transparent; color: var(--ivory); }", css)
        self.assertIn(".customizer-summary-card .button-line:disabled", css)
        self.assertIn(".customizer-summary-card #share-status", css)
        self.assertIn(".customizer-summary-card .customizer-status", css)
        self.assertIn("@media (max-width: 620px)", css)

    def test_customizer_interaction_regressions_have_contracts(self):
        script = (ROOT / "customizer.js").read_text(encoding="utf-8")
        css = (ROOT / "styles.css").read_text(encoding="utf-8")

        self.assertRegex(
            script,
            r'form\.addEventListener\("submit",\s*function \(event\) \{[\s\S]*?event\.preventDefault\(\);',
        )
        self.assertIn('id="scene-canvas"', self.html)
        self.assertIn('width="1200" height="1200"', self.html)
        self.assertNotIn("drawIllustrativeLabel", script)
        self.assertIn("drawGlobalResinGlaze", script)
        self.assertIn("state.strokes", script)
        self.assertIn("state.imageRequest", script)
        self.assertIn("imageLoading", script)
        self.assertIn("downloadPreview.disabled", script)
        self.assertIn("paintToggle.checked = false", script)
        self.assertRegex(css, r'\[hidden\]\s*\{\s*display:\s*none !important;')
        self.assertIn(".scene-canvas", css)
        self.assertIn(".brush-cursor", css)

        fallback = re.search(r'function fallbackCopy\(text\) \{([\s\S]*?)\n    \}', script)
        self.assertIsNotNone(fallback)
        self.assertIn("copySummary.focus()", fallback.group(1))

    def test_scene_canvas_and_download_contract(self):
        section = re.search(r'<section\b[^>]*id=["\']customizer["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        customizer = section.group(0)
        canvas = re.search(r'<canvas\b[^>]*id=["\']scene-canvas["\'][^>]*>', customizer)
        self.assertIsNotNone(canvas)
        self.assertIn('width="1200"', canvas.group(0))
        self.assertIn('height="1200"', canvas.group(0))
        self.assertRegex(canvas.group(0), r'tabindex=["\']0["\']')
        self.assertIn("Illustrative preview", customizer)
        self.assertIn('id="download-preview"', customizer)
        self.assertIn('id="download-status"', customizer)
        self.assertNotIn('id="preview-frame"', customizer)
        self.assertNotIn('id="reference-preview"', customizer)

    def test_multiline_photo_layout_and_clean_export_contract(self):
        section = re.search(r'<section\b[^>]*id=["\']customizer["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        customizer = section.group(0)
        textarea = re.search(r'<textarea\b[^>]*id=["\']personal-text["\'][^>]*>', customizer)
        self.assertIsNotNone(textarea)
        self.assertIn('rows="5"', textarea.group(0))
        self.assertNotIn("maxlength", textarea.group(0))
        self.assertIn("One line per row. Line breaks stay in the preview.", customizer)
        self.assertIn("Image size", customizer)
        self.assertIn('min="0.2"', customizer)
        self.assertIn('max="1"', customizer)
        self.assertIn("Fine-tune image crop", customizer)
        self.assertIn("Arrow keys move it when the preview is focused", customizer)
        self.assertIn('aria-describedby="image-placement-hint"', customizer)

        script = (ROOT / "customizer.js").read_text(encoding="utf-8")
        self.assertIn('context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, rect.x, rect.y, rect.width, rect.height)', script)
        self.assertIn("state.photoDrag.pointerId", script)
        self.assertIn('event.key === "Escape"', script)
        self.assertIn('function nudgePhotoLayout', script)
        self.assertIn('state.photoLayout.cropZoom', script)
        self.assertIn('state.photoLayout.cropX', script)
        self.assertIn('state.photoLayout.cropY', script)
        self.assertIn('sceneCanvas.addEventListener("lostpointercapture"', script)
        self.assertIn('downloadPreview.disabled = state.imageLoading || state.textOverflow', script)
        self.assertNotIn("drawIllustrativeLabel", script)

    def test_colour_dimension_and_paint_controls_are_accessible(self):
        section = re.search(r'<section\b[^>]*id=["\']customizer["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        customizer = section.group(0)
        for control_id in ("filling-colour", "brush-colour", "paint-colour", "filling-colour-hex", "brush-colour-hex", "paint-colour-hex", "frame-unit", "frame-preset", "frame-dimension-label", "paint-toggle"):
            with self.subTest(control_id=control_id):
                self.assertRegex(customizer, rf'\bid=["\']{control_id}["\']')
        for control_id in ("filling-colour", "brush-colour", "paint-colour"):
            with self.subTest(colour=control_id):
                self.assertRegex(customizer, rf'<input\b[^>]*type=["\']color["\'][^>]*id=["\']{control_id}["\']')
                self.assertRegex(customizer, rf'id=["\']{control_id}-error["\']')
        self.assertIn('inputmode="text"', customizer)
        self.assertIn('aria-keyshortcuts="Arrow keys, Shift+Arrow, Escape"', customizer)
        self.assertIn("inches", customizer)
        self.assertIn("feet", customizer)
        self.assertRegex(customizer, r'data-inches=["\'](?:6|8|10|12)["\']')

    def test_scene_renderer_and_export_contract(self):
        script = (ROOT / "customizer.js").read_text(encoding="utf-8")
        self.assertIn("CANVAS_SIZE = 1200", script)
        self.assertRegex(script, r'function renderPreview\s*\(')
        for helper in ("drawMarbling", "drawStones", "drawBotanicalOrnament", "drawPressedFlowers", "drawCropCover", "drawPaintStrokes", "drawGlobalResinGlaze"):
            with self.subTest(helper=helper):
                self.assertRegex(script, rf'function {helper}\s*\(')
        self.assertIn("sceneCanvas.toBlob", script)
        self.assertIn("createObjectURL", script)
        self.assertIn("download-preview", script)
        self.assertIn("ArrowLeft", script)
        self.assertIn("ArrowRight", script)
        self.assertIn("ArrowUp", script)
        self.assertIn("ArrowDown", script)
        self.assertIn('event.key === " "', script)
        self.assertIn('event.key === "Escape"', script)
        self.assertIn("drawImage", script)
        self.assertIn("Math.max", script)
        self.assertNotIn("Math.random", script)
        self.assertNotIn("localStorage", script)
        self.assertNotIn("sessionStorage", script)
        self.assertNotRegex(script, re.compile(r'\bfetch\s*\('))

    def test_scene_visual_language_and_colour_validation_contract(self):
        script = (ROOT / "customizer.js").read_text(encoding="utf-8")
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        for token in ("marbl", "speck", "gloss", "botanical", "pressed", "facet", "shadow"):
            with self.subTest(token=token):
                self.assertIn(token, script.lower())
        self.assertRegex(script, r'#[0-9A-Fa-f]{6}')
        self.assertIn("colour-error", css)
        self.assertIn("brush-cursor", css)
        self.assertIn("touch-action: none", css)

    def test_text_colour_control_updates_preview_and_summary(self):
        section = re.search(r'<section\b[^>]*id=["\']customizer["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        customizer = section.group(0)
        for control_id in ("text-colour", "text-colour-hex", "text-colour-error"):
            with self.subTest(control_id=control_id):
                self.assertRegex(customizer, rf'\bid=["\']{control_id}["\']')
        self.assertRegex(customizer, r'<input\b[^>]*type=["\']color["\'][^>]*id=["\']text-colour["\']')
        script = (ROOT / "customizer.js").read_text(encoding="utf-8")
        self.assertIn('text: "#2C2523"', script)
        self.assertRegex(script, r'text:\s*colourControl\("text-colour"\)')
        self.assertRegex(
            script,
            r'colors:\s*\{[\s\S]*?border:\s*DEFAULT_COLOURS\.border,\s*text:\s*DEFAULT_COLOURS\.text',
        )
        self.assertIn("state.colors.text", script)
        self.assertRegex(script, r'drawFittedText\([\s\S]*?state\.colors\.text')
        self.assertIn('"Text colour: " + state.colors.text', script)

    def test_review_findings_contracts(self):
        script = (ROOT / "customizer.js").read_text(encoding="utf-8")
        section = re.search(r'<section\b[^>]*id=["\']customizer["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        customizer = section.group(0)

        self.assertIn('id="detail-stones"', customizer)
        self.assertIn('value="Stones"', customizer)
        self.assertRegex(script, r'selectedDetails\(\)\.indexOf\("Stones"\)')
        self.assertRegex(script, r'function drawResinOverlay\s*\(')
        self.assertLess(script.index("drawCropCover(sceneContext"), script.index("drawGlobalResinGlaze(sceneContext"))
        self.assertRegex(script, r'function scallopedRoundPath\s*\(')
        self.assertRegex(script, r'function scallopedArchPath\s*\(')
        arch = re.search(r'function scallopedArchPath\([\s\S]*?\n    \}\n\n    function traceShape', script)
        self.assertIsNotNone(arch)
        self.assertRegex(arch.group(0), r'centerY - Math\.max\(0, radius - bump\) \* Math\.sin')
        self.assertRegex(arch.group(0), r'centerY - radius \* Math\.sin')
        self.assertNotRegex(script, r'\n\s*if \(scalloped\) scallopedPath\(')
        metrics_y = 92
        radius = 360
        self.assertAlmostEqual(metrics_y, metrics_y + radius - radius * math.sin(math.pi / 2))
        self.assertRegex(script, r'function normalisePoint\s*\(')
        self.assertIn('point.x * inner.width', script)
        self.assertIn('currentStroke.points.push', script)
        self.assertNotIn('state.paintMode', script)
        self.assertIn('function updateFramePresetLabels', script)
        self.assertNotIn('canonical', customizer.lower())


if __name__ == "__main__":
    unittest.main()
