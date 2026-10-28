const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const start = script.indexOf("  function initCatalogueExperience()");
const end = script.indexOf("\n  function initOrderRequestFlow()", start);
const catalogueFunction = script.slice(start, end);

class FakeControl {
  constructor(value = "") { this.value = value; this.listeners = {}; this.disabled = false; this.attributes = {}; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  dispatch(type) {
    if (!this.listeners[type]) return;
    const event = { target: this, preventDefault() { this.defaultPrevented = true; } };
    this.listeners[type](event);
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || ""; }
  removeAttribute(name) { delete this.attributes[name]; }
  focus() { this.focused = true; }
}

class FakeSection {
  constructor(id) {
    this.id = id;
    this.hidden = false;
    this.cards = [];
    this.disclosure = new FakeControl("");
    this.disclosure.hidden = false;
  }
  querySelector(selector) {
    if (selector === ".work-card, .romantic-keepsake-card") return this.cards[0] || null;
    return selector === "[data-catalogue-disclosure]" ? this.disclosure : null;
  }
}

class FakeCard {
  constructor(section, price, id, featured = false, eventLog = []) {
    this.section = section;
    this.price = price;
    this.id = id;
    this.hidden = false;
    this.attributes = featured ? { "data-featured": "true" } : {};
    this.events = [];
    this.eventLog = eventLog;
    section.cards.push(this);
  }
  closest(selector) { return selector === "section" ? this.section : null; }
  querySelector(selector) { return selector === ".product-pricing dd" ? { textContent: this.price } : null; }
  getAttribute(name) { return this.attributes[name] || ""; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  matches(selector) { return selector === "article"; }
  scrollIntoView() { this.events.push("scroll"); this.eventLog.push("scroll"); }
}

class FakeLink extends FakeControl {
  constructor(href, value = "") { super(value); this.href = href; }
  getAttribute(name) { return name === "href" ? this.href : name === "data-category-shortcut" ? this.value : super.getAttribute(name); }
}

function createHarness({ hash = "", count = 77 } = {}) {
  const eventLog = [];
  const sections = [
    new FakeSection("diwali"),
    new FakeSection("romantic-keepsakes"),
    new FakeSection("corporate-resin-gifts"),
    new FakeSection("studio-art"),
    new FakeSection("hamper-rail"),
  ];
  const sectionForIndex = (index) => index < 24
    ? sections[0]
    : index < 38
      ? sections[1]
      : index < 58
        ? sections[2]
        : index < 74
          ? sections[3]
          : sections[4];
  const cards = Array.from({ length: count }, (_, index) => {
    const section = sectionForIndex(index);
    const price = index % 5 === 0
      ? "₹2,499"
      : section.id === "corporate-resin-gifts"
        ? `₹${499 + (index % 3) * 100}`
        : `₹${149 + index * 25}`;
    return new FakeCard(section, price, `product-${index + 1}`, index < 8, eventLog);
  });
  const tools = {};
  const typeFilter = new FakeControl("all");
  const priceFilter = new FakeControl("all");
  const resetButton = new FakeControl("");
  const emptyReset = new FakeControl("");
  const status = { textContent: "" };
  const empty = { hidden: true };
  const pagePrevious = new FakeControl("");
  const pageNext = new FakeControl("");
  const pageStatus = { textContent: "" };
  const pagination = { hidden: false };
  const heading = new FakeControl("");
  heading.events = [];
  heading.scrollIntoView = () => heading.events.push("scroll");
  heading.focus = () => heading.events.push("focus");
  const browseFilters = new FakeLink("#catalogue-filters");
  const browseAll = new FakeLink("#catalogue-filters");
  const corporateShortcut = new FakeLink("#corporate-resin-gifts", "corporate");
  const elements = new Map([
    ["catalogue-filters", tools],
    ["catalogue-type-filter", typeFilter],
    ["catalogue-price-filter", priceFilter],
    ["catalogue-filter-reset", resetButton],
    ["catalogue-empty-reset", emptyReset],
    ["catalogue-filter-status", status],
    ["catalogue-filter-empty", empty],
    ["catalogue-page-previous", pagePrevious],
    ["catalogue-page-next", pageNext],
    ["catalogue-page-status", pageStatus],
    ["catalogue-pagination", pagination],
    ["catalogue-filters-title", heading],
  ]);
  cards.forEach((card) => elements.set(card.id, card));
  sections.forEach((section) => elements.set(section.id, section));
  const documentObject = {
    documentElement: { classList: { add() {} } },
    getElementById(id) { return elements.get(id) || null; },
    querySelectorAll(selector) {
      if (selector === ".work-card, .romantic-keepsake-card") return cards;
      if (selector === "[data-browse-filters]") return [browseFilters];
      if (selector === "[data-browse-all]") return [browseAll];
      if (selector === "[data-category-shortcut]") return [corporateShortcut];
      return [];
    },
  };
  const windowObject = {
    location: { hash },
    history: { pushState(_state, _title, next) { windowObject.location.hash = next; } },
    listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
  };
  const context = { document: documentObject, window: windowObject };
  vm.createContext(context);
  vm.runInContext(`${catalogueFunction}\ninitCatalogueExperience();`, context, { filename: "script.js" });
  return { cards, sections, typeFilter, priceFilter, resetButton, emptyReset, status, empty, pagePrevious, pageNext, pageStatus, pagination, heading, browseFilters, browseAll, corporateShortcut, windowObject, eventLog };
}

function visibleCards(harness) { return harness.cards.filter((card) => !card.hidden); }

test("initial state shows four-card previews per section", () => {
  const harness = createHarness();
  assert.equal(visibleCards(harness).length, 19);
  harness.sections.forEach((section) => {
    assert.equal(section.cards.filter((card) => !card.hidden).length, Math.min(4, section.cards.length));
    assert.equal(section.disclosure.hidden, section.cards.length <= 4);
    assert.equal(section.disclosure.getAttribute("aria-expanded"), "false");
  });
  assert.equal(harness.pagePrevious.disabled, true);
  assert.equal(harness.pageNext.disabled, true);
  assert.equal(harness.pagination.hidden, true);
  assert.match(harness.status.textContent, /section previews/);
});

test("each section disclosure expands only its own cards and collapses on reset", () => {
  const harness = createHarness();
  const target = harness.sections[1];
  target.disclosure.dispatch("click");
  assert.equal(target.disclosure.getAttribute("aria-expanded"), "true");
  assert.equal(target.cards.filter((card) => !card.hidden).length, target.cards.length);
  harness.sections.filter((section) => section !== target).forEach((section) => {
    assert.equal(section.cards.filter((card) => !card.hidden).length, Math.min(4, section.cards.length));
  });
  target.disclosure.dispatch("click");
  assert.equal(target.disclosure.getAttribute("aria-expanded"), "false");
  assert.equal(target.cards.filter((card) => !card.hidden).length, 4);
  harness.browseAll.dispatch("click");
  assert.ok(harness.sections.every((section) => section.disclosure.hidden));
  harness.resetButton.dispatch("click");
  assert.equal(target.disclosure.getAttribute("aria-expanded"), "false");
  assert.equal(target.cards.filter((card) => !card.hidden).length, 4);
});

test("explicit full catalogue pages contain at most eight and traverse every item once", () => {
  const harness = createHarness();
  harness.browseAll.dispatch("click");
  assert.equal(harness.pagination.hidden, false);
  const seen = [];
  while (true) {
    const current = visibleCards(harness).map((card) => card.id);
    assert.ok(current.length <= 8);
    seen.push(...current);
    if (harness.pageNext.disabled) break;
    harness.pageNext.dispatch("click");
  }
  assert.equal(seen.length, 77);
  assert.equal(new Set(seen).size, 77);
  assert.equal(visibleCards(harness).length, 5);
  assert.match(harness.status.textContent, /Showing 73–77 of 77 gifts · Page 10 of 10\./);
});

test("filters use AND logic and reset pagination to page one", () => {
  const harness = createHarness();
  harness.browseAll.dispatch("click");
  harness.pageNext.dispatch("click");
  assert.match(harness.status.textContent, /Page 2/);
  harness.typeFilter.value = "corporate";
  harness.priceFilter.value = "999";
  harness.typeFilter.dispatch("change");
  assert.equal(harness.pagePrevious.disabled, true);
  assert.match(harness.status.textContent, /Page 1/);
  assert.ok(visibleCards(harness).every((card) => card.getAttribute("data-product-type") === "corporate"));
  harness.priceFilter.dispatch("change");
  assert.equal(harness.pagePrevious.disabled, true);
  assert.match(harness.status.textContent, /Page 1/);
});

test("paging replaces cards and returns focus to the catalogue heading", () => {
  const harness = createHarness();
  harness.browseAll.dispatch("click");
  const firstPage = visibleCards(harness).map((card) => card.id);
  harness.pageNext.dispatch("click");
  assert.notDeepEqual(visibleCards(harness).map((card) => card.id), firstPage);
  assert.deepEqual(harness.heading.events, ["scroll", "focus"]);
});

test("back to featured picks hides pagination again", () => {
  const harness = createHarness();
  harness.browseAll.dispatch("click");
  assert.equal(harness.pagination.hidden, false);
  harness.resetButton.dispatch("click");
  assert.equal(harness.pagination.hidden, true);
});

test("empty results recover to unfiltered page one", () => {
  const harness = createHarness();
  harness.typeFilter.value = "not-a-real-type";
  harness.typeFilter.dispatch("change");
  assert.equal(harness.empty.hidden, false);
  assert.equal(visibleCards(harness).length, 0);
  harness.emptyReset.dispatch("click");
  assert.equal(harness.empty.hidden, true);
  assert.equal(harness.typeFilter.value, "all");
  assert.equal(visibleCards(harness).length, 8);
  assert.match(harness.status.textContent, /Page 1 of 10/);
});

test("Corporate shortcut selects corporate page one", () => {
  const harness = createHarness();
  harness.corporateShortcut.dispatch("click");
  assert.equal(harness.typeFilter.value, "corporate");
  assert.equal(harness.pagePrevious.disabled, true);
  assert.ok(visibleCards(harness).every((card) => card.getAttribute("data-product-type") === "corporate"));
});

test("hero browse-by-filter CTA preserves the current catalogue state", () => {
  const harness = createHarness();
  harness.browseAll.dispatch("click");
  harness.typeFilter.value = "corporate";
  harness.typeFilter.dispatch("change");
  harness.pageNext.dispatch("click");
  const before = visibleCards(harness).map((card) => card.id);
  const state = [harness.typeFilter.value, harness.priceFilter.value, harness.pageStatus.textContent, harness.status.textContent];
  harness.browseFilters.dispatch("click");
  assert.deepEqual(visibleCards(harness).map((card) => card.id), before);
  assert.deepEqual([harness.typeFilter.value, harness.priceFilter.value, harness.pageStatus.textContent, harness.status.textContent], state);
});

test("product and section hashes select bounded page one or the product page", () => {
  const initial = createHarness({ hash: "#product-25" });
  assert.equal(initial.cards[24].hidden, false);
  assert.match(initial.status.textContent, /Page 4/);
  assert.ok(visibleCards(initial).length <= 8);

  const later = createHarness();
  later.windowObject.location.hash = "#corporate-resin-gifts";
  later.windowObject.listeners.hashchange();
  assert.equal(later.typeFilter.value, "corporate");
  assert.equal(later.pagePrevious.disabled, true);
  assert.ok(visibleCards(later).every((card) => card.getAttribute("data-product-type") === "corporate"));
});
