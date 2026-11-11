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
  focus() { this.focused = true; if (FakeElement.onFocus) FakeElement.onFocus(this); }
  getClientRects() { return this.hiddenLayout ? [] : [{}]; }
  find(predicate, found = []) { if (predicate(this)) found.push(this); this.children.forEach((child) => child.find(predicate, found)); return found; }
  showModal() { this.open = true; }
  close() { if (!this.open) return; this.open = false; (this.listeners.close || []).forEach((listener) => listener({ target: this })); }
}

function createStorage(initial = {}) {
  const data = Object.assign({}, initial);
  return { data, getItem: (key) => (key in data ? data[key] : null), setItem(key, value) { data[key] = String(value); }, removeItem(key) { delete data[key]; } };
}

function makeRuntime({ storage = createStorage(), dialogSupported = true } = {}) {
  const ids = ["my-orders-dialog", "my-orders-close", "my-orders-list", "my-orders-empty", "my-orders-contact", "my-orders-clear", "my-orders-confirm", "my-orders-confirm-yes", "my-orders-confirm-no", "my-orders-clear-area", "nav-toggle"];
  const elements = new Map(ids.map((id) => [id, new FakeElement(id === "my-orders-list" ? "ol" : "div", id)]));
  const dialog = elements.get("my-orders-dialog");
  if (!dialogSupported) { dialog.showModal = undefined; }
  elements.get("my-orders-confirm").hidden = true;
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
  const windowObject = { localStorage: storage, document: documentObject };
  const context = { console, document: documentObject, window: windowObject, Date, JSON, Math, Number, String, Array, Object, RegExp };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "my-orders.js" });
  const real = windowObject.saloniMyOrders;
  // Arrays made inside the vm context have another prototype; hand the tests plain objects.
  const api = Object.assign({}, real, { list: () => JSON.parse(JSON.stringify(real.list())) });
  return { api, storage, elements, dialog, link, browseLink, documentObject, windowObject };
}

const order = (overrides = {}) => Object.assign({
  requestId: "request-1",
  items: [{ name: "Heart tray", quantity: 2, price: "Rs 899", image: "assets/romantic-heart-trinket-tray.webp" }],
  fulfillment: "shipping",
  notes: "Name: Asha",
}, overrides);
const stored = (storage) => JSON.parse(storage.data[KEY]);
const text = (element) => element.textContent;

test("my-orders.js exists and exposes save, list and clear", () => {
  assert.ok(source, "my-orders.js is missing");
  const { api } = makeRuntime();
  assert.equal(typeof api.save, "function");
  assert.equal(typeof api.list, "function");
  assert.equal(typeof api.clear, "function");
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
  assert.doesNotThrow(() => api.clear());
  const none = makeRuntime({ storage: null });
  assert.deepEqual(none.api.list(), []);
  assert.equal(none.api.save(order()), false);
});

test("save rejects a summary with no usable request ID or items", () => {
  const { api, storage } = makeRuntime();
  for (const summary of [null, {}, order({ requestId: "" }), order({ items: [] }), order({ items: [{ name: "", quantity: 1 }] }), order({ fulfillment: "x" }), "text"]) assert.equal(api.save(summary), false);
  assert.equal(storage.data[KEY], undefined);
});

test("clear removes every saved order", () => {
  const { api, storage } = makeRuntime();
  api.save(order());
  api.clear();
  assert.equal(storage.data[KEY], undefined);
  assert.deepEqual(api.list(), []);
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
  assert.equal(elements.get("my-orders-clear-area").hidden, false);
});

test("the empty state shows when nothing is saved and hides the list, contact and clear controls", () => {
  const { link, elements } = makeRuntime();
  link.dispatch("click", { button: 0 });
  assert.equal(elements.get("my-orders-empty").hidden, false);
  assert.equal(elements.get("my-orders-list").children.length, 0);
  assert.equal(elements.get("my-orders-contact").hidden, true);
  assert.equal(elements.get("my-orders-clear-area").hidden, true);
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

test("Remove these from this device asks first, then clears and shows the empty state; Keep them cancels", () => {
  const { api, link, elements, storage } = makeRuntime();
  api.save(order());
  link.dispatch("click", { button: 0 });
  const confirm = elements.get("my-orders-confirm");
  assert.equal(confirm.hidden, true);
  elements.get("my-orders-clear").dispatch("click");
  assert.equal(confirm.hidden, false);
  assert.equal(stored(storage).orders.length, 1, "nothing is removed before the confirm step");
  assert.equal(elements.get("my-orders-confirm-no").focused, true);
  elements.get("my-orders-confirm-no").dispatch("click");
  assert.equal(confirm.hidden, true);
  assert.equal(stored(storage).orders.length, 1);
  assert.equal(elements.get("my-orders-clear").focused, true);
  elements.get("my-orders-clear").dispatch("click");
  elements.get("my-orders-confirm-yes").dispatch("click");
  assert.equal(storage.data[KEY], undefined);
  assert.equal(elements.get("my-orders-list").children.length, 0);
  assert.equal(elements.get("my-orders-empty").hidden, false);
  assert.equal(confirm.hidden, true);
  assert.equal(elements.get("my-orders-close").focused, true, "focus is not lost when the clear controls hide");
});

test("reopening the dialog starts with the confirm step closed and a fresh list", () => {
  const { api, link, dialog, elements } = makeRuntime();
  api.save(order());
  link.dispatch("click", { button: 0 });
  elements.get("my-orders-clear").dispatch("click");
  dialog.close();
  api.save(order({ requestId: "second" }));
  link.dispatch("click", { button: 0 });
  assert.equal(elements.get("my-orders-confirm").hidden, true);
  assert.equal(elements.get("my-orders-list").children.length, 2);
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
  assert.match(dialog, /Orders are saved only in this browser for 30 days\./);
  assert.match(dialog, /id="my-orders-empty"[^>]*hidden[\s\S]*No orders on this device in the last 30 days\.[\s\S]*<a[^>]+href="#catalogue-filters"[^>]+data-browse-all/);
  assert.match(dialog, /<ol[^>]+id="my-orders-list"/);
  assert.match(dialog, /id="my-orders-contact"[\s\S]*href="tel:\+918209238541"[\s\S]*href="https:\/\/wa\.me\/918209238541/);
  assert.match(dialog, /<button[^>]+id="my-orders-clear"[^>]*>Remove these from this device<\/button>/);
  assert.match(dialog, /id="my-orders-confirm"[^>]*hidden[\s\S]*id="my-orders-confirm-yes"[\s\S]*id="my-orders-confirm-no"/);
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
