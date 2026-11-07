const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const page = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const FINAL_QUOTE_NOTE = "Final quote after size, materials and delivery.";

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
    this.listeners = {}; this.children = []; this.attributes = {}; this.files = []; this.scrollCalls = [];
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
  removeChild(child) { this.children = this.children.filter((item) => item !== child); return child; }
  get firstChild() { return this.children[0] || null; }
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
    if (selector === "[data-lightbox-trigger]") return this.lightboxTrigger || null;
    if (selector === "input") {
      for (const child of this.children) {
        if (child.type === "number" || child.tagName === "INPUT") return child;
        const nested = child.querySelector && child.querySelector(selector);
        if (nested) return nested;
      }
    }
    return null;
  }
  querySelectorAll(selector) {
    if (selector === "figcaption p") return this.detailNodes || [];
    if (selector === ".product-pricing > div") return this.priceRows || [];
    return [];
  }
  scrollIntoView(options) { this.scrollCalls.push(options); }
}

class CapturingPort {
  constructor() { this.messages = []; this.closed = false; }
  postMessage(message) { if (!this.closed) this.messages.push(message); }
  close() { this.closed = true; }
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
  };
}

function runFlow({ configured = true, frameType = "square", framePreset = "8", frameUnit = "in", confirms = [], mode = "order", intakeReady, longCatalogueTitle = false, storage = createStorage(), priceOverrides = {}, aiImages = "", diwaliOffer = false } = {}) {
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
  frame.setAttribute("title", "Saloni Resin Art Studio order request form");
  frame.setAttribute("loading", "lazy");
  const frameHost = {
    replaceChild(next, previous) {
      elements.set(next.id, next);
      next.parentNode = this;
      previous.parentNode = null;
    },
  };
  frame.parentNode = frameHost;
  const status = new Element("order-form-status");
  const continueOrder = new Element("order-continue-request"); continueOrder.hidden = true;
  const selectedProductSummary = new Element("selected-product-summary"); selectedProductSummary.hidden = true;
  const selectedProductImage = new Element("selected-product-image");
  const selectedProductName = new Element("selected-product-name");
  const selectedProductPrice = new Element("selected-product-price"); selectedProductPrice.hidden = true;
  const selectedProductSize = new Element("selected-product-size"); selectedProductSize.hidden = true;
  const catalogueSelection = new Element("catalogue-selection"); catalogueSelection.hidden = true;
  const catalogueSelectionPreviews = new Element("catalogue-selection-previews");
  const catalogueSelectionItems = new Element("catalogue-selection-items");
  const catalogueSelectionSummary = new Element("catalogue-selection-summary");
  const catalogueSelectionStatus = new Element("catalogue-selection-status"); catalogueSelectionStatus.hidden = true;
  const catalogueSelectionTotal = new Element("catalogue-selection-total");
  const catalogueSelectionWhatsapp = new Element("catalogue-selection-whatsapp");
  const catalogueCartWhatsapp = new Element("catalogue-cart-whatsapp");
  const catalogueRequestSelected = new Element("catalogue-request-selected"); catalogueRequestSelected.hidden = true;
  const catalogueCartJump = new Element("catalogue-cart-jump"); catalogueCartJump.hidden = true;
  const catalogueCartCount = new Element("catalogue-cart-count");
  const catalogueCartView = new Element("catalogue-cart-view");
  const catalogueCartOrder = new Element("catalogue-cart-order"); catalogueCartOrder.disabled = true;
  const headerCart = new Element("catalogue-header-cart"); headerCart.hidden = true;
  const headerCartCount = new Element("catalogue-header-cart-count");
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
  [embed, frame, status, continueOrder, orderDialog, orderDialogClose, selectedProductSummary, selectedProductImage, selectedProductName, selectedProductPrice, selectedProductSize, catalogueSelection, catalogueSelectionPreviews, catalogueSelectionItems, catalogueSelectionSummary, catalogueSelectionStatus, catalogueSelectionTotal, catalogueSelectionWhatsapp, catalogueCartWhatsapp, catalogueRequestSelected, catalogueCartJump, catalogueCartCount, catalogueCartView, catalogueCartOrder, headerCart, headerCartCount, customizer, continueWithoutPreview, generalRequest, designHelp, summary, dimension, frameTypeControl, framePresetControl, frameUnitControl].forEach((element) => elements.set(element.id, element));
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
    ["navkar-resin-frame.jpg", "Pearl white Namokar mantra frame", "Soft white texture, gold detail, and words that belong at home."],
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
  [card, ...generatedCards].forEach((pricedCard) => {
    const override = priceOverrides[pricedCard.title.textContent];
    if (override) pricedCard.priceRows[0] = { querySelector(selector) { return selector === "dt" ? { textContent: "Price" } : { textContent: override }; } };
  });
  const premiumCards = [
    ["premium-midnight-blue-tiered-set.jpeg", "Midnight blue tiered set", "₹20,000–₹25,000"],
    ["premium-ivory-gold-tiered-set.jpeg", "Ivory-gold tiered set", "Price on request"],
  ].map(([asset, title, price]) => {
    const premiumCard = new Element("work-card");
    premiumCard.caption = new Element("figcaption");
    premiumCard.image = { getAttribute: () => `assets/${asset}` };
    premiumCard.title = { textContent: title };
    premiumCard.titleTag = "strong";
    premiumCard.detailNodes = [{ textContent: "A full premium set." }];
    premiumCard.priceRows = [["Price", price]].map(([label, value]) => ({ querySelector(selector) { return selector === "dt" ? { textContent: label } : { textContent: value }; } }));
    return premiumCard;
  });
  const photoTrigger = () => ({ getAttribute: (name) => (name === "data-ai-images" ? aiImages : null) });
  if (aiImages) [card, premiumCards[0]].forEach((photoCard) => { photoCard.lightboxTrigger = photoTrigger(); });
  const posted = [];
  const customizerOutcomes = [];
  const body = { appendChild() {}, removeChild() {} };
  const windowObject = {
    location: { href: "https://saloniresinart.com/" },
    localStorage: storage,
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
  if (diwaliOffer) elements.set("diwali-offer-bar", { id: "diwali-offer-bar", hidden: false });
  const documentObject = {
    documentElement: { classList: { add() {} } },
    body,
    addEventListener(type, listener) { if (type === "DOMContentLoaded") this.ready = listener; },
    getElementById(id) { return elements.get(id) || null; },
    querySelectorAll(selector) {
      if (selector === ".catalogue-grid .work-card, .catalogue-grid .romantic-keepsake-card") return [card, ...movedStudioCards, ...romanticExistingCards, ...generatedCards, ...romanticConceptCards, ...corporateCards, ...diwaliCards, ...premiumCards];
      if (selector === "#premium-collection .work-card") return premiumCards;
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
  const premiumQuoteButtons = premiumCards.map((premiumCard) => premiumCard.caption.children.find((child) => child.attributes["data-order-prefill"] === "quote"));
  const movedStudioButtons = movedStudioCards.map((studioCard) => studioCard.caption.children.find((child) => child.attributes["data-order-prefill"] === "catalogue"));
  return { elements, photoTriggers: [card.lightboxTrigger, premiumCards[0].lightboxTrigger], premiumCards, premiumQuoteButtons, card, generalRequest, designHelp, catalogueButton, highlightCard, highlightCatalogueButton, movedStudioCards, movedStudioButtons, romanticExistingCards, romanticExistingButtons, generatedCards, generatedCatalogueButtons, generatedCard: generatedCards[0], generatedCatalogueButton: generatedCatalogueButtons[0], romanticConceptCards, romanticConceptButtons, corporateCards, corporateCatalogueButtons, diwaliCards, diwaliCatalogueButtons, customizer, continueWithoutPreview, continueOrder, catalogueSelection, catalogueSelectionPreviews, catalogueSelectionItems, catalogueSelectionSummary, catalogueSelectionStatus, catalogueSelectionTotal, catalogueSelectionWhatsapp, catalogueCartWhatsapp, catalogueRequestSelected, catalogueCartJump, catalogueCartCount, catalogueCartView, catalogueCartOrder, headerCart, headerCartCount, posted, customizerOutcomes, windowObject, orderDialog, orderDialogClose };
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
  assert.equal(flow.posted.length, 1);
  flow.generatedCatalogueButton.dispatch("click");
  assert.equal(flow.posted.length, 2);
  assert.equal(flow.catalogueSelection.hidden, false);
  assert.match(flow.catalogueSelectionSummary.textContent, /2 items selected/);
  assert.equal(flow.catalogueButton.textContent, "Remove from cart");
  assert.equal(flow.generatedCatalogueButton.textContent, "Remove from cart");
  flow.catalogueRequestSelected.dispatch("click");
  assert.equal(flow.posted.length, 2);
  const seed = submittedSeed(flow.posted);
  assert.equal(seed.sourceKind, "catalogue");
  assert.equal(seed.sourceId, "catalogue:multi-item");
  assert.equal(seed.productName, "Your flowers, held close + 1 more");
  assert.equal(seed.quantity, "2");
  assert.match(seed.designDetails, /Test frame/);
  assert.match(seed.designDetails, /Your flowers, held close/);
  assert.match(seed.designDetails, /Qty 1/);
  assert.doesNotMatch(seed.designDetails, /Source:|catalogue:|Quantity:|Item \d+:/);
  assert.deepEqual(seed.bundleItems.map((item) => item.sourceId).sort(), ["catalogue:concept-floral-memory-frame.webp", "catalogue:test-frame.png"]);
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
  assert.equal(flow.posted.length, 4);
  const seed = submittedSeed(flow.posted);
  assert.equal(seed.productName, "Your flowers, held close");
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
  assert.equal(flow.generatedCatalogueButtons[1].textContent, "Add to cart");
  assert.equal(flow.catalogueRequestSelected.disabled, false);
  flow.catalogueRequestSelected.dispatch("click");
  assert.equal(submittedSeed(flow.posted).productName, submittedSeed(flow.posted).bundleItems[0].productName);
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

test("keeps the loader after the iframe navigation loads and clears it after a 2500 ms fallback", () => {
  const flow = runFlow();
  const status = flow.elements.get("order-form-status");
  const cleared = [];
  const timers = [];
  flow.windowObject.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return 40 + timers.length; };
  flow.windowObject.clearTimeout = (id) => cleared.push(id);
  requestCatalogue(flow, flow.catalogueButton, false);
  const frame = flow.elements.get("order-form-frame");
  assert.equal(status.hidden, false);
  assert.equal(frame.hidden, true);
  const timersBeforeLoad = timers.length;
  frame.dispatch("load");
  assert.equal(frame.hidden, false);
  assert.equal(status.hidden, false);
  assert.equal(status.getAttribute("aria-busy"), "true");
  assert.deepEqual(cleared.length, 1);
  assert.equal(timers.length, timersBeforeLoad + 1);
  assert.equal(timers.at(-1).delay, 2500);
  timers.at(-1).callback();
  assert.equal(status.hidden, true);
  assert.equal(status.getAttribute("aria-busy"), "");
});

test("the form ready message ends the loader before the post-load fallback fires", () => {
  const flow = runFlow();
  const status = flow.elements.get("order-form-status");
  const cleared = [];
  const timers = [];
  flow.windowObject.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return 40 + timers.length; };
  flow.windowObject.clearTimeout = (id) => cleared.push(id);
  requestCatalogue(flow, flow.catalogueButton, false);
  const frame = flow.elements.get("order-form-frame");
  const seed = submittedSeed(flow.posted);
  frame.dispatch("load");
  assert.equal(status.hidden, false);
  const fallbackId = 40 + timers.length;
  flow.windowObject.messageListener({ origin: "https://n-current-script.googleusercontent.com", source: frame.contentWindow, data: { type: "saloni-order-form-ready", nonce: seed.channelNonce, siteKey: "site-key" }, ports: [] });
  assert.equal(status.hidden, true);
  assert.ok(cleared.includes(fallbackId));
});

test("visible iframe load cancels the loading timeout before it can show the fallback copy", () => {
  const flow = runFlow();
  const status = flow.elements.get("order-form-status");
  let timeoutCallback;
  flow.windowObject.setTimeout = (callback) => { timeoutCallback = callback; return 42; };
  flow.windowObject.clearTimeout = () => {};
  requestCatalogue(flow, flow.catalogueButton, false);
  const frame = flow.elements.get("order-form-frame");
  frame.dispatch("load");
  timeoutCallback();
  assert.equal(status.hidden, true);
  assert.doesNotMatch(status.textContent, /taking longer than expected/);
});

test("a detached iframe load cannot clear a replacement request", () => {
  const flow = runFlow();
  const status = flow.elements.get("order-form-status");
  const timeoutCallbacks = [];
  flow.windowObject.setTimeout = (callback) => { timeoutCallbacks.push(callback); return timeoutCallbacks.length; };
  flow.windowObject.clearTimeout = () => {};
  requestCatalogue(flow, flow.catalogueButton);
  const firstFrame = flow.elements.get("order-form-frame");
  const firstTarget = flow.posted.at(-1).target;
  flow.catalogueButton.dispatch("click");
  flow.catalogueRequestSelected.dispatch("click");
  const secondFrame = flow.elements.get("order-form-frame");
  const secondTarget = flow.posted.at(-1).target;
  assert.notEqual(secondFrame, firstFrame);
  assert.equal(firstFrame.id, "order-form-frame");
  assert.equal(firstFrame.getAttribute("title"), "Saloni Resin Art Studio order request form");
  assert.equal(firstFrame.getAttribute("loading"), "lazy");
  assert.notEqual(secondFrame.name, firstFrame.name);
  assert.notEqual(secondTarget, firstTarget);
  assert.equal(secondTarget, secondFrame.name);
  assert.equal(status.hidden, false);
  assert.equal(status.getAttribute("aria-busy"), "true");
  flow.windowObject.messageListener({
    origin: "https://n-current-script.googleusercontent.com",
    source: firstFrame.contentWindow,
    data: { type: "saloni-order-form-ready", nonce: submittedSeed(flow.posted).channelNonce, siteKey: "stale-site-key" },
    ports: [],
  });
  assert.equal(status.hidden, false);
  assert.equal(status.getAttribute("aria-busy"), "true");
  timeoutCallbacks[0]();
  assert.equal(status.hidden, false);
  assert.equal(status.getAttribute("aria-busy"), "true");
  firstFrame.dispatch("load");
  assert.equal(status.hidden, false);
  assert.equal(status.getAttribute("aria-busy"), "true");
  secondFrame.dispatch("load");
  assert.equal(status.hidden, false);
  timeoutCallbacks.at(-1)();
  assert.equal(status.hidden, true);
});

test("a stale ready message cannot change the replacement request security or loading state", () => {
  const flow = runFlow();
  const status = flow.elements.get("order-form-status");
  const first = requestCatalogue(flow, flow.catalogueButton);
  const firstFrame = flow.elements.get("order-form-frame");
  flow.catalogueButton.dispatch("click");
  flow.catalogueRequestSelected.dispatch("click");
  const frame = flow.elements.get("order-form-frame");
  const second = submittedSeed(flow.posted);
  assert.notEqual(second.channelNonce, first.channelNonce);
  flow.windowObject.messageListener({
    origin: "https://n-stale-script.googleusercontent.com",
    source: firstFrame.contentWindow,
    data: { type: "saloni-order-form-ready", nonce: first.channelNonce, siteKey: "stale-site-key" },
    ports: [],
  });
  assert.equal(status.hidden, false);
  assert.equal(status.getAttribute("aria-busy"), "true");
  flow.windowObject.messageListener({
    origin: "https://n-current-script.googleusercontent.com",
    source: frame.contentWindow,
    data: { type: "saloni-order-form-ready", nonce: second.channelNonce, siteKey: "" },
    ports: [],
  });
  assert.equal(status.hidden, true);
  const executedSiteKeys = [];
  flow.windowObject.grecaptcha.execute = (siteKey) => {
    executedSiteKeys.push(siteKey);
    return Promise.resolve("parent-token");
  };
  flow.windowObject.messageListener({
    origin: "https://n-current-script.googleusercontent.com",
    source: frame.contentWindow,
    data: { type: "saloni-order-captcha-request", nonce: second.channelNonce, attemptId: "current-attempt" },
    ports: [new CapturingPort()],
  });
  assert.deepEqual(executedSiteKeys, [""]);
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

test("reopens the selected-items order when the prior dialog history entry is still unwinding", () => {
  const flow = runFlow();
  flow.catalogueButton.dispatch("click");
  flow.generatedCatalogueButton.dispatch("click");
  flow.catalogueRequestSelected.dispatch("click");
  assert.equal(flow.orderDialog.open, true);

  flow.windowObject.history.deferBack = true;
  flow.orderDialog.close();
  assert.equal(flow.orderDialog.open, false);
  flow.catalogueRequestSelected.dispatch("click");

  assert.equal(flow.orderDialog.open, true);
  flow.windowObject.history.flushBack();
  assert.equal(flow.orderDialog.open, true);
});

test("keeps order-area copy short and removes the catalogue/customizer instruction", () => {
  assert.equal((page.match(/class="order-final-quote-note">Final quote after size, materials and delivery\.<\/p>/g) || []).length, 1);
  assert.doesNotMatch(page, /class="panel-note"/);
  assert.doesNotMatch(page, /Add catalogue items to one request/);
  assert.doesNotMatch(page, /choose “Request this design” in the customizer/);
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
  const firstFrame = flow.elements.get("order-form-frame");
  flow.windowObject.messageListener({ origin: "https://n-stale-script.googleusercontent.com", source: firstFrame.contentWindow, data: { type: "saloni-order-form-ready", nonce: "stale-nonce", siteKey: "stale" }, ports: [] });
  assert.equal(status.hidden, false);
  assert.equal(status.getAttribute("aria-busy"), "true");
  flow.catalogueButton.dispatch("click");
  flow.catalogueRequestSelected.dispatch("click");
  const frame = flow.elements.get("order-form-frame");
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

test("previews selected catalogue items and provides an accessible cart jump", () => {
  assert.match(page, /id="catalogue-selection-previews"/);
  assert.match(page, /id="catalogue-cart-jump"/);
  assert.match(page, /id="catalogue-selection"[^>]+tabindex="-1"/);

  const flow = runFlow();
  assert.equal(flow.catalogueCartJump.hidden, true);

  flow.catalogueButton.dispatch("click");
  assert.equal(flow.catalogueCartJump.hidden, false);
  assert.equal(flow.catalogueCartCount.textContent, "1 selected");
  assert.equal(flow.catalogueSelectionPreviews.children.length, 1);
  assert.equal(flow.catalogueSelectionPreviews.children[0].getAttribute("src"), "assets/test-frame.png");
  assert.equal(flow.catalogueSelection.focused, undefined);

  flow.generatedCatalogueButtons[1].dispatch("click");
  assert.equal(flow.catalogueCartCount.textContent, "2 selected");
  assert.equal(flow.catalogueSelectionPreviews.children.length, 2);
  flow.generatedCatalogueButtons[0].dispatch("click");
  flow.generatedCatalogueButtons[2].dispatch("click");
  assert.equal(flow.catalogueCartCount.textContent, "4 selected");
  assert.equal(flow.catalogueSelectionPreviews.children.length, 4);
  assert.equal(flow.catalogueSelectionPreviews.children[3].textContent, "+1");
  flow.catalogueCartView.dispatch("click");
  assert.equal(flow.catalogueSelection.focused, true);
  assert.equal(flow.catalogueSelection.focusOptions.preventScroll, true);
  assert.equal(flow.catalogueSelection.scrollCalls.length, 1);
  flow.catalogueRequestSelected.dispatch("click");
  assert.equal(Object.prototype.hasOwnProperty.call(submittedSeed(flow.posted), "imageSrc"), false);

  flow.catalogueButton.dispatch("click");
  flow.generatedCatalogueButtons[1].dispatch("click");
  flow.generatedCatalogueButtons[0].dispatch("click");
  flow.generatedCatalogueButtons[2].dispatch("click");
  assert.equal(flow.catalogueCartJump.hidden, true);
  assert.equal(flow.catalogueSelectionPreviews.children.length, 0);
});

test("premium sets open a one-item quote request and never touch the cart", () => {
  const flow = runFlow();
  const [button] = flow.premiumQuoteButtons;
  assert.ok(button, "premium card has a quote button");
  assert.equal(button.textContent, "Ask for a quote");
  assert.equal(button.getAttribute("aria-label"), "Ask for a quote for Midnight blue tiered set");
  assert.equal(button.hasAttribute("aria-pressed"), false);
  assert.equal(flow.posted.length, 0);
  button.dispatch("click");
  assert.equal(flow.posted.length, 1);
  const seed = submittedSeed(flow.posted);
  assert.equal(seed.sourceKind, "catalogue");
  assert.equal(seed.sourceId, "catalogue:premium-midnight-blue-tiered-set.jpeg");
  assert.equal(seed.productName, "Midnight blue tiered set");
  assert.equal(seed.quantity, "1");
  assert.equal(Object.prototype.hasOwnProperty.call(seed, "bundleItems"), false);
  assert.equal(flow.orderDialog.open, true);
  assert.equal(flow.elements.get("selected-product-name").textContent, "Midnight blue tiered set");
  assert.equal(flow.catalogueSelection.hidden, true);
  assert.equal(flow.catalogueCartJump.hidden, true);
  assert.equal(flow.headerCart.hidden, true);
});

test("a premium quote keeps the cart and Order now still opens the cart request", () => {
  const flow = runFlow();
  flow.catalogueButton.dispatch("click");
  flow.premiumQuoteButtons[0].dispatch("click");
  assert.equal(submittedSeed(flow.posted).sourceId, "catalogue:premium-midnight-blue-tiered-set.jpeg");
  assert.equal(flow.catalogueCartCount.textContent, "1 selected");
  flow.orderDialog.close();
  flow.catalogueCartOrder.dispatch("click");
  const seed = submittedSeed(flow.posted);
  assert.equal(seed.sourceId, "catalogue:multi-item");
  assert.deepEqual(seed.bundleItems.map((item) => item.sourceId), ["catalogue:test-frame.png"]);
  assert.equal(flow.orderDialog.open, true);
});

test("the header cart shows the item count, hides when empty and opens the cart", () => {
  const flow = runFlow();
  assert.equal(flow.headerCart.hidden, true);
  flow.catalogueButton.dispatch("click");
  assert.equal(flow.headerCart.hidden, false);
  assert.equal(flow.headerCartCount.textContent, "1");
  assert.equal(flow.headerCart.getAttribute("aria-label"), "View cart, 1 item");
  flow.generatedCatalogueButtons[0].dispatch("click");
  assert.equal(flow.headerCartCount.textContent, "2");
  assert.equal(flow.headerCart.getAttribute("aria-label"), "View cart, 2 items");
  flow.headerCart.dispatch("click");
  assert.equal(flow.catalogueSelection.focused, true);
  assert.equal(flow.catalogueSelection.focusOptions.preventScroll, true);
  assert.equal(flow.catalogueSelection.scrollCalls.length, 1);
  flow.catalogueButton.dispatch("click");
  flow.generatedCatalogueButtons[0].dispatch("click");
  assert.equal(flow.headerCart.hidden, true);
  assert.equal(flow.headerCartCount.textContent, "");
  assert.equal(flow.headerCart.getAttribute("aria-label"), "View cart");
});

test("the fixed selected-items cart exposes separate View cart and Order now actions", () => {
  assert.match(page, /id="catalogue-cart-jump"[^>]*role="group"[^>]*aria-label="Selected gifts"/);
  assert.match(page, /id="catalogue-cart-count"[^>]*aria-live="polite"/);
  assert.match(page, /id="catalogue-cart-view"[^>]*aria-controls="catalogue-selection"[^>]*>View cart<\/button>/);
  assert.match(page, /id="catalogue-cart-order"[^>]*aria-controls="catalogue-selection"[^>]*>Order now<\/button>/);
  assert.match(page, /id="catalogue-request-selected"[^>]*>Order now<\/button>/);
  assert.match(css, /\.catalogue-cart-jump \.button[^}]*min-height:\s*44px/);
    assert.match(css, /\.catalogue-cart-jump \.button-line\s*\{[^}]*background:\s*transparent[^}]*color:\s*var\(--ivory\)/);
});

test("every tel link on the site dials the full +91 number", () => {
  const files = ["index.html", "script.js", "corporate-gifting/index.html", "apps-script/Form.html", "apps-script/CorporateForm.html"];
  files.forEach((file) => {
    const text = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.doesNotMatch(text, /tel:8209238541/, file);
  });
  assert.match(page, /href="tel:\+918209238541"/);
});

test("Order on WhatsApp links open wa.me with the cart as an encoded message and follow changes", () => {
  const cartLink = page.match(/<a[^>]*id="catalogue-cart-whatsapp"[^>]*href="https:\/\/wa\.me\/918209238541"[^>]*target="_blank"[^>]*rel="noopener"[^>]*>[\s\S]*?<\/a>/);
  assert.ok(cartLink);
  assert.equal(cartLink[0].replace(/<[^>]+>/g, "").trim(), "Order on WhatsApp");
  const selectionLink = page.match(/<a[^>]*id="catalogue-selection-whatsapp"[^>]*href="https:\/\/wa\.me\/918209238541"[^>]*target="_blank"[^>]*rel="noopener"[^>]*>[\s\S]*?<\/a>/);
  assert.ok(selectionLink);
  assert.equal(selectionLink[0].replace(/<[^>]+>/g, "").trim(), "Order on WhatsApp");
  const flow = runFlow();
  flow.catalogueButton.dispatch("click");
  flow.generatedCatalogueButtons[2].dispatch("click");
  const quantity = flow.catalogueSelectionItems.children[0].querySelector("input");
  quantity.value = "2"; quantity.dispatch("change");
  [flow.catalogueSelectionWhatsapp, flow.catalogueCartWhatsapp].forEach((link) => {
    const href = link.getAttribute("href");
    assert.ok(href.startsWith("https://wa.me/918209238541?text="), href);
    assert.doesNotMatch(href, /[\s\n]/);
    const message = decodeURIComponent(href.slice(href.indexOf("=") + 1));
    assert.match(message, /^Hi Saloni/);
    assert.match(message, /Test frame \u00b7 4 in \u00b7 ₹249 × 2/);
    assert.match(message, /Little messages, shared \u00b7 3 in each \u00b7 ₹999 × 1/);
    assert.match(message, /Estimated total: ₹1,497 \+ shipping/);
    assert.doesNotMatch(message, /catalogue:/);
  });
  flow.generatedCatalogueButtons[2].dispatch("click");
  const afterRemove = decodeURIComponent(flow.catalogueCartWhatsapp.getAttribute("href").split("?text=")[1]);
  assert.doesNotMatch(afterRemove, /Little messages/);
  assert.match(afterRemove, /Estimated total: ₹498 \+ shipping/);
  flow.catalogueButton.dispatch("click");
  assert.equal(flow.catalogueCartWhatsapp.getAttribute("href"), "https://wa.me/918209238541");
});

test("phones get a full-screen order dialog where only the form iframe scrolls", () => {
  const block = css.match(/@media \(max-width: 767px\) \{\s*dialog\.order-dialog[\s\S]*?\n\}\n/)?.[0] || "";
  assert.match(block, /dialog\.order-dialog \{[^}]*width: 100vw[^}]*height: 100dvh[^}]*margin: 0[^}]*border-radius: 0/);
  assert.match(block, /\.order-dialog-panel \{[^}]*overflow: hidden[^}]*env\(safe-area-inset-bottom\)/);
  assert.match(block, /\.order-dialog \.order-panel \{[^}]*background: var\(--paper\)[^}]*color: var\(--ink\)/);
  assert.match(block, /\.order-dialog \.order-form-panel iframe \{[^}]*flex: 1 1 auto[^}]*min-height: 0/);
  assert.match(block, /\.order-dialog-close-form \{[^}]*min-height: 44px/);
  assert.doesNotMatch(block, /lightbox/);
});

test("the mobile sticky cart keeps its buttons at 44px and reserves room for one row", () => {
  assert.match(css, /\.catalogue-cart-jump \.button \{[^}]*min-height: 44px/);
  assert.match(css, /body:has\(#catalogue-cart-jump:not\(\[hidden\]\)\) \{ padding-bottom: calc\(5rem/);
  assert.match(css, /\.catalogue-selection \.button \{[^}]*min-height: 2\.75rem/);
});

function itemPriceText(flow, index) {
  const line = flow.catalogueSelectionItems.children[index];
  return line.children.find((child) => child.className === "catalogue-selection-item-price").textContent;
}

test("cart shows each line price and a live estimated total that follows quantity changes", () => {
  assert.match(page, /<p[^>]*id="catalogue-selection-total"[^>]*aria-live="polite"/);
  const flow = runFlow();
  assert.equal(flow.catalogueSelectionTotal.textContent, "");
  flow.catalogueButton.dispatch("click");
  assert.equal(itemPriceText(flow, 0), "₹249 × 1 = ₹249");
  assert.equal(flow.catalogueSelectionTotal.textContent, "Estimated total: ₹249 + shipping");
  flow.generatedCatalogueButtons[2].dispatch("click");
  assert.equal(flow.catalogueSelectionTotal.textContent, "Estimated total: ₹1,248 + shipping");
  const quantity = flow.catalogueSelectionItems.children[0].querySelector("input");
  quantity.value = "2"; quantity.dispatch("change");
  assert.equal(itemPriceText(flow, 0), "₹249 × 2 = ₹498");
  assert.equal(flow.catalogueSelectionTotal.textContent, "Estimated total: ₹1,497 + shipping");
  flow.catalogueButton.dispatch("click");
  assert.equal(flow.catalogueSelectionTotal.textContent, "Estimated total: ₹999 + shipping");
  flow.generatedCatalogueButtons[2].dispatch("click");
  assert.equal(flow.catalogueSelectionTotal.textContent, "");
});

test("while the Diwali offer strip shows, one gift in every three is free, always the lowest-priced, and shipping is free", () => {
  const flow = runFlow({ diwaliOffer: true });
  flow.catalogueButton.dispatch("click");
  assert.equal(flow.catalogueSelectionTotal.textContent, "Estimated total: ₹249 + free shipping (Diwali offer: buy 2, get 1 free)");
  flow.generatedCatalogueButtons[2].dispatch("click");
  const quantity = flow.catalogueSelectionItems.children[0].querySelector("input");
  quantity.value = "2"; quantity.dispatch("change");
  assert.equal(flow.catalogueSelectionTotal.textContent, "Estimated total: ₹1,248 + free shipping (Diwali offer: ₹249 off, buy 2 get 1 free)");
  assert.match(whatsappText(flow), /Estimated total: ₹1,248 \+ free shipping \(Diwali offer: ₹249 off, buy 2 get 1 free\)/);
  quantity.value = "6"; quantity.dispatch("change");
  assert.equal(flow.catalogueSelectionTotal.textContent, "Estimated total: ₹1,995 + free shipping (Diwali offer: ₹498 off, buy 2 get 1 free)");
  const mixed = runFlow({ diwaliOffer: true });
  mixed.catalogueButton.dispatch("click");
  mixed.generatedCatalogueButtons[2].dispatch("click");
  const small = mixed.catalogueSelectionItems.children[0].querySelector("input");
  small.value = "2"; small.dispatch("change");
  const big = mixed.catalogueSelectionItems.children[1].querySelector("input");
  big.value = "3"; big.dispatch("change");
  assert.equal(mixed.catalogueSelectionTotal.textContent, "Estimated total: ₹3,246 + free shipping (Diwali offer: ₹249 off, buy 2 get 1 free)", "5 gifts: one free, and it is the lowest-priced one");
  const plain = runFlow();
  plain.catalogueButton.dispatch("click");
  assert.equal(plain.catalogueSelectionTotal.textContent, "Estimated total: ₹249 + shipping", "no offer when the strip is not showing");
});

test("cart marks price ranges as from-prices and keeps price-on-request items out of the sum", () => {
  const range = runFlow({ priceOverrides: { "Test frame": "₹250–₹400" } });
  range.catalogueButton.dispatch("click");
  const rangeQuantity = range.catalogueSelectionItems.children[0].querySelector("input");
  rangeQuantity.value = "2"; rangeQuantity.dispatch("change");
  assert.equal(itemPriceText(range, 0), "from ₹250 × 2 = from ₹500");
  assert.equal(range.catalogueSelectionTotal.textContent, "Estimated total: from ₹500 + shipping");
  range.generatedCatalogueButtons[2].dispatch("click");
  assert.equal(range.catalogueSelectionTotal.textContent, "Estimated total: from ₹1,499 + shipping");

  const onRequest = runFlow({ priceOverrides: { "Test frame": "Price on request" } });
  onRequest.catalogueButton.dispatch("click");
  assert.equal(itemPriceText(onRequest, 0), "Price on request");
  assert.equal(onRequest.catalogueSelectionTotal.textContent, "Estimated total: price on request");
  onRequest.generatedCatalogueButtons[2].dispatch("click");
  assert.equal(onRequest.catalogueSelectionTotal.textContent, "Estimated total: ₹999 + shipping (plus price-on-request items)");
});

test("fixed cart Order now opens the existing selected-items request without reseeding", () => {
  const flow = runFlow();
  flow.catalogueButton.dispatch("click");
  const submittedBeforeOrder = flow.posted.length;
  flow.catalogueCartOrder.dispatch("click");
  assert.equal(flow.posted.length, submittedBeforeOrder);
  assert.equal(flow.orderDialog.open, true);
});

test("fixed cart Order now restores focus to the fixed cart trigger when closed", () => {
  const flow = runFlow();
  flow.catalogueButton.dispatch("click");
  flow.catalogueCartOrder.dispatch("click");
  flow.orderDialog.close();
  assert.equal(flow.catalogueCartOrder.focused, true);
  assert.equal(flow.catalogueCartOrder.focusOptions.preventScroll, true);
});

test("cart lists every selected line and submits independent quantities with a bounded total", () => {
  const flow = runFlow();
  [flow.catalogueButton, flow.generatedCatalogueButtons[0], flow.generatedCatalogueButtons[1], flow.generatedCatalogueButtons[2]].forEach((button) => button.dispatch("click"));
  assert.equal(flow.catalogueSelectionItems.children.length, 4);
  assert.deepEqual(flow.catalogueSelectionItems.children.map((line) => line.getAttribute("data-product-name")), ["Test frame", "Your flowers, held close", "A little blue hour", "Little messages, shared"]);
  flow.generatedCatalogueButtons[2].dispatch("click");
  const quantities = flow.catalogueSelectionItems.children.map((line) => line.querySelector("input"));
  quantities[0].value = "2"; quantities[0].dispatch("change");
  quantities[1].value = "5"; quantities[1].dispatch("change");
  quantities[2].value = "1"; quantities[2].dispatch("change");
  let currentQuantities = flow.catalogueSelectionItems.children.map((line) => line.querySelector("input"));
  currentQuantities[0].value = "0"; currentQuantities[0].dispatch("change");
  assert.equal(currentQuantities[0].value, "2");
  currentQuantities = flow.catalogueSelectionItems.children.map((line) => line.querySelector("input"));
  currentQuantities[0].value = "1.5"; currentQuantities[0].dispatch("change");
  assert.equal(currentQuantities[0].value, "2");
  currentQuantities = flow.catalogueSelectionItems.children.map((line) => line.querySelector("input"));
  currentQuantities[0].value = "100"; currentQuantities[0].dispatch("change");
  assert.equal(currentQuantities[0].value, "2");
  flow.catalogueRequestSelected.dispatch("click");
  const seed = submittedSeed(flow.posted);
  assert.equal(seed.quantity, "8");
  assert.deepEqual(seed.bundleItems.map((item) => [item.productName, item.quantity]), [["Test frame", 2], ["Your flowers, held close", 5], ["A little blue hour", 1]]);
  assert.match(seed.designDetails, /Test frame.*Qty 2/);
  assert.match(seed.designDetails, /Your flowers, held close.*Qty 5/);
  assert.equal(seed.productName, "Your flowers, held close + 2 more");
  quantities[0].value = "101";
  quantities[0].dispatch("change");
  assert.equal(quantities[0].value, "2");
  assert.match(flow.catalogueSelectionStatus.textContent, /1 to 100|100/);
});

test("restores selected catalogue items and quantities after a browser reload", () => {
  const storage = createStorage();
  const firstLoad = runFlow({ storage });
  firstLoad.catalogueButton.dispatch("click");
  firstLoad.generatedCatalogueButtons[0].dispatch("click");
  const quantity = firstLoad.catalogueSelectionItems.children[0].querySelector("input");
  quantity.value = "3";
  quantity.dispatch("change");
  const persisted = JSON.parse(storage.getItem("saloniCatalogueCart"));
  assert.equal(persisted.version, 1);
  assert.ok(persisted.expiresAt > Date.now());
  assert.ok(persisted.expiresAt <= Date.now() + 30 * 24 * 60 * 60 * 1000);
  assert.deepEqual(persisted.items, [
    { sourceId: "catalogue:test-frame.png", quantity: 3 },
    { sourceId: "catalogue:concept-floral-memory-frame.webp", quantity: 1 },
  ]);

  const reloaded = runFlow({ storage });
  assert.equal(reloaded.catalogueSelection.hidden, false);
  assert.deepEqual(reloaded.catalogueSelectionItems.children.map((line) => line.getAttribute("data-product-name")), ["Test frame", "Your flowers, held close"]);
  assert.deepEqual(reloaded.catalogueSelectionItems.children.map((line) => line.querySelector("input").value), ["3", "1"]);
  assert.equal(reloaded.catalogueButton.textContent, "Remove from cart");
  assert.equal(reloaded.generatedCatalogueButtons[0].textContent, "Remove from cart");
});

test("ignores stale or invalid catalogue cart entries during reload", () => {
  const storage = createStorage({
    saloniCatalogueCart: JSON.stringify({
      version: 1,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      items: [
        { sourceId: "catalogue:test-frame.png", quantity: 2 },
        { sourceId: "catalogue:removed-item.png", quantity: 4 },
        { sourceId: "catalogue:concept-floral-memory-frame.webp", quantity: 0 },
        { sourceId: "catalogue:test-frame.png", quantity: 99 },
      ],
    }),
  });
  const flow = runFlow({ storage });
  assert.deepEqual(flow.catalogueSelectionItems.children.map((line) => line.getAttribute("data-product-name")), ["Test frame"]);
  assert.equal(flow.catalogueSelectionItems.children[0].querySelector("input").value, "2");
});

test("expires and removes malformed catalogue cart records", () => {
  for (const record of [
    JSON.stringify({ version: 1, expiresAt: Date.now() - 1, items: [{ sourceId: "catalogue:test-frame.png", quantity: 2 }] }),
    "not-json",
  ]) {
    const storage = createStorage({ saloniCatalogueCart: record });
    const flow = runFlow({ storage });
    assert.equal(flow.catalogueSelection.hidden, true);
    assert.equal(storage.getItem("saloniCatalogueCart"), null);
  }
});

test("prefills repeat customer details from a valid 30-day parent profile and rejects expired or malformed records", () => {
  const profile = { customerName: "Saved Customer", phone: "+91 8209238541", fulfillment: "shipping", shippingAddress: "61 Hathi Bhata", city: "Ajmer", state: "Rajasthan", pin: "305001" };
  const validStorage = createStorage({ saloniRepeatProfile: JSON.stringify({ version: 1, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, profile }) });
  const valid = runFlow({ storage: validStorage });
  const seeded = requestCatalogue(valid, valid.catalogueButton, false);
  assert.deepEqual(Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, seeded[key]])), profile);

  for (const payload of [
    { version: 1, expiresAt: Date.now() - 1, profile },
    { version: 2, expiresAt: Date.now() + 1000, profile },
    { version: 1, expiresAt: Date.now() + 1000, profile: { ...profile, shippingAddress: { invalid: true } } },
    "not-json",
  ]) {
    const storage = createStorage({ saloniRepeatProfile: typeof payload === "string" ? payload : JSON.stringify(payload) });
    const flow = runFlow({ storage });
    const seeded = requestCatalogue(flow, flow.catalogueButton, false);
    assert.equal(seeded.customerName, "");
    assert.equal(storage.getItem("saloniRepeatProfile"), null);
  }

  const denied = { getItem() { throw new Error("storage denied"); }, setItem() { throw new Error("storage denied"); }, removeItem() { throw new Error("storage denied"); } };
  const flow = runFlow({ storage: denied });
  const deniedSeed = requestCatalogue(flow, flow.catalogueButton, false);
  assert.equal(deniedSeed.customerName, "");
  const deniedFrame = flow.elements.get("order-form-frame");
  assert.doesNotThrow(() => flow.windowObject.messageListener({
    origin: "https://n-current-script.googleusercontent.com", source: deniedFrame.contentWindow,
    data: { type: "saloni-order-form-ready", nonce: deniedSeed.channelNonce, siteKey: "site-key" }, ports: [],
  }));
  assert.doesNotThrow(() => flow.windowObject.messageListener({
    origin: "https://n-current-script.googleusercontent.com", source: deniedFrame.contentWindow,
    data: { type: "saloni-order-save-repeat-profile", version: 1, nonce: deniedSeed.channelNonce, profile }, ports: [],
  }));
});

test("accepts only a pinned successful iframe repeat-profile message and ignores the retired clear message", () => {
  const storage = createStorage();
  const flow = runFlow({ storage });
  const seed = requestCatalogue(flow, flow.catalogueButton, false);
  const frame = flow.elements.get("order-form-frame");
  const source = frame.contentWindow;
  const origin = "https://n-current-script.googleusercontent.com";
  const profile = { customerName: "Saved Customer", phone: "+91 8209238541", fulfillment: "shipping", shippingAddress: "61 Hathi Bhata", city: "Ajmer", state: "Rajasthan", pin: "305001", email: "not allowed", requestId: "not allowed", referralCode: "not allowed" };
  const foreignSource = {};
  flow.windowObject.messageListener({ origin: "https://other.example", source, data: { type: "saloni-order-form-ready", nonce: seed.channelNonce, siteKey: "foreign" }, ports: [] });
  flow.windowObject.messageListener({ origin: "https://other.example", source, data: { type: "saloni-order-save-repeat-profile", version: 1, nonce: seed.channelNonce, profile }, ports: [] });
  flow.windowObject.messageListener({ origin: "https://other.example", source, data: { type: "saloni-order-clear-repeat-profile", version: 1, nonce: seed.channelNonce }, ports: [] });
  flow.windowObject.messageListener({ origin, source: foreignSource, data: { type: "saloni-order-form-ready", nonce: seed.channelNonce, siteKey: "foreign" }, ports: [] });
  assert.equal(flow.elements.get("order-form-status").getAttribute("aria-busy"), "true");
  flow.windowObject.messageListener({ origin, source: foreignSource, data: { type: "saloni-order-save-repeat-profile", version: 1, nonce: seed.channelNonce, profile }, ports: [] });
  flow.windowObject.messageListener({ origin, source: foreignSource, data: { type: "saloni-order-clear-repeat-profile", version: 1, nonce: seed.channelNonce }, ports: [] });
  assert.equal(storage.getItem("saloniRepeatProfile"), null);
  flow.windowObject.messageListener({ origin, source, data: { type: "saloni-order-form-ready", nonce: seed.channelNonce, siteKey: "site-key" }, ports: [] });
  for (const mismatch of [
    { origin: "https://other.example", source, nonce: seed.channelNonce },
    { origin, source, nonce: "stale-nonce" },
    { origin, source: {}, nonce: seed.channelNonce },
  ]) {
    flow.windowObject.messageListener({ origin: mismatch.origin, source: mismatch.source, data: { type: "saloni-order-save-repeat-profile", version: 1, nonce: mismatch.nonce, profile }, ports: [] });
    assert.equal(storage.getItem("saloniRepeatProfile"), null);
  }
  flow.windowObject.messageListener({ origin, source, data: { type: "saloni-order-save-repeat-profile", version: 1, nonce: seed.channelNonce, profile }, ports: [] });
  const saved = JSON.parse(storage.getItem("saloniRepeatProfile"));
  assert.deepEqual(saved.profile, { customerName: profile.customerName, phone: profile.phone, fulfillment: profile.fulfillment, shippingAddress: profile.shippingAddress, city: profile.city, state: profile.state, pin: profile.pin });
  assert.ok(saved.expiresAt > Date.now());
  // The form's "forget my details" checkbox was removed, so a clear message is ignored and the cart is untouched.
  const profileBefore = storage.getItem("saloniRepeatProfile");
  const cartBefore = storage.getItem("saloniCatalogueCart");
  flow.windowObject.messageListener({ origin, source, data: { type: "saloni-order-clear-repeat-profile", version: 1, nonce: seed.channelNonce }, ports: [] });
  assert.equal(storage.getItem("saloniRepeatProfile"), profileBefore);
  assert.equal(storage.getItem("saloniCatalogueCart"), cartBefore);
});

test("cart rows expose an accessible remove action for the exact selected item", () => {
  const flow = runFlow();
  flow.catalogueButton.dispatch("click");
  flow.generatedCatalogueButtons[0].dispatch("click");
  flow.generatedCatalogueButtons[1].dispatch("click");
  assert.equal(flow.catalogueSelectionItems.children.length, 3);

  const row = flow.catalogueSelectionItems.children[1];
  const removeButton = row.children.find((child) => child.type === "button");
  assert.ok(removeButton);
  assert.equal(removeButton.textContent, "×");
  assert.equal(removeButton.getAttribute("aria-label"), "Remove Your flowers, held close from cart");

  removeButton.dispatch("click");
  assert.deepEqual(flow.catalogueSelectionItems.children.map((line) => line.getAttribute("data-product-name")), ["Test frame", "A little blue hour"]);
  assert.equal(flow.catalogueCartCount.textContent, "2 selected");
  assert.equal(flow.generatedCatalogueButtons[0].textContent, "Add to cart");
  assert.equal(flow.generatedCatalogueButtons[1].textContent, "Remove from cart");
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
  assert.equal(seed.productName, "Your flowers, held close + 1 more");
  assert.match(seed.designDetails, /Test frame/);
  assert.match(seed.designDetails, /Your flowers, held close/);
});

test("clears catalogue selections when general or customizer ordering takes over", () => {
  const storage = createStorage();
  const flow = runFlow({ storage });
  flow.catalogueButton.dispatch("click");
  assert.equal(flow.catalogueSelection.hidden, false);

  flow.generalRequest.dispatch("click", { preventDefault() {} });
  assert.equal(flow.catalogueSelection.hidden, true);
  assert.equal(storage.getItem("saloniCatalogueCart"), null);

  flow.catalogueButton.dispatch("click");
  assert.equal(flow.catalogueSelection.hidden, false);
  flow.customizer.dispatch("click");
  assert.equal(flow.catalogueSelection.hidden, true);
  assert.equal(storage.getItem("saloniCatalogueCart"), null);
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
  assert.match(flow.elements.get("order-form-status").innerHTML, /href="tel:\+918209238541"/);
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

test("prepares the cart request on add and replaces it without confirmation or duplicate submission", () => {
  const flow = runFlow({ confirms: [false] });
  flow.catalogueButton.dispatch("click");
  const first = submittedSeed(flow.posted);
  flow.catalogueRequestSelected.dispatch("click");
  assert.equal(flow.posted.length, 1);
  flow.generatedCatalogueButton.dispatch("click");
  const second = submittedSeed(flow.posted);
  assert.equal(flow.posted.length, 2);
  assert.notEqual(second.requestId, first.requestId);
  assert.match(second.designDetails, /Test frame/);
  flow.catalogueRequestSelected.dispatch("click");
  assert.equal(flow.posted.length, 2);
});

test("does not preload a catalogue request when the form is not configured", () => {
  const flow = runFlow({ configured: false });
  flow.catalogueButton.dispatch("click");
  assert.equal(flow.posted.length, 0);
  flow.catalogueRequestSelected.dispatch("click");
  assert.equal(flow.posted.length, 0);
});

test("adds the catalogue order control to highlighted keepsake cards", () => {
  const flow = runFlow();
  assert.ok(flow.highlightCatalogueButton);
  assert.equal(flow.highlightCatalogueButton.textContent, "Add to cart");
  const seed = requestCatalogue(flow, flow.highlightCatalogueButton);
  assert.equal(seed.productName, "Preserved rose display");
  assert.equal(seed.sourceId, "catalogue:multi-item");
  assert.match(seed.designDetails, /^Preserved rose display/);
  assert.doesNotMatch(seed.designDetails, /catalogue:/);
  assert.equal(seed.bundleItems[0].sourceId, "catalogue:studio-red-rose-resin-display.jpeg");
});

test("keeps moved studio art cards on the shared catalogue order path", () => {
  const flow = runFlow();
  const expected = [
    ["resin-clock.jpg", "Blue hour resin clock"],
    ["resin-message-coasters.jpg", "Personalized message coasters"],
    ["navkar-resin-frame.jpg", "Pearl white Namokar mantra frame"],
    ["personalized-floral-hoop.jpg", "A tiny beginning"],
  ];
  expected.forEach(([asset, title], index) => {
    assert.equal(flow.movedStudioButtons[index].textContent, "Add to cart");
    const seed = requestCatalogue(flow, flow.movedStudioButtons[index]);
    assert.equal(seed.sourceId, "catalogue:multi-item");
    assert.equal(seed.productName, title);
    assert.equal(seed.bundleItems[0].sourceId, `catalogue:${asset}`);
    assert.match(seed.designDetails, new RegExp(`^${title}`));
    assert.doesNotMatch(seed.designDetails, /Source:|catalogue:/);
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

test("reports real customizer handoff outcomes while replacing an existing request automatically", async () => {
  const cancelled = runFlow({ confirms: [false] });
  requestCatalogue(cancelled, cancelled.catalogueButton);
  cancelled.customizer.dispatch("click");
  assert.deepEqual(cancelled.customizerOutcomes, ["success"]);

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
  assert.deepEqual(helpCancelled.customizerOutcomes, ["success"]);
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
  flow.windowObject.messageListener({ origin: "https://n-1234567890-1lu-script.googleusercontent.com", source: flow.elements.get("order-form-frame").contentWindow, data: { type: "saloni-preview-request", version: 1, nonce: seed.channelNonce, requestId: seed.requestId, mode: "order", transferId: "no-preview" }, ports: [latePreview] });
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
    [flow.catalogueButton, "4 in", "Test frame"],
    [flow.romanticExistingButtons[0], "8–10 in", "Rose hexagon"],
    [flow.generatedCatalogueButtons[2], "3 in each", "Little messages, shared"],
    [flow.generatedCatalogueButtons[1], null, "A little blue hour"],
  ];
  cases.forEach(([button, sizeDetails, productName]) => {
    const seed = requestCatalogue(flow, button);
    assert.equal(seed.productName, productName);
    assert.match(seed.designDetails, new RegExp(productName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")));
    if (sizeDetails) assert.match(seed.designDetails, new RegExp(sizeDetails.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")));
    else assert.doesNotMatch(seed.designDetails, /Size|not shown/);
    assert.deepEqual([seed.heightFeet, seed.heightInchesPart, seed.widthFeet, seed.widthInchesPart], ["", "", "", ""]);
  });
});

test("uses the shared catalogue CTA and preserves generated-design details in a catalogue seed", () => {
  const flow = runFlow();
  assert.equal(flow.generatedCatalogueButton.textContent, "Add to cart");
  assert.equal(flow.catalogueButton.textContent, "Add to cart");
  const seed = requestCatalogue(flow, flow.generatedCatalogueButton);
  assert.equal(seed.sourceKind, "catalogue");
  assert.equal(seed.sourceId, "catalogue:multi-item");
  assert.equal(seed.bundleItems[0].sourceId, "catalogue:concept-floral-memory-frame.webp");
  assert.match(seed.designDetails, /^Your flowers, held close/);
  assert.doesNotMatch(seed.designDetails, /Source:|catalogue:/);
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
    assert.equal(seed.bundleItems[0].sourceId, `catalogue:${asset}`);
    assert.deepEqual([seed.heightFeet, seed.heightInchesPart, seed.widthFeet, seed.widthInchesPart], ["", "", "", ""]);
    assert.ok(seed.designDetails.includes(`₹${festive}`));
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
    assert.equal(button.textContent, "Add to cart");
    const seed = requestCatalogue(flow, button);
    assert.equal(seed.sourceId, "catalogue:multi-item");
    assert.equal(seed.productName, title);
    assert.match(seed.designDetails, new RegExp(`^${title}`));
    assert.equal(seed.bundleItems[0].sourceId, `catalogue:${asset}`);
    assert.match(seed.designDetails, /Qty 1/);
    assert.doesNotMatch(seed.designDetails, /Source:|catalogue:/);
  });
});

test("seeds every new Diwali concept with identity, unit, concept, and pricing details", () => {
  const section = page.match(/<section\b[^>]*id=["']diwali["'][\s\S]*?<\/section>/);
  assert.ok(section, "Diwali catalogue section must exist before order extraction is tested");
  assert.equal((section[0].match(/data-lightbox-trigger/g) || []).length, 23);
  const flow = runFlow();
  DIWALI_NEW_CONCEPTS.forEach(([asset, title, copy, unit, regular, festive, discount], index) => {
    const button = flow.diwaliCatalogueButtons[index];
    assert.equal(button.textContent, "Add to cart");
    const seed = requestCatalogue(flow, button);
    assert.equal(seed.sourceId, "catalogue:multi-item");
    assert.equal(seed.productName, title);
    assert.match(seed.designDetails, new RegExp(`^${title}`));
    assert.equal(seed.bundleItems[0].sourceId, `catalogue:${asset}`);
    assert.match(seed.designDetails, /Qty 1/);
    assert.doesNotMatch(seed.designDetails, /Source:|catalogue:/);
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
  ];
  expected.forEach(([asset, title, copy, regular, festive, discount], index) => {
    const button = flow.romanticConceptButtons[index];
    assert.equal(button.textContent, "Add to cart");
    const seed = requestCatalogue(flow, button);
    assert.equal(seed.sourceId, "catalogue:multi-item");
    assert.equal(seed.productName, title);
    assert.match(seed.designDetails, new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.equal(seed.bundleItems[0].sourceId, `catalogue:${asset}`);
    assert.ok(seed.designDetails.includes(`₹${festive}`));
    assert.doesNotMatch(seed.designDetails, /Regular price|Discount|% off|Average listed price/);
    assert.deepEqual([seed.heightFeet, seed.heightInchesPart, seed.widthFeet, seed.widthInchesPart], ["", "", "", ""]);
  });
});

test("keeps order seeds correct at the first, eighth, ninth, and eleventh romantic cards", () => {
  const flow = runFlow();
  const selected = [
    [flow.romanticConceptButtons[0], "catalogue:romantic-us-keychain-pair.webp", "Two keys, one little us"],
    [flow.romanticConceptButtons[7], "catalogue:romantic-ocean-memory-tray.webp", "Our place, held in waves"],
    [flow.romanticExistingButtons[0], "catalogue:studio-rose-hexagon-keepsake.jpeg", "Rose hexagon"],
    [flow.romanticExistingButtons[2], "catalogue:studio-red-rose-resin-display.jpeg", "Preserved rose display"],
  ];
  selected.forEach(([button, sourceId, productName]) => {
    const seed = requestCatalogue(flow, button);
    assert.equal(seed.sourceId, "catalogue:multi-item");
    assert.equal(seed.productName, productName);
    assert.match(seed.designDetails, new RegExp(`^${productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.equal(seed.bundleItems[0].sourceId, sourceId);
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

test("pins the exact form iframe sender and observed sandbox origin, then rejects stale or foreign messages", async () => {
  const flow = runFlow({ confirms: [true] });
  const first = requestCatalogue(flow, flow.catalogueButton);
  const frame = flow.elements.get("order-form-frame");
  const nestedSource = frame.contentWindow;
  const sandboxOrigin = "https://n-nested-script.googleusercontent.com";
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
  const replacementSource = flow.elements.get("order-form-frame").contentWindow;
  const replacementOrigin = "https://n-1234567890-1lu-script.googleusercontent.com";
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
  const source = flow.elements.get("order-form-frame").contentWindow;
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
  const source = flow.elements.get("order-form-frame").contentWindow;
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
  const nestedSource = flow.elements.get("order-form-frame").contentWindow;
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
  const source = flow.elements.get("order-form-frame").contentWindow;
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
  const nestedSource = flow.elements.get("order-form-frame").contentWindow;
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
  const nestedSource = flow.elements.get("order-form-frame").contentWindow;
  const origin = "https://n-1234567890-1lu-script.googleusercontent.com";
  flow.windowObject.messageListener({ origin, source: nestedSource, data: { type: "saloni-order-form-ready", nonce: first.channelNonce, siteKey: "site-key", mode: "order" }, ports: [] });
  flow.catalogueButton.dispatch("click");
  flow.catalogueRequestSelected.dispatch("click");
  const stale = new CapturingPort();
  flow.windowObject.messageListener({ origin, source: nestedSource, data: { type: "saloni-preview-request", version: 1, nonce: first.channelNonce, requestId: first.requestId, mode: "order", transferId: "stale" }, ports: [stale] });
  assert.equal(stale.messages.length, 0);
});

const EMERALD_NAME = "Test frame (colour: Emerald)";
const EMERALD_IMAGE = "assets/ai-images/test-frame--emerald.webp";

function cartLines(flow) { return flow.catalogueSelectionItems.children.map((line) => line.getAttribute("data-product-name")); }
function whatsappText(flow) { return decodeURIComponent(flow.catalogueSelectionWhatsapp.attributes.href); }

function assertChosenEmerald(flow) {
  assert.equal(flow.catalogueSelectionPreviews.children[0].attributes.src, EMERALD_IMAGE);
  assert.deepEqual(cartLines(flow), [EMERALD_NAME]);
  assert.match(flow.catalogueSelectionSummary.textContent, /\(colour: Emerald\)/);
  assert.match(whatsappText(flow), /\(colour: Emerald\)/);
  flow.catalogueRequestSelected.dispatch("click");
  const seed = submittedSeed(flow.posted);
  assert.deepEqual(seed.bundleItems.map((item) => item.productName), [EMERALD_NAME]);
  assert.equal(seed.bundleItems[0].sourceId, "catalogue:test-frame.png", "the source id does not change");
  assert.match(seed.designDetails, /Test frame \(colour: Emerald\)/);
}

test("adds the colour photo a shopper swiped to on the card to the cart and the order", () => {
  const flow = runFlow({ aiImages: "emerald styled" });
  flow.photoTriggers[0].__saloniPhotoName = "emerald";
  flow.catalogueButton.dispatch("click");
  assertChosenEmerald(flow);
});

test("adds the colour photo shown in the lightbox to the cart and clears the one-shot choice", () => {
  const flow = runFlow({ aiImages: "emerald styled" });
  flow.catalogueButton.__saloniChosenPhoto = "emerald";
  flow.catalogueButton.dispatch("click");
  assertChosenEmerald(flow);
  assert.ok(!flow.catalogueButton.__saloniChosenPhoto, "the lightbox choice is used once");
  assert.equal(flow.catalogueButton.getAttribute("aria-label"), "Remove Test frame from cart", "labels keep the plain title");
});

test("a lightbox choice wins over the card photo and does not stick to the next add", () => {
  const flow = runFlow({ aiImages: "emerald styled" });
  flow.photoTriggers[0].__saloniPhotoName = "emerald";
  flow.catalogueButton.__saloniChosenPhoto = "";
  flow.catalogueButton.dispatch("click");
  assert.deepEqual(cartLines(flow), ["Test frame"], "viewing the real photo in the lightbox adds it as shown");
  flow.catalogueButton.dispatch("click");
  flow.catalogueButton.dispatch("click");
  assert.deepEqual(cartLines(flow), [EMERALD_NAME], "the card photo choice applies when no lightbox choice is waiting");
});

test("adds the photo as shown for the first photo and the styled scene", () => {
  for (const name of [undefined, "", "styled"]) {
    const flow = runFlow({ aiImages: "emerald styled" });
    flow.photoTriggers[0].__saloniPhotoName = name;
    flow.catalogueButton.dispatch("click");
    assert.deepEqual(cartLines(flow), ["Test frame"], String(name));
    assert.equal(flow.catalogueSelectionPreviews.children[0].attributes.src, "assets/test-frame.png");
    flow.catalogueRequestSelected.dispatch("click");
    const seed = submittedSeed(flow.posted);
    assert.doesNotMatch(seed.designDetails, /colour:/);
    assert.equal(seed.bundleItems[0].productName, "Test frame");
  }
});

test("ignores a photo name the card does not offer", () => {
  const flow = runFlow({ aiImages: "emerald styled" });
  flow.photoTriggers[0].__saloniPhotoName = "purple";
  flow.catalogueButton.dispatch("click");
  assert.deepEqual(cartLines(flow), ["Test frame"]);
  assert.equal(flow.catalogueSelectionPreviews.children[0].attributes.src, "assets/test-frame.png");
});

test("removes the item from the cart even when another colour is on show", () => {
  const flow = runFlow({ aiImages: "emerald styled" });
  flow.photoTriggers[0].__saloniPhotoName = "emerald";
  flow.catalogueButton.dispatch("click");
  assert.equal(flow.catalogueButton.textContent, "Remove from cart");
  flow.photoTriggers[0].__saloniPhotoName = "styled";
  flow.catalogueButton.dispatch("click");
  assert.deepEqual(cartLines(flow), []);
  assert.equal(flow.catalogueButton.textContent, "Add to cart");
});

test("sends the colour on view with a quote request", () => {
  const flow = runFlow({ aiImages: "emerald styled" });
  flow.photoTriggers[1].__saloniPhotoName = "emerald";
  flow.premiumQuoteButtons[0].dispatch("click");
  const seed = submittedSeed(flow.posted);
  assert.equal(seed.sourceId, "catalogue:premium-midnight-blue-tiered-set.jpeg");
  assert.equal(seed.productName, "Midnight blue tiered set (colour: Emerald)");
  flow.photoTriggers[1].__saloniPhotoName = "";
  flow.premiumQuoteButtons[0].dispatch("click");
  assert.equal(submittedSeed(flow.posted).productName, "Midnight blue tiered set");
});

test("saves the chosen colour and restores it after a reload", () => {
  const storage = createStorage();
  const first = runFlow({ storage, aiImages: "emerald styled" });
  first.photoTriggers[0].__saloniPhotoName = "emerald";
  first.catalogueButton.dispatch("click");
  first.generatedCatalogueButtons[0].dispatch("click");
  assert.deepEqual(JSON.parse(storage.getItem("saloniCatalogueCart")).items, [
    { sourceId: "catalogue:test-frame.png", quantity: 1, photo: "emerald" },
    { sourceId: "catalogue:concept-floral-memory-frame.webp", quantity: 1 },
  ]);
  const reloaded = runFlow({ storage, aiImages: "emerald styled" });
  assert.deepEqual(cartLines(reloaded), [EMERALD_NAME, "Your flowers, held close"]);
  assert.equal(reloaded.catalogueSelectionPreviews.children[0].attributes.src, EMERALD_IMAGE);
});

test("restores as shown when the saved photo is unknown, styled or not a string", () => {
  for (const photo of ["purple", "styled", "", 7, null, "Emerald"]) {
    const storage = createStorage({
      saloniCatalogueCart: JSON.stringify({ version: 1, expiresAt: Date.now() + 1000 * 60, items: [{ sourceId: "catalogue:test-frame.png", quantity: 2, photo }] }),
    });
    const flow = runFlow({ storage, aiImages: "emerald styled" });
    assert.deepEqual(cartLines(flow), ["Test frame"], String(photo));
    assert.equal(flow.catalogueSelectionPreviews.children[0].attributes.src, "assets/test-frame.png");
  }
});

test("restores an older saved cart that has no photo field", () => {
  const storage = createStorage({
    saloniCatalogueCart: JSON.stringify({ version: 1, expiresAt: Date.now() + 1000 * 60, items: [{ sourceId: "catalogue:test-frame.png", quantity: 2 }] }),
  });
  const flow = runFlow({ storage, aiImages: "emerald styled" });
  assert.deepEqual(cartLines(flow), ["Test frame"]);
});

test("prepares the request with the new colour after the item is removed and added again", () => {
  const flow = runFlow({ aiImages: "emerald styled" });
  flow.catalogueButton.dispatch("click");
  const before = flow.posted.length;
  flow.catalogueButton.dispatch("click");
  flow.photoTriggers[0].__saloniPhotoName = "emerald";
  flow.catalogueButton.dispatch("click");
  assert.ok(flow.posted.length > before, "the form is prepared again for the new colour");
  assert.equal(submittedSeed(flow.posted).bundleItems[0].productName, EMERALD_NAME);
});
