const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const partnerHtml = fs.readFileSync(path.join(root, "partners", "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");

class Element {
  constructor(id, ownerDocument) {
    this.id = id;
    this.ownerDocument = ownerDocument;
    this.listeners = {};
    this.attributes = {};
    this.classList = { values: new Set(), add: (name) => this.classList.values.add(name), remove: (name) => this.classList.values.delete(name), toggle: (name, force) => force === undefined ? (this.classList.values.has(name) ? (this.classList.values.delete(name), false) : (this.classList.values.add(name), true)) : (force ? this.classList.values.add(name) : this.classList.values.delete(name)), contains: (name) => this.classList.values.has(name) };
    this.focusCount = 0;
  }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  dispatch(type, event = {}) { const next = Object.assign({ target: this, preventDefault() {} }, event); (this.listeners[type] || []).forEach((listener) => listener(next)); }
  getAttribute(name) { return this.attributes[name] || ""; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  querySelector(selector) {
    if (selector === ".nav-toggle-closed") return this.closedIcon;
    if (selector === ".nav-toggle-open") return this.openIcon;
    return null;
  }
  querySelectorAll(selector) { return selector === "a" ? this.links || [] : []; }
  focus() { this.focusCount += 1; this.ownerDocument.activeElement = this; }
}

class Dialog extends Element {
  constructor(id, ownerDocument) { super(id, ownerDocument); this.open = false; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch("close"); }
}

function runNavigation({ festive = false } = {}) {
  const documentObject = {
    readyState: "loading",
    activeElement: null,
    documentElement: { classList: { add() {} } },
    addEventListener(type, listener) { if (type === "DOMContentLoaded") this.ready = listener; else (this.listeners[type] ||= []).push(listener); },
    listeners: {},
    dispatch(type, event) { (this.listeners[type] || []).forEach((listener) => listener(event)); },
    querySelector(selector) { return selector === '[aria-controls="festive-offers"]' ? festiveTrigger : null; },
    querySelectorAll() { return []; },
    getElementById(id) { return this.elements.get(id) || null; },
  };
  const toggle = new Element("nav-toggle", documentObject);
  toggle.setAttribute("type", "button");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Open navigation");
  toggle.closedIcon = { hidden: false };
  toggle.openIcon = { hidden: true };
  const nav = new Element("primary-navigation", documentObject);
  const links = [new Element("first-link", documentObject), new Element("second-link", documentObject)];
  nav.links = links;
  const festiveDialog = festive ? new Dialog("festive-offers", documentObject) : null;
  const festiveTrigger = festive ? new Element("festive-trigger", documentObject) : null;
  documentObject.elements = new Map([[toggle.id, toggle], [nav.id, nav], ...(festiveDialog ? [[festiveDialog.id, festiveDialog]] : [])]);
  documentObject.activeElement = toggle;
  const windowObject = {
    location: { href: "https://saloniresinart.com/" },
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    localStorage: festive ? { getItem() { return "1"; } } : undefined,
  };
  const context = { console, document: documentObject, window: windowObject, IntersectionObserver: undefined, Date, Math, URL, URLSearchParams };
  vm.createContext(context);
  vm.runInContext(script, context, { filename: "script.js" });
  documentObject.ready();
  return { documentObject, toggle, nav, links, festiveDialog, festiveTrigger };}


test("navigation has a collapsed, keyboard-operable icon toggle", () => {
  const toggleMarkup = html.match(/<button[^>]+id="nav-toggle"[\s\S]*?<\/button>/)[0];
  assert.match(toggleMarkup, /type="button"[^>]+aria-expanded="false"[^>]+aria-controls="primary-navigation"[^>]+aria-label="Open navigation"/);
  assert.match(toggleMarkup, /class="nav-toggle-closed"[^>]*aria-hidden="true">☰<\/span>/);
  assert.match(toggleMarkup, /class="nav-toggle-open"[^>]*aria-hidden="true"[^>]*>×<\/span>/);
  assert.doesNotMatch(toggleMarkup, /class="nav-toggle-label"/);
  assert.doesNotMatch(toggleMarkup, /<span[^>]*>(?:Menu|Close)<\/span>/);
  assert.match(html, /href="styles\.css\?v=\d+"/);
  assert.match(html, /src="script\.js\?v=\d+"/);
  assert.match(html, /<nav[^>]+id="primary-navigation"[^>]+aria-label="Primary navigation"/);  
  const globalCss = css.split("@media (max-width: 620px)")[0];
  assert.match(css, /\.nav-toggle\s*\{[^}]*display:\s*grid[^}]*width:\s*42px[^}]*height:\s*42px/);
  assert.match(globalCss, /html:not\(\.js\) \.nav-toggle\s*\{[^}]*display:\s*none/);
  assert.match(globalCss, /html\.js #primary-navigation\s*\{[^}]*display:\s*none/);
  assert.match(globalCss, /html\.js #primary-navigation\.is-open\s*\{[^}]*display:\s*flex/);
  assert.match(css, /\.nav-toggle:hover, \.nav-toggle:focus-visible/);
  assert.match(css, /\.site-nav\s*\{[^}]*display:\s*flex/);
  assert.match(css, /@media\s*\(max-width:\s*620px\)[\s\S]*#primary-navigation\s*\{[^}]*display:\s*none/);
  assert.match(css, /html:not\(\.js\) #primary-navigation\s*\{[^}]*display:\s*flex/);
  assert.match(css, /@media\s*\(min-width:\s*621px\)[\s\S]*#primary-navigation\.is-open[\s\S]*width:\s*min\(100%,\s*38rem\)/);
  assert.doesNotMatch(css, /@media\s*\(max-width:\s*620px\)[\s\S]*\.site-nav\s*\{[^}]*display:\s*none/);
  assert.match(partnerHtml, /<nav class="site-nav" aria-label="Partner page navigation">/);

  const { documentObject, toggle, nav, links } = runNavigation();
  assert.equal(toggle.getAttribute("type"), "button");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(toggle.getAttribute("aria-label"), "Open navigation");
  assert.equal(toggle.closedIcon.hidden, false);
  assert.equal(toggle.openIcon.hidden, true);
  assert.equal(nav.classList.contains("is-open"), false);

  toggle.dispatch("click");
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(toggle.getAttribute("aria-label"), "Close navigation");
  assert.equal(toggle.closedIcon.hidden, true);
  assert.equal(toggle.openIcon.hidden, false);
  assert.equal(nav.classList.contains("is-open"), true);
  links[0].dispatch("click");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(toggle.getAttribute("aria-label"), "Open navigation");
  assert.equal(toggle.closedIcon.hidden, false);
  assert.equal(toggle.openIcon.hidden, true);
  assert.equal(nav.classList.contains("is-open"), false);

  toggle.dispatch("click");
  documentObject.dispatch("keydown", { key: "Escape" });
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(toggle.focusCount, 1);
  assert.equal(documentObject.activeElement, toggle);
});

test("festive dialog owns Escape while it is open", () => {
  const { documentObject, toggle, nav, festiveDialog, festiveTrigger } = runNavigation({ festive: true });
  toggle.dispatch("click");
  festiveTrigger.dispatch("click");
  assert.equal(festiveDialog.open, true);

  documentObject.dispatch("keydown", { key: "Escape" });
  assert.equal(festiveDialog.open, true);
  assert.equal(nav.classList.contains("is-open"), true);
  assert.equal(toggle.focusCount, 0);

  festiveDialog.close();
  assert.equal(festiveTrigger.focusCount, 1);
});
