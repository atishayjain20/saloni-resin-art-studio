const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const customizer = fs.readFileSync(path.join(root, "customizer.js"), "utf8");

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
  assert.match(hero, /Browse gifts/);
  assert.doesNotMatch(hero, /hero-floral-bouquet\.jpg/);
});

test("catalogue enhancement has accessible filters, featured mode, and a no-result reset", () => {
  assert.match(html, /id="catalogue-filters"/);
  assert.match(html, /id="catalogue-type-filter"/);
  assert.match(html, /id="catalogue-price-filter"/);
  assert.match(html, /id="catalogue-filter-reset"/);
  assert.match(html, /id="catalogue-filter-empty"/);
  assert.match(html, /data-featured="true"/);
  assert.match(html, /Browse all gifts/);
  assert.match(script, /initCatalogueExperience/);
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

test("customizer presents basics first, optional advanced controls, and truthful request copy", () => {
  assert.match(html, /id="customizer-advanced"/);
  assert.match(html, /id="frame-template"[\s\S]*id="colour-theme"/);
  assert.match(html, /id="personal-text"[\s\S]*id="reference-image"[\s\S]*id="frame-preset"/);
  assert.match(html, /<summary>Advanced options<\/summary>[\s\S]*id="image-layout-controls"[\s\S]*id="paint-toggle"/);
  assert.match(html, /Let Saloni design it for me/);
  assert.match(html, /Request this design/);
  assert.doesNotMatch(html, /Start an order from this design/);
  assert.match(customizer, /data-template|template/);
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.customizer-form \{ display: contents; \}[\s\S]*?\.customizer-preview-panel \{ order: 4; \}/);
});

test("request CTA vocabulary is consistent and supports general enquiries", () => {
  assert.match(html, /Request a custom gift/);
  assert.match(script, /button\.textContent = "Request this item"/);
  assert.match(script, /data-order-prefill="general"/);
});
