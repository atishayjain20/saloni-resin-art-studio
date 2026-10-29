const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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
  assert.match(hero, /data-lightbox-target="romantic-trinket"/);
  assert.match(hero, /data-lightbox-target="romantic-initial"/);
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
  assert.match(html, /See all 89 gifts/);
  assert.match(html, /Clear filters and browse all gifts/);
  assert.match(html, /Back to section previews/);
  assert.match(html, /data-category-shortcut="corporate"/);
  assert.match(html, /id="catalogue-page-previous"/);
  assert.match(html, /id="catalogue-page-next"/);
  assert.match(html, /id="catalogue-page-status"/);
  assert.match(html, /id="catalogue-pagination"/);
  assert.match(css, /\.category-shortcuts\s*\{[^}]*repeat\(6/);
  assert.match(script, /initCatalogueExperience/);
});

test("full browse keeps one global status and a clear all-gifts heading while pagination stays section-bound", () => {
  const enhancement = html.match(/<div class="catalogue-enhancement"[\s\S]*?<\/div>\s*<a class="button button-dark catalogue-browse-all"/)?.[0] || "";
  assert.ok(enhancement.indexOf('id="catalogue-filter-status"') < enhancement.indexOf('id="catalogue-results"'));
  assert.match(enhancement, /id="catalogue-results"[\s\S]*id="catalogue-pagination"/);
  assert.doesNotMatch(enhancement.match(/<div class="catalogue-results"[\s\S]*?<\/div>/)?.[0] || "", /catalogue-filter-status/);
  assert.match(script, /All gifts/);
  assert.match(script, /focusCatalogueHeading\(state && state\.pageCards\)/);
  assert.match(script, /catalogue-filters/);
});

test("premium catalogue results keep readable text on the dark section", () => {
  const resultsRule = css.match(/\.premium-collection-section \.catalogue-results \.catalogue-filter-status,\s*\.premium-collection-section \.catalogue-results \.catalogue-pagination span\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(resultsRule, /color:\s*#fbf5e9/);
});

test("catalogue sections use four-card responsive grids with independent disclosures", () => {
  [
    ["diwali", "diwali-grid"],
    ["romantic-keepsakes", "romantic-keepsakes-grid"],
    ["corporate-resin-gifts", "corporate-resin-gifts-grid"],
    ["studio-art", "studio-art-grid"],
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

test("mobile catalogue cards keep full copy in source while reserving aligned title, pricing, and action slots", () => {
  const mobileStart = css.indexOf("@media (max-width: 620px)");
  const reducedMotionStart = css.indexOf("@media (prefers-reduced-motion: reduce)");
  const mobileCss = css.slice(mobileStart, reducedMotionStart);
  assert.match(mobileCss, /\.catalogue-grid\s*>\s*:\s*is\(/);
  assert.match(mobileCss, /display:\s*flex/);
  assert.match(mobileCss, /-webkit-line-clamp:\s*2/);
  assert.match(mobileCss, /grid-template-rows:\s*repeat\(2/);
  assert.match(mobileCss, /\.catalogue-order-button\s*\{[^}]*min-height:/);
  assert.match(script, /figcaption p/);
  assert.match(script, /imageAlt/);
  assert.match(section("romantic-keepsakes"), /id="romantic-trinket"/);
  assert.match(section("romantic-keepsakes"), /id="romantic-initial"/);
});

test("mobile copy compaction stays behind the JavaScript enhancement class", () => {
  const mobileStart = css.indexOf("@media (max-width: 620px)");
  const reducedMotionStart = css.indexOf("@media (prefers-reduced-motion: reduce)");
  const mobileCss = css.slice(mobileStart, reducedMotionStart);
  assert.match(mobileCss, /html\.js \.catalogue-grid[^\{]*figcaption > :is\(strong, h3\)/);
  assert.match(mobileCss, /html\.js \.catalogue-grid[^\{]*figcaption > p:first-of-type/);
  assert.match(mobileCss, /html\.js \.catalogue-grid[^\{]*figcaption > p:not\(:first-of-type\)/);
});

test("catalogue cards expose shared semantic row tracks through native subgrid", () => {
  assert.match(css, /@supports\s*\(grid-template-rows:\s*subgrid\)/);
  assert.match(css, /\.catalogue-grid > :is\(\.work-card, \.romantic-keepsake-card\)[^{]*\{[^}]*grid-row:\s*span 8;[^}]*grid-template-rows:\s*subgrid/);
  assert.match(css, /\.catalogue-grid > :is\(\.work-card, \.romantic-keepsake-card\) > figure[^{]*\{[^}]*grid-row:\s*1 \/ -1;[^}]*grid-template-rows:\s*subgrid/);
  assert.match(css, /\.catalogue-grid > :is\(\.work-card, \.romantic-keepsake-card\) > figure > figcaption[^{]*\{[^}]*grid-row:\s*2 \/ -1;[^}]*grid-template-rows:\s*subgrid/);
  assert.match(css, /figcaption > span[^{]*\{[^}]*grid-row:\s*1/);
  assert.match(css, /figcaption > :is\(strong, h3\)[^{]*\{[^}]*grid-row:\s*2/);
  assert.match(css, /figcaption > p:first-of-type[^{]*\{[^}]*grid-row:\s*3/);
  assert.match(css, /figcaption > p:nth-of-type\(2\)[^{]*\{[^}]*grid-row:\s*4/);
  assert.match(css, /figcaption > \.product-pricing[^{]*\{[^}]*grid-row:\s*5 \/ 7;[^}]*grid-template-rows:\s*subgrid/);
  assert.match(css, /product-pricing > div:first-child[^{]*\{[^}]*grid-row:\s*1/);
  assert.match(css, /product-pricing > div:nth-child\(2\)[^{]*\{[^}]*grid-row:\s*2/);
  assert.match(css, /figcaption > \.catalogue-order-button[^{]*\{[^}]*grid-row:\s*7/);
  assert.match(css, /product-pricing[^{]*\{[^}]*margin-top:\s*0/);
});

test("catalogue section disclosures sit below their grids", () => {
  [
    ["diwali", "diwali-grid"],
    ["romantic-keepsakes", "romantic-keepsakes-grid"],
    ["corporate-resin-gifts", "corporate-resin-gifts-grid"],
    ["studio-art", "studio-art-grid"],
    ["premium-collection", "premium-collection-grid"],
  ].forEach(([sectionId, gridId]) => {
    const sectionMarkup = section(sectionId);
    assert.equal((sectionMarkup.match(/data-catalogue-disclosure/g) || []).length, 1);
    assert.match(
      sectionMarkup,
      new RegExp(`<div class="catalogue-grid"[^>]*id="${gridId}"[\\s\\S]*?</div>\\s*<button[^>]*data-catalogue-disclosure[^>]*aria-controls="${gridId}"`),
      `${sectionId} disclosure should follow its grid`,
    );
  });
});

test("category shortcuts use three columns at tablet widths and two on mobile", () => {
  const base = css.indexOf(".category-shortcuts {");
  const baseColumns = css.indexOf("repeat(6", base);
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
  assert.equal(cards.length, 89);
  cards.forEach((card) => {
    assert.doesNotMatch(card, /<s>|Regular price|Discount|off/);
    assert.match(card, /<dt>(?:Price|From)<\/dt>/);
  });
  assert.doesNotMatch(html, /<dt>Estimated from<\/dt>/);
  assert.match(html, /<dt>Price<\/dt><dd>₹2,499<\/dd>/);
  assert.match(section("diwali"), /Diwali prices ₹249–₹1,799/);
});

test("festive banner is absent while Diwali remains in the collection", () => {
  assert.doesNotMatch(html, /class="[^"]*festive-banner/);
  assert.doesNotMatch(html, /<a href="#diwali"(?: data-category-shortcut="diwali")?>Browse Diwali designs/);
  assert.match(html, /<section[^>]+id="diwali"[\s\S]*Diwali prices/);
  assert.doesNotMatch(html, /<dialog[^>]+festive-offers|special discounts/);
  assert.doesNotMatch(script, /initFestiveOffers|aria-controls="festive-offers"/);
});

test("resin-only catalogue removes hamper products and keeps both ₹2,000 budget choices", () => {
  ["diwali-festive-hamper", "romantic-hamper-title", "corporate-festive-hamper", "birthday-hamper", "car-theme-hamper", "holi-hamper", "hamper-rail"].forEach((id) => {
    assert.doesNotMatch(html, new RegExp(`(?:id|aria-labelledby)="${id}"`));
  });
  assert.doesNotMatch(html, /concept-tray-hamper\.webp|festive-welcome-hamper|customised-hampers\//);
  assert.doesNotMatch(html, /data-category-shortcut="hampers"|value="hampers"/);
  assert.match(html, /See all 89 gifts/);
  assert.match(html, /<option value="1999">Up to ₹2,000<\/option>/);
  assert.match(html, /<option value="2000">₹2,000 and above<\/option>/);
});

test("customizer presents a keyboard-matched basics, preview, advanced, and save/share flow", () => {
  const customizerSection = section("customizer");
  const order = [
    "preview-stage", "frame-template", "colour-theme", "reference-image", "personal-text", "frame-preset",
    "order-from-customizer", "customizer-advanced",
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
  assert.match(customizerSection, /Sends this preview, your choices and size with your request\./);
  assert.match(customizerSection, /Request this design sends the preview, choices and size with your request\./);
  assert.match(customizerSection, /Preview your frame here; Saloni confirms final size, materials, and quote\./);
  const previewPosition = customizerSection.indexOf('class="customizer-preview-panel"');
  const basicsPosition = customizerSection.indexOf('class="customizer-basics-flow"');
  assert.ok(previewPosition >= 0 && previewPosition < basicsPosition, "preview precedes the basic controls in the form");
  const disclosureEnd = customizerSection.lastIndexOf("</details>");
  const designHelpPosition = customizerSection.indexOf('id="customizer-design-help"');
  assert.equal((customizerSection.match(/id="customizer-design-help"/g) || []).length, 1);
  assert.ok(designHelpPosition > disclosureEnd, "design help stays outside the closed designer disclosure");
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
  assert.match(css, /\.customizer-disclosure-row\s*\{[^}]*display:\s*block/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.customizer-layout\s*\{[^}]*display:\s*block/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.customizer-form\s*\{[^}]*display:\s*block/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.customizer-preview-panel\s*\{[^}]*position:\s*sticky/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.customizer-preview \.preview-stage\s*\{[^}]*width:\s*min\(100%, 20dvh, 13rem\)/);
  assert.match(css, /\.customizer-form :is\(input, select, textarea, button, a, summary\)\s*\{[^}]*scroll-margin-block-start/);
  assert.match(css, /\.customizer-form:has\(input\[type="text"\]:focus, input\[type="number"\]:focus, textarea:focus, button:focus, a:focus, summary:focus\)/);
  assert.match(css, /@media \(max-width: 840px\) and \(max-height: 620px\)[\s\S]*?\.customizer-preview-panel\s*\{[^}]*position:\s*static/);
  assert.match(css, /@media \(max-width: 840px\)[\s\S]*?\.customizer-preview-panel\s*\{[^}]*grid-row:\s*auto/);
  const customizerCss = css.slice(css.indexOf(".customizer-layout"), css.indexOf(".order-section"));
  assert.doesNotMatch(customizerCss, /(?:^|[;}])\s*order\s*:/);
});

test("customizer starts compact and opens from the frame-design nav or hash", () => {
  const customizerSection = section("customizer");
  const nav = html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  const disclosureStart = customizerSection.indexOf('<details class="customizer-disclosure" id="customizer-disclosure">');
  const disclosureEnd = customizerSection.indexOf("</details>\n    </section>", disclosureStart);
  const disclosure = customizerSection.slice(disclosureStart, disclosureEnd === -1 ? undefined : disclosureEnd);

  assert.match(nav, /<a href="#customizer"[^>]*>Design a frame/);
  assert.match(disclosure, /<summary>Design a frame<\/summary>/);
  assert.doesNotMatch(disclosure.match(/<details[^>]+id="customizer-disclosure"[^>]*>/)?.[0] || "", /\bopen\b/);
  assert.ok(disclosure.indexOf('class="customizer-layout"') >= 0, "existing editor stays in the disclosure");
  assert.ok(disclosure.indexOf('class="customizer-handoff"') >= 0, "existing handoff stays in the disclosure");
  assert.match(customizerSection, /Choose colours, add a photo or message, and preview your custom frame\./);
  assert.match(css, /\.customizer-disclosure\s*>\s*summary/);
  assert.match(css, /\.customizer-heading h2\s*\{[^}]*max-width:\s*18ch[^}]*font-size:\s*clamp\(2rem, 4\.5vw, 3\.5rem\)/);
  assert.match(script, /customizerDisclosure\.open\s*=\s*true/);
  assert.match(script, /hashchange/);
});

test("request CTA vocabulary is consistent and supports general enquiries", () => {
  assert.match(html, /Request a custom gift/);
  assert.match(script, /button\.textContent = "Request this item"/);
  assert.match(script, /data-order-prefill="general"/);
  assert.match(script, /illustrative preview\|reference image/);
});

test("shopper confidence strip and primary navigation use the approved customer vocabulary", () => {
  const nav = html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  ["Gifts", "Couple keepsakes", "Resin frames", "Design a frame", "Corporate orders", "Order"].forEach((label) => {
    assert.match(nav, new RegExp(`>${label}(?:\\s|<)`));
  });
  assert.equal((nav.match(/<a\b/g) || []).length, 6);
  assert.match(html, /class="hero-trust-strip"/);
  ["Ajmer studio", "Shipping across India", "Handmade to order", "Contact Saloni"].forEach((fact) => assert.match(html, new RegExp(fact)));
  assert.match(html, /<a href="#diwali" data-category-shortcut="diwali">Diwali/);
  assert.doesNotMatch(html, /<a href="#diwali" data-category-shortcut="diwali">Browse Diwali designs/);
  assert.match(html, /<div class="footer-links">[\s\S]*<a href="#studio-art" data-category-shortcut="frames">Resin art<\/a>/);
  assert.doesNotMatch(html, /data-category-shortcut="hampers"|href="#hamper-rail"/);
  assert.match(html, /href="partners\/">Partner Circle<\/a>/);
});

test("lightbox exposes product-aware controls without changing the catalogue source cards", () => {
  const dialog = html.match(/<dialog class="lightbox-dialog"[\s\S]*?<\/dialog>/)?.[0] || "";
  assert.match(dialog, /id="lightbox-previous"/);
  assert.match(dialog, /id="lightbox-next"/);
  assert.match(dialog, /id="lightbox-product-name"/);
  assert.match(dialog, /id="lightbox-product-price"/);
  assert.match(dialog, /id="lightbox-product-size"/);
  assert.match(dialog, /id="lightbox-request"/);
  assert.match(dialog, /id="lightbox-position"/);
  assert.match(script, /ArrowLeft/);
  assert.match(script, /ArrowRight/);
  assert.match(script, /pendingLightboxRequest[\s\S]*requestButton\.click\(\)[\s\S]*focusOrderLocation/);
  assert.match(html, /id="order"[^>]*tabindex="-1"/);
  assert.match(script, /data-lightbox-trigger/);
});

test("lightbox keeps the request action fixed below an independently scrolling figure", () => {
  const dialog = html.match(/<dialog class="lightbox-dialog"[\s\S]*?<\/dialog>/)?.[0] || "";
  const mobileCss = css.match(/@media \(max-width: 620px\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(css, /\.lightbox-panel\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*overflow:\s*hidden/);
  assert.match(css, /\.lightbox-figure\s*\{[^}]*flex:\s*1 1 auto[^}]*min-height:\s*0[^}]*overflow:\s*auto/);
  assert.match(css, /\.lightbox-request\s*\{[^}]*width:\s*100%[^}]*align-self:\s*stretch[^}]*justify-content:\s*center/);
  assert.match(mobileCss, /\.lightbox-request\s*\{[^}]*justify-content:\s*center/);
  assert.match(dialog, /<figure class="lightbox-figure" tabindex="0" aria-label="Scrollable artwork details">/);
});

test("lightbox request focuses the order location after native close", () => {
  const start = script.indexOf("    var lightbox = document.getElementById(\"art-lightbox\")");
  const end = script.indexOf("\n\n    initCatalogueExperience();", start);
  assert.ok(start >= 0 && end > start);
  const makeElement = (extra = {}) => Object.assign({
      hidden: false,
      attributes: {},
      listeners: {},
      addEventListener(type, listener) { this.listeners[type] = listener; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      removeAttribute(name) { delete this.attributes[name]; },
      focus() { this.focused = true; },
    }, extra);
  const order = makeElement();
  const requestButton = makeElement({ clicked: 0, click() { this.clicked += 1; } });
  const title = { textContent: "Sample gift" };
  const image = { alt: "Sample gift photo" };
  const card = makeElement({
    querySelector(selector) {
      if (selector === "figcaption strong") return title;
      if (selector === "[data-order-prefill]") return requestButton;
      return null;
    },
  });
  const trigger = makeElement({
    href: "assets/sample-gift.jpg",
    querySelector(selector) { return selector === "img" ? image : null; },
    closest(selector) { return selector === "article" ? card : null; },
  });
  const lightbox = makeElement({
    showModal() { this.open = true; },
    close() { this.open = false; this.listeners.close(); },
  });
  const imageTarget = makeElement();
  const docElements = {
    "art-lightbox": lightbox,
    "lightbox-image": imageTarget,
    "lightbox-caption": makeElement(),
    "lightbox-product-name": makeElement(),
    "lightbox-product-price": makeElement(),
    "lightbox-product-size": makeElement(),
    "lightbox-image-description": makeElement(),
    "lightbox-previous": makeElement(),
    "lightbox-next": makeElement(),
    "lightbox-position": makeElement(),
    "lightbox-request": makeElement(),
    order,
  };
  const documentObject = {
    getElementById(id) { return docElements[id] || null; },
    querySelectorAll(selector) { return selector === "[data-lightbox-trigger]" ? [trigger] : []; },
  };
  const windowObject = { setTimeout(callback) { callback(); } };
  vm.runInNewContext(`(function () { ${script.slice(start, end)} })();`, { document: documentObject, window: windowObject });
  trigger.listeners.click({ defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault() {} });
  docElements["lightbox-request"].listeners.click();
  assert.equal(requestButton.clicked, 1);
  assert.equal(order.focused, true);
  assert.equal(trigger.focused, undefined);
});

test("catalogue card body opens its existing preview while native link focus stays independent", () => {
  const start = script.indexOf("    var lightbox = document.getElementById(\"art-lightbox\")");
  const end = script.indexOf("\n\n    initCatalogueExperience();", start);
  const makeElement = (extra = {}) => Object.assign({
    hidden: false,
    attributes: {},
    listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    getAttribute(name) { return this.attributes[name] || ""; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    focus() { this.focused = true; },
  }, extra);
  const title = { textContent: "Sample gift" };
  const paragraph = { textContent: "A sample gift description." };
  const image = { alt: "Sample gift photo" };
  const orderButton = makeElement({ closest(selector) { return selector.indexOf("button") !== -1 ? this : null; } });
  const priceRow = makeElement({ querySelector(selector) {
    if (selector === "dt") return { textContent: "Price" };
    if (selector === "dd") return { textContent: "₹349" };
    return null;
  } });
  const card = makeElement({ querySelector(selector) {
    if (selector === "figcaption strong") return title;
    if (selector === "[data-order-prefill]") return orderButton;
    return null;
  }, querySelectorAll(selector) {
    if (selector === ".product-pricing > div") return [priceRow];
    if (selector === "figcaption p") return [paragraph];
    return [];
  } });
  const grid = makeElement({ querySelectorAll() { return [trigger]; } });
  const trigger = makeElement({ href: "assets/sample-gift.jpg", querySelector(selector) { return selector === "img" ? image : null; }, closest(selector) {
    if (selector === "article") return card;
    if (selector === ".catalogue-grid") return grid;
    return null;
  } });
  const lightbox = makeElement({ showModal() { this.open = true; }, close() { this.open = false; this.listeners.close(); } });
  const imageTarget = makeElement();
  const docElements = {
    "art-lightbox": lightbox,
    "lightbox-image": imageTarget,
    "lightbox-caption": makeElement(),
    "lightbox-product-name": makeElement(),
    "lightbox-product-price": makeElement(),
    "lightbox-product-size": makeElement(),
    "lightbox-image-description": makeElement(),
    "lightbox-previous": makeElement(),
    "lightbox-next": makeElement(),
    "lightbox-position": makeElement(),
    "lightbox-request": makeElement(),
  };
  const documentObject = {
    getElementById(id) { return docElements[id] || null; },
    querySelectorAll(selector) { return selector === "[data-lightbox-trigger]" ? [trigger] : []; },
  };
  vm.runInNewContext(`(function () { ${script.slice(start, end)} })();`, { document: documentObject, window: {} });
  assert.equal(card.getAttribute("tabindex"), "");
  assert.equal(typeof card.listeners.click, "function");
  assert.equal(card.listeners.keydown, undefined);
  const bodyTarget = makeElement();
  card.listeners.click({ target: bodyTarget, defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault() {} });
  assert.equal(lightbox.open, true);
  assert.equal(docElements["lightbox-product-name"].textContent, "Sample gift");
  lightbox.close();
  assert.equal(trigger.focused, true);
  const orderEvent = { target: orderButton, defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault() { this.defaultPrevented = true; } };
  card.listeners.click(orderEvent);
  assert.equal(lightbox.open, false);
  assert.equal(orderEvent.defaultPrevented, false);
  assert.match(css, /\.catalogue-ready \.catalogue-grid[^\{]*\{[^}]*cursor:\s*pointer/);
});

test("hero lightbox targets the hidden canonical card and restores focus to the hero opener", () => {
  const start = script.indexOf("    var lightbox = document.getElementById(\"art-lightbox\")");
  const end = script.indexOf("\n\n    initCatalogueExperience();", start);
  const makeElement = (extra = {}) => Object.assign({
    hidden: false,
    attributes: {},
    listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    getAttribute(name) { return this.attributes[name] || ""; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    focus() { this.focused = true; },
  }, extra);
  const heroImage = makeElement({ alt: "Coquette heart trinket tray in soft resin" });
  const canonicalImage = makeElement({ alt: "Illustrative preview: Coquette heart trinket tray in soft resin" });
  const priceRow = makeElement({ querySelector(selector) {
    if (selector === "dt") return { textContent: "From" };
    if (selector === "dd") return { textContent: "₹349" };
    return null;
  } });
  const sizeRow = makeElement({ querySelector(selector) {
    if (selector === "dt") return { textContent: "Size" };
    if (selector === "dd") return { textContent: "4 in" };
    return null;
  } });
  const orderButton = makeElement();
  const title = { textContent: "Tiny tray, big feelings" };
  const paragraph = { textContent: "A soft place for rings, earbuds, and the little things you share." };
  const canonicalTrigger = makeElement({ href: "assets/romantic-heart-trinket-tray.webp", querySelector(selector) { return selector === "img" ? canonicalImage : null; } });
  const canonicalCard = makeElement({ hidden: true, querySelector(selector) {
    if (selector === "[data-lightbox-trigger]") return canonicalTrigger;
    if (selector === "figcaption strong") return title;
    if (selector === "[data-order-prefill]") return orderButton;
    return null;
  }, querySelectorAll(selector) {
    if (selector === ".product-pricing > div") return [priceRow, sizeRow];
    if (selector === "figcaption p") return [paragraph];
    return [];
  } });
  canonicalTrigger.closest = (selector) => selector === "article" ? canonicalCard : null;
  const heroTrigger = makeElement({ href: "assets/romantic-heart-trinket-tray.webp", attributes: { "data-lightbox-target": "romantic-trinket" }, querySelector(selector) { return selector === "img" ? heroImage : null; } });
  const lightbox = makeElement({ showModal() { this.open = true; }, close() { this.open = false; this.listeners.close(); } });
  const imageTarget = makeElement();
  const docElements = {
    "art-lightbox": lightbox,
    "lightbox-image": imageTarget,
    "lightbox-caption": makeElement(),
    "lightbox-product-name": makeElement(),
    "lightbox-product-price": makeElement(),
    "lightbox-product-size": makeElement(),
    "lightbox-image-description": makeElement(),
    "lightbox-previous": makeElement(),
    "lightbox-next": makeElement(),
    "lightbox-position": makeElement(),
    "lightbox-request": makeElement(),
    "romantic-trinket": canonicalCard,
  };
  const documentObject = {
    getElementById(id) { return docElements[id] || null; },
    querySelectorAll(selector) { return selector === "[data-lightbox-trigger]" ? [heroTrigger] : []; },
  };
  vm.runInNewContext(`(function () { ${script.slice(start, end)} })();`, { document: documentObject, window: {} });
  heroTrigger.listeners.click({ defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault() {} });
  assert.equal(imageTarget.src, "assets/romantic-heart-trinket-tray.webp");
  assert.equal(docElements["lightbox-product-name"].textContent, "Tiny tray, big feelings");
  assert.equal(docElements["lightbox-product-price"].textContent, "From: ₹349");
  assert.equal(docElements["lightbox-product-size"].textContent, "Size: 4 in");
  assert.match(docElements["lightbox-image-description"].textContent, /A soft place for rings/);
  lightbox.close();
  assert.equal(heroTrigger.focused, true);
});

test("privacy details keep the full retention and correction wording below both forms", () => {
  const order = html.match(/<section[^>]+class="order-section shell"[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(order, /class="order-privacy-note"[^>]*>Your information is used only to handle your request\./);
  assert.match(order, /<details[^>]+id="privacy-details"[\s\S]*?90 days[\s\S]*?correction or deletion/);
  const form = fs.readFileSync(path.join(root, "apps-script", "Form.html"), "utf8");
  assert.match(form, /<details[^>]+id="privacy-details"[\s\S]*?90 days[\s\S]*?correction or deletion/);
});

test("order section keeps compact row and bottom spacing without changing its column gap", () => {
  const orderRule = css.match(/(?:^|\n)\.order-section\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(orderRule, /column-gap:\s*clamp\(2rem,\s*8vw,\s*8rem\)/);
  assert.match(orderRule, /row-gap:\s*2rem/);
  assert.match(orderRule, /padding-block:\s*clamp\(5rem,\s*11vw,\s*10rem\)\s+clamp\(2rem,\s*5vw,\s*4rem\)/);
  assert.doesNotMatch(orderRule, /(?:^|[; ])gap:\s*clamp/);
  const pricingNoteRule = css.match(/\.order-size-pricing-note\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(pricingNoteRule, /margin:\s*0/);
  const mobileOrderRule = css.match(/@media \(max-width: 620px\) \{[\s\S]*?\.order-section\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(mobileOrderRule, /padding-block:\s*4\.5rem 3rem/);
});

test("sticky header offset and contained lightbox controls remain reachable", () => {
  assert.match(css, /scroll-padding-top:\s*var\(--sticky-offset\)/);
  assert.match(css, /scroll-margin-top:\s*var\(--sticky-offset\)/);
  assert.match(css, /\.lightbox-panel[\s\S]*overflow:\s*auto/);
  assert.match(css, /\.lightbox-image\s*\{[^}]*background:\s*var\(--ivory\)/);
  assert.match(css, /\.lightbox-nav-button\s*\{[^}]*min-height:\s*44px/);
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

test("all 89 catalogue cards keep price first and show only known size rows", () => {
  const expectedRows = [
    ["Size", "4 in"],
    ["Size", "4–6 in"],
    ["Size", "4–6 in"],
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
    ["Size", "3 in each"],
    null,
    ["Size", "3 in each"],
    ["Size", "20×22 in"],
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ];
  const cards = html.match(/<article\b[^>]*class="[^"]*(?:work-card|romantic-keepsake-card)[^"]*"[\s\S]*?<\/article>/g) || [];
  assert.equal(cards.length, 89);
  assert.equal(expectedRows.length, 89);
  cards.forEach((card, index) => {
    const pricing = card.match(/<dl class="product-pricing"[\s\S]*?<\/dl>/)?.[0] || "";
    const rows = [...pricing.matchAll(/<div><dt>([^<]+)<\/dt><dd>([^<]+)<\/dd><\/div>/g)].map((match) => match.slice(1));
    assert.equal(pricing.match(/aria-label="([^"]+)"/)?.[1], "Catalogue price and size");
    assert.ok(rows.length === 1 || rows.length === 2, `card ${index + 1} has price and optional size rows`);
    assert.match(rows[0][0], /^(?:Price|From)$/);
    assert.match(rows[0][1], /^(?:₹|Starting at ₹|Price on request)/);
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
  assert.equal(cardFor("Festive Welcome Hamper"), "");
  assert.deepEqual(rowsFor("Ivory Mandala Holder").slice(1), [["Size", "3 in"]]);
  assert.deepEqual(rowsFor("Pearl Rangoli Accent").slice(1), [["Size", "3–4 in"]]);
  assert.deepEqual(rowsFor("Rose Petal Offering Plate").slice(1), [["Size", "4–5 in"]]);
});

test("studio edit leads directly into the order conversation", () => {
  const studioStart = html.indexOf('<section class="intro-band shell reveal" id="offerings"');
  const orderStart = html.indexOf('<section class="order-section shell" id="order"');
  assert.ok(studioStart >= 0, "expected #offerings section");
  assert.ok(orderStart >= 0, "expected #order section");
  const studioEnd = html.indexOf("</section>", studioStart) + "</section>".length;
  assert.ok(studioEnd < orderStart, "#offerings must come before #order");
  assert.equal(html.slice(studioEnd, orderStart).trim(), "", "#offerings must be immediately before #order");
});
