const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const googlePath = path.join(root, "google.js");
const source = fs.existsSync(googlePath) ? fs.readFileSync(googlePath, "utf8") : "";
const GTM_ID = "GTM-TJ2DZTHG";
const GTM_SRC = "https://www.googletagmanager.com/gtm.js?id=" + GTM_ID;
const CONSENT_KEY = "saloniGoogleConsent";
const SOURCE_KEY = "saloniVisitSource";

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.parentNode = null;
    this.textContent = "";
    this.className = "";
    this.hidden = false;
    this.id = "";
  }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === "id") this.id = String(value); if (name === "class") this.className = String(value); }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
  removeAttribute(name) { delete this.attributes[name]; if (name === "hidden") this.hidden = false; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }
  appendChild(child) { child.parentNode = this; this.children.push(child); if (this.onAppend) this.onAppend(child); return child; }
  insertBefore(child, reference) {
    child.parentNode = this;
    const index = reference ? this.children.indexOf(reference) : -1;
    if (index < 0) this.children.push(child); else this.children.splice(index, 0, child);
    return child;
  }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); child.parentNode = null; return child; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get nextSibling() { const siblings = this.parentNode ? this.parentNode.children : []; return siblings[siblings.indexOf(this) + 1] || null; }
  get firstChild() { return this.children[0] || null; }
  addEventListener(type, listener) { (this.listeners[type] = this.listeners[type] || []).push(listener); }
  click() { (this.listeners.click || []).forEach((listener) => listener({ target: this, preventDefault() {} })); }
  focus() { this.ownerDocument.activeElement = this; }
}

function walk(node, visit) {
  visit(node);
  node.children.forEach((child) => walk(child, visit));
}
function findAll(node, predicate) {
  const found = [];
  walk(node, (item) => { if (predicate(item)) found.push(item); });
  return found;
}

function storageOf(initial, throws) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { if (throws) throw new Error("blocked"); return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { if (throws) throw new Error("blocked"); values.set(key, String(value)); },
    removeItem(key) { if (throws) throw new Error("blocked"); values.delete(key); },
    values,
  };
}

// Runs google.js in a fake page. `openers` is how many [data-cookie-settings] buttons the page has.
function load({ search = "", local = {}, session = {}, throwSession = false, throwLocal = false, skipLink = true, openers = 1, readyState = "complete" } = {}) {
  const documentObject = { readyState, activeElement: null, listeners: {} };
  documentObject.createElement = (tag) => new FakeElement(tag, documentObject);
  documentObject.documentElement = new FakeElement("html", documentObject);
  documentObject.head = new FakeElement("head", documentObject);
  documentObject.body = new FakeElement("body", documentObject);
  documentObject.addEventListener = (type, listener) => { (documentObject.listeners[type] = documentObject.listeners[type] || []).push(listener); };
  const skip = skipLink ? documentObject.body.appendChild(Object.assign(new FakeElement("a", documentObject), { className: "skip-link" })) : null;
  const main = documentObject.body.appendChild(new FakeElement("main", documentObject));
  const openerButtons = [];
  for (let index = 0; index < openers; index += 1) {
    const button = main.appendChild(new FakeElement("button", documentObject));
    button.setAttribute("data-cookie-settings", "");
    button.hidden = true;
    button.setAttribute("hidden", "");
    openerButtons.push(button);
  }
  // The order in which things reach the page: every script tag added to <head>, with the data layer as it was at that moment.
  const headLog = [];
  documentObject.head.onAppend = (child) => headLog.push({ tag: child.tagName, src: child.src, layerLength: windowObject.dataLayer ? windowObject.dataLayer.length : 0 });
  documentObject.querySelector = (selector) => (selector === ".skip-link" ? skip : null);
  documentObject.querySelectorAll = (selector) => (selector === "[data-cookie-settings]" ? openerButtons : []);
  const localStorage = storageOf(local, throwLocal);
  const sessionStorage = storageOf(session, throwSession);
  const windowObject = { document: documentObject, location: { search }, localStorage, sessionStorage };
  vm.runInNewContext(source, { window: windowObject, document: documentObject, URLSearchParams, Date });
  const fireReady = () => (documentObject.listeners.DOMContentLoaded || []).splice(0).forEach((listener) => listener());
  const banner = () => findAll(documentObject.body, (node) => node.tagName === "SECTION" && node.getAttribute("role") === "region")[0] || null;
  const buttonsOf = (node) => (node ? findAll(node, (item) => item.tagName === "BUTTON") : []);
  const gtmScripts = () => documentObject.head.children.filter((child) => child.tagName === "SCRIPT" && /googletagmanager\.com/.test(child.src || ""));
  const layer = () => Array.from(windowObject.dataLayer || [], (entry) => JSON.parse(JSON.stringify(entry && typeof entry.length === "number" ? Array.prototype.slice.call(entry) : entry)));
  return { windowObject, documentObject, localStorage, sessionStorage, openerButtons, headLog, banner, buttonsOf, gtmScripts, layer, fireReady, skip, main };
}
const accept = (page) => page.buttonsOf(page.banner()).find((button) => /accept/i.test(button.textContent));
const decline = (page) => page.buttonsOf(page.banner()).find((button) => /decline/i.test(button.textContent));
const read = (page) => page.windowObject.saloniVisitSource.read();

// ---- Visit source (cookie-free) ----
test("google.js exists", () => {
  assert.ok(source, "google.js is missing");
});

test("a Google Shopping visit is remembered for the tab, and other query parameters are ignored", () => {
  const page = load({ search: "?source=google-shopping&srsltid=AfmBOo123&gclid=x" });
  assert.equal(read(page), "google-shopping");
  assert.equal(page.sessionStorage.values.get(SOURCE_KEY), "google-shopping");
  assert.equal(page.localStorage.values.size, 0, "the source never touches localStorage");
});

test("a visit with only srsltid or gclid has no source", () => {
  const page = load({ search: "?srsltid=AfmBOo123&gclid=abc" });
  assert.equal(read(page), "");
  assert.equal(page.sessionStorage.values.has(SOURCE_KEY), false);
});

test("an unknown source value is ignored and never clears a saved one", () => {
  const unknown = load({ search: "?source=newsletter" });
  assert.equal(read(unknown), "");
  assert.equal(unknown.sessionStorage.values.has(SOURCE_KEY), false);
  const saved = load({ search: "?source=somewhere-else", session: { [SOURCE_KEY]: "google-shopping" } });
  assert.equal(read(saved), "google-shopping");
  assert.equal(saved.sessionStorage.values.get(SOURCE_KEY), "google-shopping");
  const later = load({ search: "", session: { [SOURCE_KEY]: "google-shopping" } });
  assert.equal(read(later), "google-shopping", "a later page without the parameter still reads the saved source");
});

test("a stored value that is not a known source reads as empty", () => {
  assert.equal(read(load({ session: { [SOURCE_KEY]: "<script>alert(1)</script>" } })), "");
});

test("when storage throws, the source is kept in memory for the page", () => {
  const page = load({ search: "?source=google-shopping", throwSession: true, throwLocal: true });
  assert.equal(read(page), "google-shopping");
  assert.doesNotThrow(() => read(page));
});

test("the visit source is read even when the page has no usable location", () => {
  const documentObject = { readyState: "complete", head: { appendChild() {} }, body: { appendChild() {}, insertBefore() {} }, createElement() { throw new Error("blocked"); }, querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {} };
  const windowObject = { document: documentObject };
  assert.doesNotThrow(() => vm.runInNewContext(source, { window: windowObject, document: documentObject, URLSearchParams, Date }));
  assert.equal(windowObject.saloniVisitSource.read(), "");
});

// ---- Cookie banner and the Google tag ----
test("with no stored choice the banner shows and no Google tag is added", () => {
  const page = load();
  assert.ok(page.banner(), "the banner is shown");
  assert.equal(page.gtmScripts().length, 0);
  assert.equal(page.windowObject.dataLayer, undefined, "nothing is pushed before Accept");
  assert.equal(page.localStorage.values.has(CONSENT_KEY), false);
});

test("Decline stores denied and never adds a Google script", () => {
  const page = load();
  decline(page).click();
  assert.equal(page.localStorage.values.get(CONSENT_KEY), "denied");
  assert.equal(page.gtmScripts().length, 0);
  assert.equal(page.banner(), null, "the banner is gone");
  assert.equal(page.windowObject.dataLayer, undefined);
});

test("Accept adds exactly one async Google tag with the right container ID, after the consent default", () => {
  const page = load();
  accept(page).click();
  assert.equal(page.localStorage.values.get(CONSENT_KEY), "granted");
  const scripts = page.gtmScripts();
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, GTM_SRC);
  assert.equal(scripts[0].async, true);
  const entries = page.layer();
  assert.deepEqual(entries[0], ["consent", "default", { ad_storage: "granted", ad_user_data: "granted", analytics_storage: "granted", ad_personalization: "denied" }]);
  assert.equal(entries[1].event, "gtm.js");
  assert.equal(typeof entries[1]["gtm.start"], "number");
  assert.equal(entries[2][0], "js");
  const added = page.headLog.find((item) => item.tag === "SCRIPT");
  assert.ok(added.layerLength >= 3, "the consent default, gtm.start and js are in the data layer before the script is added");
  assert.equal(page.banner(), null);
  assert.equal(page.gtmScripts().length, 1);
});

test("a stored granted choice loads the tag on page load and shows no banner", () => {
  const page = load({ local: { [CONSENT_KEY]: "granted" } });
  assert.equal(page.banner(), null);
  assert.equal(page.gtmScripts().length, 1);
  assert.equal(page.gtmScripts()[0].src, GTM_SRC);
  assert.deepEqual(page.layer()[0].slice(0, 2), ["consent", "default"]);
});

test("a stored denied choice shows no banner and loads nothing", () => {
  const page = load({ local: { [CONSENT_KEY]: "denied" } });
  assert.equal(page.banner(), null);
  assert.equal(page.gtmScripts().length, 0);
});

test("an unknown stored choice is treated as no choice", () => {
  const page = load({ local: { [CONSENT_KEY]: "maybe" } });
  assert.ok(page.banner());
  assert.equal(page.gtmScripts().length, 0);
});

test("when localStorage throws, the banner still works and Accept loads the tag for this page", () => {
  const page = load({ throwLocal: true });
  assert.ok(page.banner());
  accept(page).click();
  assert.equal(page.gtmScripts().length, 1);
});

test("Decline after the tag has loaded revokes all four consent signals", () => {
  const page = load({ local: { [CONSENT_KEY]: "granted" } });
  page.openerButtons[0].click();
  decline(page).click();
  assert.equal(page.localStorage.values.get(CONSENT_KEY), "denied");
  const last = page.layer().pop();
  assert.deepEqual(last, ["consent", "update", { ad_storage: "denied", ad_user_data: "denied", analytics_storage: "denied", ad_personalization: "denied" }]);
  assert.equal(page.gtmScripts().length, 1, "the script is not removed or added again");
  page.windowObject.saloniGoogle.purchase({ transaction_id: "r1", value: 100, items: [] });
  assert.equal(page.layer().filter((entry) => entry[1] === "purchase").length, 0, "no purchase after Decline");
});

test("Accept again after a Decline in the same page gives consent back without a second script", () => {
  const page = load({ local: { [CONSENT_KEY]: "granted" } });
  page.openerButtons[0].click();
  decline(page).click();
  page.openerButtons[0].click();
  accept(page).click();
  assert.equal(page.gtmScripts().length, 1);
  assert.equal(page.layer().pop()[1], "update");
  assert.equal(page.layer().pop()[2].ad_storage, "granted");
});

// ---- purchase ----
const SAMPLE = { transaction_id: "req-123", value: 898, items: [{ item_id: "rose-tray", price: 599, quantity: 1 }, { item_id: "lotus-diya-pair", price: 299, quantity: 1 }] };

test("purchase pushes nothing without consent or with a denied choice", () => {
  for (const local of [{}, { [CONSENT_KEY]: "denied" }]) {
    const page = load({ local });
    page.windowObject.saloniGoogle.purchase(SAMPLE);
    assert.equal(page.windowObject.dataLayer, undefined);
  }
});

test("purchase with consent pushes one purchase event with only the allowed keys", () => {
  const page = load({ local: { [CONSENT_KEY]: "granted" } });
  const before = page.layer().length;
  page.windowObject.saloniGoogle.purchase(Object.assign({}, SAMPLE, {
    customerName: "A Customer", phone: "8209238541", shippingAddress: "1 Road", notes: "gift",
    items: SAMPLE.items.map((item) => Object.assign({ name: "Rose tray", productName: "Rose tray", notes: "x" }, item)),
  }));
  const pushed = page.layer().slice(before);
  assert.equal(pushed.length, 1);
  assert.deepEqual(pushed[0], ["event", "purchase", {
    transaction_id: "req-123", currency: "INR", value: 898,
    items: [{ item_id: "rose-tray", price: 599, quantity: 1 }, { item_id: "lotus-diya-pair", price: 299, quantity: 1 }],
  }]);
  assert.doesNotMatch(JSON.stringify(pushed), /Customer|8209238541|Road|Rose tray|gift/);
});

test("purchase leaves value out when it is 0 and still fires with an empty items list", () => {
  const page = load({ local: { [CONSENT_KEY]: "granted" } });
  const before = page.layer().length;
  page.windowObject.saloniGoogle.purchase({ transaction_id: "req-9", value: 0, items: [] });
  const event = page.layer().slice(before)[0];
  assert.deepEqual(event, ["event", "purchase", { transaction_id: "req-9", currency: "INR", items: [] }]);
  assert.equal(Object.hasOwn(event[2], "value"), false);
});

test("purchase never throws on bad input", () => {
  const page = load({ local: { [CONSENT_KEY]: "granted" } });
  for (const bad of [undefined, null, 7, {}, { transaction_id: "x", items: "no" }]) assert.doesNotThrow(() => page.windowObject.saloniGoogle.purchase(bad));
});

// ---- Banner markup, layout and Cookie settings ----
test("the banner is a labelled region right after the skip link, with a Privacy details link and two equal buttons", () => {
  const page = load();
  const banner = page.banner();
  assert.equal(banner.tagName, "SECTION");
  assert.equal(banner.getAttribute("role"), "region");
  const labelId = banner.getAttribute("aria-labelledby");
  assert.ok(labelId, "aria-labelledby is set");
  assert.ok(findAll(banner, (node) => node.id === labelId).length === 1, "the label element exists inside the banner");
  assert.equal(page.skip.nextSibling, banner, "inserted in the page flow right after the skip link");
  const buttons = page.buttonsOf(banner);
  assert.equal(buttons.length, 2);
  assert.deepEqual(buttons.map((button) => button.textContent), ["Accept", "Decline"]);
  assert.ok(buttons[0].className && buttons[0].className === buttons[1].className, "same class, so equal weight");
  buttons.forEach((button) => assert.equal(button.getAttribute("type"), "button"));
  const link = findAll(banner, (node) => node.tagName === "A")[0];
  assert.equal(link.textContent, "Privacy details");
  assert.match(link.getAttribute("href"), /#privacy-details$/);
});

test("without a skip link the banner is the first child of body", () => {
  const page = load({ skipLink: false });
  assert.equal(page.documentObject.body.children[0], page.banner());
});

test("one injected style element gives the banner 44px buttons and keeps it in the page flow", () => {
  const page = load();
  const styles = findAll(page.documentObject.head, (node) => node.tagName === "STYLE");
  assert.equal(styles.length, 1);
  const css = styles[0].textContent;
  assert.match(css, /min-height:\s*44px/);
  assert.doesNotMatch(css, /position:\s*(fixed|sticky|absolute)/, "it must not cover the cart jump or the customizer actions");
  assert.match(css, /var\(--[a-z-]+,\s*#[0-9a-f]{3,8}\)/i, "site colour tokens with fallbacks");
});

test("Cookie settings buttons are shown, reopen the banner and move focus to Accept", () => {
  const page = load({ local: { [CONSENT_KEY]: "denied" }, openers: 2 });
  page.openerButtons.forEach((button) => { assert.equal(button.hidden, false); assert.equal(button.hasAttribute("hidden"), false); });
  assert.equal(page.banner(), null);
  page.openerButtons[1].click();
  assert.ok(page.banner());
  assert.equal(page.documentObject.activeElement, accept(page));
  assert.equal(findAll(page.documentObject.body, (node) => node.tagName === "SECTION" && node.getAttribute("role") === "region").length, 1, "one banner only");
});

test("after a choice, focus goes back to the Cookie settings button that opened the banner", () => {
  const page = load({ local: { [CONSENT_KEY]: "denied" }, openers: 2 });
  page.openerButtons[1].click();
  decline(page).click();
  assert.equal(page.documentObject.activeElement, page.openerButtons[1]);
  page.openerButtons[0].click();
  accept(page).click();
  assert.equal(page.documentObject.activeElement, page.openerButtons[0]);
  assert.equal(page.gtmScripts().length, 1);
});

test("Cookie settings is wired up when the page is still loading", () => {
  const page = load({ readyState: "loading", local: { [CONSENT_KEY]: "denied" } });
  assert.equal(page.openerButtons[0].hidden, true, "waits for the page");
  page.fireReady();
  assert.equal(page.openerButtons[0].hidden, false);
});

test("the container ID lives in google.js only", () => {
  assert.equal((source.match(/GTM-TJ2DZTHG/g) || []).length, 1);
  assert.match(source, /SRI|integrity/i, "the missing integrity hash is explained in a comment");
  const others = ["script.js", "order-form.js", "my-orders.js", "public-forms.js", "customizer.js", "analytics.js", "index.html", "tools/product_pages.py"];
  for (const file of others) assert.doesNotMatch(fs.readFileSync(path.join(root, file), "utf8"), /GTM-[A-Z0-9]+|googletagmanager/i, file);
  assert.doesNotMatch(source, /document\.cookie/, "google.js sets no cookies itself");
});
