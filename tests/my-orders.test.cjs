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

function makeRuntime({ storage = createStorage(), dialogSupported = true, noHistory = false, manualFrames = false, execUrl = EXEC_URL, fetchImpl = null, noFetch = false, statusImpl = null, clock = null, navigator = undefined } = {}) {
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
    createElementNS: (ns, tag) => { const node = new FakeElement(tag); node.namespace = ns; return node; },
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
  const windowObject = { localStorage: storage, document: documentObject, navigator, history, location: { href: "https://saloniresinart.com/" }, addEventListener(type, listener) { if (type === "popstate") popstateListeners.push(listener); } };
  // fetch is a stub that records the call; each test decides what it answers. Timers are manual so the 25 s limit can be fired.
  // Status checks (action=status) are recorded apart, so the cancel tests keep counting only their own calls.
  // By default the status check answers "not available" and changes nothing.
  const fetchCalls = [];
  const statusCalls = [];
  const statusTimers = [];
  const timers = [];
  const aborts = [];
  if (!noFetch) windowObject.fetch = (url, init) => {
    if (String(url).endsWith("?action=status")) { statusCalls.push({ url, init }); return (statusImpl || jsonReply({ ok: false, error: "paused" }))(url, init); }
    fetchCalls.push({ url, init }); return (fetchImpl || (() => Promise.resolve({ json: () => Promise.resolve({ ok: true }) })))(url, init);
  };
  windowObject.AbortController = function () { this.signal = { aborted: false }; this.abort = () => { this.signal.aborted = true; aborts.push(this); }; };
  windowObject.setTimeout = (callback, delay) => {
    if (delay === 15000) { statusTimers.push({ callback, delay, cleared: false }); return -statusTimers.length; }
    timers.push({ callback, delay, cleared: false }); return timers.length;
  };
  windowObject.clearTimeout = (id) => { const timer = id < 0 ? statusTimers[-id - 1] : timers[id - 1]; if (timer) timer.cleared = true; };
  // Animation frames run at once unless a test wants to see what happens between them.
  const frames = [];
  windowObject.requestAnimationFrame = (callback) => { if (manualFrames) frames.push(callback); else callback(); return frames.length; };
  const flushFrame = () => { const due = frames.splice(0); due.forEach((callback) => callback()); return due.length; };
  const popstate = (state) => { if (history) history.state = state; popstateListeners.forEach((listener) => listener({ state })); };
  // A test clock moves Date.now() and "now" dates; real Date otherwise.
  const FakeDate = clock ? class extends Date { constructor(...args) { if (args.length) super(...args); else super(clock.now); } static now() { return clock.now; } } : Date;
  const context = { console, document: documentObject, window: windowObject, Date: FakeDate, JSON, Math, Number, String, Array, Object, RegExp };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "my-orders.js" });
  const real = windowObject.saloniMyOrders;
  // Arrays made inside the vm context have another prototype; hand the tests plain objects.
  const api = Object.assign({}, real, { list: () => JSON.parse(JSON.stringify(real.list())) });
  return { api, storage, elements, dialog, link, browseLink, documentObject, windowObject, history, popstate, flushFrame, fetchCalls, statusCalls, statusTimers, timers, aborts };
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

// --- live order status (action=status) ---
const ID_A = "request-aaaaaaaaaa";
const ID_B = "request-bbbbbbbbbb";
const ID_C = "request-cccccccccc";
const statusReply = (statuses) => jsonReply({ ok: true, statuses });
const cardFor = (runtime, id) => runtime.elements.get("my-orders-list").children.find((card) => text(card).includes(id));
const statusOf = (card) => byClass(card, "my-order-status");
function withOrders(options = {}, fulfilments = {}) {
  const runtime = makeRuntime(options);
  [ID_A, ID_B, ID_C].forEach((id, index) => runtime.api.save(order({ requestId: id, fulfillment: fulfilments[id] || "shipping", at: index })));
  return runtime;
}
const openDialog = (runtime) => runtime.link.dispatch("click", { button: 0 });
const closeDialog = (runtime) => { runtime.dialog.close(); runtime.popstate(null); };

test("opening the dialog sends exactly one action=status request with every stored request ID, and nothing else", async () => {
  const runtime = withOrders();
  runtime.api.save(order({ requestId: "request-1" }));
  openDialog(runtime);
  await settle();
  assert.equal(runtime.statusCalls.length, 1);
  const call = runtime.statusCalls[0];
  assert.equal(call.url, EXEC_URL + "?action=status");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.credentials, "omit");
  assert.equal(call.init.headers, undefined, "a simple request: no preflight");
  assert.deepEqual(Object.keys(JSON.parse(call.init.body)), ["requestIds"]);
  assert.deepEqual(JSON.parse(call.init.body).requestIds.sort(), [ID_A, ID_B, ID_C], "ids the server would refuse are not sent");
  assert.equal(runtime.fetchCalls.length, 0);
  assert.equal(runtime.statusTimers[0].delay, 15000);
  assert.ok(call.init.signal);
});

test("no status request without orders, without a usable request ID, or without a server address", () => {
  const empty = makeRuntime(); openDialog(empty);
  const short = makeRuntime(); short.api.save(order({ requestId: "request-1" })); openDialog(short);
  const unconfigured = withOrders({ execUrl: null }); openDialog(unconfigured);
  const noFetch = withOrders({ noFetch: true }); openDialog(noFetch);
  for (const runtime of [empty, short, unconfigured, noFetch]) assert.equal(runtime.statusCalls.length, 0);
});

test("each order shows its own status text and a coloured badge class, set through textContent", async () => {
  const runtime = withOrders({ statusImpl: statusReply({ [ID_A]: "confirmed", [ID_B]: "in_progress", [ID_C]: "dispatched" }) });
  openDialog(runtime);
  await settle();
  assert.equal(text(statusOf(cardFor(runtime, ID_A))), "Confirmed by Saloni");
  assert.equal(text(statusOf(cardFor(runtime, ID_B))), "Being made");
  assert.equal(text(statusOf(cardFor(runtime, ID_C))), "Dispatched");
  assert.equal(statusOf(cardFor(runtime, ID_A)).className, "my-order-status is-confirmed");
  assert.equal(statusOf(cardFor(runtime, ID_B)).className, "my-order-status is-in-progress");
  assert.equal(statusOf(cardFor(runtime, ID_C)).className, "my-order-status is-dispatched");
});

test("every status code has its shopper wording, with pickup variants for ready and delivered", async () => {
  const wording = {
    received: ["Request sent — Saloni will contact you to confirm", "Request sent — Saloni will contact you to confirm"],
    confirmed: ["Confirmed by Saloni", "Confirmed by Saloni"],
    in_progress: ["Being made", "Being made"],
    ready: ["Ready to ship", "Ready for pickup in Ajmer"],
    dispatched: ["Dispatched", "Dispatched"],
    delivered: ["Delivered", "Picked up"],
    cancel_requested: ["Cancellation requested — Saloni will confirm", "Cancellation requested — Saloni will confirm"],
    cancel_declined: ["Confirmed — your cancellation request was declined. Contact Saloni if you have questions.", "Confirmed — your cancellation request was declined. Contact Saloni if you have questions."],
    cancelled: ["Cancelled", "Cancelled"],
  };
  for (const [code, [shipping, pickup]] of Object.entries(wording)) {
    const runtime = makeRuntime({ statusImpl: statusReply({ [ID_A]: code, [ID_B]: code }) });
    runtime.api.save(order({ requestId: ID_A, fulfillment: "shipping" }));
    runtime.api.save(order({ requestId: ID_B, fulfillment: "pickup" }));
    openDialog(runtime);
    await settle();
    assert.equal(text(statusOf(cardFor(runtime, ID_A))), shipping, code + " shipping");
    assert.equal(text(statusOf(cardFor(runtime, ID_B))), pickup, code + " pickup");
  }
});

test("the answer is stored as status and statusCheckedAt, and an order the server did not list keeps its last known status", async () => {
  const runtime = withOrders({ statusImpl: statusReply({ [ID_A]: "ready" }) });
  const before = Date.now();
  openDialog(runtime);
  await settle();
  const entries = stored(runtime.storage).orders;
  const a = entries.find((entry) => entry.requestId === ID_A);
  assert.equal(a.status, "ready");
  assert.ok(a.statusCheckedAt >= before && a.statusCheckedAt <= Date.now());
  assert.equal("status" in entries.find((entry) => entry.requestId === ID_B), false);
  assert.equal(text(statusOf(cardFor(runtime, ID_B))), "Request sent — Saloni will contact you to confirm");
});

test("the last known status shows at once on open, before the check answers, and after a reload", async () => {
  let release;
  const first = withOrders({ statusImpl: statusReply({ [ID_A]: "dispatched", [ID_B]: "cancelled" }) });
  openDialog(first);
  await settle();
  const reloaded = makeRuntime({ storage: first.storage, statusImpl: () => new Promise((resolve) => { release = resolve; }) });
  openDialog(reloaded);
  assert.equal(text(statusOf(cardFor(reloaded, ID_A))), "Dispatched");
  assert.equal(text(statusOf(cardFor(reloaded, ID_B))), "Cancelled");
  release({ json: () => Promise.resolve({ ok: true, statuses: { [ID_A]: "delivered" } }) });
  await settle();
  assert.equal(text(statusOf(cardFor(reloaded, ID_A))), "Delivered");
  assert.equal(text(statusOf(cardFor(reloaded, ID_B))), "Cancelled");
});

test("a failed, paused, malformed or timed-out check keeps the last known status and shows no error", async () => {
  const seeded = withOrders({ statusImpl: statusReply({ [ID_A]: "confirmed", [ID_B]: "dispatched" }) });
  openDialog(seeded);
  await settle();
  const replies = [
    () => Promise.reject(new Error("offline")),
    jsonReply({ ok: false, error: "paused" }),
    jsonReply({ ok: false, error: "unconfirmed" }),
    jsonReply({ ok: true }),
    jsonReply({ ok: true, statuses: [] }),
    jsonReply(null),
    () => Promise.resolve({ json: () => Promise.reject(new Error("not json")) }),
    jsonReply({ ok: true, statuses: { [ID_A]: "<img src=x onerror=alert(1)>", [ID_B]: "shipped", [ID_C]: 7 } }),
  ];
  for (const statusImpl of replies) {
    const runtime = makeRuntime({ storage: seeded.storage, statusImpl });
    openDialog(runtime);
    await settle();
    assert.equal(runtime.statusCalls.length, 1);
    assert.equal(text(statusOf(cardFor(runtime, ID_A))), "Confirmed by Saloni");
    assert.equal(text(statusOf(cardFor(runtime, ID_B))), "Dispatched");
    assert.equal(text(statusOf(cardFor(runtime, ID_C))), "Request sent — Saloni will contact you to confirm");
    assert.equal(byClass(runtime.elements.get("my-orders-list"), "is-error"), null);
    assert.doesNotMatch(text(runtime.elements.get("my-orders-list")), /could not|error|try again/i);
  }
  const hung = makeRuntime({ storage: seeded.storage, statusImpl: () => new Promise(() => {}) });
  openDialog(hung);
  hung.statusTimers[0].callback();
  assert.equal(hung.aborts.length, 1);
  assert.equal(text(statusOf(cardFor(hung, ID_A))), "Confirmed by Saloni");
});

test("a stored status or time that is not valid is ignored, and the order itself stays", () => {
  const now = Date.now();
  const entry = (id, extra) => Object.assign({ at: now - 1000 }, order({ requestId: id }), extra);
  const storage = createStorage({ [KEY]: JSON.stringify({ version: 1, orders: [
    entry("good-status-id-1", { status: "dispatched", statusCheckedAt: now - 10 }),
    entry("bad-code-id-1234", { status: "shipped", statusCheckedAt: now - 10 }),
    entry("bad-proto-id-123", { status: "constructor", statusCheckedAt: now - 10 }),
    entry("bad-type-id-1234", { status: 3, statusCheckedAt: now - 10 }),
    entry("bad-time-id-1234", { status: "ready", statusCheckedAt: "now" }),
    entry("no-time-id-12345", { status: "ready" }),
    entry("future-id-123456", { status: "ready", statusCheckedAt: now + 10 * DAY }),
  ] }) });
  const listed = makeRuntime({ storage }).api.list();
  assert.equal(listed.length, 7);
  const by = (id) => listed.find((item) => item.requestId === id);
  assert.equal(by("good-status-id-1").status, "dispatched");
  for (const id of ["bad-code-id-1234", "bad-proto-id-123", "bad-type-id-1234", "bad-time-id-1234", "no-time-id-12345", "future-id-123456"]) {
    assert.equal(by(id).status, undefined, id);
    assert.equal(by(id).statusCheckedAt, undefined, id);
  }
});

test("save never writes a status, even if the summary carries one", () => {
  const { api, storage } = makeRuntime();
  api.save(order({ requestId: CANCEL_ID, status: "delivered", statusCheckedAt: Date.now() }));
  assert.deepEqual(Object.keys(stored(storage).orders[0]).sort(), ["at", "fulfillment", "items", "notes", "requestId"]);
});

test("Cancel order is offered only while the status is received or confirmed", async () => {
  const codes = { received: true, confirmed: true, in_progress: false, ready: false, dispatched: false, delivered: false, cancel_requested: false, cancel_declined: false, cancelled: false };
  for (const [code, offered] of Object.entries(codes)) {
    const runtime = makeRuntime({ statusImpl: statusReply({ [CANCEL_ID]: code }) });
    runtime.api.save(order({ requestId: CANCEL_ID }));
    openDialog(runtime);
    const card = runtime.elements.get("my-orders-list").children[0];
    assert.ok(button(card, "Cancel order"), "offered before the answer");
    await settle();
    assert.equal(Boolean(button(card, "Cancel order")), offered, code);
    assert.equal(Boolean(byClass(card, "my-order-cancel")), offered, code + " wrapper");
  }
});

test("a stored dispatched or cancelled status hides Cancel order from the first paint", () => {
  for (const status of ["dispatched", "cancelled", "delivered"]) {
    const now = Date.now();
    const storage = createStorage({ [KEY]: JSON.stringify({ version: 1, orders: [Object.assign({ at: now - 1000, status, statusCheckedAt: now - 10 }, order({ requestId: CANCEL_ID }))] }) });
    const runtime = makeRuntime({ storage });
    openDialog(runtime);
    assert.equal(button(runtime.elements.get("my-orders-list").children[0], "Cancel order"), null, status);
  }
});

test("a status that arrives while the cancel confirm is open leaves the confirm alone, and one that ends cancelling closes it", async () => {
  let release;
  const runtime = withOrder({ statusImpl: () => new Promise((resolve) => { release = resolve; }) });
  button(runtime.card, "Cancel order").dispatch("click");
  assert.ok(button(runtime.card, "Yes, ask to cancel"));
  release({ json: () => Promise.resolve({ ok: true, statuses: { [CANCEL_ID]: "confirmed" } }) });
  await settle();
  assert.ok(button(runtime.card, "Yes, ask to cancel"), "still open for a confirmed order");
  assert.equal(text(statusOf(runtime.card)), "Confirmed by Saloni");
  const late = withOrder({ statusImpl: () => new Promise((resolve) => { release = resolve; }) });
  button(late.card, "Cancel order").dispatch("click");
  release({ json: () => Promise.resolve({ ok: true, statuses: { [CANCEL_ID]: "dispatched" } }) });
  await settle();
  assert.equal(button(late.card, "Yes, ask to cancel"), null);
  assert.equal(button(late.card, "Cancel order"), null);
  assert.equal(text(statusOf(late.card)), "Dispatched");
});

test("after a successful cancel request the status is cancel_requested locally, even when a late check still says received or confirmed", async () => {
  for (const late of ["received", "confirmed"]) {
    let release;
    const runtime = withOrder({ fetchImpl: jsonReply({ ok: true }), statusImpl: () => new Promise((resolve) => { release = resolve; }) });
    button(runtime.card, "Cancel order").dispatch("click");
    button(runtime.card, "Yes, ask to cancel").dispatch("click");
    await settle();
    assert.equal(text(statusOf(runtime.card)), "Cancellation requested — Saloni will confirm");
    assert.equal(statusOf(runtime.card).className, "my-order-status is-cancel-requested");
    release({ json: () => Promise.resolve({ ok: true, statuses: { [CANCEL_ID]: late } }) });
    await settle();
    assert.equal(text(statusOf(runtime.card)), "Cancellation requested — Saloni will confirm", late);
    assert.equal(button(runtime.card, "Cancel order"), null);
    const reopened = makeRuntime({ storage: runtime.storage });
    openDialog(reopened);
    assert.match(text(reopened.elements.get("my-orders-list")), /Cancellation requested — Saloni will confirm/);
  }
});

test("once Saloni's status moves past confirmed, her status wins over the shopper's cancellation request", async () => {
  const now = Date.now();
  const storage = createStorage({ [KEY]: JSON.stringify({ version: 1, orders: [Object.assign({ at: now - 1000, cancelRequestedAt: now - 500 }, order({ requestId: CANCEL_ID }))] }) });
  for (const [code, wording] of [["cancelled", "Cancelled"], ["dispatched", "Dispatched"], ["in_progress", "Being made"]]) {
    const runtime = makeRuntime({ storage: createStorage({ [KEY]: storage.data[KEY] }), statusImpl: statusReply({ [CANCEL_ID]: code }) });
    openDialog(runtime);
    await settle();
    assert.equal(text(statusOf(runtime.elements.get("my-orders-list").children[0])), wording);
  }
});

test("one status check per open: reopening within a minute reuses the last known status, a check never overlaps, and a minute later it asks again", async () => {
  const clock = { now: Date.now() };
  let release;
  const runtime = withOrders({ clock, statusImpl: () => new Promise((resolve) => { release = resolve; }) });
  openDialog(runtime);
  closeDialog(runtime);
  openDialog(runtime);
  assert.equal(runtime.statusCalls.length, 1, "no overlap while the first check is pending");
  release({ json: () => Promise.resolve({ ok: true, statuses: { [ID_A]: "confirmed" } }) });
  await settle();
  closeDialog(runtime);
  clock.now += 30 * 1000;
  openDialog(runtime);
  await settle();
  assert.equal(runtime.statusCalls.length, 1, "within 60 s");
  assert.equal(text(statusOf(cardFor(runtime, ID_A))), "Confirmed by Saloni");
  closeDialog(runtime);
  clock.now += 31 * 1000;
  openDialog(runtime);
  await settle();
  assert.equal(runtime.statusCalls.length, 2, "after 60 s");
});

test("a status answer that arrives after the dialog was closed is still remembered", async () => {
  let release;
  const runtime = withOrders({ statusImpl: () => new Promise((resolve) => { release = resolve; }) });
  openDialog(runtime);
  closeDialog(runtime);
  release({ json: () => Promise.resolve({ ok: true, statuses: { [ID_B]: "ready" } }) });
  await settle();
  assert.equal(stored(runtime.storage).orders.find((entry) => entry.requestId === ID_B).status, "ready");
});

test("blocked storage does not stop the status from showing", async () => {
  const data = {};
  const flaky = { getItem: (key) => (key in data ? data[key] : null), setItem(key, value) { if (this.deny) throw new Error("quota"); data[key] = String(value); }, removeItem() {}, deny: false };
  const runtime = makeRuntime({ storage: flaky, statusImpl: statusReply({ [ID_A]: "ready" }) });
  runtime.api.save(order({ requestId: ID_A, fulfillment: "pickup" }));
  flaky.deny = true;
  openDialog(runtime);
  await settle();
  assert.equal(text(statusOf(cardFor(runtime, ID_A))), "Ready for pickup in Ajmer");
});

test("the status badge has a style for every status, and no markup is built from the server's answer", () => {
  for (const code of ["received", "confirmed", "in-progress", "ready", "dispatched", "delivered", "cancel-requested", "cancel-declined", "cancelled"]) {
    assert.match(css, new RegExp("\\.my-order-status\\.is-" + code + "\\b"), code);
  }
  assert.match(css, /\.my-order-note\b/);
  assert.match(css, /\.my-order-note\.is-error/);
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML/);
});

// --- declined cancellation, and focus when a status update removes the cancel controls ---
function cancelledEntry(extra = {}) {
  const now = Date.now();
  return Object.assign({ at: now - 1000, cancelRequestedAt: now - 500 }, order({ requestId: CANCEL_ID }), extra);
}
const stateFor = (entries) => createStorage({ [KEY]: JSON.stringify({ version: 1, orders: entries }) });

test("while a local cancel request is out, received, confirmed and cancel_requested all read as Cancellation requested", async () => {
  for (const code of ["received", "confirmed", "cancel_requested"]) {
    const runtime = makeRuntime({ storage: stateFor([cancelledEntry()]), statusImpl: statusReply({ [CANCEL_ID]: code }) });
    openDialog(runtime);
    await settle();
    const card = runtime.elements.get("my-orders-list").children[0];
    assert.equal(text(statusOf(card)), "Cancellation requested — Saloni will confirm", code);
    assert.equal(button(card, "Cancel order"), null, code);
    assert.doesNotMatch(text(card), /declined/);
  }
});

test("cancel_declined shows the declined wording and no Cancel button, with or without a local cancel request, and survives a reload", async () => {
  for (const entry of [cancelledEntry(), Object.assign({ at: Date.now() - 1000 }, order({ requestId: CANCEL_ID }))]) {
    const storage = stateFor([entry]);
    const runtime = makeRuntime({ storage, statusImpl: statusReply({ [CANCEL_ID]: "cancel_declined" }) });
    openDialog(runtime);
    await settle();
    const card = runtime.elements.get("my-orders-list").children[0];
    assert.equal(text(statusOf(card)), "Confirmed — your cancellation request was declined. Contact Saloni if you have questions.");
    assert.equal(statusOf(card).className, "my-order-status is-cancel-declined");
    assert.equal(button(card, "Cancel order"), null);
    const reopened = makeRuntime({ storage });
    openDialog(reopened);
    assert.match(text(reopened.elements.get("my-orders-list").children[0]), /your cancellation request was declined/);
  }
});

test("any other server status wins over the shopper's cancellation request", async () => {
  for (const [code, wording] of [["in_progress", "Being made"], ["ready", "Ready to ship"], ["dispatched", "Dispatched"], ["delivered", "Delivered"], ["cancelled", "Cancelled"]]) {
    const runtime = makeRuntime({ storage: stateFor([cancelledEntry()]), statusImpl: statusReply({ [CANCEL_ID]: code }) });
    openDialog(runtime);
    await settle();
    assert.equal(text(statusOf(runtime.elements.get("my-orders-list").children[0])), wording, code);
  }
});

test("an old stored entry that still has cancelSeenAt loads, and the field is dropped", () => {
  const entries = [cancelledEntry({ cancelSeenAt: Date.now() - 100 }), cancelledEntry({ requestId: "other-seen-id-1234", cancelSeenAt: "junk" })];
  const listed = makeRuntime({ storage: stateFor(entries) }).api.list();
  assert.equal(listed.length, 2);
  listed.forEach((item) => assert.equal("cancelSeenAt" in item, false));
  assert.doesNotMatch(source, /cancelSeen/);
});

test("a status update that removes the cancel controls while focus is inside them moves focus to the status line", async () => {
  let release;
  const runtime = withOrder({ statusImpl: () => new Promise((resolve) => { release = resolve; }) });
  button(runtime.card, "Cancel order").dispatch("click");
  const keep = button(runtime.card, "Keep order");
  assert.equal(keep.focused, true);
  runtime.elements.get("my-orders-close").focused = false;
  release({ json: () => Promise.resolve({ ok: true, statuses: { [CANCEL_ID]: "dispatched" } }) });
  await settle();
  assert.equal(byClass(runtime.card, "my-order-cancel"), null);
  const status = statusOf(runtime.card);
  assert.equal(status.focused, true);
  assert.equal(status.getAttribute("tabindex"), "-1");
});

test("a status update that removes the cancel controls while focus is elsewhere leaves focus alone", async () => {
  let release;
  const runtime = withOrder({ statusImpl: () => new Promise((resolve) => { release = resolve; }) });
  runtime.documentObject.activeElement = runtime.elements.get("my-orders-close");
  release({ json: () => Promise.resolve({ ok: true, statuses: { [CANCEL_ID]: "ready" } }) });
  await settle();
  assert.equal(byClass(runtime.card, "my-order-cancel"), null);
  assert.equal(statusOf(runtime.card).focused, false);
});

test("a status update during a cancel request keeps the controls until it settles; a failure then says so on the card and focuses the status", async () => {
  let release, fail;
  const runtime = withOrder({
    statusImpl: () => new Promise((resolve) => { release = resolve; }),
    fetchImpl: () => new Promise((resolve, reject) => { fail = reject; }),
  });
  button(runtime.card, "Cancel order").dispatch("click");
  button(runtime.card, "Yes, ask to cancel").dispatch("click");
  release({ json: () => Promise.resolve({ ok: true, statuses: { [CANCEL_ID]: "dispatched" } }) });
  await settle();
  assert.equal(text(statusOf(runtime.card)), "Dispatched");
  assert.ok(byClass(runtime.card, "my-order-cancel"), "still there while the request is out");
  fail(new Error("offline"));
  await settle();
  assert.equal(byClass(runtime.card, "my-order-cancel"), null);
  assert.equal(button(runtime.card, "Cancel order"), null);
  const note = byClass(runtime.card, "my-order-note");
  assert.match(text(note), /Could not send the request/);
  assert.equal(note.getAttribute("aria-live"), "polite");
  assert.equal(statusOf(runtime.card).focused, true);
});

test("a cancel request that succeeds after the status moved on stores the request, and the server status wins", async () => {
  let release, succeed;
  const runtime = withOrder({
    statusImpl: () => new Promise((resolve) => { release = resolve; }),
    fetchImpl: () => new Promise((resolve) => { succeed = resolve; }),
  });
  button(runtime.card, "Cancel order").dispatch("click");
  button(runtime.card, "Yes, ask to cancel").dispatch("click");
  release({ json: () => Promise.resolve({ ok: true, statuses: { [CANCEL_ID]: "in_progress" } }) });
  succeed({ json: () => Promise.resolve({ ok: true }) });
  await settle();
  assert.ok(stored(runtime.storage).orders[0].cancelRequestedAt);
  assert.equal(text(statusOf(runtime.card)), "Being made");
  assert.equal(byClass(runtime.card, "my-order-cancel"), null);
  assert.equal(statusOf(runtime.card).focused, true);
});

test("a cancel failure that arrives after the dialog was reopened is shown on the card that is on screen", async () => {
  let fail;
  const runtime = withOrder({ fetchImpl: () => new Promise((resolve, reject) => { fail = reject; }) });
  button(runtime.card, "Cancel order").dispatch("click");
  button(runtime.card, "Yes, ask to cancel").dispatch("click");
  closeDialog(runtime);
  openDialog(runtime);
  const live = runtime.elements.get("my-orders-list").children[0];
  assert.notEqual(live, runtime.card);
  fail(new Error("offline"));
  await settle();
  assert.match(text(live), /Could not send the request/);
});

// --- Advance payment by UPI: "Pay advance" in the status answer (kept in memory only) ---
const ADV_ID = "abcd1234-ef56-4789-a012-3456789abcde";
const ADV = { amount: 500, payee: "saloni.art@okhdfcbank", name: "Saloni Resin Art" };
const advanceReply = (code, advance, id = ADV_ID) => jsonReply({ ok: true, statuses: { [id]: code }, advance: advance === undefined ? undefined : { [id]: advance } });
const withAdvanceOrder = (reply, options = {}) => {
  const runtime = makeRuntime(Object.assign({ statusImpl: reply }, options));
  runtime.api.save(order({ requestId: ADV_ID }));
  openDialog(runtime);
  runtime.card = runtime.elements.get("my-orders-list").children[0];
  return runtime;
};
const payLinks = (card) => find(card, (element) => element.tagName === "A" && element.className.split(" ").includes("my-order-pay"));
// The Pay with links carry their app in the accessible name ("Pay ₹500 with Google Pay"); the visible face is an icon.
const payApp = (link) => /^Pay ₹\d+ with (.+)$/.exec(link.getAttribute("aria-label"))[1];
const payLink = (card) => payLinks(card)[0] || null;
const payHrefs = (card) => Object.fromEntries(payLinks(card).map((link) => [payApp(link), link.getAttribute("href")]));
const PARAMS = "pa=saloni.art%40okhdfcbank&pn=Saloni%20Resin%20Art&am=500.00&cu=INR&tn=Saloni%20order%20abcd1234";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const advanceBox = (card) => byClass(card, "my-order-advance");

test("a confirmed order with an advance shows the amount, a Pay with choice of app icons with every UPI field encoded, and a copy option", async () => {
  const runtime = withAdvanceOrder(advanceReply("confirmed", ADV), { navigator: { userAgent: ANDROID_UA, platform: "Linux armv8l" } });
  await settle();
  const links = payLinks(runtime.card);
  assert.deepEqual(links.map((link) => link.getAttribute("href")), [
    "tez://upi/pay?" + PARAMS, "phonepe://pay?" + PARAMS, "paytmmp://pay?" + PARAMS,
    "intent://pay?" + PARAMS + "#Intent;scheme=upi;package=com.whatsapp;end",
  ]);
  assert.deepEqual(links.map((link) => link.getAttribute("aria-label")), ["Pay ₹500 with Google Pay", "Pay ₹500 with PhonePe", "Pay ₹500 with Paytm", "Pay ₹500 with WhatsApp"]);
  assert.deepEqual(links.map(text), ["", "", "", ""], "the buttons show icons, not app names");
  for (const link of links) {
    const icons = find(link, (element) => element.tagName === "SVG");
    assert.equal(icons.length, 1);
    assert.equal(icons[0].getAttribute("aria-hidden"), "true");
    assert.equal(icons[0].getAttribute("focusable"), "false");
    assert.equal(icons[0].getAttribute("viewBox"), "0 0 24 24");
    assert.match(icons[0].getAttribute("fill"), /^#[0-9A-Fa-f]{6}$/);
    const paths = find(icons[0], (element) => element.tagName === "PATH");
    assert.equal(paths.length, 1);
    assert.match(paths[0].getAttribute("d"), /^M[\d.\sA-Za-z,-]+$/);
  }
  assert.deepEqual(links.map((link) => find(link, (element) => element.tagName === "SVG")[0].getAttribute("fill")), ["#4285F4", "#5F259F", "#20336B", "#25D366"]);
  assert.match(text(advanceBox(runtime.card)), /Pay with/);
  assert.doesNotMatch(text(advanceBox(runtime.card)), /If nothing opens|isn.t installed|choose another/);
  assert.doesNotMatch(text(advanceBox(runtime.card)), /Other UPI app/i);
  assert.equal(links.some((link) => link.getAttribute("href").startsWith("upi://")), false, "no plain upi:// link");
  assert.equal(button(runtime.card, "Pay advance ₹500"), null);
  assert.equal(advanceBox(runtime.card).hidden, false);
  assert.match(text(advanceBox(runtime.card)), /Advance to pay: ₹500/);
  assert.match(text(advanceBox(runtime.card)), /Or pay ₹500 to\s+saloni\.art@okhdfcbank\s+in any UPI app and add “Saloni order abcd1234” as the note\./);
  assert.match(text(advanceBox(runtime.card)), /Saloni will confirm once she receives it\./);
  assert.ok(button(runtime.card, "Copy UPI ID"));
  assert.ok(button(runtime.card, "Cancel order"), "a confirmed order can still be cancelled");
  assert.equal(text(statusOf(runtime.card)), "Confirmed by Saloni");
  const children = runtime.card.children.map((child) => child.className.split(" ")[0]);
  assert.ok(children.indexOf("my-order-advance") < children.indexOf("my-order-cancel"), "the advance sits above the cancel controls");
});

test("the UPI link encodes odd payee names and cannot be bent by them", async () => {
  const runtime = withAdvanceOrder(advanceReply("confirmed", { amount: 1200, payee: "a.b-c_d9@ybl", name: "Saloni & Co. =x?y#z ₹" }));
  await settle();
  const odd = "pa=a.b-c_d9%40ybl&pn=Saloni%20%26%20Co.%20%3Dx%3Fy%23z%20%E2%82%B9&am=1200.00&cu=INR&tn=Saloni%20order%20abcd1234";
  const hrefs = Object.values(payHrefs(runtime.card));
  assert.equal(hrefs.length, 3, "Google Pay, PhonePe, Paytm (no WhatsApp: unknown device is not Android)");
  assert.deepEqual(hrefs.map((href) => href.split("?")[1]), [odd, odd, odd]);
  for (const href of hrefs) {
    assert.equal(href.split("?").length, 2);
    assert.equal(new URLSearchParams(href.split("?")[1]).get("pn"), "Saloni & Co. =x?y#z ₹");
    assert.equal(new URLSearchParams(href.split("?")[1]).size, 5);
  }
  const android = withAdvanceOrder(advanceReply("confirmed", { amount: 1200, payee: "a.b-c_d9@ybl", name: "Saloni & Co. =x?y#z ₹" }), { navigator: { userAgent: ANDROID_UA } });
  await settle();
  assert.equal(payHrefs(android.card).WhatsApp, "intent://pay?" + odd + "#Intent;scheme=upi;package=com.whatsapp;end");
});

test("Google Pay uses gpay:// on iPhone and iPad, and tez:// on Android and when the device is unknown; PhonePe and Paytm do not change", async () => {
  const devices = [
    [{ userAgent: IPHONE_UA }, "gpay://upi/pay?"],
    [{ userAgent: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15", platform: "iPad" }, "gpay://upi/pay?"],
    [{ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 5 }, "gpay://upi/pay?"],
    [{ userAgent: ANDROID_UA, platform: "Linux armv8l" }, "tez://upi/pay?"],
    [{ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126", platform: "MacIntel", maxTouchPoints: 0 }, "tez://upi/pay?"],
    [{}, "tez://upi/pay?"],
    [undefined, "tez://upi/pay?"],
  ];
  for (const [nav, prefix] of devices) {
    const runtime = makeRuntime({ statusImpl: advanceReply("confirmed", ADV), navigator: nav });
    runtime.api.save(order({ requestId: ADV_ID }));
    openDialog(runtime);
    await settle();
    const card = runtime.elements.get("my-orders-list").children[0];
    const hrefs = payHrefs(card);
    assert.equal(hrefs["Google Pay"], prefix + PARAMS, JSON.stringify(nav));
    assert.equal(hrefs.PhonePe, "phonepe://pay?" + PARAMS, JSON.stringify(nav));
    assert.equal(hrefs.Paytm, "paytmmp://pay?" + PARAMS, JSON.stringify(nav));
  }
});

test("WhatsApp Pay is offered only on Android, as an intent to the UPI scheme for the WhatsApp package", async () => {
  const WA = "intent://pay?" + PARAMS + "#Intent;scheme=upi;package=com.whatsapp;end";
  const devices = [
    [{ userAgent: ANDROID_UA, platform: "Linux armv8l" }, true],
    [{ userAgent: IPHONE_UA }, false],
    [{ userAgent: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15", platform: "iPad" }, false],
    [{ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 5 }, false],
    [{ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126", platform: "MacIntel", maxTouchPoints: 0 }, false],
    [{}, false],
    [undefined, false],
  ];
  for (const [nav, shown] of devices) {
    const runtime = makeRuntime({ statusImpl: advanceReply("confirmed", ADV), navigator: nav });
    runtime.api.save(order({ requestId: ADV_ID }));
    openDialog(runtime);
    await settle();
    const card = runtime.elements.get("my-orders-list").children[0];
    const hrefs = payHrefs(card);
    assert.deepEqual(Object.keys(hrefs), shown ? ["Google Pay", "PhonePe", "Paytm", "WhatsApp"] : ["Google Pay", "PhonePe", "Paytm"], JSON.stringify(nav));
    assert.equal(hrefs.WhatsApp, shown ? WA : undefined, JSON.stringify(nav));
    assert.doesNotMatch(text(card), /WhatsApp Pay|Other UPI/, JSON.stringify(nav));
    assert.equal(Object.values(hrefs).some((href) => href.startsWith("upi://")), false, JSON.stringify(nav));
    assert.match(text(advanceBox(card)), /Or pay ₹500 to\s+saloni\.art@okhdfcbank/);
    assert.ok(button(card, "Copy UPI ID"));
    assert.doesNotMatch(text(advanceBox(card)), /If nothing opens/);
  }
});

test("Copy UPI ID copies the payee and says so, or says it could not", async () => {
  const runtime = withAdvanceOrder(advanceReply("confirmed", ADV));
  await settle();
  const copied = [];
  runtime.windowObject.navigator = { clipboard: { writeText: (value) => { copied.push(value); return Promise.resolve(); } } };
  button(runtime.card, "Copy UPI ID").dispatch("click");
  await settle();
  assert.deepEqual(copied, ["saloni.art@okhdfcbank"]);
  assert.equal(text(byClass(runtime.card, "my-order-copy-feedback")), "UPI ID copied.");
  assert.equal(byClass(runtime.card, "my-order-copy-feedback").getAttribute("aria-live"), "polite");

  runtime.windowObject.navigator = { clipboard: { writeText: () => Promise.reject(new Error("denied")) } };
  button(runtime.card, "Copy UPI ID").dispatch("click");
  await settle();
  assert.match(text(byClass(runtime.card, "my-order-copy-feedback")), /Could not copy/);
  assert.match(byClass(runtime.card, "my-order-copy-feedback").className, /is-error/);

  runtime.windowObject.navigator = undefined;
  button(runtime.card, "Copy UPI ID").dispatch("click");
  await settle();
  assert.match(text(byClass(runtime.card, "my-order-copy-feedback")), /Could not copy/);
});

test("no Pay button without an advance, or when the advance is not exactly what the server promises", async () => {
  const bad = [
    undefined, null, "500", 500, [], {},
    { amount: 0, payee: ADV.payee, name: ADV.name }, { amount: -1, payee: ADV.payee, name: ADV.name },
    { amount: 500.5, payee: ADV.payee, name: ADV.name }, { amount: 200001, payee: ADV.payee, name: ADV.name },
    { amount: "500", payee: ADV.payee, name: ADV.name }, { amount: NaN, payee: ADV.payee, name: ADV.name }, { amount: Infinity, payee: ADV.payee, name: ADV.name },
    { amount: 500, payee: "saloni", name: ADV.name }, { amount: 500, payee: "saloni@1bank", name: ADV.name }, { amount: 500, payee: "sal oni@bank", name: ADV.name },
    { amount: 500, payee: "saloni@bank&am=1", name: ADV.name }, { amount: 500, payee: "saloni@bank\n", name: ADV.name }, { amount: 500, payee: 7, name: ADV.name },
    { amount: 500, payee: "x".repeat(257) + "@bank", name: ADV.name }, { amount: 500, name: ADV.name }, { name: ADV.name },
  ];
  for (const advance of bad) {
    const runtime = withAdvanceOrder(advanceReply("confirmed", advance));
    await settle();
    assert.equal(payLinks(runtime.card).length, 0, JSON.stringify(advance));
    assert.doesNotMatch(text(runtime.card), /Pay with/);
    assert.equal(advanceBox(runtime.card).hidden, true, JSON.stringify(advance));
    assert.equal(button(runtime.card, "Copy UPI ID"), null);
    assert.equal(text(statusOf(runtime.card)), "Confirmed by Saloni");
  }
});

test("a missing or odd payee name falls back to the studio name, and an odd request ID gets no button", async () => {
  const plain = withAdvanceOrder(advanceReply("confirmed", { amount: 500, payee: ADV.payee }));
  await settle();
  assert.match(payLink(plain.card).getAttribute("href"), /&pn=Saloni%20Resin%20Art%20Studio&/);
  const long = withAdvanceOrder(advanceReply("confirmed", { amount: 500, payee: ADV.payee, name: "x".repeat(200) }));
  await settle();
  assert.match(payLink(long.card).getAttribute("href"), /&pn=Saloni%20Resin%20Art%20Studio&/);
  const shortId = makeRuntime({ statusImpl: advanceReply("confirmed", ADV, "request-1") });
  shortId.api.save(order({ requestId: "request-1" }));
  openDialog(shortId);
  await settle();
  assert.equal(payLinks(shortId.elements.get("my-orders-list").children[0]).length, 0);
});

test("an advance shows only while the order reads Confirmed", async () => {
  for (const code of ["received", "in_progress", "ready", "dispatched", "delivered", "cancel_requested", "cancel_declined", "cancelled", "advance_paid"]) {
    const runtime = withAdvanceOrder(advanceReply(code, ADV));
    await settle();
    assert.equal(payLinks(runtime.card).length, 0, code);
  }
  // A shopper who already asked to cancel does not get a Pay button while the sheet still says Confirmed.
  const storage = createStorage();
  const first = makeRuntime({ storage });
  first.api.save(order({ requestId: ADV_ID }));
  const entry = stored(storage); entry.orders[0].cancelRequestedAt = Date.now(); storage.data[KEY] = JSON.stringify(entry);
  const runtime = makeRuntime({ storage, statusImpl: advanceReply("confirmed", ADV) });
  openDialog(runtime);
  await settle();
  assert.equal(payLinks(runtime.elements.get("my-orders-list").children[0]).length, 0);
});

test("advance received reads Advance received, with no Pay button, no copy option and no Cancel order", async () => {
  const runtime = withAdvanceOrder(advanceReply("advance_paid", undefined));
  await settle();
  assert.equal(text(statusOf(runtime.card)), "Advance received — thank you");
  assert.equal(statusOf(runtime.card).className, "my-order-status is-advance-paid");
  assert.equal(payLinks(runtime.card).length, 0);
  assert.equal(button(runtime.card, "Copy UPI ID"), null);
  assert.equal(button(runtime.card, "Cancel order"), null);
  assert.equal(byClass(runtime.card, "my-order-cancel"), null);
  assert.equal(stored(runtime.storage).orders[0].status, "advance_paid", "the code is remembered like any other status");
  assert.match(css, /\.my-order-status\.is-advance-paid\b/);
});

test("the advance is never stored: not the amount, not the UPI ID, not the name", async () => {
  const runtime = withAdvanceOrder(advanceReply("confirmed", ADV));
  await settle();
  const raw = runtime.storage.data[KEY];
  for (const secret of ["okhdfcbank", "saloni.art", "Saloni Resin Art", "500", "advance", "upi"]) assert.ok(!raw.toLowerCase().includes(secret.toLowerCase()), secret);
  assert.equal(stored(runtime.storage).orders[0].status, "confirmed");
  // Saved data with an advance planted in it is ignored on read.
  const planted = stored(runtime.storage); planted.orders[0].advance = ADV; planted.orders[0].status = "confirmed";
  const fresh = makeRuntime({ storage: createStorage({ [KEY]: JSON.stringify(planted) }), statusImpl: () => new Promise(() => {}) });
  openDialog(fresh);
  assert.equal(payLinks(fresh.elements.get("my-orders-list").children[0]).length, 0, "a reload shows no button until the server answers");
  assert.equal("advance" in fresh.api.list()[0], false);
});

test("the button stays when the dialog is reopened within the minute, and goes when a later answer drops it", async () => {
  const clock = { now: Date.now() };
  const replies = [advanceReply("confirmed", ADV), advanceReply("confirmed", undefined), () => Promise.reject(new Error("offline"))];
  let call = 0;
  const runtime = withAdvanceOrder(() => replies[call++](), { clock });
  await settle();
  assert.ok(payLink(runtime.card));
  closeDialog(runtime);
  clock.now += 10 * 1000;
  openDialog(runtime);
  await settle();
  assert.equal(call, 1, "no second check inside the minute");
  assert.ok(payLink(runtime.elements.get("my-orders-list").children[0]), "still shown from memory");
  closeDialog(runtime);
  clock.now += 2 * 60 * 1000;
  openDialog(runtime);
  await settle();
  assert.equal(payLinks(runtime.elements.get("my-orders-list").children[0]).length, 0, "Saloni took the amount away");
  closeDialog(runtime);
  clock.now += 2 * 60 * 1000;
  openDialog(runtime);
  await settle();
  assert.equal(text(statusOf(runtime.elements.get("my-orders-list").children[0])), "Confirmed by Saloni", "a failed check changes nothing");
});

test("when the sheet moves from confirmed to advance received, a reopened dialog shows the badge and no Pay button", async () => {
  let reply = advanceReply("confirmed", ADV);
  const clock = { now: Date.now() };
  const runtime = withAdvanceOrder(() => reply(), { clock });
  await settle();
  assert.ok(button(runtime.card, "Copy UPI ID"));
  reply = advanceReply("advance_paid", undefined);
  runtime.dialog.close(); runtime.popstate(null);
  clock.now += 2 * 60 * 1000;
  openDialog(runtime);
  await settle();
  const card = runtime.elements.get("my-orders-list").children[0];
  assert.equal(payLinks(card).length, 0);
  assert.equal(text(statusOf(card)), "Advance received — thank you");
});

test("my-orders.js builds the advance with text nodes only and keeps the UPI shape in step with the server", () => {
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML/);
  const server = fs.readFileSync(path.join(root, "apps-script", "Code.gs"), "utf8");
  const pattern = (text) => /UPI_PAYEE(?:_PATTERN)? = (\/\^.*\$\/);/.exec(text)[1];
  assert.equal(pattern(source), pattern(server));
  assert.match(css, /\.my-order-pay\b/);
  assert.match(css, /\.my-order-pay-choice\b/);
  assert.match(css, /\.my-order-pay:focus-visible/);
  assert.doesNotMatch(css, /my-order-pay-hint/);
  assert.match(css, /\.my-order-advance\b/);
});
