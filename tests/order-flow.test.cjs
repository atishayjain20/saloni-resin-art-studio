const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const page = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const FINAL_QUOTE_NOTE = "Final quote after size, materials and delivery. Saloni first confirms whether she can make it, then confirms materials, final design, price, and delivery.";

const CORPORATE_RESIN_GIFTS = [
  ["corporate-logo-keychain-concept.webp", "Logo resin keychain", "Clear resin with a name/initial and subtle brand-colour accents.", "Price for one piece.", "299", "199", 33],
  ["corporate-floral-bookmark-concept.webp", "Pressed-flower bookmark", "A slim resin bookmark for welcome kits or thoughtful team gifts.", "Price for one piece.", "249", "149", 40],
  ["corporate-logo-paperweight-concept.webp", "Logo paperweight", "A polished desk keepsake with a logo or short message sealed inside.", "Price for one piece.", "499", "399", 20],
  ["corporate-desk-nameplate-concept.webp", "Resin desk nameplate", "Personalised with a name, designation and brand colours.", "Price for one piece.", "999", "799", 20],
  ["corporate-logo-coaster-set-concept.webp", "Branded coaster set", "Four coordinated coasters for desks, meeting rooms or client kits.", "Price for a set of four.", "999", "749", 25],
  ["corporate-fridge-magnet-concept.webp", "Resin fridge magnet", "A compact branded keepsake for events and team celebrations.", "Price for one piece.", "249", "179", 28],
  ["corporate-desk-logo-stand-concept.webp", "Mini resin desk stand", "A small decorative resin stand for desks, reception counters or car dashboards.", "Price for one piece.", "249", "179", 28],
  ["corporate-recognition-award-concept.webp", "Recognition resin award", "A modern personalised memento for milestones and appreciation.", "Price for one piece.", "1,299", "899", 31],
  ["corporate-desk-organizer-concept.webp", "Resin desk organiser", "A compact pen and visiting-card holder with custom colours.", "Price for one piece.", "899", "699", 22],
  ["corporate-business-card-holder-concept.webp", "Resin Business Card Holder", "A compact resin holder for a tidy stack of visiting cards.", "Price for one card holder; cards not included.", "599", "449", 25],
  ["corporate-phone-rest-concept.webp", "Resin Phone Rest", "A steady resin rest for a phone on a desk or bedside table.", "Price for one phone rest; phone not included.", "699", "499", 29],
  ["corporate-pen-cup-concept.webp", "Resin Pen Cup", "A polished pen cup with a clean, colourful resin finish.", "Price for one pen cup; stationery not included.", "899", "699", 22],
  ["corporate-desk-trinket-tray-concept.webp", "Desk Trinket Tray", "A small catch-all tray for a desk, console, or bedside table.", "Price for one tray; contents not included.", "599", "449", 25],
  ["corporate-lanyard-charm-concept.webp", "Personalised Lanyard Charm", "A personalised charm that clips onto a lanyard or bag.", "Price for one charm with clasp; lanyard not included.", "299", "199", 33],
  ["corporate-mini-photo-stand-concept.webp", "Mini Photo Stand", "A compact photo stand for a desk memory or team note.", "Price for one base with metal clip; print not included.", "399", "299", 25],
  ["corporate-bag-tag-concept.webp", "Personalised Bag Tag", "A personalised resin tag with a simple strap for a bag or case.", "Price for one tag with strap.", "399", "299", 25],
  ["corporate-desk-clock-concept.webp", "Mini Resin Desk Clock", "A small resin clock to add a considered accent to a work desk.", "Price for one clock with stand; battery not included.", "1,299", "999", 23],
  ["corporate-bookmark-keychain-duo-concept.webp", "Welcome Keepsake Duo", "A bookmark and keychain duo for a useful welcome keepsake.", "Price for a two-piece set.", "599", "449", 25],
  ["corporate-desk-essentials-set-concept.webp", "Desk Essentials Set", "A coordinated pen cup and trinket tray for a complete desk set.", "Price for one pen cup and one trinket tray.", "1,499", "1,199", 20],
];

const DIWALI_NEW_CONCEPTS = [
  ["diwali-marigold-petal-holder-concept.webp", "Marigold Petal Holder", "A warm marigold-inspired cup for a soft festive glow.", "one LED tealight holder · LED not included", "349", "249", 29],
  ["diwali-ivory-mandala-holder-concept.webp", "Ivory Mandala Holder", "An ivory mandala cup with a calm, hand-finished festive feel.", "one LED tealight holder · LED not included", "399", "299", 25],
  ["diwali-ruby-leaf-dish-concept.webp", "Ruby Leaf Dish", "A ruby-red leaf dish for a small festive offering or accent.", "one decorative dish", "399", "299", 25],
  ["diwali-saffron-tilak-duo-concept.webp", "Saffron Tilak Duo", "Two saffron-toned mini dishes for tilak and rice.", "two mini dishes", "449", "349", 22],
  ["diwali-pearl-rangoli-accent-concept.webp", "Pearl Rangoli Accent", "A pearly rangoli-inspired accent for an entryway or prayer corner.", "one decorative accent", "499", "399", 20],
  ["diwali-emerald-led-holder-pair-concept.webp", "Emerald Glow Pair", "A pair of emerald cups for a jewel-toned LED-lit arrangement.", "pair of LED tealight holders · LEDs not included", "549", "399", 27],
  ["diwali-rose-petal-offering-plate-concept.webp", "Rose Petal Offering Plate", "A rosy ritual plate with a gentle petal-inspired edge.", "one decorative ritual plate", "499", "349", 30],
  ["diwali-golden-toran-charms-concept.webp", "Golden Toran Charms", "Three golden hanging charms to style a festive doorway or wall.", "set of three hanging charms with cords", "599", "449", 25],
  ["diwali-lotus-rangoli-duo-concept.webp", "Lotus Rangoli Duo", "Two lotus pieces for a small layered rangoli arrangement.", "set of two decorative lotus pieces", "499", "399", 20],
  ["diwali-festive-keepsake-box-concept.webp", "Festive Keepsake Box", "A small lidded box for a keepsake, note, or festive token.", "one small lidded box · contents not included", "599", "449", 25],
];

class Element {
  constructor(id, value = "") {
    this.id = id; this.value = value; this.textContent = ""; this._innerHTML = ""; this.hidden = false; this.name = id;
    this.listeners = {}; this.children = []; this.attributes = {}; this.files = [];
    this.contentWindow = {}; this.classList = { add() {}, remove() {} };
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) { this._innerHTML = String(value); this.textContent = this._innerHTML.replace(/<[^>]*>/g, ""); }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  focus(options) { this.focused = true; this.focusOptions = options || {}; }
  dispatch(type, event = {}) { if (this.listeners[type]) this.listeners[type](Object.assign({ target: this }, event)); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || ""; }
  removeAttribute(name) { delete this.attributes[name]; }
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

function runFlow({ configured = true, frameType = "square", framePreset = "8", frameUnit = "in", confirms = [], mode = "order", intakeReady, longCatalogueTitle = false } = {}) {
  const elements = new Map();
  const embed = new Element("order-form-embed");
  embed.attributes["data-order-form-url"] = configured ? "https://script.google.test/exec" : "https://script.google.test/REPLACE_WITH_ID/exec";
  const orderDialog = new Element("order-dialog");
  orderDialog.open = false;
  orderDialog.showModal = () => { orderDialog.open = true; };
  orderDialog.close = () => { orderDialog.open = false; orderDialog.dispatch("close"); };
  const orderDialogClose = new Element("order-dialog-close");
  if (mode !== "order") embed.attributes["data-form-mode"] = mode;
  if (intakeReady !== undefined) embed.attributes["data-intake-ready"] = String(intakeReady);
  const frame = new Element("order-form-frame"); frame.name = "order-frame"; frame.hidden = true;
  const status = new Element("order-form-status");
  const continueOrder = new Element("order-continue-request"); continueOrder.hidden = true;
  const selectedProductSummary = new Element("selected-product-summary"); selectedProductSummary.hidden = true;
  const selectedProductImage = new Element("selected-product-image");
  const selectedProductName = new Element("selected-product-name");
  const selectedProductPrice = new Element("selected-product-price"); selectedProductPrice.hidden = true;
  const selectedProductSize = new Element("selected-product-size"); selectedProductSize.hidden = true;
  const catalogueSelection = new Element("catalogue-selection"); catalogueSelection.hidden = true;
  const catalogueSelectionSummary = new Element("catalogue-selection-summary");
  const catalogueSelectionStatus = new Element("catalogue-selection-status"); catalogueSelectionStatus.hidden = true;
  const catalogueRequestSelected = new Element("catalogue-request-selected"); catalogueRequestSelected.hidden = true;
  const customizer = new Element("order-from-customizer");
  const continueWithoutPreview = new Element("customizer-continue-without-preview"); continueWithoutPreview.hidden = true;
  const generalRequest = new Element("general-custom-gift");
  const designHelp = new Element("customizer-design-help");
  designHelp.attributes["data-design-help"] = "true";
  const summary = new Element("customizer-summary"); summary.textContent = "Custom details";
  const dimension = new Element("preview-dimension-label");
  dimension.textContent = "Soft arch · 0.50 ft × 0.67 ft (3:4)";
  const frameTypeControl = new Element("frame-type", frameType);
  const framePresetControl = new Element("frame-preset", framePreset);
  const frameUnitControl = new Element("frame-unit", frameUnit);
  [embed, frame, status, continueOrder, orderDialog, orderDialogClose, selectedProductSummary, selectedProductImage, selectedProductName, selectedProductPrice, selectedProductSize, catalogueSelection, catalogueSelectionSummary, catalogueSelectionStatus, catalogueRequestSelected, customizer, continueWithoutPreview, generalRequest, designHelp, summary, dimension, frameTypeControl, framePresetControl, frameUnitControl].forEach((element) => elements.set(element.id, element));
  const card = new Element("catalogue-card");
  card.caption = new Element("figcaption");
  card.image = { getAttribute: () => "assets/test-frame.png" };
  card.title = { textContent: "Test frame" };
  card.titleTag = "strong";
  card.detailNodes = [{ textContent: "Blue and gold" }];
  card.priceRows = [
    ["Price", "₹249"],
    ["Size", "4 in"],
  ].map(([label, value]) => ({ querySelector(selector) { return selector === "dt" ? { textContent: label } : { textContent: value }; } }));
  const romanticExistingCatalogue = [
    ["studio-rose-hexagon-keepsake.jpeg", "Rose hexagon", "First rose from a boyfriend, held in love."],
    ["studio-personalized-photo-clock.jpeg", "Personalized photo clock", "A favourite couple photo, held in a clock."],
    ["studio-red-rose-resin-display.jpeg", "Preserved rose display", "Preserved red roses, held close for a lasting moment."],
  ];
  const romanticExistingCards = romanticExistingCatalogue.map(([asset, title, copy]) => {
    const existingCard = new Element("romantic-keepsake-card");
    existingCard.caption = new Element("figcaption");
    existingCard.image = { getAttribute: () => `assets/${asset}` };
    existingCard.title = { textContent: title };
    existingCard.titleTag = "h3";
    existingCard.detailNodes = [{ textContent: copy }];
    const size = title === "Rose hexagon" ? ["Size", "8–10 in"] : title === "Personalized photo clock" ? ["Size", "16–18 in"] : null;
    existingCard.priceRows = [
      ["Price", "₹599"],
      size,
    ].filter(Boolean).map(([label, value]) => ({ querySelector(selector) { return selector === "dt" ? { textContent: label } : { textContent: value }; } }));
    return existingCard;
  });
  const highlightCard = romanticExistingCards[2];
  const movedStudioCatalogue = [
    ["resin-clock.jpg", "Blue hour resin clock", "A little sky, a little shoreline, and a moment that keeps time."],
    ["resin-message-coasters.jpg", "Personalized message coasters", "Playful coasters for the person who makes ordinary days better."],
    ["navkar-resin-frame.jpg", "Namokar mantra resin frame", "Soft white texture, gold detail, and words that belong at home."],
    ["personalized-floral-hoop.jpg", "A tiny beginning", "Floral detail arranged around a memory worth marking."],
  ];
  const movedStudioCards = movedStudioCatalogue.map(([asset, title, copy]) => {
    const studioCard = new Element("work-card");
    studioCard.caption = new Element("figcaption");
    studioCard.image = { getAttribute: () => `assets/${asset}` };
    studioCard.title = { textContent: title };
    studioCard.titleTag = "strong";
    studioCard.detailNodes = [{ textContent: copy }];
    return studioCard;
  });
  const generatedCatalogue = [
    ["concept-floral-memory-frame.webp", "Your flowers, held close", "4,999", "3,999", 20],
    ["concept-ocean-clock.webp", "A little blue hour", "2,999", "2,199", 27],
    ["concept-floral-coasters.webp", "Little messages, shared", "1,299", "999", 23],
  ];
  const generatedCards = generatedCatalogue.map(([asset, title, regular, festive, discount], index) => {
    const generatedCard = new Element("generated-catalogue-card");
    generatedCard.caption = new Element("figcaption");
    generatedCard.image = { getAttribute: () => `assets/${asset}` };
    generatedCard.title = { textContent: title };
    generatedCard.titleTag = "strong";
    generatedCard.detailNodes = [
      { textContent: "Flowers from a favourite day, held in a soft arch." },
    ];
    const size = index === 0 ? ["Size", "20×22 in"] : index === 2 ? ["Size", "3 in each"] : null;
    generatedCard.priceRows = [
      ["From", `₹${festive}`],
      size,
    ].filter(Boolean).map(([label, value]) => ({ querySelector(selector) { return selector === "dt" ? { textContent: label } : { textContent: value }; } }));
    return generatedCard;
  });
  if (longCatalogueTitle) generatedCards[1].title.textContent = "x".repeat(2050);
  const romanticCatalogue = [
    ["romantic-us-keychain-pair.webp", "Two keys, one little us", "Made to travel together, even when you cannot.", "599", "399", 33],
    ["romantic-floral-bookmark-set.webp", "Save our page", "Three little places to keep the chapters that feel like yours.", "999", "699", 30],
    ["romantic-calendar-coaster.webp", "Our date, every day", "The day everything changed, circled for every ordinary morning after.", "1,199", "899", 25],
    ["romantic-first-rose-bracelet.webp", "The first rose, still with me", "One petal from the beginning, made wearable.", "899", "599", 33],
    ["romantic-heart-trinket-tray.webp", "Tiny tray, big feelings", "A soft place for rings, earbuds, and the little things you share.", "499", "349", 30],
    ["romantic-initial-desk-stand.webp", "Your initial. Mine. Ours.", "Two letters, one small corner that belongs to both of you.", "999", "699", 30],
    ["romantic-botanical-pendant.webp", "A little piece of our season", "Pressed flowers and a name, kept close.", "599", "399", 33],
    ["romantic-ocean-memory-tray.webp", "Our place, held in waves", "For the beach, trip, or city that became part of your story.", "1,799", "1,299", 28],
    ["romantic-couple-scene.webp", "Our favourite little scene", "A tiny version of the everyday moment you would replay.", "999", "699", 30],
    ["romantic-couple-miniature.webp", "Your story, in 3D", "Two people, one meaningful detail, made into a shelf-sized memory.", "2,499", "1,999", 20],
  ];
  const romanticConceptCards = romanticCatalogue.map(([asset, title, copy, regular, festive, discount], index) => {
    const romanticCard = new Element("romantic-keepsake-card");
    romanticCard.caption = new Element("figcaption");
    romanticCard.image = { getAttribute: () => `assets/${asset}` };
    romanticCard.title = { textContent: title };
    romanticCard.titleTag = "h3";
    romanticCard.disclosure = { textContent: "" };
    romanticCard.detailNodes = [
      { textContent: copy },
    ];
    const size = index === 0 ? ["Size", "1.5–2 in each"] : index === 1 ? ["Size", "5–6 in each"] : index === 2 ? ["Size", "3 in"] : index === 4 ? ["Size", "4 in"] : null;
    romanticCard.priceRows = [
      ["From", `₹${festive}`],
      size,
    ].filter(Boolean).map(([label, value]) => ({ querySelector(selector) { return selector === "dt" ? { textContent: label } : { textContent: value }; } }));
    return romanticCard;
  });
  const corporateSizes = [
    ["Size", "1.5–2 in"], ["Size", "5–6 in"],
    ["Size", "4 in"], ["Size", "6 in"],
    ["Size", "3 in each"], ["Size", "2 in"],
    null, null,
    ["Size", "6–8 in"], null,
    null, null,
    null, ["Size", "4 in"],
    null, null,
    null, null,
    null, null,
  ];
  const corporateCards = CORPORATE_RESIN_GIFTS.map(([asset, title, copy, unit, regular, offer, discount], index) => {
    const corporateCard = new Element("work-card");
    corporateCard.caption = new Element("figcaption");
    corporateCard.image = { getAttribute: () => `assets/${asset}`, alt: `Illustrative preview: ${title}` };
    corporateCard.title = { textContent: title };
    corporateCard.titleTag = "strong";
    corporateCard.disclosure = { textContent: "Corporate gift concept" };
    corporateCard.detailNodes = [
      { textContent: copy },
      { textContent: unit },
    ];
    corporateCard.priceRows = [
      ["From", `₹${offer}`],
      corporateSizes[index],
    ].filter(Boolean).map(([label, value]) => ({ querySelector(selector) { return selector === "dt" ? { textContent: label } : { textContent: value }; } }));
    return corporateCard;
  });
  const diwaliSizes = [
    ["Size", "3 in"], ["Size", "3 in"], ["Size", "6 in"], ["Size", "2–3 in each"],
    ["Size", "3–4 in"], ["Size", "3–4 in each"], ["Size", "4–5 in"], ["Size", "2 in each"],
    ["Size", "3–4 in each"], ["Size", "3–4 in"],
  ];
  const diwaliCards = DIWALI_NEW_CONCEPTS.map(([asset, title, copy, unit, regular, festive, discount], index) => {
    const diwaliCard = new Element("work-card");
    diwaliCard.caption = new Element("figcaption");
    diwaliCard.image = { getAttribute: () => `assets/${asset}` };
    diwaliCard.title = { textContent: title };
    diwaliCard.titleTag = "strong";
    diwaliCard.disclosure = { textContent: "" };
    diwaliCard.detailNodes = [
      { textContent: copy },
      { textContent: unit },
    ];
    diwaliCard.priceRows = [
      ["From", `₹${festive}`],
      diwaliSizes[index],
    ].map(([label, value]) => ({ querySelector(selector) { return selector === "dt" ? { textContent: label } : { textContent: value }; } }));
    return diwaliCard;
  });
  const posted = [];
  const customizerOutcomes = [];
  const body = { appendChild() {}, removeChild() {} };
  const windowObject = {
    location: { href: "https://saloniresinart.com/" },
    activeElement: null,
    history: {
      state: {},
      pushState(state) { this.state = state; },
      back() {
        this.backCalls = (this.backCalls || 0) + 1;
        if (this.deferBack) { this.pendingBack = true; return; }
        this.state = {};
        if (this._listener) this._listener({ state: this.state });
      },
      flushBack() {
        if (!this.pendingBack) return;
        this.pendingBack = false;
        this.state = {};
        if (this._listener) this._listener({ state: this.state });
      },
    },
    crypto: { randomUUID: (() => { let n = 0; return () => "request-" + (++n); })() },
    saloniCustomizerCapture(identity) {
      const preset = Number(framePresetControl.value);
      const unit = frameUnitControl.value;
      const height = frameTypeControl.value === "arch" ? preset * 4 / 3 : preset;
      const format = (value) => unit === "ft" ? (value / 12).toFixed(2) : String(value);
      return { blob: { type: "image/png", size: 42 }, summary: summary.textContent, dimensions: { height: format(height), width: format(preset), heightUnit: unit, widthUnit: unit }, requestId: identity.requestId, nonce: identity.nonce, mode: identity.mode };
    },
    saloniCustomizerRequestOutcome(outcome) { customizerOutcomes.push(outcome); },
    matchMedia: () => ({ matches: true }),
    confirm: () => confirms.length ? confirms.shift() : true,
    addEventListener(type, listener) { if (type === "message") this.messageListener = listener; if (type === "popstate") { this.popstateListener = listener; this.history._listener = listener; } },
    setTimeout: () => 1,
    clearTimeout() {},
    grecaptcha: { ready(callback) { callback(); }, execute() { return Promise.resolve("parent-token"); } },
  };
  const documentObject = {
    documentElement: { classList: { add() {} } },
    body,
    addEventListener(type, listener) { if (type === "DOMContentLoaded") this.ready = listener; },
    getElementById(id) { return elements.get(id) || null; },
    querySelectorAll(selector) {
      if (selector === ".catalogue-grid .work-card, .catalogue-grid .romantic-keepsake-card") return [card, ...movedStudioCards, ...romanticExistingCards, ...generatedCards, ...romanticConceptCards, ...corporateCards, ...diwaliCards];
      if (selector === '[data-order-prefill="general"]') return [generalRequest, designHelp];
      return [];
    },
    querySelector(selector) {
      if (selector === '[data-order-prefill="customizer"]') return customizer;
      return null;
    },
    createElement(tag) {
      const element = new Element(tag);
      if (tag === "form") {
        element.submit = () => posted.push(element);
      }
      return element;
    },
  };
  const context = { console, document: documentObject, window: windowObject, URL, IntersectionObserver: undefined, Date, Math };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "script.js" });
  documentObject.ready();
  const catalogueButton = card.caption.children.find((child) => child.attributes["data-order-prefill"] === "catalogue");
  const highlightCatalogueButton = highlightCard.caption.children.find((child) => child.attributes["data-order-prefill"] === "catalogue");
  const romanticExistingButtons = romanticExistingCards.map((existingCard) => existingCard.caption.children.find((child) => child.attributes["data-order-prefill"] === "catalogue"));
  const generatedCatalogueButtons = generatedCards.map((generatedCard) => generatedCard.caption.children.find((child) => child.attributes["data-order-prefill"] === "catalogue"));
  const romanticConceptButtons = romanticConceptCards.map((romanticCard) => romanticCard.caption.children.find((child) => child.attributes["data-order-prefill"] === "catalogue"));
  const corporateCatalogueButtons = corporateCards.map((corporateCard) => corporateCard.caption.children.find((child) => child.attributes["data-order-prefill"] === "catalogue"));
  const diwaliCatalogueButtons = diwaliCards.map((diwaliCard) => diwaliCard.caption.children.find((child) => child.attributes["data-order-prefill"] === "catalogue"));
  const movedStudioButtons = movedStudioCards.map((studioCard) => studioCard.caption.children.find((child) => child.attributes["data-order-prefill"] === "catalogue"));
  return { elements, card, generalRequest, designHelp, catalogueButton, highlightCard, highlightCatalogueButton, movedStudioCards, movedStudioButtons, romanticExistingCards, romanticExistingButtons, generatedCards, generatedCatalogueButtons, generatedCard: generatedCards[0], generatedCatalogueButton: generatedCatalogueButtons[0], romanticConceptCards, romanticConceptButtons, corporateCards, corporateCatalogueButtons, diwaliCards, diwaliCatalogueButtons, customizer, continueWithoutPreview, continueOrder, catalogueSelection, catalogueSelectionSummary, catalogueSelectionStatus, catalogueRequestSelected, posted, customizerOutcomes, windowObject, orderDialog, orderDialogClose };
}

function submittedSeed(posted) {
  const form = posted.at(-1);
  const seedInput = form.children.find((child) => child.name === "seed");
  return JSON.parse(seedInput.value);
}

function requestCatalogue(flow, button, clear = true) {
  button.dispatch("click");
  flow.catalogueRequestSelected.dispatch("click");
  if (clear) button.dispatch("click");
  return submittedSeed(flow.posted);
}


test("opens a general custom-gift enquiry through the existing catalogue seed contract", () => {
  const flow = runFlow();
  flow.generalRequest.dispatch("click", { preventDefault() {} });
  const seed = submittedSeed(flow.posted);
  assert.equal(seed.sourceKind, "catalogue");
  assert.equal(seed.sourceId, "catalogue:general-custom-gift");
  assert.equal(seed.productName, "Custom gift enquiry");
  assert.equal(seed.requestStage, "quote");
  assert.match(seed.designDetails, /General custom gift enquiry/);
  assert.deepEqual([seed.heightFeet, seed.heightInchesPart, seed.widthFeet, seed.widthInchesPart], ["", "", "", ""]);
});

test("builds one deterministic request for multiple catalogue selections", () => {
  const flow = runFlow();
  flow.catalogueButton.dispatch("click");
  flow.generatedCatalogueButton.dispatch("click");
  assert.equal(flow.posted.length, 0);
  assert.equal(flow.catalogueSelection.hidden, false);
  assert.match(flow.catalogueSelectionSummary.textContent, /2 items selected/);
  assert.equal(flow.catalogueButton.textContent, "Remove from request");
  assert.equal(flow.generatedCatalogueButton.textContent, "Remove from request");
  flow.catalogueRequestSelected.dispatch("click");
  assert.equal(flow.posted.length, 1);
  const seed = submittedSeed(flow.posted);
  assert.equal(seed.sourceKind, "catalogue");
  assert.equal(seed.sourceId, "catalogue:multi-item");
  assert.equal(seed.productName, "2 selected catalogue items");
  assert.equal(seed.quantity, "1");
  assert.match(seed.designDetails, /Test frame/);
  assert.match(seed.designDetails, /Source: catalogue:test-frame\.png/);
  assert.match(seed.designDetails, /Your flowers, held close/);
  assert.match(seed.designDetails, /Source: catalogue:concept-floral-memory-frame\.webp/);
  assert.match(seed.designDetails, /Quantity: 1/);
  assert.ok(seed.designDetails.length <= 2000);
});

test("dedupes and removes catalogue selections before requesting the remaining item", () => {
  const flow = runFlow();
  flow.catalogueButton.dispatch("click");
  flow.catalogueButton.dispatch("click");
  flow.generatedCatalogueButton.dispatch("click");
  flow.catalogueButton.dispatch("click");
  assert.match(flow.catalogueSelectionSummary.textContent, /2 items selected/);
  flow.catalogueButton.dispatch("click");
  assert.match(flow.catalogueSelectionSummary.textContent, /1 item selected/);
  flow.catalogueRequestSelected.dispatch("click");
  assert.equal(flow.posted.length, 1);
  const seed = submittedSeed(flow.posted);
  assert.equal(seed.productName, "1 selected catalogue items");
  assert.doesNotMatch(seed.designDetails, /Test frame/);
  assert.match(seed.designDetails, /Your flowers, held close/);
});

test("keeps the bundle bounded and explains when another catalogue item cannot be added", () => {
  const flow = runFlow({ longCatalogueTitle: true });
  flow.catalogueButton.dispatch("click");
  flow.generatedCatalogueButtons[1].dispatch("click");
  assert.match(flow.catalogueSelectionSummary.textContent, /1 item selected: Test frame/);
  assert.equal(flow.catalogueSelectionStatus.hidden, false);
  assert.match(flow.catalogueSelectionStatus.textContent, /selected list is full/);
  assert.equal(flow.generatedCatalogueButtons[1].textContent, "Add to request");
  assert.equal(flow.catalogueRequestSelected.disabled, false);
  flow.catalogueRequestSelected.dispatch("click");
  assert.equal(submittedSeed(flow.posted).productName, "1 selected catalogue items");
  assert.ok(submittedSeed(flow.posted).designDetails.length <= 2000);
});

test("opens one order modal, keeps loading until the current nonce is ready, and restores the opener", () => {
  const flow = runFlow();
  requestCatalogue(flow, flow.catalogueButton);
  const status = flow.elements.get("order-form-status");
  const frame = flow.elements.get("order-form-frame");
  const seed = submittedSeed(flow.posted);
  assert.equal(flow.orderDialog.open, true);
  assert.equal(status.hidden, false);
  assert.equal(status.getAttribute("aria-busy"), "true");
  flow.windowObject.messageListener({ origin: "https://n-current-script.googleusercontent.com", source: frame.contentWindow, data: { type: "saloni-order-form-ready", nonce: seed.channelNonce, siteKey: "site-key" }, ports: [] });
  assert.equal(status.hidden, true);
  assert.equal(status.getAttribute("aria-busy"), "");
  flow.orderDialog.close();
  assert.equal(flow.orderDialog.open, false);
  assert.equal(flow.catalogueRequestSelected.focused, true);
  assert.equal(flow.catalogueRequestSelected.focusOptions.preventScroll, true);
});

test("resumes a closed request through the visible continue control without reseeding", () => {
  const flow = runFlow({ confirms: [false] });
  const firstSeed = requestCatalogue(flow, flow.catalogueButton);
  const postCount = flow.posted.length;
  flow.windowObject.history.deferBack = true;
  flow.orderDialog.close();
  assert.equal(flow.continueOrder.hidden, false);
  flow.continueOrder.dispatch("click", { preventDefault() {} });
  assert.equal(flow.orderDialog.open, false);
  assert.equal(flow.windowObject.history.backCalls, 1);
  flow.windowObject.history.flushBack();
  assert.equal(flow.orderDialog.open, true);
  assert.equal(flow.posted.length, postCount);
  assert.equal(submittedSeed(flow.posted).requestId, firstSeed.requestId);
  assert.equal(submittedSeed(flow.posted).channelNonce, firstSeed.channelNonce);
  flow.orderDialog.close();
  assert.equal(flow.windowObject.history.backCalls, 2);
  flow.windowObject.history.flushBack();
  assert.equal(flow.continueOrder.focused, true);
  assert.equal(flow.continueOrder.focusOptions.preventScroll, true);
});

test("browser Back closes the order modal and restores the exact opener without scrolling", () => {
  const flow = runFlow();
  requestCatalogue(flow, flow.catalogueButton);
  assert.equal(flow.orderDialog.open, true);
  flow.windowObject.history.back();
  assert.equal(flow.orderDialog.open, false);
  assert.equal(flow.catalogueRequestSelected.focused, true);
  assert.equal(flow.catalogueRequestSelected.focusOptions.preventScroll, true);
});

test("ignores a stale ready message while a replacement request is loading", () => {
  const flow = runFlow();
  const first = requestCatalogue(flow, flow.catalogueButton);
  const status = flow.elements.get("order-form-status");
  const frame = flow.elements.get("order-form-frame");
  flow.windowObject.messageListener({ origin: "https://n-stale-script.googleusercontent.com", source: frame.contentWindow, data: { type: "saloni-order-form-ready", nonce: "stale-nonce", siteKey: "stale" }, ports: [] });
  assert.equal(status.hidden, false);
  assert.equal(status.getAttribute("aria-busy"), "true");
  flow.catalogueButton.dispatch("click");
  flow.catalogueRequestSelected.dispatch("click");
  const second = submittedSeed(flow.posted);
  assert.notEqual(second.channelNonce, first.channelNonce);
  flow.windowObject.messageListener({ origin: "https://n-current-script.googleusercontent.com", source: frame.contentWindow, data: { type: "saloni-order-form-ready", nonce: second.channelNonce, siteKey: "site-key" }, ports: [] });
  assert.equal(status.hidden, true);
});

test("shows bounded contact alternatives on timeout and clears them for a late valid ready", () => {
  const flow = runFlow();
  let timeoutCallback;
  flow.windowObject.setTimeout = (callback) => { timeoutCallback = callback; return 42; };
  flow.windowObject.clearTimeout = () => {};
  requestCatalogue(flow, flow.catalogueButton, false);
  const status = flow.elements.get("order-form-status");
  const frame = flow.elements.get("order-form-frame");
  const seed = submittedSeed(flow.posted);
  timeoutCallback();
  assert.equal(status.hidden, false);
  assert.equal(status.getAttribute("aria-busy"), "");
  assert.match(status.textContent, /taking longer than expected/);
  flow.windowObject.messageListener({ origin: "https://n-late-script.googleusercontent.com", source: frame.contentWindow, data: { type: "saloni-order-form-ready", nonce: seed.channelNonce, siteKey: "site-key" }, ports: [] });
  assert.equal(status.hidden, true);
});

test("closing a customizer order releases sticky handoff suppression without clearing the draft", () => {
  const flow = runFlow();
  flow.customizer.dispatch("click");
  assert.equal(flow.orderDialog.open, true);
  assert.deepEqual(flow.customizerOutcomes, ["success"]);
  assert.equal(flow.elements.get("customizer-summary").textContent, "Custom details");
  flow.orderDialog.close();
  assert.deepEqual(flow.customizerOutcomes, ["success", "cancelled"]);
  assert.equal(flow.elements.get("customizer-summary").textContent, "Custom details");
});

test("closing a design-help order releases sticky handoff suppression without clearing the draft", () => {
  const flow = runFlow();
  flow.designHelp.dispatch("click", { preventDefault() {} });
  assert.equal(flow.orderDialog.open, true);
  assert.deepEqual(flow.customizerOutcomes, ["success"]);
  flow.orderDialog.close();
  assert.deepEqual(flow.customizerOutcomes, ["success", "cancelled"]);
  assert.equal(flow.elements.get("customizer-summary").textContent, "Custom details");
});

test("continue without preview restores focus to the visible customizer request control", async () => {
  const flow = runFlow();
  flow.windowObject.saloniCustomizerCapture = (identity) => {
    const error = new Error("preview-export-failed");
    error.previewFallback = {
      summary: "Custom details",
      dimensions: { height: "8", width: "8", heightUnit: "in", widthUnit: "in" },
      requestId: identity.requestId, nonce: identity.nonce, mode: identity.mode
    };
    return Promise.reject(error);
  };
  flow.customizer.dispatch("click");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(flow.continueWithoutPreview.hidden, false);
  flow.continueWithoutPreview.dispatch("click", { preventDefault() {} });
  assert.equal(flow.orderDialog.open, true);
  flow.orderDialog.close();
  assert.equal(flow.customizer.focused, true);
  assert.equal(flow.customizer.focusOptions.preventScroll, true);
  assert.equal(flow.continueWithoutPreview.focused, undefined);
});

test("does not open an empty modal when customizer capture fails", async () => {
  const flow = runFlow();
  flow.windowObject.saloniCustomizerCapture = () => Promise.reject(new Error("preview-export-failed"));
  flow.customizer.dispatch("click");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(flow.posted.length, 0);
  assert.equal(flow.orderDialog.open, false);
});

test("shows a compact catalogue selection summary before requesting the bundle", () => {
  const flow = runFlow();
  assert.equal(flow.catalogueSelection.hidden, true);

  flow.catalogueButton.dispatch("click");
  assert.equal(flow.catalogueSelection.hidden, false);
  assert.match(flow.catalogueSelectionSummary.textContent, /1 item selected: Test frame/);

  flow.generatedCatalogueButtons[1].dispatch("click");
  assert.match(flow.catalogueSelectionSummary.textContent, /2 items selected/);
});

test("keeps selected catalogue items while pagination or filters change the visible page", () => {
  const flow = runFlow();
  flow.catalogueButton.dispatch("click");
  flow.catalogueButton.hidden = true;
  flow.generatedCatalogueButton.dispatch("click");
  flow.catalogueButton.hidden = false;
  assert.match(flow.catalogueSelectionSummary.textContent, /2 items selected/);
  flow.catalogueRequestSelected.dispatch("click");
  const seed = submittedSeed(flow.posted);
  assert.equal(seed.productName, "2 selected catalogue items");
  assert.match(seed.designDetails, /Test frame/);
  assert.match(seed.designDetails, /Your flowers, held close/);
});

test("clears catalogue selections when general or customizer ordering takes over", () => {
  const flow = runFlow();
  flow.catalogueButton.dispatch("click");
  assert.equal(flow.catalogueSelection.hidden, false);

  flow.generalRequest.dispatch("click", { preventDefault() {} });
  assert.equal(flow.catalogueSelection.hidden, true);

  flow.catalogueButton.dispatch("click");
  assert.equal(flow.catalogueSelection.hidden, false);
  flow.customizer.dispatch("click");
  assert.equal(flow.catalogueSelection.hidden, true);
});

test("routes Resin art to the active catalogue categories without a romantic heading link", () => {
  assert.match(page, /<a href="#studio-art" data-category-shortcut="frames">Resin art <svg class="category-icon" aria-hidden="true" focusable="false">[\s\S]*#frame[\s\S]*<\/a>/);
  assert.doesNotMatch(page, /<a class="text-link" href="#romantic-keepsakes" data-category-shortcut="couple">Explore the keepsakes/);
  assert.doesNotMatch(page, /<a href="#romantic-keepsakes">Resin art<\/a>/);
  assert.doesNotMatch(page, /<a class="text-link" href="#studio-art">Explore the keepsakes/);
});

test("Let Saloni design it for me uses an explicit design-help seed while general enquiry stays unchanged", () => {
  const flow = runFlow();
  flow.designHelp.dispatch("click", { preventDefault() {} });
  const seed = submittedSeed(flow.posted);
  assert.equal(seed.sourceKind, "catalogue");
  assert.equal(seed.sourceId, "catalogue:customizer-design-help");
  assert.equal(seed.productName, "Custom resin frame design help");
  assert.equal(seed.requestStage, "quote");
  assert.match(seed.designDetails, /Design help request from the customizer/);
  assert.match(seed.designDetails, /starting design/);
  assert.deepEqual([seed.heightFeet, seed.heightInchesPart, seed.widthFeet, seed.widthInchesPart], ["", "", "", ""]);
});

test("keeps the corporate page pending without seeding or loading the old form", () => {
  const flow = runFlow({ mode: "corporate", intakeReady: false });
  assert.equal(flow.posted.length, 0);
  assert.equal(flow.elements.get("order-form-frame").hidden, true);
  assert.match(flow.elements.get("order-form-status").textContent, /Corporate gifting enquiries are being prepared/);
  assert.match(flow.elements.get("order-form-status").textContent, /8209238541/);
  assert.match(flow.elements.get("order-form-status").textContent, /saloniresin_art_studio/);
  const unconfigured = runFlow({ mode: "corporate", intakeReady: true, configured: false });
  assert.equal(unconfigured.posted.length, 0);
  assert.match(unconfigured.elements.get("order-form-status").textContent, /Corporate gifting enquiries are being prepared/);
  assert.doesNotMatch(unconfigured.elements.get("order-form-status").textContent, /not configured for this preview/i);
});

test("keeps the corporate page pending when intake readiness is missing or unknown", () => {
  for (const intakeReady of [undefined, "unknown"]) {
    const options = { mode: "corporate" };
    if (intakeReady !== undefined) options.intakeReady = intakeReady;
    const flow = runFlow(options);
    assert.equal(flow.posted.length, 0);
    assert.equal(flow.elements.get("order-form-frame").hidden, true);
    assert.match(flow.elements.get("order-form-status").textContent, /Corporate gifting enquiries are being prepared/);
  }
});

test("keeps the existing order and Partner Circle seed paths active", () => {
  const order = runFlow();
  requestCatalogue(order, order.catalogueButton);
  assert.equal(order.posted.length, 1);
  assert.equal(submittedSeed(order.posted).requestStage, "quote");
  const partner = runFlow({ mode: "partner", intakeReady: false });
  assert.equal(partner.posted.length, 1);
  assert.equal(partner.posted[0].children.find((child) => child.name === "mode").value, "partner");
});

test("starts two orders for the same catalogue item with new IDs only after confirmed replacement", () => {
  const flow = runFlow({ confirms: [false, true] });
  const first = requestCatalogue(flow, flow.catalogueButton);
  flow.catalogueButton.dispatch("click");
  flow.catalogueRequestSelected.dispatch("click");
  assert.equal(flow.posted.length, 1);
  flow.catalogueRequestSelected.dispatch("click");
  const second = submittedSeed(flow.posted);
  assert.notEqual(second.requestId, first.requestId);
});

test("adds the catalogue order control to highlighted keepsake cards", () => {
  const flow = runFlow();
  assert.ok(flow.highlightCatalogueButton);
  assert.equal(flow.highlightCatalogueButton.textContent, "Add to request");
  const seed = requestCatalogue(flow, flow.highlightCatalogueButton);
  assert.equal(seed.productName, "1 selected catalogue items");
  assert.equal(seed.sourceId, "catalogue:multi-item");
  assert.match(seed.designDetails, /Item 1: Preserved rose display/);
  assert.match(seed.designDetails, /catalogue:studio-red-rose-resin-display\.jpeg/);
});

test("keeps moved studio art cards on the shared catalogue order path", () => {
  const flow = runFlow();
  const expected = [
    ["resin-clock.jpg", "Blue hour resin clock"],
    ["resin-message-coasters.jpg", "Personalized message coasters"],
    ["navkar-resin-frame.jpg", "Namokar mantra resin frame"],
    ["personalized-floral-hoop.jpg", "A tiny beginning"],
  ];
  expected.forEach(([asset, title], index) => {
    assert.equal(flow.movedStudioButtons[index].textContent, "Add to request");
    const seed = requestCatalogue(flow, flow.movedStudioButtons[index]);
    assert.equal(seed.sourceId, "catalogue:multi-item");
    assert.equal(seed.productName, "1 selected catalogue items");
    assert.match(seed.designDetails, new RegExp(`Source: catalogue:${asset}`));
    assert.match(seed.designDetails, new RegExp(`Item 1: ${title}`));
  });
});

test("reads square, round, and arch dimensions from customizer controls, including feet", () => {
  const square = runFlow({ frameType: "square", framePreset: "8", frameUnit: "in" });
  square.customizer.dispatch("click");
  let seed = submittedSeed(square.posted);
  assert.equal(seed.requestStage, "quote");
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

test("reports real customizer handoff outcomes so cancellation keeps retry available", async () => {
  const cancelled = runFlow({ confirms: [false] });
  requestCatalogue(cancelled, cancelled.catalogueButton);
  cancelled.customizer.dispatch("click");
  assert.deepEqual(cancelled.customizerOutcomes, ["cancelled"]);

  const success = runFlow();
  success.customizer.dispatch("click");
  assert.deepEqual(success.customizerOutcomes, ["success"]);

  const failed = runFlow();
  failed.windowObject.saloniCustomizerCapture = () => Promise.reject(new Error("preview-export-failed"));
  failed.customizer.dispatch("click");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(failed.customizerOutcomes, ["failure"]);

  const unconfigured = runFlow({ configured: false });
  unconfigured.customizer.dispatch("click");
  assert.deepEqual(unconfigured.customizerOutcomes, ["failure"]);

  const insecure = runFlow();
  insecure.windowObject.crypto.randomUUID = () => "";
  insecure.customizer.dispatch("click");
  assert.deepEqual(insecure.customizerOutcomes, ["failure"]);

  const helpCancelled = runFlow({ confirms: [false] });
  requestCatalogue(helpCancelled, helpCancelled.catalogueButton);
  helpCancelled.designHelp.dispatch("click", { preventDefault() {} });
  assert.deepEqual(helpCancelled.customizerOutcomes, ["cancelled"]);
});

test("preview rejection keeps the draft until explicit continuation and retry reruns capture", async () => {
  const flow = runFlow();
  let attempts = 0;
  flow.windowObject.saloniCustomizerCapture = (identity) => {
    attempts += 1;
    const error = new Error("preview-export-failed");
    error.previewFallback = {
      summary: "Custom details",
      dimensions: { height: "8", width: "8", heightUnit: "in", widthUnit: "in" },
      requestId: identity.requestId, nonce: identity.nonce, mode: identity.mode
    };
    return Promise.reject(error);
  };

  flow.customizer.dispatch("click");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts, 1);
  assert.equal(flow.posted.length, 0);
  assert.equal(flow.continueWithoutPreview.hidden, false);

  flow.customizer.dispatch("click");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts, 2);
  assert.equal(flow.posted.length, 0);
  assert.equal(flow.continueWithoutPreview.hidden, false);

  flow.continueWithoutPreview.dispatch("click", { preventDefault() {} });
  assert.equal(flow.posted.length, 1);
  const form = flow.posted[0];
  const seed = submittedSeed(flow.posted);
  assert.equal(seed.sourceKind, "customizer");
  assert.equal(seed.designDetails, "Custom details");
  assert.deepEqual([seed.height, seed.heightUnit, seed.width, seed.widthUnit], ["8", "in", "8", "in"]);
  assert.equal(seed.formMode, "order");
  assert.equal(seed.previewExpected, false);
  assert.equal(form.children.find((child) => child.name === "mode").value, "order");
  const latePreview = new CapturingPort();
  flow.windowObject.messageListener({ origin: "https://n-1234567890-1lu-script.googleusercontent.com", source: {}, data: { type: "saloni-preview-request", version: 1, nonce: seed.channelNonce, requestId: seed.requestId, mode: "order", transferId: "no-preview" }, ports: [latePreview] });
  assert.equal(latePreview.messages[0].ok, false);
  assert.equal(latePreview.messages[0].error, "unavailable");
  assert.equal(Object.hasOwn(latePreview.messages[0], "blob"), false);
});

test("leaves catalogue dimensions blank when the catalogue has no real size", () => {
  const flow = runFlow();
  const seed = requestCatalogue(flow, flow.catalogueButton);
  assert.deepEqual([seed.heightFeet, seed.heightInchesPart, seed.widthFeet, seed.widthInchesPart], ["", "", "", ""]);
});

test("carries known catalogue sizes and preserves no-size selections in order details", () => {
  const flow = runFlow();
  const cases = [
    [flow.catalogueButton, "Size: 4 in", "Test frame"],
    [flow.romanticExistingButtons[0], "Size: 8–10 in", "Rose hexagon"],
    [flow.generatedCatalogueButtons[2], "Size: 3 in each", "Little messages, shared"],
    [flow.generatedCatalogueButtons[1], null, "A little blue hour"],
  ];
  cases.forEach(([button, sizeDetails, productName]) => {
    const seed = requestCatalogue(flow, button);
    assert.equal(seed.productName, "1 selected catalogue items");
    assert.match(seed.designDetails, new RegExp(productName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")));
    if (sizeDetails) assert.match(seed.designDetails, new RegExp(sizeDetails.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")));
    else assert.match(seed.designDetails, /Size: not shown/);
    assert.deepEqual([seed.heightFeet, seed.heightInchesPart, seed.widthFeet, seed.widthInchesPart], ["", "", "", ""]);
  });
});

test("uses the shared catalogue CTA and preserves generated-design details in a catalogue seed", () => {
  const flow = runFlow();
  assert.equal(flow.generatedCatalogueButton.textContent, "Add to request");
  assert.equal(flow.catalogueButton.textContent, "Add to request");
  const seed = requestCatalogue(flow, flow.generatedCatalogueButton);
  assert.equal(seed.sourceKind, "catalogue");
  assert.equal(seed.sourceId, "catalogue:multi-item");
  assert.match(seed.designDetails, /Source: catalogue:concept-floral-memory-frame\.webp/);
  assert.match(seed.designDetails, /Item 1: Your flowers, held close/);
  assert.deepEqual([seed.heightFeet, seed.heightInchesPart, seed.widthFeet, seed.widthInchesPart], ["", "", "", ""]);
  assert.doesNotMatch(seed.designDetails, /Market reference/);
  assert.doesNotMatch(seed.designDetails, new RegExp(FINAL_QUOTE_NOTE));
});

test("includes each generated design pricing in order seed details", () => {
  const flow = runFlow();
  const expected = [
    ["concept-floral-memory-frame.webp", "4,999", "3,999", 20],
    ["concept-ocean-clock.webp", "2,999", "2,199", 27],
    ["concept-floral-coasters.webp", "1,299", "999", 23],
  ];
  expected.forEach(([asset, regular, festive, discount], index) => {
    const seed = requestCatalogue(flow, flow.generatedCatalogueButtons[index]);
    assert.equal(seed.sourceId, "catalogue:multi-item");
    assert.match(seed.designDetails, new RegExp(`Source: catalogue:${asset}`));
    assert.deepEqual([seed.heightFeet, seed.heightInchesPart, seed.widthFeet, seed.widthInchesPart], ["", "", "", ""]);
    assert.ok(seed.designDetails.includes(`Price: ₹${festive}`));
    assert.doesNotMatch(seed.designDetails, /Regular price|Discount|% off/);
    assert.doesNotMatch(seed.designDetails, new RegExp(FINAL_QUOTE_NOTE));
    assert.doesNotMatch(seed.designDetails, /Average listed price/);
  });
});

test("seeds every corporate catalogue card with identity, unit, concept, and pricing details", () => {
  const section = page.match(/<section\b[^>]*id=["']corporate-resin-gifts["'][\s\S]*?<\/section>/);
  assert.ok(section, "corporate catalogue section must exist before order extraction is tested");
  assert.equal((section[0].match(/data-lightbox-trigger/g) || []).length, CORPORATE_RESIN_GIFTS.length);
  const flow = runFlow();
  CORPORATE_RESIN_GIFTS.forEach(([asset, title, copy, unit, regular, offer, discount], index) => {
    const button = flow.corporateCatalogueButtons[index];
    assert.equal(button.textContent, "Add to request");
    const seed = requestCatalogue(flow, button);
    assert.equal(seed.sourceId, "catalogue:multi-item");
    assert.equal(seed.productName, "1 selected catalogue items");
    assert.match(seed.designDetails, new RegExp(`Item 1: ${title}`));
    assert.match(seed.designDetails, new RegExp(`Source: catalogue:${asset}`));
    assert.match(seed.designDetails, /Quantity: 1/);
  });
});

test("seeds every new Diwali concept with identity, unit, concept, and pricing details", () => {
  const section = page.match(/<section\b[^>]*id=["']diwali["'][\s\S]*?<\/section>/);
  assert.ok(section, "Diwali catalogue section must exist before order extraction is tested");
  assert.equal((section[0].match(/data-lightbox-trigger/g) || []).length, 23);
  const flow = runFlow();
  DIWALI_NEW_CONCEPTS.forEach(([asset, title, copy, unit, regular, festive, discount], index) => {
    const button = flow.diwaliCatalogueButtons[index];
    assert.equal(button.textContent, "Add to request");
    const seed = requestCatalogue(flow, button);
    assert.equal(seed.sourceId, "catalogue:multi-item");
    assert.equal(seed.productName, "1 selected catalogue items");
    assert.match(seed.designDetails, new RegExp(`Item 1: ${title}`));
    assert.match(seed.designDetails, new RegExp(`Source: catalogue:${asset}`));
    assert.match(seed.designDetails, /Quantity: 1/);
  });
});

test("seeds every romantic concept with its disclosure, exact price, and blank dimensions", () => {
  const flow = runFlow();
  const expected = [
    ["romantic-us-keychain-pair.webp", "Two keys, one little us", "Made to travel together, even when you cannot.", "599", "399", 33],
    ["romantic-floral-bookmark-set.webp", "Save our page", "Three little places to keep the chapters that feel like yours.", "999", "699", 30],
    ["romantic-calendar-coaster.webp", "Our date, every day", "The day everything changed, circled for every ordinary morning after.", "1,199", "899", 25],
    ["romantic-first-rose-bracelet.webp", "The first rose, still with me", "One petal from the beginning, made wearable.", "899", "599", 33],
    ["romantic-heart-trinket-tray.webp", "Tiny tray, big feelings", "A soft place for rings, earbuds, and the little things you share.", "499", "349", 30],
    ["romantic-initial-desk-stand.webp", "Your initial. Mine. Ours.", "Two letters, one small corner that belongs to both of you.", "999", "699", 30],
    ["romantic-botanical-pendant.webp", "A little piece of our season", "Pressed flowers and a name, kept close.", "599", "399", 33],
    ["romantic-ocean-memory-tray.webp", "Our place, held in waves", "For the beach, trip, or city that became part of your story.", "1,799", "1,299", 28],
    ["romantic-couple-scene.webp", "Our favourite little scene", "A tiny version of the everyday moment you would replay.", "999", "699", 30],
    ["romantic-couple-miniature.webp", "Your story, in 3D", "Two people, one meaningful detail, made into a shelf-sized memory.", "2,499", "1,999", 20],
  ];
  expected.forEach(([asset, title, copy, regular, festive, discount], index) => {
    const button = flow.romanticConceptButtons[index];
    assert.equal(button.textContent, "Add to request");
    const seed = requestCatalogue(flow, button);
    assert.equal(seed.sourceId, "catalogue:multi-item");
    assert.equal(seed.productName, "1 selected catalogue items");
    assert.match(seed.designDetails, new RegExp(`Item 1: ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(seed.designDetails, new RegExp(`Source: catalogue:${asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(seed.designDetails, new RegExp(`Price: ₹${festive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.doesNotMatch(seed.designDetails, /Regular price|Discount|% off|Average listed price/);
    assert.deepEqual([seed.heightFeet, seed.heightInchesPart, seed.widthFeet, seed.widthInchesPart], ["", "", "", ""]);
  });
});

test("keeps order seeds correct at the first, tenth, eleventh, and fourteenth romantic cards", () => {
  const flow = runFlow();
  const selected = [
    [flow.romanticConceptButtons[0], "catalogue:romantic-us-keychain-pair.webp", "Two keys, one little us"],
    [flow.romanticConceptButtons[9], "catalogue:romantic-couple-miniature.webp", "Your story, in 3D"],
    [flow.romanticExistingButtons[0], "catalogue:studio-rose-hexagon-keepsake.jpeg", "Rose hexagon"],
    [flow.romanticExistingButtons[2], "catalogue:studio-red-rose-resin-display.jpeg", "Preserved rose display"],
  ];
  selected.forEach(([button, sourceId, productName]) => {
    const seed = requestCatalogue(flow, button);
    assert.equal(seed.sourceId, "catalogue:multi-item");
    assert.equal(seed.productName, "1 selected catalogue items");
    assert.match(seed.designDetails, new RegExp(`Item 1: ${productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(seed.designDetails, new RegExp(`Source: ${sourceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
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
  const first = requestCatalogue(flow, flow.catalogueButton);
  const nestedSource = {};
  const sandboxOrigin = "https://script.googleusercontent.com";
  flow.windowObject.messageListener({ origin: sandboxOrigin, source: nestedSource, data: { type: "saloni-order-form-ready", nonce: first.channelNonce, siteKey: "site-key" }, ports: [] });
  const firstPort = new CapturingPort();
  flow.windowObject.messageListener({ origin: sandboxOrigin, source: nestedSource, data: { type: "saloni-order-captcha-request", nonce: first.channelNonce, attemptId: "attempt-1" }, ports: [firstPort] });
  await Promise.resolve();
  assert.equal(firstPort.messages[0].token, "parent-token");
  flow.catalogueButton.dispatch("click");
  flow.catalogueRequestSelected.dispatch("click");
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

test("direct preview bootstrap pins only after the complete identity and origin checks", () => {
  const flow = runFlow();
  flow.customizer.dispatch("click");
  const seed = submittedSeed(flow.posted);
  const source = {};
  const origin = "https://n-1234567890-1lu-script.googleusercontent.com";
  const port = new CapturingPort();
  flow.windowObject.messageListener({ origin, source, data: { type: "saloni-preview-request", version: 1, nonce: seed.channelNonce, requestId: seed.requestId, mode: "order", transferId: "bootstrap-1" }, ports: [port] });
  assert.equal(port.messages.length, 1);
  assert.equal(port.messages[0].ok, true);
  assert.equal(port.messages[0].blob.type, "image/png");
});

test("preview rejects two ports without pinning, and the separate CAPTCHA channel remains distinct", async () => {
  const flow = runFlow();
  flow.customizer.dispatch("click");
  const seed = submittedSeed(flow.posted);
  const source = {};
  const origin = "https://n-1234567890-1lu-script.googleusercontent.com";
  const firstPort = new CapturingPort();
  const secondPort = new CapturingPort();
  flow.windowObject.messageListener({ origin, source, data: { type: "saloni-preview-request", version: 1, nonce: seed.channelNonce, requestId: seed.requestId, mode: "order", transferId: "two-port" }, ports: [firstPort, secondPort] });
  assert.equal(firstPort.messages.length, 0);
  assert.equal(secondPort.messages.length, 0);

  const previewPort = new CapturingPort();
  flow.windowObject.messageListener({ origin, source, data: { type: "saloni-preview-request", version: 1, nonce: seed.channelNonce, requestId: seed.requestId, mode: "order", transferId: "protocol-preview" }, ports: [previewPort] });
  assert.equal(previewPort.messages.length, 1);
  assert.equal(previewPort.messages[0].type, "saloni-preview-response");
  assert.equal(Object.hasOwn(previewPort.messages[0], "token"), false);

  const captchaPort = new CapturingPort();
  flow.windowObject.messageListener({ origin, source, data: { type: "saloni-order-captcha-request", nonce: seed.channelNonce, attemptId: "captcha-after-preview" }, ports: [captchaPort] });
  await Promise.resolve();
  assert.equal(captchaPort.messages[0].type, "saloni-order-captcha-response");
  assert.equal(Object.hasOwn(captchaPort.messages[0], "blob"), false);
  assert.equal(captchaPort.messages[0].token, "parent-token");
});

test("serves exactly one immutable preview snapshot per validated request and allows a new retry id", () => {
  const flow = runFlow();
  flow.customizer.dispatch("click");
  const seed = submittedSeed(flow.posted);
  const nestedSource = {};
  const sandboxOrigin = "https://n-1234567890-1lu-script.googleusercontent.com";
  flow.windowObject.messageListener({ origin: sandboxOrigin, source: nestedSource, data: { type: "saloni-order-form-ready", nonce: seed.channelNonce, siteKey: "site-key", mode: "order" }, ports: [] });

  const valid = new CapturingPort();
  flow.windowObject.messageListener({ origin: sandboxOrigin, source: nestedSource, data: { type: "saloni-preview-request", version: 1, nonce: seed.channelNonce, requestId: seed.requestId, mode: "order", transferId: "preview-1" }, ports: [valid] });
  assert.equal(valid.messages.length, 1);
  assert.equal(valid.messages[0].type, "saloni-preview-response");
  assert.equal(valid.messages[0].ok, true);
  assert.equal(valid.messages[0].blob.size, 42);
  assert.equal(valid.messages[0].blob.type, "image/png");
  assert.equal(seed.formMode, "order");
  assert.equal(seed.previewExpected, true);
  assert.equal(submittedSeed(flow.posted).designDetails, "Custom details");
  flow.elements.get("customizer-summary").textContent = "Edited after request";

  const duplicate = new CapturingPort();
  flow.windowObject.messageListener({ origin: sandboxOrigin, source: nestedSource, data: { type: "saloni-preview-request", version: 1, nonce: seed.channelNonce, requestId: seed.requestId, mode: "order", transferId: "preview-1" }, ports: [duplicate] });
  assert.equal(duplicate.messages.length, 0);

  const retry = new CapturingPort();
  flow.windowObject.messageListener({ origin: sandboxOrigin, source: nestedSource, data: { type: "saloni-preview-request", version: 1, nonce: seed.channelNonce, requestId: seed.requestId, mode: "order", transferId: "preview-2" }, ports: [retry] });
  assert.equal(retry.messages.length, 1);
  assert.equal(retry.messages[0].blob, valid.messages[0].blob);
});

test("reports preview failures through the bounded error field without a Blob", () => {
  const flow = runFlow();
  let captured;
  const capture = flow.windowObject.saloniCustomizerCapture;
  flow.windowObject.saloniCustomizerCapture = (identity) => {
    captured = capture(identity);
    return captured;
  };
  flow.customizer.dispatch("click");
  captured.blob = { type: "image/png", size: 0 };
  const seed = submittedSeed(flow.posted);
  const source = {};
  const origin = "https://n-1234567890-1lu-script.googleusercontent.com";
  flow.windowObject.messageListener({ origin, source, data: { type: "saloni-order-form-ready", nonce: seed.channelNonce, siteKey: "site-key", mode: "order" }, ports: [] });
  const port = new CapturingPort();
  flow.windowObject.messageListener({ origin, source, data: { type: "saloni-preview-request", version: 1, nonce: seed.channelNonce, requestId: seed.requestId, mode: "order", transferId: "invalid-preview" }, ports: [port] });
  assert.equal(port.messages.length, 1);
  assert.equal(port.messages[0].ok, false);
  assert.equal(port.messages[0].error, "invalid-preview");
  assert.equal(Object.hasOwn(port.messages[0], "reason"), false);
  assert.equal(Object.hasOwn(port.messages[0], "blob"), false);
});

test("rejects wrong preview origin, source, identity, mode, version, and port shape without a Blob", () => {
  const flow = runFlow();
  flow.customizer.dispatch("click");
  const seed = submittedSeed(flow.posted);
  const nestedSource = {};
  const sandboxOrigin = "https://n-1234567890-1lu-script.googleusercontent.com";
  flow.windowObject.messageListener({ origin: sandboxOrigin, source: nestedSource, data: { type: "saloni-order-form-ready", nonce: seed.channelNonce, siteKey: "site-key", mode: "order" }, ports: [] });
  const cases = [
    { origin: "https://evil.example", source: nestedSource, data: {} },
    { origin: "https://user:nopass@n-1234567890-1lu-script.googleusercontent.com", source: nestedSource, data: {} },
    { origin: "http://n-1234567890-1lu-script.googleusercontent.com", source: nestedSource, data: {} },
    { origin: "https://n-1234567890-1lu-script.googleusercontent.com.evil.example", source: nestedSource, data: {} },
    { origin: sandboxOrigin, source: {}, data: {} },
    { origin: sandboxOrigin, source: nestedSource, data: { requestId: "stale" } },
    { origin: sandboxOrigin, source: nestedSource, data: { mode: "partner" } },
    { origin: sandboxOrigin, source: nestedSource, data: { version: 2 } },
  ];
  cases.forEach((entry, index) => {
    const port = new CapturingPort();
    const data = Object.assign({ type: "saloni-preview-request", version: 1, nonce: seed.channelNonce, requestId: seed.requestId, mode: "order", transferId: "bad-" + index }, entry.data);
    flow.windowObject.messageListener({ origin: entry.origin, source: entry.source, data, ports: [port] });
    assert.equal(port.messages.length, 0, "case " + index);
  });
  const noPort = new CapturingPort();
  flow.windowObject.messageListener({ origin: sandboxOrigin, source: nestedSource, data: { type: "saloni-preview-request", version: 1, nonce: seed.channelNonce, requestId: seed.requestId, mode: "order", transferId: "no-port" }, ports: [] });
  assert.equal(noPort.messages.length, 0);
});

test("invalidates a prior preview snapshot when a newer source is selected", () => {
  const flow = runFlow();
  flow.customizer.dispatch("click");
  const first = submittedSeed(flow.posted);
  const nestedSource = {};
  const origin = "https://n-1234567890-1lu-script.googleusercontent.com";
  flow.windowObject.messageListener({ origin, source: nestedSource, data: { type: "saloni-order-form-ready", nonce: first.channelNonce, siteKey: "site-key", mode: "order" }, ports: [] });
  flow.catalogueButton.dispatch("click");
  flow.catalogueRequestSelected.dispatch("click");
  const stale = new CapturingPort();
  flow.windowObject.messageListener({ origin, source: nestedSource, data: { type: "saloni-preview-request", version: 1, nonce: first.channelNonce, requestId: first.requestId, mode: "order", transferId: "stale" }, ports: [stale] });
  assert.equal(stale.messages.length, 0);
});
