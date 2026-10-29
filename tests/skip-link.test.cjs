const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

class Element {
  constructor(id) {
    this.id = id;
    this.listeners = {};
    this.attributes = {};
    this.focusOptions = null;
    this.scrollOptions = null;
  }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  dispatch(type, event) { this.listeners[type](event); }
  getAttribute(name) { return this.attributes[name] || ""; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  focus(options) { this.focusOptions = options; }
  scrollIntoView(options) { this.scrollOptions = options; }
}

test("skip link prevents smooth anchor drift and focuses the main content target", () => {
  assert.match(html, /<main\s+id="main-content"[^>]*tabindex="-1"/);

  const skip = new Element("skip-link");
  skip.setAttribute("href", "#main-content");
  const main = new Element("main-content");
  let ready;
  let prevented = false;
  let pushedHash = "";
  const documentObject = {
    documentElement: { classList: { add() {} } },
    addEventListener(type, listener) { if (type === "DOMContentLoaded") ready = listener; },
    querySelector(selector) { return selector === ".skip-link" ? skip : null; },
    querySelectorAll() { return []; },
    getElementById(id) { return id === "main-content" ? main : null; },
  };
  const windowObject = {
    matchMedia: () => ({ matches: true }),
    addEventListener() {},
    history: { pushState(_state, _title, hash) { pushedHash = hash; } },
  };
  const context = { console, document: documentObject, window: windowObject };
  vm.createContext(context);
  vm.runInContext(script, context, { filename: "script.js" });
  ready();

  skip.dispatch("click", { preventDefault() { prevented = true; } });

  assert.equal(prevented, true);
  assert.equal(pushedHash, "#main-content");
  assert.equal(main.focusOptions.preventScroll, true);
  assert.equal(main.scrollOptions.behavior, "instant");
  assert.equal(main.scrollOptions.block, "start");
});

test("customizer navigation ignores modified clicks and focuses its native summary on activation", () => {
  const skip = new Element("skip-link");
  const main = new Element("main-content");
  const navToggle = new Element("nav-toggle");
  navToggle.setAttribute("aria-expanded", "true");
  navToggle.querySelector = () => null;
  const navLink = new Element("customizer-link");
  navLink.addEventListener = (type, listener) => { (navLink.listeners[type] ||= []).push(listener); };
  navLink.dispatch = (type, event) => (navLink.listeners[type] || []).forEach((listener) => listener(event));
  navLink.setAttribute("href", "#customizer");
  const customizer = new Element("customizer");
  const summary = new Element("customizer-summary");
  const disclosure = new Element("customizer-disclosure");
  disclosure.open = false;
  disclosure.querySelector = (selector) => selector === "summary" ? summary : null;
  let ready;
  let hashchange;
  const documentObject = {
    documentElement: { classList: { add() {} } },
    addEventListener(type, listener) {
      if (type === "DOMContentLoaded") ready = listener;
    },
    querySelector(selector) { return selector === ".skip-link" ? skip : null; },
    querySelectorAll(selector) {
      if (selector === "a[href=\"#customizer\"]") return [navLink];
      return [];
    },
    getElementById(id) {
      return { "main-content": main, "nav-toggle": navToggle, "primary-navigation": {
        classList: { toggle() {} },
        querySelector() { return null; },
        querySelectorAll() { return [navLink]; },
      }, customizer, "customizer-disclosure": disclosure }[id] || null;
    },
  };
  const windowObject = {
    location: { hash: "", search: "" },
    history: { pushedHashes: [], pushState(_state, _title, hash) { this.pushedHashes.push(hash); } },
    addEventListener(type, listener) { if (type === "hashchange") hashchange = listener; },
  };
  const context = { console, document: documentObject, window: windowObject, URLSearchParams };
  vm.createContext(context);
  vm.runInContext(script, context, { filename: "script.js" });
  windowObject.location.hash = "#customizer";
  ready();
  assert.equal(disclosure.open, true);
  assert.equal(summary.focusOptions, null);
  disclosure.open = false;
  windowObject.location.hash = "";

  const activation = { button: 0, preventDefault() { this.defaultPrevented = true; } };
  navLink.dispatch("click", activation);

  assert.equal(activation.defaultPrevented, true);
  assert.deepEqual(windowObject.history.pushedHashes, ["#customizer"]);
  assert.equal(disclosure.open, true);
  assert.equal(summary.focusOptions.preventScroll, true);
  assert.equal(customizer.scrollOptions.behavior, "instant");
  assert.equal(navToggle.getAttribute("aria-expanded"), "false");

  disclosure.open = false;
  summary.focusOptions = null;
  const modified = { button: 0, metaKey: true, preventDefault() { this.defaultPrevented = true; } };
  navLink.dispatch("click", modified);
  assert.equal(modified.defaultPrevented, undefined);
  assert.deepEqual(windowObject.history.pushedHashes, ["#customizer"]);
  assert.equal(disclosure.open, false);

  windowObject.location.hash = "#customizer";
  hashchange();
  assert.equal(disclosure.open, true);
  assert.equal(summary.focusOptions, null);
});
