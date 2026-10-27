const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("festive discovery stays inline and does not interrupt page load", () => {
  assert.match(html, /<a href="#diwali">Festive offers<\/a>/);
  assert.match(html, /class="festive-banner[^"]*"[\s\S]*href="#diwali"/);
  assert.match(html, /id="festive-offers"[\s\S]*id="festive-offers-fallback"/);
  assert.doesNotMatch(html, /<dialog[^>]+festive-offers|special discounts/);
  assert.doesNotMatch(script, /initFestiveOffers|openDialog/);
  assert.doesNotMatch(css, /festive-dialog|festive-noscript/);
});
