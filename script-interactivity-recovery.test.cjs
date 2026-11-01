const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "script.js"), "utf8");
const page = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("the storefront script parses and owns catalogue cart controls", () => {
  assert.doesNotThrow(() => new vm.Script(source, { filename: "script.js" }));
  assert.match(source, /button\.textContent = "Add to cart"/);
  assert.match(source, /catalogueCartView\.addEventListener\("click"/);
  assert.match(source, /catalogueCartOrder\.addEventListener\("click"/);
});

test("the cart exposes separate View cart and Order now actions", () => {
  assert.match(page, /id="catalogue-cart-view"[^>]*>View cart<\/button>/);
  assert.match(page, /id="catalogue-cart-order"[^>]*>Order now<\/button>/);
});
