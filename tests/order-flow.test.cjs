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
  appendChild(child) { this.children.push(child); return child; }
  remove() {}
  querySelector(selector) {
    if (selector === "img[src]") return this.image;
    if (selector === "figcaption strong") return this.title;
    if (selector === "figcaption") return this.caption;
    if (selector === "[data-order-prefill]") return null;
    return null;
  }
  querySelectorAll(selector) {
    if (selector === "figcaption p") return this.detailNodes || [];
    return [];
  }
  scrollIntoView() {}
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
  card.detailNodes = [{ textContent: "Blue and gold" }];
  const posted = [];
  const body = { appendChild() {}, removeChild() {} };
  const windowObject = {
    crypto: { randomUUID: (() => { let n = 0; return () => "request-" + (++n); })() },
    matchMedia: () => ({ matches: true }),
    confirm: () => confirms.length ? confirms.shift() : true,
    addEventListener(type, listener) { if (type === "message") this.messageListener = listener; },
  };
  const documentObject = {
    documentElement: { classList: { add() {} } },
    body,
    addEventListener(type, listener) { if (type === "DOMContentLoaded") this.ready = listener; },
    getElementById(id) { return elements.get(id) || null; },
    querySelectorAll(selector) { return selector === "[data-carousel] .work-card" ? [card] : []; },
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
  return { elements, card, catalogueButton, customizer, posted, windowObject };
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

test("reads square, round, and arch dimensions from customizer controls, including feet", () => {
  const square = runFlow({ frameType: "square", framePreset: "8", frameUnit: "in" });
  square.customizer.dispatch("click");
  let seed = submittedSeed(square.posted);
  assert.deepEqual([seed.height, seed.heightUnit, seed.width, seed.widthUnit], ["8", "in", "8", "in"]);

  const round = runFlow({ frameType: "round", framePreset: "10", frameUnit: "in" });
  round.customizer.dispatch("click");
  seed = submittedSeed(round.posted);
  assert.deepEqual([seed.height, seed.heightUnit, seed.width, seed.widthUnit], ["10", "in", "10", "in"]);

  const arch = runFlow({ frameType: "arch", framePreset: "6", frameUnit: "ft" });
  arch.customizer.dispatch("click");
  seed = submittedSeed(arch.posted);
  assert.deepEqual([seed.height, seed.heightUnit, seed.width, seed.widthUnit], ["0.67", "ft", "0.50", "ft"]);
});
