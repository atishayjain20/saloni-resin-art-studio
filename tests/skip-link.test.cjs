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
