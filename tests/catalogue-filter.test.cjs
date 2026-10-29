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
  scrollIntoView(options) { this.scrolledIntoView = options; }
}

class FakeContainer {
  constructor(id) { this.id = id; this.children = []; }
  appendChild(child) {
    if (child.parentNode && child.parentNode.children) {
      child.parentNode.children = child.parentNode.children.filter((current) => current !== child);
    }
    this.children.push(child);
    child.parentNode = this;
    return child;
  }
}

class FakeSection {
  constructor(id) {
    this.id = id;
    this.attributes = { "aria-labelledby": `${id}-title` };
    this.hidden = false;
    this.cards = [];
    this.children = [];
    this.disclosure = new FakeControl("");
    this.disclosure.hidden = false;
  }
  appendChild(child) {
    if (child.parentNode && child.parentNode.children) {
      child.parentNode.children = child.parentNode.children.filter((current) => current !== child);
    }
    this.children.push(child);
    child.parentNode = this;
    return child;
  }
  getAttribute(name) { return this.attributes[name] || ""; }
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

function createHarness({ hash = "", url = "", count = 77, includePremium = false, realCatalogue = false } = {}) {
  const eventLog = [];
  const sections = [
    new FakeSection("diwali"),
    new FakeSection("romantic-keepsakes"),
    new FakeSection("corporate-resin-gifts"),
    new FakeSection("studio-art"),
  ];
  if (realCatalogue) sections.push(new FakeSection("premium-collection"));
  else if (includePremium) {
    sections.push(new FakeSection("premium-collection"));
    sections.push(new FakeSection("hamper-rail"));
  } else sections.push(new FakeSection("hamper-rail"));
  const sectionForIndex = (index) => realCatalogue
    ? index < 23
      ? sections[0]
      : index < 36
        ? sections[1]
        : index < 55
          ? sections[2]
          : index < 75
            ? sections[3]
            : sections[4]
    : index < 24
      ? sections[0]
      : index < 38
        ? sections[1]
          : index < 58
            ? sections[2]
              : index < 74
                ? sections[3]
                : includePremium && index < 88
                  ? sections[4]
                  : includePremium ? sections[5] : sections[4];
  const cards = Array.from({ length: count }, (_, index) => {
    const section = sectionForIndex(index);
    const premiumPrice = ["₹20,000–₹25,000", "₹20,000–₹25,000", "₹15,000", "₹10,000–₹12,000", "Price on request", "Price on request", "Price on request", "Price on request", "Price on request", "₹5,000", "Price on request", "Price on request", "Price on request", "₹10,000–₹12,000"][index - (realCatalogue ? 75 : 74)];
    const price = section.id === "premium-collection"
      ? premiumPrice
      : index % 5 === 0
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
  const enhancement = new FakeContainer("catalogue-enhancement");
  const results = new FakeContainer("catalogue-results");
  enhancement.appendChild(results);
  results.appendChild(status);
  results.appendChild(pagination);
  const heading = new FakeControl("");
  heading.events = [];
  heading.scrollIntoView = () => heading.events.push("scroll");
  heading.focus = () => heading.events.push("focus");
  const browseFilters = new FakeLink("#catalogue-filters");
  const browseAll = new FakeLink("#catalogue-filters");
  const diwaliShortcut = new FakeLink("#diwali", "diwali");
  const corporateShortcut = new FakeLink("#corporate-resin-gifts", "corporate");
  const premiumShortcut = new FakeLink("#premium-collection", "premium");
  const elements = new Map([
    ["catalogue-filters", tools],
    ["catalogue-type-filter", typeFilter],
    ["catalogue-price-filter", priceFilter],
    ["catalogue-filter-reset", resetButton],
    ["catalogue-empty-reset", emptyReset],
    ["catalogue-filter-status", status],
    ["catalogue-filter-empty", empty],
    ["catalogue-results", results],
    ["catalogue-page-previous", pagePrevious],
    ["catalogue-page-next", pageNext],
    ["catalogue-page-status", pageStatus],
    ["catalogue-pagination", pagination],
    ["catalogue-filters-title", heading],
  ]);
  cards.forEach((card) => elements.set(card.id, card));
  sections.forEach((section) => elements.set(section.id, section));
  const sectionHeadings = sections.map((section) => {
    const sectionHeading = new FakeControl("");
    sectionHeading.events = [];
    sectionHeading.scrollIntoView = () => sectionHeading.events.push("scroll");
    sectionHeading.focus = () => sectionHeading.events.push("focus");
    elements.set(`${section.id}-title`, sectionHeading);
    return sectionHeading;
  });
  const documentObject = {
    documentElement: { classList: { add() {} } },
    getElementById(id) { return elements.get(id) || null; },
    querySelectorAll(selector) {
      if (selector === ".work-card, .romantic-keepsake-card") return cards;
      if (selector === "[data-browse-filters]") return [browseFilters];
      if (selector === "[data-browse-all]") return [browseAll];
      if (selector === "[data-category-shortcut]") return includePremium ? [diwaliShortcut, corporateShortcut, premiumShortcut] : [diwaliShortcut, corporateShortcut];
      return [];
    },
  };
  const initialUrl = new URL(url || `https://example.test/${hash ? hash : ""}`);
  const location = {
    pathname: initialUrl.pathname,
    search: initialUrl.search,
    hash: initialUrl.hash,
    href: initialUrl.href,
  };
  const setLocation = (next) => {
    const parsed = new URL(next, location.href);
    location.pathname = parsed.pathname;
    location.search = parsed.search;
    location.hash = parsed.hash;
    location.href = parsed.href;
  };
  const windowObject = {
    location,
    history: {
      pushes: [],
      replacements: [],
      pushState(_state, _title, next) { this.pushes.push(String(next)); setLocation(next); },
      replaceState(_state, _title, next) { this.replacements.push(String(next)); setLocation(next); },
    },
    listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
  };
  const context = { document: documentObject, window: windowObject, URL, URLSearchParams };
  vm.createContext(context);
  vm.runInContext(`${catalogueFunction}\ninitCatalogueExperience();`, context, { filename: "script.js" });
  return { cards, sections, typeFilter, priceFilter, resetButton, emptyReset, status, empty, pagePrevious, pageNext, pageStatus, pagination, results, enhancement, sectionHeadings, heading, browseFilters, browseAll, diwaliShortcut, corporateShortcut, premiumShortcut, windowObject, eventLog };
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

test("collapsing a section keeps its bottom disclosure reachable", () => {
  const harness = createHarness();
  const target = harness.sections[0];
  target.disclosure.dispatch("click");
  assert.equal(target.disclosure.scrolledIntoView, undefined);
  target.disclosure.dispatch("click");
  assert.equal(target.disclosure.scrolledIntoView.behavior, "instant");
  assert.equal(target.disclosure.scrolledIntoView.block, "nearest");
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
  assert.equal(visibleCards(harness).length, 3);
  assert.match(harness.status.textContent, /Showing 75–77 of 77 gifts · Page 11 of 11\./);
});

test("full catalogue pages never mix product sections and cover the real 89-card catalogue in thirteen pages", () => {
  const harness = createHarness({ count: 89, includePremium: true, realCatalogue: true });
  harness.browseAll.dispatch("click");
  const pageCounts = [];
  const pageSections = [];
  while (true) {
    const visible = harness.cards.filter((card) => !card.hidden);
    pageCounts.push(visible.length);
    pageSections.push(new Set(visible.map((card) => card.section.id)));
    if (harness.pageNext.disabled) break;
    harness.pageNext.dispatch("click");
  }
  assert.deepEqual(pageCounts, [8, 8, 7, 8, 5, 8, 8, 3, 8, 8, 4, 8, 6]);
  assert.equal(pageSections.length, 13);
  assert.ok(pageSections.every((sections) => sections.size === 1));
  assert.equal(pageSections[4].has("romantic-keepsakes"), true);
  assert.equal(pageSections[5].has("corporate-resin-gifts"), true);
  assert.match(harness.status.textContent, /Showing 84–89 of 89 gifts · Page 13 of 13\./);
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

test("paging replaces cards and returns focus to the first visible section heading", () => {
  const harness = createHarness();
  harness.browseAll.dispatch("click");
  const firstPage = visibleCards(harness).map((card) => card.id);
  harness.pageNext.dispatch("click");
  assert.notDeepEqual(visibleCards(harness).map((card) => card.id), firstPage);
  assert.deepEqual(harness.sectionHeadings[0].events, ["scroll", "focus", "scroll", "focus"]);
  assert.deepEqual(harness.heading.events, []);
});

test("full catalogue moves the results below the last visible section and focuses the first section heading", () => {
  const harness = createHarness();
  harness.browseAll.dispatch("click");
  assert.equal(harness.results.parentNode, harness.sections[0]);
  assert.equal(harness.windowObject.location.hash, "#diwali");
  assert.deepEqual(harness.sectionHeadings[0].events, ["scroll", "focus"]);
  assert.deepEqual(harness.heading.events, []);
  for (let index = 0; index < 4; index += 1) harness.pageNext.dispatch("click");
  assert.equal(harness.results.parentNode, harness.sections[1]);
  assert.deepEqual(harness.sectionHeadings[0].events, ["scroll", "focus", "scroll", "focus", "scroll", "focus"]);
  assert.deepEqual(harness.sectionHeadings[1].events, ["scroll", "focus", "scroll", "focus"]);
  assert.deepEqual(harness.sectionHeadings[2].events, []);
  assert.equal(harness.windowObject.location.hash, "#romantic-keepsakes");
});

test("preview and no-result states return the results block to the filter enhancement", () => {
  const harness = createHarness();
  assert.equal(harness.results.parentNode, harness.enhancement);
  harness.browseAll.dispatch("click");
  assert.notEqual(harness.results.parentNode, harness.enhancement);
  harness.resetButton.dispatch("click");
  assert.equal(harness.results.parentNode, harness.enhancement);
  harness.typeFilter.value = "not-a-real-type";
  harness.typeFilter.dispatch("change");
  assert.equal(harness.results.parentNode, harness.enhancement);
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
  assert.match(harness.status.textContent, /Page 1 of 11/);
});

test("Corporate shortcut selects corporate page one", () => {
  const harness = createHarness();
  harness.corporateShortcut.dispatch("click");
  assert.equal(harness.typeFilter.value, "corporate");
  assert.equal(harness.pagePrevious.disabled, true);
  assert.ok(visibleCards(harness).every((card) => card.getAttribute("data-product-type") === "corporate"));
});

test("category shortcuts replace a conflicting explicit filter state", () => {
  const harness = createHarness({ url: "https://example.test/?type=couple&budget=999&page=2&ref=keep#romantic-keepsakes" });
  harness.diwaliShortcut.dispatch("click");
  assert.equal(harness.typeFilter.value, "diwali");
  assert.equal(harness.priceFilter.value, "all");
  assert.equal(harness.windowObject.location.hash, "#diwali");
  assert.match(harness.windowObject.location.search, /(?:^|&)type=diwali(?:&|$)/);
  assert.ok(visibleCards(harness).every((card) => card.getAttribute("data-product-type") === "diwali"));
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

  const sectionBoundaryProduct = createHarness({ hash: "#product-39" });
  assert.equal(sectionBoundaryProduct.cards[38].hidden, false);
  assert.match(sectionBoundaryProduct.status.textContent, /Page 6 of 11/);
  assert.ok(visibleCards(sectionBoundaryProduct).every((card) => card.section.id === "corporate-resin-gifts"));

  const later = createHarness();
  later.windowObject.location.hash = "#corporate-resin-gifts";
  later.windowObject.listeners.hashchange();
  assert.equal(later.typeFilter.value, "corporate");
  assert.equal(later.pagePrevious.disabled, true);
  assert.ok(visibleCards(later).every((card) => card.getAttribute("data-product-type") === "corporate"));
});

test("premium collection starts with four photos and expands only itself", () => {
  const harness = createHarness({ count: 91, includePremium: true });
  const premium = harness.sections.find((section) => section.id === "premium-collection");
  assert.equal(premium.cards.length, 14);
  assert.equal(premium.cards.filter((card) => !card.hidden).length, 4);
  assert.equal(premium.disclosure.hidden, false);
  assert.equal(premium.disclosure.textContent, "View all");
  assert.equal(premium.disclosure.getAttribute("aria-expanded"), "false");
  premium.disclosure.dispatch("click");
  assert.equal(premium.cards.filter((card) => !card.hidden).length, 14);
  assert.equal(premium.disclosure.textContent, "Show less");
  harness.sections.filter((section) => section !== premium).forEach((section) => {
    assert.equal(section.cards.filter((card) => !card.hidden).length, Math.min(4, section.cards.length));
  });
});

test("premium filter includes priced and on-request photos, while budget excludes on-request", () => {
  const harness = createHarness({ count: 91, includePremium: true });
  harness.premiumShortcut.dispatch("click");
  assert.equal(harness.typeFilter.value, "premium");
  assert.match(harness.status.textContent, /Showing 1–8 of 14 gifts/);
  assert.ok(visibleCards(harness).every((card) => card.getAttribute("data-product-type") === "premium"));
  harness.priceFilter.value = "2000";
  harness.priceFilter.dispatch("change");
  assert.match(harness.status.textContent, /of 6 gifts/);
  assert.ok(visibleCards(harness).every((card) => card.getAttribute("data-product-type") === "premium"));
  assert.ok(visibleCards(harness).every((card) => card.querySelector(".product-pricing dd").textContent !== "Price on request"));
});

test("budget filters overlap at ₹2,000 and keep higher-priced gifts in the upper range", () => {
  const harness = createHarness({ count: 8 });
  harness.cards[0].price = "₹2,000";
  harness.cards[1].price = "₹2,001";
  harness.cards[2].price = "₹1,999";
  harness.browseAll.dispatch("click");

  harness.priceFilter.value = "1999";
  harness.priceFilter.dispatch("change");
  assert.ok(visibleCards(harness).some((card) => card.id === "product-1"));
  assert.ok(visibleCards(harness).some((card) => card.id === "product-3"));
  assert.ok(visibleCards(harness).every((card) => card.id !== "product-2"));

  harness.priceFilter.value = "2000";
  harness.priceFilter.dispatch("change");
  assert.ok(visibleCards(harness).some((card) => card.id === "product-1"));
  assert.ok(visibleCards(harness).some((card) => card.id === "product-2"));
  assert.ok(visibleCards(harness).every((card) => card.id !== "product-3"));
});

test("premium section hash selects the premium category", () => {
  const harness = createHarness({ count: 91, includePremium: true });
  harness.windowObject.location.hash = "#premium-collection";
  harness.windowObject.listeners.hashchange();
  assert.equal(harness.typeFilter.value, "premium");
  assert.equal(harness.windowObject.location.hash, "#premium-collection");
  assert.ok(visibleCards(harness).every((card) => card.getAttribute("data-product-type") === "premium"));
});

test("explicit URL state restores filters, clamps pages, preserves unrelated params, and pushes once per page action", () => {
  const harness = createHarness({ url: "https://example.test/?type=corporate&budget=999&page=999&ref=partner-7&unknown=keep#corporate-resin-gifts" });
  assert.equal(harness.typeFilter.value, "corporate");
  assert.equal(harness.priceFilter.value, "999");
  assert.match(harness.pageStatus.textContent, /Page 2 of 2/);
  assert.equal(harness.windowObject.history.pushes.length, 0);
  harness.pagePrevious.dispatch("click");
  assert.equal(harness.windowObject.history.pushes.length, 1);
  assert.match(harness.windowObject.location.search, /(?:^|&)type=corporate(?:&|$)/);
  assert.match(harness.windowObject.location.search, /(?:^|&)budget=999(?:&|$)/);
  assert.match(harness.windowObject.location.search, /(?:\?|&)page=1(?:&|$)/);
  assert.match(harness.windowObject.location.search, /(?:\?|&)ref=partner-7(?:&|$)/);
  assert.match(harness.windowObject.location.search, /(?:^|&)unknown=keep(?:&|$)/);
  assert.equal(harness.windowObject.location.hash, "#corporate-resin-gifts");
});

test("invalid URL state falls back to a safe full catalogue tuple without discarding unknown params", () => {
  const harness = createHarness({ url: "https://example.test/?type=wat&budget=1.5&page=Infinity&ref=keep&x=1#catalogue-filters" });
  assert.equal(harness.typeFilter.value, "all");
  assert.equal(harness.priceFilter.value, "all");
  assert.match(harness.pageStatus.textContent, /Page 1 of 11/);
  assert.equal(harness.windowObject.history.pushes.length, 0);
  assert.equal(harness.windowObject.history.replacements.length, 1);
  assert.match(harness.windowObject.location.search, /(?:^|&)type=all(?:&|$)/);
  assert.match(harness.windowObject.location.search, /(?:^|&)budget=all(?:&|$)/);
  assert.match(harness.windowObject.location.search, /(?:^|&)page=1(?:&|$)/);
  assert.match(harness.windowObject.location.search, /(?:\?|&)ref=keep(?:&|$)/);
  assert.match(harness.windowObject.location.search, /(?:\?|&)x=1(?:&|$)/);
});

test("explicit catalogue filter hash remains a filter anchor on full URL restore", () => {
  const harness = createHarness({ url: "https://example.test/?type=all&budget=all&page=1#catalogue-filters" });
  assert.deepEqual(harness.sectionHeadings[0].events, []);
  assert.deepEqual(harness.heading.events, []);
  assert.equal(harness.results.parentNode, harness.sections[0]);
});

test("reset removes only catalogue URL keys, writes a neutral hash, and popstate restores without pushing", () => {
  const harness = createHarness({ url: "https://example.test/?type=corporate&budget=999&page=2&ref=keep&x=1#corporate-resin-gifts" });
  harness.resetButton.dispatch("click");
  assert.equal(harness.windowObject.history.pushes.length, 1);
  assert.doesNotMatch(harness.windowObject.location.search, /(?:^|&)(?:type|budget|page)=/);
  assert.match(harness.windowObject.location.search, /(?:\?|&)ref=keep(?:&|$)/);
  assert.match(harness.windowObject.location.search, /(?:\?|&)x=1(?:&|$)/);
  assert.equal(harness.windowObject.location.hash, "#catalogue-filters");
  assert.equal(harness.typeFilter.value, "all");
  assert.equal(harness.pagination.hidden, true);
  const previousPushes = harness.windowObject.history.pushes.length;
  harness.windowObject.listeners.popstate();
  assert.equal(harness.typeFilter.value, "all");
  assert.equal(harness.pagination.hidden, true);
  assert.equal(harness.windowObject.history.pushes.length, previousPushes);
  harness.windowObject.history.replaceState({}, "", "https://example.test/?type=diwali&budget=all&page=1&ref=keep#diwali");
  harness.windowObject.listeners.popstate();
  assert.equal(harness.typeFilter.value, "diwali");
  assert.equal(harness.windowObject.history.pushes.length, previousPushes);
});
