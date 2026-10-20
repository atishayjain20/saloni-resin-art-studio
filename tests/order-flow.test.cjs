const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const FINAL_QUOTE_NOTE = "Final quote after size, materials and delivery. Saloni first confirms whether she can make it, then confirms materials, final design, price, and delivery.";

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
    if (selector === "figcaption span") return this.disclosure || null;
    if (selector === ".product-pricing dt") return this.priceLabel || null;
    if (selector === ".product-pricing dd") return this.priceValue || null;
    if (selector === "[data-order-prefill]") return null;
    return null;
  }
  querySelectorAll(selector) {
    if (selector === "figcaption p") return this.detailNodes || [];
    if (selector === ".product-pricing > div") return this.priceRows || [];
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
  const romanticExistingCatalogue = [
    ["studio-rose-hexagon-keepsake.jpeg", "Rose hexagon", "First rose from a boyfriend, held in love."],
    ["studio-personalized-photo-clock.jpeg", "Personalized photo clock", "A favourite couple photo, held in a clock."],
    ["romantic-hamper.jpg", "Say it without a speech", "Photos, flowers, and the little words that are better kept close."],
    ["studio-red-rose-resin-display.jpeg", "Preserved rose display", "Preserved red roses, held close for a lasting moment."],
  ];
  const romanticExistingCards = romanticExistingCatalogue.map(([asset, title, copy]) => {
    const existingCard = new Element("romantic-keepsake-card");
    existingCard.caption = new Element("figcaption");
    existingCard.image = { getAttribute: () => `assets/${asset}` };
    existingCard.title = { textContent: title };
    existingCard.titleTag = "h3";
    existingCard.detailNodes = [{ textContent: copy }];
    return existingCard;
  });
  const highlightCard = romanticExistingCards[3];
  const generatedCatalogue = [
    ["concept-floral-memory-frame.webp", "Your flowers, held close", "8,999", "6,749", 25],
    ["concept-ocean-clock.webp", "A little blue hour", "3,999", "2,749", 31],
    ["concept-tray-hamper.webp", "A tray full of celebration", "2,999", "2,199", 27],
    ["concept-floral-coasters.webp", "Little messages, shared", "2,199", "1,549", 30],
  ];
  const generatedCards = generatedCatalogue.map(([asset, title, regular, festive, discount]) => {
    const generatedCard = new Element("generated-catalogue-card");
    generatedCard.caption = new Element("figcaption");
    generatedCard.image = { getAttribute: () => `assets/${asset}` };
    generatedCard.title = { textContent: title };
    generatedCard.titleTag = "strong";
    generatedCard.detailNodes = [
      { textContent: "Flowers from a favourite day, held in a soft arch." },
    ];
    generatedCard.priceRows = [
      ["Regular price", `₹${regular}`],
      ["Festive price", `₹${festive}`],
      ["Discount", `${discount}% off`],
    ].map(([label, value]) => ({ querySelector(selector) { return selector === "dt" ? { textContent: label } : { textContent: value }; } }));
    return generatedCard;
  });
  const romanticCatalogue = [
    ["romantic-us-keychain-pair.webp", "Two keys, one little us", "Made to travel together, even when you cannot.", "899", "599", 33],
    ["romantic-floral-bookmark-set.webp", "Save our page", "Three little places to keep the chapters that feel like yours.", "1,199", "799", 33],
    ["romantic-calendar-coaster.webp", "Our date, every day", "The day everything changed, circled for every ordinary morning after.", "1,499", "1,099", 27],
    ["romantic-first-rose-bracelet.webp", "The first rose, still with me", "One petal from the beginning, made wearable.", "999", "699", 30],
    ["romantic-heart-trinket-tray.webp", "Tiny tray, big feelings", "A soft place for rings, earbuds, and the little things you share.", "699", "399", 43],
    ["romantic-initial-desk-stand.webp", "Your initial. Mine. Ours.", "Two letters, one small corner that belongs to both of you.", "1,299", "899", 31],
    ["romantic-botanical-pendant.webp", "A little piece of our season", "Pressed flowers and a name, kept close.", "899", "599", 33],
    ["romantic-ocean-memory-tray.webp", "Our place, held in waves", "For the beach, trip, or city that became part of your story.", "1,999", "1,499", 25],
    ["romantic-couple-scene.webp", "Our favourite little scene", "A tiny version of the everyday moment you would replay.", "1,299", "899", 31],
    ["romantic-couple-miniature.webp", "Your story, in 3D", "Two people, one meaningful detail, made into a shelf-sized memory.", "3,499", "2,499", 29],
  ];
  const romanticConceptCards = romanticCatalogue.map(([asset, title, copy, regular, festive, discount]) => {
    const romanticCard = new Element("romantic-keepsake-card");
    romanticCard.caption = new Element("figcaption");
    romanticCard.image = { getAttribute: () => `assets/${asset}` };
    romanticCard.title = { textContent: title };
    romanticCard.titleTag = "h3";
    romanticCard.disclosure = { textContent: "Concept preview · made to order" };
    romanticCard.detailNodes = [
      { textContent: copy },
    ];
    romanticCard.priceRows = [
      ["Regular price", `₹${regular}`],
      ["Festive price", `₹${festive}`],
      ["Discount", `${discount}% off`],
    ].map(([label, value]) => ({ querySelector(selector) { return selector === "dt" ? { textContent: label } : { textContent: value }; } }));
    return romanticCard;
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
    querySelectorAll(selector) { return selector === "[data-carousel] .work-card, .romantic-keepsake-card" ? [card, ...romanticExistingCards, ...generatedCards, ...romanticConceptCards] : []; },
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
  const romanticExistingButtons = romanticExistingCards.map((existingCard) => existingCard.caption.children.find((child) => child.attributes["data-order-prefill"] === "catalogue"));
  const generatedCatalogueButtons = generatedCards.map((generatedCard) => generatedCard.caption.children.find((child) => child.attributes["data-order-prefill"] === "catalogue"));
  const romanticConceptButtons = romanticConceptCards.map((romanticCard) => romanticCard.caption.children.find((child) => child.attributes["data-order-prefill"] === "catalogue"));
  return { elements, card, catalogueButton, highlightCard, highlightCatalogueButton, romanticExistingCards, romanticExistingButtons, generatedCards, generatedCatalogueButtons, generatedCard: generatedCards[0], generatedCatalogueButton: generatedCatalogueButtons[0], romanticConceptCards, romanticConceptButtons, customizer, posted, windowObject };
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
  assert.doesNotMatch(seed.designDetails, new RegExp(FINAL_QUOTE_NOTE));
});

test("includes each generated design pricing in order seed details", () => {
  const flow = runFlow();
  const expected = [
    ["concept-floral-memory-frame.webp", "8,999", "6,749", 25],
    ["concept-ocean-clock.webp", "3,999", "2,749", 31],
    ["concept-tray-hamper.webp", "2,999", "2,199", 27],
    ["concept-floral-coasters.webp", "2,199", "1,549", 30],
  ];
  expected.forEach(([asset, regular, festive, discount], index) => {
    flow.generatedCatalogueButtons[index].dispatch("click");
    const seed = submittedSeed(flow.posted);
    assert.equal(seed.sourceId, `catalogue:${asset}`);
    assert.deepEqual([seed.heightFeet, seed.heightInchesPart, seed.widthFeet, seed.widthInchesPart], ["", "", "", ""]);
    assert.ok(seed.designDetails.includes(`Regular price: ₹${regular}`));
    assert.ok(seed.designDetails.includes(`Festive price: ₹${festive}`));
    assert.ok(seed.designDetails.includes(`Discount: ${discount}% off`));
    assert.doesNotMatch(seed.designDetails, new RegExp(FINAL_QUOTE_NOTE));
    assert.doesNotMatch(seed.designDetails, /Average listed price/);
  });
});

test("seeds every romantic concept with its disclosure, exact price, and blank dimensions", () => {
  const flow = runFlow();
  const expected = [
    ["romantic-us-keychain-pair.webp", "Two keys, one little us", "Made to travel together, even when you cannot.", "899", "599", 33],
    ["romantic-floral-bookmark-set.webp", "Save our page", "Three little places to keep the chapters that feel like yours.", "1,199", "799", 33],
    ["romantic-calendar-coaster.webp", "Our date, every day", "The day everything changed, circled for every ordinary morning after.", "1,499", "1,099", 27],
    ["romantic-first-rose-bracelet.webp", "The first rose, still with me", "One petal from the beginning, made wearable.", "999", "699", 30],
    ["romantic-heart-trinket-tray.webp", "Tiny tray, big feelings", "A soft place for rings, earbuds, and the little things you share.", "699", "399", 43],
    ["romantic-initial-desk-stand.webp", "Your initial. Mine. Ours.", "Two letters, one small corner that belongs to both of you.", "1,299", "899", 31],
    ["romantic-botanical-pendant.webp", "A little piece of our season", "Pressed flowers and a name, kept close.", "899", "599", 33],
    ["romantic-ocean-memory-tray.webp", "Our place, held in waves", "For the beach, trip, or city that became part of your story.", "1,999", "1,499", 25],
    ["romantic-couple-scene.webp", "Our favourite little scene", "A tiny version of the everyday moment you would replay.", "1,299", "899", 31],
    ["romantic-couple-miniature.webp", "Your story, in 3D", "Two people, one meaningful detail, made into a shelf-sized memory.", "3,499", "2,499", 29],
  ];
  expected.forEach(([asset, title, copy, regular, festive, discount], index) => {
    const button = flow.romanticConceptButtons[index];
    assert.equal(button.textContent, "Start an order");
    button.dispatch("click");
    const seed = submittedSeed(flow.posted);
    assert.equal(seed.sourceId, `catalogue:${asset}`);
    assert.equal(seed.productName, title);
    assert.match(seed.designDetails, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(seed.designDetails, /Concept preview · made to order/);
    assert.match(seed.designDetails, new RegExp(`Regular price: ₹${regular}`));
    assert.match(seed.designDetails, new RegExp(`Festive price: ₹${festive}`));
    assert.match(seed.designDetails, new RegExp(`Discount: ${discount}% off`));
    assert.doesNotMatch(seed.designDetails, /Average listed price/);
    assert.deepEqual([seed.heightFeet, seed.heightInchesPart, seed.widthFeet, seed.widthInchesPart], ["", "", "", ""]);
  });
});

test("keeps order seeds correct at the first, tenth, eleventh, and fourteenth romantic cards", () => {
  const flow = runFlow();
  const selected = [
    [flow.romanticConceptButtons[0], "catalogue:romantic-us-keychain-pair.webp", "Two keys, one little us"],
    [flow.romanticConceptButtons[9], "catalogue:romantic-couple-miniature.webp", "Your story, in 3D"],
    [flow.romanticExistingButtons[0], "catalogue:studio-rose-hexagon-keepsake.jpeg", "Rose hexagon"],
    [flow.romanticExistingButtons[3], "catalogue:studio-red-rose-resin-display.jpeg", "Preserved rose display"],
  ];
  selected.forEach(([button, sourceId, productName]) => {
    button.dispatch("click");
    const seed = submittedSeed(flow.posted);
    assert.equal(seed.sourceId, sourceId);
    assert.equal(seed.productName, productName);
    assert.deepEqual([seed.heightFeet, seed.heightInchesPart, seed.widthFeet, seed.widthInchesPart], ["", "", "", ""]);
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
