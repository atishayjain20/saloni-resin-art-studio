const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

class Element {
  constructor(id, ownerDocument) {
    this.id = id;
    this.ownerDocument = ownerDocument;
    this.listeners = {};
    this.attributes = {};
    this.children = [];
    this.focusCount = 0;
    this.hidden = true;
  }

  addEventListener(type, listener) { this.listeners[type] = listener; }
  dispatch(type, event = {}) {
    const next = Object.assign({ target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }, event);
    if (this.listeners[type]) this.listeners[type](next);
  }
  focus() { this.focusCount += 1; this.ownerDocument.activeElement = this; }
  getAttribute(name) { return this.attributes[name] || ""; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

class Dialog extends Element {
  constructor(id, ownerDocument, supported = true) {
    super(id, ownerDocument);
    this.open = false;
    this.showModalCalls = 0;
    if (!supported) this.showModal = undefined;
  }

  showModal() {
    if (this.open) throw new Error("already open");
    this.open = true;
    this.showModalCalls += 1;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.dispatch("close");
  }
}

function runPopup({ storage, supported = true, meaningfulFocus = false } = {}) {
  const body = { focusCount: 0 };
  const documentObject = {
    activeElement: body,
    documentElement: { classList: { add() {} } },
    body,
    readyState: "loading",
    addEventListener(type, listener) { if (type === "DOMContentLoaded") this.ready = listener; },
    querySelector(selector) { return selector === '[aria-controls="festive-offers"]' ? trigger : null; },
    querySelectorAll() { return []; },
    getElementById(id) { return elements.get(id) || null; },
  };
  const elements = new Map();
  const trigger = new Element("festive-trigger", documentObject);
  const dialog = new Dialog("festive-offers", documentObject, supported);
  const embed = new Element("order-form-embed", documentObject);
  embed.getAttribute = (name) => name === "data-order-form-url" ? "" : "";
  const frame = new Element("order-form-frame", documentObject);
  frame.hidden = true;
  const status = new Element("order-form-status", documentObject);
  [dialog, embed, frame, status].forEach((element) => elements.set(element.id, element));
  if (meaningfulFocus) {
    const beforeOpen = new Element("before-open", documentObject);
    elements.set(beforeOpen.id, beforeOpen);
    documentObject.activeElement = beforeOpen;
  }
  const windowObject = {
    localStorage: storage,
    location: { href: "https://saloniresinart.com/" },
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    setTimeout() { return 1; },
    clearTimeout() {},
  };
  const context = { console, document: documentObject, window: windowObject, IntersectionObserver: undefined, Date, Math };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "script.js" });
  documentObject.ready();
  return { dialog, trigger, documentObject, windowObject, beforeOpen: elements.get("before-open") };
}

test("opens festive offers once, preserves reload state, and restores focus", () => {
  const storage = {
    values: new Map(),
    getItem(key) { return this.values.get(key) || null; },
    setItem(key, value) { this.values.set(key, value); },
  };
  const first = runPopup({ storage, meaningfulFocus: true });
  assert.equal(first.dialog.showModalCalls, 1);
  assert.equal(storage.values.get("saloniFestiveOfferSeen"), "1");
  first.dialog.close();
  assert.equal(first.beforeOpen.focusCount, 1);

  const reload = runPopup({ storage });
  assert.equal(reload.dialog.showModalCalls, 0);
  reload.trigger.dispatch("click");
  assert.equal(reload.dialog.showModalCalls, 1);
  reload.dialog.close();
  assert.equal(reload.trigger.focusCount, 1);
});

test("storage denial opens once without blocking initialization and unsupported dialog falls back to contact", () => {
  const deniedStorage = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("denied"); },
  };
  const denied = runPopup({ storage: deniedStorage });
  assert.equal(denied.dialog.showModalCalls, 1);
  denied.dialog.close();

  const unsupported = runPopup({ storage: deniedStorage, supported: false });
  assert.equal(unsupported.dialog.showModalCalls, 0);
  assert.equal(unsupported.windowObject.location.href, "https://saloniresinart.com/");
  unsupported.trigger.dispatch("click");
  assert.equal(unsupported.windowObject.location.href, "tel:8209238541");
});
