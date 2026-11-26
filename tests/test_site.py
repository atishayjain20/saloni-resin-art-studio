from html.parser import HTMLParser
import html
import math
from pathlib import Path
import json
import re
import unittest
from unittest import mock
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


def jpeg_dimensions(path):
    """Read dimensions from the first JPEG start-of-frame marker without dependencies."""
    data = path.read_bytes()
    if data[:2] != b"\xff\xd8":
        raise AssertionError(f"Not a JPEG file: {path}")
    index = 2
    while index + 9 < len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        if marker in (0xC0, 0xC1, 0xC2):
            return (int.from_bytes(data[index + 7:index + 9], "big"), int.from_bytes(data[index + 5:index + 7], "big"))
        index += 2 + int.from_bytes(data[index + 2:index + 4], "big")
    raise AssertionError(f"Missing JPEG frame header: {path}")


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

FINAL_QUOTE_NOTE = "Final quote after size, materials and delivery."

ROMANTIC_CONCEPTS = (
    ("romantic-us-keychain-pair.webp", "Couple Name Keychain Pair", "Made to travel together, even when you cannot.", "599", "399", 33),
    ("romantic-floral-bookmark-set.webp", "Pressed Flower Bookmark Set", "Three little places to keep the chapters that feel like yours.", "999", "699", 30),
    ("romantic-calendar-coaster.webp", "Couple Date Calendar Coaster", "The day everything changed, circled for every ordinary morning after.", "1,199", "899", 25),
    ("romantic-first-rose-bracelet.webp", "Rose Petal Resin Bracelet", "One petal from the beginning, made wearable.", "899", "599", 33),
    ("romantic-heart-trinket-tray.webp", "Heart Resin Trinket Tray", "A soft place for rings, earbuds, and the little things you share.", "499", "349", 30),
    ("romantic-initial-desk-stand.webp", "Couple Initials Desk Stand", "Two letters, one small corner that belongs to both of you.", "999", "699", 30),
    ("romantic-botanical-pendant.webp", "Pressed Flower Name Pendant", "Pressed flowers and a name, kept close.", "599", "399", 33),
    ("romantic-ocean-memory-tray.webp", "Ocean Memory Resin Tray", "For the beach, trip, or city that became part of your story.", "1,799", "1,299", 28),
)

DIWALI_NEW_CONCEPTS = (
    ("diwali-marigold-petal-holder", "diwali-marigold-petal-holder-concept.webp", "Marigold Tealight Holder", "349", "249", 29, 'one LED tealight holder · LED not included · shown palette or custom colours', "A warm marigold-inspired cup for a soft festive glow."),
    ("diwali-ivory-mandala-holder", "diwali-ivory-mandala-holder-concept.webp", "Ivory Mandala Tealight Holder", "399", "299", 25, 'one LED tealight holder · LED not included · shown palette or custom colours', "An ivory mandala cup with a calm, hand-finished festive feel."),
    ("diwali-ruby-leaf-dish", "diwali-ruby-leaf-dish-concept.webp", "Ruby Leaf Dish", "999", "799", 20, 'one decorative dish · ritual items not included · shown palette or custom colours', "A ruby-red leaf dish for a small festive offering or accent."),
    ("diwali-saffron-tilak-duo", "diwali-saffron-tilak-duo-concept.webp", "Saffron Tilak Duo", "449", "349", 22, 'two mini dishes · tilak and rice not included · shown palette or custom colours', "Two saffron-toned mini dishes for tilak and rice."),
    ("diwali-pearl-rangoli-accent", "diwali-pearl-rangoli-accent-concept.webp", "Pearl Rangoli Accent", "499", "399", 20, 'one decorative accent · flowers and ritual items not included · shown palette or custom colours', "A pearly rangoli-inspired accent for an entryway or prayer corner."),
    ("diwali-emerald-led-holder-pair", "diwali-emerald-led-holder-pair-concept.webp", "Emerald Tealight Holder Pair", "999", "799", 20, 'pair of LED tealight holders · LEDs not included · shown palette or custom colours', "A pair of emerald cups for a jewel-toned LED-lit arrangement."),
    ("diwali-rose-petal-offering-plate", "diwali-rose-petal-offering-plate-concept.webp", "Rose Petal Offering Plate", "599", "449", 25, 'one decorative ritual plate · offerings not included · shown palette or custom colours', "A rosy ritual plate with a gentle petal-inspired edge."),
    ("diwali-golden-toran-charms", "diwali-golden-toran-charms-concept.webp", "Golden Toran Charms", "599", "449", 25, 'set of three hanging charms with cords · display props not included · shown palette or custom colours', "Three golden hanging charms to style a festive doorway or wall."),
    ("diwali-lotus-rangoli-duo", "diwali-lotus-rangoli-duo-concept.webp", "Lotus Rangoli Duo", "499", "399", 20, 'set of two decorative lotus pieces · flowers and ritual items not included · shown palette or custom colours', "Two lotus pieces for a small layered rangoli arrangement."),
    ("diwali-festive-keepsake-box", "diwali-festive-keepsake-box-concept.webp", "Festive Keepsake Box", "849", "649", 24, 'one small lidded box · contents not included · shown palette or custom colours', "A small lidded box for a keepsake, note, or festive token."),
)

CORPORATE_RESIN_GIFTS = (
    ("corporate-logo-keychain", "corporate-logo-keychain-concept.webp", "Logo resin keychain", "299", "199", 33, 'one keychain · keys and display props not included · shown palette or custom colours', "Clear resin with a name/initial and subtle brand-colour accents."),
    ("corporate-floral-bookmark", "corporate-floral-bookmark-concept.webp", "Pressed-flower bookmark", "249", "149", 40, 'one bookmark · books and display props not included · shown palette or custom colours', "A slim resin bookmark for welcome kits or thoughtful team gifts."),
    ("corporate-logo-paperweight", "corporate-logo-paperweight-concept.webp", "Logo paperweight", "499", "399", 20, 'one paperweight · desk contents and display props not included · shown palette or custom colours', "A polished desk keepsake with a logo or short message sealed inside."),
    ("corporate-desk-nameplate", "corporate-desk-nameplate-concept.webp", "Resin desk nameplate", "999", "799", 20, 'one nameplate · display props not included · shown palette or custom colours', "Personalised with a name, designation and brand colours."),
    ("corporate-logo-coaster-set", "corporate-logo-coaster-set-concept.webp", "Branded coaster set", "999", "749", 25, 'four-piece coaster set · food and drinks not included · shown palette or custom colours', "Four coordinated coasters for desks, meeting rooms or client kits."),
    ("corporate-fridge-magnet", "corporate-fridge-magnet-concept.webp", "Resin fridge magnet", "249", "179", 28, 'one piece · display props not included · shown palette or custom colours', "A compact branded keepsake for events and team celebrations."),
    ("corporate-desk-logo-stand", "corporate-desk-logo-stand-concept.webp", "Mini resin desk stand", "249", "179", 28, 'one piece · display props not included · shown palette or custom colours', "A small decorative resin stand for desks, reception counters or car dashboards."),
    ("corporate-recognition-award", "corporate-recognition-award-concept.webp", "Recognition resin award", "1,299", "899", 31, 'one piece · display props not included · shown palette or custom colours', "A modern personalised memento for milestones and appreciation."),
    ("corporate-desk-organizer", "corporate-desk-organizer-concept.webp", "Resin desk organiser", "1,299", "999", 23, 'one piece · pens and cards not included · shown palette or custom colours', "A compact pen and visiting-card holder with custom colours."),
    ("corporate-business-card-holder", "corporate-business-card-holder-concept.webp", "Resin Business Card Holder", "599", "449", 25, 'one card holder · cards not included · shown palette or custom colours', "A compact resin holder for a tidy stack of visiting cards."),
    ("corporate-phone-rest", "corporate-phone-rest-concept.webp", "Resin Phone Rest", "699", "499", 29, 'one phone rest · phone not included · shown palette or custom colours', "A steady resin rest for a phone on a desk or bedside table."),
    ("corporate-pen-cup", "corporate-pen-cup-concept.webp", "Resin Pen Cup", "899", "699", 22, 'one pen cup · stationery not included · shown palette or custom colours', "A polished pen cup with a clean, colourful resin finish."),
    ("corporate-desk-trinket-tray", "corporate-desk-trinket-tray-concept.webp", "Desk Trinket Tray", "599", "449", 25, 'one tray · contents not included · shown palette or custom colours', "A small catch-all tray for a desk, console, or bedside table."),
    ("corporate-lanyard-charm", "corporate-lanyard-charm-concept.webp", "Personalised Lanyard Charm", "299", "199", 33, 'one charm with clasp · lanyard not included · shown palette or custom colours', "A personalised charm that clips onto a lanyard or bag."),
    ("corporate-mini-photo-stand", "corporate-mini-photo-stand-concept.webp", "Mini Photo Stand", "399", "299", 25, 'one base with metal clip · print not included · shown palette or custom colours', "A compact photo stand for a desk memory or team note."),
    ("corporate-bag-tag", "corporate-bag-tag-concept.webp", "Personalised Bag Tag", "399", "299", 25, 'one tag with strap · bag not included · shown palette or custom colours', "A personalised resin tag with a simple strap for a bag or case."),
    ("corporate-desk-clock", "corporate-desk-clock-concept.webp", "Mini Resin Desk Clock", "1,299", "999", 23, 'one clock with stand · battery not included · shown palette or custom colours', "A small resin clock to add a considered accent to a work desk."),
    ("corporate-bookmark-keychain-duo", "corporate-bookmark-keychain-duo-concept.webp", "Welcome Keepsake Duo", "599", "449", 25, 'two-piece bookmark and keychain set · books and keys not included · shown palette or custom colours', "A bookmark and keychain duo for a useful welcome keepsake."),
    ("corporate-desk-essentials-set", "corporate-desk-essentials-set-concept.webp", "Desk Essentials Set", "1,499", "1,199", 20, 'one pen cup + one trinket tray · stationery and desk contents not included · shown palette or custom colours', "A coordinated pen cup and trinket tray for a complete desk set."),
)


MARRIAGE_GIFTS = (
    ("marriage-ring-platter", "Engagement Ring Platter", "1,499", "1,874", "8 in"),
    ("marriage-couple-nameplate", "Mr &amp; Mrs Name Plate", "1,799", "2,249", "8 × 12 in"),
    ("marriage-varmala-frame", "Varmala Keepsake Frame", "3,499", "4,374", "10 × 12 in"),
    ("marriage-ring-dish", "Save the Date Ring Dish", "599", "749", "4 in"),
    ("marriage-invite-frame", "Wedding Card Keepsake", "1,499", "1,874", "8 × 10 in"),
    ("marriage-mehendi-platter", "Haldi &amp; Mehendi Platter", "1,299", "1,624", "10 in"),
    ("marriage-jewellery-tray", "Bride's Jewellery Tray", "999", "1,249", "7 in"),
    ("marriage-photo-clock", "Engagement Photo Clock", "2,499", "3,124", "12 in"),
    ("marriage-initial-pendant", "Fiancé Initial Pendant", "499", "624", "1 in"),
    ("marriage-bouquet-block", "Proposal Bouquet Keepsake", "2,999", "3,749", "6 in"),
)

class StaticSiteContractTests(unittest.TestCase):
    def assert_square_image_matches_file(self, image_tag, path):
        """Concept previews stay square, are never upscaled past 1024 px, and declare their real pixel size."""
        width, height = webp_dimensions(path)
        self.assertEqual(width, height, path)
        self.assertLessEqual(width, 1024, path)
        self.assertIn(f'width="{width}"', image_tag)
        self.assertIn(f'height="{height}"', image_tag)

    @classmethod
    def setUpClass(cls):
        cls.html_path = ROOT / "index.html"
        cls.html = cls.html_path.read_text(encoding="utf-8") if cls.html_path.exists() else ""

    def test_page_has_required_sections_and_accessibility_hooks(self):
        required_ids = [
            "main-content", "hero", "diwali", "studio-art",
            "order", "footer",
        ]
        for section_id in required_ids:
            with self.subTest(section_id=section_id):
                self.assertRegex(self.html, rf'id=["\']{section_id}["\']')
        self.assertIn('href="#main-content"', self.html)
        self.assertNotIn('id="lightbox-previous"', self.html)
        self.assertNotIn('id="lightbox-next"', self.html)
        self.assertIn('class="site-script"', self.html)

    def test_catalogue_offers_are_concrete_and_preserve_verified_values(self):
        cards = re.findall(
            r'<article\b[^>]*class=["\'][^"\']*(?:work-card|romantic-keepsake-card)[^"\']*["\'][\s\S]*?</article>',
            self.html,
        )
        self.assertEqual(len(cards), 106)
        expected_prices = [
            "₹1,499", "₹1,799", "₹3,499", "₹599", "₹1,499", "₹1,299", "₹999", "₹2,499", "₹499", "₹2,999", "₹399", "₹699",
            "₹899", "₹599", "₹349", "₹699", "₹399", "₹1,299", "₹2,499", "₹3,000", "₹599", "₹199", "₹149", "₹399",
            "₹799", "₹749", "₹179", "₹179", "₹899", "₹999", "₹449", "₹499", "₹699", "₹449", "₹199", "₹299",
            "₹299", "₹999", "₹449", "₹1,199", "₹4,099", "₹349", "₹399", "₹4,599", "₹1,799", "₹1,799", "₹399", "₹1,999",
            "₹1,999", "₹2,299", "₹3,999", "₹2,199", "₹999", "₹2,199", "₹2,199", "₹2,199", "₹2,199", "₹2,199", "₹2,199", "₹2,199",
            "₹1,299", "₹3,499", "₹599", "₹599", "₹599", "₹599", "₹599", "₹599", "₹22,500", "₹22,500", "₹15,000", "₹11,000",
            "₹5,000", "₹7,500", "₹12,000", "₹5,000", "₹5,000", "₹5,000", "₹1,800", "₹2,500", "₹3,500", "₹11,000", "₹249", "₹325",
            "₹399", "₹399", "₹849", "₹899", "₹299", "₹249", "₹1,499", "₹649", "₹599", "₹349", "₹449", "₹399",
            "₹249", "₹299", "₹799", "₹349", "₹399", "₹799", "₹449", "₹449", "₹399", "₹649",
        ]
        actual_prices = []
        for index, card in enumerate(cards, 1):
            pricing = re.search(r'<dl\b[^>]*class=["\'][^"\']*product-pricing[^"\']*["\'][\s\S]*?</dl>', card)
            self.assertIsNotNone(pricing, f"card {index} has catalogue pricing")
            rows = re.findall(r'<div><dt>([^<]+)</dt><dd>([^<]+)</dd>(?:<dd class="product-size-count">[2-3] sizes</dd>)?</div>', pricing.group(0))
            self.assertTrue(rows, f"card {index} has a price row")
            self.assertEqual(rows[0][0], "Price", f"card {index} uses a concrete price label")
            self.assertNotIn("From", pricing.group(0))
            self.assertNotIn("Starting at", pricing.group(0))
            actual_prices.append(rows[0][1])
        self.assertEqual(actual_prices, expected_prices)
        self.assertEqual(actual_prices.count("Price on request"), 0)

        jewel = re.search(r'<article\b[^>]*id=["\']diwali-jewel-glow["\'][\s\S]*?</article>', self.html).group(0)
        self.assertIn("one holder", jewel)
        self.assertIn("₹249", jewel)
        self.assertIn("4 in", jewel)
        self.assertNotRegex(jewel, re.compile(r"candle|available colou?r", re.I))

        floral = re.search(r'<article\b[^>]*id=["\']diwali-floral-swastik-tealight-set["\'][\s\S]*?</article>', self.html).group(0)
        self.assertIn("two holders and one flower", floral)
        self.assertIn("three-piece set", floral)
        emerald = re.search(r'<article\b[^>]*id=["\']diwali-emerald-led-holder-pair["\'][\s\S]*?</article>', self.html).group(0)
        self.assertIn("LEDs not included", emerald)
        business_card = re.search(r'<article\b[^>]*id=["\']corporate-business-card-holder["\'][\s\S]*?</article>', self.html).group(0)
        self.assertIn("one card holder", business_card)
        self.assertIn("cards not included", business_card)

        festive_set = "1 main platter (6 in) + 3 tealight holders + 2 Shubh/Labh plaques + 1 flower diya (7 pieces) · tealights and display props not included · shown palette or custom colours"
        for card_id in ("diwali-rose-gold", "diwali-lotus-blue"):
            card = re.search(rf'<article\b[^>]*id=["\']{card_id}["\'][\s\S]*?</article>', self.html).group(0)
            self.assertIn(festive_set, card)

    def test_catalogue_cards_have_concrete_inclusion_and_colour_copy(self):
        cards = re.findall(
            r'<article\b[^>]*class=["\'][^"\']*(?:work-card|romantic-keepsake-card)[^"\']*["\'][\s\S]*?</article>',
            self.html,
        )
        self.assertEqual(len(cards), 106)
        for index, card in enumerate(cards, 1):
            paragraphs = re.findall(r'<p\b[^>]*>([\s\S]*?)</p>', card)
            self.assertEqual(len(paragraphs), 2, f"card {index} has one description and one specification paragraph")
            specification = re.sub(r'<[^>]+>', '', paragraphs[1]).strip()
            self.assertRegex(specification, r"not included", f"card {index} states an exclusion")
            self.assertIn("shown palette or custom colours", specification, f"card {index} states colour guidance")

        def card_by_id(card_id):
            return re.search(rf'<article\b[^>]*id=["\']{card_id}["\'][\s\S]*?</article>', self.html).group(0)

        self.assertIn(
            "one holder · tealight not included · shown palette or custom colours",
            card_by_id("diwali-jewel-glow"),
        )
        festive_set = "1 main platter (6 in) + 3 tealight holders + 2 Shubh/Labh plaques + 1 flower diya (7 pieces) · tealights and display props not included · shown palette or custom colours"
        for card_id in ("diwali-rose-gold", "diwali-lotus-blue"):
            with self.subTest(card_id=card_id):
                self.assertIn(festive_set, card_by_id(card_id))
        self.assertIn(
            "pair of LED tealight holders · LEDs not included · shown palette or custom colours",
            card_by_id("diwali-emerald-led-holder-pair"),
        )
        self.assertIn(
            "one phone rest · phone not included · shown palette or custom colours",
            card_by_id("corporate-phone-rest"),
        )
        self.assertIn(
            "one tray + four coasters · food and display props not included · shown palette or custom colours",
            card_by_id("premium-turquoise-tray"),
        )

    def test_diwali_collection_contract(self):
        assets = [
            "diwali-jewel-glow-tealight.jpg",
            "diwali-happy-diwali-glow.webp",
            "diwali-shubh-labh-welcome-pair.jpg",
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
        hero_start = self.html.index('<section class="hero-banner shell"')
        hero_end = self.html.index('</section>', hero_start) + len('</section>')
        diwali_start = self.html.index(section_html)
        self.assertLess(hero_end, diwali_start)
        # Owner decision: Diwali is the last product collection, after Premium and before the customizer.
        sections = re.findall(r'<section\b[^>]*\bid="([^"]+)"', self.html[:self.html.index("</main>")])
        self.assertEqual(sections, ["hero", "marriage-gifts", "romantic-keepsakes", "corporate-resin-gifts", "studio-art", "premium-collection", "diwali", "customizer", "order", "customer-reviews"])
        self.assertNotIn('id="offerings"', self.html)
        self.assertNotRegex(self.html, r'<a href="#diwali"(?: data-category-shortcut="diwali")?>Browse Diwali designs')
        self.assertNotRegex(self.html, r'<a href="#diwali" data-category-shortcut="diwali">Diwali')
        self.assertIn('<h2 id="diwali-title">Little lights. Lovely beginnings.</h2>', section_html)
        self.assertNotIn("Diwali prices ₹249–₹1,799", section_html)
        self.assertNotIn("Some catalogue images are illustrative or reference ideas.", self.html)
        self.assertIn('id="diwali-grid"', section_html)
        self.assertIn('class="catalogue-grid"', section_html)
        self.assertIn('role="list"', section_html)
        self.assertIn('aria-label="Diwali designs"', section_html)
        self.assertIn('aria-controls="diwali-grid"', section_html)
        self.assertIn('data-catalogue-disclosure', section_html)
        self.assertIn('aria-expanded="false"', section_html)
        all_cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*work-card[^"\']*["\'][\s\S]*?</article>', section_html)
        self.assertEqual(len(all_cards), 24)
        # The Labh floral hanging pair sits next to the Shubh Labh pair; the original order is checked without it.
        cards = [card for card in all_cards if 'id="diwali-labh-hanging"' not in card][:14]
        self.assertEqual(section_html.count('data-lightbox-trigger'), 24)
        self.assertEqual(section_html.count('class="product-pricing"'), 24)
        card_ids = [re.search(r'id=["\']([^"\']+)["\']', card).group(1) for card in cards]
        self.assertEqual(
            card_ids[-5:],
            [
                "diwali-om-mini-tilak-plate",
                "diwali-lotus-diya-pair",
                "diwali-peacock-mini-pooja-thali",
                "diwali-floral-swastik-tealight-set",
                "diwali-marigold-petal-holder",
            ],
        )
        self.assertNotIn('data-order-prefill="catalogue"', section_html)
        reference_notes = {
            "diwali-jewel-glow-tealight.jpg": 'one holder · tealight not included · shown palette or custom colours',
            "diwali-happy-diwali-glow.webp": 'one holder · tealight not included · shown palette or custom colours.',
            "diwali-shubh-labh-welcome-pair.jpg": 'pair shown · ritual items not included · shown palette or custom colours',
            "diwali-rose-gold-festive-set.jpeg": '1 main platter (6 in) + 3 tealight holders + 2 Shubh/Labh plaques + 1 flower diya (7 pieces) · tealights and display props not included · shown palette or custom colours',
            "diwali-lotus-blue-festive-set.jpeg": '1 main platter (6 in) + 3 tealight holders + 2 Shubh/Labh plaques + 1 flower diya (7 pieces) · tealights and display props not included · shown palette or custom colours',
            "diwali-gold-fleck-lotus-light.jpeg": 'one holder · tealight not included · shown palette or custom colours',
            "diwali-pastel-lotus-tealight.jpeg": 'one holder · tealight not included · shown palette or custom colours',
            "diwali-ocean-bloom-pooja-platter.jpg": 'one platter · ritual items not included · shown palette or custom colours',
            "diwali-golden-ganesha-pooja-plate.jpg": 'one plate · ritual items not included · shown palette or custom colours',
            "diwali-om-mini-tilak-plate.webp": 'one plate · tilak and rice not included · shown palette or custom colours',
            "diwali-lotus-diya-pair.webp": 'pair of diyas · tealights not included · shown palette or custom colours',
            "diwali-peacock-mini-pooja-thali.webp": 'one thali · ritual items not included · shown palette or custom colours',
            "diwali-floral-swastik-tealight-set.webp": 'two holders and one flower (three-piece set) · tealights not included · shown palette or custom colours',
        }
        price_matrix = {
            "Jewel Resin Tealight Holder": ("349", "249", "29"),
            "Shubh Labh Door Hanging Pair": ("499", "399", "20"),
            "Rose &amp; Gold Festive Set": ("1,099", "849", "23"),
            "Lotus Blue Festive Set": ("1,199", "899", "25"),
            "Gold Fleck Lotus Tealight Holder": ("399", "299", "25"),
            "Pastel Lotus Tealight Holder": ("349", "249", "29"),
            "Ocean Bloom Pooja Platter": ("2,399", "1,499", "25"),
            "Golden Ganesha Pooja Plate": ("499", "649", "30"),
            "Om Mini Tilak Plate": ("349", "599", "29"),
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
        self.assertRegex(happy_diwali_pricing, r'<dt[^>]*>(?:Price|From)</dt>\s*<dd[^>]*>₹325</dd>')
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
        self.assertIn('button.textContent = "Add to cart"', script)

    def test_diwali_expansion_appends_ten_new_concept_cards(self):
        section = re.search(r'<section\b[^>]*id=["\']diwali["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        section_html = section.group(0)
        self.assertNotIn("A preview of 23 festive designs for your home and your people. Diwali prices ₹249–₹1,799.", section_html)
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
                self.assert_square_image_matches_file(image.group(0), ROOT / "assets" / asset)
                pricing = re.search(r'<dl\b[^>]*class=["\'][^"\']*product-pricing[^"\']*["\'][\s\S]*?</dl>', card)
                self.assertIsNotNone(pricing)
                self.assertRegex(pricing.group(0), rf'<dt[^>]*>(?:Price|From)</dt>\s*<dd[^>]*>₹{re.escape(festive)}</dd>')

    def test_corporate_expansion_appends_ten_new_concept_cards(self):
        section = re.search(r'<section\b[^>]*id=["\']corporate-resin-gifts["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        section_html = section.group(0)
        self.assertNotIn("A preview of 19 branded keepsakes and gift sets for welcome kits, desks, milestones and festive thank-yous.", section_html)
        self.assertNotIn("Crossed-out regular prices", section_html)
        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*work-card[^"\']*["\'][\s\S]*?</article>', section_html)
        self.assertEqual(len(cards), 19)
        new_ids = [item[0] for item in CORPORATE_RESIN_GIFTS[-10:]]
        self.assertEqual([re.search(r'\bid=["\']([^"\']+)', card).group(1) for card in cards[-10:]], new_ids)
        self.assertEqual(section_html.count("data-lightbox-trigger"), 19)
        self.assertEqual(section_html.count('class="product-pricing"'), 19)
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
                self.assert_square_image_matches_file(image.group(0), ROOT / "assets" / asset)
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
            r"padding:\s*clamp\(1\.25rem,\s*3\.5vw,\s*3rem\)\s+clamp\(1rem,\s*4vw,\s*3\.5rem\)",
        )

    def test_marriage_collection_contract(self):
        match = re.search(r'<section\b[^>]*id="marriage-gifts"[\s\S]*?</section>', self.html)
        self.assertIsNotNone(match)
        section = match.group(0)
        self.assertLess(match.start(), self.html.index('id="romantic-keepsakes"'))
        self.assertIn('<h2 id="marriage-gifts-title">', section)
        self.assertIn('id="marriage-gifts-grid"', section)
        self.assertIn('data-catalogue-disclosure', section)

        cards = re.findall(r'<article\b[^>]*class="work-card[^"]*"[\s\S]*?</article>', section)
        self.assertEqual([re.search(r'\bid="([^"]+)"', card).group(1) for card in cards], [item[0] for item in MARRIAGE_GIFTS])
        for card, (stem, title, price, regular, size) in zip(cards, MARRIAGE_GIFTS):
            with self.subTest(stem=stem):
                self.assertIn(f"<strong>{title}</strong>", card)
                self.assertIn(f'src="assets/{stem}.webp"', card)
                self.assertRegex(card, r'alt="Illustrative preview: [^"]+"')
                trigger = re.search(r'<a\b[^>]*data-lightbox-trigger[^>]*>', card).group(0)
                names = re.search(r'data-ai-images="([^"]*)"', trigger).group(1).split()
                self.assertGreaterEqual(len(names), 2)
                for name in names:
                    self.assertTrue((ROOT / "assets" / "ai-images" / f"{stem}--{name}.webp").is_file(), name)
                self.assertTrue((ROOT / "assets" / f"{stem}.webp").is_file())
                self.assertIn(f'<dt>Price</dt><dd>₹{price}</dd>', card)
                self.assertNotRegex(card, r'<s>|product-regular-price|% off')
                self.assertIn(f"<dt>Size</dt><dd>{size}</dd>", card)
                self.assertEqual(card[:card.index("<dl")].count("<p"), 2)

        self.assertIn('<a class="category-tab" href="#marriage-gifts" data-category-shortcut="marriage" data-category-tab="marriage">Marriage</a>', self.html)
        self.assertIn('<option value="marriage">Marriage gifts</option>', self.html)
        script = (ROOT / "script.js").read_text(encoding="utf-8")
        self.assertIn('if (id === "marriage-gifts") return "marriage";', script)
        self.assertRegex(script, r'var validTypes = \[[^\]]*"marriage"')

    def test_primary_navigation_has_partner_circle_link_and_clickable_pills(self):
        nav_match = re.search(r'<nav class="site-nav"[\s\S]*?</nav>', self.html)
        self.assertIsNotNone(nav_match)
        nav = nav_match.group(0)
        self.assertRegex(
            nav,
            r'<a href="#catalogue-filters" data-browse-all>Gifts[\s\S]*?'
            r'<a href="#customizer" data-customizer-open>Design a frame[\s\S]*?'
            r'<a href="corporate-gifting/">Corporate orders[\s\S]*?'
            r'<a href="partners/">Partner Circle[\s\S]*?'
            r'<a href="#my-orders-dialog" data-my-orders-open>My orders[\s\S]*?'
            r'<a href="#favourites-dialog" data-favourites-open>My favourites',
        )
        # The owner removed these shortcuts from the menu; the category tabs below the header still cover them.
        for label in ("Bestsellers", "Marriage gifts", "Couple keepsakes", "Resin frames"):
            self.assertNotIn(">" + label + " <", nav)
        self.assertEqual(nav.count("<a "), 6)
        self.assertNotIn('nav-cta', nav)
        self.assertNotIn('href="#process"', nav)
        self.assertNotIn(">The process<", nav)
        footer = re.search(r'<div class="footer-links">([\s\S]*?)</div>', self.html)
        self.assertIsNotNone(footer)
        self.assertRegex(footer.group(0), r'<a href="#studio-art" data-category-shortcut="frames">Resin art <svg class="category-icon" aria-hidden="true" focusable="false">[\s\S]*#frame[\s\S]*</a>')
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

    def test_stale_root_duplicates_are_removed(self):
        stale = (
            "Form.html",
            "form-flow.test.cjs",
            "order-flow.test.cjs",
            "catalogue-filter.test.cjs",
            "script-interactivity-recovery.test.cjs",
            "shopper-experience.test.cjs",
            "test_order_flow.py",
            "test_site.py",
        )
        for name in stale:
            with self.subTest(name=name):
                self.assertFalse((ROOT / name).exists(), f"{name} is a stale root copy")

    def test_seo_metadata_and_studio_namokar_label(self):
        title = "Custom Resin Art &amp; Gifts | Saloni Resin Art Studio"
        description = "Explore custom resin frames, personalized gifts and resin art from Saloni Resin Art Studio. Share your colours, theme and occasion with Saloni."
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
        self.assertNotIn("<strong>Blue mantra frame</strong>", card)

    def test_namokar_frames_are_named_by_colour(self):
        titles = {
            "blue-mantra-frame": "Blue and white Namokar (Navkar) mantra frame",
            "white-mantra-frame": "White and gold Namokar (Navkar) mantra frame",
            "navkar-resin-frame": "Pearl white Namokar (Navkar) mantra frame",
        }
        self.assertEqual(len(set(titles.values())), 3)
        sub_page = (ROOT / "namokar-mantra-frames" / "index.html").read_text(encoding="utf-8")
        json_ld = json.loads(re.search(r'<script\b[^>]*type=["\']application/ld\+json["\']>([\s\S]*?)</script>', sub_page).group(1))
        list_names = {item["url"].split("#")[1]: item["name"] for item in json_ld["mainEntity"]["itemListElement"]}
        for card_id, title in titles.items():
            with self.subTest(card_id=card_id):
                card = re.search(rf'<article\b[^>]*id="{card_id}"[\s\S]*?</article>', self.html).group(0)
                self.assertIn(f"<strong>{title}</strong>", card)
                self.assertEqual(list_names[card_id], title)
                link = re.search(rf'<h2>([^<]+)</h2>(?:(?!</figcaption>)[\s\S])*?href="\.\./#{card_id}"', sub_page)
                self.assertIsNotNone(link)
                self.assertEqual(link.group(1), title)

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
            "https://saloniresinart.com/namokar-mantra-frames/",
            "https://saloniresinart.com/varmala-preservation/",
            "https://saloniresinart.com/resin-clocks/",
            "https://saloniresinart.com/couple-gifts/",
            "https://saloniresinart.com/marriage-gifts/",
            "https://saloniresinart.com/celebration-lights/",
            "https://saloniresinart.com/resin-boards/",
            "https://saloniresinart.com/partners/",
            "https://saloniresinart.com/corporate-gifting/",
            "https://saloniresinart.com/reviews/",
            "https://saloniresinart.com/shipping-and-returns/",
            "https://saloniresinart.com/contact/",
            "https://saloniresinart.com/terms/",
            "https://saloniresinart.com/privacy/",
        ]
        product_urls = ["https://saloniresinart.com/p/" + slug + "/" for slug in card_slugs(self.html)]
        self.assertGreater(len(product_urls), 20)
        self.assertEqual([url.findtext("sm:loc", namespaces=namespace) for url in urls], expected_urls + product_urls)
        for url in urls:
            self.assertEqual(len(list(url)), 1)
        self.assertNotIn("#", sitemap_path.read_text(encoding="utf-8"))

    def test_corporate_page_touch_targets_are_at_least_44px_and_form_inputs_2_75rem(self):
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        nav = re.search(r"(?m)^\.corporate-page \.site-nav a \{([^}]*)\}", css).group(1)
        mark = re.search(r"(?m)^\.corporate-page \.site-header \.wordmark \{([^}]*)\}", css).group(1)
        for rule in (nav, mark):
            self.assertRegex(rule, r"min-height:\s*44px")
        self.assertIn("#review-form) textarea { width: 100%; min-height: 2.75rem;", css, "the four forms' inputs are at least 44px tall")
        self.assertRegex(css, r"#order-form \.bundle-item \.field-error, \.catalogue-selection-item-error \{[^}]*grid-column:\s*1 / -1")

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
            "namokar-mantra-frames": [
                "Compare the three finishes—blue and white, white and gold, and pearl white—then share the intended location and size.",
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
                customer_markup = re.sub(r'\s(?:src|srcset|href)=["\'][^"\']*["\']', "", page, flags=re.IGNORECASE)
                customer_markup = re.sub(r'\scontent=["\'][^"\']*(?:/assets/|\.(?:webp|jpe?g|png|svg))[^"\']*["\']', "", customer_markup, flags=re.IGNORECASE)
                self.assertNotRegex(customer_markup, re.compile(r"\bconcept\b", re.IGNORECASE))
        self.assertNotIn("A preview of 13 keepsake ideas for the two of you.", self.html)
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
            self.assertNotRegex(html, re.compile(r'<script\b(?![^>]*(?:analytics|google)\.js)[^>]+src=', re.I), slug)
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
            self.assertIn('href="../namokar-mantra-frames/"', html)
        self.assertEqual(len(titles), len(collection_specs))
        self.assertEqual(len(descriptions), len(collection_specs))
        self.assertEqual(len(headings), len(collection_specs))

    def test_under_499_gifts_is_the_first_category_tab(self):
        tabs = re.search(r'<div class="category-tabs-list">([\s\S]*?)</div>', self.html).group(1)
        first = re.search(r"<a\b[^>]*>[\s\S]*?</a>", tabs).group(0)
        self.assertEqual(first, '<a class="category-tab" href="?budget=499">Gifts under ₹499</a>')
        self.assertIn('<option value="499">Up to ₹499</option>', self.html)
        self.assertIn('"499"', (ROOT / "script.js").read_text(encoding="utf-8").split("validBudgets", 1)[1][:60])

    def test_varmala_preservation_page_contract(self):
        page_path = ROOT / "varmala-preservation" / "index.html"
        self.assertTrue(page_path.is_file(), "varmala-preservation/index.html must exist")
        page = page_path.read_text(encoding="utf-8")
        url = "https://saloniresinart.com/varmala-preservation/"
        title = "Varmala Preservation in Resin | Saloni Resin Art Studio"
        description = "Keep your wedding varmala (jaimala) flowers in a clear resin frame, handmade by Saloni in Ajmer and shipped across India."
        image = "https://saloniresinart.com/assets/share/varmala-keepsake-frame.jpg"
        card_alt = re.search(r'<article\b[^>]*\bid="marriage-varmala-frame"[\s\S]*?<img\b[^>]*\balt="([^"]+)"', self.html).group(1)
        self.assertIn(f"<title>{title}</title>", page)
        self.assertIn(f'<link rel="canonical" href="{url}">', page)
        for tag in (
            f'<meta property="og:url" content="{url}">',
            f'<meta property="og:title" content="{title}">',
            f'<meta name="twitter:title" content="{title}">',
            f'<meta name="description" content="{description}">',
            f'<meta property="og:description" content="{description}">',
            f'<meta name="twitter:description" content="{description}">',
            f'<meta property="og:image" content="{image}">',
            f'<meta name="twitter:image" content="{image}">',
            f'<meta property="og:image:alt" content="{card_alt}">',
            f'<meta name="twitter:image:alt" content="{card_alt}">',
        ):
            self.assertIn(tag, page)
        self.assertTrue((ROOT / "assets" / "share" / "varmala-keepsake-frame.jpg").is_file())
        h1s = re.findall(r"<h1\b[^>]*>([\s\S]*?)</h1>", page)
        self.assertEqual(len(h1s), 1)
        self.assertIn("Varmala preservation", h1s[0])
        self.assertIn("jaimala", page)
        scripts = re.findall(r'<script type="application/ld\+json">([\s\S]*?)</script>', page)
        self.assertEqual(len(scripts), 1)
        data = json.loads(scripts[0])
        self.assertEqual(data["@type"], "CollectionPage")
        self.assertEqual(data["url"], url)
        items = data["mainEntity"]["itemListElement"]
        self.assertEqual([item["url"] for item in items], ["https://saloniresinart.com/p/varmala-keepsake-frame/"])
        self.assertNotRegex(scripts[0], r"Offer|AggregateRating|Review|rating|price|availability")

        card = re.search(r'<article\b[^>]*\bid="marriage-varmala-frame"[\s\S]*?</article>', self.html).group(0)
        price = re.search(r"<dt>Price</dt><dd>(₹[\d,]+)</dd>", card).group(1)
        size = re.search(r"<dt>Size</dt><dd>([^<]+)</dd>", card).group(1)
        self.assertIn(price, page)
        self.assertIn(size, page)
        for sentence in (
            "Typical handmade production takes 4–5 days after design and advance confirmation.",
            "Shipping is across India: free on orders of ₹1,999 or more, otherwise ₹100 within Rajasthan and ₹150 to other states. Orders use protective packaging.",
            "Final quote after size, materials and delivery.",
            "she will check feasibility and try to meet it, but delivery is not promised until she confirms.",
            "Saloni normally replies within 5–6 working hours.",
        ):
            with self.subTest(sentence=sentence):
                self.assertIn(sentence, self.html)
                self.assertIn(sentence, page)
        self.assertIn('href="../?product=varmala-keepsake-frame#marriage-gifts"', page)
        for sentence in (
            "Also 8 × 10 in ₹2,599 and 12 × 15 in ₹4,749.",
            "Wedding season offer till 28 February 2027: every varmala frame comes with a free mini resin keychain made with a few flowers from your own varmala.",
            "In Ajmer city, Saloni picks up your varmala from your home or venue for free.",
            "From outside Ajmer, courier the flowers to the studio in Ajmer as soon as you can after the wedding; Saloni shares the address and packing tips on WhatsApp.",
        ):
            with self.subTest(season_sentence=sentence):
                self.assertIn(sentence, page)
        self.assertIn('data-product-slug="varmala-keepsake-frame"', self.html)
        whatsapp = re.search(r'<a\b[^>]*href="https://wa\.me/918209238541\?text=[^"]*"[^>]*>', page)
        self.assertIsNotNone(whatsapp)
        self.assertIn('rel="noopener"', whatsapp.group(0))

        videos = re.findall(r"<video\b[^>]*>", page)
        self.assertEqual(len(videos), 1)
        video = videos[0]
        for attribute in ("controls", "playsinline", 'preload="none"'):
            self.assertRegex(video, rf"\b{re.escape(attribute)}")
        self.assertNotRegex(video, r"\b(autoplay|loop|muted)\b")
        self.assertRegex(video, r'aria-label="Video: ')
        sources = [re.search(r'poster="([^"]+)"', video).group(1)] + re.findall(r'<source\b[^>]*\bsrc="([^"]+)"', page)
        self.assertEqual(len(sources), 2)
        for source in sources:
            self.assertTrue(source.startswith("../assets/reel-varmala-couple"), source)
            self.assertTrue((page_path.parent / source).resolve().is_file(), source)
        self.assertNotIn("Illustrative video made with AI", page)

        for image_tag in re.findall(r"<img\b[^>]*>", page):
            with self.subTest(image=image_tag):
                self.assertRegex(image_tag, r'\balt="[^"]+"')
                self.assertRegex(image_tag, r'\bwidth="\d+"')
                self.assertRegex(image_tag, r'\bheight="\d+"')
                src = re.search(r'\bsrc="([^"]+)"', image_tag).group(1)
                self.assertTrue((page_path.parent / src).resolve().is_file(), src)
        visible = re.sub(r'\b(?:alt|content)="[^"]*"', "", page)
        self.assertNotIn("Illustrative preview", visible)

        self.assertIn('<a class="skip-link" href="#main-content">', page)
        self.assertIn('<main id="main-content"', page)
        ids = set(re.findall(r'\bid="([^"]+)"', page))
        for labelled in re.findall(r'aria-labelledby="([^"]+)"', page):
            self.assertIn(labelled, ids)
        self.assertRegex(page, r'"\.\./script\.js\?v=\d+"')
        self.assertNotRegex(page, re.compile(r"\b(guarantee[sd]?|lifetime|refund(s|ed)?|returns?)\b", re.I))

    def test_shipping_and_returns_page_contract(self):
        page = (ROOT / "shipping-and-returns" / "index.html").read_text(encoding="utf-8")
        tags = PageTags()
        tags.feed(page)
        url = "https://saloniresinart.com/shipping-and-returns/"
        description = "Shipping across India from Ajmer: free on orders of ₹1,999+, otherwise ₹100 within Rajasthan, ₹150 to other states. No returns on customised pieces; transit damage support with photos and video."
        title = "Shipping and Returns | Saloni Resin Art Studio"
        self.assertEqual(tags.title, title)
        self.assertEqual(tags.meta["og:title"], title)
        self.assertEqual(tags.links["canonical"], url)
        self.assertEqual(tags.meta["og:url"], url)
        for key in ("description", "og:description", "twitter:description"):
            self.assertEqual(tags.meta[key], description, key)
        self.assertEqual(len(re.findall(r"<h1\b", page)), 1)
        self.assertIn('<h1 id="collection-title">Shipping and returns</h1>', page)
        for sentence in (
            "Shipping is across India: free on orders of ₹1,999 or more, otherwise ₹100 within Rajasthan and ₹150 to other states. Orders use protective packaging.",
            "Typical handmade production takes 4–5 days after design and advance confirmation.",
            "For an urgent date, tell Saloni the required date; she will check feasibility and try to meet it, but delivery is not promised until she confirms.",
            "Advance amount and payment terms are confirmed with the final design and quote before production starts.",
            "For transit damage or replacement support, contact Saloni promptly with photos, packaging, and an unboxing video. Saloni reviews the case and confirms the replacement resolution.",
            "Saloni will contact you to confirm the design, price, and delivery",
            "Saloni normally replies within 5–6 working hours.",
        ):
            with self.subTest(sentence=sentence):
                self.assertIn(sentence, self.html)
                self.assertIn(sentence, page)
        cancellation = re.search(r"<strong>Cancellation</strong><span>(.*?)</span>", page, re.S).group(1)
        self.assertEqual(cancellation, "To cancel an order, call or message Saloni on WhatsApp. You can also send a cancel request from My orders on the studio page, on the phone or computer you ordered from. For a paid order, Cancel order shows for 24 hours after you pay.")
        self.assertIn("My orders", cancellation)
        self.assertNotIn("confirms or declines", page)
        self.assertNotIn("Once paid, the advance is not refunded if you cancel.", page)
        self.assertIn("House No. 61, Hathi Bhata, Ajmer, Rajasthan, India. Open every day, 11:00 AM–4:00 PM.", page)
        self.assertIn('"openingHours": "Mo-Su 11:00-16:00"', self.html)
        self.assertIn('href="tel:+918209238541"', page)
        self.assertIn("https://www.instagram.com/saloniresin_art_studio/", page)
        for absent in ("application/ld+json", "<iframe", "public-forms.js", "my-orders.js"):
            self.assertNotIn(absent, page)
        self.assertNotRegex(page, re.compile(r"all sales final|under any circumstances|warrant|guarantee|lifetime|\bAct\b", re.I))
        ids = set(re.findall(r'\bid="([^"]+)"', page))
        for labelled in re.findall(r'aria-labelledby="([^"]+)"', page):
            self.assertIn(labelled, ids)
        self.assertIn('<a class="skip-link" href="#main-content">', page)
        self.assertIn('<main id="main-content"', page)
        self.assertIn('<a href="shipping-and-returns/">Shipping and returns</a>', re.search(r"<footer\b.*?</footer>", self.html, re.S).group(0))
        phrase = "depends on location"
        stale = ["index.html", "varmala-preservation/index.html", "tools/product_pages.py"] + ["%s/index.html" % slug for slug in ("resin-clocks", "couple-gifts", "marriage-gifts", "celebration-lights", "resin-boards")]
        for name in stale:
            with self.subTest(stale=name):
                self.assertNotIn(phrase, (ROOT / name).read_text(encoding="utf-8"))

    def test_every_page_footer_links_to_varmala_preservation(self):
        for page, href in (
            ("index.html", "varmala-preservation/"),
            ("corporate-gifting/index.html", "../varmala-preservation/"),
            ("partners/index.html", "../varmala-preservation/"),
            ("resin-photo-frames/index.html", "../varmala-preservation/"),
            ("namokar-mantra-frames/index.html", "../varmala-preservation/"),
            ("reviews/index.html", "../varmala-preservation/"),
            ("varmala-preservation/index.html", "../varmala-preservation/"),
            ("shipping-and-returns/index.html", "../varmala-preservation/"),
        ):
            with self.subTest(page=page):
                source = (ROOT / page).read_text(encoding="utf-8")
                footer = re.search(r'<div class="footer-links">([\s\S]*?)</div>', source)
                self.assertIsNotNone(footer)
                self.assertIn(f'<a href="{href}">Varmala preservation</a>', footer.group(1))

    def test_homepage_links_collections_and_stable_catalogue_cards(self):
        for slug in ("resin-photo-frames", "namokar-mantra-frames"):
            self.assertIn(f'href="{slug}/"', self.html)
        self.assertNotIn("customised-hampers/", self.html)
        for card_id in (
            "floral-memory-frame", "personalized-photo-clock", "rose-hexagon",
            "blue-mantra-frame", "white-mantra-frame", "navkar-resin-frame",
        ):
            self.assertRegex(self.html, rf'<article\b[^>]*\bid="{card_id}"')

    def test_retired_hamper_route_is_a_noindex_catalogue_redirect(self):
        html = (ROOT / "customised-hampers" / "index.html").read_text(encoding="utf-8")
        self.assertIn('<meta name="robots" content="noindex,follow">', html)
        self.assertIn('<meta http-equiv="refresh" content="0; url=../#catalogue-filters">', html)
        self.assertIn('<a href="../#catalogue-filters">Return to the studio catalogue</a>', html)
        self.assertNotRegex(html, re.compile(r"<script\b|<img\b", re.I))
        self.assertNotRegex(html, re.compile(r"hamper|hampers|customised", re.I))

    def test_homepage_uses_approved_visit_copy_without_stale_online_only_claim(self):
        self.assertIn("Visit Saloni Resin Art Studio at House No. 61, Hathi Bhata, Ajmer, Rajasthan, India.", self.html)
        self.assertIn("Open every day, 11:00 AM–4:00 PM.", self.html)
        self.assertNotIn("Online orders only", self.html)
        self.assertNotIn("no customer visits", self.html)

    def test_home_page_preconnects_to_the_order_form_hosts(self):
        head = self.html.split("</head>")[0]
        self.assertIn('<link rel="preconnect" href="https://script.google.com">', head)
        self.assertIn('<link rel="preconnect" href="https://script.googleusercontent.com" crossorigin>', head)

    def test_hero_banner_images_exist_with_real_dimensions_and_loading_rules(self):
        hero = re.search(r'<section\b[^>]*class=["\']hero-banner\b[\s\S]*?</section>', self.html)
        self.assertIsNotNone(hero)
        slides = re.findall(r'<article class="hero-slide[^"]*"[\s\S]*?</article>', hero.group(0))
        self.assertEqual(len(slides), 6)
        for slide_index, slide in enumerate(slides):
            images = re.findall(r'<img\b[^>]*>', slide)
            self.assertEqual(len(images), 3)
            for image_index, image in enumerate(images):
                with self.subTest(slide=slide_index + 1, image=image_index + 1):
                    src = re.search(r'\bsrc="assets/([^"]+)"', image).group(1)
                    path = ROOT / "assets" / src
                    self.assertTrue(path.is_file(), src)
                    expected = webp_dimensions(path) if src.endswith(".webp") else jpeg_dimensions(path)
                    self.assertIn(f'width="{expected[0]}"', image)
                    self.assertIn(f'height="{expected[1]}"', image)
                    self.assertGreater(len(re.search(r'\balt="([^"]*)"', image).group(1)), 8)
                    if slide_index == 0:
                        self.assertNotIn('loading="lazy"', image)
                        self.assertIn('loading="eager"', image)
                        self.assertEqual('fetchpriority="high"' in image, image_index == 0)
                    else:
                        self.assertIn('loading="lazy"', image)
                        self.assertIn('decoding="async"', image)
                        self.assertNotIn('fetchpriority', image)

    def test_hero_copy_keeps_the_heading_without_the_removed_intro(self):
        self.assertIn('<h1 id="hero-title" class="sr-only">Handmade resin gifts from Ajmer</h1>', self.html)
        self.assertNotIn("Made for the moment", self.html)
        self.assertNotIn('class="hero-intro"', self.html)
        hero = re.search(r'<section\b[^>]*class=["\']hero-banner\b[\s\S]*?</section>', self.html).group(0)
        self.assertNotRegex(hero, r'<h2|class="eyebrow"')
        self.assertEqual(len(re.findall(r'>Shop now</a>', hero)), 0)
        self.assertNotIn('hero-slide-photos', hero)
        self.assertNotIn('hero-slide-cta', hero)
        # Slides 2-6 share the promo layout of the design slide: copy on the left, three priced photos on the right.
        slides = re.findall(r'<article class="hero-slide[^"]*"[\s\S]*?</article>', hero)
        ctas = [
            ("premium", "#premium-collection", "Shop premium"),
            ("couple", "#romantic-keepsakes", "Shop couple gifts"),
            ("marriage", "#marriage-gifts", "Shop marriage gifts"),
            ("corporate", "#corporate-resin-gifts", "Shop corporate gifts"),
            ("diwali", "#diwali", "Shop Diwali gifts"),
        ]
        for slide, (shortcut, href, label) in zip(slides[1:], ctas):
            with self.subTest(slide=shortcut):
                self.assertIn(f'class="hero-slide hero-promo hero-promo-{shortcut}"', slide)
                self.assertIn('<div class="hero-promo-copy">', slide)
                self.assertIn('<ul class="hero-promo-picks"', slide)
                self.assertEqual(len(re.findall(r'<span class="hero-promo-tag"><span class="sr-only">[^<]+, </span><strong>₹[\d,]+</strong></span>', slide)), 3)
                self.assertIn(f'<a class="button hero-promo-cta" href="{href}" data-category-shortcut="{shortcut}">{label}</a>', slide)
                self.assertEqual(len(re.findall(r'<a\b', slide)), 1)
        self.assertEqual(len(slides), 6)
        self.assertNotRegex(hero, r'hero-promo-sale|20% off|Sale ends|Shop the sale|<s>')
        self.assertIn('id="hero-diwali-slide"', slides[5])
        self.assertIn('<p class="hero-slide-offer" hidden>', slides[5])
        self.assertNotIn("Thoughtful custom resin frames, resin art, and personalized gifts from Ajmer, Rajasthan", self.html)

    def test_romantic_keepsake_highlight_contract(self):
        section = re.search(r'<section\b[^>]*id=["\']romantic-keepsakes["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        section_html = section.group(0)
        self.assertIn('aria-labelledby="romantic-keepsakes-title"', section_html)
        self.assertIn("For the two of you", section_html)
        self.assertIn('<h2 id="romantic-keepsakes-title">Keep the moment close.</h2>', section_html)
        self.assertNotIn('href="#romantic-keepsakes" data-category-shortcut="couple">Explore the keepsakes', section_html)
        for phrase in (
            "Preserved Rose Hexagon Frame",
            "Couple Photo Resin Clock",
            "Preserved Red Rose Resin Display",
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

        self.assertEqual(section_html.count("<h3"), 11)
        self.assertIn('data-catalogue-disclosure', section_html)
        self.assertNotIn("work-card", section_html)
        self.assertEqual(section_html.count("data-lightbox-trigger"), 11)
        for asset in assets:
            with self.subTest(lightbox_asset=asset):
                asset_name = asset.removeprefix("assets/")
                trigger = re.search(rf'<a\b[^>]*class=["\']lightbox-trigger["\'][^>]*data-lightbox-trigger[^>]*href=["\']assets/{re.escape(asset_name)}["\'][^>]*>[\s\S]*?</a>', section_html)
                self.assertIsNotNone(trigger)
                self.assertRegex(trigger.group(0), r'aria-label=["\']Open larger view: [^"\']+["\']')
        self.assertEqual(section_html.count('class="product-pricing"'), 11)
        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*romantic-keepsake-card[^"\']*["\'][\s\S]*?</article>', section_html)
        self.assertEqual(len(cards), 11)
        highlight_matrix = {
            "studio-rose-hexagon-keepsake.jpeg": ("2,999", "2,499", 17),
            "studio-personalized-photo-clock.jpeg": ("3,999", "3,000", 25),
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
        ):
            old_section = re.search(rf'<section\b[^>]*id=["\']{old_section_id}["\'][\s\S]*?</section>', self.html)
            self.assertIsNotNone(old_section)
            with self.subTest(moved_asset=moved_asset):
                self.assertNotIn(f"assets/{moved_asset}", old_section.group(0))
                # The design-a-frame hero slide may reuse a photo; the catalogue itself keeps one copy.
                hero_section = re.search(r'<section\b[^>]*class="hero-banner\b[\s\S]*?</section>', self.html).group(0)
                self.assertEqual(self.html.replace(hero_section, "").count(f'src="assets/{moved_asset}"'), 1)
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

        hero = re.search(r'<section\b[^>]*class=["\']hero-banner\b[\s\S]*?</section>', self.html)
        self.assertIsNotNone(hero)
        hero_html = hero.group(0)
        self.assertNotIn('hero-actions', hero_html)
        self.assertEqual(hero_html.count('data-browse-all'), 0)
        self.assertNotIn('Shop the sale', hero_html)
        self.assertEqual(len(re.findall(r'data-category-shortcut=', hero_html)), 5)
        # The design-a-frame slide and the link under the carousel both open the frame designer.
        self.assertEqual(len(re.findall(r'data-customizer-open', hero_html)), 2)
        self.assertNotIn('Browse gifts by type or budget', hero_html)
        self.assertNotIn('Request a custom gift', hero_html)
        self.assertNotIn('data-browse-filters', hero_html)
        self.assertEqual(self.html.count('class="catalogue-grid"'), 6)
        self.assertEqual(self.html.count('data-lightbox-trigger'), 106)
        self.assertEqual(self.html.count('class="product-pricing"'), 106)
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
        self.assertNotIn("A preview of 13 keepsake ideas for the two of you.", section_html)
        self.assertNotIn("Concept previews are illustrative.", section_html)
        self.assertNotIn("Some catalogue images are illustrative or reference ideas.", self.html)

        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*romantic-keepsake-card[^"\']*["\'][\s\S]*?</article>', section_html)
        self.assertEqual(len(cards), 11)
        assets = re.findall(r'<img\b[^>]*src=["\'](assets/[^"\']+)["\'][^>]*>', section_html)
        self.assertEqual(
            assets[:8],
            [f"assets/{asset}" for asset, _, _, _, _, _ in ROMANTIC_CONCEPTS],
        )
        self.assertEqual(
            assets[8:],
            [
                "assets/studio-rose-hexagon-keepsake.jpeg",
                "assets/studio-personalized-photo-clock.jpeg",
                "assets/studio-red-rose-resin-display.jpeg",
            ],
        )
        self.assertEqual(section_html.count("data-lightbox-trigger"), 11)
        self.assertEqual(section_html.count('class="product-pricing"'), 11)
        for card_index in (0, 7, 8, 10):
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
                self.assert_square_image_matches_file(image_tag, ROOT / "assets" / asset)
                self.assertIn('loading="lazy"', image_tag)
                self.assertIn('decoding="async"', image_tag)
                trigger = re.search(r'<a\b[^>]*data-lightbox-trigger[^>]*href=["\']([^"\']+)["\']', card)
                self.assertIsNotNone(trigger)
                self.assertEqual(trigger.group(1), f"assets/{asset}")

        for asset, _, _, _, _, _ in ROMANTIC_CONCEPTS:
            expected_count = 2 if asset in {"romantic-heart-trinket-tray.webp", "romantic-initial-desk-stand.webp", "romantic-us-keychain-pair.webp"} else 1
            self.assertEqual(self.html.count(f'src="assets/{asset}"'), expected_count)
        for studio_concept in (
            "concept-floral-memory-frame.webp",
            "concept-ocean-clock.webp",
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
        self.assertRegex(self.html, r'<a href="corporate-gifting/">Corporate gifting <svg class="category-icon" aria-hidden="true" focusable="false">[\s\S]*#gift[\s\S]*</a>')
        self.assertIn('id="corporate-resin-gifts-grid"', corporate)
        self.assertIn('aria-labelledby="corporate-resin-gifts-title"', corporate)
        self.assertIn('<h2 id="corporate-resin-gifts-title">Corporate Resin Gifts</h2>', corporate)
        self.assertIn('class="catalogue-grid"', corporate)
        self.assertIn('role="list"', corporate)
        self.assertIn('aria-label="Corporate resin gifts"', corporate)
        self.assertIn('data-catalogue-disclosure', corporate)
        self.assertIn('aria-expanded="false"', corporate)
        self.assertNotIn(FINAL_QUOTE_NOTE, corporate)
        self.assertNotIn("Some catalogue images are illustrative or reference ideas.", self.html)

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
        image_url = public_url + "assets/share-mini-resin-desk-clock.jpg"
        self.assertIn(f'<link rel="canonical" href="{public_url}">', self.html)
        self.assertIn(f'<meta property="og:url" content="{public_url}">', self.html)
        self.assertIn(f'<meta property="og:image" content="{image_url}">', self.html)
        self.assertIn(f'<meta name="twitter:image" content="{image_url}">', self.html)
        self.assertIn('<meta property="og:image:width" content="1200">', self.html)
        self.assertIn('<meta property="og:image:height" content="630">', self.html)
        self.assertNotIn("atishayjain20.github.io", self.html)

    def test_share_preview_image_is_large_landscape_jpeg(self):
        data = (ROOT / "assets" / "share-mini-resin-desk-clock.jpg").read_bytes()
        self.assertEqual(data[:2], b"\xff\xd8", "JPEG")
        index, size = 2, None
        while index < len(data) - 9:
            marker, length = data[index + 1], int.from_bytes(data[index + 2:index + 4], "big")
            if marker in (0xC0, 0xC1, 0xC2):
                size = (int.from_bytes(data[index + 7:index + 9], "big"), int.from_bytes(data[index + 5:index + 7], "big"))
                break
            index += 2 + length
        self.assertEqual(size, (1200, 630))
        self.assertLess((ROOT / "assets" / "share-mini-resin-desk-clock.jpg").stat().st_size, 300 * 1024)

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
            "Blue Ocean Resin Wall Clock",
            "Personalised Message Coaster Set",
            "Pearl white Namokar (Navkar) mantra frame",
            "Couple Photo Resin Clock",
            "Visit Saloni Resin Art Studio at House No. 61, Hathi Bhata, Ajmer, Rajasthan, India. Open every day, 11:00 AM–4:00 PM.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.html)

        order = re.search(r'<section\b[^>]*id=["\']order["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(order)
        order_html = order.group(0)
        details = re.findall(r'<details\b[\s\S]*?</details>', order_html)
        self.assertEqual(len(details), 6)
        self.assertIn('class="meet-saloni"', details[0])
        self.assertIn('class="customer-confidence-strip"', details[1])
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
        self.assertIn('tel:+918209238541', self.html)
        self.assertNotIn('tel:8209238541', self.html)
        self.assertIn("8209238541", self.html)
        self.assertIn("https://www.instagram.com/saloniresin_art_studio/", self.html)
        self.assertIn("@saloniresin_art_studio", self.html)

    def test_talk_first_box_offers_whatsapp(self):
        box = re.search(r'id="order-inline-fallback-title".*?</div>', self.html, re.S)
        self.assertIsNotNone(box)
        self.assertRegex(box.group(0), r'<a class="contact-line" href="https://wa\.me/918209238541\?text=[^"]+" target="_blank" rel="noopener"><span>Message on WhatsApp</span><strong>8209238541</strong></a>')

    def test_talk_first_contacts_look_like_buttons(self):
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        rule = re.search(r'\.order-inline-fallback \.contact-line \{([^}]*)\}', css)
        self.assertIsNotNone(rule)
        for prop in (r'border: 1px solid', r'border-radius:', r'min-height: 44px'):
            with self.subTest(prop=prop):
                self.assertRegex(rule.group(1), prop)
        for selector in ('href\\^="tel:"', 'href\\*="wa\\.me"', 'href\\*="instagram"'):
            with self.subTest(selector=selector):
                self.assertRegex(css, r'\.order-inline-fallback \.contact-line\[' + selector + r'\]::before \{[^}]*background')
        self.assertRegex(css, r'\.order-inline-fallback \.contact-line::after \{[^}]*content:')

    def test_meet_saloni_shows_a_small_round_photo_before_next_steps(self):
        block = re.search(r'<details class="meet-saloni" id="meet-saloni">(.*?)</details>', self.html, re.S)
        self.assertIsNotNone(block)
        self.assertLess(self.html.index('class="meet-saloni"'), self.html.index('id="customer-confidence-title"'))
        summary = re.search(r'<summary>(.*?)</summary>', block.group(1), re.S)
        self.assertIsNotNone(summary)
        self.assertIn('<h2 id="meet-saloni-title">Meet Saloni</h2>', summary.group(1))
        self.assertRegex(summary.group(1), r'<img class="meet-saloni-photo" src="assets/saloni-portrait\.jpg" alt="[^"]{9,}" width="320" height="320" loading="lazy"')
        self.assertTrue((ROOT / "assets/saloni-portrait.jpg").is_file())
        self.assertLess((ROOT / "assets/saloni-portrait.jpg").stat().st_size, 60_000)
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        photo = re.search(r'\.meet-saloni-photo \{([^}]*)\}', css)
        self.assertIsNotNone(photo)
        self.assertIn("border-radius: 50%", photo.group(1))
        self.assertRegex(photo.group(1), r'width: (?:[1-9]\d)px')

    def test_cart_has_a_short_your_cart_heading(self):
        self.assertNotIn("One request for your selected gifts", self.html)
        self.assertIn('<p class="panel-label" id="catalogue-selection-title">Your cart</p>', self.html)
        self.assertIn('aria-labelledby="catalogue-selection-title"', self.html)

    def test_product_photos_fill_the_card_and_category_tabs_use_small_text(self):
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        rule = re.search(r":is\(\.work-card, \.romantic-keepsake-card, \.collection-card\) img\s*\{([^}]*)\}", css).group(1)
        self.assertNotRegex(rule, r"\bpadding\s*:")
        self.assertNotRegex(rule, r"\bbackground\s*:\s*var\(--paper\)")
        tab = re.search(r"\n\.category-tab\s*\{([^}]*)\}", css).group(1)
        self.assertRegex(tab, r"font:\s*800 0\.62rem/1 var\(--sans\)")
        self.assertRegex(tab, r"letter-spacing:\s*0\.04em")

    def test_catalogue_sections_keep_only_a_small_side_margin_on_phones(self):
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        phone = re.search(r"@media \(max-width: 620px\) \{([\s\S]*?)\n\}", css).group(1)
        rule = re.search(
            r"\.diwali-section,\s*\.marriage-section,\s*\.romantic-keepsakes,\s*\.corporate-resin-gifts-section,\s*\.studio-art-section,\s*\.premium-collection-section\s*\{([^}]*)\}",
            phone,
        )
        self.assertIsNotNone(rule)
        for declaration in (r"width:\s*calc\(100% - 0\.75rem\)", r"margin-inline:\s*0\.375rem", r"padding-inline:\s*0\.75rem", r"border-inline:\s*0", r"border-radius:\s*0"):
            self.assertRegex(rule.group(1), declaration)
        self.assertRegex(phone, r"\.catalogue-grid\s*\{[^}]*column-gap:\s*0\.75rem")
        card = re.search(r"\n  \.romantic-keepsake-card\s*\{([^}]*)\}", phone)
        self.assertIsNotNone(card)
        for declaration in (r"padding:\s*0", r"border:\s*0", r"background:\s*transparent"):
            self.assertRegex(card.group(1), declaration)

    def test_every_page_has_icon_fallbacks_pink_phone_bar_and_current_asset_versions(self):
        ico = (ROOT / "favicon.ico").read_bytes()
        self.assertEqual(ico[:4], b"\x00\x00\x01\x00", "favicon.ico must be an icon file")
        self.assertIn(b"\x89PNG", ico)
        touch = (ROOT / "assets" / "apple-touch-icon.png").read_bytes()
        self.assertEqual(touch[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual(int.from_bytes(touch[16:20], "big"), 180)
        style_version = re.search(r'href="styles\.css\?v=(\d+)"', self.html).group(1)
        script_version = re.search(r'src="script\.js\?v=(\d+)"', self.html).group(1)
        for page, prefix in (("index.html", ""), ("corporate-gifting/index.html", "../"), ("partners/index.html", "../"), ("resin-photo-frames/index.html", "../"), ("namokar-mantra-frames/index.html", "../"), ("reviews/index.html", "../"), ("varmala-preservation/index.html", "../"), ("shipping-and-returns/index.html", "../")):
            with self.subTest(page=page):
                source = (ROOT / page).read_text(encoding="utf-8")
                self.assertIn('<meta name="theme-color" content="#fbd3e5">', source)
                self.assertIn(f'<link rel="apple-touch-icon" href="{prefix}assets/apple-touch-icon.png">', source)
                self.assertIn(f'{prefix}styles.css?v={style_version}"', source)
                self.assertIn(f'{prefix}script.js?v={script_version}"', source)

    def test_couple_scene_and_3d_miniature_are_removed(self):
        for gone in ("Our favourite little scene", "Your story, in 3D", "romantic-couple-scene", "romantic-couple-miniature"):
            with self.subTest(gone=gone):
                self.assertNotIn(gone, self.html)
        self.assertEqual(sorted(p.name for p in (ROOT / "assets").rglob("romantic-couple-*")), [])

    def test_empty_catalogue_results_region_draws_no_focus_box(self):
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertIn('id="catalogue-filters" aria-label="Gift catalogue results" tabindex="-1"', self.html)
        self.assertRegex(css, r"\n\.catalogue-status-region:focus \{\n  outline: none;\n\}")

    def test_cart_sits_after_design_a_frame_and_before_meet_saloni(self):
        customizer = self.html.index('id="customizer-mobile-actions"')
        cart = self.html.index('id="catalogue-selection"')
        order = self.html.index('id="order"')
        self.assertLess(customizer, cart)
        self.assertLess(cart, order)
        self.assertLess(cart, self.html.index('id="meet-saloni"'))

    def test_meet_saloni_opens_to_show_the_studio_address_only_there(self):
        visit = "Visit Saloni Resin Art Studio at House No. 61, Hathi Bhata, Ajmer, Rajasthan, India. Open every day, 11:00 AM–4:00 PM."
        block = re.search(r'<details class="meet-saloni" id="meet-saloni">(.*?)</details>', self.html, re.S)
        self.assertIsNotNone(block)
        after_summary = block.group(1).split('</summary>', 1)[1]
        self.assertIn(visit, after_summary)
        self.assertEqual(self.html.count("Visit Saloni Resin Art Studio at"), 1)
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertRegex(css, r'\.meet-saloni > summary::after \{[^}]*content:')
        self.assertRegex(css, r'\.meet-saloni\[open\] > summary::after \{[^}]*transform:')

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
        self.assertNotIn("A preview of 20 studio pieces, with more to explore below.", section_html)
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
            "studio-om-asiausa-mantra-plaque.jpeg",
            "studio-rose-mantra-door-strips.jpeg",
            "studio-sage-gold-resin-clock.jpeg",
            "studio-lilac-silver-resin-clock.jpeg",
            "studio-ivory-diamond-resin-clock.jpeg",
            "studio-sky-blue-roman-resin-clock.jpeg",
            "studio-teal-gold-roman-resin-clock.jpeg",
            "studio-pearl-geode-resin-clock.jpeg",
        )
        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*work-card[^"\']*["\'][\s\S]*?</article>', section_html)
        self.assertEqual(len(cards), 28)
        self.assertEqual(section_html.count("<figcaption>"), 28)
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

    def test_testimonial_section_is_removed_from_homepage(self):
        self.assertIsNone(re.search(r'<section\b[^>]*id=["\']testimonials["\'][\s\S]*?</section>', self.html))
        self.assertNotIn('Before you order', self.html)
        self.assertNotIn('Know what your gift will include.', self.html)
        self.assertNotIn('Ask Saloni about a gift', self.html)

    def test_festive_offers_area_stays_inline_without_unsupported_claims(self):
        self.assertNotRegex(self.html, r'<a href="#diwali"(?: data-category-shortcut="diwali")?>Browse Diwali designs')
        self.assertNotIn('<p class="festive-banner shell" id="festive-offers">', self.html)
        self.assertNotIn('id="festive-offers"', self.html)
        self.assertNotIn('id="festive-offers-fallback"', self.html)
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
        self.assertNotRegex(studio, r'Displayed prices are for pictured/base designs')
        self.assertNotRegex(studio, r'Size, materials, and personalisation can change the final quote; Saloni confirms the final quote')

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
            "concept-floral-coasters.webp": ("1,299", "999", 23),
            "resin-clock.jpg": ("2,999", "2,199", 27),
            "resin-message-coasters.jpg": ("1,799", "1,299", 28),
            "navkar-resin-frame.jpg": ("4,499", "3,499", 22),
            "personalized-floral-hoop.jpg": ("999", "599", 40),
            "studio-om-asiausa-mantra-plaque.jpeg": ("2,249", "1,799", 20),
            "studio-rose-mantra-door-strips.jpeg": ("2,249", "1,799", 20),
            "studio-sage-gold-resin-clock.jpeg": ("2,749", "2,199", 20),
            "studio-lilac-silver-resin-clock.jpeg": ("2,749", "2,199", 20),
            "studio-ivory-diamond-resin-clock.jpeg": ("2,749", "2,199", 20),
            "studio-sky-blue-roman-resin-clock.jpeg": ("2,749", "2,199", 20),
            "studio-teal-gold-roman-resin-clock.jpeg": ("2,749", "2,199", 20),
            "studio-pearl-geode-resin-clock.jpeg": ("2,749", "2,199", 20),
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

        assert_matrix(studio, studio_matrix, expected_cards=28, expected_pricing_blocks=28)

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
                self.assertIn("₹599", card)
                self.assertEqual(studio.count(f'src="assets/{asset}"'), 1)

        self.assertEqual(studio.count('class="product-pricing"'), 28)
        self.assertNotIn("schema.org/Offer", self.html)

    def test_final_quote_note_lives_once_before_the_order_form(self):
        self.assertEqual(self.html.count(FINAL_QUOTE_NOTE), 1)
        order = re.search(r'<section\b[^>]*id=["\']order["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(order)
        order_html = order.group(0)
        self.assertEqual(order_html.count(FINAL_QUOTE_NOTE), 0)
        dialog = re.search(r'<dialog\b[^>]*id=["\']order-dialog["\'][\s\S]*?</dialog>', self.html)
        self.assertIsNotNone(dialog)
        dialog_html = dialog.group(0)
        self.assertEqual(dialog_html.count(FINAL_QUOTE_NOTE), 1)
        form_position = dialog_html.index('<p class="panel-label">Order request</p>')
        note_position = dialog_html.index(FINAL_QUOTE_NOTE)
        self.assertLess(note_position, form_position)
        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*(?:work-card|romantic-keepsake-card)[^"\']*["\'][\s\S]*?</article>', self.html)
        for card in cards:
            with self.subTest(card=card[:80]):
                self.assertNotIn(FINAL_QUOTE_NOTE, card)

    def test_art_lightbox_contract_preserves_product_catalogue(self):
        triggers = re.findall(r'<a\b[^>]*data-lightbox-trigger[^>]*>', self.html)
        self.assertEqual(len(triggers), 106)
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

        for section_id, cards, pricing_blocks in (("romantic-keepsakes", 11, 11), ("corporate-resin-gifts", 19, 19), ("studio-art", 28, 28), ("premium-collection", 14, 14), ("diwali", 24, 24)):
            section = re.search(rf'<section\b[^>]*id=["\']{section_id}["\'][\s\S]*?</section>', self.html)
            self.assertIsNotNone(section)
            with self.subTest(section=section_id):
                card_class = 'class="work-card' if section_id != "romantic-keepsakes" else 'class="romantic-keepsake-card'
                self.assertEqual(section.group(0).count(card_class), cards)
                self.assertEqual(section.group(0).count('class="product-pricing"'), pricing_blocks)

    def test_lightbox_gallery_dialog_markup(self):
        dialog = re.search(r'<dialog\b[^>]*id=["\']art-lightbox["\'][\s\S]*?</dialog>', self.html).group(0)
        for button_id, label in (("lightbox-photo-prev", "Previous image"), ("lightbox-photo-next", "Next image")):
            with self.subTest(button=button_id):
                button = re.search(rf'<button\b[^>]*id="{button_id}"[^>]*>', dialog)
                self.assertIsNotNone(button)
                self.assertIn('type="button"', button.group(0))
                self.assertIn(f'aria-label="{label}"', button.group(0))
        self.assertRegex(dialog, r'<p\b[^>]*id="lightbox-photo-label"[^>]*aria-live="polite"')
        self.assertIn('id="lightbox-included"', dialog)
        care = re.search(r'<details class="lightbox-care">[\s\S]*?</details>', dialog)
        self.assertIsNotNone(care)
        self.assertEqual(care.group(0).count("<li>"), 4)

    def test_ai_images_are_declared_for_card_triggers_and_match_files_on_disk(self):
        folder = ROOT / "assets" / "ai-images"
        declared = set()
        for trigger in re.findall(r'<a\b[^>]*data-lightbox-trigger[^>]*>', self.html):
            match = re.search(r'data-ai-images="([^"]*)"', trigger)
            if not match:
                continue
            with self.subTest(trigger=trigger[:120]):
                self.assertNotIn("data-lightbox-target", trigger)
                names = match.group(1).split()
                self.assertTrue(1 <= len(names) <= 4)
                self.assertEqual(len(names), len(set(names)))
                for name in names:
                    self.assertRegex(name, r"^[a-z]+(?:-[a-z]+)*$")
                self.assertEqual(names[-1] == "styled", "styled" in names, "styled comes last")
                stem = Path(re.search(r'href="([^"?#]+)', trigger).group(1)).stem
                for name in names:
                    path = folder / f"{stem}--{name}.webp"
                    declared.add(path.name)
                    self.assertTrue(path.exists(), path)
                    self.assertLessEqual(path.stat().st_size, 150 * 1024, path)
        self.assertGreater(len(declared), 0)
        on_disk = {path.name for path in folder.glob("*")} if folder.exists() else set()
        self.assertEqual(on_disk - declared, set(), "AI images that no card declares")
        self.assertNotIn("ai-images/", self.html, "the homepage must not fetch AI images")
        self.assertNotIn("data-colour-options", self.html)
        self.assertFalse((ROOT / "assets" / "colour-options").exists(), "recolour previews are retired")

    def test_fifth_ai_image_batch_is_declared_without_rejected_images(self):
        declared = {}
        for trigger in re.findall(r'<a\b[^>]*data-lightbox-trigger[^>]*>', self.html):
            match = re.search(r'data-ai-images="([^"]*)"', trigger)
            if match and "data-lightbox-target" not in trigger:
                declared[Path(re.search(r'href="([^"?#]+)', trigger).group(1)).stem] = match.group(1).split()
        for stem in [
            "corporate-bag-tag-concept",
            "corporate-bookmark-keychain-duo-concept",
            "corporate-business-card-holder-concept",
            "corporate-desk-essentials-set-concept",
            "corporate-desk-organizer-concept",
            "corporate-desk-trinket-tray-concept",
            "corporate-lanyard-charm-concept",
            "corporate-mini-photo-stand-concept",
            "corporate-pen-cup-concept",
            "corporate-phone-rest-concept",
            "corporate-recognition-award-concept",
            "diwali-emerald-led-holder-pair-concept",
            "diwali-festive-keepsake-box-concept",
            "diwali-floral-swastik-tealight-set",
            "diwali-golden-toran-charms-concept",
            "diwali-ivory-mandala-holder-concept",
            "diwali-lotus-rangoli-duo-concept",
            "diwali-marigold-petal-holder-concept",
            "diwali-om-mini-tilak-plate",
            "diwali-peacock-mini-pooja-thali",
            "diwali-pearl-rangoli-accent-concept",
            "diwali-rose-petal-offering-plate-concept",
            "diwali-ruby-leaf-dish-concept",
            "diwali-saffron-tilak-duo-concept",
            "premium-black-gold-glassware-set",
            "premium-champagne-two-tier-set",
            "premium-gemstone-mug-collection",
            "premium-ocean-seashell-tray",
            "premium-pastel-butterfly-trays",
            "premium-silver-icy-blue-tray",
            "premium-smoky-bronze-tray",
            "premium-turquoise-geode-glass-closeup",
            "premium-turquoise-geode-glass-pair",
            "premium-turquoise-gold-wine-glasses",
            "premium-turquoise-tray-coasters",
            "studio-lilac-symbol-rakhi",
            "studio-little-brother-rakhi",
            "sunflower-floral-keepsakes",
            "sunflower-keepsake-set",
            "sunflower-plaque-easel",
            "sunflower-plaque-hand",
            "sunflower-resin-lamp",
        ]:
            with self.subTest(stem=stem):
                self.assertIn(stem, declared)
        self.assertNotIn("premium-champagne-white-tray", declared, "its photo carries another studio's watermark")
        self.assertNotIn("styled-alt", declared.get("sunflower-keepsake-set", []))
        self.assertNotIn("styled", declared.get("premium-black-gold-glassware-set", []), "the styled scene shows a branded bottle")

    def test_fourth_ai_image_batch_is_declared(self):
        declared = {}
        for trigger in re.findall(r'<a\b[^>]*data-lightbox-trigger[^>]*>', self.html):
            match = re.search(r'data-ai-images="([^"]*)"', trigger)
            if match and "data-lightbox-target" not in trigger:
                declared[Path(re.search(r'href="([^"?#]+)', trigger).group(1)).stem] = match.group(1)
        expected = {
            "corporate-desk-logo-stand-concept": "rose styled",
            "corporate-fridge-magnet-concept": "royal-blue styled",
            "corporate-recognition-award-concept": "amethyst styled",
            "diwali-lotus-diya-pair": "blue styled",
            "premium-ivory-gold-tiered-set": "teal styled",
            "premium-midnight-blue-tiered-set": "emerald styled",
            "studio-red-rose-resin-display": "rose styled",
            "studio-floral-hexagon-keepsake": "amethyst styled",
            "studio-floral-square-keepsake": "emerald styled",
            "studio-lilac-scalloped-tray": "teal styled",
            "studio-little-brother-rakhi": "teal styled",
        }
        for stem, names in expected.items():
            with self.subTest(stem=stem):
                self.assertEqual(declared.get(stem), names)

    def test_sizes_do_not_say_each(self):
        sizes = re.findall(r"<dt>Size</dt><dd>([^<]*)</dd>", self.html)
        self.assertGreater(len(sizes), 10)
        for size in sizes:
            with self.subTest(size=size):
                self.assertNotIn("each", size)

    def test_order_copy_is_plain_and_privacy_note_is_not_repeated(self):
        self.assertNotIn("visible request fields", self.html)
        self.assertIn("then review your request before sending.", self.html)
        self.assertEqual(self.html.count("Your information is used only to handle your request."), 1)

    def test_third_ai_image_batch_is_declared(self):
        declared = {}
        for trigger in re.findall(r'<a\b[^>]*data-lightbox-trigger[^>]*>', self.html):
            match = re.search(r'data-ai-images="([^"]*)"', trigger)
            if match and "data-lightbox-target" not in trigger:
                declared[Path(re.search(r'href="([^"?#]+)', trigger).group(1)).stem] = match.group(1)
        expected = {
            "corporate-desk-nameplate-concept": "rose styled",
            "corporate-fridge-magnet-concept": "royal-blue styled",
            "corporate-logo-coaster-set-concept": "ruby styled",
            "diwali-golden-ganesha-pooja-plate": "mint styled",
            "diwali-ocean-bloom-pooja-platter": "rose styled",
            "diwali-om-mini-tilak-plate": "blue styled",
            "romantic-botanical-pendant": "blue styled",
            "romantic-calendar-coaster": "blue styled",
            "romantic-first-rose-bracelet": "amethyst styled",
            "romantic-ocean-memory-tray": "emerald styled",
            "studio-personalized-photo-clock": "blue styled",
            "studio-rose-hexagon-keepsake": "ruby styled",
            "personalized-floral-hoop": "rose styled",
            "resin-clock": "amethyst styled",
            "resin-message-coasters": "royal-blue styled",
            "studio-floral-handled-tray": "teal styled",
        }
        for stem, names in expected.items():
            with self.subTest(stem=stem):
                self.assertEqual(declared.get(stem), names)

    def test_generated_designs_are_studio_catalogue_cards(self):
        self.assertNotRegex(self.html, re.compile(r'id=["\']commission-concepts["\']|Concepts to commission|data-carousel=["\']commission-concepts["\']'))
        studio_match = re.search(r'<section\b[^>]*id=["\']studio-art["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(studio_match)
        studio = studio_match.group(0)
        expected = {
            "concept-floral-memory-frame.webp": ("Pressed Flower Arch Frame", "4,999", "3,999", 20),
            "concept-ocean-clock.webp": ("Shoreline Resin Wall Clock", "2,999", "2,199", 27),
            "concept-floral-coasters.webp": ("Personalised Floral Coaster Set", "1,299", "999", 23),
        }
        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*work-card[^"\']*["\'][\s\S]*?</article>', studio)
        self.assertEqual(len(cards), 28)
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
                self.assert_square_image_matches_file(image_tag, ROOT / f"assets/{asset}")
                self.assertIn('loading="lazy"', image_tag)
                self.assertIn('decoding="async"', image_tag)
                href = re.search(r'<a\b[^>]*data-lightbox-trigger[^>]*href=["\']([^"\']+)["\']', card).group(1)
                self.assertEqual(href, f"assets/{asset}")

        self.assertEqual(studio.count('data-lightbox-trigger'), 28)
        self.assertNotRegex((ROOT / "styles.css").read_text(encoding="utf-8"), r'\.concept-(?:section|card|note)')

    def test_premium_catalogue_preserves_all_photos_and_exact_price_states(self):
        section_match = re.search(r'<section\b[^>]*id=["\']premium-collection["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section_match)
        section = section_match.group(0)
        self.assertIn("Premium resin designs", section)
        self.assertNotIn("A preview of 14 premium design photos, with more to explore below.", section)
        self.assertNotIn("Reference photos for made-to-order conversations. Saloni confirms the final design, quote and delivery.", section)
        self.assertIn('id="premium-collection-grid"', section)
        self.assertIn('aria-label="Premium resin designs"', section)
        self.assertIn('>View all</button>', section)
        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*work-card[^"\']*["\'][\s\S]*?</article>', section)
        self.assertEqual(len(cards), 14)
        self.assertEqual(section.count('data-lightbox-trigger'), 14)
        self.assertEqual(section.count('class="product-pricing"'), 14)
        prices = {
            "premium-midnight-blue-tiered-set.jpeg": "₹22,500",
            "premium-ivory-gold-tiered-set.jpeg": "₹22,500",
            "premium-champagne-two-tier-set.jpeg": "₹15,000",
            "premium-turquoise-tray-coasters.jpeg": "₹11,000",
            "premium-smoky-bronze-tray.jpeg": "₹5,000",
            "premium-gemstone-mug-collection.jpeg": "₹7,500",
            "premium-pastel-butterfly-trays.jpeg": "₹12,000",
            "premium-champagne-white-tray.jpeg": "₹5,000",
            "premium-silver-icy-blue-tray.jpeg": "₹5,000",
            "premium-ocean-seashell-tray.jpeg": "₹5,000",
            "premium-turquoise-geode-glass-closeup.jpeg": "₹1,800",
            "premium-turquoise-gold-wine-glasses.jpeg": "₹2,500",
            "premium-turquoise-geode-glass-pair.jpeg": "₹3,500",
            "premium-black-gold-glassware-set.jpeg": "₹11,000",
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
        self.assertRegex(css, r'\.premium-collection-section[^}]*background:\s*var\(--ink\)')
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
        self.assertIn("Sends this preview, your choices and size with your request", section)
        self.assertNotIn("attach your image or a screenshot separately", section)
        self.assertNotIn("customizer-handoff", section)
        self.assertNotIn("Take the summary to the studio", section)

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
        self.assertIn("exportCanvas.toBlob", script)
        self.assertIn("PREVIEW_MIME_TYPE", script)
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


class CatalogueCardParser(HTMLParser):
    """Collects each work or romantic card's first photo and title, in page order."""

    def __init__(self):
        super().__init__()
        self.cards = []
        self.depth = []
        self.current = None
        self.title_tag = None
        self.in_figcaption = False

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        classes = (attributes.get("class") or "").split()
        if self.current is not None and tag not in MarkupTreeParser.VOID_ELEMENTS:
            self.depth.append(tag)
        if self.current is None and ("work-card" in classes or "romantic-keepsake-card" in classes):
            self.current = {"src": None, "title": None}
            self.depth = [tag]
            return
        if self.current is None:
            return
        if tag == "img" and self.current["src"] is None and attributes.get("src"):
            self.current["src"] = attributes["src"]
        if tag == "figcaption":
            self.in_figcaption = True
        elif self.in_figcaption and self.current["title"] is None and tag in ("strong", "h3"):
            self.title_tag = tag

    def handle_data(self, data):
        if self.title_tag and self.current is not None and self.current["title"] is None:
            self.current["title"] = data.strip()

    def handle_endtag(self, tag):
        if self.current is None:
            return
        if tag == self.title_tag:
            self.title_tag = None
        if tag == "figcaption":
            self.in_figcaption = False
        if self.depth:
            self.depth.pop()
        if not self.depth:
            if self.current["src"] and self.current["title"]:
                self.cards.append(self.current)
            self.current = None


def catalogue_products(html):
    parser = CatalogueCardParser()
    parser.feed(html)
    return [{"id": "catalogue:" + re.sub(r"^assets/", "", card["src"]), "name": card["title"]} for card in parser.cards]


class ReviewsPageContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.home = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.page_path = ROOT / "reviews" / "index.html"
        cls.page = cls.page_path.read_text(encoding="utf-8") if cls.page_path.exists() else ""

    def test_reviews_page_has_canonical_seo_and_the_required_regions(self):
        self.assertTrue(self.page, "reviews/index.html must exist")
        self.assertIn('<link rel="canonical" href="https://saloniresinart.com/reviews/">', self.page)
        self.assertIn('<meta property="og:url" content="https://saloniresinart.com/reviews/">', self.page)
        self.assertRegex(self.page, r"<title>Write a review \| Saloni Resin Art Studio</title>")
        for stale in ("Customer reviews", "Read what customers say", "Words from people", 'id="write-title"'):
            self.assertNotIn(stale, self.page)
        self.assertIn('<meta name="description" content="Share a review of your Saloni resin art or the studio.">', self.page)
        self.assertEqual(self.page.count("<h2"), 0, "the h1 is the only heading")
        self.assertRegex(self.page, r'<section[^>]*id="write"[^>]*aria-labelledby="reviews-title"')
        self.assertIn('<h1', self.page)
        self.assertRegex(self.page, r'<h1 id="reviews-title">Write a review</h1>')
        for gone in ("reviews-summary", "reviews-status", "reviews-list", "reviews-list-section", "Loading reviews", "appears on this page as soon as you post it"):
            self.assertNotIn(gone, self.page)
        self.assertNotIn('class="button button-dark" href="#write"', self.page, "the hero no longer repeats the write button")
        self.assertRegex(self.page, r'<section[^>]*id="write"')
        # The review form is built into the page: no Apps Script iframe, no seed post, and no connection to Google until the form is used.
        self.assertNotIn("preconnect", self.page)
        for gone in ("<iframe", "order-form-embed", "order-form-frame", "order-form-status", "data-form-mode", "Loading the review form", "recaptcha/api.js", "data-captcha-site-key"):
            self.assertNotIn(gone, self.page)
        self.assertRegex(self.page, r'<form id="review-form"[^>]*data-order-form-url="https://script.google.com/macros/s/AKfycbydFuwmR32zO3Sj28a1YWZNTgThHctu-LnpkWVJAkUOQZfRgnzS1qTfbb2JeHvYa-Qg/exec"[^>]*data-products-url="products.json"')
        self.assertIn('<noscript>', self.page)
        self.assertNotIn("data-intake-ready", self.page)
        self.assertIn('<a class="skip-link" href="#main-content">', self.page)
        self.assertIn('<main id="main-content" tabindex="-1">', self.page)
        self.assertIn('href="../styles.css?v=', self.page)
        self.assertIn('src="../script.js?v=', self.page)
        self.assertIn('src="../public-forms.js?v=', self.page)
        self.assertNotRegex(self.page, r"aggregateRating|application/ld\+json")

    def test_every_page_links_to_reviews_from_the_footer_and_the_primary_nav_is_unchanged(self):
        for page, href in (("index.html", "#customer-reviews"), ("corporate-gifting/index.html", "../#customer-reviews"), ("partners/index.html", "../#customer-reviews"), ("resin-photo-frames/index.html", "../#customer-reviews"), ("namokar-mantra-frames/index.html", "../#customer-reviews"), ("reviews/index.html", "../#customer-reviews"), ("varmala-preservation/index.html", "../#customer-reviews"), ("shipping-and-returns/index.html", "../#customer-reviews")):
            with self.subTest(page=page):
                source = (ROOT / page).read_text(encoding="utf-8")
                footer = re.search(r'<div class="footer-links">([\s\S]*?)</div>', source)
                self.assertIsNotNone(footer)
                self.assertIn(f'<a href="{href}">Reviews</a>', footer.group(1))
                header = re.search(r'<header class="site-header">([\s\S]*?)</header>', source)
                self.assertIsNotNone(header)
                if page != "reviews/index.html":
                    self.assertNotIn(">Reviews<", header.group(1))

    def test_home_page_shows_the_reviews_just_before_the_footer(self):
        section = re.search(r'<section class="home-reviews shell" id="customer-reviews" aria-labelledby="home-reviews-title">([\s\S]*?)</section>', self.home)
        self.assertIsNotNone(section, "the home page needs the customer reviews section")
        body = section.group(1)
        self.assertIn('<h2 id="home-reviews-title">Customer reviews</h2>', body)
        self.assertRegex(body, r'<p id="reviews-summary" class="reviews-summary" hidden></p>')
        self.assertRegex(body, r'<p id="reviews-status" class="reviews-status" role="status" aria-live="polite">Loading reviews…</p>')
        self.assertRegex(body, r'<ul id="reviews-list" class="reviews-list"></ul>')
        self.assertIn('<a class="button button-dark" href="reviews/#write">Write a review', body)
        self.assertEqual(self.home.count('id="reviews-list"'), 1)
        self.assertLess(self.home.index('id="customer-reviews"'), self.home.index('<footer'))
        self.assertRegex(self.home[self.home.index('id="customer-reviews"'):], r'^[\s\S]*?</section>\s*</main>')
        self.assertLess(self.home.index('</main>', self.home.index('id="customer-reviews"')), self.home.index('<footer'))

    def test_privacy_details_name_public_reviews_and_keep_the_order_retention_wording(self):
        details = re.search(r'<details class="privacy-details" id="privacy-details">([\s\S]*?)</details>', self.home)
        self.assertIsNotNone(details)
        self.assertIn(
            "Customer reviews (first name, optional city, rating, comment and photos) are public on the home page and are kept until removed; ask for removal through @saloniresin_art_studio or 8209238541.",
            details.group(1),
        )
        self.assertIn("Customer requests and uploaded images are scheduled for deletion after 90 days.", details.group(1))

    def test_sample_reviews_live_on_each_product_card_not_on_the_reviews_page(self):
        self.assertNotIn('id="sample-reviews"', self.page)
        self.assertNotIn("sample-review", self.page)
        products = json.loads((ROOT / "reviews" / "products.json").read_text(encoding="utf-8"))
        samples = {}
        for article in re.findall(r"<article\b[^>]*>[\s\S]*?</article>", self.home):
            trigger = re.search(r'<a class="lightbox-trigger"[^>]*href="assets/([^"?]+)', article)
            sample = re.search(r'^<article\b[^>]*\sdata-sample-review="([^"]+)"', article)
            if trigger and sample:
                samples["catalogue:" + trigger.group(1)] = html.unescape(sample.group(1))
        self.assertEqual(sorted(samples), sorted(item["id"] for item in products))
        self.assertEqual(len(set(samples.values())), len(samples), "each sample is written for its own piece")
        for product_id, text in samples.items():
            with self.subTest(product=product_id):
                self.assertGreaterEqual(len(text), 20)
                self.assertNotRegex(text, "[\u2605\u2606<>]")
        self.assertEqual(self.home.count("data-sample-review="), len(products))

    def test_product_popup_has_a_hidden_reviews_region_with_a_link_to_write_one(self):
        dialog = re.search(r'<dialog class="lightbox-dialog"[\s\S]*?</dialog>', self.home)
        self.assertIsNotNone(dialog)
        region = re.search(r'<section class="lightbox-reviews" id="lightbox-reviews" aria-labelledby="lightbox-reviews-title" hidden>([\s\S]*?)</section>', dialog.group(0))
        self.assertIsNotNone(region, "the product popup needs a hidden reviews region")
        self.assertIn('<h3 id="lightbox-reviews-title">Reviews</h3>', region.group(1))
        self.assertIn('<ul class="lightbox-review-list" id="lightbox-review-list"></ul>', region.group(1))
        self.assertNotIn('lightbox-rating-summary', region.group(1))
        self.assertIn('<figcaption class="lightbox-caption" id="lightbox-caption">\n          <p class="lightbox-rating-summary" id="lightbox-rating-summary" hidden></p>', dialog.group(0), "the rating shows first, right under the photos")
        rate = re.search(r'<div class="lightbox-rate" id="lightbox-rate" data-captcha-site-key="(6L[A-Za-z0-9_-]{38})" hidden>([\s\S]*?)</a>\s*</div>', region.group(1))
        self.assertIsNotNone(rate, "the popup needs a hidden rate-this-piece block")
        stars = re.findall(r'<button class="lightbox-rate-star" type="button" data-rate="([1-5])" aria-pressed="false" aria-label="Rate \1 out of 5 stars">', rate.group(2))
        self.assertEqual(stars, ["1", "2", "3", "4", "5"])
        self.assertIn('<p class="lightbox-rate-status" id="lightbox-rate-status" role="status" aria-live="polite" tabindex="-1"></p>', rate.group(2))
        self.assertIn('<a class="button button-dark lightbox-tell-more" id="lightbox-tell-more" href="reviews/#write">Tell us more', rate.group(2))
        self.assertNotIn('lightbox-rate-hint', self.home)
        self.assertNotIn('protected by reCAPTCHA', rate.group(2))
        # With no notice text, Google's reCAPTCHA badge must stay visible.
        self.assertNotIn('grecaptcha-badge', (ROOT / "styles.css").read_text(encoding="utf-8"))

    def test_review_product_list_matches_the_catalogue_cards_in_page_order(self):
        path = ROOT / "reviews" / "products.json"
        self.assertTrue(path.exists(), "reviews/products.json must exist")
        actual = json.loads(path.read_text(encoding="utf-8"))
        expected = catalogue_products(self.home)
        ids = [item["id"] for item in expected]
        self.assertGreater(len(expected), 20)
        self.assertEqual(len(ids), len(set(ids)), "catalogue card photos must be unique to be reviewable")
        self.assertEqual(
            actual,
            expected,
            "reviews/products.json is out of step with index.html. Expected:\n" + json.dumps(expected, indent=2, ensure_ascii=False),
        )
        for item in actual:
            self.assertEqual(set(item), {"id", "name"})
            self.assertRegex(item["id"], r"^catalogue:[A-Za-z0-9_./-]{1,150}$")
            self.assertTrue(0 < len(item["name"]) <= 120)
        self.assertLessEqual(len(actual), 300)


def jpeg_frame(path):
    """Marker, size and component count from the first JPEG start-of-frame header (0xC2 means progressive)."""
    data = path.read_bytes()
    if data[:2] != b"\xff\xd8":
        raise AssertionError(f"Not a JPEG file: {path}")
    index = 2
    while index + 9 < len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        if marker in (0xC0, 0xC1, 0xC2):
            return {"marker": marker, "size": (int.from_bytes(data[index + 7:index + 9], "big"), int.from_bytes(data[index + 5:index + 7], "big")), "components": data[index + 9]}
        index += 2 + int.from_bytes(data[index + 2:index + 4], "big")
    raise AssertionError(f"Missing JPEG frame header: {path}")


def load_product_pages_tool():
    import importlib.util
    spec = importlib.util.spec_from_file_location("product_pages", ROOT / "tools" / "product_pages.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def card_slugs(page_html):
    """The data-product-slug stamped on each catalogue card's photo link, in page order."""
    return re.findall(r'<a class="lightbox-trigger" data-lightbox-trigger[^>]*? data-product-slug="([^"]+)"', page_html)


class PageTags(HTMLParser):
    """Collects a share page's title, meta tags, link tags, inline script, noscript links and visible links."""

    def __init__(self):
        super().__init__()
        self.title = ""
        self.meta = {}
        self.links = {}
        self.scripts = []
        self.noscript_links = []
        self.body_links = []
        self.meta_refresh = False
        self._in_title = False
        self._in_script = False
        self._in_noscript = False
        self._in_body = False

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "title":
            self._in_title = True
        elif tag == "meta":
            if (attributes.get("http-equiv") or "").lower() == "refresh":
                self.meta_refresh = True
            key = attributes.get("property") or attributes.get("name")
            if key:
                self.meta[key] = attributes.get("content")
        elif tag == "link":
            self.links[attributes.get("rel")] = attributes.get("href")
        elif tag == "script":
            self._in_script = True
            self.scripts.append("")
        elif tag == "noscript":
            self._in_noscript = True
        elif tag == "body":
            self._in_body = True
        elif tag == "a" and self._in_body:
            (self.noscript_links if self._in_noscript else self.body_links).append(attributes.get("href"))

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "script":
            self._in_script = False
        elif tag == "noscript":
            self._in_noscript = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._in_script:
            self.scripts[-1] += data


class ProductSharePageTests(unittest.TestCase):
    """Every catalogue product has a static share page: link previews are built by crawlers that run no JavaScript."""

    SITE = "https://saloniresinart.com"

    @classmethod
    def setUpClass(cls):
        cls.home = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.tool_path = ROOT / "tools" / "product_pages.py"
        cls.products = catalogue_products(cls.home)
        cls.slugs = card_slugs(cls.home)
        cls.version = re.search(r'href="styles\.css\?v=(\d+)"', cls.home).group(1)

    def page(self, slug):
        path = ROOT / "p" / slug / "index.html"
        self.assertTrue(path.is_file(), "missing page for " + slug)
        parsed = PageTags()
        text = path.read_text(encoding="utf-8")
        parsed.feed(text)
        return text, parsed

    def test_generator_is_a_standard_library_only_script(self):
        self.assertTrue(self.tool_path.is_file(), "tools/product_pages.py must exist")
        source = self.tool_path.read_text(encoding="utf-8")
        self.assertNotRegex(source, r"(?m)^\s*(?:from|import)\s+(?:PIL|requests|jinja2|bs4)\b")

    def test_one_honest_price_everywhere_with_no_sale_markup(self):
        """The fake 20% sale is gone: the home page, share pages, topic pages and the Merchant feed state one price,
        and never a regular price, percent off or sale dates."""
        pages = [ROOT / "index.html"] + list((ROOT / "p").glob("*/index.html")) + list(ROOT.glob("*/index.html"))
        self.assertGreater(len(pages), 100)
        for path in pages:
            text = path.read_text(encoding="utf-8")
            with self.subTest(page=str(path.relative_to(ROOT))):
                self.assertNotRegex(text, r"product-regular-price|<s>|% off|Sale ends|priceValidUntil|sale-ended", )
        self.assertNotRegex((ROOT / "merchant-feed.tsv").read_text(encoding="utf-8"), r"sale_price|% off")

    def test_every_card_has_exactly_one_page_and_the_slugs_are_unique(self):
        self.assertEqual(len(self.slugs), len(self.products), "every catalogue card photo link carries data-product-slug")
        self.assertEqual(len(self.slugs), len(set(self.slugs)))
        for slug in self.slugs:
            self.assertRegex(slug, r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
        on_disk = sorted(path.parent.name for path in (ROOT / "p").glob("*/index.html"))
        self.assertEqual(on_disk, sorted(self.slugs), "p/ holds exactly one page per card and nothing else")
        self.assertEqual([path.name for path in (ROOT / "p").iterdir() if path.name != "index.html" and not path.is_dir()], [])

    DELIVERY_LINE = "Free delivery on orders of \u20b91,999+ \u00b7 otherwise \u20b9100 in Rajasthan, \u20b9150 rest of India \u00b7 handmade in 4\u20135 days, delivered 2\u20135 days after dispatch"

    def test_every_product_page_shows_the_delivery_line_right_under_add_to_cart(self):
        for slug in self.slugs:
            text, _ = self.page(slug)
            self.assertRegex(
                text,
                r'(?:<a class="order" href="[^"]+">Add to cart</a>|<button class="order" type="submit">Add to cart</button>\s*</form>)\s*<p class="delivery-note">' + re.escape(self.DELIVERY_LINE) + r"</p>",
                slug)
            self.assertEqual(text.count(self.DELIVERY_LINE), 1, slug)

    def test_every_product_page_has_whatsapp_damage_help_and_meet_saloni(self):
        """A stranger landing from Google sees how to ask Saloni, what happens if it arrives damaged, and who makes it."""
        from urllib.parse import unquote
        for slug in self.slugs:
            text, _ = self.page(slug)
            with self.subTest(slug=slug):
                ask = re.search(r'<a class="button button-whatsapp ask" href="https://wa\.me/918209238541\?text=([^"]+)" target="_blank" rel="noopener">'
                                r'<svg class="whatsapp-icon"[^>]*>.*?</svg>Ask Saloni on WhatsApp</a>', text, re.S)
                self.assertIsNotNone(ask)
                self.assertIn("https://saloniresinart.com/p/%s/" % slug, unquote(ask.group(1)))
                care = re.search(r'<p class="care-note">(.*?)</p>', text, re.S)
                self.assertIsNotNone(care)
                self.assertIn("Damaged in transit? Send Saloni photos and an unboxing video for replacement support.", care.group(1))
                self.assertIn("Made to order, so no returns.", care.group(1))
                self.assertIn('<a href="/shipping-and-returns/">Shipping &amp; returns</a>', care.group(1))
                self.assertLess(text.index('<p class="delivery-note">'), text.index('class="button button-whatsapp ask"'))
                self.assertLess(text.index('class="button button-whatsapp ask"'), text.index('<p class="care-note">'))
                maker = re.search(r'<section class="maker" aria-labelledby="maker-title">(.*?)</section>', text, re.S)
                self.assertIsNotNone(maker)
                self.assertIn('<img src="/assets/saloni-portrait.jpg" alt="Saloni, the artist behind Saloni Resin Art Studio"', maker.group(1))
                self.assertIn('<h2 id="maker-title">Meet Saloni</h2>', maker.group(1))
                self.assertIn("Every piece is handmade by Saloni in her studio in Ajmer, Rajasthan.", maker.group(1))
                self.assertIn('<a href="/#customer-reviews">Read customer reviews</a>', maker.group(1))

    def test_popup_shows_the_delivery_line_right_under_its_add_to_cart_button_and_not_on_cards(self):
        self.assertRegex(
            self.home,
            r'<button class="[^"]*lightbox-request[^"]*" id="lightbox-request"[^>]*>Add to cart</button>\s*<p class="lightbox-delivery-note" id="lightbox-delivery-note">'
            + re.escape(self.DELIVERY_LINE) + r"</p>")
        self.assertEqual(self.home.count(self.DELIVERY_LINE), 1, "once in the popup, never on the 106 cards")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertRegex(styles, r"\.lightbox-request\[hidden\]\s*\+\s*\.lightbox-delivery-note\s*\{\s*display:\s*none")

    def test_renamed_cards_keep_their_old_address_and_merchant_feed_id(self):
        keep = {
            "Couple Name Keychain Pair": "two-keys-one-little-us",
            "Rose Petal Resin Bracelet": "the-first-rose-still-with-me",
            "Lilac Pearl Rakhi": "lilac-symbol-medallion",
            "Blue Ocean Resin Wall Clock": "blue-hour-resin-clock",
            "Turquoise Resin Tray with 4 Coasters": "turquoise-tray-and-coasters",
            "Jewel Resin Tealight Holder": "jewel-glow-tealight",
            "Shubh Labh Door Hanging Pair": "shubh-labh-welcome-pair",
        }
        tool = load_product_pages_tool()
        cards = tool.parse_cards(self.home)
        by_name = dict(zip((card["name"] for card in cards), self.slugs))
        feed_ids = [line.split("\t")[0] for line in (ROOT / "merchant-feed.tsv").read_text(encoding="utf-8").splitlines()[1:]]
        for name, slug in keep.items():
            self.assertEqual(by_name.get(name), slug, name)
            self.assertIn("<h1>" + html.escape(name, quote=False) + "</h1>", self.page(slug)[0], name)
        self.assertEqual(len(self.slugs), 106)
        # 52 products (all real photos, no AI trial); each size of a sized product is its own row (the default size keeps the product's id).
        self.assertEqual(len({line.split("\t")[10] or line.split("\t")[0] for line in (ROOT / "merchant-feed.tsv").read_text(encoding="utf-8").splitlines()[1:]}), 52)
        self.assertEqual(len(feed_ids), 95)

    def test_pages_and_card_slugs_are_in_step_with_index_html(self):
        tool = load_product_pages_tool()
        stamped, pages, sitemap = tool.build(self.home, (ROOT / "sitemap.xml").read_text(encoding="utf-8"))
        self.assertEqual(stamped, self.home, "index.html data-product-slug is stale: run python3 tools/product_pages.py")
        self.assertEqual((ROOT / "sitemap.xml").read_text(encoding="utf-8"), sitemap, "sitemap.xml is stale: run python3 tools/product_pages.py")
        for relative, expected in pages.items():
            self.assertEqual((ROOT / relative).read_text(encoding="utf-8"), expected, relative + " is stale: run python3 tools/product_pages.py")
        self.assertEqual(len(pages), len(self.products) + len(tool.TOPICS))

    def test_every_share_image_is_a_sized_progressive_jpeg_that_matches_its_page_tags(self):
        # WhatsApp is the main target: every preview image is a JPEG of a safe size and weight, never cropped.
        by_slug = dict(zip(self.slugs, self.products))
        for slug, product in by_slug.items():
            path = ROOT / "assets" / "share" / (slug + ".jpg")
            self.assertTrue(path.is_file(), slug + ": run tools/share_images.py")
            frame = jpeg_frame(path)
            self.assertEqual(frame["marker"], 0xC2, slug + " is progressive")
            self.assertEqual(frame["components"], 3, slug + " is RGB")
            width, height = frame["size"]
            self.assertGreaterEqual(min(width, height), 600, slug)
            self.assertLessEqual(max(width, height), 1200, slug)
            self.assertLess(path.stat().st_size, 300 * 1024, slug)
            _, tags = self.page(slug)
            self.assertEqual((tags.meta["og:image:width"], tags.meta["og:image:height"]), (str(width), str(height)), slug)
            source = ROOT / "assets" / re.sub(r"^catalogue:", "", product["id"])
            source_width, source_height = webp_dimensions(source) if source.suffix == ".webp" else jpeg_dimensions(source)
            self.assertLess(abs(width / height - source_width / source_height), 0.01, slug + " keeps the photo's own shape (no crop)")

    def test_share_images_have_no_orphans(self):
        on_disk = sorted(path.name for path in (ROOT / "assets" / "share").iterdir() if not path.name.startswith("."))
        self.assertEqual(on_disk, sorted(slug + ".jpg" for slug in self.slugs), "a share image with no product (or a product without one)")

    def test_share_image_tool_is_separate_and_the_page_tool_stays_standard_library_only(self):
        self.assertTrue((ROOT / "tools" / "share_images.py").is_file())
        self.assertIn("PIL", (ROOT / "tools" / "share_images.py").read_text(encoding="utf-8"))
        self.assertNotRegex(self.tool_path.read_text(encoding="utf-8"), r"(?m)^\s*(?:from|import)\s+PIL\b")

    def test_each_page_has_the_products_own_preview_tags(self):
        by_slug = dict(zip(self.slugs, self.products))
        for slug, product in by_slug.items():
            text, tags = self.page(slug)
            name = html.unescape(product["name"])
            file_name = re.sub(r"^catalogue:", "", product["id"])
            url = self.SITE + "/p/" + slug + "/"
            title = name + " | Saloni Resin Art Studio"
            self.assertEqual(tags.title, title, slug)
            self.assertEqual(tags.meta["og:title"], title, slug)
            self.assertEqual(tags.meta["twitter:title"], title, slug)
            self.assertEqual(tags.links["canonical"], url, slug)
            self.assertEqual(tags.meta["og:url"], url, slug)
            image = self.SITE + "/assets/share/" + slug + ".jpg"
            self.assertEqual(tags.meta["og:image"], image, slug)
            self.assertEqual(tags.meta["twitter:image"], image, slug)
            self.assertTrue((ROOT / "assets" / file_name).is_file(), slug + " source photo is missing")
            self.assertTrue(tags.meta["og:image:alt"].strip(), slug)
            self.assertEqual(tags.meta["twitter:image:alt"], tags.meta["og:image:alt"], slug)
            self.assertEqual(tags.meta["twitter:card"], "summary_large_image", slug)
            self.assertEqual(tags.meta["og:type"], "website", slug)
            self.assertEqual(tags.meta["og:site_name"], "Saloni Resin Art Studio", slug)
            self.assertEqual(tags.meta["og:description"], tags.meta["twitter:description"], slug)
            self.assertEqual(tags.meta["og:description"], tags.meta["description"], slug)
            self.assertRegex(tags.meta["og:description"], "₹[0-9]|Price on request", slug)
            self.assertLessEqual(len(tags.meta["og:description"]), 220, slug)
            self.assertNotRegex((tags.meta.get("robots") or "").lower(), r"noindex|nofollow", slug)
            self.assertNotIn('rel="alternate"', text)

    def test_og_description_carries_the_cards_own_price_and_size(self):
        text, tags = self.page("jewel-glow-tealight")
        self.assertEqual(tags.meta["og:title"], "Jewel Resin Tealight Holder | Saloni Resin Art Studio")
        self.assertTrue(tags.meta["og:description"].startswith("₹249 · 4 in. "), tags.meta["og:description"])
        self.assertIn("Rich colour and golden flecks for a festive corner", tags.meta["og:description"])
        self.assertEqual(tags.meta["og:image"], "https://saloniresinart.com/assets/share/jewel-glow-tealight.jpg")
        self.assertEqual(tags.meta["og:image:alt"], "Jewel-toned resin tealight holder with golden flecks")
        _, range_tags = self.page("happy-diwali-glow")
        self.assertTrue(range_tags.meta["og:description"].startswith("₹325 · "), range_tags.meta["og:description"])

    def cards(self):
        """(slug, card) for each catalogue card; the price is read from index.html itself, not from the tool."""
        tool = load_product_pages_tool()
        cards = tool.parse_cards(self.home)
        self.assertEqual(len(cards), len(self.slugs))
        result = []
        for slug, card in zip(self.slugs, cards):
            article = self.home[card["start"]:card["end"]]
            self.assertIn('data-product-slug="' + slug + '"', article)
            price = re.search(r"<dt>Price</dt><dd>([^<]+)</dd>", article)
            self.assertIsNotNone(price, slug)
            result.append((slug, dict(card, price=html.unescape(price.group(1)))))
        return result

    def test_price_offer_reads_every_known_format_and_stops_on_anything_else(self):
        tool = load_product_pages_tool()
        self.assertEqual(tool.price_offer("₹399"), {"@type": "Offer", "price": "399", "priceCurrency": "INR"})
        self.assertEqual(tool.price_offer("₹3,499")["price"], "3499")
        self.assertEqual(tool.price_offer("₹1,00,000")["price"], "100000")
        self.assertEqual(
            tool.price_offer("₹12,000–₹15,000"),
            {"@type": "AggregateOffer", "lowPrice": "12000", "highPrice": "15000", "priceCurrency": "INR"},
        )
        self.assertIsNone(tool.price_offer("Price on request"))
        for bad in ("", "Rs 3499", "₹3.499", "₹3,499 onwards", "₹500–₹400", "₹3,499-₹4,000"):
            with self.assertRaises(SystemExit, msg=repr(bad)):
                tool.price_offer(bad)

    def test_structured_data_matches_the_card_price_on_every_page(self):
        from urllib.parse import quote
        forbidden = {"aggregateRating", "review", "availability", "priceValidUntil", "sku", "gtin"}

        def keys(value):
            if isinstance(value, dict):
                for key, inner in value.items():
                    yield key
                    yield from keys(inner)
            elif isinstance(value, list):
                for inner in value:
                    yield from keys(inner)

        kinds = {"Offer": 0, "AggregateOffer": 0, "none": 0}
        for slug, card in self.cards():
            text, _ = self.page(slug)
            shown = re.search(r'<p class="price">([^<]*)</p>', text)
            self.assertIsNotNone(shown, slug)
            self.assertEqual(html.unescape(shown.group(1)), card["price"], slug)
            blocks = [json.loads(block) for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', text, re.S)]
            products = [block for block in blocks if block.get("@type") == "Product"]
            self.assertEqual(len([block for block in blocks if block.get("@type") == "BreadcrumbList"]), 1, slug)
            if '<form class="size-form"' in text:
                # A product with sizes states a ProductGroup instead (ProductSizeTests checks its variants).
                self.assertEqual(len([block for block in blocks if block.get("@type") == "ProductGroup"]), 1, slug)
                self.assertEqual(len(blocks), 2, slug)
                kinds["Offer"] += 1
                continue
            self.assertEqual(len(blocks), len(products) + 1, slug)
            if card["price"] == "Price on request":
                self.assertEqual(products, [], slug)
                kinds["none"] += 1
                continue
            self.assertEqual(len(products), 1, slug)
            data = products[0]
            self.assertEqual(data["@context"], "https://schema.org", slug)
            self.assertEqual(data["@type"], "Product", slug)
            self.assertEqual(data["name"], card["name"], slug)
            self.assertEqual(data.get("description"), card["line"] or None, slug)
            self.assertEqual(data["image"], self.SITE + "/assets/" + quote(card["file"]), slug)
            self.assertTrue((ROOT / "assets" / card["file"]).is_file(), slug)
            shown_src = re.search(r'<img src="/assets/([^"]+)"', text)
            self.assertEqual(html.unescape(shown_src.group(1)), card["file"], slug + ": the JSON-LD photo is the visible photo")
            self.assertEqual(data["brand"], {"@type": "Brand", "name": "Saloni Resin Art Studio"}, slug)
            offer = data["offers"]
            self.assertEqual(offer["priceCurrency"], "INR", slug)
            digits = [part.replace(",", "") for part in re.findall(r"₹([0-9,]+)", card["price"])]
            if len(digits) == 2:
                self.assertEqual(offer["@type"], "AggregateOffer", slug)
                self.assertEqual((offer["lowPrice"], offer["highPrice"]), tuple(digits), slug)
                kinds["AggregateOffer"] += 1
            else:
                self.assertEqual(offer["@type"], "Offer", slug)
                self.assertEqual(offer["price"], digits[0], slug)
                kinds["Offer"] += 1
            self.assertFalse(forbidden & set(keys(data)), slug)
        self.assertEqual(sum(kinds.values()), len(self.products))
        # Since 2026-11-20 every card has one exact price; ranges and "on request" stay covered by the price_offer unit test.
        self.assertEqual(kinds, {"Offer": len(self.products), "AggregateOffer": 0, "none": 0})

    def test_pages_are_real_product_pages_with_one_order_button(self):
        self.sizes = load_product_pages_tool().load_sizes(ROOT)
        section_ids = set(re.findall(r'<section[^>]*\bid="([^"]+)"', self.home))
        for slug, card in self.cards():
            text, tags = self.page(slug)
            self.assertFalse(tags.meta_refresh, slug + " must not use meta refresh: crawlers follow it and lose the product tags")
            self.assertNotRegex(text, r"location\.(?:replace|assign)|location\.href\s*=", slug)
            self.assertNotIn("<noscript", text, slug)
            self.assertIn(card["section"], section_ids, slug)
            self.assertEqual(tags.body_links[:2], ["#main-content", "/"], slug + ": skip link, then the site header wordmark")
            sized = bool(self.sizes[slug]["options"])
            # A one-size page has an Add to cart link; a sized page has a form that goes to the same address plus the chosen size.
            self.assertEqual([link for link in tags.body_links if "?product=" in link], [] if sized else ["/?product=" + slug + "&add=1#" + card["section"]], slug)
            self.assertEqual(text.count('<form class="size-form" action="/#%s" method="get">' % card["section"]), 1 if sized else 0, slug)
            self.assertEqual(tags.noscript_links, [], slug)
            self.assertEqual(re.findall(r"<h1>([^<]*)</h1>", text), [html.escape(card["name"], quote=True)], slug)
            sizes = re.findall(r'<p class="size">Size: ([^<]*)</p>', text)
            self.assertEqual([html.unescape(size) for size in sizes], [card["size"]] if card["size"] and not sized else [], slug)
            image = re.search(r'<img src="/assets/[^"]+" alt="([^"]*)"( width="(\d+)" height="(\d+)")?', text)
            self.assertIsNotNone(image, slug)
            self.assertEqual(html.unescape(image.group(1)), card["alt"] or card["name"], slug)
            self.assertEqual((image.group(3) or "", image.group(4) or ""), (card["width"], card["height"]), slug)
            # The only script file is google.js (the cookie banner); the tag itself loads only after Accept.
            self.assertEqual(re.findall(r'<script\b[^>]*\bsrc="([^"]+)"', text), ["/google.js?v=" + self.version], slug)
            # A sized page adds one small inline script (it preselects ?size= and keeps the price pill in step).
            self.assertEqual(re.findall(r"<script\b([^>]*)>", text), [' type="application/ld+json"'] * len(re.findall(r"application/ld\+json", text)) + [' src="/google.js?v=%s" defer' % self.version] + ([""] if sized else []), slug)
        # The button lands in the section the card sits in.
        _, tags = self.page("jewel-glow-tealight")
        self.assertEqual([link for link in tags.body_links if "?product=" in link], ["/?product=jewel-glow-tealight&add=1#diwali"])
        _, tags = self.page("two-keys-one-little-us")
        self.assertEqual([link for link in tags.body_links if "?product=" in link], ["/?product=two-keys-one-little-us&add=1#romantic-keepsakes"])

    def test_every_product_has_a_small_progressive_thumb_that_its_card_points_to(self):
        for slug in self.slugs:
            path = ROOT / "assets" / "thumb" / (slug + ".jpg")
            self.assertTrue(path.is_file(), slug + ": run tools/share_images.py")
            frame = jpeg_frame(path)
            self.assertEqual((frame["marker"], frame["components"], frame["size"]), (0xC2, 3, (300, 300)), slug)
            self.assertLess(path.stat().st_size, 30 * 1024, slug)
        on_disk = sorted(path.name for path in (ROOT / "assets" / "thumb").iterdir() if not path.name.startswith("."))
        self.assertEqual(on_disk, sorted(slug + ".jpg" for slug in self.slugs), "a thumb with no product, or a product without one")
        tags = re.findall(r'<a class="lightbox-trigger" data-lightbox-trigger[^>]*? data-product-slug="([^"]+)"([^>]*)>', self.home)
        self.assertEqual([slug for slug, _ in tags], self.slugs)
        for slug, rest in tags:
            self.assertEqual(re.search(r' data-thumb="([^"]*)"', rest).group(1), "assets/thumb/%s.jpg" % slug, slug)
        # A missing or wrongly sized thumb stops the generator instead of leaving a broken image.
        import tempfile
        tool = load_product_pages_tool()
        with tempfile.TemporaryDirectory() as scratch:
            folder = Path(scratch) / "assets" / "thumb"
            folder.mkdir(parents=True)
            with self.assertRaises(SystemExit) as caught:
                tool.thumb(Path(scratch), "gone")
            self.assertIn("share_images.py", str(caught.exception))
            (folder / "big.jpg").write_bytes((ROOT / "assets" / "share" / (self.slugs[0] + ".jpg")).read_bytes())
            with self.assertRaises(SystemExit):
                tool.thumb(Path(scratch), "big")
            (folder / "ok.jpg").write_bytes((ROOT / "assets" / "thumb" / (self.slugs[0] + ".jpg")).read_bytes())
            self.assertEqual(tool.thumb(Path(scratch), "ok"), "assets/thumb/ok.jpg")

    def test_popup_more_like_this_matches_the_product_pages(self):
        tags = re.findall(r'<a class="lightbox-trigger" data-lightbox-trigger[^>]*? data-product-slug="([^"]+)"([^>]*)>', self.home)
        self.assertEqual(len(tags), len(self.slugs))
        for slug, rest in tags:
            with self.subTest(slug=slug):
                text, _ = self.page(slug)
                block = re.search(r'<section class="more" aria-labelledby="more-title">.*?</section>', text, re.S).group(0)
                from_page = [href.split("/")[2] for href in re.findall(r'<a href="([^"]+)">', block)]
                attribute = re.match(r' data-more-like-this="([^"]*)"', rest)
                self.assertIsNotNone(attribute, "the attribute sits right after data-product-slug")
                self.assertEqual(attribute.group(1).split(" "), from_page)
        figure = re.search(r'<figure class="lightbox-figure".*?</figure>', self.home, re.S).group(0)
        section = '<section class="lightbox-more" id="lightbox-more" aria-labelledby="lightbox-more-title" hidden><h3 id="lightbox-more-title">More like this</h3><ul class="lightbox-more-list" id="lightbox-more-list"></ul></section>'
        self.assertIn(section, figure)
        self.assertLess(figure.index('class="lightbox-care"'), figure.index(section))
        self.assertTrue(figure.rstrip().endswith(section + "\n      </figure>"))

    def test_every_page_has_a_path_line_and_four_more_pieces_that_link_the_pages_together(self):
        tool = load_product_pages_tool()
        cards = tool.parse_cards(self.home)
        slugs = tool.assign_slugs(cards)
        by_slug = dict(zip(slugs, cards))

        def topic_group(topic):
            return list(topic["products"]) if "products" in topic else [s for s, c in zip(slugs, cards) if c["section"] == topic["section"]]

        linked = set()
        for slug, card in by_slug.items():
            with self.subTest(slug=slug):
                text, tags = self.page(slug)
                topic = next((t for t in tool.TOPICS if slug in topic_group(t)), None)
                held = {s for t in tool.TOPICS for s in topic_group(t)}
                group = topic_group(topic) if topic else [s for s, c in zip(slugs, cards) if c["section"] == card["section"] and s not in held]
                allowed = set(group) | {s for s, c in zip(slugs, cards) if c["section"] == "studio-art"}

                # The visible path line, and the BreadcrumbList that says the same thing.
                canonical = self.SITE + "/p/" + slug + "/"
                self.assertEqual(tags.links["canonical"], canonical)
                shown = [("/", "Home")] + ([("/%s/" % topic["slug"], topic["link"])] if topic else []) + [(None, card["name"])]
                nav = re.search(r'<nav class="path" aria-label="Breadcrumb"><ol>(.*?)</ol></nav>', text, re.S).group(1)
                self.assertLess(text.index('<nav class="path"'), text.index("<img "), "the path line comes before the photo")
                entries = re.findall(r"<li( aria-current=\"page\")?>(.*?)</li>", nav)
                self.assertEqual(len(entries), len(shown))
                for number, ((current, inner), (href, label)) in enumerate(zip(entries, shown)):
                    self.assertEqual(bool(current), number == len(shown) - 1)
                    link = re.search(r'<a href="([^"]*)">(.*?)</a>', inner)
                    if href:
                        self.assertEqual((link.group(1), html.unescape(link.group(2))), (href, label))
                    else:
                        self.assertIsNone(link, "the product name is plain text")
                        self.assertEqual(html.unescape(re.sub(r"<[^>]*>", "", inner)), "›" + label)
                crumbs = [json.loads(b) for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', text, re.S)]
                crumb = [c for c in crumbs if c.get("@type") == "BreadcrumbList"][0]
                self.assertEqual(crumb["@context"], "https://schema.org")
                self.assertEqual([(i["position"], i["name"]) for i in crumb["itemListElement"]], [(n, label) for n, (_, label) in enumerate(shown, 1)])
                self.assertEqual([i["@type"] for i in crumb["itemListElement"]], ["ListItem"] * len(shown))
                urls = [i["item"] for i in crumb["itemListElement"]]
                self.assertEqual(urls, [self.SITE + (href or "/p/" + slug + "/") for href, _ in shown])
                self.assertEqual(urls[-1], canonical)

                # More like this: four different products from the product's own group (or "Fresh from the studio"), never the page itself.
                block = re.search(r'<section class="more" aria-labelledby="more-title"><h2 id="more-title">More like this</h2><ul>(.*?)</ul></section>', text, re.S).group(1)
                more = re.findall(r'<li><a href="([^"]*)">(<img [^>]*>)<span>(.*?)</span></a></li>', block)
                picked = [href.split("/")[2] for href, _, _ in more]
                self.assertEqual([href for href, _, _ in more], ["/p/%s/" % other for other in picked])
                self.assertEqual([html.unescape(name) for _, _, name in more], [by_slug[other]["name"] for other in picked])
                self.assertEqual([img for _, img, _ in more], ['<img src="/assets/thumb/%s.jpg" alt="" width="300" height="300" loading="lazy" decoding="async">' % other for other in picked])
                self.assertEqual(len(set(picked)), 4)
                self.assertNotIn(slug, picked)
                self.assertTrue(set(picked) <= allowed, "every pick is from the product's own group")
                self.assertTrue(all((ROOT / "p" / other / "index.html").is_file() for other in picked))
                linked.update(picked)

                # Every link on the page leads to a file in the site.
                for href in tags.body_links:
                    if href == "#main-content" or href == "https://www.instagram.com/saloniresin_art_studio/" or href.startswith("https://wa.me/918209238541?text="):
                        continue  # skip link, the studio Instagram in the site footer, and Ask Saloni on WhatsApp
                    path = re.split(r"[?#]", href)[0]
                    self.assertTrue(path.startswith("/"), href)
                    self.assertTrue((ROOT / path.strip("/") / "index.html").is_file(), href)
        self.assertEqual(linked, set(slugs), "every product page is linked from another product page")

    def test_more_like_this_puts_the_most_similar_products_first(self):
        def picks(slug):
            text, _ = self.page(slug)
            block = re.search(r'<section class="more".*?</section>', text, re.S).group(0)
            return re.findall(r'<a href="/p/([^/]+)/">', block)

        self.assertEqual(picks("lilac-symbol-medallion")[0], "little-brother-keepsake")
        self.assertEqual(picks("blue-and-white-namokar-mantra-frame")[:2], ["white-and-gold-namokar-mantra-frame", "pearl-white-namokar-mantra-frame"])
        self.assertFalse([slug for slug in picks("blue-and-white-namokar-mantra-frame") if slug.endswith("clock")], "no clock on a mantra frame page")
        self.assertEqual(picks("teal-and-gold-roman-resin-clock")[0], "sage-and-gold-resin-clock")
        self.assertTrue(all(slug.endswith("clock") for slug in picks("teal-and-gold-roman-resin-clock")))
        tool = load_product_pages_tool()
        cards = tool.parse_cards(self.home)
        held = {}
        for topic in reversed(tool.TOPICS):
            for _, other in tool.topic_items(topic, cards, self.slugs):
                held[other] = {s for _, s in tool.topic_items(topic, cards, self.slugs)}
        for slug in ("mr-and-mrs-name-plate", "rose-and-gold-festive-set", "labh-floral-hanging-pair"):
            card = cards[self.slugs.index(slug)]
            group = held.get(slug) or {s for s, c in zip(self.slugs, cards) if c["section"] == card["section"] and s not in held}
            self.assertEqual(len(picks(slug)), 4, slug)
            self.assertTrue(set(picks(slug)) <= group, slug + ": all four picks are in its own group")

    def test_pick_more_orders_similar_then_category_then_studio_and_leaves_no_product_unlinked(self):
        tool = load_product_pages_tool()

        def make(names, section="x"):
            cards = [{"name": name, "line": "", "alt": "", "section": section} for name in names]
            return cards, [name.lower().replace(" ", "-") for name in names]

        def run(cards, slugs, groups=None):
            pairs = list(zip(cards, slugs))
            picks = tool.pick_more(cards, slugs, groups or {slug: pairs for slug in slugs})
            return {slug: [other for _, other in picked] for slug, picked in picks.items()}

        # Three shared words count, two do not; similar ones first (most shared first), then the group in order.
        cards, slugs = make(["Blue Gold Lotus Tealight Holder", "Plain Cedar Box", "Blue Gold Mug", "Blue Gold Lotus Tray", "Blue Gold Lotus Tealight Tray", "Quiet Pine Tray", "Wide Oak Bowl"])
        picked = run(cards, slugs)
        self.assertEqual(picked[slugs[0]][:3], [slugs[4], slugs[3], slugs[1]], "4 shared, 3 shared, then the group order; 2 shared (blue gold mug) is not similar")
        # With nothing in common, the category fill starts after the product and wraps.
        cards, slugs = make(["Alpha Cedar", "Bravo Pine", "Charlie Oak", "Delta Elm", "Echo Fir", "Foxtrot Ash", "Golf Yew"])
        picked = run(cards, slugs)
        self.assertEqual(picked[slugs[5]], [slugs[6], slugs[0], slugs[1], slugs[2]])
        # A group too small to give four: "Fresh from the studio" (section studio-art, in order) fills the rest.
        group_cards, group_slugs = make(["Alpha Cedar", "Bravo Pine", "Charlie Oak"], "x")
        studio_cards, studio_slugs = make(["Studio One", "Studio Two", "Studio Three", "Studio Four", "Studio Five", "Studio Six"], "studio-art")
        cards, slugs = group_cards + studio_cards, group_slugs + studio_slugs
        small, big = list(zip(group_cards, group_slugs)), list(zip(studio_cards, studio_slugs))
        picked = run(cards, slugs, {**{s: small for s in group_slugs}, **{s: big for s in studio_slugs}})
        self.assertEqual(picked[group_slugs[0]], [group_slugs[1], group_slugs[2], studio_slugs[0], studio_slugs[1]])
        self.assertEqual(picked[group_slugs[1]], [group_slugs[2], group_slugs[0], studio_slugs[0], studio_slugs[1]])
        # Orphan fix: five similar products list only each other, so the two others are not listed anywhere;
        # the product before an unlisted one gives up its fourth pick for it.
        cards, slugs = make(["Rose Gold Floral Alpha", "Rose Gold Floral Bravo", "Rose Gold Floral Charlie", "Rose Gold Floral Delta", "Rose Gold Floral Echo", "Plain Cedar Box", "Quiet Pine Tray"])
        picked = run(cards, slugs)
        self.assertEqual(picked[slugs[4]], [slugs[0], slugs[1], slugs[2], slugs[5]])
        self.assertEqual({other for listed in picked.values() for other in listed}, set(slugs))
        for slug, listed in picked.items():
            self.assertEqual((len(listed), len(set(listed)), slug in listed), (4, 4, False))
        # A product nobody can list stops the script.
        cards, slugs = make(["Lonely Cedar"])
        with self.assertRaises(SystemExit):
            run(cards, slugs)

    def test_slugs_come_from_the_name_and_stay_stable_when_names_collide(self):
        tool = load_product_pages_tool()
        self.assertEqual(tool.slugify("Mr & Mrs Name Plate"), "mr-and-mrs-name-plate")
        self.assertEqual(tool.slugify("Bride's Jewellery Tray"), "brides-jewellery-tray")
        self.assertEqual(tool.slugify("Fiancé Initial Pendant"), "fiance-initial-pendant")
        self.assertEqual(tool.slugify("Two keys, one little us"), "two-keys-one-little-us")
        self.assertEqual(tool.slugify("  --Ö!!  "), "o")
        cards = [{"name": "Rose Tray", "file": "a-rose-tray.webp"}, {"name": "Rose  tray", "file": "b-rose-tray.webp"}, {"name": "Other", "file": "c.webp"}]
        first = tool.assign_slugs(cards)
        self.assertEqual(first[0], "rose-tray")
        self.assertNotEqual(first[1], "rose-tray")
        self.assertRegex(first[1], r"^rose-tray-[0-9a-f]{4}$")
        self.assertEqual(first[2], "other")
        # Adding another product later does not rename the ones before it.
        again = tool.assign_slugs(cards + [{"name": "Rose Tray", "file": "d-rose-tray.webp"}])
        self.assertEqual(again[:3], first)
        self.assertEqual(len(set(again)), 4)

    def test_generator_removes_pages_of_products_that_no_longer_exist(self):
        tool = load_product_pages_tool()
        import tempfile
        with tempfile.TemporaryDirectory() as scratch:
            out = Path(scratch)
            (out / "p" / "gone").mkdir(parents=True)
            (out / "p" / "gone" / "index.html").write_text("old", encoding="utf-8")
            (out / "p" / "keep").mkdir(parents=True)
            (out / "p" / "keep" / "index.html").write_text("old", encoding="utf-8")
            tool.remove_stale_pages(out, {"p/keep/index.html"})
            self.assertFalse((out / "p" / "gone").exists())
            self.assertTrue((out / "p" / "keep" / "index.html").exists())

    def test_merchant_feed_lists_only_real_photo_single_price_products(self):
        # Google Merchant Center fetches merchant-feed.tsv every day. AI preview photos (the AI_FEED_TRIAL set is empty, so
        # all of them) and prices that are a range or "on request" stay out.
        from urllib.parse import unquote
        tool = load_product_pages_tool()
        cards = tool.parse_cards(self.home)
        path = ROOT / "merchant-feed.tsv"
        self.assertTrue(path.is_file(), "merchant-feed.tsv is missing: run python3 tools/product_pages.py")
        text = path.read_text(encoding="utf-8")
        sizes = tool.load_sizes(ROOT)
        self.assertEqual(text, tool.merchant_feed(cards, self.slugs, sizes), "merchant-feed.tsv is stale: run python3 tools/product_pages.py")
        lines = text.splitlines()
        header = lines[0].split("\t")
        self.assertEqual(header, ["id", "title", "description", "link", "image_link", "availability", "price", "brand", "condition", "identifier_exists",
                                  "item_group_id", "item_group_title", "size"])
        wanted = [(slug, card) for slug, card in zip(self.slugs, cards)
                  if (not card["alt"].startswith("Illustrative preview:") or slug in tool.AI_FEED_TRIAL) and re.fullmatch(r"₹[0-9,]+", card["price"])]
        self.assertGreater(len(wanted), 0)
        # Each trial product is an AI preview, and its photo carries the IPTC trainedAlgorithmicMedia label.
        by_slug = dict(zip(self.slugs, cards))
        self.assertEqual(tool.AI_FEED_TRIAL, set(), "no AI-photo product is in the feed")
        # Were a trial product ever added, its AI photo would need the label; an unlabelled one stops the build instead of reaching Google.
        trial = next(slug for slug in self.slugs if by_slug[slug]["alt"].startswith("Illustrative preview:") and re.fullmatch(r"₹[0-9,]+", by_slug[slug]["price"]))
        unlabelled = [dict(card, file="diwali-lotus-diya-pair.webp") if slug == trial else card for slug, card in zip(self.slugs, cards)]
        original_trial = tool.AI_FEED_TRIAL
        tool.AI_FEED_TRIAL = {trial}
        try:
            with self.assertRaises(SystemExit):
                tool.merchant_feed(unlabelled, self.slugs, sizes)
        finally:
            tool.AI_FEED_TRIAL = original_trial
        # One row per product, except that each size of a sized product has its own row (checked in ProductSizeTests): here the default rows.
        rows = [line.split("\t") for line in lines[1:]]
        defaults = [fields for fields in rows if not fields[10] or fields[0] == fields[10]]
        self.assertEqual([fields[0] for fields in defaults], [slug for slug, _ in wanted])
        for line, (slug, card) in zip([line for line in lines[1:] if not line.split("\t")[10] or line.split("\t")[0] == line.split("\t")[10]], wanted):
            fields = line.split("\t")
            self.assertEqual(len(fields), len(header), slug)
            row = dict(zip(header, fields))
            self.assertNotIn('"', line, slug)
            self.assertTrue(all(value.strip() for value in fields[:10]), slug)
            self.assertEqual(row["title"], card["name"])
            self.assertIn(card["line"], row["description"])
            self.assertEqual(row["link"], "%s/p/%s/?source=google-shopping" % (self.SITE, slug))
            page, _ = self.page(slug)
            self.assertNotIn("source=", page, "the product page, its canonical tag and its share tags stay clean: " + slug)
            prefix = self.SITE + "/assets/"
            self.assertTrue(row["image_link"].startswith(prefix), slug)
            self.assertTrue((ROOT / "assets" / unquote(row["image_link"][len(prefix):])).is_file(), slug)
            self.assertEqual(row["price"], card["price"].lstrip("₹").replace(",", "") + " INR")
            self.assertIn('"price": "%s", "priceCurrency": "INR"' % row["price"].split(" ")[0], page, slug)
            self.assertEqual((row["availability"], row["brand"], row["condition"], row["identifier_exists"]),
                             ("in_stock", "Saloni Resin Art Studio", "new", "no"))

    def test_merchant_feed_stops_on_a_field_that_would_break_the_file(self):
        tool = load_product_pages_tool()
        card = dict(tool.parse_cards(self.home)[0], alt="Photo", price="₹100", name="Bad\tname")
        with self.assertRaises(SystemExit):
            tool.merchant_feed([card], ["bad-name"])
        sized = {"bad-name": {"price": 100, "choice": True, "default": "a", "options": [{"code": "a", "label": 'A "big" one', "price": 100}, {"code": "b", "label": "B", "price": 200}]}}
        with self.assertRaises(SystemExit):
            tool.merchant_feed([dict(card, name="Fine")], ["bad-name"], sized)


class TopicPageTests(unittest.TestCase):
    """The topic pages (/resin-clocks/ ...) are generated from the home cards: no price, only CollectionPage and ItemList data."""

    SITE = "https://saloniresinart.com"
    TOPIC_SLUGS = ["resin-clocks", "couple-gifts", "marriage-gifts", "celebration-lights", "resin-boards"]
    CLOCKS = [
        "teal-and-gold-roman-resin-clock", "sage-and-gold-resin-clock", "lilac-and-silver-resin-clock",
        "ivory-diamond-resin-clock", "sky-blue-roman-resin-clock", "pearl-geode-resin-clock",
        "blue-hour-resin-clock", "a-little-blue-hour", "personalized-photo-clock",
        "engagement-photo-clock", "mini-resin-desk-clock",
    ]
    LIGHTS = [
        "lotus-diya-pair", "floral-swastik-tealight-set", "jewel-glow-tealight", "gold-fleck-lotus-light",
        "pastel-lotus-tealight", "marigold-petal-holder", "ivory-mandala-holder", "emerald-glow-pair",
        "sunflower-resin-lamp",
    ]
    BOARDS = [
        "mr-and-mrs-name-plate", "resin-desk-nameplate", "turquoise-tray-and-coasters", "smoky-bronze-handled-tray",
        "champagne-white-handled-tray", "silver-icy-blue-handled-tray", "ocean-seashell-tray", "pastel-butterfly-trays",
    ]
    HAND_WRITTEN = [
        ("index.html", ""), ("corporate-gifting/index.html", "../"), ("partners/index.html", "../"),
        ("resin-photo-frames/index.html", "../"), ("namokar-mantra-frames/index.html", "../"),
        ("reviews/index.html", "../"), ("varmala-preservation/index.html", "../"), ("shipping-and-returns/index.html", "../"),
    ]

    @classmethod
    def setUpClass(cls):
        cls.tool = load_product_pages_tool()
        cls.home = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.cards = cls.tool.parse_cards(cls.home)
        cls.slugs = cls.tool.assign_slugs(cls.cards)
        cls.by_slug = dict(zip(cls.slugs, cls.cards))
        cls.version = re.search(r'href="styles\.css\?v=(\d+)"', cls.home).group(1)

    def text(self, slug):
        path = ROOT / slug / "index.html"
        self.assertTrue(path.is_file(), "missing topic page " + slug)
        return path.read_text(encoding="utf-8")

    def meta(self, slug):
        tags = PageTags()
        tags.feed(self.text(slug))
        return tags

    def page_cards(self, slug):
        """(slug, img attributes, h2 text, link href) for each card on the page."""
        found = []
        for article in re.findall(r'<article class="collection-card">(.*?)</article>', self.text(slug), re.S):
            img = re.search(r"<img\b[^>]*>", article).group(0)
            attrs = {key: html.unescape(value) for key, value in re.findall(r'([\w-]+)="([^"]*)"', img)}
            href = re.search(r'<a class="button button-line collection-card-link" href="([^"]+)"', article).group(1)
            found.append((href, attrs, html.unescape(re.search(r"<h2>(.*?)</h2>", article, re.S).group(1))))
        return found

    def json_ld(self, slug):
        blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', self.text(slug), re.S)
        self.assertEqual(len(blocks), 1, slug)
        return json.loads(blocks[0])

    def test_topic_items_fail_loudly(self):
        def card(name, section):
            return {
                "name": name, "file": name + ".webp", "alt": "", "width": "10", "height": "10", "section": section,
                "price": "₹100", "size": "", "line": "A line.", "srcset": "", "start": 0, "end": 0,
            }

        cards = [card("One", "a"), card("Two", "a"), card("Three", "a"), card("Four", "b"), card("Five", "b")]
        index = '<link rel="stylesheet" href="styles.css?v=1">'
        sitemap = ""

        def build_with(topics):
            with mock.patch.object(self.tool, "TOPICS", topics), \
                    mock.patch.object(self.tool, "parse_cards", return_value=cards), \
                    mock.patch.object(self.tool, "share_size", return_value=(10, 10)), \
                    mock.patch.object(self.tool, "thumb", return_value="assets/thumb/x.jpg"), \
                    mock.patch.object(self.tool, "stamp", return_value=index):
                return self.tool.build(index, sitemap, sizes={})

        base = {"slug": "topic", "link": "Topic", "title": "T", "description": "D", "heading": "H", "intro": "I"}
        # The helper accepts a valid topic, so each failure below comes from its own rule.
        _, pages, _ = build_with([dict(base, section="a")])
        self.assertIn("topic/index.html", pages)
        self.assertEqual(len([key for key in pages if key.startswith("p/")]), 5)
        bad = {
            "unknown slug": [dict(base, products=["one", "nope", "two"])],
            "duplicate slug": [dict(base, products=["one", "two", "two"])],
            "both products and section": [dict(base, products=["one", "two", "three"], section="a")],
            "neither products nor section": [dict(base)],
            "unknown section": [dict(base, section="zzz")],
            "fewer than 3 cards": [dict(base, section="b")],
            "repeated topic slug": [dict(base, section="a"), dict(base, section="a")],
            "topic slug p": [dict(base, slug="p", section="a")],
        }
        for label, topics in bad.items():
            with self.subTest(label):
                with self.assertRaises(SystemExit) as caught:
                    build_with(topics)
                self.assertIn("fix TOPICS in tools/product_pages.py", str(caught.exception))

    def test_topic_cards_match_the_table(self):
        self.assertEqual([topic["slug"] for topic in self.tool.TOPICS], self.TOPIC_SLUGS)
        expected = {
            "resin-clocks": self.CLOCKS,
            "couple-gifts": [slug for slug, card in zip(self.slugs, self.cards) if card["section"] == "romantic-keepsakes"],
            "marriage-gifts": [slug for slug, card in zip(self.slugs, self.cards) if card["section"] == "marriage-gifts"],
            "celebration-lights": self.LIGHTS,
            "resin-boards": self.BOARDS,
        }
        for topic, product_slugs in expected.items():
            with self.subTest(topic):
                self.assertGreaterEqual(len(product_slugs), 3)
                found = self.page_cards(topic)
                self.assertEqual([href for href, _, _ in found], ["../p/%s/" % slug for slug in product_slugs])
                for (href, attrs, heading), slug in zip(found, product_slugs):
                    card = self.by_slug[slug]
                    self.assertEqual(heading, card["name"], slug)
                    self.assertTrue((ROOT / "p" / slug / "index.html").is_file(), slug)
                    self.assertEqual(attrs["src"], "../assets/" + card["file"], slug)
                    self.assertTrue((ROOT / "assets" / card["file"]).is_file(), slug)
                    self.assertEqual(attrs["alt"], card["alt"] or card["name"], slug)
                    self.assertEqual((attrs["width"], attrs["height"]), (card["width"], card["height"]), slug)
                    self.assertEqual("srcset" in attrs, bool(card["srcset"]), slug)
                    if card["srcset"]:
                        self.assertEqual(attrs["srcset"], ", ".join("../" + part.strip() for part in card["srcset"].split(",")), slug)
                        for part in attrs["srcset"].split(","):
                            self.assertTrue((ROOT / topic / part.strip().rsplit(" ", 1)[0]).resolve().is_file(), slug)
                hero = re.search(r'<figure class="collection-hero-image">\s*<img ([^>]*)>', self.text(topic)).group(1)
                hero_attrs = {key: html.unescape(value) for key, value in re.findall(r'([\w-]+)="([^"]*)"', hero)}
                first = self.by_slug[product_slugs[0]]
                self.assertEqual(hero_attrs["src"], "../assets/" + first["file"])
                self.assertEqual(hero_attrs["alt"], first["alt"] or first["name"])
                self.assertEqual((hero_attrs["width"], hero_attrs["height"]), (first["width"], first["height"]))
                self.assertNotIn("srcset", hero_attrs)

    def test_topic_pages_state_no_price_and_only_collection_data(self):
        def types(node):
            found = set()
            if isinstance(node, dict):
                if "@type" in node:
                    found.add(node["@type"])
                for value in node.values():
                    found |= types(value)
            elif isinstance(node, list):
                for value in node:
                    found |= types(value)
            return found

        def keys(node):
            found = set()
            if isinstance(node, dict):
                found |= set(node)
                for value in node.values():
                    found |= keys(value)
            elif isinstance(node, list):
                for value in node:
                    found |= keys(value)
            return found

        for topic in self.TOPIC_SLUGS:
            with self.subTest(topic):
                text = self.text(topic)
                self.assertNotIn("₹", text)
                self.assertNotIn("product-pricing", text)
                data = self.json_ld(topic)
                self.assertTrue(types(data) <= {"CollectionPage", "WebSite", "ItemList", "ListItem"}, types(data))
                self.assertEqual(data["@type"], "CollectionPage")
                self.assertFalse({"offers", "price", "priceCurrency", "aggregateRating", "review"} & keys(data))
                items = data["mainEntity"]["itemListElement"]
                self.assertEqual([item["url"] for item in items], [self.SITE + "/p/" + href.split("/")[2] + "/" for href, _, _ in self.page_cards(topic)])
                self.assertEqual([item["position"] for item in items], list(range(1, len(items) + 1)))
                self.assertEqual([item["name"] for item in items], [heading for _, _, heading in self.page_cards(topic)])

    def test_topic_metadata(self):
        ids = {}
        for topic in self.tool.TOPICS:
            slug = topic["slug"]
            with self.subTest(slug):
                tags = self.meta(slug)
                text = self.text(slug)
                url = "%s/%s/" % (self.SITE, slug)
                full_title = topic["title"] + " | Saloni Resin Art Studio"
                self.assertEqual(tags.links["canonical"], url)
                self.assertEqual(tags.meta["og:url"], url)
                self.assertEqual(tags.title, full_title)
                self.assertEqual(tags.meta["og:title"], full_title)
                self.assertEqual(tags.meta["twitter:title"], full_title)
                self.assertEqual(tags.meta["description"], topic["description"])
                self.assertEqual(tags.meta["og:description"], topic["description"])
                self.assertEqual(tags.meta["twitter:description"], topic["description"])
                self.assertLessEqual(len(topic["description"]), 160)
                first = self.by_slug[self.page_cards(slug)[0][0].split("/")[2]]
                first_slug = self.page_cards(slug)[0][0].split("/")[2]
                share = ROOT / "assets" / "share" / (first_slug + ".jpg")
                width, height = jpeg_frame(share)["size"]
                self.assertEqual(tags.meta["og:image"], "%s/assets/share/%s.jpg" % (self.SITE, first_slug))
                self.assertEqual(tags.meta["twitter:image"], tags.meta["og:image"])
                self.assertEqual((tags.meta["og:image:width"], tags.meta["og:image:height"]), (str(width), str(height)))
                self.assertEqual(tags.meta["og:image:alt"], first["alt"] or first["name"])
                self.assertEqual(tags.meta["twitter:image:alt"], tags.meta["og:image:alt"])
                self.assertEqual(len(re.findall(r"<h1\b", text)), 1)
                self.assertEqual(self.json_ld(slug)["description"], topic["description"])
        pages = ["index.html"] + sorted(str(path.relative_to(ROOT)) for path in list(ROOT.glob("*/index.html")) + list(ROOT.glob("p/*/index.html")))
        seen = {"title": {}, "description": {}, "h1": {}}
        for page in pages:
            text = (ROOT / page).read_text(encoding="utf-8")
            tags = PageTags()
            tags.feed(text)
            h1 = re.search(r"<h1\b[^>]*>(.*?)</h1>", text, re.S)
            for kind, value in (("title", tags.title), ("description", tags.meta.get("description")), ("h1", h1 and re.sub(r"<[^>]*>", "", h1.group(1)).strip())):
                if value:
                    self.assertNotIn(value, seen[kind], "%s repeats the %s of %s" % (page, kind, seen[kind].get(value)))
                    seen[kind][value] = page

    def test_topic_pages_keep_site_wide_contracts(self):
        varmala = self.text("varmala-preservation")
        nav = re.search(r'<nav class="collection-nav".*?</nav>', varmala, re.S).group(0)
        header = re.search(r'<header class="site-header">.*?</header>', varmala, re.S).group(0)
        for topic in self.TOPIC_SLUGS:
            with self.subTest(topic):
                text = self.text(topic)
                self.assertIn('<meta name="theme-color" content="#fbd3e5">', text)
                self.assertIn('<link rel="apple-touch-icon" href="../assets/apple-touch-icon.png">', text)
                self.assertIn('<link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">', text)
                self.assertEqual(set(re.findall(r"\?v=(\d+)", text)), {self.version})
                for asset in ("styles.css", "analytics.js", "script.js"):
                    self.assertIn("../%s?v=%s" % (asset, self.version), text)
                for banned in ("<iframe", "my-orders.js", "customizer.js"):
                    self.assertNotIn(banned, text)
                self.assertIn('<a class="skip-link" href="#main-content">', text)
                self.assertIn('<main id="main-content" tabindex="-1">', text)
                ids = re.findall(r'\bid="([^"]+)"', text)
                self.assertEqual(len(ids), len(set(ids)))
                for target in re.findall(r'aria-labelledby="([^"]+)"', text):
                    self.assertIn(target, ids)
                self.assertEqual(re.search(r'<nav class="collection-nav".*?</nav>', text, re.S).group(0), nav)
                self.assertEqual(len(re.findall(r"<a\b", nav)), 4)
                self.assertEqual(re.search(r'<header class="site-header">.*?</header>', text, re.S).group(0), header)
                footer = re.search(r"<footer\b.*?</footer>", text, re.S).group(0)
                self.assertIn('<a href="../#customer-reviews">Reviews</a>', footer)
                self.assertIn('<a href="../varmala-preservation/">Varmala preservation</a>', footer)
                visible = re.sub(r"<script\b.*?</script>", "", text, flags=re.S)
                visible = re.sub(r"<[^>]*>", " ", visible)
                self.assertNotIn("Illustrative preview", visible)
                customer_markup = re.sub(r'\s(?:src|srcset|href)=["\'][^"\']*["\']', "", text, flags=re.IGNORECASE)
                customer_markup = re.sub(r'\scontent=["\'][^"\']*(?:/assets/|\.(?:webp|jpe?g|png|svg))[^"\']*["\']', "", customer_markup, flags=re.IGNORECASE)
                self.assertNotRegex(customer_markup, re.compile(r"\bconcept\b", re.IGNORECASE))
                self.assertNotRegex(text, re.compile(r"\b(?:guarantee|lifetime|refund|returns)\b", re.IGNORECASE))
                for tag in re.findall(r"<img\b[^>]*>", text):
                    for attribute in ("alt=", "width=", "height=", 'loading="lazy"'):
                        self.assertIn(attribute, tag)

    def test_every_page_footer_links_every_topic_and_no_stray_pages(self):
        pages = self.HAND_WRITTEN + [("%s/index.html" % topic, "../") for topic in self.TOPIC_SLUGS]
        for page, prefix in pages:
            footer = re.search(r"<footer\b.*?</footer>", (ROOT / page).read_text(encoding="utf-8"), re.S).group(0)
            for topic in self.tool.TOPICS:
                with self.subTest(page=page, topic=topic["slug"]):
                    self.assertIn('<a href="%s%s/">%s</a>' % (prefix, topic["slug"], html.escape(topic["link"])), footer)
        known = {"corporate-gifting", "partners", "resin-photo-frames", "namokar-mantra-frames", "reviews", "varmala-preservation", "customised-hampers", "shipping-and-returns", "contact", "terms", "privacy"}
        folders = {path.parent.name for path in ROOT.glob("*/index.html")}
        self.assertEqual(folders, known | set(self.TOPIC_SLUGS))


class PolicyPageTests(unittest.TestCase):
    """Google Merchant Center checks a shop for contact details, terms and a privacy policy (Misrepresentation, 2026-11-22)."""

    def test_contact_terms_and_privacy_pages_are_linked_and_name_the_studio(self):
        home = (ROOT / "index.html").read_text(encoding="utf-8")
        footer = re.search(r"<footer\b.*?</footer>", home, re.S).group(0)
        for slug, title in (("contact", "Contact"), ("terms", "Terms of service"), ("privacy", "Privacy policy")):
            with self.subTest(page=slug):
                self.assertIn('<a href="%s/">' % slug, footer)
                page = (ROOT / slug / "index.html").read_text(encoding="utf-8")
                self.assertIn("<title>%s | Saloni Resin Art Studio</title>" % title, page)
                self.assertIn('<link rel="canonical" href="https://saloniresinart.com/%s/">' % slug, page)
                self.assertIn("salonijain9166@gmail.com", page)
                self.assertIn("Ajmer", page)
        contact = (ROOT / "contact" / "index.html").read_text(encoding="utf-8")
        for fact in ("House No. 61, Hathi Bhata, Ajmer, Rajasthan 305001", 'href="tel:+918209238541"', 'href="mailto:salonijain9166@gmail.com"'):
            self.assertIn(fact, contact)
        terms = (ROOT / "terms" / "index.html").read_text(encoding="utf-8")
        self.assertIn("Illustrative preview", terms)
        self.assertIn("Razorpay", (ROOT / "privacy" / "index.html").read_text(encoding="utf-8"))

    def test_whatsapp_catalogue_is_linked_from_home_and_contact(self):
        link = '<a class="contact-line" href="https://wa.me/c/918209238541" target="_blank" rel="noopener">'
        home = (ROOT / "index.html").read_text(encoding="utf-8")
        fallback = re.search(r'<div class="order-inline-fallback".*?</div>', home, re.S).group(0)
        self.assertIn(link, fallback)
        footer = re.search(r"<footer\b.*?</footer>", home, re.S).group(0)
        self.assertIn('href="https://wa.me/c/918209238541" target="_blank" rel="noopener">WhatsApp catalogue</a>', footer)
        contact = (ROOT / "contact" / "index.html").read_text(encoding="utf-8")
        self.assertIn('href="https://wa.me/c/918209238541" target="_blank" rel="noopener"', contact)


class ResponsiveCardImageTests(unittest.TestCase):
    """Card photos offer a 540 px copy (covers a 171 px card on a 3x phone), while src and the popup keep the full photo."""

    PAGES = {
        "index.html": 78,
        "resin-photo-frames/index.html": 2,
        "resin-clocks/index.html": 3,
        "couple-gifts/index.html": 9,
        "marriage-gifts/index.html": 10,
        "celebration-lights/index.html": 6,
        "resin-boards/index.html": 4,
    }
    CARD_WIDTH = 540

    @staticmethod
    def real_size(path):
        return webp_dimensions(path) if path.suffix == ".webp" else jpeg_dimensions(path)

    def card_images(self, page):
        html_text = (ROOT / page).read_text(encoding="utf-8")
        for tag in re.findall(r"<img\b[^>]*>", html_text):
            if "srcset=" in tag:
                yield tag, dict(re.findall(r'([\w-]+)="([^"]*)"', tag))

    def test_card_srcset_points_to_real_smaller_copies(self):
        for page, minimum in self.PAGES.items():
            images = list(self.card_images(page))
            self.assertGreaterEqual(len(images), minimum, page)
            base = (ROOT / page).parent
            for tag, attrs in images:
                with self.subTest(page=page, src=attrs["src"]):
                    original = (base / attrs["src"]).resolve()
                    self.assertTrue(original.is_file(), attrs["src"])
                    self.assertEqual(original.parent, ROOT / "assets", "src must stay a full-size assets/ photo")
                    original_width, original_height = self.real_size(original)
                    self.assertEqual(attrs["width"], str(original_width), "width/height attributes describe src")
                    self.assertEqual(attrs["height"], str(original_height))
                    candidates = [part.strip().rsplit(" ", 1) for part in attrs["srcset"].split(",")]
                    self.assertEqual(len(candidates), 2, tag)
                    for url, descriptor in candidates:
                        self.assertRegex(descriptor, r"^\d+w$")
                        self.assertEqual(self.real_size((base / url).resolve())[0], int(descriptor[:-1]), url)
                    small, full = candidates
                    small_path = (base / small[0]).resolve()
                    self.assertEqual(small_path.parent, ROOT / "assets" / "card", "first candidate is the card copy")
                    self.assertEqual(small_path.name, original.name)
                    self.assertEqual(small[1], f"{self.CARD_WIDTH}w")
                    self.assertEqual((base / full[0]).resolve(), original, "last candidate is the unchanged src file")
                    self.assertGreaterEqual(original_height, original_width * 0.9, "landscape photos sit in square cover boxes; a small copy would be stretched")
                    small_width, small_height = self.real_size(small_path)
                    self.assertLessEqual(abs(small_height / small_width - original_height / original_width), 0.01)
                    self.assertLessEqual(small_path.stat().st_size, original.stat().st_size * 0.75, "copy must save 25% or more")
                    self.assertRegex(attrs.get("sizes", ""), r"\d+(px|vw)")
                    self.assertIn(attrs.get("loading"), ("lazy", "eager"))

    def test_hero_photos_over_the_card_width_use_the_small_copy(self):
        html_text = (ROOT / "index.html").read_text(encoding="utf-8")
        hero = re.search(r'<section\b[^>]*class="hero-banner\b[\s\S]*?</section>', html_text).group(0)
        images = re.findall(r"<img\b[^>]*>", hero)
        self.assertEqual(len(images), 18)
        with_copy = 0
        for tag in images:
            attrs = dict(re.findall(r'([\w-]+)="([^"]*)"', tag))
            if "srcset" not in attrs:
                continue
            with_copy += 1
            self.assertEqual(attrs["sizes"], "(max-width: 1440px) 30.5vw, 439px")
            self.assertTrue(attrs["srcset"].startswith(f"assets/card/{Path(attrs['src']).name} {self.CARD_WIDTH}w, "))
        self.assertEqual(with_copy, 11)
        first = images[0]
        self.assertIn('loading="eager"', first)
        self.assertIn('fetchpriority="high"', first)

    def test_card_popup_link_still_opens_the_full_photo(self):
        html_text = (ROOT / "index.html").read_text(encoding="utf-8")
        checked = 0
        for href, tag in re.findall(r'<a\b[^>]*\bhref="([^"]+)"[^>]*lightbox-trigger[^>]*>(<img\b[^>]*>)', html_text) + re.findall(r'<a\b[^>]*lightbox-trigger[^>]*\bhref="([^"]+)"[^>]*>(<img\b[^>]*>)', html_text):
            if "srcset=" in tag:
                checked += 1
                self.assertIn(f'src="{href}"', tag)
        self.assertGreater(checked, 40)
        lightbox = re.search(r'<img\b[^>]*id="lightbox-image"[^>]*>', html_text).group(0)
        self.assertNotIn("srcset", lightbox)

    def test_every_card_copy_is_used(self):
        used = set()
        for page in self.PAGES:
            used.update(Path(attrs["srcset"].split(" ")[0]).name for _, attrs in self.card_images(page))
        on_disk = {path.name for path in (ROOT / "assets" / "card").glob("*") if path.is_file()}
        self.assertEqual(on_disk, used)


class CorporateCollectionTests(unittest.TestCase):
    """/corporate-gifting/ shows the home page's corporate-resin-gifts cards, stamped there by tools/product_pages.py."""

    PAGE = ROOT / "corporate-gifting" / "index.html"

    @classmethod
    def setUpClass(cls):
        cls.tool = load_product_pages_tool()
        cls.home = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.cards = cls.tool.parse_cards(cls.home)
        cls.slugs = cls.tool.assign_slugs(cls.cards)
        cls.sizes = cls.tool.load_sizes(ROOT)
        cls.page = cls.PAGE.read_text(encoding="utf-8")

    def corporate(self):
        return [(card, slug) for card, slug in zip(self.cards, self.slugs) if card["section"] == "corporate-resin-gifts"]

    def test_corporate_page_collection_matches_home_section(self):
        expected = self.corporate()
        self.assertGreater(len(expected), 0)
        section = re.search(r'<section class="corporate-offering corporate-collection shell" id="collection" aria-labelledby="collection-title">(.*?)</section>', self.page, re.S)
        self.assertIsNotNone(section, "no #collection section on the corporate page")
        body = section.group(1)
        self.assertRegex(body, r'<h2 id="collection-title">[^<]+</h2>')
        self.assertNotIn("Reference images", body)
        tiles = re.findall(r'<div role="listitem"><a class="lightbox-more-item" href="([^"]+)"><img src="([^"]+)" alt="([^"]*)" width="300" height="300" loading="lazy" decoding="async"><span>([^<]*)</span><span>([^<]*)</span></a></div>', body)
        self.assertEqual([tile[0] for tile in tiles], ["../?product=%s#corporate-resin-gifts" % slug for _, slug in expected])
        for (card, slug), (href, src, alt, name, price) in zip(expected, tiles):
            with self.subTest(slug=slug):
                self.assertTrue((ROOT / "p" / slug / "index.html").is_file())
                self.assertEqual(src, "../assets/thumb/%s.jpg" % slug)
                self.assertTrue((ROOT / src[3:]).is_file())
                self.assertEqual(html.unescape(alt), card["alt"])
                if card["alt"].startswith("Illustrative preview:"):
                    self.assertTrue(html.unescape(alt).startswith("Illustrative preview:"))
                self.assertEqual(html.unescape(name), card["name"])
                sized = self.sizes[slug]["options"]
                self.assertEqual(html.unescape(price), "From " + (self.tool.rupees(min(o["price"] for o in sized)) if sized else card["price"]))
        for needed in ('id="enquire-title"', 'id="corporate-form"'):
            self.assertIn(needed, self.page)
        self.assertEqual(self.page.count('id="collection-title"'), 1)
        self.assertNotIn('id="offering-title"', self.page)
        self.assertNotIn("For your occasion", self.page)
        self.assertNotIn('id="process-title"', self.page)
        self.assertNotIn("Enquire. Review. Quote.", self.page)
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertNotIn("corporate-process", styles)
        self.assertNotIn("corporate-note", styles)

    def test_corporate_page_collection_is_not_stale(self):
        self.assertEqual(self.tool.corporate_collection(self.page, self.cards, self.slugs, sizes=self.sizes), self.page,
                         "corporate-gifting/index.html is stale: run python3 tools/product_pages.py")

    def test_corporate_collection_stops_on_bad_input(self):
        page = self.page
        start, end = "<!-- corporate-collection:start -->", "<!-- corporate-collection:end -->"
        self.assertEqual(page.count(start), 1)
        self.assertEqual(page.count(end), 1)
        for broken in (page.replace(start, ""), page.replace(end, "")):
            with self.assertRaises(SystemExit):
                self.tool.corporate_collection(broken, self.cards, self.slugs)
        other = [dict(card, section="elsewhere") for card in self.cards]
        with self.assertRaises(SystemExit):
            self.tool.corporate_collection(page, other, self.slugs)
        with mock.patch.object(self.tool, "thumb", side_effect=SystemExit("Missing thumbnail")):
            with self.assertRaises(SystemExit):
                self.tool.corporate_collection(page, self.cards, self.slugs)

    def test_corporate_collection_keeps_price_on_request_and_escapes_text(self):
        first = self.corporate()[0][0]
        cards = [dict(card, name='Pen & "Cup" <b>', alt='A <b> "preview"', price="Price on request" if card is first else card["price"])
                 for card in self.cards]
        stamped = self.tool.corporate_collection(self.page, cards, self.slugs)
        self.assertIn("<span>Price on request</span>", stamped)
        self.assertIn("<span>Pen &amp; &quot;Cup&quot; &lt;b&gt;</span>", stamped)
        self.assertNotIn("<b>", stamped.split("corporate-collection:start")[1].split("corporate-collection:end")[0])



class NavkarTitleTests(unittest.TestCase):
    """Buyers search "Navkar"; the Namokar frames carry both words, but keep their old address and Google product ID."""

    KEPT = {
        "Blue and white Namokar (Navkar) mantra frame": "blue-and-white-namokar-mantra-frame",
        "White and gold Namokar (Navkar) mantra frame": "white-and-gold-namokar-mantra-frame",
        "Pearl white Namokar (Navkar) mantra frame": "pearl-white-namokar-mantra-frame",
    }

    def test_namokar_frames_show_navkar_and_keep_their_slugs(self):
        tool = load_product_pages_tool()
        cards = tool.parse_cards((ROOT / "index.html").read_text(encoding="utf-8"))
        slugs = dict(zip([card["name"] for card in cards], tool.assign_slugs(cards)))
        for name, slug in self.KEPT.items():
            with self.subTest(name=name):
                self.assertEqual(slugs.get(name), slug)
                self.assertTrue((ROOT / "p" / slug / "index.html").is_file())
        self.assertFalse([name for name in slugs if "Namokar" in name and "Navkar" not in name])

    def test_google_feed_titles_say_navkar_with_the_same_ids(self):
        feed = (ROOT / "merchant-feed.tsv").read_text(encoding="utf-8").splitlines()
        rows = {line.split("\t")[0]: line.split("\t")[1] for line in feed[1:]}
        for name, slug in self.KEPT.items():
            with self.subTest(slug=slug):
                self.assertEqual(rows.get(slug), name)


class GoogleConsentTests(unittest.TestCase):
    """google.js (visit source, cookie banner, Google tag) is on every public page that counts visits and on every product page."""

    PRIVACY_LINE = "If you tap Accept on the cookie banner, Google sets cookies to measure which Google listings lead to order requests; only the request ID, product IDs, prices and quantities are sent, never your name, phone or address. Change it any time with Cookie settings."

    @classmethod
    def setUpClass(cls):
        cls.home = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.version = re.search(r'href="styles\.css\?v=(\d+)"', cls.home).group(1)
        cls.product_pages = sorted((ROOT / "p").glob("*/index.html"))
        cls.counted_pages = sorted(path for path in ROOT.rglob("index.html") if "p" not in path.relative_to(ROOT).parts[:1]
                                   and not {"node_modules", "tests", "work", "apps-script", ".git", ".codegraph"} & set(path.relative_to(ROOT).parts)
                                   and "analytics.js" in path.read_text(encoding="utf-8"))

    def test_the_page_lists_are_not_empty(self):
        self.assertGreaterEqual(len(self.counted_pages), 13)
        self.assertEqual(len(self.product_pages), 106)

    def test_every_analytics_page_loads_google_js_the_same_way_and_has_a_cookie_settings_button(self):
        for path in self.counted_pages:
            with self.subTest(page=str(path.relative_to(ROOT))):
                text = path.read_text(encoding="utf-8")
                analytics = re.search(r'<script class="analytics-script" src="((?:\.\./)?)analytics\.js\?v=(\d+)" defer></script>', text)
                self.assertIsNotNone(analytics)
                prefix = analytics.group(1)
                self.assertEqual(text.count("google.js"), 1)
                self.assertIn('<script class="google-script" src="%sgoogle.js?v=%s" defer></script>' % (prefix, self.version), text)
                self.assertEqual(analytics.group(2), self.version)
                footer = re.search(r"<footer\b.*?</footer>", text, re.S)
                self.assertIsNotNone(footer, "a footer holds the button")
                self.assertEqual(footer.group(0).count('<button type="button" class="cookie-settings" data-cookie-settings hidden>Cookie settings</button>'), 1)
                self.assertEqual(text.count("data-cookie-settings"), 1)

    def test_product_pages_use_the_popup_colours_with_a_blush_buy_box(self):
        tool = load_product_pages_tool()
        self.assertIn(".product-detail{", tool.PAGE_CSS)
        self.assertRegex(tool.PAGE_CSS, r"\.product-detail\{[^}]*background:#fff6e9", "ivory panel like the popup")
        self.assertRegex(tool.PAGE_CSS, r"\.product-detail \.buy-box\{[^}]*background:#fde7f0[^}]*\}", "blush box like the popup")
        for path in self.product_pages:
            with self.subTest(page=path.parent.name):
                text = path.read_text(encoding="utf-8")
                box = re.search(r'<div class="buy-box">(.*?)</div>', text, re.S)
                self.assertIsNotNone(box)
                inside = box.group(1)
                order = '<a class="order"' if '<a class="order"' in inside else '<button class="order"'
                for part in ("<h1>", '<p class="price">', order, '<p class="delivery-note">'):
                    self.assertIn(part, inside)
                self.assertLess(inside.index(order), inside.index('<p class="delivery-note">'))

    def test_every_product_page_loads_google_js_and_has_the_button_in_the_site_footer(self):
        for path in self.product_pages:
            with self.subTest(page=path.parent.name):
                text = path.read_text(encoding="utf-8")
                self.assertEqual(text.count('<script src="/google.js?v=%s" defer></script>' % self.version), 1)
                self.assertEqual(text.count('<link rel="stylesheet" href="/styles.css?v=%s">' % self.version), 1)
                self.assertEqual(text.count('<header class="site-header">'), 1)
                button = '<p class="footer-credit">© Saloni Resin Art Studio <button type="button" class="cookie-settings" data-cookie-settings hidden>Cookie settings</button></p>'
                self.assertEqual(text.count(button), 1)
                self.assertEqual(text.count("data-cookie-settings"), 1)
                self.assertGreater(text.index(button), text.index("</main>"))
                self.assertNotIn('href="../', text, "pages sit two folders deep, so site links are absolute")
                self.assertIn("/google.js", text)

    def test_topic_pages_use_the_footer_button_and_the_shared_version(self):
        tool = load_product_pages_tool()
        self.assertIn("../google.js?v={version}", tool.TOPIC_PAGE)
        self.assertIn("data-cookie-settings", tool.TOPIC_FOOTER)

    def test_the_cookie_settings_button_is_styled_by_google_js_only(self):
        source = (ROOT / "google.js").read_text(encoding="utf-8")
        self.assertIn(".cookie-settings", source)

    def test_feed_links_carry_the_source_but_canonical_urls_and_the_sitemap_stay_clean(self):
        rows = (ROOT / "merchant-feed.tsv").read_text(encoding="utf-8").splitlines()[1:]
        self.assertGreater(len(rows), 0)
        for row in rows:
            fields = row.split("\t")
            self.assertRegex(fields[3], r"^https://saloniresinart\.com/p/[a-z0-9-]+/\?(?:size=[a-z0-9-]+&)?source=google-shopping$")
        self.assertNotIn("source=", (ROOT / "sitemap.xml").read_text(encoding="utf-8"))
        for path in self.product_pages:
            self.assertNotIn("google-shopping", path.read_text(encoding="utf-8"), path.parent.name)

    def test_privacy_text_names_the_cookie_choice_in_both_privacy_blocks_and_the_readme(self):
        self.assertEqual(self.home.count(self.PRIVACY_LINE), 2)
        for block in re.findall(r'<details class="privacy-details" id="(?:order-)?privacy-details">.*?</details>', self.home, re.S):
            self.assertIn(self.PRIVACY_LINE, block)
        self.assertIn(self.PRIVACY_LINE, (ROOT / "README.md").read_text(encoding="utf-8"))

class ProductSizeTests(unittest.TestCase):
    """data/product-sizes.tsv is the one place for prices and sizes: tools/product_pages.py copies it to the cards, pages and feed."""

    SITE = "https://saloniresinart.com"

    @classmethod
    def setUpClass(cls):
        cls.tool = load_product_pages_tool()
        cls.home = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        cls.cards = cls.tool.parse_cards(cls.home)
        cls.slugs = cls.tool.assign_slugs(cls.cards)
        cls.sizes = cls.tool.load_sizes(ROOT)
        cls.tsv = (ROOT / "data" / "product-sizes.tsv").read_text(encoding="utf-8")
        cls.sized = [slug for slug in cls.slugs if cls.sizes[slug]["options"]]

    def load_text(self, text):
        import tempfile
        with tempfile.TemporaryDirectory() as scratch:
            (Path(scratch) / "data").mkdir()
            (Path(scratch) / "data" / "product-sizes.tsv").write_text(text, encoding="utf-8")
            return self.tool.load_sizes(Path(scratch))

    def change_row(self, slug, **columns):
        """The shipped TSV with some cells of one product's row replaced."""
        header = self.tool.SIZE_COLUMNS
        lines = self.tsv.splitlines()
        for number, line in enumerate(lines):
            cells = line.split("\t")
            cells += [""] * (len(header) - len(cells))
            if cells[0] == slug:
                for name, value in columns.items():
                    cells[header.index(name)] = value
                lines[number] = "\t".join(cells)
                return "\n".join(lines) + "\n"
        raise AssertionError(slug)

    def card_article(self, page, slug):
        cards = self.tool.parse_cards(page)
        slugs = self.tool.assign_slugs(cards)
        card = cards[slugs.index(slug)]
        return page[card["start"]:card["end"]]

    def test_the_shipped_tsv_has_one_row_per_card_and_45_sized_products(self):
        self.assertEqual(sorted(self.sizes), sorted(self.slugs))
        self.assertEqual(len(self.sized), 45)
        for slug, entry in self.sizes.items():
            with self.subTest(slug=slug):
                self.assertIsInstance(entry["price"], int)
                if not entry["options"]:
                    continue
                self.assertGreaterEqual(len(entry["options"]), 2)
                codes = [option["code"] for option in entry["options"]]
                self.assertEqual(len(codes), len(set(codes)))
                for option in entry["options"]:
                    self.assertEqual(option["code"], self.tool.slugify(option["label"]))
                default = [option for option in entry["options"] if option["code"] == entry["default"]][0]
                self.assertEqual(default["price"], entry["price"])
                first_match = [option["code"] for option in entry["options"] if option["price"] == entry["price"]][0]
                self.assertEqual(entry["default"], first_match, "the default is the first size at today's price")
        self.assertEqual(self.sizes["mr-and-mrs-name-plate"]["options"][0], {"code": "6-10-in", "label": "6 × 10 in", "price": 1249})
        self.assertEqual(self.sizes["the-first-rose-still-with-me"]["default"], "small-wrist", "equal prices: the first size")

    def test_a_mistake_in_the_tsv_stops_the_script_and_names_the_row(self):
        header = "\t".join(self.tool.SIZE_COLUMNS)
        good = "a-slug\t999\t6 in\tyes\t6 in\t999\t8 in\t1499\t\t\n"
        self.assertEqual(self.load_text(header + "\n" + good)["a-slug"]["default"], "6-in")
        bad = {
            "price not a number": "a-slug\t9.5\t6 in\tyes\t6 in\t999\t8 in\t1499\t\t\n",
            "price zero": "a-slug\t0\t6 in\tyes\t6 in\t0\t8 in\t1499\t\t\n",
            "option price not a number": "a-slug\t999\t6 in\tyes\t6 in\t999\t8 in\tabc\t\t\n",
            "option price negative": "a-slug\t999\t6 in\tyes\t6 in\t999\t8 in\t-5\t\t\n",
            "size without a price": "a-slug\t999\t6 in\tyes\t6 in\t999\t8 in\t\t\t\n",
            "price without a size": "a-slug\t999\t6 in\tyes\t6 in\t999\t\t1499\t\t\n",
            "one option only": "a-slug\t999\t6 in\tyes\t6 in\t999\t\t\t\t\n",
            "no option at today's price": "a-slug\t999\t6 in\tyes\t6 in\t949\t8 in\t1499\t\t\n",
            "duplicate size": "a-slug\t999\t6 in\tyes\t6 in\t999\t6 in\t1499\t\t\n",
            "duplicate code from different text": "a-slug\t999\t6 in\tyes\t6 in\t999\t6  in\t1499\t\t\n",
            "slug missing": "\t999\t6 in\tyes\t6 in\t999\t8 in\t1499\t\t\n",
            "choice is neither yes nor no": "a-slug\t999\t6 in\tmaybe\t6 in\t999\t8 in\t1499\t\t\n",
            "slug twice": good + good,
        }
        for label, row in bad.items():
            with self.subTest(label):
                with self.assertRaises(SystemExit) as caught:
                    self.load_text(header + "\n" + row)
                self.assertIn("product-sizes.tsv", str(caught.exception))
        with self.assertRaises(SystemExit):
            self.load_text("product_id\ttodays_price\n" + good)
        with self.assertRaises(SystemExit):
            self.tool.load_sizes(Path("/nonexistent-root"))
        # A one-size row needs only today's price.
        self.assertEqual(self.load_text(header + "\nb\t399\t1 in\tno\t1 in\t399\t\t\t\t\n")["b"]["options"], [])

    def test_a_row_for_a_product_that_is_not_on_the_home_page_stops_the_build(self):
        sizes = dict(self.sizes, **{"no-such-product": {"price": 100, "choice": False, "default": "", "options": []}})
        with self.assertRaises(SystemExit) as caught:
            self.tool.build(self.home, self.sitemap, sizes=sizes)
        self.assertIn("no-such-product", str(caught.exception))

    def test_the_cards_and_pages_in_the_repository_are_in_step_with_the_tsv(self):
        stamped, pages, _ = self.tool.build(self.home, self.sitemap)
        self.assertEqual(stamped, self.home, "run python3 tools/product_pages.py")
        for slug in self.slugs:
            self.assertEqual((ROOT / "p" / slug / "index.html").read_text(encoding="utf-8"), pages["p/%s/index.html" % slug], slug)

    def test_every_card_shows_todays_price_from_the_tsv_and_no_struck_price(self):
        for slug, card in zip(self.slugs, self.cards):
            entry = self.sizes[slug]
            article = self.home[card["start"]:card["end"]]
            self.assertEqual(card["price"], self.tool.rupees(entry["price"]), slug)
            self.assertNotRegex(article, r"<s>|product-regular-price|% off", slug)
        self.assertEqual(self.tool.rupees(999), "₹999")
        self.assertEqual(self.tool.rupees(1499), "₹1,499")
        self.assertEqual(self.tool.rupees(123456), "₹1,23,456")

    def test_45_cards_carry_data_sizes_that_match_the_tsv_and_61_do_not(self):
        import urllib.parse
        with_sizes = 0
        for slug, card in zip(self.slugs, self.cards):
            article = self.home[card["start"]:card["end"]]
            attribute = re.search(r' data-sizes="([^"]*)"', article)
            entry = self.sizes[slug]
            if not entry["options"]:
                self.assertIsNone(attribute, slug)
                self.assertNotIn("product-size-count", article, slug)
                continue
            with_sizes += 1
            data = json.loads(html.unescape(attribute.group(1)))
            self.assertEqual(data["default"], entry["default"], slug)
            self.assertEqual(data["options"], [{"code": o["code"], "label": o["label"], "price": self.tool.rupees(o["price"])} for o in entry["options"]], slug)
            self.assertIn('<dd class="product-size-count">%d sizes</dd>' % len(entry["options"]), article, slug)
            first_dd = re.search(r"<dt>Price</dt><dd>([^<]*)</dd>", article).group(1)
            self.assertEqual(first_dd, self.tool.rupees(entry["price"]), "the first dd stays the price")
            default_label = [o["label"] for o in entry["options"] if o["code"] == entry["default"]][0]
            sizes_row = re.findall(r"<div><dt>Size</dt><dd>([^<]*)</dd></div>", article)
            self.assertIn(sizes_row, ([], [default_label]), slug + ": the card's size text is the default size")
        self.assertEqual(with_sizes, 45)
        self.assertEqual(len(self.slugs) - with_sizes, 61)

    def test_changing_a_price_in_the_tsv_changes_card_page_json_ld_and_feed(self):
        slug = "om-asiausa-mantra-plaque"
        sizes = {key: dict(value, options=[dict(o) for o in value["options"]]) for key, value in self.sizes.items()}
        sizes[slug]["price"] = 1899
        for option in sizes[slug]["options"]:
            if option["code"] == "8-12-in":
                option["price"] = 1899
            if option["code"] == "10-15-in":
                option["price"] = 2599
        stamped, pages, _ = self.tool.build(self.home, self.sitemap, sizes=sizes)
        article = self.card_article(stamped, slug)
        self.assertIn("<dt>Price</dt><dd>₹1,899</dd>", article)
        self.assertNotIn("<s>", article)
        self.assertEqual(re.search(r' data-sizes="([^"]*)"', article).group(1).count("₹1,899"), 1)
        self.assertIn("₹2,599", html.unescape(re.search(r' data-sizes="([^"]*)"', article).group(1)))
        page = pages["p/%s/index.html" % slug]
        self.assertIn('<p class="price">₹1,899</p>', page)
        self.assertIn('data-price="₹2,599"', page)
        self.assertIn('"price": "1899"', page)
        self.assertIn('"price": "2599"', page)
        cards = self.tool.parse_cards(stamped)
        feed = self.tool.merchant_feed(cards, self.tool.assign_slugs(cards), sizes)
        rows = {line.split("\t")[0]: line.split("\t") for line in feed.splitlines()[1:]}
        self.assertEqual(rows[slug][6], "1899 INR")
        self.assertEqual(rows[slug + "--10-15-in"][6], "2599 INR")

    def feed_rows(self):
        text = (ROOT / "merchant-feed.tsv").read_text(encoding="utf-8")
        lines = text.splitlines()
        header = lines[0].split("\t")
        return header, [dict(zip(header, line.split("\t"))) for line in lines[1:]]

    def test_the_merchant_feed_has_a_row_per_size_for_products_already_in_it(self):
        header, rows = self.feed_rows()
        self.assertEqual(header[-3:], ["item_group_id", "item_group_title", "size"])
        ids = [row["id"] for row in rows]
        self.assertEqual(len(ids), len(set(ids)), "ids are unique")
        self.assertTrue(all(len(value) <= 50 for value in ids))
        by_slug = dict(zip(self.slugs, self.cards))
        trial = load_product_pages_tool().AI_FEED_TRIAL
        in_feed = [slug for slug in self.slugs if not by_slug[slug]["alt"].startswith("Illustrative preview:") or slug in trial]
        sized_in_feed = [slug for slug in in_feed if self.sizes[slug]["options"]]
        self.assertEqual(len(sized_in_feed), 23)
        self.assertEqual(len(in_feed), 52, "no product joined or left the feed")
        expected = sum(len(self.sizes[slug]["options"]) if self.sizes[slug]["options"] else 1 for slug in in_feed)
        self.assertEqual(len(rows), expected)
        self.assertEqual(len(rows) - len(in_feed), sum(len(self.sizes[slug]["options"]) - 1 for slug in sized_in_feed))
        for slug in in_feed:
            entry = self.sizes[slug]
            mine = [row for row in rows if row["item_group_id"] == slug] if entry["options"] else [row for row in rows if row["id"] == slug]
            self.assertEqual(len(mine), len(entry["options"]) or 1, slug)
            if not entry["options"]:
                self.assertEqual((mine[0]["item_group_id"], mine[0]["item_group_title"], mine[0]["size"]), ("", "", ""), slug)
                self.assertEqual(mine[0]["link"], "%s/p/%s/?source=google-shopping" % (self.SITE, slug))
                continue
            for option, row in zip(entry["options"], mine):
                default = option["code"] == entry["default"]
                self.assertEqual(row["id"], slug if default else "%s--%s" % (slug, option["code"]), slug)
                self.assertEqual(row["link"], "%s/p/%s/?source=google-shopping" % (self.SITE, slug) if default
                                 else "%s/p/%s/?size=%s&source=google-shopping" % (self.SITE, slug, option["code"]), slug)
                self.assertEqual(row["price"], "%d INR" % option["price"], slug)
                self.assertEqual((row["item_group_id"], row["item_group_title"], row["size"]), (slug, by_slug[slug]["name"], option["label"]), slug)
                self.assertIn("Size: %s." % option["label"], row["description"], slug)
                self.assertEqual(row["title"], by_slug[slug]["name"] if default else "%s – %s" % (by_slug[slug]["name"], option["label"]), slug)

    def test_a_feed_id_longer_than_50_characters_stops_the_build(self):
        sizes = {key: dict(value) for key, value in self.sizes.items()}
        slug = "blue-and-white-namokar-mantra-frame"
        sizes[slug] = dict(sizes[slug], options=[dict(o, code=o["code"] + "-" + "x" * 20) for o in sizes[slug]["options"]],
                           default=sizes[slug]["default"] + "-" + "x" * 20)
        with self.assertRaises(SystemExit) as caught:
            self.tool.build(self.home, self.sitemap, sizes=sizes)
        self.assertIn(slug, str(caught.exception))

    def page_text(self, slug):
        return (ROOT / "p" / slug / "index.html").read_text(encoding="utf-8")

    def test_a_sized_product_page_has_a_size_form_that_keeps_the_section_hash(self):
        for slug, card in zip(self.slugs, self.cards):
            text = self.page_text(slug)
            entry = self.sizes[slug]
            if not entry["options"]:
                self.assertIn('<a class="order" href="/?product=%s&amp;add=1#%s">Add to cart</a>' % (slug, card["section"]), text, slug)
                self.assertNotIn("<form", text, slug)
                self.assertNotIn('type="radio"', text, slug)
                continue
            form = re.search(r'<form class="size-form" action="([^"]+)" method="get">(.*?)</form>', text, re.S)
            self.assertIsNotNone(form, slug)
            self.assertEqual(form.group(1), "/#" + card["section"], slug)
            body = form.group(2)
            self.assertIn('<input type="hidden" name="product" value="%s">' % slug, body)
            self.assertIn('<input type="hidden" name="add" value="1">', body)
            self.assertIn("<fieldset", body)
            self.assertIn("<legend>Size</legend>", body)
            radios = re.findall(r'<input type="radio" name="size" value="([^"]+)" data-price="([^"]+)"( checked)?>', body)
            self.assertEqual([(code, price) for code, price, _ in radios], [(o["code"], self.tool.rupees(o["price"])) for o in entry["options"]], slug)
            self.assertEqual([code for code, _, checked in radios if checked], [entry["default"]], slug)
            self.assertIn('<button class="order" type="submit">Add to cart</button>', body)
            self.assertNotIn('<p class="size">', text, slug)
            self.assertNotIn("<div", body, "no div inside the buy box: pages keep one flat box")
            shown = re.search(r'<p class="price">([^<]*)</p>', text).group(1)
            self.assertEqual(shown, card["price"], slug)
            self.assertEqual(len(re.findall(r"<script>", text)), 1, slug)
            self.assertNotRegex(text, r"location\.(?:replace|assign)|location\.href\s*=|innerHTML|eval\(", slug)

    def test_a_sized_page_script_preselects_from_the_address_and_keeps_the_price_pill_in_step(self):
        text = self.page_text("mr-and-mrs-name-plate")
        script = re.search(r"<script>(.*?)</script>", text, re.S).group(1)
        self.assertIn("size=", script)
        self.assertIn("pageshow", script)
        self.assertIn("change", script)
        self.assertIn("data-price", script)
        self.assertNotRegex(script, r"\b(?:let|const)\b|=>|`", "ES5 only")

    def test_a_sized_product_page_states_a_product_group_with_one_variant_per_size(self):
        for slug in self.sized:
            text = self.page_text(slug)
            blocks = [json.loads(block) for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', text, re.S)]
            groups = [block for block in blocks if block.get("@type") == "ProductGroup"]
            self.assertEqual(len(groups), 1, slug)
            self.assertEqual([block for block in blocks if block.get("@type") == "Product"], [], slug)
            group = groups[0]
            entry = self.sizes[slug]
            self.assertEqual(group["productGroupID"], slug)
            self.assertEqual(group["variesBy"], ["https://schema.org/size"])
            self.assertEqual(len(group["hasVariant"]), len(entry["options"]))
            for option, variant in zip(entry["options"], group["hasVariant"]):
                self.assertEqual(variant["@type"], "Product")
                self.assertEqual(variant["size"], option["label"])
                self.assertTrue(variant["name"].endswith(" – " + option["label"]), slug)
                self.assertEqual(variant["sku"], slug if option["code"] == entry["default"] else "%s--%s" % (slug, option["code"]))
                offer = variant["offers"]
                self.assertEqual((offer["@type"], offer["price"], offer["priceCurrency"], offer["availability"]),
                                 ("Offer", str(option["price"]), "INR", "https://schema.org/InStock"))
                self.assertEqual(offer["url"], "%s/p/%s/?size=%s" % (self.SITE, slug, option["code"]))

    def test_the_corporate_page_says_from_the_lowest_size_price_for_a_sized_product(self):
        page = (ROOT / "corporate-gifting" / "index.html").read_text(encoding="utf-8")
        tiles = dict(re.findall(r'href="\.\./\?product=([^#"]+)#corporate-resin-gifts">.*?<span>([^<]*)</span></a>', page))
        sized_tiles = [slug for slug in tiles if self.sizes[slug]["options"]]
        self.assertIn("branded-coaster-set", sized_tiles)
        for slug in sized_tiles:
            self.assertEqual(html.unescape(tiles[slug]), "From " + self.tool.rupees(min(o["price"] for o in self.sizes[slug]["options"])), slug)
        self.assertEqual(html.unescape(tiles["branded-coaster-set"]), "From ₹399")


class OnlinePaymentSiteTests(unittest.TestCase):
    """Razorpay checkout, site side: prices.json for the server, payments off by default, and the refund wording."""

    @classmethod
    def setUpClass(cls):
        cls.tool = load_product_pages_tool()
        cls.home = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.cards = cls.tool.parse_cards(cls.home)
        cls.slugs = cls.tool.assign_slugs(cls.cards)
        cls.sizes = cls.tool.load_sizes(ROOT)
        cls.prices = json.loads((ROOT / "prices.json").read_text(encoding="utf-8"))

    def test_prices_json_is_the_generated_price_table_for_the_server(self):
        text = (ROOT / "prices.json").read_text(encoding="utf-8")
        self.assertEqual(text, self.tool.prices_json(self.cards, self.slugs, self.sizes), "prices.json is stale: run python3 tools/product_pages.py")

    def test_prices_json_is_keyed_by_the_cart_source_id_with_whole_rupees(self):
        for card, slug in zip(self.cards, self.slugs):
            entry = self.sizes.get(slug)
            key = "catalogue:" + card["file"]
            if not entry:
                self.assertNotIn(key, self.prices, slug)
                continue
            with self.subTest(slug=slug):
                item = self.prices[key]
                self.assertEqual(item["name"], card["name"])
                self.assertIs(type(item["price"]), int)
                self.assertEqual(item["price"], entry["price"])
                if entry["options"]:
                    self.assertEqual(item["sizes"], {option["code"]: option["price"] for option in entry["options"]})
                    self.assertEqual(item["sizes"][entry["default"]], item["price"])
                    self.assertTrue(all(type(price) is int for price in item["sizes"].values()))
                else:
                    self.assertFalse(item.get("sizes"))

    def test_every_card_with_one_rupee_price_can_be_priced_by_the_server(self):
        for card, slug in zip(self.cards, self.slugs):
            if re.fullmatch(r"\u20b9[\d,]+", card["price"]):
                with self.subTest(slug=slug):
                    self.assertIn("catalogue:" + card["file"], self.prices)
                    self.assertEqual(self.prices["catalogue:" + card["file"]]["price"], int(card["price"][1:].replace(",", "")))

    def test_the_site_ships_with_payments_live_and_the_captcha_key_on_the_order_form(self):
        embed = re.search(r'<div class="order-panel order-form-panel" id="order-form-embed"[^>]*>', self.home).group(0)
        self.assertIn('data-payments="live"', embed)
        rating_key = re.search(r'id="lightbox-rate" data-captcha-site-key="([^"]+)"', self.home).group(1)
        self.assertIn('data-captcha-site-key="%s"' % rating_key, embed)

    def test_the_checkout_summary_shows_the_refund_rule_with_a_link_that_keeps_the_form_open(self):
        summary = re.search(r'<section class="checkout-summary" id="checkout-summary".*?</section>', self.home, re.S).group(0)
        self.assertIn("hidden", summary.split(">", 1)[0])
        self.assertIn("Full refund if you cancel within 24 hours of paying, before work starts.", summary)
        self.assertIn("not refundable except for damage in transit", summary)
        self.assertRegex(summary, r'<a href="shipping-and-returns/#refunds" target="_blank" rel="noopener">')
        for part in ("checkout-lines", "checkout-subtotal", "checkout-shipping", "checkout-total", "checkout-test-note"):
            self.assertIn('id="%s"' % part, summary)
        self.assertRegex(summary, r'<dd id="checkout-total" aria-live="polite">')
        self.assertNotIn("No real money", summary, "the test note says so only after the server's key is a test key")
        self.assertIn('id="reference-image-fieldset"', self.home)

    def test_the_shipping_page_states_online_payment_and_the_24_hour_refund_rule(self):
        page = (ROOT / "shipping-and-returns" / "index.html").read_text(encoding="utf-8")
        refund = re.search(r'<li id="refunds"><strong>Refund for online payments</strong><span>(.*?)</span></li>', page, re.S).group(1)
        for part in ("full refund", "within 24 hours of paying", "before Saloni starts making", "except for damage in transit"):
            self.assertIn(part, refund)
        paying = re.search(r"<strong>Pay online</strong><span>(.*?)</span>", page, re.S).group(1)
        for part in ("Razorpay", "A paid order is confirmed at once", "\u20b90 for pickup", "\u20b9100", "\u20b9150", "30 to 34", "once per order"):
            self.assertIn(part, paying)
        self.assertLess(page.index("<strong>Pickup</strong>"), page.index("<strong>Pay online</strong>"))
        self.assertLess(page.index('id="refunds"'), page.index("<strong>Transit damage</strong>"))
        self.assertNotIn("Before you pay the advance", page)

    def test_the_go_live_checklist_holds_the_exact_payment_and_refund_copy_for_the_shipping_page(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        section = readme.split("## Go-live checklist (online payments, site side)", 1)[1].split("\n## ", 1)[0]
        self.assertIn('data-payments="live"', section)
        refund = re.search(r'<li id="refunds"><strong>Refund for online payments</strong><span>(.*?)</span></li>', section, re.S).group(1)
        self.assertIn("full refund", refund)
        self.assertIn("within 24 hours of paying", refund)
        self.assertIn("before Saloni starts making", refund)
        self.assertIn("except for damage in transit", refund)
        paying = re.search(r"<strong>Pay online</strong><span>(.*?)</span>", section, re.S).group(1)
        for part in ("Razorpay", "A paid order is confirmed at once", "\u20b90 for pickup", "\u20b9100", "\u20b9150", "30 to 34", "once per order"):
            self.assertIn(part, paying)
        self.assertIn("For a paid order, Cancel order shows for 24 hours after you pay.", section)

    def test_both_privacy_texts_say_razorpay_processes_payments(self):
        for text in (re.search(r'<details class="privacy-details" id="privacy-details">.*?</details>', self.home, re.S).group(0),
                     re.search(r'<details class="privacy-details" id="order-privacy-details">.*?</details>', self.home, re.S).group(0)):
            self.assertIn("When you pay online, Razorpay processes the payment", text)
            self.assertIn("12 months", text)
            self.assertIn("never sees", text)


if __name__ == "__main__":
    unittest.main()
