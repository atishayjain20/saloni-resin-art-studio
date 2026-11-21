const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const css = read("styles.css");
const scriptJs = read("script.js");
const sourcePath = path.join(root, "favourites.js");
const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, "utf8") : "";
const KEY = "saloniFavourites";

// A small fake DOM, in the style of my-orders.test.cjs. favourites.js builds its rows with createElement/textContent, so innerHTML throws.
class FakeElement {
  constructor(tag = "div", id = "") {
    this.tagName = tag.toUpperCase(); this.id = id; this.hidden = false; this.attributes = {}; this.children = []; this.listeners = {};
    this.className = ""; this.focused = false; this.open = false; this._text = ""; this.parentNode = null; this.queryMap = {};
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
  insertBefore(child, ref) { child.parentNode = this; const at = ref ? this.children.indexOf(ref) : -1; if (at === -1) this.children.push(child); else this.children.splice(at, 0, child); return child; }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); return child; }
  get firstChild() { return this.children[0] || null; }
  get nextSibling() { const siblings = this.parentNode ? this.parentNode.children : []; return siblings[siblings.indexOf(this) + 1] || null; }
  querySelector(selector) { return this.queryMap[selector] || null; }
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

const PIECES = [
  { slug: "rose-tray", name: "Rose Tray", price: "₹1,499", sizes: "3 sizes" },
  { slug: "lotus-clock", name: "Lotus Clock", price: "₹899", sizes: "" },
  { slug: "heart-dish", name: "Heart Dish", price: "₹599", sizes: "2 sizes" },
  { slug: "gold-frame", name: "Gold Frame", price: "₹2,099", sizes: "" },
];

function makeRuntime({ storage = createStorage(), dialogSupported = true, noHistory = false, manualFrames = false, cartFull = false, inCart = [], noObserver = false, popupSlug = "" } = {}) {
  const ids = ["favourites-dialog", "favourites-close", "favourites-list", "favourites-empty", "favourites-status", "favourites-header", "favourites-header-count", "favourites-menu-count", "nav-toggle", "catalogue-header-cart", "lightbox-favourite", "art-lightbox"];
  const elements = new Map(ids.map((id) => [id, new FakeElement(id === "favourites-list" ? "ul" : "div", id)]));
  const dialog = elements.get("favourites-dialog");
  const header = elements.get("favourites-header");
  header.hidden = true;
  if (!dialogSupported) dialog.showModal = undefined;
  elements.get("catalogue-header-cart").clicks = 0;
  elements.get("catalogue-header-cart").click = function () { this.clicks += 1; };
  if (popupSlug) elements.get("art-lightbox").attributes["data-product-slug"] = popupSlug;
  const popupHeart = elements.get("lightbox-favourite");
  popupHeart.hidden = true;
  const browseLink = new FakeElement("a"); browseLink.attributes["data-browse-all"] = "";
  dialog.querySelectorAll = (selector) => (selector === "[data-browse-all]" ? [browseLink] : []);
  dialog.querySelector = (selector) => (selector === "[data-browse-all]" ? browseLink : null);
  const menuLink = new FakeElement("a"); menuLink.attributes["data-favourites-open"] = "";
  const cards = PIECES.map((piece) => {
    const figure = new FakeElement("figure");
    const trigger = new FakeElement("a");
    trigger.attributes["data-product-slug"] = piece.slug;
    trigger.attributes["data-thumb"] = "assets/thumb/" + piece.slug + ".jpg";
    trigger.clicks = 0;
    trigger.click = function () { this.clicks += 1; };
    figure.appendChild(trigger);
    figure.appendChild(new FakeElement("figcaption"));
    const card = new FakeElement("article");
    const name = new FakeElement("strong"); name.textContent = "  " + piece.name + " ";
    const price = new FakeElement("dd"); price.textContent = piece.price;
    card.queryMap["figcaption strong, figcaption h3"] = name;
    card.queryMap[".product-pricing dd"] = price;
    if (piece.sizes) { const count = new FakeElement("dd"); count.textContent = piece.sizes; card.queryMap[".product-size-count"] = count; }
    const cart = new FakeElement("button");
    cart.attributes["aria-pressed"] = inCart.includes(piece.slug) ? "true" : "false";
    cart.clicks = 0;
    cart.click = function () { this.clicks += 1; if (!cartFull) this.attributes["aria-pressed"] = "true"; };
    card.queryMap['[data-order-prefill="catalogue"]'] = cart;
    trigger.closest = (selector) => (selector === "article" ? card : null);
    return { piece, figure, trigger, card, cart };
  });
  const triggers = cards.map((entry) => entry.trigger);
  const documentObject = {
    readyState: "complete",
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (ns, tag) => { const node = new FakeElement(tag); node.namespace = ns; return node; },
    querySelectorAll: (selector) => (selector === ".catalogue-grid [data-lightbox-trigger][data-product-slug]" ? triggers : selector === "[data-favourites-open]" ? [menuLink] : []),
    activeElement: null,
  };
  FakeElement.onFocus = (element) => { documentObject.activeElement = element; };
  const history = noHistory ? undefined : {
    state: null, pushed: [], replaced: [], backs: 0,
    pushState(state) { this.state = state; this.pushed.push(state); },
    replaceState(state) { this.state = state; this.replaced.push(state); },
    back() { this.backs += 1; },
  };
  const popstateListeners = [];
  const observers = [];
  const windowObject = { localStorage: storage, document: documentObject, history, location: { href: "https://saloniresinart.com/" }, addEventListener(type, listener) { if (type === "popstate") popstateListeners.push(listener); } };
  if (!noObserver) windowObject.MutationObserver = function (callback) { this.callback = callback; this.observe = (target, options) => { this.target = target; this.options = options; }; observers.push(this); };
  const frames = [];
  windowObject.requestAnimationFrame = (callback) => { if (manualFrames) frames.push(callback); else callback(); return frames.length; };
  const flushFrame = () => { const due = frames.splice(0); due.forEach((callback) => callback()); return due.length; };
  const popstate = (state) => { if (history) history.state = state; popstateListeners.forEach((listener) => listener({ state })); };
  const context = { console, document: documentObject, window: windowObject, JSON, Math, Number, String, Array, Object, RegExp, MutationObserver: windowObject.MutationObserver };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "favourites.js" });
  // The product popup names its piece through this attribute (script.js openLightbox); the observer is how favourites.js hears about it.
  const showInPopup = (slug) => { elements.get("art-lightbox").setAttribute("data-product-slug", slug); observers.forEach((observer) => observer.callback([{ type: "attributes", attributeName: "data-product-slug" }])); };
  return { storage, elements, dialog, header, popupHeart, browseLink, menuLink, cards, documentObject, windowObject, history, popstate, flushFrame, observers, showInPopup, lightbox: elements.get("art-lightbox") };
}

const stored = (storage) => JSON.parse(storage.data[KEY]);
const text = (element) => element.textContent.replace(/\s+/g, " ").trim();
const byClass = (root, name) => root.find((element) => element.className.split(" ").includes(name));
const button = (root, label) => root.find((element) => element.tagName === "BUTTON" && text(element) === label)[0] || null;
const hearts = (runtime) => runtime.cards.map((entry) => entry.trigger.nextSibling);
const rows = (runtime) => runtime.elements.get("favourites-list").children;
const rowName = (row) => text(byClass(row, "my-order-item-name")[0]);
const stateOf = (record) => ({ version: 1, slugs: record });
const withSaved = (slugs, options = {}) => makeRuntime(Object.assign({ storage: createStorage({ [KEY]: JSON.stringify(stateOf(slugs)) }) }, options));
const openFromHeader = (runtime) => runtime.header.dispatch("click", { button: 0 });

test("favourites.js exists, is an ES5 script, uses no analytics call and never writes HTML from strings", () => {
  assert.ok(source, "favourites.js is missing");
  assert.doesNotMatch(source, /\btrack\s*\(/);
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|\blet\b|\bconst\b|=>/);
});

test("home page wiring: script after my-orders.js, header button before the cart, sixth menu link, dialog and popup heart", () => {
  assert.match(html, /<script class="my-orders-script" src="my-orders\.js\?v=\d+" defer><\/script>\s*<script class="favourites-script" src="favourites\.js\?v=\d+" defer><\/script>/);
  const header = html.match(/<button class="catalogue-control-toggle catalogue-header-favourites" id="favourites-header"[^>]*>[\s\S]*?<\/button>/);
  assert.ok(header, "header button");
  assert.match(header[0], /aria-haspopup="dialog"/);
  assert.match(header[0], /aria-label="My favourites"/);
  assert.match(header[0], / hidden>/);
  assert.match(header[0], /<span class="catalogue-header-cart-count" id="favourites-header-count" aria-hidden="true"><\/span>/);
  assert.ok(html.indexOf('id="favourites-header"') < html.indexOf('id="catalogue-header-cart"'));
  const nav = html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)[0];
  assert.equal(nav.match(/<a /g).length, 6);
  assert.match(nav, /data-my-orders-open>My orders[\s\S]*?<\/a>\s*<a href="#favourites-dialog" data-favourites-open>My favourites <span class="favourites-count" id="favourites-menu-count"><\/span> <svg class="category-icon" aria-hidden="true" focusable="false"><use href="assets\/category-icons\.svg#heart"><\/use><\/svg><\/a>\s*<\/nav>$/);
  const dialog = html.match(/<dialog class="my-orders-dialog" id="favourites-dialog" aria-labelledby="favourites-title">[\s\S]*?<\/dialog>/);
  assert.ok(dialog, "dialog");
  assert.match(dialog[0], /id="favourites-close" type="submit" aria-label="Close my favourites"/);
  assert.match(dialog[0], /<h2 class="my-orders-title" id="favourites-title">My favourites<\/h2>/);
  assert.match(dialog[0], /id="favourites-empty" hidden>\s*<p>Tap the heart on any piece to save it here\.<\/p>\s*<a class="button button-dark" href="#catalogue-filters" data-browse-all>/);
  assert.match(dialog[0], /<ul class="my-orders-list" id="favourites-list"><\/ul>/);
  assert.match(dialog[0], /class="sr-only" id="favourites-status" role="status"/);
  const summary = html.match(/<div class="lightbox-order-summary">[\s\S]*?<div class="lightbox-share"/)[0];
  assert.match(summary, /<button class="favourite-toggle lightbox-favourite" id="lightbox-favourite" type="button" aria-pressed="false" hidden>/);
  assert.equal((html.match(/favourites\.js/g) || []).length, 1);
  for (const page of ["corporate-gifting/index.html", "partners/index.html", "reviews/index.html", "p/rose-hexagon/index.html"]) assert.doesNotMatch(read(page), /favourites\.js/, page);
});

test("script.js tells the popup which piece it shows, with one attribute line in openLightbox", () => {
  const start = scriptJs.indexOf("function openLightbox(");
  const open = scriptJs.slice(start, scriptJs.indexOf("lightboxTriggers.forEach(function (trigger) {", start));
  assert.match(open, /var slug = slugOf\(targetTrigger \|\| trigger\);\s*lightbox\.setAttribute\("data-product-slug", slug\);/);
});

test("styles: heart is a 44px target on the photo corner, filled when saved, header badge shared, phones 352px and narrower hide the header button (360px Android keeps it)", () => {
  assert.match(css, /:is\(\.work-card, \.romantic-keepsake-card\) > figure \{[^}]*position: relative/);
  const toggle = css.match(/\.favourite-toggle \{([^}]*)\}/);
  assert.ok(toggle, ".favourite-toggle rule");
  assert.match(toggle[1], /position: absolute/);
  assert.match(toggle[1], /width: 44px/);
  assert.match(toggle[1], /height: 44px/);
  assert.match(toggle[1], /z-index: 2/);
  assert.match(css, /\.favourites-count:not\(:empty\) \{ margin-inline-start: \.3rem; \}/, "the menu link is a flex row, so the count needs its own gap");
  assert.match(css, /\.favourite-toggle\[aria-pressed="true"\] \.favourite-icon \{[^}]*fill: currentColor/);
  assert.match(css, /\.favourite-toggle:focus-visible \{[^}]*outline: 3px solid var\(--rose\)/);
  assert.match(css, /\.catalogue-header-favourites \.catalogue-header-cart-count|\.catalogue-header-cart, \.catalogue-header-favourites/);
  assert.match(css, /@media \(max-width: 352px\) \{[^@]*\.catalogue-header-favourites \{ display: none; \}/);
});

test("storage: a bad record (not JSON, wrong version, too long, wrong shape) is dropped and the page still works", () => {
  const bad = ["not json", "null", "[]", JSON.stringify({ version: 2, slugs: ["rose-tray"] }), JSON.stringify({ version: 1, slugs: "rose-tray" }), JSON.stringify({ version: 1, slugs: ["rose-tray"], pad: "x".repeat(10001) })];
  for (const raw of bad) {
    const storage = createStorage({ [KEY]: raw });
    const runtime = makeRuntime({ storage });
    assert.equal(storage.data[KEY], undefined, raw.slice(0, 30));
    assert.equal(runtime.header.hidden, true);
    hearts(runtime)[0].dispatch("click", { button: 0 });
    assert.deepEqual(stored(storage).slugs, ["rose-tray"]);
  }
});

test("storage: only well-formed, unique slugs of pieces on the page are counted; unknown ones are dropped on the next save", () => {
  const runtime = withSaved(["rose-tray", "Bad Slug!", "rose-tray", "gone-piece", "x".repeat(81), 7, "lotus-clock"]);
  assert.equal(runtime.header.getAttribute("aria-label"), "My favourites, 2 items");
  assert.equal(text(runtime.elements.get("favourites-header-count")), "2");
  assert.deepEqual(hearts(runtime).map((heart) => heart.getAttribute("aria-pressed")), ["true", "true", "false", "false"]);
  hearts(runtime)[2].dispatch("click", { button: 0 });
  assert.deepEqual(stored(runtime.storage).slugs, ["heart-dish", "rose-tray", "lotus-clock"]);
});

test("storage: only the first 200 slugs are read", () => {
  const many = []; for (let index = 0; index < 250; index += 1) many.push("piece-" + index);
  assert.equal(withSaved(many.concat(["rose-tray"])).header.hidden, true, "the 251st is past the limit");
  assert.equal(withSaved(["rose-tray"].concat(many)).header.hidden, false);
});

test("saving puts the newest first, removing the last one deletes the stored record", () => {
  const runtime = makeRuntime();
  hearts(runtime)[0].dispatch("click", { button: 0 });
  hearts(runtime)[1].dispatch("click", { button: 0 });
  assert.deepEqual(stored(runtime.storage), { version: 1, slugs: ["lotus-clock", "rose-tray"] });
  hearts(runtime)[0].dispatch("click", { button: 0 });
  hearts(runtime)[1].dispatch("click", { button: 0 });
  assert.equal(runtime.storage.data[KEY], undefined);
});

test("blocked or missing storage never throws and the hearts still work for this visit", () => {
  const denied = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } };
  for (const storage of [denied, null]) {
    const runtime = makeRuntime({ storage });
    hearts(runtime)[0].dispatch("click", { button: 0 });
    assert.equal(hearts(runtime)[0].getAttribute("aria-pressed"), "true");
    assert.equal(runtime.header.hidden, false);
    openFromHeader(runtime);
    assert.equal(rows(runtime).length, 1);
  }
});

test("each card heart is a button right after the photo link, inside the figure, with a name and a pressed state", () => {
  const runtime = withSaved(["lotus-clock"]);
  runtime.cards.forEach((entry, index) => {
    const heart = entry.figure.children[1];
    assert.equal(entry.figure.children[0], entry.trigger, "the link stays first");
    assert.equal(heart.tagName, "BUTTON");
    assert.equal(heart, entry.trigger.nextSibling);
    assert.equal(heart.parentNode, entry.figure);
    assert.equal(entry.figure.children[2].tagName, "FIGCAPTION");
    assert.equal(heart.getAttribute("type"), "button");
    assert.equal(heart.className, "favourite-toggle");
    const saved = index === 1;
    assert.equal(heart.getAttribute("aria-pressed"), String(saved));
    assert.equal(heart.getAttribute("aria-label"), (saved ? "Remove " : "Save ") + entry.piece.name + (saved ? " from favourites" : " to favourites"));
    const svg = heart.children[0];
    assert.equal(svg.tagName, "SVG");
    assert.equal(svg.getAttribute("aria-hidden"), "true");
    assert.equal(svg.getAttribute("focusable"), "false");
  });
});

test("tapping a heart toggles it, updates the label and does not open the product popup", () => {
  const runtime = makeRuntime();
  const [entry] = runtime.cards;
  const heart = entry.trigger.nextSibling;
  let popped = false;
  entry.card.listeners.click = [() => { popped = true; }];
  const click = heart.dispatch("click", { button: 0 });
  assert.equal(heart.getAttribute("aria-pressed"), "true");
  assert.equal(heart.getAttribute("aria-label"), "Remove Rose Tray from favourites");
  assert.equal(entry.trigger.clicks, 0);
  assert.equal(click.defaultPrevented, false);
  assert.equal(popped, false, "the heart is not inside the link, and script.js ignores button clicks on the card");
  heart.dispatch("click", { button: 0 });
  assert.equal(heart.getAttribute("aria-pressed"), "false");
  assert.equal(heart.getAttribute("aria-label"), "Save Rose Tray to favourites");
});

test("header button and menu count: hidden at zero, label and badge carry the count, singular for one", () => {
  const runtime = makeRuntime();
  const count = runtime.elements.get("favourites-header-count");
  const menuCount = runtime.elements.get("favourites-menu-count");
  assert.equal(runtime.header.hidden, true);
  assert.equal(text(menuCount), "");
  hearts(runtime)[0].dispatch("click", { button: 0 });
  assert.equal(runtime.header.hidden, false);
  assert.equal(runtime.header.getAttribute("aria-label"), "My favourites, 1 item");
  assert.equal(text(count), "1");
  assert.equal(text(menuCount), "(1)");
  hearts(runtime)[1].dispatch("click", { button: 0 });
  hearts(runtime)[2].dispatch("click", { button: 0 });
  assert.equal(runtime.header.getAttribute("aria-label"), "My favourites, 3 items");
  assert.equal(text(count), "3");
  assert.equal(text(menuCount), "(3)");
  ["rose-tray", "lotus-clock", "heart-dish"].forEach((slug, index) => hearts(runtime)[index].dispatch("click", { button: 0 }));
  assert.equal(runtime.header.hidden, true);
  assert.equal(runtime.header.getAttribute("aria-label"), "My favourites");
  assert.equal(text(count), "");
});

test("favourites survive a reload", () => {
  const first = makeRuntime();
  hearts(first)[2].dispatch("click", { button: 0 });
  hearts(first)[0].dispatch("click", { button: 0 });
  const second = makeRuntime({ storage: first.storage });
  assert.deepEqual(hearts(second).map((heart) => heart.getAttribute("aria-pressed")), ["true", "false", "true", "false"]);
  assert.equal(second.header.getAttribute("aria-label"), "My favourites, 2 items");
});

test("opening from the header lists the newest first with photo, name, price and size count, and focuses the close button", () => {
  const runtime = makeRuntime();
  hearts(runtime)[0].dispatch("click", { button: 0 });
  hearts(runtime)[1].dispatch("click", { button: 0 });
  openFromHeader(runtime);
  assert.equal(runtime.dialog.open, true);
  assert.equal(runtime.elements.get("favourites-close").focused, true);
  assert.deepEqual(rows(runtime).map(rowName), ["Lotus Clock", "Rose Tray"]);
  assert.equal(runtime.elements.get("favourites-empty").hidden, true);
  assert.equal(runtime.elements.get("favourites-list").hidden, false);
  const second = rows(runtime)[1];
  assert.match(text(second), /Rose Tray ₹1,499 · 3 sizes/);
  assert.equal(text(byClass(rows(runtime)[0], "my-order-item-detail")[0]), "₹899", "no size count, no separator");
  const image = second.find((element) => element.tagName === "IMG")[0];
  assert.equal(image.getAttribute("src"), "assets/thumb/rose-tray.jpg");
  assert.equal(image.getAttribute("alt"), "");
  assert.equal(byClass(second, "favourite-open")[0].tagName, "BUTTON");
});

test("with nothing saved the dialog shows the empty message and the Browse link", () => {
  const runtime = makeRuntime();
  openFromHeader(runtime);
  assert.equal(runtime.elements.get("favourites-empty").hidden, false);
  assert.equal(runtime.elements.get("favourites-list").hidden, true);
  assert.equal(rows(runtime).length, 0);
});

test("the menu link opens it after two frames and keeps the page from jumping to the anchor", () => {
  const runtime = makeRuntime({ manualFrames: true });
  const click = runtime.menuLink.dispatch("click", { button: 0 });
  assert.equal(click.defaultPrevented, true);
  assert.equal(runtime.dialog.open, false);
  runtime.flushFrame();
  assert.equal(runtime.dialog.open, false);
  runtime.flushFrame();
  assert.equal(runtime.dialog.open, true);
  const modified = runtime.menuLink.dispatch("click", { button: 0, ctrlKey: true });
  assert.equal(modified.defaultPrevented, false);
});

test("Add to cart presses the card's cart button once, then offers View cart, which closes the dialog and opens the cart", () => {
  const runtime = withSaved(["rose-tray"]);
  openFromHeader(runtime);
  const add = button(rows(runtime)[0], "Add to cart");
  assert.ok(add);
  assert.equal(add.getAttribute("aria-label"), "Add Rose Tray to cart");
  add.dispatch("click", { button: 0 });
  assert.equal(runtime.cards[0].cart.clicks, 1);
  assert.equal(text(add), "View cart");
  assert.equal(add.getAttribute("aria-label"), "View cart");
  add.dispatch("click", { button: 0 });
  assert.equal(runtime.cards[0].cart.clicks, 1, "a piece already in the cart is never pressed again (that would remove it)");
  assert.equal(runtime.dialog.open, false);
  assert.equal(runtime.elements.get("catalogue-header-cart").clicks, 1);
});

test("a piece already in the cart shows View cart at once, and a full cart says so without a false View cart", () => {
  const inCart = withSaved(["rose-tray"], { inCart: ["rose-tray"] });
  openFromHeader(inCart);
  assert.ok(button(rows(inCart)[0], "View cart"));
  assert.equal(button(rows(inCart)[0], "Add to cart"), null);
  const full = withSaved(["rose-tray"], { cartFull: true });
  openFromHeader(full);
  const add = button(rows(full)[0], "Add to cart");
  add.dispatch("click", { button: 0 });
  assert.equal(full.cards[0].cart.clicks, 1);
  assert.equal(text(add), "Add to cart");
  const note = byClass(rows(full)[0], "my-order-note")[0];
  assert.equal(note.hidden, false);
  assert.equal(text(note), "Your cart is full. Remove an item first.");
  assert.equal(full.dialog.open, true);
});

test("Remove takes the piece off the list and its card heart, and says so; focus goes to the next row, then the previous, then Browse", () => {
  const runtime = withSaved(["rose-tray", "lotus-clock", "heart-dish"]);
  openFromHeader(runtime);
  assert.deepEqual(rows(runtime).map(rowName), ["Rose Tray", "Lotus Clock", "Heart Dish"]);
  button(rows(runtime)[1], "Remove").dispatch("click", { button: 0 });
  assert.deepEqual(rows(runtime).map(rowName), ["Rose Tray", "Heart Dish"]);
  assert.equal(hearts(runtime)[1].getAttribute("aria-pressed"), "false");
  assert.deepEqual(stored(runtime.storage).slugs, ["rose-tray", "heart-dish"]);
  assert.equal(text(runtime.elements.get("favourites-status")), "Removed Lotus Clock from favourites.");
  assert.equal(byClass(rows(runtime)[1], "favourite-open")[0].focused, true, "next row");
  button(rows(runtime)[1], "Remove").dispatch("click", { button: 0 });
  assert.equal(byClass(rows(runtime)[0], "favourite-open")[0].focused, true, "previous row, because it was last");
  button(rows(runtime)[0], "Remove").dispatch("click", { button: 0 });
  assert.equal(runtime.browseLink.focused, true);
  assert.equal(runtime.elements.get("favourites-empty").hidden, false);
  assert.equal(runtime.header.hidden, true);
  assert.equal(runtime.dialog.open, true);
  assert.equal(runtime.storage.data[KEY], undefined);
});

test("tapping a row closes the dialog without a Back step and presses the card's photo link, so the popup opens", () => {
  const runtime = withSaved(["heart-dish"]);
  openFromHeader(runtime);
  assert.equal(runtime.history.pushed.length, 1);
  byClass(rows(runtime)[0], "favourite-open")[0].dispatch("click", { button: 0 });
  assert.equal(runtime.dialog.open, false);
  assert.equal(runtime.cards[2].trigger.clicks, 1);
  assert.equal(runtime.history.backs, 0, "our history entry is forgotten in place");
  assert.equal(runtime.history.state.saloniFavourites, undefined);
  assert.equal(runtime.elements.get("nav-toggle").focused, false, "the product popup keeps focus");
});

test("opening adds one history entry; closing any other way steps it back; the Back button closes the dialog", () => {
  const runtime = withSaved(["rose-tray"]);
  openFromHeader(runtime);
  assert.equal(runtime.history.pushed.length, 1);
  assert.equal(runtime.history.pushed[0].saloniFavourites, true);
  runtime.elements.get("favourites-close").dispatch("click", {});
  runtime.dialog.close();
  assert.equal(runtime.history.backs, 1);
  runtime.popstate(null);
  openFromHeader(runtime);
  runtime.popstate({});
  assert.equal(runtime.dialog.open, false);
  assert.equal(runtime.history.backs, 1, "Back already took the entry");
});

test("closing returns focus to the opener, or to the menu button when the opener is hidden; the backdrop closes it", () => {
  const runtime = withSaved(["rose-tray"]);
  openFromHeader(runtime);
  runtime.dialog.dispatch("click", { target: runtime.dialog });
  assert.equal(runtime.dialog.open, false);
  assert.equal(runtime.header.focused, true);
  runtime.header.focused = false;
  runtime.popstate(null);
  runtime.menuLink.hiddenLayout = true;
  runtime.menuLink.dispatch("click", { button: 0 });
  assert.equal(runtime.dialog.open, true);
  runtime.dialog.close();
  assert.equal(runtime.elements.get("nav-toggle").focused, true);
});

test("the Browse gifts link closes the dialog without stealing focus or leaving a history entry", () => {
  const runtime = withSaved(["rose-tray"]);
  openFromHeader(runtime);
  runtime.browseLink.listeners.click.forEach((listener) => listener({}));
  assert.equal(runtime.dialog.open, false);
  assert.equal(runtime.history.backs, 0);
  assert.equal(runtime.elements.get("nav-toggle").focused, false);
});

test("the popup heart follows the piece on show, toggles it, and keeps the card heart in step", () => {
  const runtime = withSaved(["lotus-clock"]);
  assert.equal(runtime.observers.length, 1);
  assert.equal(runtime.observers[0].target, runtime.lightbox);
  assert.deepEqual(Array.from(runtime.observers[0].options.attributeFilter), ["data-product-slug"]);
  assert.equal(runtime.popupHeart.hidden, true);
  runtime.showInPopup("rose-tray");
  assert.equal(runtime.popupHeart.hidden, false);
  assert.equal(runtime.popupHeart.getAttribute("aria-pressed"), "false");
  assert.equal(runtime.popupHeart.getAttribute("aria-label"), "Save Rose Tray to favourites");
  runtime.popupHeart.dispatch("click", { button: 0 });
  assert.equal(runtime.popupHeart.getAttribute("aria-pressed"), "true");
  assert.equal(runtime.popupHeart.getAttribute("aria-label"), "Remove Rose Tray from favourites");
  assert.equal(hearts(runtime)[0].getAttribute("aria-pressed"), "true");
  assert.deepEqual(stored(runtime.storage).slugs, ["rose-tray", "lotus-clock"]);
  hearts(runtime)[0].dispatch("click", { button: 0 });
  assert.equal(runtime.popupHeart.getAttribute("aria-pressed"), "false", "a card heart changes the popup heart too");
  runtime.showInPopup("lotus-clock");
  assert.equal(runtime.popupHeart.getAttribute("aria-pressed"), "true");
  runtime.showInPopup("");
  assert.equal(runtime.popupHeart.hidden, true);
  runtime.showInPopup("not-on-this-page");
  assert.equal(runtime.popupHeart.hidden, true);
});

test("a popup already showing a piece when the script starts is picked up, and no MutationObserver is not an error", () => {
  const early = makeRuntime({ popupSlug: "heart-dish" });
  assert.equal(early.popupHeart.hidden, false);
  assert.equal(early.popupHeart.getAttribute("aria-label"), "Save Heart Dish to favourites");
  const none = makeRuntime({ noObserver: true });
  assert.equal(none.observers.length, 0);
  assert.equal(none.popupHeart.hidden, true);
  hearts(none)[0].dispatch("click", { button: 0 });
  assert.equal(none.header.hidden, false);
});

test("without dialog support or history the hearts and the count still work", () => {
  const runtime = makeRuntime({ dialogSupported: false, noHistory: true });
  hearts(runtime)[0].dispatch("click", { button: 0 });
  assert.equal(runtime.header.getAttribute("aria-label"), "My favourites, 1 item");
  openFromHeader(runtime);
  assert.equal(runtime.dialog.open, false);
  const withoutHistory = makeRuntime({ noHistory: true });
  hearts(withoutHistory)[0].dispatch("click", { button: 0 });
  openFromHeader(withoutHistory);
  assert.equal(withoutHistory.dialog.open, true);
});
