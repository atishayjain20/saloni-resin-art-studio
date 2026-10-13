from html.parser import HTMLParser
from pathlib import Path
import re
import unittest


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


class StaticSiteContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html_path = ROOT / "index.html"
        cls.html = cls.html_path.read_text(encoding="utf-8") if cls.html_path.exists() else ""

    def test_page_has_required_sections_and_accessibility_hooks(self):
        required_ids = [
            "main-content", "hero", "offerings", "resin-art", "hamper-rail",
            "process", "festive-offers", "testimonials", "order", "gallery", "footer",
        ]
        for section_id in required_ids:
            with self.subTest(section_id=section_id):
                self.assertRegex(self.html, rf'id=["\']{section_id}["\']')
        self.assertIn('href="#main-content"', self.html)
        self.assertIn('aria-label="Previous', self.html)
        self.assertIn('aria-label="Next', self.html)
        self.assertIn('class="site-script"', self.html)

    def test_public_metadata_uses_settled_github_pages_url(self):
        public_url = "https://atishayjain20.github.io/saloni-resin-art-studio/"
        image_url = public_url + "assets/hero-floral-bouquet.jpg"
        self.assertIn(f'<link rel="canonical" href="{public_url}">', self.html)
        self.assertIn(f'<meta property="og:url" content="{public_url}">', self.html)
        self.assertIn(f'<meta property="og:image" content="{image_url}">', self.html)

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

    def test_each_carousel_owner_contains_its_track_and_controls(self):
        parser = MarkupTreeParser()
        parser.feed(self.html)
        owners = []
        for root in parser.roots:
            owners.extend(find_nodes(root, "data-carousel"))
        self.assertEqual(len(owners), 4)
        for owner in owners:
            with self.subTest(carousel=owner["attrs"].get("data-carousel")):
                self.assertEqual(len(find_nodes(owner, "data-carousel-track")), 1)
                self.assertEqual(len(find_nodes(owner, "data-carousel-prev")), 1)
                self.assertEqual(len(find_nodes(owner, "data-carousel-next")), 1)

    def test_studio_art_carousel_contract(self):
        parser = MarkupTreeParser()
        parser.feed(self.html)
        owners = []
        for root in parser.roots:
            owners.extend(find_nodes(root, "data-carousel"))
        studio_owners = [owner for owner in owners if owner["attrs"].get("data-carousel") == "studio-art"]
        self.assertEqual(len(studio_owners), 1)
        owner = studio_owners[0]
        tracks = find_nodes(owner, "data-carousel-track")
        self.assertEqual(len(tracks), 1)
        self.assertEqual(tracks[0]["attrs"].get("id"), "studio-art-track")
        self.assertEqual(tracks[0]["attrs"].get("tabindex"), "0")
        self.assertEqual(len(find_nodes(owner, "data-carousel-prev")), 1)
        self.assertEqual(len(find_nodes(owner, "data-carousel-next")), 1)

        section = re.search(r'<section\b[^>]*id=["\']studio-art["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        section_html = section.group(0)
        self.assertIn("Art from the studio", section_html)
        self.assertIn("Swipe or use the arrows to explore all 10 pieces.", section_html)
        self.assertEqual(self.html.count('id="studio-art"'), 1)
        self.assertEqual(self.html.count('id="studio-art-track"'), 1)
        self.assertEqual(section_html.count('aria-controls="studio-art-track"'), 2)

        asset_names = (
            "studio-blue-mantra-frame.jpeg",
            "studio-lilac-symbol-rakhi.jpeg",
            "studio-little-brother-rakhi.jpeg",
            "studio-white-mantra-frame.jpeg",
            "studio-lilac-scalloped-tray.jpeg",
            "studio-personalized-photo-clock.jpeg",
            "studio-floral-square-keepsake.jpeg",
            "studio-floral-hexagon-keepsake.jpeg",
            "studio-floral-handled-tray.jpeg",
            "studio-rose-hexagon-keepsake.jpeg",
        )
        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*work-card[^"\']*["\'][\s\S]*?</article>', section_html)
        self.assertEqual(len(cards), 10)
        self.assertEqual(section_html.count("<figcaption>"), 10)
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
                self.assertIn('decoding="async"', image_tag)
        for card in cards:
            with self.subTest(card=card[:80]):
                self.assertNotIn("<button", card)

        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        studio_rule = re.search(r"\.studio-art-section \.work-card img\s*\{([^}]*)\}", css)
        self.assertIsNotNone(studio_rule)
        self.assertIn("aspect-ratio: 4 / 5", studio_rule.group(1))
        self.assertIn("object-fit: contain", studio_rule.group(1))
        self.assertIn("object-position: center", studio_rule.group(1))
        self.assertIn("background: var(--paper)", studio_rule.group(1))

    def test_testimonial_carousel_contract(self):
        parser = MarkupTreeParser()
        parser.feed(self.html)
        owners = []
        for root in parser.roots:
            owners.extend(find_nodes(root, "data-carousel"))
        testimonials = [owner for owner in owners if owner["attrs"].get("data-carousel") == "testimonials"]
        self.assertEqual(len(testimonials), 1)
        owner = testimonials[0]
        self.assertEqual(len(find_nodes(owner, "data-carousel-track")), 1)
        self.assertEqual(len(find_nodes(owner, "data-carousel-prev")), 1)
        self.assertEqual(len(find_nodes(owner, "data-carousel-next")), 1)

        section = re.search(r'<section\b[^>]*id=["\']testimonials["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        section_html = section.group(0)
        for name in ("Gaurav Jain", "Atishay Jain", "Aarti Suthar", "Bharat Sharma", "Puchki"):
            with self.subTest(name=name):
                self.assertIn(name, section_html)
        self.assertEqual(section_html.count('data-testimonial-card'), 5)
        self.assertIn("Sample testimonials for layout preview", section_html)
        self.assertNotIn('class="sample-label">Sample testimonial</span>', section_html)
        self.assertIn('aria-label="Testimonials carousel controls"', section_html)
        self.assertIn('aria-label="Testimonials"', section_html)
        self.assertNotRegex(section_html, re.compile(r'aria-label="[^"]*sample[^"]*"', re.I))
        self.assertNotRegex(section_html, re.compile(r'class="sr-only">[^<]*sample', re.I))
        ratings = re.findall(r'class="sr-only">Rating:\s*([45]) out of 5', section_html)
        self.assertEqual(len(ratings), 5)
        cards = re.findall(r'<article\b[^>]*data-testimonial-card[\s\S]*?</article>', section_html)
        self.assertEqual(len(cards), 5)
        for card in cards:
            card_text = re.sub(r'<[^>]+>', ' ', card)
            with self.subTest(card=card_text.strip()[:40]):
                self.assertNotRegex(card_text, re.compile(r'\bsample\b', re.I))

    def test_festive_offers_area_has_diwali_navratri_and_contact_paths(self):
        match = re.search(r'<section\b[^>]*id=["\']festive-offers["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(match)
        section = match.group(0)
        self.assertIn("Diwali", section)
        self.assertIn("Navratri", section)
        self.assertRegex(section, r"special discounts")
        self.assertRegex(section, r"Contact Saloni for offer details")
        self.assertIn('href="tel:8209238541"', section)
        self.assertIn('href="https://www.instagram.com/saloniresin_art_studio/"', section)

    def test_carousel_enhancement_is_progressive(self):
        self.assertGreaterEqual(self.html.count('data-carousel'), 2)
        self.assertIn('data-carousel-prev', self.html)
        self.assertIn('data-carousel-next', self.html)
        self.assertIn('scroll-snap-type', (ROOT / "styles.css").read_text(encoding="utf-8") if (ROOT / "styles.css").exists() else "")
        self.assertIn('DOMContentLoaded', (ROOT / "script.js").read_text(encoding="utf-8") if (ROOT / "script.js").exists() else "")


if __name__ == "__main__":
    unittest.main()
