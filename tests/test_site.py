from html.parser import HTMLParser
import math
from pathlib import Path
import json
import re
import unittest
import xml.etree.ElementTree as ET


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

    def test_seo_metadata_and_studio_namokar_label(self):
        title = "Resin Art &amp; Customized Hampers | Saloni Resin Art Studio"
        description = "Explore resin art, personalized gifts and customized hampers from Saloni Resin Art Studio. Contact Saloni to discuss colours, themes and your occasion."
        self.assertEqual(self.html.count("<title>"), 1)
        self.assertIn(f"<title>{title}</title>", self.html)
        self.assertEqual(self.html.count('<meta name="description"'), 1)
        self.assertIn(f'<meta name="description" content="{description}">', self.html)
        self.assertIn(f'<meta property="og:title" content="{title}">', self.html)
        self.assertIn(f'<meta property="og:description" content="{description}">', self.html)
        self.assertEqual(self.html.count('rel="canonical"'), 1)
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

    def test_organization_jsonld_and_sitemap_match_canonical(self):
        canonical = "https://atishayjain20.github.io/saloni-resin-art-studio/"
        script = re.search(r'<script\b[^>]*type=["\']application/ld\+json["\']>([\s\S]*?)</script>', self.html)
        self.assertIsNotNone(script)
        organization = json.loads(script.group(1))
        self.assertEqual(set(organization), {"@context", "@type", "name", "url", "sameAs", "description"})
        self.assertEqual(organization["@context"], "https://schema.org")
        self.assertEqual(organization["@type"], "Organization")
        self.assertEqual(organization["name"], "Saloni Resin Art Studio")
        self.assertIn(f'<link rel="canonical" href="{canonical}">', self.html)
        self.assertIn(f'<meta property="og:url" content="{canonical}">', self.html)
        self.assertEqual(organization["url"], canonical)
        self.assertEqual(organization["sameAs"], ["https://www.instagram.com/saloniresin_art_studio/"])
        self.assertNotRegex(script.group(1), re.compile(r"Review|AggregateRating|rating|telephone|address", re.I))

        sitemap_path = ROOT / "sitemap.xml"
        self.assertTrue(sitemap_path.is_file())
        sitemap = ET.parse(sitemap_path).getroot()
        namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        self.assertEqual(sitemap.tag, "{http://www.sitemaps.org/schemas/sitemap/0.9}urlset")
        urls = sitemap.findall("sm:url", namespace)
        self.assertEqual(len(urls), 1)
        self.assertEqual(urls[0].findtext("sm:loc", namespaces=namespace), canonical)
        self.assertEqual(len(list(urls[0])), 1)
        self.assertNotIn("#", sitemap_path.read_text(encoding="utf-8"))

    def test_hero_copy_names_searchable_offerings(self):
        hero = re.search(r'<p\b[^>]*class=["\']hero-intro["\'][\s\S]*?</p>', self.html)
        self.assertIsNotNone(hero)
        hero_copy = hero.group(0).lower()
        for phrase in ("resin art", "personalized gifts", "customized hampers"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, hero_copy)

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
        self.assertIn("background: transparent", studio_rule.group(1))

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

    def test_studio_catalogue_prices_are_exact_and_scoped(self):
        studio_match = re.search(r'<section\b[^>]*id=["\']studio-art["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(studio_match)
        studio = studio_match.group(0)
        self.assertRegex(studio, r'Displayed prices are for pictured/base designs')
        self.assertRegex(studio, r'Size, materials, and personalisation can change the final quote; Saloni confirms the final quote')

        studio_matrix = {
            "studio-blue-mantra-frame.jpeg": ("4,499", "3,099", 31),
            "studio-lilac-symbol-rakhi.jpeg": ("899", "649", 28),
            "studio-little-brother-rakhi.jpeg": ("999", "699", 30),
            "studio-white-mantra-frame.jpeg": ("7,499", "3,999", 47),
            "studio-lilac-scalloped-tray.jpeg": ("2,499", "1,899", 24),
            "studio-personalized-photo-clock.jpeg": ("5,499", "3,999", 27),
            "studio-floral-square-keepsake.jpeg": ("3,499", "2,699", 23),
            "studio-floral-hexagon-keepsake.jpeg": ("3,299", "2,499", 24),
            "studio-floral-handled-tray.jpeg": ("4,499", "3,399", 24),
            "studio-rose-hexagon-keepsake.jpeg": ("3,999", "2,999", 25),
        }
        hamper_match = re.search(r'<section\b[^>]*id=["\']hamper-rail["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(hamper_match)
        hamper = hamper_match.group(0)
        self.assertRegex(hamper, r'Displayed prices are for pictured/base designs')
        self.assertRegex(hamper, r'Size, materials, and personalisation can change the final quote; Saloni confirms the final quote')
        hamper_matrix = {
            "birthday-hamper.jpg": ("3,499", "2,299", 34),
            "car-theme-hamper.jpg": ("3,999", "2,499", 38),
            "holi-hamper.webp": ("3,499", "2,199", 37),
            "romantic-hamper.jpg": ("3,999", "2,399", 40),
        }
        resin_match = re.search(r'<section\b[^>]*id=["\']resin-art["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(resin_match)
        resin = resin_match.group(0)
        self.assertRegex(resin, r'Displayed prices are for pictured/base designs')
        self.assertRegex(resin, r'Size, materials, and personalisation can change the final quote; Saloni confirms the final quote')
        resin_matrix = {
            "resin-clock.jpg": ("3,999", "2,999", 25),
            "resin-message-coasters.jpg": ("2,499", "1,899", 24),
            "navkar-resin-frame.jpg": ("5,499", "3,999", 27),
            "personalized-floral-hoop.jpg": ("3,499", "2,699", 23),
        }

        def assert_matrix(section_html, matrix):
            cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*work-card[^"\']*["\'][\s\S]*?</article>', section_html)
            self.assertEqual(len(cards), len(matrix))
            self.assertEqual(section_html.count('class="product-pricing"'), len(matrix))
            for asset, (regular, festive, discount) in matrix.items():
                with self.subTest(asset=asset):
                    card = next((card for card in cards if f'assets/{asset}' in card), None)
                    self.assertIsNotNone(card)
                    pricing_blocks = re.findall(r'<dl\b[^>]*class=["\'][^"\']*product-pricing[^"\']*["\'][\s\S]*?</dl>', card)
                    self.assertEqual(len(pricing_blocks), 1)
                    pricing = pricing_blocks[0]
                    self.assertRegex(pricing, rf'<dt[^>]*>Regular price</dt>\s*<dd[^>]*><s>₹{re.escape(regular)}</s></dd>')
                    self.assertRegex(pricing, rf'<dt[^>]*>Festive price</dt>\s*<dd[^>]*>₹{re.escape(festive)}</dd>')
                    self.assertRegex(pricing, rf'<dt[^>]*>Discount</dt>\s*<dd[^>]*>{discount}% off</dd>')
                    self.assertEqual(pricing.count("<dt"), 3)
                    regular_value = int(regular.replace(",", ""))
                    festive_value = int(festive.replace(",", ""))
                    self.assertGreater(regular_value, festive_value)
                    self.assertEqual(round((regular_value - festive_value) / regular_value * 100), discount)

        assert_matrix(studio, studio_matrix)
        assert_matrix(hamper, hamper_matrix)
        assert_matrix(resin, resin_matrix)

        self.assertEqual(studio.count('class="product-pricing"') + hamper.count('class="product-pricing"') + resin.count('class="product-pricing"'), 18)
        for section_id in ("festive-offers",):
            section_match = re.search(rf'<section\b[^>]*id=["\']{section_id}["\'][\s\S]*?</section>', self.html)
            self.assertIsNotNone(section_match)
            with self.subTest(section=section_id):
                self.assertNotIn("product-pricing", section_match.group(0))
                if section_id == "festive-offers":
                    self.assertNotRegex(section_match.group(0), r'<dl\b')
        self.assertNotIn("schema.org/Offer", self.html)

    def test_art_lightbox_contract_preserves_product_catalogue(self):
        triggers = re.findall(r'<a\b[^>]*data-lightbox-trigger[^>]*>', self.html)
        self.assertEqual(len(triggers), 18)
        for trigger in triggers:
            with self.subTest(trigger=trigger):
                self.assertRegex(trigger, r'href=["\']assets/[^"\']+["\']')
                self.assertRegex(trigger, r'aria-label=["\'][^"\']+["\']')

        dialogs = re.findall(r'<dialog\b[\s\S]*?</dialog>', self.html)
        self.assertEqual(len(dialogs), 1)
        dialog = dialogs[0]
        self.assertIn('id="art-lightbox"', dialog)
        self.assertRegex(dialog, r'aria-labelledby=["\'][^"\']+["\']')
        self.assertIn('id="lightbox-image"', dialog)
        self.assertIn('id="lightbox-caption"', dialog)
        self.assertIn('aria-label="Close enlarged artwork"', dialog)
        dialog_image = re.search(r'<img\b[^>]*id=["\']lightbox-image["\'][^>]*>', dialog)
        self.assertIsNotNone(dialog_image)
        self.assertNotRegex(dialog_image.group(0), r'\bsrc=')

        for section_id, cards, pricing_blocks in (("studio-art", 10, 10), ("resin-art", 4, 4), ("hamper-rail", 4, 4)):
            section = re.search(rf'<section\b[^>]*id=["\']{section_id}["\'][\s\S]*?</section>', self.html)
            self.assertIsNotNone(section)
            with self.subTest(section=section_id):
                self.assertEqual(section.group(0).count('class="work-card'), cards)
                self.assertEqual(section.group(0).count('class="product-pricing"'), pricing_blocks)

    def test_carousel_enhancement_is_progressive(self):
        self.assertGreaterEqual(self.html.count('data-carousel'), 2)
        self.assertIn('data-carousel-prev', self.html)
        self.assertIn('data-carousel-next', self.html)
        self.assertIn('scroll-snap-type', (ROOT / "styles.css").read_text(encoding="utf-8") if (ROOT / "styles.css").exists() else "")
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
        for control_id in ("frame-type", "border-style", "frame-preset", "filling-colour", "brush-colour", "border-colour", "personal-text", "reference-image", "image-size", "crop-zoom", "crop-x", "crop-y", "position-left", "position-centre", "position-right", "paint-toggle"):
            with self.subTest(label_for=control_id):
                self.assertRegex(section, rf'<label\b[^>]*for=["\']{control_id}["\']')
        self.assertRegex(section, r'<fieldset\b[^>]*>\s*<legend[^>]*>Frame shape and finish')
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
        self.assertIn("Images and paint stay on this device", section)
        self.assertIn("attach your image or a screenshot separately", section)
        self.assertIn('href="tel:8209238541"', section)
        self.assertIn('href="https://www.instagram.com/saloniresin_art_studio/"', section)

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

    def test_customizer_css_has_preview_and_mobile_layout_hooks(self):
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".customizer-section", css)
        self.assertIn(".customizer-preview", css)
        self.assertIn(".scene-canvas", css)
        self.assertIn(".brush-cursor", css)
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
