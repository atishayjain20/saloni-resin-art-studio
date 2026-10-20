const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

class Element {
  constructor(id, value = "") {
    this.id = id; this.value = value; this.textContent = ""; this.hidden = false; this.name = id;
    this.listeners = {}; this.children = []; this.attributes = {}; this.files = [];
    this.contentWindow = {}; this.classList = { add() {}, remove() {} };
  }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  dispatch(type, event = {}) { if (this.listeners[type]) this.listeners[type](Object.assign({ target: this }, event)); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || ""; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }
  appendChild(child) { this.children.push(child); return child; }
  remove() {}
  querySelector(selector) {
    if (selector === "img[src]") return this.image;
    if (selector === "figcaption strong") return this.titleTag === "strong" ? this.title : null;
    if (selector === "figcaption h3") return this.titleTag === "h3" ? this.title : null;
    if (selector === "figcaption") return this.caption;
    if (selector === ".product-pricing dt") return this.priceLabel || null;
    if (selector === ".product-pricing dd") return this.priceValue || null;
    if (selector === "[data-order-prefill]") return null;
    return null;
  }
  querySelectorAll(selector) {
    if (selector === "figcaption p") return this.detailNodes || [];
    return [];
  }
  scrollIntoView() {}
}

class CapturingPort {
  constructor() { this.messages = []; this.closed = false; }
  postMessage(message) { if (!this.closed) this.messages.push(message); }
  close() { this.closed = true; }
}

function runFlow({ configured = true, frameType = "square", framePreset = "8", frameUnit = "in", confirms = [] } = {}) {
  const elements = new Map();
  const embed = new Element("order-form-embed");
  embed.attributes["data-order-form-url"] = configured ? "https://script.google.test/exec" : "https://script.google.test/REPLACE_WITH_ID/exec";
  const frame = new Element("order-form-frame"); frame.name = "order-frame";
  const status = new Element("order-form-status");
  const customizer = new Element("order-from-customizer");
  const summary = new Element("customizer-summary"); summary.textContent = "Custom details";
  const dimension = new Element("preview-dimension-label");
  dimension.textContent = "Soft arch · 0.50 ft × 0.67 ft (3:4)";
  const frameTypeControl = new Element("frame-type", frameType);
  const framePresetControl = new Element("frame-preset", framePreset);
  const frameUnitControl = new Element("frame-unit", frameUnit);
  [embed, frame, status, customizer, summary, dimension, frameTypeControl, framePresetControl, frameUnitControl].forEach((element) => elements.set(element.id, element));
  const card = new Element("catalogue-card");
  card.caption = new Element("figcaption");
  card.image = { getAttribute: () => "assets/test-frame.png" };
  card.title = { textContent: "Test frame" };
  card.titleTag = "strong";
  card.detailNodes = [{ textContent: "Blue and gold" }];
  const highlightCard = new Element("romantic-keepsake-card");
  highlightCard.caption = new Element("figcaption");
  highlightCard.image = { getAttribute: () => "assets/studio-red-rose-resin-display.jpeg" };
  highlightCard.title = { textContent: "Preserved rose display" };
  highlightCard.titleTag = "h3";
  highlightCard.detailNodes = [{ textContent: "Preserved red roses, held close for a lasting moment." }];
  const generatedCatalogue = [
    ["concept-floral-memory-frame.webp", "Your flowers, held close", "6,749"],
    ["concept-ocean-clock.webp", "A little blue hour", "2,749"],
    ["concept-tray-hamper.webp", "A tray full of celebration", "2,199"],
    ["concept-floral-coasters.webp", "Little messages, shared", "1,549"],
  ];
  const generatedCards = generatedCatalogue.map(([asset, title, price]) => {
    const generatedCard = new Element("generated-catalogue-card");
    generatedCard.caption = new Element("figcaption");
    generatedCard.image = { getAttribute: () => `assets/${asset}` };
    generatedCard.title = { textContent: title };
    generatedCard.titleTag = "strong";
    generatedCard.detailNodes = [
      { textContent: "Flowers from a favourite day, held in a soft arch." },
      { textContent: "Final quote after size, materials and delivery. Saloni first confirms whether she can make it, then confirms materials, final design, price, and delivery." },
    ];
    generatedCard.priceLabel = { textContent: "Average listed price" };
    generatedCard.priceValue = { textContent: `₹${price}` };
    return generatedCard;
  });
  const posted = [];
  const body = { appendChild() {}, removeChild() {} };
  const windowObject = {
    crypto: { randomUUID: (() => { let n = 0; return () => "request-" + (++n); })() },
    matchMedia: () => ({ matches: true }),
    confirm: () => confirms.length ? confirms.shift() : true,
    addEventListener(type, listener) { if (type === "message") this.messageListener = listener; },
    setTimeout: () => 1,
    clearTimeout() {},
    grecaptcha: { ready(callback) { callback(); }, execute() { return Promise.resolve("parent-token"); } },
  };
  const documentObject = {
    documentElement: { classList: { add() {} } },
    body,
    addEventListener(type, listener) { if (type === "DOMContentLoaded") this.ready = listener; },
    getElementById(id) { return elements.get(id) || null; },
    querySelectorAll(selector) { return selector === "[data-carousel] .work-card, .romantic-keepsake-card" ? [card, highlightCard, ...generatedCards] : []; },
    querySelector(selector) { return selector === '[data-order-prefill="customizer"]' ? customizer : null; },
    createElement(tag) {
      const element = new Element(tag);
      if (tag === "form") {
        element.submit = () => posted.push(element);
      }
      return element;
    },
  };
  const context = { console, document: documentObject, window: windowObject, IntersectionObserver: undefined, Date, Math };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "script.js" });
  documentObject.ready();
  const catalogueButton = card.caption.children.find((child) => child.attributes["data-order-prefill"] === "catalogue");
  const highlightCatalogueButton = highlightCard.caption.children.find((child) => child.attributes["data-order-prefill"] === "catalogue");
  const generatedCatalogueButtons = generatedCards.map((generatedCard) => generatedCard.caption.children.find((child) => child.attributes["data-order-prefill"] === "catalogue"));
  return { elements, card, catalogueButton, highlightCard, highlightCatalogueButton, generatedCards, generatedCatalogueButtons, generatedCard: generatedCards[0], generatedCatalogueButton: generatedCatalogueButtons[0], customizer, posted, windowObject };
}

function submittedSeed(posted) {
  const form = posted.at(-1);
  const seedInput = form.children.find((child) => child.name === "seed");
  return JSON.parse(seedInput.value);
}

test("starts two orders for the same catalogue item with new IDs only after confirmed replacement", () => {
  const flow = runFlow({ confirms: [false, true] });
  flow.catalogueButton.dispatch("click");
  const first = submittedSeed(flow.posted);
  flow.catalogueButton.dispatch("click");
  assert.equal(flow.posted.length, 1);
  flow.catalogueButton.dispatch("click");
  const second = submittedSeed(flow.posted);
  assert.notEqual(second.requestId, first.requestId);
});

test("adds the catalogue order control to highlighted keepsake cards", () => {
  const flow = runFlow();
  assert.ok(flow.highlightCatalogueButton);
  flow.highlightCatalogueButton.dispatch("click");
  const seed = submittedSeed(flow.posted);
  assert.equal(seed.productName, "Preserved rose display");
  assert.equal(seed.sourceId, "catalogue:studio-red-rose-resin-display.jpeg");
});

test("reads square, round, and arch dimensions from customizer controls, including feet", () => {
  const square = runFlow({ frameType: "square", framePreset: "8", frameUnit: "in" });
  square.customizer.dispatch("click");
  let seed = submittedSeed(square.posted);
  assert.deepEqual([seed.height, seed.heightUnit, seed.width, seed.widthUnit], ["8", "in", "8", "in"]);
  assert.deepEqual([seed.dimensionFormat, seed.heightFeet, seed.heightInchesPart, seed.widthFeet, seed.widthInchesPart], ["feet-inches", "0", "8", "0", "8"]);

  const round = runFlow({ frameType: "round", framePreset: "10", frameUnit: "in" });
  round.customizer.dispatch("click");
  seed = submittedSeed(round.posted);
  assert.deepEqual([seed.height, seed.heightUnit, seed.width, seed.widthUnit], ["10", "in", "10", "in"]);

  const arch = runFlow({ frameType: "arch", framePreset: "6", frameUnit: "ft" });
  arch.customizer.dispatch("click");
  seed = submittedSeed(arch.posted);
  assert.deepEqual([seed.height, seed.heightUnit, seed.width, seed.widthUnit], ["0.67", "ft", "0.50", "ft"]);
  assert.deepEqual([seed.heightFeet, seed.heightInchesPart, seed.widthFeet, seed.widthInchesPart], ["0", "8.04", "0", "6"]);
});

test("leaves catalogue dimensions blank when the catalogue has no real size", () => {
  const flow = runFlow();
  flow.catalogueButton.dispatch("click");
  const seed = submittedSeed(flow.posted);
  assert.deepEqual([seed.heightFeet, seed.heightInchesPart, seed.widthFeet, seed.widthInchesPart], ["", "", "", ""]);
});

test("uses the shared catalogue CTA and preserves generated-design details in a catalogue seed", () => {
  const flow = runFlow();
  assert.equal(flow.generatedCatalogueButton.textContent, "Start an order");
  assert.equal(flow.catalogueButton.textContent, "Start an order");
  flow.generatedCatalogueButton.dispatch("click");
  const seed = submittedSeed(flow.posted);
  assert.equal(seed.sourceKind, "catalogue");
  assert.equal(seed.sourceId, "catalogue:concept-floral-memory-frame.webp");
  assert.deepEqual([seed.heightFeet, seed.heightInchesPart, seed.widthFeet, seed.widthInchesPart], ["", "", "", ""]);
  assert.doesNotMatch(seed.designDetails, /Market reference/);
  assert.match(seed.designDetails, /Final quote after size, materials and delivery\./);
  assert.match(seed.designDetails, /Saloni first confirms whether she can make it, then confirms materials, final design, price, and delivery\./);
});

test("includes each generated design average listed price in order seed details", () => {
  const flow = runFlow();
  const expected = [
    ["concept-floral-memory-frame.webp", "6,749"],
    ["concept-ocean-clock.webp", "2,749"],
    ["concept-tray-hamper.webp", "2,199"],
    ["concept-floral-coasters.webp", "1,549"],
  ];
  expected.forEach(([asset, price], index) => {
    flow.generatedCatalogueButtons[index].dispatch("click");
    const seed = submittedSeed(flow.posted);
    assert.equal(seed.sourceId, `catalogue:${asset}`);
    assert.ok(seed.designDetails.includes(`Average listed price: ₹${price}`));
  });
});

test("owns CAPTCHA token requests on the exact studio origin and pinned sender", () => {
  assert.match(source, /https:\/\/saloniresinart\.com/);
  assert.match(source, /pinnedSender/);
  assert.match(source, /pinnedOrigin/);
  assert.match(source, /event\.ports\[0\]/);
  assert.match(source, /activeCaptcha/);
  assert.doesNotMatch(source, /CHILD_ORIGIN/);
});

test("pins a nested form sender and observed sandbox origin, then rejects stale or foreign messages", async () => {
  const flow = runFlow({ confirms: [true] });
  flow.catalogueButton.dispatch("click");
  const first = submittedSeed(flow.posted);
  const nestedSource = {};
  const sandboxOrigin = "https://script.googleusercontent.com";
  flow.windowObject.messageListener({ origin: sandboxOrigin, source: nestedSource, data: { type: "saloni-order-form-ready", nonce: first.channelNonce, siteKey: "site-key" }, ports: [] });
  const firstPort = new CapturingPort();
  flow.windowObject.messageListener({ origin: sandboxOrigin, source: nestedSource, data: { type: "saloni-order-captcha-request", nonce: first.channelNonce, attemptId: "attempt-1" }, ports: [firstPort] });
  await Promise.resolve();
  assert.equal(firstPort.messages[0].token, "parent-token");
  flow.catalogueButton.dispatch("click");
  const second = submittedSeed(flow.posted);
  assert.notEqual(second.channelNonce, first.channelNonce);
  const stalePort = new CapturingPort();
  flow.windowObject.messageListener({ origin: sandboxOrigin, source: nestedSource, data: { type: "saloni-order-captcha-request", nonce: first.channelNonce, attemptId: "stale" }, ports: [stalePort] });
  const foreignPort = new CapturingPort();
  flow.windowObject.messageListener({ origin: sandboxOrigin, source: {}, data: { type: "saloni-order-captcha-request", nonce: second.channelNonce, attemptId: "foreign" }, ports: [foreignPort] });
  assert.equal(stalePort.messages.length, 0);
  assert.equal(foreignPort.messages.length, 0);
  const replacementSource = {};
  const replacementOrigin = "https://1234567890-1lu-script.googleusercontent.com";
  flow.windowObject.messageListener({ origin: replacementOrigin, source: replacementSource, data: { type: "saloni-order-form-ready", nonce: second.channelNonce, siteKey: "site-key" }, ports: [] });
  const replacementPort = new CapturingPort();
  flow.windowObject.messageListener({ origin: replacementOrigin, source: replacementSource, data: { type: "saloni-order-captcha-request", nonce: second.channelNonce, attemptId: "attempt-2" }, ports: [replacementPort] });
  await Promise.resolve();
  assert.equal(replacementPort.messages[0].token, "parent-token");
});
