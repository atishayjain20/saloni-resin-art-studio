const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("festive banner is removed while the Diwali collection remains available", () => {
  assert.doesNotMatch(html, /class="festive-banner/);
  assert.doesNotMatch(html, /<a href="#diwali"(?: data-category-shortcut="diwali")?>Browse Diwali designs/);
  assert.match(html, /<section[^>]+id="diwali"[\s\S]*?class="work-card/, "the Diwali collection still lists products");
  assert.doesNotMatch(html, /<a href="#diwali" data-category-shortcut="diwali">Diwali/);
  assert.doesNotMatch(html, /id="festive-offers(?:-fallback)?"/);
  assert.doesNotMatch(html, /<dialog[^>]+festive-offers|special discounts/);
  // The order form has its own unrelated openDialog option, so only the festive pop-up's names are checked.
  assert.doesNotMatch(script, /initFestiveOffers|festive-offers|festiveDialog/);
  assert.doesNotMatch(css, /festive-dialog|festive-noscript/);
});
