const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const start = script.indexOf("  function initCatalogueExperience()");
const end = script.indexOf("\n  function initOrderRequestFlow()", start);
const catalogueFunction = script.slice(start, end);

class FakeControl {
  constructor(value = "") { this.value = value; this.textContent = ""; this.listeners = {}; this.disabled = false; this.attributes = {}; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  dispatch(type, options = {}) {
    if (!this.listeners[type]) return;
    const event = Object.assign({ target: this, preventDefault() { this.defaultPrevented = true; } }, options);
    this.listeners[type](event);
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || ""; }
  removeAttribute(name) { delete this.attributes[name]; }
  focus() { this.focused = true; }
  scrollIntoView(options) { this.scrolledIntoView = options; }
  contains(node) { return node === this || (this.inside || []).includes(node); }
}

class FakeContainer {
  constructor(id) { this.id = id; this.children = []; this.attributes = {}; this.classList = { values: new Set(), toggle: (name, enabled) => enabled ? this.classList.values.add(name) : this.classList.values.delete(name), contains: (name) => this.classList.values.has(name) }; }
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
    this.classList = { values: new Set(), toggle: (name, enabled) => enabled ? this.classList.values.add(name) : this.classList.values.delete(name), contains: (name) => this.classList.values.has(name) };
    this.disclosure = new FakeControl("");
    this.disclosure.hidden = false;
    this.grid = new FakeControl("");
    this.grid.scrollIntoView = (options) => { this.grid.scrolledIntoView = options; };
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
    if (selector === ".catalogue-grid") return this.grid;
    return selector === "[data-catalogue-disclosure]" ? this.disclosure : null;
  }
}

class FakeCard {
  constructor(section, price, id, featured = false, eventLog = [], title = id, kind = "", description = "", keywords = "") {
    this.section = section;
    this.price = price;
    this.id = id;
    this.title = title;
    this.kind = kind;
    this.description = description;
    this.keywords = keywords;
    this.textContent = `${title} ${description}`;
    this.hidden = false;
    this.attributes = featured ? { "data-featured": "true" } : {};
    this.events = [];
    this.eventLog = eventLog;
    section.cards.push(this);
  }
  closest(selector) { return selector === "section" ? this.section : null; }
  querySelector(selector) {
    if (selector === ".product-pricing dd") return { textContent: this.price };
    if (selector === "figcaption strong" || selector === "figcaption h3") return { textContent: this.title };
    return null;
  }
  getAttribute(name) {
    if (name === "data-product-kind") return this.kind;
    if (name === "data-search-keywords") return this.keywords;
    return this.attributes[name] || "";
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  matches(selector) { return selector === "article"; }
  scrollIntoView() { this.events.push("scroll"); this.eventLog.push("scroll"); }
}

class FakeLink extends FakeControl {
  constructor(href, value = "") { super(value); this.href = href; }
  getAttribute(name) { return name === "href" ? this.href : name === "data-category-shortcut" ? this.value : super.getAttribute(name); }
}

class FakeTab extends FakeLink {
  constructor(href, tab, shortcut = "") { super(href, shortcut); this.tab = tab; }
  getAttribute(name) { return name === "data-category-tab" ? this.tab : name === "data-category-shortcut" ? this.value || "" : super.getAttribute(name); }
}

function createHarness({ hash = "", url = "", count = 77, includePremium = false, realCatalogue = false, withTabs = false } = {}) {
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
      : index < 34
        ? sections[1]
        : index < 53
          ? sections[2]
          : index < 73
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
    const premiumPrice = ["₹20,000–₹25,000", "₹20,000–₹25,000", "₹15,000", "₹10,000–₹12,000", "Price on request", "Price on request", "Price on request", "Price on request", "Price on request", "₹5,000", "Price on request", "Price on request", "Price on request", "₹10,000–₹12,000"][index - (realCatalogue ? 73 : 74)];
    const price = section.id === "premium-collection"
      ? premiumPrice
      : index % 5 === 0
      ? "₹2,499"
      : section.id === "corporate-resin-gifts"
        ? `₹${499 + (index % 3) * 100}`
        : `₹${149 + index * 25}`;
    return new FakeCard(section, price, `product-${index + 1}`, index < 8, eventLog);
  });
  const tools = new FakeControl("");
  const searchFilter = new FakeControl("");
  const typeFilter = new FakeControl("all");
  const priceFilter = new FakeControl("all");
  const applyButton = new FakeControl("");
  const resetButton = new FakeControl("");
  const emptyReset = new FakeControl("");
  const status = { textContent: "" };
  const empty = { hidden: true };
  const searchForm = new FakeControl("");
  const searchToggle = new FakeControl("");
  const filterToggle = new FakeControl("");
  const searchPanel = new FakeControl("");
  const filterPanel = new FakeControl("");
  searchPanel.hidden = true;
  filterPanel.hidden = true;
  const results = new FakeContainer("catalogue-results");
  results.parentNode = tools;
  results.appendChild(status);
  tools.events = [];
  tools.scrollIntoView = (options) => { tools.scrolledIntoView = options; tools.events.push("scroll"); };
  tools.focus = () => tools.events.push("focus");
  const browseFilters = new FakeLink("#catalogue-filters");
  const navBrowseAll = new FakeLink("#catalogue-filters");
  navBrowseAll.hidden = false;
  const diwaliShortcut = new FakeLink("#diwali", "diwali");
  const corporateShortcut = new FakeLink("#corporate-resin-gifts", "corporate");
  const premiumShortcut = new FakeLink("#premium-collection", "premium");
  // Tab bar links join the same browse-all/shortcut stubs the nav links use.
  const tabs = withTabs ? {
    all: new FakeTab("#catalogue-filters", "all"),
    bestsellers: new FakeTab("#catalogue-filters", "bestsellers", "bestsellers"),
    diwali: new FakeTab("#diwali", "diwali", "diwali"),
    couple: new FakeTab("#romantic-keepsakes", "couple", "couple"),
    corporate: new FakeTab("#corporate-resin-gifts", "corporate", "corporate"),
    premium: new FakeTab("#premium-collection", "premium", "premium"),
  } : {};
  const tabList = Object.values(tabs);
  const framesShortcut = new FakeLink("#studio-art", "frames");
  const currentTabs = () => tabList.filter((tab) => tab.getAttribute("aria-current") === "true").map((tab) => tab.tab);
  const elements = new Map([
    ["catalogue-filters", tools],
    ["catalogue-search", searchFilter],
    ["catalogue-type-filter", typeFilter],
    ["catalogue-price-filter", priceFilter],
    ["catalogue-filter-apply", applyButton],
    ["catalogue-filter-reset", resetButton],
    ["catalogue-empty-reset", emptyReset],
    ["catalogue-filter-status", status],
    ["catalogue-filter-empty", empty],
    ["catalogue-results", results],
    ["catalogue-search-form", searchForm],
    ["catalogue-search-toggle", searchToggle],
    ["catalogue-filter-toggle", filterToggle],
    ["catalogue-search-panel", searchPanel],
    ["catalogue-filter-panel", filterPanel],
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
      if (selector === "[data-category-tab]") return tabList;
      if (selector === "[data-browse-all]") return withTabs ? [navBrowseAll, tabs.all] : [navBrowseAll];
      if (selector === "[data-category-shortcut]") {
        const base = includePremium ? [diwaliShortcut, corporateShortcut, premiumShortcut] : [diwaliShortcut, corporateShortcut];
        return withTabs ? base.concat([framesShortcut, tabs.bestsellers, tabs.diwali, tabs.couple, tabs.corporate, tabs.premium]) : base;
      }
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
  const documentListeners = {};
  documentObject.addEventListener = (type, listener) => { documentListeners[type] = listener; };
  const context = { document: documentObject, window: windowObject, URL, URLSearchParams };
  vm.createContext(context);
  vm.runInContext(`${catalogueFunction}\ninitCatalogueExperience();`, context, { filename: "script.js" });
  return { cards, sections, tools, searchFilter, typeFilter, priceFilter, applyButton, resetButton, emptyReset, status, empty, searchForm, searchToggle, filterToggle, searchPanel, filterPanel, results, sectionHeadings, browseFilters, navBrowseAll, diwaliShortcut, corporateShortcut, premiumShortcut, framesShortcut, tabs, currentTabs, windowObject, documentListeners, eventLog };
}

function visibleCards(harness) { return harness.cards.filter((card) => !card.hidden); }

test("catalogue browse uses one continuous result view with compact search and filter controls", () => {
  assert.doesNotMatch(html, /id="catalogue-page-(?:previous|next|status)"/);
  assert.doesNotMatch(html, /id="catalogue-filters-title"|Find a gift that fits the moment/);
  assert.match(html, /<div class="catalogue-status-region shell" id="catalogue-filters" aria-label="Gift catalogue results" tabindex="-1">/);
  assert.doesNotMatch(html, /catalogue-results-header|catalogue-browse-all|See all 89 gifts/);
  assert.match(html, /id="catalogue-search-toggle"[^>]+aria-controls="catalogue-search-panel"/);
  assert.match(html, /id="catalogue-filter-toggle"[^>]+aria-controls="catalogue-filter-panel"/);
  assert.match(html, /id="catalogue-search-panel"/);
  assert.match(html, /id="catalogue-filter-panel"/);
  assert.match(html, /<button class="button button-dark" id="catalogue-filter-apply" type="button">Apply filters<\/button>/);
  assert.match(css, /\.catalogue-control-toggle[^}]*min-height:\s*44px/);
  assert.doesNotMatch(html, /hero-catalogue-action|>Explore gifts</);
  assert.match(html, /<a href="#customizer" data-customizer-open>Or design a custom frame<\/a>/);
});

test("no-JS source keeps every catalogue card in the document", () => {
  const articleBlocks = Array.from(html.matchAll(/<article\b[\s\S]*?<\/article>/g), (match) => match[0]);
  assert.ok(articleBlocks.length > 80);
  assert.ok(articleBlocks.every((article) => !/^<article\b[^>]*\shidden(?:=|\s|>)/.test(article)));
  assert.match(css, /html\.js \.catalogue-grid/);
});

test("initial state shows four-card previews per section", () => {
  const harness = createHarness();
  assert.equal(visibleCards(harness).length, 19);
  harness.sections.forEach((section) => {
    assert.equal(section.cards.filter((card) => !card.hidden).length, Math.min(4, section.cards.length));
    assert.equal(section.disclosure.hidden, section.cards.length <= 4);
    assert.equal(section.disclosure.getAttribute("aria-expanded"), "false");
  });
  assert.equal(harness.status.textContent, "");
  assert.equal(harness.searchPanel.hidden, true);
  assert.equal(harness.filterPanel.hidden, true);
});

test("all catalogue section disclosures use View all until expanded", () => {
  const labels = Array.from(html.matchAll(/<button\b[^>]*data-catalogue-disclosure[^>]*>([^<]*)<\/button>/g), (match) => match[1].trim());
  assert.ok(labels.length > 0);
  assert.ok(labels.every((label) => label === "View all"));

  const harness = createHarness({ includePremium: true });
  const target = harness.sections[0];
  assert.equal(target.disclosure.textContent, "View all");
  target.disclosure.dispatch("click");
  assert.equal(target.disclosure.textContent, "Show less");
  target.disclosure.dispatch("click");
  assert.equal(target.disclosure.textContent, "View all");
});

test("search is labelled, bounded, compactly opened, and placed before filters", () => {
  assert.match(html, /<form class="catalogue-search-form" id="catalogue-search-form">/);
  assert.match(html, /<label class="catalogue-search-field" for="catalogue-search">Search gifts\s*<input id="catalogue-search" type="search"[^>]+maxlength="100"/);
  assert.ok(html.indexOf("catalogue-search-panel") < html.indexOf("catalogue-filter-panel"));
  assert.match(css, /\.catalogue-search-form input\[type="search"\][^}]*min-height:\s*44px/);
  assert.match(css, /\.catalogue-control-toggle[^}]*min-height:\s*44px/);
});

test("search metadata covers requested item kinds without taxonomy drift", () => {
  const articleBlocks = Array.from(html.matchAll(/<article\b[\s\S]*?<\/article>/g), (match) => match[0]);
  const kindArticles = articleBlocks.filter((article) => /data-product-kind="[^"]+"/.test(article));
  assert.equal(kindArticles.length, 4);
  const assertKindTitle = (kind, title) => {
    assert.ok(kindArticles.some((article) => article.includes(`data-product-kind="${kind}"`) && article.includes(title)), `${kind} metadata must stay on ${title}`);
  };
  assertKindTitle("rakhi", "<strong>Lilac symbol medallion</strong>");
  assertKindTitle("rakhi", "<strong>Little brother keepsake</strong>");
  assertKindTitle("rose preservation", "id=\"rose-hexagon\"");
  assertKindTitle("rose preservation", "<h3 id=\"romantic-rose-display-title\">Preserved rose display</h3>");
  ["mantra", "tealight", "bookmark", "nameplate", "coaster"].forEach((kind) => {
    assert.match(html.toLowerCase(), new RegExp("<(?:strong|h3)[^>]*>[^<]*" + kind + "[^<]*<\\/(?:strong|h3)>"));
  });
  const roseFestive = articleBlocks.find((article) => article.includes("Rose &amp; Gold Festive Set")) || "";
  assert.doesNotMatch(roseFestive, /data-product-kind="rose preservation"/);
});

test("Explore gifts reveals every matching item in one continuous view", () => {
  const harness = createHarness({ count: 77 });
  harness.navBrowseAll.dispatch("click");
  assert.equal(visibleCards(harness).length, 77);
  assert.equal(harness.status.textContent, "");
  assert.ok(harness.sections.every((section) => section.disclosure.hidden));
});

test("search matches title, type, and kind while ignoring descriptions", () => {
  const harness = createHarness({ count: 12 });
  const beyondPreview = harness.cards[8];
  beyondPreview.title = "Jewel Glow Tealight";
  beyondPreview.kind = "tealight";
  beyondPreview.description = "bookmark details stay outside search";
  beyondPreview.textContent = `${beyondPreview.title} ${beyondPreview.description}`;

  harness.searchToggle.dispatch("click");
  assert.equal(harness.searchToggle.getAttribute("aria-expanded"), "true");
  assert.equal(harness.searchPanel.hidden, false);
  assert.equal(harness.searchFilter.focused, true);
  harness.searchFilter.value = "  Jewel   Glow ";
  harness.searchFilter.dispatch("input");
  assert.equal(harness.searchFilter.value, "  Jewel   Glow ");
  assert.deepEqual(visibleCards(harness).map((card) => card.id), [beyondPreview.id]);
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("q"), "Jewel Glow");
  assert.equal(harness.status.textContent, "");

  harness.searchForm.dispatch("submit");
  assert.equal(harness.searchToggle.getAttribute("aria-expanded"), "false");
  assert.equal(harness.searchPanel.hidden, true);
  harness.searchToggle.dispatch("click");
  harness.searchFilter.value = "bookmark";
  harness.searchFilter.dispatch("input");
  assert.equal(harness.empty.hidden, false);
  assert.equal(visibleCards(harness).length, 0);

  harness.emptyReset.dispatch("click");
  assert.equal(visibleCards(harness).length, 12);
  assert.equal(harness.searchFilter.value, "");
  assert.equal(harness.searchToggle.getAttribute("aria-expanded"), "false");
});

test("search matches hidden semantic keywords for romantic and festive intent", () => {
  const harness = createHarness({ count: 12 });
  const romantic = harness.cards[0];
  romantic.keywords = "heart rose anniversary boyfriend girlfriend couple";
  const festive = harness.cards[1];
  festive.keywords = "mantra diya tealight rakhi";
  ["heart", "rose", "anniversary", "boyfriend", "girlfriend", "couple"].forEach((term) => {
    harness.searchFilter.value = term;
    harness.searchFilter.dispatch("input");
    assert.deepEqual(visibleCards(harness).map((card) => card.id), [romantic.id], `expected ${term} to find the romantic product`);
  });
  ["mantra", "diya", "tealight", "rakhi"].forEach((term) => {
    harness.searchFilter.value = term;
    harness.searchFilter.dispatch("input");
    assert.deepEqual(visibleCards(harness).map((card) => card.id), [festive.id], `expected ${term} to find the festive product`);
  });
});

test("search normalizes the URL boundary and waits for IME composition", () => {
  const harness = createHarness({ count: 12 });
  harness.searchFilter.value = "x".repeat(101);
  harness.searchFilter.dispatch("input");
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("q").length, 100);
  assert.equal(harness.windowObject.history.pushes.length, 0);
  assert.deepEqual(harness.tools.events, []);

  harness.searchFilter.value = "diwali";
  harness.searchFilter.dispatch("input", { isComposing: true });
  assert.equal(harness.empty.hidden, false);
  harness.searchFilter.dispatch("compositionend");
  assert.ok(visibleCards(harness).length > 0);
});

test("filters stay open while choices are staged and apply together from an explicit control", () => {
  const harness = createHarness({ count: 77 });
  harness.filterToggle.dispatch("click");
  assert.equal(harness.filterToggle.getAttribute("aria-expanded"), "true");
  assert.equal(harness.filterPanel.hidden, false);
  assert.equal(harness.typeFilter.focused, true);
  const beforeCards = visibleCards(harness).map((card) => card.id);
  harness.typeFilter.value = "corporate";
  harness.typeFilter.dispatch("change");
  assert.equal(harness.filterToggle.getAttribute("aria-expanded"), "true");
  assert.equal(harness.filterPanel.hidden, false);
  assert.deepEqual(visibleCards(harness).map((card) => card.id), beforeCards);
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("type"), null);
  harness.priceFilter.value = "499";
  harness.priceFilter.dispatch("change");
  assert.equal(harness.filterToggle.getAttribute("aria-expanded"), "true");
  assert.equal(harness.filterPanel.hidden, false);
  assert.deepEqual(visibleCards(harness).map((card) => card.id), beforeCards);
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("budget"), null);

  harness.applyButton.dispatch("click");
  assert.equal(harness.filterToggle.getAttribute("aria-expanded"), "false");
  assert.equal(harness.filterPanel.hidden, true);
  assert.equal(harness.filterToggle.focused, true);
  assert.ok(visibleCards(harness).length > 0);
  assert.ok(visibleCards(harness).every((card) => card.getAttribute("data-product-type") === "corporate"));
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("type"), "corporate");
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("budget"), "499");
});

test("Escape discards staged filters and returns focus to the toggle", () => {
  const harness = createHarness({ count: 77 });
  harness.filterToggle.dispatch("click");
  assert.equal(harness.filterPanel.hidden, false);
  harness.typeFilter.value = "corporate";
  harness.priceFilter.value = "999";
  harness.applyButton.dispatch("click");

  harness.filterToggle.dispatch("click");
  harness.typeFilter.value = "diwali";
  harness.typeFilter.dispatch("change");
  harness.priceFilter.value = "499";
  harness.priceFilter.dispatch("change");
  harness.documentListeners.keydown({ key: "Escape" });
  assert.equal(harness.filterPanel.hidden, true);
  assert.equal(harness.filterToggle.focused, true);
  assert.equal(harness.typeFilter.value, "corporate");
  assert.equal(harness.priceFilter.value, "999");

  harness.filterToggle.dispatch("click");
  harness.applyButton.dispatch("click");
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("type"), "corporate");
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("budget"), "999");
  assert.ok(visibleCards(harness).every((card) => card.getAttribute("data-product-type") === "corporate"));
});

test("an outside tap closes open search or filters and discards staged filters", () => {
  const harness = createHarness({ count: 77 });
  harness.searchPanel.inside = [harness.searchFilter];
  harness.filterPanel.inside = [harness.typeFilter, harness.priceFilter, harness.applyButton];
  const outside = new FakeControl("");

  harness.searchToggle.dispatch("click");
  harness.documentListeners.click({ target: harness.searchToggle });
  harness.documentListeners.click({ target: harness.searchFilter });
  assert.equal(harness.searchPanel.hidden, false, "taps on the toggle or inside the panel keep search open");
  harness.searchToggle.focused = false;
  harness.documentListeners.click({ target: outside });
  assert.equal(harness.searchPanel.hidden, true);
  assert.equal(harness.searchToggle.getAttribute("aria-expanded"), "false");
  assert.equal(harness.searchToggle.focused, false, "an outside tap does not pull focus back");

  harness.filterToggle.dispatch("click");
  harness.typeFilter.value = "corporate";
  harness.priceFilter.value = "999";
  harness.applyButton.dispatch("click");
  harness.filterToggle.dispatch("click");
  harness.typeFilter.value = "diwali";
  harness.typeFilter.dispatch("change");
  harness.documentListeners.click({ target: harness.typeFilter });
  assert.equal(harness.filterPanel.hidden, false, "a tap inside the filter panel keeps it open");
  harness.filterToggle.focused = false;
  harness.documentListeners.click({ target: outside });
  assert.equal(harness.filterPanel.hidden, true);
  assert.equal(harness.filterToggle.getAttribute("aria-expanded"), "false");
  assert.equal(harness.typeFilter.value, "corporate", "staged filter choices are discarded like Escape");
  assert.equal(harness.priceFilter.value, "999");
  assert.equal(harness.filterToggle.focused, false);

  harness.documentListeners.click({ target: outside });
  assert.equal(harness.filterPanel.hidden, true, "outside taps while closed change nothing");
  assert.equal(harness.searchPanel.hidden, true);
});

test("URL state preserves query, filters, unrelated parameters, and back/forward restoration", () => {
  const harness = createHarness({ url: "https://example.test/?q=%20product%20%20&ref=keep#catalogue-filters" });
  assert.equal(harness.searchFilter.value, "product");
  assert.equal(visibleCards(harness).length, 77);
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("q"), "product");
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("ref"), "keep");
  assert.equal(harness.windowObject.history.replacements.length, 1);

  harness.typeFilter.value = "corporate";
  harness.typeFilter.dispatch("change");
  harness.applyButton.dispatch("click");
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("q"), "product");
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("type"), "corporate");
  assert.equal(visibleCards(harness).every((card) => card.getAttribute("data-product-type") === "corporate"), true);

  harness.windowObject.history.replaceState({}, "", "https://example.test/#catalogue-filters");
  harness.windowObject.listeners.popstate();
  assert.equal(harness.searchFilter.value, "");
  assert.equal(visibleCards(harness).length, 19);
  harness.windowObject.history.replaceState({}, "", "https://example.test/?q=product#catalogue-filters");
  harness.windowObject.listeners.popstate();
  assert.equal(harness.searchFilter.value, "product");
  assert.equal(visibleCards(harness).length, 77);
});

test("search clear, category navigation, previews, and no-result reset clear q", () => {
  const harness = createHarness({ count: 12 });
  harness.searchFilter.value = "product";
  harness.searchFilter.dispatch("input");
  harness.typeFilter.value = "diwali";
  harness.typeFilter.dispatch("change");
  harness.priceFilter.value = "999";
  harness.priceFilter.dispatch("change");
  harness.applyButton.dispatch("click");
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("q"), "product");

  harness.searchFilter.value = "";
  harness.searchFilter.dispatch("input");
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("q"), null);
  assert.equal(harness.typeFilter.value, "diwali");
  assert.equal(harness.priceFilter.value, "999");
  assert.equal(visibleCards(harness).length, 3);
  assert.equal(harness.results.parentNode, harness.tools);

  harness.corporateShortcut.dispatch("click");
  harness.resetButton.dispatch("click");
  assert.equal(harness.searchFilter.value, "");
  assert.equal(visibleCards(harness).length, 4);

  harness.searchFilter.value = "does-not-exist";
  harness.searchFilter.dispatch("input");
  harness.emptyReset.dispatch("click");
  assert.equal(harness.searchFilter.value, "");
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("q"), null);
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
  harness.navBrowseAll.dispatch("click");
  assert.ok(harness.sections.every((section) => section.disclosure.hidden));
  harness.resetButton.dispatch("click");
  assert.equal(target.disclosure.getAttribute("aria-expanded"), "false");
});

test("filters use AND logic without pagination", () => {
  const harness = createHarness({ count: 77 });
  harness.navBrowseAll.dispatch("click");
  harness.typeFilter.value = "corporate";
  harness.priceFilter.value = "999";
  harness.typeFilter.dispatch("change");
  harness.priceFilter.dispatch("change");
  harness.applyButton.dispatch("click");
  assert.ok(visibleCards(harness).length > 0);
  assert.ok(visibleCards(harness).every((card) => card.getAttribute("data-product-type") === "corporate"));
  assert.equal(harness.status.textContent, "");
});

test("hero browse link jumps to the first visible product grid without changing catalogue state", () => {
  const harness = createHarness();
  harness.browseFilters.dispatch("click");
  assert.equal(harness.sections[0].grid.scrolledIntoView.behavior, "auto");
  const before = visibleCards(harness).map((card) => card.id);
  harness.corporateShortcut.dispatch("click");
  harness.sections.forEach((section) => { section.grid.scrolledIntoView = undefined; });
  const filtered = visibleCards(harness).map((card) => card.id);
  harness.browseFilters.dispatch("click");
  assert.deepEqual(visibleCards(harness).map((card) => card.id), filtered);
  assert.equal(harness.sections[2].grid.scrolledIntoView.behavior, "auto");
  assert.notDeepEqual(filtered, before);
  harness.typeFilter.value = "not-a-real-type";
  harness.typeFilter.dispatch("change");
  harness.applyButton.dispatch("click");
  harness.browseFilters.dispatch("click");
  assert.equal(harness.tools.scrolledIntoView.behavior, "auto");
});

test("full catalogue keeps results beside the accessible status region and focuses it", () => {
  const harness = createHarness();
  harness.navBrowseAll.dispatch("click");
  assert.equal(harness.results.parentNode, harness.tools);
  assert.equal(harness.windowObject.location.hash, "#catalogue-filters");
  assert.deepEqual(harness.sectionHeadings[0].events, []);
  assert.deepEqual(harness.tools.events, ["scroll", "focus"]);
  assert.equal(harness.status.textContent, "");
  assert.equal(visibleCards(harness).length, 77);
});

test("full browse keeps the accessible status quiet for matching results", () => {
  const harness = createHarness({ count: 87, includePremium: true, realCatalogue: true });
  harness.navBrowseAll.dispatch("click");
  assert.equal(harness.status.textContent, "");
  harness.typeFilter.value = "premium";
  harness.typeFilter.dispatch("change");
  assert.equal(harness.status.textContent, "");
  harness.priceFilter.value = "2000";
  harness.priceFilter.dispatch("change");
  harness.applyButton.dispatch("click");
  assert.equal(harness.status.textContent, "");
});

test("empty results recover to all gifts", () => {
  const harness = createHarness();
  harness.typeFilter.value = "not-a-real-type";
  harness.typeFilter.dispatch("change");
  harness.applyButton.dispatch("click");
  assert.equal(harness.empty.hidden, false);
  assert.equal(harness.status.textContent, "No gifts match those choices.");
  assert.equal(visibleCards(harness).length, 0);
  harness.emptyReset.dispatch("click");
  assert.equal(harness.empty.hidden, true);
  assert.equal(harness.typeFilter.value, "all");
  assert.equal(visibleCards(harness).length, 77);
  assert.equal(harness.status.textContent, "");
});

test("Corporate and premium shortcuts select continuous category results", () => {
  const harness = createHarness({ count: 91, includePremium: true });
  harness.corporateShortcut.dispatch("click");
  assert.equal(harness.typeFilter.value, "corporate");
  assert.ok(visibleCards(harness).every((card) => card.getAttribute("data-product-type") === "corporate"));
  harness.windowObject.history.replaceState({}, "", "https://example.test/#premium-collection");
  harness.windowObject.listeners.hashchange();
  assert.equal(harness.typeFilter.value, "premium");
  assert.ok(visibleCards(harness).every((card) => card.getAttribute("data-product-type") === "premium"));
});

test("budget filters overlap at ₹2,000 and keep higher-priced gifts in the upper range", () => {
  const harness = createHarness({ count: 8 });
  harness.cards[0].price = "₹2,000";
  harness.cards[1].price = "₹2,001";
  harness.cards[2].price = "₹1,999";
  harness.navBrowseAll.dispatch("click");

  harness.priceFilter.value = "1999";
  harness.priceFilter.dispatch("change");
  harness.applyButton.dispatch("click");
  assert.ok(visibleCards(harness).some((card) => card.id === "product-1"));
  assert.ok(visibleCards(harness).some((card) => card.id === "product-3"));
  assert.ok(visibleCards(harness).every((card) => card.id !== "product-2"));

  harness.priceFilter.value = "2000";
  harness.priceFilter.dispatch("change");
  harness.applyButton.dispatch("click");
  assert.ok(visibleCards(harness).some((card) => card.id === "product-1"));
  assert.ok(visibleCards(harness).some((card) => card.id === "product-2"));
  assert.ok(visibleCards(harness).every((card) => card.id !== "product-3"));
});

test("invalid URL state falls back to a safe full tuple while preserving unrelated params", () => {
  const harness = createHarness({ url: "https://example.test/?type=wat&budget=1.5&page=Infinity&ref=keep&x=1#catalogue-filters" });
  assert.equal(harness.typeFilter.value, "all");
  assert.equal(harness.priceFilter.value, "all");
  assert.equal(visibleCards(harness).length, 77);
  assert.equal(harness.windowObject.history.pushes.length, 0);
  assert.equal(harness.windowObject.history.replacements.length, 1);
  assert.match(harness.windowObject.location.search, /(?:^|&)type=all(?:&|$)/);
  assert.match(harness.windowObject.location.search, /(?:^|&)budget=all(?:&|$)/);
  assert.doesNotMatch(harness.windowObject.location.search, /(?:^|&)page=/);
  assert.match(harness.windowObject.location.search, /(?:\?|&)ref=keep(?:&|$)/);
  assert.match(harness.windowObject.location.search, /(?:\?|&)x=1(?:&|$)/);
});

test("reset removes catalogue query keys, collapses controls, and popstate restores without pushing", () => {
  const harness = createHarness({ url: "https://example.test/?type=corporate&budget=999&page=2&ref=keep&x=1#corporate-resin-gifts" });
  harness.filterToggle.dispatch("click");
  harness.resetButton.dispatch("click");
  assert.equal(harness.windowObject.history.pushes.length, 1);
  assert.match(harness.windowObject.location.search, /(?:\?|&)view=preview(?:&|$)/);
  assert.match(harness.windowObject.location.search, /(?:\?|&)type=bestsellers(?:&|$)/);
  assert.match(harness.windowObject.location.search, /(?:\?|&)budget=all(?:&|$)/);
  assert.doesNotMatch(harness.windowObject.location.search, /(?:^|&)page=/);
  assert.match(harness.windowObject.location.search, /(?:\?|&)ref=keep(?:&|$)/);
  assert.equal(harness.filterPanel.hidden, true);
  const previousPushes = harness.windowObject.history.pushes.length;
  harness.windowObject.listeners.popstate();
  assert.equal(harness.typeFilter.value, "bestsellers");
  assert.equal(harness.windowObject.history.pushes.length, previousPushes);
});

test("category tab bar marks the tab that matches the applied catalogue type", () => {
  const harness = createHarness({ count: 91, includePremium: true, withTabs: true });
  assert.deepEqual(harness.currentTabs(), ["bestsellers"]);
  assert.equal(harness.typeFilter.value, "bestsellers");

  harness.tabs.diwali.dispatch("click");
  assert.equal(harness.typeFilter.value, "diwali");
  assert.deepEqual(harness.currentTabs(), ["diwali"]);
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("type"), "diwali");

  harness.typeFilter.value = "corporate";
  harness.applyButton.dispatch("click");
  assert.deepEqual(harness.currentTabs(), ["corporate"]);

  harness.windowObject.history.replaceState({}, "", "https://example.test/?type=couple#catalogue-filters");
  harness.windowObject.listeners.popstate();
  assert.deepEqual(harness.currentTabs(), ["couple"]);

  harness.resetButton.dispatch("click");
  assert.deepEqual(harness.currentTabs(), ["bestsellers"]);

  harness.tabs.premium.dispatch("click");
  assert.deepEqual(harness.currentTabs(), ["premium"]);
  harness.tabs.all.dispatch("click");
  assert.equal(harness.typeFilter.value, "all");
  assert.deepEqual(harness.currentTabs(), ["all"]);
});

test("in Bestsellers and All the tab follows the section on screen; a chosen category keeps its own tab", () => {
  const harness = createHarness({ count: 91, includePremium: true, withTabs: true });
  // Sections stacked 1000px tall; top is where the first one starts on screen.
  const place = (top) => {
    harness.sections.forEach((section, index) => { section.getBoundingClientRect = () => ({ top: top + index * 1000, bottom: top + (index + 1) * 1000 }); });
    harness.windowObject.listeners.scroll();
  };
  place(500);
  assert.deepEqual(harness.currentTabs(), ["bestsellers"], "above the first section");
  place(-100);
  assert.deepEqual(harness.currentTabs(), ["diwali"]);
  place(-1100);
  assert.deepEqual(harness.currentTabs(), ["couple"]);
  place(-3100);
  assert.deepEqual(harness.currentTabs(), ["bestsellers"], "resin art has no tab, so the view's own tab shows");
  assert.equal(harness.typeFilter.value, "bestsellers", "scrolling never changes the chosen view");
  harness.tabs.all.dispatch("click");
  place(-2100);
  assert.deepEqual(harness.currentTabs(), ["corporate"]);
  harness.tabs.premium.dispatch("click");
  place(-100);
  assert.deepEqual(harness.currentTabs(), ["premium"], "a chosen category keeps its tab while scrolling");
});

test("the frames shortcut leaves every category tab unmarked", () => {
  const harness = createHarness({ withTabs: true });
  harness.framesShortcut.dispatch("click");
  assert.equal(harness.typeFilter.value, "frames");
  assert.deepEqual(harness.currentTabs(), []);
});

test("Bestsellers tab shows the first four gifts of every section with View all", () => {
  assert.match(html, /<option value="bestsellers">Bestsellers<\/option>/);
  const harness = createHarness({ count: 91, includePremium: true, withTabs: true });
  const isBestseller = (card) => card.section.cards.indexOf(card) < 4;
  const expected = harness.cards.filter(isBestseller);

  harness.tabs.bestsellers.dispatch("click");
  assert.equal(harness.typeFilter.value, "bestsellers");
  assert.deepEqual(harness.currentTabs(), ["bestsellers"]);
  assert.deepEqual(visibleCards(harness), expected);
  harness.sections.forEach((section) => {
    assert.equal(section.disclosure.hidden, section.cards.length <= 4);
    assert.equal(section.disclosure.textContent, "View all");
  });
  const url = new URL(harness.windowObject.location.href);
  assert.equal(url.searchParams.get("type"), "bestsellers");
  assert.equal(url.searchParams.get("view"), "preview");
  assert.equal(url.hash, "#catalogue-filters");

  const target = harness.sections.find((section) => section.cards.length > 4);
  target.disclosure.dispatch("click");
  assert.deepEqual(target.cards.filter((card) => !card.hidden), target.cards);
  assert.equal(target.disclosure.textContent, "Show less");
  harness.sections.filter((section) => section !== target).forEach((section) => {
    assert.ok(section.cards.filter((card) => !card.hidden).every(isBestseller));
  });
  target.disclosure.dispatch("click");
  assert.deepEqual(visibleCards(harness), expected);

  harness.tabs.all.dispatch("click");
  harness.windowObject.history.replaceState({}, "", "https://example.test/?view=preview&type=bestsellers&budget=all#catalogue-filters");
  harness.windowObject.listeners.popstate();
  assert.deepEqual(harness.currentTabs(), ["bestsellers"]);
  assert.deepEqual(visibleCards(harness), expected);

  harness.priceFilter.value = "499";
  harness.applyButton.dispatch("click");
  assert.ok(visibleCards(harness).length > 0);
  assert.ok(visibleCards(harness).every((card) => isBestseller(card) && Number(card.getAttribute("data-price-max")) <= 499));
});

test("searching from the Bestsellers home looks through every gift and clearing returns to Bestsellers", () => {
  const harness = createHarness({ count: 12, withTabs: true });
  const beyondPreview = harness.cards[8];
  beyondPreview.title = "Jewel Glow Tealight";
  harness.searchFilter.value = "Jewel Glow";
  harness.searchFilter.dispatch("input");
  assert.deepEqual(visibleCards(harness).map((card) => card.id), [beyondPreview.id]);
  assert.deepEqual(harness.currentTabs(), ["all"]);
  assert.equal(harness.typeFilter.value, "all");

  harness.searchFilter.value = "";
  harness.searchFilter.dispatch("input");
  assert.deepEqual(harness.currentTabs(), ["bestsellers"]);
  assert.equal(harness.typeFilter.value, "bestsellers");
  assert.ok(visibleCards(harness).every((card) => card.section.cards.indexOf(card) < 4));
});

test("search from a category tab looks through every gift", () => {
  const harness = createHarness({ count: 91, includePremium: true, withTabs: true });
  const coupleCard = harness.cards.find((card) => card.section.id === "romantic-keepsakes");
  coupleCard.title = "Heart keychain";
  harness.tabs.diwali.dispatch("click");
  assert.deepEqual(harness.currentTabs(), ["diwali"]);
  harness.searchFilter.value = "heart";
  harness.searchFilter.dispatch("input");
  assert.deepEqual(visibleCards(harness).map((card) => card.id), [coupleCard.id]);
  assert.deepEqual(harness.currentTabs(), ["all"]);
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("type"), "all");
  harness.searchFilter.value = "";
  harness.searchFilter.dispatch("input");
  assert.deepEqual(harness.currentTabs(), ["bestsellers"]);
});

test("the search label keeps a small gap above the search box", () => {
  assert.match(css, /\.catalogue-search-field\s*\{[^}]*display:\s*grid[^}]*gap:\s*\.4rem/);
});

test("a saved link with a search and a category still searches every gift", () => {
  const harness = createHarness({ count: 91, includePremium: true, withTabs: true, url: "https://example.test/?type=diwali&budget=all&q=heart#catalogue-filters" });
  assert.equal(harness.typeFilter.value, "all");
  assert.deepEqual(harness.currentTabs(), ["all"]);
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("type"), "all");
});

test("misspelled searches show the closest matching gifts with a note", () => {
  const harness = createHarness({ count: 12 });
  harness.cards[3].title = "Heart trinket tray";
  harness.cards[7].title = "Couple keychain";
  harness.cards[9].title = "Lotus diya pair";
  const search = (value) => {
    harness.searchFilter.value = value;
    harness.searchFilter.dispatch("input");
    return visibleCards(harness).map((card) => card.title);
  };
  assert.deepEqual(search("haert"), ["Heart trinket tray"], "swapped letters");
  assert.equal(harness.status.textContent, "Showing close matches for “haert”.");
  assert.deepEqual(search("hert"), ["Heart trinket tray"], "missing letter");
  assert.deepEqual(search("keychian"), ["Couple keychain"], "swapped letters in a long word");
  assert.deepEqual(search("cuple keychain"), ["Couple keychain"], "every word must match");
  assert.deepEqual(search("heart"), ["Heart trinket tray"], "exact match");
  assert.equal(harness.status.textContent, "", "exact matches show no note");
  assert.deepEqual(search("dya"), [], "short words need an exact match");
  assert.deepEqual(search("zzzzz"), []);
  assert.equal(harness.status.textContent, "No gifts match those choices.");
});

// A dialog's own history step (order, lightbox, My orders) fires popstate without changing the URL.
// That must not re-apply the catalogue state: it would collapse the section the shopper opened and jump the page.
test("a popstate that leaves the URL unchanged keeps the open section and does not scroll or re-apply filters", () => {
  const harness = createHarness();
  const target = harness.sections[1];
  target.disclosure.dispatch("click");
  assert.equal(target.disclosure.getAttribute("aria-expanded"), "true");
  const scrollsBefore = harness.eventLog.filter((entry) => entry === "scroll").length;
  const writesBefore = harness.windowObject.history.pushes.length + harness.windowObject.history.replacements.length;
  harness.windowObject.listeners.popstate();
  assert.equal(target.disclosure.getAttribute("aria-expanded"), "true", "the open section stays open");
  assert.equal(target.cards.filter((card) => !card.hidden).length, target.cards.length);
  assert.equal(harness.eventLog.filter((entry) => entry === "scroll").length, scrollsBefore, "no scroll");
  assert.equal(harness.windowObject.history.pushes.length + harness.windowObject.history.replacements.length, writesBefore);
});

test("an unchanged-URL popstate is also ignored after a filter was applied and written to the URL, and after a restore", () => {
  const harness = createHarness({ count: 77 });
  harness.navBrowseAll.dispatch("click");
  harness.typeFilter.value = "corporate";
  harness.applyButton.dispatch("click");
  const shown = visibleCards(harness).length;
  harness.searchFilter.value = "typed but not applied";
  harness.windowObject.listeners.popstate();
  assert.equal(harness.searchFilter.value, "typed but not applied", "the unchanged URL is not re-applied");
  assert.equal(visibleCards(harness).length, shown);
  // After a real restore the new URL is the applied one, so a second popstate there is ignored too.
  harness.windowObject.history.replaceState({}, "", "https://example.test/?type=couple#catalogue-filters");
  harness.windowObject.listeners.popstate();
  assert.equal(harness.typeFilter.value, "couple");
  harness.searchFilter.value = "again";
  harness.windowObject.listeners.popstate();
  assert.equal(harness.searchFilter.value, "again");
});

test("real Back and Forward between catalogue states still restore them, including a hash-only change", () => {
  const harness = createHarness({ count: 77 });
  const target = harness.sections[1];
  target.disclosure.dispatch("click");
  harness.navBrowseAll.dispatch("click");
  harness.typeFilter.value = "corporate";
  harness.applyButton.dispatch("click");
  assert.equal(new URL(harness.windowObject.location.href).searchParams.get("type"), "corporate");
  // Back to the previous catalogue entry: the URL changed, so the state is restored.
  harness.windowObject.history.replaceState({}, "", "https://example.test/?type=all&budget=all#catalogue-filters");
  harness.windowObject.listeners.popstate();
  assert.equal(harness.typeFilter.value, "all");
  // Forward again.
  harness.windowObject.history.replaceState({}, "", "https://example.test/?type=corporate&budget=all#catalogue-filters");
  harness.windowObject.listeners.popstate();
  assert.equal(harness.typeFilter.value, "corporate");
  // Back to the featured page with only a different hash.
  harness.windowObject.history.replaceState({}, "", "https://example.test/#catalogue-filters");
  harness.windowObject.listeners.popstate();
  assert.equal(harness.typeFilter.value, "bestsellers");
  harness.windowObject.history.replaceState({}, "", "https://example.test/#premium-collection");
  harness.windowObject.listeners.popstate();
  assert.equal(harness.typeFilter.value, "bestsellers");
});
