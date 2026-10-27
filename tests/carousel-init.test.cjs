const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

function card() {
  const classes = new Set(["reveal"]);
  return {
    classList: {
      add(name) { classes.add(name); },
      contains(name) { return classes.has(name); },
    },
  };
}

test("shows the first two carousel cards immediately", () => {
  const first = card();
  const second = card();
  const third = card();
  const observed = [];
  class IntersectionObserverMock {
    constructor() {}
    observe(element) { observed.push(element); }
    unobserve() {}
  }
  let ready;
  const documentObject = {
    documentElement: { classList: { add() {} } },
    body: {},
    addEventListener(type, listener) { if (type === "DOMContentLoaded") ready = listener; },
    querySelectorAll(selector) {
      if (selector === "[data-carousel-track] > :nth-child(-n+2)") return [first, second];
      if (selector === ".reveal") return [first, second, third];
      return [];
    },
    querySelector() { return null; },
    getElementById() { return null; },
  };
  const windowObject = { matchMedia: () => ({ matches: false }), addEventListener() {}, location: null, IntersectionObserver: IntersectionObserverMock };
  const context = { console, document: documentObject, window: windowObject, IntersectionObserver: IntersectionObserverMock, Date, Math };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "script.js" });
  ready();
  assert.equal(first.classList.contains("is-visible"), true);
  assert.equal(second.classList.contains("is-visible"), true);
  assert.equal(third.classList.contains("is-visible"), false);
  assert.deepEqual(observed, [third]);
});
