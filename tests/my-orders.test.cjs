const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const sourcePath = path.join(root, "my-orders.js");
const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, "utf8") : "";
const DAY = 24 * 60 * 60 * 1000;
const KEY = "saloniMyOrders";

class FakeElement {
  constructor(tag = "div", id = "") {
    this.tagName = tag.toUpperCase(); this.id = id; this.hidden = false; this.attributes = {}; this.children = []; this.listeners = {};
    this.className = ""; this.focused = false; this.open = false; this._text = ""; this.parentNode = null;
  }
  set innerHTML(value) { throw new Error("innerHTML must not be used: " + value); }
  get innerHTML() { return ""; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(" "); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, listener) { (this.listeners[type] = this.listeners[type] || []).push(listener); }
  dispatch(type, event = {}) {
    const entry = Object.assign({ target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }, event);
    (this.listeners[type] || []).forEach((listener) => listener(entry));
    return entry;
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); return child; }
  get firstChild() { return this.children[0] || null; }
  focus(options) { this.focused = true; this.focusOptions = options; if (FakeElement.onFocus) FakeElement.onFocus(this); }
  getClientRects() { return this.hiddenLayout ? [] : [{}]; }
  find(predicate, found = []) { if (predicate(this)) found.push(this); this.children.forEach((child) => child.find(predicate, found)); return found; }
  showModal() { this.open = true; }
  close() { if (!this.open) return; this.open = false; (this.listeners.close || []).forEach((listener) => listener({ target: this })); }
}

function createStorage(initial = {}) {
  const data = Object.assign({}, initial);
  return { data, getItem: (key) => (key in data ? data[key] : null), setItem(key, value) { data[key] = String(value); }, removeItem(key) { delete data[key]; } };
}

const EXEC_URL = "https://script.google.test/exec";

function makeRuntime({ storage = createStorage(), dialogSupported = true, noHistory = false, manualFrames = false, execUrl = EXEC_URL, fetchImpl = null, noFetch = false } = {}) {
  const ids = ["my-orders-dialog", "my-orders-close", "my-orders-list", "my-orders-empty", "my-orders-contact", "nav-toggle"];
  const elements = new Map(ids.map((id) => [id, new FakeElement(id === "my-orders-list" ? "ol" : "div", id)]));
  const dialog = elements.get("my-orders-dialog");
  if (!dialogSupported) { dialog.showModal = undefined; }
  // The order form's embed element carries the Apps Script URL; my-orders.js reads it the same way order-form.js does.
  if (execUrl !== null) { const embed = new FakeElement("div", "order-form-embed"); embed.attributes["data-order-form-url"] = execUrl; elements.set("order-form-embed", embed); }
  const link = new FakeElement("a"); link.attributes["data-my-orders-open"] = "";
  const browseLink = new FakeElement("a"); browseLink.attributes["data-browse-all"] = "";
  dialog.querySelectorAll = (selector) => (selector === "[data-browse-all]" ? [browseLink] : []);
  const documentObject = {
    readyState: "complete",
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new FakeElement(tag),
    querySelectorAll: (selector) => (selector === "[data-my-orders-open]" ? [link] : []),
    activeElement: null,
  };
  FakeElement.onFocus = (element) => { documentObject.activeElement = element; };
  // A tiny History stand-in: back() only records the call; tests deliver the matching popstate themselves.
  const history = noHistory ? undefined : {
    state: null, pushed: [], replaced: [], backs: 0,
    pushState(state) { this.state = state; this.pushed.push(state); },
    replaceState(state) { this.state = state; this.replaced.push(state); },
    back() { this.backs += 1; },
  };
  const popstateListeners = [];
  const windowObject = { localStorage: storage, document: documentObject, history, location: { href: "https://saloniresinart.com/" }, addEventListener(type, listener) { if (type === "popstate") popstateListeners.push(listener); } };
  // fetch is a stub that records the call; each test decides what it answers. Timers are manual so the 25 s limit can be fired.
  const fetchCalls = [];
  const timers = [];
  const aborts = [];
  if (!noFetch) windowObject.fetch = (url, init) => { fetchCalls.push({ url, init }); return (fetchImpl || (() => Promise.resolve({ json: () => Promise.resolve({ ok: true }) })))(url, init); };
  windowObject.AbortController = function () { this.signal = { aborted: false }; this.abort = () => { this.signal.aborted = true; aborts.push(this); }; };
  windowObject.setTimeout = (callback, delay) => { timers.push({ callback, delay, cleared: false }); return timers.length; };
  windowObject.clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; };
  // Animation frames run at once unless a test wants to see what happens between them.
  const frames = [];
  windowObject.requestAnimationFrame = (callback) => { if (manualFrames) frames.push(callback); else callback(); return frames.length; };
  const flushFrame = () => { const due = frames.splice(0); due.forEach((callback) => callback()); return due.length; };
  const popstate = (state) => { if (history) history.state = state; popstateListeners.forEach((listener) => listener({ state })); };
  const context = { console, document: documentObject, window: windowObject, Date, JSON, Math, Number, String, Array, Object, RegExp };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "my-orders.js" });
  const real = windowObject.saloniMyOrders;
  // Arrays made inside the vm context have another prototype; hand the tests plain objects.
  const api = Object.assign({}, real, { list: () => JSON.parse(JSON.stringify(real.list())) });
  return { api, storage, elements, dialog, link, browseLink, documentObject, windowObject, history, popstate, flushFrame, fetchCalls, timers, aborts };
}

const order = (overrides = {}) => Object.assign({
  requestId: "request-1",
  items: [{ name: "Heart tray", quantity: 2, price: "Rs 899", image: "assets/romantic-heart-trinket-tray.webp" }],
  fulfillment: "shipping",
  notes: "Name: Asha",
}, overrides);
const stored = (storage) => JSON.parse(storage.data[KEY]);
const text = (element) => element.textContent;
const settle = () => new Promise((resolve) => setImmediate(resolve));
const CANCEL_ID = "request-1234567890";
const find = (root, predicate) => root.find(predicate);
const button = (root, label) => find(root, (element) => element.tagName === "BUTTON" && element.textContent === label)[0] || null;
const byClass = (root, name) => find(root, (element) => element.className.split(" ").includes(name))[0] || null;
const jsonReply = (value) => () => Promise.resolve({ json: () => Promise.resolve(value) });
// Opens the dialog with one cancellable order and returns the pieces a cancel test needs.
function withOrder(options = {}) {
  const runtime = makeRuntime(options);
  runtime.api.save(order({ requestId: CANCEL_ID }));
  runtime.link.dispatch("click", { button: 0 });
  runtime.card = runtime.elements.get("my-orders-list").children[0];
  return runtime;
}

test("my-orders.js exists and exposes save and list, and no longer has a clear-all feature", () => {
  assert.ok(source, "my-orders.js is missing");
  const { api } = makeRuntime();
  assert.equal(typeof api.save, "function");
  assert.equal(typeof api.list, "function");
  assert.equal(api.clear, undefined);
  assert.doesNotMatch(source, /my-orders-clear|my-orders-confirm|clearButton|function clear\b/);
});

test("save stores a versioned record with the confirmed time and only the allowed order fields", () => {
  const { api, storage } = makeRuntime();
  const before = Date.now();
  assert.equal(api.save(order({ phone: "8209238541", email: "a@b.co", pin: "305001", shippingAddress: "61 Hathi Bhata", referralCode: "FRIEND10", referenceImage: { data: "AAAA" }, items: [{ name: "Heart tray", quantity: 2, price: "Rs 899", image: "assets/romantic-heart-trinket-tray.webp", phone: "1" }] })), true);
  const record = stored(storage);
  assert.equal(record.version, 1);
  assert.equal(record.orders.length, 1);
  const saved = record.orders[0];
  assert.deepEqual(Object.keys(saved).sort(), ["at", "fulfillment", "items", "notes", "requestId"]);
  assert.ok(saved.at >= before && saved.at <= Date.now());
  assert.deepEqual(saved.items, [{ name: "Heart tray", quantity: 2, price: "Rs 899", image: "assets/romantic-heart-trinket-tray.webp" }]);
  const raw = storage.data[KEY];
  for (const secret of ["8209238541", "a@b.co", "305001", "Hathi", "FRIEND10", "AAAA"]) assert.ok(!raw.includes(secret), secret);
});

test("saving the same request ID again (retry or replay) does not add a duplicate", () => {
  const { api, storage } = makeRuntime();
  api.save(order());
  api.save(order({ notes: "changed" }));
  api.save(order({ requestId: "request-2" }));
  const orders = stored(storage).orders;
  assert.deepEqual(orders.map((entry) => entry.requestId).sort(), ["request-1", "request-2"]);
  assert.equal(orders.find((entry) => entry.requestId === "request-1").notes, "Name: Asha");
});

test("entries older than 30 days are dropped on every read and every write", () => {
  const now = Date.now();
  const entry = (requestId, at) => Object.assign({ at }, order({ requestId }));
  const storage = createStorage({ [KEY]: JSON.stringify({ version: 1, orders: [entry("fresh", now - 29 * DAY), entry("old", now - 31 * DAY)] }) });
  const { api } = makeRuntime({ storage });
  assert.deepEqual(api.list().map((item) => item.requestId), ["fresh"]);
  assert.deepEqual(stored(storage).orders.map((item) => item.requestId), ["fresh"], "a read cleans the stored copy too");
  storage.data[KEY] = JSON.stringify({ version: 1, orders: [entry("fresh", now - 29 * DAY), entry("old", now - 31 * DAY)] });
  api.save(order({ requestId: "new" }));
  assert.deepEqual(stored(storage).orders.map((item) => item.requestId).sort(), ["fresh", "new"]);
});

test("keeps at most 50 orders, newest first, dropping the oldest", () => {
  const { api, storage } = makeRuntime();
  for (let index = 0; index < 55; index += 1) api.save(order({ requestId: "request-" + index }));
  const orders = stored(storage).orders;
  assert.equal(orders.length, 50);
  assert.ok(orders.some((entry) => entry.requestId === "request-54"));
  assert.ok(!orders.some((entry) => entry.requestId === "request-0"));
  const listed = api.list();
  for (let index = 1; index < listed.length; index += 1) assert.ok(listed[index - 1].at >= listed[index].at);
});

test("tampered or invalid storage is ignored safely and never throws", () => {
  const now = Date.now();
  const good = Object.assign({ at: now - 1000 }, order({ requestId: "good" }));
  const bad = [
    "not json", "null", "[]", "42", JSON.stringify({ version: 2, orders: [good] }), JSON.stringify({ version: 1, orders: "x" }),
    "x".repeat(500001),
  ];
  for (const raw of bad) {
    const { api } = makeRuntime({ storage: createStorage({ [KEY]: raw }) });
    assert.deepEqual(api.list(), [], raw.slice(0, 30));
    assert.equal(api.save(order()), true);
    assert.equal(api.list().length, 1);
  }
  const mixed = [
    good,
    { at: now, requestId: "<img src=x onerror=1>", items: good.items, fulfillment: "shipping", notes: "" },
    { at: now, requestId: "no-items", items: [], fulfillment: "shipping", notes: "" },
    { at: now, requestId: "bad-qty", items: [{ name: "A", quantity: 0, price: "", image: "" }], fulfillment: "shipping", notes: "" },
    { at: now, requestId: "bad-fulfil", items: good.items, fulfillment: "drone", notes: "" },
    { at: now, requestId: "bad-image", items: [{ name: "A", quantity: 1, price: "", image: "https://evil.example/x.png" }], fulfillment: "pickup", notes: "" },
    { at: now, requestId: "bad-image2", items: [{ name: "A", quantity: 1, price: "", image: "assets/../../secret.png" }], fulfillment: "pickup", notes: "" },
    { at: "yesterday", requestId: "bad-at", items: good.items, fulfillment: "pickup", notes: "" },
    { at: now + 10 * DAY, requestId: "future", items: good.items, fulfillment: "pickup", notes: "" },
    { at: now, requestId: "long-notes", items: good.items, fulfillment: "pickup", notes: "n".repeat(301) },
    null, 7, "str",
  ];
  const { api } = makeRuntime({ storage: createStorage({ [KEY]: JSON.stringify({ version: 1, orders: mixed }) }) });
  assert.deepEqual(api.list().map((item) => item.requestId), ["good"]);
});

test("blocked storage (private mode, quota, denied) never throws", () => {
  const denied = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } };
  const { api } = makeRuntime({ storage: denied });
  assert.deepEqual(api.list(), []);
  assert.equal(api.save(order()), false);
  const none = makeRuntime({ storage: null });
  assert.deepEqual(none.api.list(), []);
  assert.equal(none.api.save(order()), false);
});

test("save rejects a summary with no usable request ID or items", () => {
  const { api, storage } = makeRuntime();
  for (const summary of [null, {}, order({ requestId: "" }), order({ items: [] }), order({ items: [{ name: "", quantity: 1 }] }), order({ fulfillment: "x" }), "text"]) assert.equal(api.save(summary), false);
  assert.equal(storage.data[KEY], undefined);
});

test("opening the dialog from the nav link shows the newest order first with date, items, thumbnails, quantity, price, fulfilment, request ID, status and notes", () => {
  const { api, link, dialog, elements } = makeRuntime();
  api.save(order({ requestId: "older-request-id" }));
  api.save(order({ requestId: "newer-request-id", fulfillment: "pickup", items: [
    { name: "Frame one", quantity: 1, price: "", image: "assets/one.webp" },
    { name: "Frame two", quantity: 3, price: "Rs 499", image: "" },
  ] }));
  const click = link.dispatch("click", { button: 0 });
  assert.equal(click.defaultPrevented, true);
  assert.equal(dialog.open, true);
  assert.equal(elements.get("my-orders-close").focused, true, "focus moves into the dialog");
  const list = elements.get("my-orders-list");
  assert.equal(list.children.length, 2);
  const first = text(list.children[0]);
  assert.match(first, /newer-request-id/);
  assert.match(first, /Frame one/);
  assert.match(first, /Frame two/);
  assert.match(first, /Qty 3/);
  assert.match(first, /Rs 499/);
  assert.match(first, /Pickup in Ajmer/);
  assert.match(first, /Request sent — Saloni will contact you to confirm/);
  assert.match(text(list.children[1]), /older-request-id/);
  assert.match(text(list.children[1]), /Shipping/);
  assert.match(text(list.children[1]), /Name: Asha/);
  const images = list.find((element) => element.tagName === "IMG");
  assert.deepEqual(images.map((image) => image.getAttribute("src")).sort(), ["assets/one.webp", "assets/romantic-heart-trinket-tray.webp"]);
  assert.equal(elements.get("my-orders-empty").hidden, true);
  assert.equal(elements.get("my-orders-contact").hidden, false);
});

test("the empty state shows when nothing is saved and hides the list and contact controls", () => {
  const { link, elements } = makeRuntime();
  link.dispatch("click", { button: 0 });
  assert.equal(elements.get("my-orders-empty").hidden, false);
  assert.equal(elements.get("my-orders-list").children.length, 0);
  assert.equal(elements.get("my-orders-contact").hidden, true);
});

test("rendering uses textContent and safe image paths only: markup in stored text stays text", () => {
  const { api, link, elements } = makeRuntime();
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
  api.save(order({ requestId: "id-1", notes: "<b onclick=x>bold</b>", items: [{ name: "<script>alert(1)</script>", quantity: 1, price: "<i>", image: "assets/ok.webp" }] }));
  assert.doesNotThrow(() => link.dispatch("click", { button: 0 }));
  const card = text(elements.get("my-orders-list").children[0]);
  assert.match(card, /<script>alert\(1\)<\/script>/);
  assert.match(card, /<b onclick=x>bold<\/b>/);
});

test("closing returns focus to the nav link, or to the menu button when the phone menu has closed", () => {
  const first = makeRuntime();
  first.link.dispatch("click", { button: 0 });
  first.dialog.close();
  assert.equal(first.link.focused, true);

  const phone = makeRuntime();
  phone.link.hiddenLayout = true;
  phone.link.dispatch("click", { button: 0 });
  phone.dialog.close();
  assert.equal(phone.link.focused, false);
  assert.equal(phone.elements.get("nav-toggle").focused, true);
});

test("a modified click (new tab, ctrl) or a browser without <dialog> keeps the link's normal behaviour", () => {
  const { link, dialog } = makeRuntime();
  const click = link.dispatch("click", { button: 0, ctrlKey: true });
  assert.equal(click.defaultPrevented, false);
  assert.equal(dialog.open, false);
  const none = makeRuntime({ dialogSupported: false });
  const plain = none.link.dispatch("click", { button: 0 });
  assert.equal(plain.defaultPrevented, false);
});

test("the Browse gifts link in the empty state closes the dialog before the catalogue takes focus", () => {
  const { link, dialog, browseLink } = makeRuntime();
  link.dispatch("click", { button: 0 });
  browseLink.dispatch("click", {});
  assert.equal(dialog.open, false);
  assert.equal(link.focused, false, "focus is left to the catalogue handler");
});

// --- markup and styles ---
test("the primary nav has My orders with the gem icon, and the dialog is accessible static markup", () => {
  const nav = html.match(/<nav class="site-nav" id="primary-navigation"[\s\S]*?<\/nav>/)[0];
  assert.match(nav, /<a href="#my-orders-dialog" data-my-orders-open>My orders <svg class="category-icon" aria-hidden="true" focusable="false"><use href="assets\/category-icons\.svg#gem"><\/use><\/svg><\/a>/);
  const dialog = html.match(/<dialog class="my-orders-dialog" id="my-orders-dialog"[\s\S]*?<\/dialog>/)?.[0] || "";
  assert.match(dialog, /aria-labelledby="my-orders-title"/);
  assert.match(dialog, /<h2[^>]*id="my-orders-title"[^>]*>My orders<\/h2>/);
  assert.match(dialog, /<form method="dialog"[^>]*>\s*<button[^>]*id="my-orders-close"[^>]*type="submit"[^>]*aria-label="Close my orders"/);
  assert.doesNotMatch(dialog, /saved only in this browser|Remove these from this device|my-orders-clear|my-orders-confirm|Yes, remove|Keep them/);
  assert.match(dialog, /id="my-orders-empty"[^>]*hidden[\s\S]*No orders on this device in the last 30 days\.[\s\S]*<a[^>]+href="#catalogue-filters"[^>]+data-browse-all/);
  assert.match(dialog, /<ol[^>]+id="my-orders-list"/);
  assert.match(dialog, /id="my-orders-contact"[\s\S]*href="tel:\+918209238541"[\s\S]*href="https:\/\/wa\.me\/918209238541/);
  assert.match(html, /<script class="my-orders-script" src="my-orders\.js\?v=\d+" defer><\/script>/);
});

test("the dialog has phone and desktop styles that match the order dialog", () => {
  assert.match(css, /dialog\.my-orders-dialog:not\(\[open\]\)\s*\{\s*display:\s*none/);
  assert.match(css, /dialog\.my-orders-dialog\s*\{[^}]*width:\s*min\(\s*680px,\s*calc\(100vw - 2rem\)\)[^}]*max-height:\s*calc\(100dvh - 2rem\)/);
  assert.match(css, /dialog\.my-orders-dialog::backdrop/);
  assert.match(css, /\.my-orders-thumb\s*\{[^}]*width:\s*3\.5rem[^}]*height:\s*3\.5rem[^}]*object-fit:\s*cover/);
  assert.match(css, /\.my-order-id\s*\{[^}]*overflow-wrap:\s*anywhere/);
});

test("the privacy text tells shoppers that a summary of confirmed orders is kept in this browser for 30 days", () => {
  assert.match(html, /Privacy details[\s\S]*A short summary of each confirmed request \(items, notes and request ID\) is kept only in this browser for 30 days for My orders/);
});

// --- phone Back button: the same history pattern as the order and lightbox dialogs ---
const plain = (value) => JSON.parse(JSON.stringify(value));

test("opening the dialog pushes one history entry, and opening it again does not push another", () => {
  const { link, dialog, history } = makeRuntime();
  link.dispatch("click", { button: 0 });
  assert.equal(history.pushed.length, 1);
  assert.deepEqual(plain(history.state), { saloniMyOrders: true });
  link.dispatch("click", { button: 0 });
  assert.equal(history.pushed.length, 1);
  assert.equal(dialog.open, true);
});

test("the browser Back button closes the dialog, returns focus, and does not step back again", () => {
  const { link, dialog, history, popstate } = makeRuntime();
  link.dispatch("click", { button: 0 });
  popstate(null);
  assert.equal(dialog.open, false);
  assert.equal(history.backs, 0, "Back already moved the history, so the dialog must not call back() a second time");
  assert.equal(link.focused, true);
});

test("closing with the X button or Escape steps the history back so no extra entry is left", () => {
  const { link, dialog, history, popstate } = makeRuntime();
  link.dispatch("click", { button: 0 });
  dialog.close();
  assert.equal(history.backs, 1);
  popstate(null);
  assert.equal(dialog.open, false);
  assert.equal(history.backs, 1, "the popstate caused by that step back is not treated as another Back press");
});

test("reopening before the step back finishes waits for it, then opens with a fresh history entry", () => {
  const { link, dialog, history, popstate } = makeRuntime();
  link.dispatch("click", { button: 0 });
  dialog.close();
  link.dispatch("click", { button: 0 });
  assert.equal(dialog.open, false);
  assert.equal(history.pushed.length, 1, "nothing is pushed while the step back is pending");
  popstate(null);
  assert.equal(dialog.open, true);
  assert.equal(history.pushed.length, 2);
});

test("stepping forward into the dialog's old entry while it is closed steps back out again", () => {
  const { history, popstate } = makeRuntime();
  popstate({ saloniMyOrders: true });
  assert.equal(history.backs, 1);
});

test("the Browse gifts link drops the dialog's history entry in place instead of stepping back, so the catalogue's own entry survives", () => {
  const { link, dialog, browseLink, history } = makeRuntime();
  link.dispatch("click", { button: 0 });
  browseLink.dispatch("click", {});
  assert.equal(dialog.open, false);
  assert.equal(history.backs, 0);
  assert.equal(history.replaced.length, 1);
  assert.deepEqual(plain(history.state), {});
});

test("without the History API the dialog still opens and closes", () => {
  const { link, dialog } = makeRuntime({ noHistory: true });
  assert.doesNotThrow(() => link.dispatch("click", { button: 0 }));
  assert.equal(dialog.open, true);
  assert.doesNotThrow(() => dialog.close());
});

test("opening from the nav link waits two animation frames, so the phone menu has closed and laid out before the modal opens", () => {
  const { link, dialog, elements, history, flushFrame } = makeRuntime({ manualFrames: true });
  const click = link.dispatch("click", { button: 0 });
  assert.equal(click.defaultPrevented, true);
  assert.equal(dialog.open, false);
  assert.equal(history.pushed.length, 0);
  flushFrame();
  assert.equal(dialog.open, false, "one frame is not enough: the browser applies the menu's scroll adjustment a frame later");
  flushFrame();
  assert.equal(dialog.open, true);
  assert.equal(history.pushed.length, 1);
  assert.equal(elements.get("my-orders-close").focused, true);
});

test("tapping the nav link twice quickly opens the dialog once", () => {
  const { link, dialog, history, flushFrame } = makeRuntime({ manualFrames: true });
  link.dispatch("click", { button: 0 });
  link.dispatch("click", { button: 0 });
  flushFrame(); flushFrame(); flushFrame();
  assert.equal(dialog.open, true);
  assert.equal(history.pushed.length, 1);
});

// --- Cancel order: the shopper ASKS Saloni to cancel; nothing is cancelled by the page itself ---
test("the removed clear-all styles are gone and the cancel controls have styles", () => {
  assert.doesNotMatch(css, /\.my-orders-clear|\.my-orders-confirm|\.my-orders-note/);
  assert.match(css, /\.my-order-actions/);
  assert.match(css, /\.my-order-feedback/);
});

test("a stored cancelRequestedAt is validated like the rest: a whole number near the order time, else the entry is dropped", () => {
  const now = Date.now();
  const entry = (requestId, extra) => Object.assign({ at: now - 1000 }, order({ requestId }), extra);
  const storage = createStorage({ [KEY]: JSON.stringify({ version: 1, orders: [
    entry("good-request-id-1", { cancelRequestedAt: now - 500 }),
    entry("bad-string-id-123", { cancelRequestedAt: "yesterday" }),
    entry("bad-float-id-1234", { cancelRequestedAt: 1.5 }),
    entry("bad-future-id-123", { cancelRequestedAt: now + 10 * DAY }),
    entry("bad-before-id-123", { cancelRequestedAt: now - 20 * DAY }),
    entry("bad-null-id-12345", { cancelRequestedAt: null }),
  ] }) });
  const { api } = makeRuntime({ storage });
  const listed = api.list();
  assert.deepEqual(listed.map((item) => item.requestId), ["good-request-id-1"]);
  assert.equal(listed[0].cancelRequestedAt, now - 500);
  assert.equal(api.list().length, 1);
});

test("save never writes cancelRequestedAt, even if the summary carries one", () => {
  const { api, storage } = makeRuntime();
  api.save(order({ requestId: CANCEL_ID, cancelRequestedAt: Date.now() }));
  assert.equal("cancelRequestedAt" in stored(storage).orders[0], false);
});

test("each order shows a Cancel order button next to its status, and nothing is requested until it is pressed", () => {
  const { card, fetchCalls } = withOrder();
  assert.ok(button(card, "Cancel order"));
  assert.match(text(card), /Request sent — Saloni will contact you to confirm/);
  assert.doesNotMatch(text(card), /Ask Saloni to cancel/);
  assert.equal(fetchCalls.length, 0);
});

test("there is no Cancel order button when the request ID is not one the server accepts, or the page has no server address", () => {
  const short = makeRuntime();
  short.api.save(order({ requestId: "request-1" }));
  short.link.dispatch("click", { button: 0 });
  assert.equal(button(short.elements.get("my-orders-list"), "Cancel order"), null);
  for (const execUrl of [null, "https://script.google.com/macros/s/REPLACE_WITH_DEPLOYMENT_ID/exec", ""]) {
    const unconfigured = withOrder({ execUrl });
    assert.equal(button(unconfigured.card, "Cancel order"), null, String(execUrl));
  }
  const noFetch = withOrder({ noFetch: true });
  assert.equal(button(noFetch.card, "Cancel order"), null);
});

test("Cancel order opens a small in-place confirm and moves focus to Keep order", () => {
  const { card, fetchCalls } = withOrder();
  const cancel = button(card, "Cancel order");
  cancel.dispatch("click");
  const confirm = byClass(card, "my-order-confirm");
  assert.ok(confirm);
  assert.equal(confirm.getAttribute("role"), "group");
  assert.match(confirm.getAttribute("aria-label"), /cancel/i);
  assert.match(text(confirm), /Ask Saloni to cancel this order\?/);
  assert.ok(button(card, "Yes, ask to cancel"));
  const keep = button(card, "Keep order");
  assert.equal(keep.focused, true);
  assert.notEqual(keep.focusOptions && keep.focusOptions.preventScroll, true, "focused with scrolling so the confirm is in view");
  assert.equal(button(card, "Cancel order"), null, "the confirm takes the button's place, so the card does not grow");
  assert.equal(fetchCalls.length, 0);
});

test("Keep order closes the confirm, returns focus to Cancel order, sends nothing and stores nothing", () => {
  const { card, fetchCalls, storage } = withOrder();
  button(card, "Cancel order").dispatch("click");
  button(card, "Keep order").dispatch("click");
  assert.equal(byClass(card, "my-order-confirm"), null);
  const cancel = button(card, "Cancel order");
  assert.ok(cancel);
  assert.equal(cancel.focused, true);
  assert.equal(fetchCalls.length, 0);
  assert.equal("cancelRequestedAt" in stored(storage).orders[0], false);
});

test("Yes, ask to cancel posts the request ID to the order form's /exec URL as text/plain JSON, and nothing else", async () => {
  let release;
  const { card, fetchCalls } = withOrder({ fetchImpl: () => new Promise((resolve) => { release = resolve; }) });
  button(card, "Cancel order").dispatch("click");
  const yes = button(card, "Yes, ask to cancel");
  yes.dispatch("click");
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, EXEC_URL + "?action=cancel");
  assert.equal(fetchCalls[0].init.method, "POST");
  assert.equal(fetchCalls[0].init.credentials, "omit");
  assert.deepEqual(JSON.parse(fetchCalls[0].init.body), { requestId: CANCEL_ID });
  assert.equal(fetchCalls[0].init.headers, undefined, "no custom header, so the browser sends a simple request without a preflight");
  assert.equal(yes.disabled, true, "pressed buttons are disabled while the request is in flight");
  assert.equal(button(card, "Keep order").disabled, true);
  assert.match(text(byClass(card, "my-order-feedback")), /Sending/);
  yes.dispatch("click");
  assert.equal(fetchCalls.length, 1, "a second press does not send a second request");
  release({ json: () => Promise.resolve({ ok: true }) });
  await settle();
});

test("on success the order says Cancellation requested, the button is gone, focus moves to the status, and it is remembered", async () => {
  const { api, card, storage, fetchCalls } = withOrder({ fetchImpl: jsonReply({ ok: true }) });
  button(card, "Cancel order").dispatch("click");
  const before = Date.now();
  button(card, "Yes, ask to cancel").dispatch("click");
  await settle();
  assert.equal(fetchCalls.length, 1);
  assert.match(text(card), /Cancellation requested — Saloni will confirm/);
  assert.doesNotMatch(text(card), /Request sent — Saloni will contact you to confirm/);
  assert.equal(button(card, "Cancel order"), null);
  assert.equal(button(card, "Yes, ask to cancel"), null);
  assert.equal(byClass(card, "my-order-confirm"), null);
  const status = byClass(card, "my-order-status");
  assert.equal(status.focused, true);
  assert.equal(status.getAttribute("tabindex"), "-1");
  const savedAt = stored(storage).orders[0].cancelRequestedAt;
  assert.ok(savedAt >= before && savedAt <= Date.now());
  assert.deepEqual(Object.keys(stored(storage).orders[0]).sort(), ["at", "cancelRequestedAt", "fulfillment", "items", "notes", "requestId"]);
  assert.equal(api.list()[0].cancelRequestedAt, savedAt);
});

test("the success state survives closing and reopening the dialog, and only that order changes", async () => {
  const runtime = makeRuntime({ fetchImpl: jsonReply({ ok: true }) });
  runtime.api.save(order({ requestId: "first-request-id-1" }));
  runtime.api.save(order({ requestId: "second-request-id-2" }));
  runtime.link.dispatch("click", { button: 0 });
  const list = runtime.elements.get("my-orders-list");
  const first = list.children.find((card) => text(card).includes("second-request-id-2"));
  button(first, "Cancel order").dispatch("click");
  button(first, "Yes, ask to cancel").dispatch("click");
  await settle();
  runtime.dialog.close();
  runtime.popstate(null);
  runtime.link.dispatch("click", { button: 0 });
  const cards = runtime.elements.get("my-orders-list").children;
  assert.equal(cards.length, 2);
  const done = cards.find((card) => text(card).includes("second-request-id-2"));
  const open = cards.find((card) => text(card).includes("first-request-id-1"));
  assert.match(text(done), /Cancellation requested — Saloni will confirm/);
  assert.equal(button(done, "Cancel order"), null);
  assert.ok(button(open, "Cancel order"));
  assert.match(text(open), /Request sent/);
});

test("an already-requested answer counts as success", async () => {
  const { card, storage } = withOrder({ fetchImpl: jsonReply({ ok: true, already: true }) });
  button(card, "Cancel order").dispatch("click");
  button(card, "Yes, ask to cancel").dispatch("click");
  await settle();
  assert.match(text(card), /Cancellation requested — Saloni will confirm/);
  assert.ok(stored(storage).orders[0].cancelRequestedAt);
});

const FAILURE = /Could not send the request\. Please try again or call\/WhatsApp Saloni\./;
const failureCases = {
  "an ok:false answer": jsonReply({ ok: false, error: "not_found" }),
  "a paused answer": jsonReply({ ok: false, error: "paused" }),
  "an answer without ok": jsonReply({ error: "x" }),
  "ok that is not exactly true": jsonReply({ ok: "true" }),
  "a null answer": jsonReply(null),
  "an HTML page instead of JSON": () => Promise.resolve({ json: () => Promise.reject(new SyntaxError("Unexpected token <")) }),
  "a network error": () => Promise.reject(new TypeError("Failed to fetch")),
  "a throw inside fetch": () => { throw new Error("blocked"); },
};
for (const [name, fetchImpl] of Object.entries(failureCases)) {
  test("failure (" + name + ") keeps the Cancel order button, shows the error, stores nothing and never shows success", async () => {
    const { card, storage } = withOrder({ fetchImpl });
    button(card, "Cancel order").dispatch("click");
    button(card, "Yes, ask to cancel").dispatch("click");
    await settle();
    const cancel = button(card, "Cancel order");
    assert.ok(cancel, "the button is back");
    assert.equal(cancel.disabled === true, false);
    assert.equal(cancel.focused, true);
    assert.match(text(byClass(card, "my-order-feedback")), FAILURE);
    assert.doesNotMatch(text(card), /Cancellation requested/);
    assert.match(text(card), /Request sent — Saloni will contact you to confirm/);
    assert.equal(byClass(card, "my-order-confirm"), null);
    assert.equal("cancelRequestedAt" in stored(storage).orders[0], false);
  });
}

test("after a failure the shopper can try again, and the error clears when the retry works", async () => {
  let attempt = 0;
  const { card, fetchCalls } = withOrder({ fetchImpl: () => (attempt++ === 0 ? Promise.reject(new TypeError("offline")) : Promise.resolve({ json: () => Promise.resolve({ ok: true }) })) });
  button(card, "Cancel order").dispatch("click");
  button(card, "Yes, ask to cancel").dispatch("click");
  await settle();
  assert.match(text(card), FAILURE);
  button(card, "Cancel order").dispatch("click");
  assert.doesNotMatch(text(card), FAILURE, "opening the confirm again clears the old error");
  button(card, "Yes, ask to cancel").dispatch("click");
  await settle();
  assert.equal(fetchCalls.length, 2);
  assert.doesNotMatch(text(card), FAILURE);
  assert.match(text(card), /Cancellation requested — Saloni will confirm/);
});

test("a request that never answers is aborted after 25 seconds and treated as a failure", async () => {
  const { card, timers, aborts, fetchCalls } = withOrder({ fetchImpl: () => new Promise(() => {}) });
  button(card, "Cancel order").dispatch("click");
  button(card, "Yes, ask to cancel").dispatch("click");
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 25000);
  assert.ok(fetchCalls[0].init.signal, "fetch gets an abort signal");
  timers[0].callback();
  assert.equal(aborts.length, 1);
});

test("a cancel-requested order is not offered the button again, and a request ID that is already stored as requested sends nothing", () => {
  const now = Date.now();
  const storage = createStorage({ [KEY]: JSON.stringify({ version: 1, orders: [Object.assign({ at: now - 1000, cancelRequestedAt: now - 500 }, order({ requestId: CANCEL_ID }))] }) });
  const runtime = makeRuntime({ storage });
  runtime.link.dispatch("click", { button: 0 });
  const card = runtime.elements.get("my-orders-list").children[0];
  assert.equal(button(card, "Cancel order"), null);
  assert.match(text(card), /Cancellation requested — Saloni will confirm/);
  assert.equal(runtime.fetchCalls.length, 0);
});

test("reopening the dialog starts every order with the confirm closed", () => {
  const runtime = withOrder();
  button(runtime.card, "Cancel order").dispatch("click");
  runtime.dialog.close();
  runtime.popstate(null);
  runtime.link.dispatch("click", { button: 0 });
  const card = runtime.elements.get("my-orders-list").children[0];
  assert.equal(byClass(card, "my-order-confirm"), null);
  assert.ok(button(card, "Cancel order"));
});

test("an answer that arrives after the dialog was closed and reopened does not throw and is still remembered", async () => {
  let release;
  const runtime = withOrder({ fetchImpl: () => new Promise((resolve) => { release = resolve; }) });
  button(runtime.card, "Cancel order").dispatch("click");
  button(runtime.card, "Yes, ask to cancel").dispatch("click");
  runtime.dialog.close();
  release({ json: () => Promise.resolve({ ok: true }) });
  await settle();
  assert.ok(stored(runtime.storage).orders[0].cancelRequestedAt);
});

test("blocked storage does not turn a sent request into an error", async () => {
  const data = {};
  const flaky = { getItem: (key) => (key in data ? data[key] : null), setItem(key, value) { if (this.deny) throw new Error("quota"); data[key] = String(value); }, removeItem() {}, deny: false };
  const { card } = withOrder({ storage: flaky, fetchImpl: jsonReply({ ok: true }) });
  flaky.deny = true;
  button(card, "Cancel order").dispatch("click");
  button(card, "Yes, ask to cancel").dispatch("click");
  await settle();
  assert.match(text(card), /Cancellation requested — Saloni will confirm/);
});
