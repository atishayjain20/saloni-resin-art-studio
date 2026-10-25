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
    ("romantic-us-keychain-pair.webp", "Two keys, one little us", "Made to travel together, even when you cannot.", "899", "599", 33),
    ("romantic-floral-bookmark-set.webp", "Save our page", "Three little places to keep the chapters that feel like yours.", "1,199", "799", 33),
    ("romantic-calendar-coaster.webp", "Our date, every day", "The day everything changed, circled for every ordinary morning after.", "1,499", "1,099", 27),
    ("romantic-first-rose-bracelet.webp", "The first rose, still with me", "One petal from the beginning, made wearable.", "999", "699", 30),
    ("romantic-heart-trinket-tray.webp", "Tiny tray, big feelings", "A soft place for rings, earbuds, and the little things you share.", "699", "399", 43),
    ("romantic-initial-desk-stand.webp", "Your initial. Mine. Ours.", "Two letters, one small corner that belongs to both of you.", "1,299", "899", 31),
    ("romantic-botanical-pendant.webp", "A little piece of our season", "Pressed flowers and a name, kept close.", "899", "599", 33),
    ("romantic-ocean-memory-tray.webp", "Our place, held in waves", "For the beach, trip, or city that became part of your story.", "1,999", "1,499", 25),
    ("romantic-couple-scene.webp", "Our favourite little scene", "A tiny version of the everyday moment you would replay.", "1,299", "899", 31),
    ("romantic-couple-miniature.webp", "Your story, in 3D", "Two people, one meaningful detail, made into a shelf-sized memory.", "3,499", "2,499", 29),
)


class StaticSiteContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html_path = ROOT / "index.html"
        cls.html = cls.html_path.read_text(encoding="utf-8") if cls.html_path.exists() else ""

    def test_page_has_required_sections_and_accessibility_hooks(self):
        required_ids = [
            "main-content", "hero", "offerings", "studio-art", "hamper-rail",
            "festive-offers", "testimonials", "order", "footer",
        ]
        for section_id in required_ids:
            with self.subTest(section_id=section_id):
                self.assertRegex(self.html, rf'id=["\']{section_id}["\']')
        self.assertIn('href="#main-content"', self.html)
        self.assertIn('aria-label="Previous', self.html)
        self.assertIn('aria-label="Next', self.html)
        self.assertIn('class="site-script"', self.html)

    def test_primary_navigation_has_partner_circle_link_and_clickable_pills(self):
        nav_match = re.search(r'<nav class="site-nav"[\s\S]*?</nav>', self.html)
        self.assertIsNotNone(nav_match)
        nav = nav_match.group(0)
        self.assertRegex(
            nav,
            r'<a href="#romantic-keepsakes">Resin art</a>\s*'
            r'<a href="#hamper-rail">Hampers</a>\s*'
            r'<button[^>]*type="button"[^>]*aria-haspopup="dialog"[^>]*aria-controls="festive-offers"[^>]*>Festive offers</button>\s*'
            r'(?:<noscript><a[^>]*href="#festive-offers-fallback"[^>]*>Festive offers</a></noscript>\s*)?'
            r'<a href="#customizer">Design a frame</a>\s*'
            r'<a href="partners/">Join Partner Circle</a>\s*'
            r'<a href="corporate-gifting/">Corporate gifting</a>',
        )
        self.assertIn('class="nav-cta" href="#romantic-keepsakes"', nav)
        self.assertNotIn('href="#process"', nav)
        self.assertNotIn(">The process<", nav)
        self.assertNotIn('class="nav-cta" href="#order"', nav)
        footer = re.search(r'<div class="footer-links">([\s\S]*?)</div>', self.html)
        self.assertIsNotNone(footer)
        self.assertIn('<a href="#romantic-keepsakes">Resin art</a>', footer.group(0))
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
        self.assertRegex(css, r"@media \(max-width: 620px\) \{[\s\S]*?html \{ scroll-padding-top: 7\.5rem; \}")

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

    def test_photo_frame_concept_preview_disclosure_matches_homepage(self):
        html = (ROOT / "resin-photo-frames" / "index.html").read_text(encoding="utf-8")
        concept_alt = "Concept preview: Soft-arch clear resin memory frame with dried blush roses and restrained gold flecks"

        self.assertIn(f'<meta property="og:image:alt" content="{concept_alt}">', html)
        self.assertIn(f'<meta name="twitter:image:alt" content="{concept_alt}">', html)
        self.assertEqual(html.count(f'alt="{concept_alt}"'), 2)
        self.assertEqual(html.count("Concept preview · made to order"), 2)
        self.assertNotIn("Made in Ajmer, with care.", html)

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
        self.assertIn('href="#studio-art">Explore the keepsakes', section_html)
        for phrase in (
            "Rose hexagon",
            "Personalized photo clock",
            "Say it without a speech",
            "Preserved rose display",
            "Preserved red roses, held close for a lasting moment.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, section_html)
        track = re.search(r'<div\b[^>]*class=["\']carousel-track["\'][^>]*>', section_html)
        self.assertIsNotNone(track)
        self.assertIn('id="romantic-keepsakes-track"', track.group(0))
        self.assertIn('data-carousel-track', track.group(0))
        self.assertIn('tabindex="0"', track.group(0))
        self.assertIn('aria-label="Romantic keepsakes"', track.group(0))

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
        self.assertIn('data-carousel="romantic-keepsakes"', section_html)
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
            "studio-rose-hexagon-keepsake.jpeg": ("3,999", "2,999", 25),
            "studio-personalized-photo-clock.jpeg": ("5,499", "3,999", 27),
            "romantic-hamper.jpg": ("3,999", "2,399", 40),
            "studio-red-rose-resin-display.jpeg": ("999", "699", 30),
        }
        for asset, (regular, festive, discount) in highlight_matrix.items():
            with self.subTest(asset=asset):
                card = next((card for card in cards if f"assets/{asset}" in card), None)
                self.assertIsNotNone(card)
                pricing = re.search(r'<dl\b[^>]*class=["\'][^"\']*product-pricing[^"\']*["\'][\s\S]*?</dl>', card)
                self.assertIsNotNone(pricing)
                pricing_html = pricing.group(0)
                self.assertRegex(pricing_html, rf'<dt[^>]*>Regular price</dt>\s*<dd[^>]*><s>₹{re.escape(regular)}</s></dd>')
                self.assertRegex(pricing_html, rf'<dt[^>]*>Festive price</dt>\s*<dd[^>]*>₹{re.escape(festive)}</dd>')
                self.assertRegex(pricing_html, rf'<dt[^>]*>Discount</dt>\s*<dd[^>]*>{discount}% off</dd>')
                self.assertEqual(pricing_html.count("<dt"), 3)
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
        notes_label = '<p class="romantic-keepsake-notes-label">A few kind words about the studio</p>'
        self.assertIn(notes_label, section_html)
        self.assertLess(section_html.index(notes_label), section_html.index('<figure class="romantic-keepsake-note"'))
        for quote, attribution in (
            (
                "“The colour story feels warm and personal — a lovely example of how a small idea can become a keepsake.”",
                "Gaurav Jain",
            ),
            (
                "“Soft tones and tiny details make this feel joyful, considered, and made for a moment worth remembering.”",
                "Aarti Suthar",
            ),
        ):
            with self.subTest(attribution=attribution):
                self.assertIn(quote, section_html)
                self.assertIn(f"<cite>{attribution}</cite>", section_html)

        self.assertRegex(self.html, r'<a\b[^>]*class=["\']button button-dark["\'][^>]*href=["\']#romantic-keepsakes["\']')
        self.assertEqual(self.html.count('data-carousel='), 4)
        self.assertEqual(self.html.count('data-lightbox-trigger'), 33)
        self.assertEqual(self.html.count('class="product-pricing"'), 33)
        self.assertEqual(self.html.count('data-testimonial-card'), 5)

        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".romantic-keepsakes", css)
        self.assertIn(".carousel-track", css)
        self.assertRegex(css, r"\.romantic-keepsake-notes-label\s*\{[^}]*grid-column:\s*1 / -1")
        self.assertRegex(css, r"\.romantic-keepsake-card img\s*\{[^}]*object-fit:\s*contain")
        self.assertRegex(css, r"\.romantic-keepsake-card figcaption > p:first-of-type, \.studio-art-section \.work-card figcaption > p:first-of-type\s*\{[^}]*font-size:\s*0\.75rem")
        self.assertRegex(css, r"\.carousel-track\s*\{[^}]*grid-auto-flow:\s*column[^}]*overflow-x:\s*auto")
        medium_media = re.search(r"@media \(max-width: 840px\) \{([\s\S]*?)\n\}\n\n@media \(max-width: 620px\)", css)
        self.assertIsNotNone(medium_media)
        self.assertRegex(medium_media.group(1), r"\.carousel-track\s*\{[^}]*grid-auto-columns:\s*minmax\(245px, 38vw\)")
        small_media = re.search(r"@media \(max-width: 620px\) \{([\s\S]*?)\n\}\n\n@media \(prefers-reduced-motion: reduce\)", css)
        self.assertIsNotNone(small_media)
        self.assertRegex(small_media.group(1), r"\.romantic-keepsake-card\s*\{[^}]*padding:\s*0\.7rem")
        self.assertRegex(small_media.group(1), r"\.romantic-keepsake-card img\s*\{[^}]*height:\s*11rem")
        self.assertRegex(small_media.group(1), r"\.romantic-keepsake-notes\s*\{[^}]*grid-template-columns:\s*1fr")
        self.assertRegex(small_media.group(1), r"\.romantic-keepsake-card figcaption \.product-pricing > div\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto")
        self.assertRegex(small_media.group(1), r"\.romantic-keepsake-card figcaption \.product-pricing dd\s*\{[^}]*white-space:\s*nowrap[^}]*overflow-wrap:\s*normal")

    def test_romantic_keepsake_collection_carousel_contract(self):
        section = re.search(r'<section\b[^>]*id=["\']romantic-keepsakes["\'][\s\S]*?</section>', self.html)
        self.assertIsNotNone(section)
        section_html = section.group(0)
        self.assertEqual(section_html.count('data-carousel="romantic-keepsakes"'), 1)
        self.assertIn('id="romantic-keepsakes-track"', section_html)
        self.assertIn('data-carousel-track', section_html)
        track = re.search(r'<div\b[^>]*class=["\']carousel-track["\'][^>]*>', section_html)
        self.assertIsNotNone(track)
        self.assertIn('role="list"', track.group(0))
        self.assertIn('aria-controls="romantic-keepsakes-track"', section_html)
        self.assertIn('aria-label="Previous romantic keepsakes"', section_html)
        self.assertIn('aria-label="Next romantic keepsakes"', section_html)
        self.assertIn("14 keepsakes and concept previews — swipe or use the arrows to explore.", section_html)
        self.assertIn("Concept previews are illustrative.", section_html)
        for phrase in ("feasibility", "materials", "final design", "quote", "delivery"):
            self.assertIn(phrase, section_html)

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
                self.assertIn("Concept preview · made to order", card)
                self.assertIn("Original concept preview:", card)
                self.assertNotIn(FINAL_QUOTE_NOTE, card)
                self.assertNotIn("Market reference", card)
                self.assertNotIn("Average listed price", card)
                self.assertIn("Regular price", card)
                self.assertIn("Festive price", card)
                self.assertIn("Discount", card)
                pricing = re.search(r'<dl\b[^>]*class=["\'][^"\']*product-pricing[^"\']*["\'][\s\S]*?</dl>', card)
                self.assertIsNotNone(pricing)
                pricing_html = pricing.group(0)
                self.assertEqual(pricing_html.count("<dt"), 3)
                self.assertRegex(pricing_html, rf'<dt[^>]*>Regular price</dt>\s*<dd[^>]*><s>₹{re.escape(regular)}</s></dd>')
                self.assertRegex(pricing_html, rf'<dt[^>]*>Festive price</dt>\s*<dd[^>]*>₹{re.escape(festive)}</dd>')
                self.assertRegex(pricing_html, rf'<dt[^>]*>Discount</dt>\s*<dd[^>]*>{discount}% off</dd>')
                image = re.search(r'<img\b[^>]*>', card)
                self.assertIsNotNone(image)
                image_tag = image.group(0)
                self.assertRegex(image_tag, r'alt=["\']Original concept preview: [^"\']+["\']')
                self.assertIn('width="1024"', image_tag)
                self.assertIn('height="1024"', image_tag)
                self.assertIn('loading="lazy"', image_tag)
                self.assertIn('decoding="async"', image_tag)
                self.assertEqual(webp_dimensions(ROOT / "assets" / asset), (1024, 1024))
                trigger = re.search(r'<a\b[^>]*data-lightbox-trigger[^>]*href=["\']([^"\']+)["\']', card)
                self.assertIsNotNone(trigger)
                self.assertEqual(trigger.group(1), f"assets/{asset}")

        for asset, _, _, _, _, _ in ROMANTIC_CONCEPTS:
            self.assertEqual(self.html.count(f'src="assets/{asset}"'), 1)
        for studio_concept in (
            "concept-floral-memory-frame.webp",
            "concept-ocean-clock.webp",
            "concept-tray-hamper.webp",
            "concept-floral-coasters.webp",
        ):
            self.assertNotIn(studio_concept, section_html)

        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertRegex(css, r"\.carousel-track\s*\{[^}]*grid-auto-columns:\s*minmax\(255px, 26\.5vw\)[^}]*overflow-x:\s*auto")
        self.assertRegex(css, r"\.carousel-track\s*\{[^}]*scroll-snap-type:\s*x mandatory")
        self.assertRegex(css, r"\.carousel\s*\{[^}]*overflow-x:\s*hidden")
        medium_media = re.search(r"@media \(max-width: 840px\) \{([\s\S]*?)\n\}\n\n@media \(max-width: 620px\)", css)
        self.assertIsNotNone(medium_media)
        self.assertRegex(medium_media.group(1), r"\.carousel-track\s*\{[^}]*grid-auto-columns:\s*minmax\(245px, 38vw\)")
        small_media = re.search(r"@media \(max-width: 620px\) \{([\s\S]*?)\n\}\n\n@media \(prefers-reduced-motion: reduce\)", css)
        self.assertIsNotNone(small_media)
        self.assertRegex(small_media.group(1), r"\.carousel-track\s*\{[^}]*grid-auto-columns:\s*minmax\(78vw, 78vw\)")

    def test_public_metadata_uses_settled_custom_domain_url(self):
        public_url = "https://saloniresinart.com/"
        image_url = public_url + "assets/hero-floral-bouquet.jpg"
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
        self.assertEqual(len(details), 3)
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
        self.assertIn("Resin keepsakes from the studio", section_html)
        self.assertIn("Swipe or use the arrows to explore all 16 pieces.", section_html)
        self.assertEqual(self.html.count('id="studio-art"'), 1)
        self.assertEqual(self.html.count('id="studio-art-track"'), 1)
        self.assertEqual(section_html.count('aria-controls="studio-art-track"'), 2)

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
        )
        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*work-card[^"\']*["\'][\s\S]*?</article>', section_html)
        self.assertEqual(len(cards), 16)
        self.assertEqual(section_html.count("<figcaption>"), 16)
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
        self.assertNotIn("Sample testimonials for layout preview", section_html)
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
        self.assertNotRegex(self.html, re.compile(r'"@type"\s*:\s*"(?:Review|AggregateRating)"', re.I))

    def test_festive_offers_area_has_diwali_navratri_and_contact_paths(self):
        match = re.search(r'<dialog\b[^>]*id=["\']festive-offers["\'][\s\S]*?</dialog>', self.html)
        self.assertIsNotNone(match)
        dialog = match.group(0)
        self.assertIn("Diwali", dialog)
        self.assertIn("Navratri", dialog)
        self.assertRegex(dialog, r"special discounts")
        self.assertRegex(dialog, r"Contact Saloni for offer details")
        self.assertIn('href="tel:8209238541"', dialog)
        self.assertIn('href="https://www.instagram.com/saloniresin_art_studio/"', dialog)
        self.assertIn('aria-labelledby="festive-offers-title"', dialog)
        self.assertIn('<form method="dialog"', dialog)
        self.assertRegex(self.html, r'<button\b[^>]*type="button"[^>]*aria-haspopup="dialog"[^>]*aria-controls="festive-offers"')
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertNotIn(".offers-section", css)
        self.assertIn(".festive-noscript .button-dark", css)
        self.assertIn(".festive-noscript .button-line", css)
        self.assertRegex(css, r'dialog\.festive-dialog:not\(\[open\]\)\s*\{[^}]*display:\s*none')
        self.assertRegex(css, r'\.festive-dialog-panel\s*\{[^}]*overflow:\s*auto')
        self.assertRegex(css, r'\.festive-dialog-close\s*\{[^}]*width:\s*44px[^}]*height:\s*44px')
        self.assertRegex(css, r'html:not\(\.js\) \.site-nav \.nav-link-button\s*\{[^}]*display:\s*none')
        self.assertRegex(css, r'@media \(max-width: 620px\) \{[\s\S]*dialog\.festive-dialog\s*\{[^}]*max-width:\s*calc\(100vw - 1rem\)')
        self.assertIn('href="#festive-offers-fallback"', self.html)
        self.assertIn('class="nav-link-fallback"', self.html)
        self.assertIn('id="festive-offers-fallback"', self.html)
        self.assertIn('href="tel:8209238541"', self.html[self.html.index('id="festive-offers-fallback"'):])
        self.assertIn('href="https://www.instagram.com/saloniresin_art_studio/"', self.html[self.html.index('id="festive-offers-fallback"'):])
        script = (ROOT / "script.js").read_text(encoding="utf-8")
        self.assertNotIn("autoAttempted", script)
        self.assertIn("if (!seen)", script)

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
            "studio-lilac-scalloped-tray.jpeg": ("899", "499", 44),
            "studio-floral-square-keepsake.jpeg": ("3,499", "2,699", 23),
            "studio-floral-hexagon-keepsake.jpeg": ("3,299", "2,499", 24),
            "studio-floral-handled-tray.jpeg": ("4,499", "3,399", 24),
            "concept-floral-memory-frame.webp": ("8,999", "6,749", 25),
            "concept-ocean-clock.webp": ("3,999", "2,749", 31),
            "concept-tray-hamper.webp": ("2,999", "2,199", 27),
            "concept-floral-coasters.webp": ("2,199", "1,549", 30),
            "resin-clock.jpg": ("3,999", "2,999", 25),
            "resin-message-coasters.jpg": ("2,499", "1,899", 24),
            "navkar-resin-frame.jpg": ("5,499", "3,999", 27),
            "personalized-floral-hoop.jpg": ("999", "599", 40),
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
                    self.assertRegex(pricing, rf'<dt[^>]*>Regular price</dt>\s*<dd[^>]*><s>₹{re.escape(regular)}</s></dd>')
                    self.assertRegex(pricing, rf'<dt[^>]*>Festive price</dt>\s*<dd[^>]*>₹{re.escape(festive)}</dd>')
                    self.assertRegex(pricing, rf'<dt[^>]*>Discount</dt>\s*<dd[^>]*>{discount}% off</dd>')
                    self.assertEqual(pricing.count("<dt"), 3)
                    regular_value = int(regular.replace(",", ""))
                    festive_value = int(festive.replace(",", ""))
                    self.assertGreater(regular_value, festive_value)
                    self.assertEqual(round((regular_value - festive_value) / regular_value * 100), discount)

        assert_matrix(studio, studio_matrix, expected_cards=16, expected_pricing_blocks=16)
        assert_matrix(hamper, hamper_matrix)

        self.assertEqual(studio.count('class="product-pricing"') + hamper.count('class="product-pricing"'), 19)
        dialog_match = re.search(r'<dialog\b[^>]*id=["\']festive-offers["\'][\s\S]*?</dialog>', self.html)
        self.assertIsNotNone(dialog_match)
        self.assertNotIn("product-pricing", dialog_match.group(0))
        self.assertNotRegex(dialog_match.group(0), r'<dl\b')
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
        self.assertEqual(len(triggers), 33)
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

        for section_id, cards, pricing_blocks in (("romantic-keepsakes", 14, 14), ("studio-art", 16, 16), ("hamper-rail", 3, 3)):
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
            "concept-floral-memory-frame.webp": ("Your flowers, held close", "8,999", "6,749", 25),
            "concept-ocean-clock.webp": ("A little blue hour", "3,999", "2,749", 31),
            "concept-tray-hamper.webp": ("A tray full of celebration", "2,999", "2,199", 27),
            "concept-floral-coasters.webp": ("Little messages, shared", "2,199", "1,549", 30),
        }
        cards = re.findall(r'<article\b[^>]*class=["\'][^"\']*work-card[^"\']*["\'][\s\S]*?</article>', studio)
        self.assertEqual(len(cards), 16)
        for asset, (title, regular, festive, discount) in expected.items():
            with self.subTest(asset=asset):
                card = next((card for card in cards if f'assets/{asset}' in card), None)
                self.assertIsNotNone(card)
                self.assertEqual(self.html.count(f'src="assets/{asset}"'), 1)
                self.assertIn(f">{title}</strong>", card)
                self.assertIn('class="work-card', card)
                self.assertNotIn('data-concept', card)
                self.assertIn("Concept preview · made to order", card)
                self.assertNotIn("Market reference", card)
                self.assertNotIn(FINAL_QUOTE_NOTE, card)
                pricing = re.search(r'<dl\b[^>]*class=["\'][^"\']*product-pricing[^"\']*["\'][\s\S]*?</dl>', card)
                self.assertIsNotNone(pricing)
                pricing_html = pricing.group(0)
                self.assertEqual(pricing_html.count("<dt"), 3)
                self.assertRegex(pricing_html, rf'<dt[^>]*>Regular price</dt>\s*<dd[^>]*><s>₹{re.escape(regular)}</s></dd>')
                self.assertRegex(pricing_html, rf'<dt[^>]*>Festive price</dt>\s*<dd[^>]*>₹{re.escape(festive)}</dd>')
                self.assertRegex(pricing_html, rf'<dt[^>]*>Discount</dt>\s*<dd[^>]*>{discount}% off</dd>')
                image = re.search(r'<img\b[^>]*>', card)
                self.assertIsNotNone(image)
                image_tag = image.group(0)
                self.assertRegex(image_tag, r'alt=["\']Original concept preview: [^"\']+["\']')
                self.assertIn('width="1024"', image_tag)
                self.assertIn('height="1024"', image_tag)
                self.assertIn('loading="lazy"', image_tag)
                self.assertIn('decoding="async"', image_tag)
                self.assertEqual(webp_dimensions(ROOT / f"assets/{asset}"), (1024, 1024))
                href = re.search(r'<a\b[^>]*data-lightbox-trigger[^>]*href=["\']([^"\']+)["\']', card).group(1)
                self.assertEqual(href, f"assets/{asset}")

        self.assertEqual(studio.count('data-lightbox-trigger'), 16)
        self.assertNotRegex((ROOT / "styles.css").read_text(encoding="utf-8"), r'\.concept-(?:section|card|note)')

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
        self.assertIn('id="share-design"', section)
        self.assertIn('id="share-status"', section)
        self.assertIn('href="https://ig.me/m/saloniresin_art_studio"', section)
        self.assertIn("Open Saloni’s Instagram chat", section)
        self.assertRegex(section, r'<button\b[^>]*id="share-design"[^>]*type="button"[^>]*aria-describedby="share-guidance"[^>]*>Share design</button>')
        self.assertIn("Some apps may omit the text", section)
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
