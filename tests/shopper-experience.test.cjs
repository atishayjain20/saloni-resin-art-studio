const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const customizer = fs.readFileSync(path.join(root, "customizer.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function section(id) {
  const match = html.match(new RegExp(`<section[^>]+id=["']${id}["'][\\s\\S]*?<\\/section>`));
  assert.ok(match, `expected #${id}`);
  return match[0];
}

test("homepage leads with finished artwork and a browse-gifts CTA", () => {
  const hero = section("hero");
  assert.match(hero, /assets\/romantic-heart-trinket-tray\.webp/);
  assert.match(hero, /Tiny tray, big feelings/);
  assert.match(hero, /A soft place for rings, earbuds, and the little things you share\./);
  assert.match(hero, /assets\/romantic-initial-desk-stand\.webp/);
  assert.match(hero, /Your initial\. Mine\. Ours\./);
  assert.match(hero, /Two letters, one small corner that belongs to both of you\./);
  assert.match(hero, /Browse gifts by type or budget/);
  assert.doesNotMatch(hero, /hero-floral-bouquet\.jpg/);
});

test("mobile hero CSS keeps the tray dominant, captions in flow, and CTAs usable", () => {
  const mobileStart = css.indexOf("@media (max-width: 620px)");
  const reducedMotionStart = css.indexOf("@media (prefers-reduced-motion: reduce)");
  const mobileCss = css.slice(mobileStart, reducedMotionStart);
  const heroRule = mobileCss.match(/#hero\s*\{([^}]*)\}/)?.[1] || "";
  const copyContainerRule = mobileCss.match(/#hero \.hero-copy\s*\{([^}]*)\}/)?.[1] || "";
  const copyRule = mobileCss.match(/#hero h1\s*\{([^}]*)\}/)?.[1] || "";
  const actionsRule = mobileCss.match(/#hero \.hero-actions\s*\{([^}]*)\}/)?.[1] || "";
  const collageRule = mobileCss.match(/#hero \.hero-collage\s*\{([^}]*)\}/)?.[1] || "";
  const imageRule = mobileCss.match(/#hero \.hero-image\s*\{([^}]*)\}/)?.[1] || "";
  const mainImageRule = mobileCss.match(/#hero \.hero-image-main img\s*\{([^}]*)\}/)?.[1] || "";
  const clockFigureRule = mobileCss.match(/#hero \.hero-image-clock\s*\{([^}]*)\}/)?.[1] || "";
  const clockImageRule = mobileCss.match(/#hero \.hero-image-clock img\s*\{([^}]*)\}/)?.[1] || "";
  const captionRule = mobileCss.match(/#hero \.hero-image figcaption\s*\{([^}]*)\}/)?.[1] || "";
  const socialRule = mobileCss.match(/#hero \.instagram-mark\s*\{([^}]*)\}/)?.[1] || "";
  const noteRule = mobileCss.match(/#hero \.hero-note\s*\{([^}]*)\}/)?.[1] || "";

  assert.match(heroRule, /padding-block:\s*1rem 2\.5rem/);
  assert.match(copyContainerRule, /min-width:\s*0/);
  assert.match(copyRule, /max-width:\s*none/);
  assert.match(copyRule, /font-size:\s*clamp\(2\.5rem, 12vw, 3\.8rem\)/);
  assert.match(copyRule, /overflow-wrap:\s*anywhere/);
  assert.match(actionsRule, /flex-direction:\s*row/);
  assert.match(actionsRule, /flex-wrap:\s*wrap/);
  assert.match(collageRule, /display:\s*grid/);
  assert.match(collageRule, /min-height:\s*auto/);
  assert.match(collageRule, /min-width:\s*0/);
  assert.match(imageRule, /position:\s*relative/);
  assert.match(imageRule, /width:\s*100%/);
  assert.match(mainImageRule, /height:\s*auto/);
  assert.match(clockFigureRule, /width:\s*55%/);
  assert.match(clockImageRule, /height:\s*auto/);
  assert.match(captionRule, /position:\s*static/);
  assert.match(captionRule, /margin-top:\s*0\.4rem/);
  assert.match(socialRule, /max-width:\s*100%/);
  assert.match(socialRule, /overflow-wrap:\s*anywhere/);
  assert.match(noteRule, /max-width:\s*100%/);
  assert.match(noteRule, /overflow-wrap:\s*anywhere/);
  assert.match(noteRule, /right:\s*0\.5rem/);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x:\s*hidden/);
  assert.doesNotMatch(css.slice(0, mobileStart), /#hero/);
  assert.doesNotMatch(css.slice(reducedMotionStart), /#hero/);
});

test("catalogue enhancement has accessible filters, preview mode, and a no-result reset", () => {
  assert.match(html, /id="catalogue-filters"/);
  assert.match(html, /id="catalogue-type-filter"/);
  assert.match(html, /id="catalogue-price-filter"/);
  assert.match(html, /id="catalogue-filter-reset"/);
  assert.match(html, /id="catalogue-filter-empty"/);
  assert.match(html, /data-catalogue-disclosure/);
  assert.match(html, /See all 77 gifts/);
  assert.match(html, /Clear filters and browse all gifts/);
  assert.match(html, /Back to section previews/);
  assert.match(html, /data-category-shortcut="corporate"/);
  assert.match(html, /id="catalogue-page-previous"/);
  assert.match(html, /id="catalogue-page-next"/);
  assert.match(html, /id="catalogue-page-status"/);
  assert.match(html, /id="catalogue-pagination"/);
  assert.match(css, /\.category-shortcuts\s*\{[^}]*repeat\(5/);
  assert.match(script, /initCatalogueExperience/);
});

test("catalogue sections use four-card responsive grids with independent disclosures", () => {
  [
    ["diwali", "diwali-grid"],
    ["romantic-keepsakes", "romantic-keepsakes-grid"],
    ["corporate-resin-gifts", "corporate-resin-gifts-grid"],
    ["studio-art", "studio-art-grid"],
    ["hamper-rail", "hamper-grid"]
  ].forEach(([sectionId, gridId]) => {
    const sectionMarkup = section(sectionId);
    assert.match(sectionMarkup, new RegExp(`class="catalogue-grid"[^>]*id="${gridId}"`));
    assert.match(sectionMarkup, new RegExp(`data-catalogue-disclosure[^>]*aria-controls="${gridId}"`));
    assert.match(sectionMarkup, /aria-expanded="false"/);
    assert.doesNotMatch(sectionMarkup, /data-carousel|data-carousel-prev|data-carousel-next|tabindex="0"/);
    assert.doesNotMatch(sectionMarkup, /swipe|use the arrows|carousel/i);
  });
  assert.match(css, /\.catalogue-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.catalogue-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
  assert.doesNotMatch(script, /track\.addEventListener\("keydown"/);
});

test("category shortcuts use three columns at tablet widths and two on mobile", () => {
  const base = css.indexOf(".category-shortcuts {");
  const baseColumns = css.indexOf("repeat(5", base);
  const tablet = css.indexOf(".category-shortcuts { grid-template-columns: repeat(3", css.indexOf("@media (max-width: 840px)"));
  const mobile = css.indexOf(".category-shortcuts { grid-template-columns: repeat(2", css.indexOf("@media (max-width: 620px)"));
  assert.ok(base >= 0);
  assert.ok(baseColumns > base);
  assert.ok(tablet > baseColumns);
  assert.ok(mobile > tablet);
});

test("small-screen layout keeps long labels inside the viewport without masking overflow", () => {
  const firstMobileStart = css.indexOf("@media (max-width: 620px)");
  const catalogueMobileStart = css.indexOf("@media (max-width: 620px)", firstMobileStart + 1);
  const customizerMobileStart = css.indexOf("@media (max-width: 620px)", catalogueMobileStart + 1);
  const nextMedia = (start) => {
    const end = css.indexOf("\n@media", start + 1);
    return css.slice(start, end === -1 ? undefined : end);
  };
  const baseMobileCss = nextMedia(firstMobileStart);
  const catalogueMobileCss = nextMedia(catalogueMobileStart);
  const customizerMobileCss = nextMedia(customizerMobileStart);
  const shortcutsRule = css.match(/\.category-shortcuts a\s*\{([^}]*)\}/)?.[1] || "";
  const filterRule = catalogueMobileCss.match(/\.catalogue-filter-fields\s*\{([^}]*)\}/)?.[1] || "";
  const selectRule = catalogueMobileCss.match(/\.catalogue-filter-fields select\s*\{([^}]*)\}/)?.[1] || "";
  const mobilePreviewRule = customizerMobileCss.match(/\.customizer-preview-panel\s*\{([^}]*)\}/)?.[1] || "";
  const railRule = baseMobileCss.match(/\.rail-heading\s*\{([^}]*)\}/)?.[1] || "";
  const railHeadingRule = baseMobileCss.match(/\.rail-heading h2\s*\{([^}]*)\}/)?.[1] || "";
  const mainHeadingRule = baseMobileCss.match(/main h2\s*\{([^}]*)\}/)?.[1] || "";
  const contactButtonRule = baseMobileCss.match(/\.customizer-contact-links \.button\s*\{([^}]*)\}/)?.[1] || "";
  const orderStatusRule = css.match(/\.order-form-status\s*\{([^}]*)\}/)?.[1] || "";
  const orderStatusMarkup = html.match(/<div class="order-form-status"[\s\S]*?<\/div>/)?.[0] || "";
  const mainMarkup = html.match(/<main[\s\S]*?<\/main>/)?.[0] || "";

  assert.match(orderStatusRule, /overflow-wrap:\s*anywhere/);
  assert.match(orderStatusMarkup, /role="status"/);
  assert.match(orderStatusMarkup, /aria-live="polite"/);
  assert.match(orderStatusMarkup, /href="https:\/\/www\.instagram\.com\/saloniresin_art_studio\//);
  assert.match(filterRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(selectRule, /min-width:\s*0/);
  assert.match(mobilePreviewRule, /align-self:\s*stretch/);
  assert.match(railRule, /flex-direction:\s*column/);
  assert.match(railRule, /align-items:\s*flex-start/);
  assert.match(railHeadingRule, /max-width:\s*100%/);
  assert.doesNotMatch(railHeadingRule, /overflow-wrap:\s*anywhere/);
  assert.match(mainHeadingRule, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(baseMobileCss, /\[data-carousel\]\s+h2\s*\{/);
  assert.match(mainMarkup, /id="order-title"/);
  assert.match(mainMarkup, /id="studio-art-title"/);
  assert.match(mainMarkup, /id="customizer-title"/);
  assert.match(html, /<section[^>]*id="romantic-keepsakes"[^>]*aria-labelledby="romantic-keepsakes-title"/);
  assert.match(html, /<section[^>]*class="[^"]*\bwork-section\b[^"]*"[^>]*aria-labelledby="[^"]+"/);
  assert.match(contactButtonRule, /flex:\s*1 1 9rem/);
  assert.match(contactButtonRule, /min-width:\s*0/);
  assert.match(contactButtonRule, /flex-wrap:\s*wrap/);
  assert.match(contactButtonRule, /overflow-wrap:\s*anywhere/);
  assert.match(contactButtonRule, /justify-content:\s*center/);
  assert.match(shortcutsRule, /min-width:\s*0/);
  assert.match(shortcutsRule, /flex-wrap:\s*wrap/);
  assert.match(shortcutsRule, /overflow-wrap:\s*anywhere/);
  assert.match(css, /\.catalogue-grid\s*\{[^}]*display:\s*grid/);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x:\s*hidden/);
});

test("pricing keeps current quotes without unsupported discount claims", () => {
  const cards = html.match(/<dl class="product-pricing"[\s\S]*?<\/dl>/g) || [];
  assert.equal(cards.length, 77);
  cards.forEach((card) => {
    assert.doesNotMatch(card, /<s>|Regular price|Discount|off/);
    assert.match(card, /<dt>(?:Price|From|Estimated from)<\/dt>/);
  });
  assert.match(section("diwali"), /Diwali prices ₹249–₹1,799/);
});

test("festive offers are an inline choice, not an automatic modal", () => {
  assert.match(html, /class="[^"]*festive-banner/);
  assert.match(html, /<a href="#diwali">Festive offers<\/a>/);
  assert.doesNotMatch(html, /<dialog[^>]+festive-offers|special discounts/);
  assert.doesNotMatch(script, /initFestiveOffers|aria-controls="festive-offers"/);
});

test("customizer presents a keyboard-matched basics, preview, advanced, and save/share flow", () => {
  const customizerSection = section("customizer");
  const order = [
    "frame-template", "colour-theme", "reference-image", "personal-text", "frame-preset",
    "preview-stage", "order-from-customizer", "customizer-design-help", "customizer-advanced",
    "customizer-save-share"
  ];
  const positions = order.map((id) => customizerSection.indexOf(`id="${id}"`));
  positions.forEach((position, index) => assert.ok(position >= 0, `expected ${order[index]}`));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));

  [
    "frame-template", "colour-theme", "personal-text", "reference-image", "frame-preset", "frame-type",
    "border-style", "frame-unit", "image-layout-controls", "paint-toggle", "image-size", "crop-zoom",
    "copy-summary", "download-preview", "share-design", "order-from-customizer", "customizer-design-help", "customizer-continue-without-preview"
  ].forEach((id) => {
    assert.equal((customizerSection.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, `${id} appears once`);
  });

  assert.match(customizerSection, /<label for="frame-template">Starting design/);
  assert.match(customizerSection, /<label for="colour-theme">Colour palette/);
  assert.match(customizerSection, /Start here\. You can change any detail later\./);
  assert.match(customizerSection, /<summary>Advanced options<\/summary>[\s\S]*For precise colours, image placement, crop, finishing details, and paint\./);
  assert.match(customizerSection, /<summary>Save or share this preview<\/summary>[\s\S]*id="download-preview"[\s\S]*id="share-design"/);
  assert.equal((customizerSection.match(/id="share-status"/g) || []).length, 1);
  const shareStatusPosition = customizerSection.indexOf('id="share-status"');
  const saveSharePosition = customizerSection.indexOf('id="customizer-save-share"');
  assert.ok(shareStatusPosition >= 0 && shareStatusPosition < saveSharePosition, "request status stays visible before the closed save/share disclosure");
  assert.match(customizerSection, /Sends your design summary and size\. Attach a downloaded preview separately\./);
  assert.doesNotMatch(customizerSection.match(/<details[^>]*id="customizer-advanced"[^>]*>/)?.[0] || "", /\bopen\b/);
  assert.doesNotMatch(customizerSection.match(/<details[^>]*id="customizer-save-share"[^>]*>/)?.[0] || "", /\bopen\b/);
  assert.match(customizerSection, /Let Saloni design it for me/);
  assert.match(customizerSection, /Request this design/);
  assert.match(customizerSection, /<button[^>]+id="customizer-continue-without-preview"[^>]+hidden/);
  assert.doesNotMatch(customizerSection, /Start an order from this design/);
  assert.match(customizer, /data-template|template/);

  assert.match(css, /\.customizer-preview-panel\s*\{[^}]*position:\s*static/);
  assert.match(css, /\.customizer-preview-panel\s*\{[^}]*grid-row:\s*1\s*\/\s*span\s*5/);
  assert.match(css, /@media \(min-width: 841px\) and \(min-height: 720px\)[\s\S]*?\.customizer-preview-panel\s*\{[^}]*position:\s*sticky/);
  assert.match(css, /@media \(min-width: 841px\) and \(max-height: 719px\)[\s\S]*?\.customizer-preview-panel\s*\{[^}]*position:\s*static/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.customizer-preview-panel\s*\{[^}]*position:\s*static/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.customizer-preview-panel\s*\{[^}]*grid-row:\s*auto/);
  assert.match(css, /@media \(max-width: 840px\)[\s\S]*?\.customizer-preview-panel\s*\{[^}]*grid-row:\s*auto/);
  const customizerCss = css.slice(css.indexOf(".customizer-layout"), css.indexOf(".order-section"));
  assert.doesNotMatch(customizerCss, /(?:^|[;}])\s*order\s*:/);
});

test("request CTA vocabulary is consistent and supports general enquiries", () => {
  assert.match(html, /Request a custom gift/);
  assert.match(script, /button\.textContent = "Request this item"/);
  assert.match(script, /data-order-prefill="general"/);
  assert.match(script, /illustrative preview\|reference image/);
});

test("buying-help block replaces unsupported testimonial claims without a carousel", () => {
  const buyingHelp = html.match(/<section[^>]+id="testimonials"[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(buyingHelp, /<p class="eyebrow">Before you order<\/p>/);
  assert.match(buyingHelp, /<h2 id="testimonials-title">Know what your gift will include\.<\/h2>/);
  assert.match(buyingHelp, /Ask Saloni about your chosen product, personalisation, finish, packaging and delivery before confirming your order\./);
  assert.match(buyingHelp, /<a[^>]+href="#order"[^>]+data-order-prefill="general"[^>]*>Ask Saloni about a gift/);
  assert.doesNotMatch(buyingHelp, /data-carousel|data-testimonial-card|Rating:|★★★★★|<blockquote|<cite|Gaurav Jain|Atishay Jain|Aarti Suthar|Bharat Sharma|Puchki/);
  assert.match(css, /\.testimonials-section\s*\{[^}]*padding-block:\s*clamp\(2\.5rem,\s*5vw,\s*4rem\)/);
  assert.match(css, /\.testimonials-section \.buying-help\s*\{/);
  assert.doesNotMatch(css, /\.testimonial-card\s*\{|\.sample-rating\s*\{/);
});

test("all 77 catalogue cards keep price first and show only known size rows", () => {
  const expectedRows = [
    ["Size", "4 in"],
    ["Size", "4–6 in"],
    ["Size", "4–6 in"],
    null,
    ["Size", "6 in"],
    ["Size", "6 in"],
    ["Size", "4 in"],
    ["Size", "4 in"],
    ["Size", "6–8 in"],
    ["Size", "4–5 in"],
    ["Size", "4–5 in"],
    ["Size", "4 in each"],
    ["Size", "6 in"],
    ["Size", "4 in — component size to confirm"],
    ["Size", "3 in"],
    ["Size", "3 in"],
    ["Size", "6 in"],
    ["Size", "2–3 in each"],
    ["Size", "3–4 in"],
    ["Size", "3–4 in each"],
    ["Size", "4–5 in"],
    ["Size", "2 in each"],
    ["Size", "3–4 in each"],
    ["Size", "3–4 in"],
    ["Size", "1.5–2 in each"],
    ["Size", "5–6 in each"],
    ["Size", "3 in"],
    null,
    ["Size", "4 in"],
    null,
    null,
    null,
    null,
    null,
    ["Size", "8–10 in"],
    ["Size", "16–18 in"],
    null,
    null,
    ["Size", "1.5–2 in"],
    ["Size", "5–6 in"],
    ["Size", "4 in"],
    ["Size", "6 in"],
    ["Size", "3 in each"],
    ["Size", "2 in"],
    null,
    null,
    ["Size", "6–8 in"],
    null,
    null,
    null,
    null,
    ["Size", "4 in"],
    null,
    null,
    null,
    null,
    null,
    null,
    ["Size", "20×22 in"],
    null,
    null,
    ["Size", "20×22 in"],
    null,
    null,
    ["Size", "8–10 in"],
    null,
    ["Size", "20×22 in"],
    null,
    null,
    ["Size", "3 in each"],
    null,
    ["Size", "3 in each"],
    ["Size", "20×22 in"],
    null,
    null,
    null,
    null,
  ];
  const cards = html.match(/<article\b[^>]*class="[^"]*(?:work-card|romantic-keepsake-card)[^"]*"[\s\S]*?<\/article>/g) || [];
  assert.equal(cards.length, 77);
  assert.equal(expectedRows.length, 77);
  cards.forEach((card, index) => {
    const pricing = card.match(/<dl class="product-pricing"[\s\S]*?<\/dl>/)?.[0] || "";
    const rows = [...pricing.matchAll(/<div><dt>([^<]+)<\/dt><dd>([^<]+)<\/dd><\/div>/g)].map((match) => match.slice(1));
    assert.equal(pricing.match(/aria-label="([^"]+)"/)?.[1], "Catalogue price and size");
    assert.ok(rows.length === 1 || rows.length === 2, `card ${index + 1} has price and optional size rows`);
    assert.match(rows[0][0], /^(?:Price|From|Estimated from)$/);
    assert.match(rows[0][1], /^₹/);
    if (expectedRows[index]) {
      assert.equal(rows.length, 2, `card ${index + 1} has its known size row`);
      assert.deepEqual(rows[1], expectedRows[index], `card ${index + 1} size row`);
      assert.match(rows[1][1], /\d.*in/);
    } else {
      assert.equal(rows.length, 1, `card ${index + 1} omits an unknown size row`);
    }
    assert.doesNotMatch(pricing, /<dt>Suggested size<\/dt>|confirm with Saloni|Custom size in inches/);
  });
  assert.match(css, /product-pricing[^}]*div:first-child dd/);
  assert.match(css, /product-pricing[^}]*div:not\(:first-child\) dd/);
});

test("order note explains how listed and unlisted sizes affect pricing", () => {
  const order = section("order");
  const note = "Where a size is listed, the displayed current or estimated price is for that size. If no size is listed, ask Saloni for the available size and final quote. Prices may change with size.";
  assert.match(order, new RegExp(`<p class="order-size-pricing-note">${note.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\/p>`));
  const noteTail = order.slice(order.indexOf(note));
  assert.match(noteTail, /<\/p>\s*<\/section>$/, "size note is the last item in the order section");
});

test("uses known size wording and omits unknown catalogue sizes", () => {
  const cardFor = (title) => {
    const marker = `<strong>${title}</strong>`;
    const titleIndex = html.indexOf(marker);
    if (titleIndex < 0) return "";
    const start = html.lastIndexOf("<article", titleIndex);
    const end = html.indexOf("</article>", titleIndex);
    return start < 0 || end < 0 ? "" : html.slice(start, end + "</article>".length);
  };
  const rowsFor = (title) => [...(cardFor(title).match(/<div><dt>([^<]+)<\/dt><dd>([^<]+)<\/dd><\/div>/g) || [])].map((row) => row.match(/<dt>([^<]+)<\/dt><dd>([^<]+)<\/dd>/).slice(1));
  assert.deepEqual(rowsFor("Shubh Labh Welcome Pair").slice(1), [["Size", "4–6 in"]]);
  assert.deepEqual(rowsFor("Festive Welcome Hamper").slice(1), []);
  assert.deepEqual(rowsFor("Ivory Mandala Holder").slice(1), [["Size", "3 in"]]);
  assert.deepEqual(rowsFor("Pearl Rangoli Accent").slice(1), [["Size", "3–4 in"]]);
  assert.deepEqual(rowsFor("Rose Petal Offering Plate").slice(1), [["Size", "4–5 in"]]);
});
