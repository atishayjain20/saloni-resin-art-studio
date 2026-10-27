const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const start = script.indexOf("  function refreshCatalogueCarousels(resetScroll)");
const end = script.indexOf("\n  function initOrderRequestFlow()", start);
const catalogueFunction = script.slice(start, end);

class FakeControl {
  constructor(value) { this.value = value; this.listeners = {}; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  dispatch(type) { if (this.listeners[type]) this.listeners[type]({ target: this }); }
}

class FakeCard {
  constructor(section, price, featured = false) {
    this.section = section;
    this.price = price;
    this.hidden = false;
    this.attributes = featured ? { "data-featured": "true" } : {};
  }
  closest(selector) { return selector === "section" ? this.section : null; }
  querySelector(selector) { return selector === ".product-pricing dd" ? { textContent: this.price } : null; }
  getAttribute(name) { return this.attributes[name] || ""; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
}

test("a filtered Up to ₹999 studio-art result resets and refreshes its carousel", () => {
  const tools = {};
  const typeFilter = new FakeControl("all");
  const priceFilter = new FakeControl("all");
  const resetButton = new FakeControl("");
  const emptyReset = new FakeControl("");
  const status = { textContent: "" };
  const empty = { hidden: true };
  const section = { id: "studio-art", hidden: false };
  const featured = new FakeCard(section, "₹349", true);
  const secondPiece = new FakeCard(section, "₹899");
  const carousel = { refreshes: [], refreshControls(reset) { this.refreshes.push(reset); } };
  const elements = new Map([
    ["catalogue-filters", tools],
    ["catalogue-type-filter", typeFilter],
    ["catalogue-price-filter", priceFilter],
    ["catalogue-filter-reset", resetButton],
    ["catalogue-empty-reset", emptyReset],
    ["catalogue-filter-status", status],
    ["catalogue-filter-empty", empty],
  ]);
  const documentObject = {
    documentElement: { classList: { add() {} } },
    getElementById(id) { return elements.get(id) || null; },
    querySelectorAll(selector) {
      if (selector === ".work-card, .romantic-keepsake-card") return [featured, secondPiece];
      if (selector === "[data-carousel]") return [carousel];
      return [];
    },
  };
  const context = {
    document: documentObject,
    window: { location: { hash: "" }, addEventListener() {} },
  };
  vm.createContext(context);
  vm.runInContext(`${catalogueFunction}\ninitCatalogueExperience();`, context, { filename: "script.js" });

  assert.equal(featured.hidden, false);
  assert.equal(secondPiece.hidden, true);
  priceFilter.value = "999";
  priceFilter.dispatch("change");
  assert.equal(featured.hidden, false);
  assert.equal(secondPiece.hidden, false);
  assert.equal(carousel.refreshes.at(-1), true);

  resetButton.dispatch("click");
  assert.equal(featured.hidden, false);
  assert.equal(secondPiece.hidden, true);
  assert.equal(carousel.refreshes.at(-1), true);
});

test("a later corporate product hash shows the card before scrolling to it", () => {
  const tools = {};
  const typeFilter = new FakeControl("all");
  const priceFilter = new FakeControl("all");
  const resetButton = new FakeControl("");
  const emptyReset = new FakeControl("");
  const status = { textContent: "" };
  const empty = { hidden: true };
  const section = { id: "corporate-resin-gifts", hidden: false };
  const target = new FakeCard(section, "₹1,499");
  const events = [];
  target.id = "corporate-desk-essentials-set";
  target.matches = (selector) => selector === "article";
  target.scrollIntoView = () => events.push("scroll");
  const carousel = { refreshControls(reset) { if (reset) events.push("refresh"); } };
  const elements = new Map([
    ["catalogue-filters", tools],
    ["catalogue-type-filter", typeFilter],
    ["catalogue-price-filter", priceFilter],
    ["catalogue-filter-reset", resetButton],
    ["catalogue-empty-reset", emptyReset],
    ["catalogue-filter-status", status],
    ["catalogue-filter-empty", empty],
    [target.id, target],
  ]);
  const windowObject = { location: { hash: "" }, addEventListener(type, listener) { if (type === "hashchange") this.hashchange = listener; } };
  const documentObject = {
    documentElement: { classList: { add() {} } },
    getElementById(id) { return elements.get(id) || null; },
    querySelectorAll(selector) {
      if (selector === ".work-card, .romantic-keepsake-card") return [target];
      if (selector === "[data-carousel]") return [carousel];
      return [];
    },
  };
  const context = { document: documentObject, window: windowObject };
  vm.createContext(context);
  vm.runInContext(`${catalogueFunction}\ninitCatalogueExperience();`, context, { filename: "script.js" });
  events.length = 0;
  windowObject.location.hash = "#corporate-desk-essentials-set";
  windowObject.hashchange();

  assert.equal(target.hidden, false);
  assert.deepEqual(events, ["refresh", "scroll"]);
});
