const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
// Shared helpers live before the page wiring, so a harness can run them on their own.
const helpers = script.slice(script.indexOf("  function aiImageNames("), script.indexOf('  document.documentElement.classList.add("js");'));
const lightboxStart = script.indexOf('    var lightbox = document.getElementById("art-lightbox")');
const lightboxEnd = script.indexOf("\n\n    initCatalogueExperience();", lightboxStart);
const lightboxBlock = script.slice(lightboxStart, lightboxEnd);

const SITE = "https://saloniresinart.com";

test("share helpers build the product page URL and an encoded WhatsApp message", () => {
  const api = vm.runInNewContext(`(function () { ${helpers}\nreturn { productShareUrl, sharePrice, whatsappShareUrl }; })()`, {});
  assert.equal(api.productShareUrl("jewel-glow-tealight"), `${SITE}/p/jewel-glow-tealight/`);
  assert.equal(api.sharePrice("Price: ₹250–₹400"), "₹250–₹400");
  assert.equal(api.sharePrice(null), "");
  const url = api.whatsappShareUrl("Mr & Mrs Name Plate", "Price: ₹1,799", `${SITE}/p/mr-and-mrs-name-plate/`);
  assert.match(url, /^https:\/\/wa\.me\/\?text=[^ &]+$/, "one encoded text parameter, no raw spaces or ampersands");
  assert.equal(decodeURIComponent(url.split("text=")[1]), `Mr & Mrs Name Plate – ₹1,799 – ${SITE}/p/mr-and-mrs-name-plate/`);
  assert.equal(decodeURIComponent(api.whatsappShareUrl("Rose Tray", "", `${SITE}/p/rose-tray/`).split("text=")[1]), `Rose Tray – ${SITE}/p/rose-tray/`, "no price, no dangling dash");
});

function harness({ search = "", hash = "", share, clipboard, withShare = true, slugs = { "jewel-glow-tealight": "Jewel Glow Tealight", "mr-and-mrs-name-plate": "Mr & Mrs Name Plate" }, noSlugAttribute = false, noLocation = false } = {}) {
  const make = (extra = {}) => Object.assign({
    hidden: false, textContent: "", attributes: {}, listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    focus() { this.focused = true; },
  }, extra);
  const triggers = Object.entries(slugs).map(([slug, name], index) => {
    const rows = [["Price", index ? "₹1,799" : "₹249"], ["Size", "8 in"]].map(([label, value]) => make({ querySelector: (selector) => (selector === "dt" ? { textContent: label } : selector === "dd" ? { textContent: value } : null) }));
    const card = make({
      querySelector: (selector) => (selector === "figcaption strong" ? { textContent: name } : null),
      querySelectorAll: (selector) => (selector === ".product-pricing > div" ? rows : selector === "figcaption p" ? [{ textContent: "A short line." }] : []),
    });
    return make({
      href: `assets/${slug}.jpg`,
      attributes: noSlugAttribute ? {} : { "data-product-slug": slug },
      querySelector: (selector) => (selector === "img" ? { alt: name + " photo" } : null),
      closest: (selector) => (selector === "article" ? card : null),
    });
  });
  const names = ["lightbox-share", "lightbox-share-button", "lightbox-share-options", "lightbox-share-whatsapp", "lightbox-share-copy", "lightbox-share-status"];
  const elements = {};
  names.forEach((id) => { elements[id] = make(); });
  elements["lightbox-share"].hidden = true;
  elements["lightbox-share-options"].hidden = true;
  const image = make();
  const pushes = [];
  const lightbox = make({ showModal() { this.open = true; }, close() { this.open = false; this.listeners.close(); } });
  Object.assign(elements, {
    "art-lightbox": lightbox, "lightbox-image": image, "lightbox-caption": make(),
    "lightbox-product-name": make(), "lightbox-product-price": make(), "lightbox-product-size": make(), "lightbox-image-description": make(), "lightbox-request": make(),
  });
  const calls = { share: [], clipboard: [] };
  const navigator = {};
  if (withShare) navigator.share = (data) => { calls.share.push(data); return share ? share() : Promise.resolve(); };
  if (clipboard) navigator.clipboard = { writeText: (text) => { calls.clipboard.push(text); return clipboard(); } };
  const order = [];
  const replaces = [];
  const windowObject = { navigator, history: { state: null, pushState(state, title, url) { order.push("push"); pushes.push(url); this.state = state; }, replaceState(state, title, url) { order.push("replace"); replaces.push(url); } }, setTimeout(callback) { callback(); } };
  if (!noLocation) windowObject.location = { search, hash, href: "https://saloniresinart.com/" + search + hash };
  const documentObject = {
    getElementById: (id) => elements[id] || null,
    querySelectorAll: (selector) => (selector === "[data-lightbox-trigger]" ? triggers : []),
  };
  const result = vm.runInNewContext(`(function () { ${helpers}${lightboxBlock}\n return { openSharedProduct: typeof openSharedProduct === "function" ? openSharedProduct : null }; })()`, { document: documentObject, window: windowObject, URLSearchParams, URL });
  return { elements, triggers, lightbox, image, pushes, replaces, order, calls, windowObject, openSharedProduct: result.openSharedProduct };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("?product=<slug> opens that product's own popup", () => {
  const first = harness({ search: "?product=mr-and-mrs-name-plate" });
  assert.equal(typeof first.openSharedProduct, "function");
  assert.equal(first.lightbox.open, undefined, "nothing opens until the catalogue has been set up");
  first.openSharedProduct();
  assert.equal(first.lightbox.open, true);
  assert.equal(first.elements["lightbox-product-name"].textContent, "Mr & Mrs Name Plate");
  assert.equal(first.elements["lightbox-product-price"].textContent, "Price: ₹1,799");
  assert.equal(first.image.src, "assets/mr-and-mrs-name-plate.jpg");
  assert.equal(first.pushes.length, 1, "the popup takes one history step, so Back closes it");
  assert.equal(first.windowObject.history.scrollRestoration, "manual", "Back keeps the page where the link scrolled it");
  const second = harness({ search: "?ref=ABC&product=jewel-glow-tealight" });
  second.openSharedProduct();
  assert.equal(second.elements["lightbox-product-name"].textContent, "Jewel Glow Tealight");
});

test("opening a shared product takes ?product= out of the address (keeping the hash and other params) before the popup's own history step", () => {
  const page = harness({ search: "?ref=ABC&product=jewel-glow-tealight&x=1", hash: "#diwali" });
  page.openSharedProduct();
  assert.deepEqual(page.replaces, ["/?ref=ABC&x=1#diwali"]);
  assert.deepEqual(page.order, ["replace", "push"], "the base entry is cleaned first, so Back from the popup lands on the clean address and stays on the site");
  const alone = harness({ search: "?product=mr-and-mrs-name-plate", hash: "#marriage-gifts" });
  alone.openSharedProduct();
  assert.deepEqual(alone.replaces, ["/#marriage-gifts"]);
});

test("the shared slug is read when the page loads, so the catalogue tidying the address first does not lose it", () => {
  const page = harness({ search: "?product=jewel-glow-tealight" });
  page.windowObject.location.search = "";
  page.openSharedProduct();
  assert.equal(page.lightbox.open, true);
  assert.equal(page.elements["lightbox-product-name"].textContent, "Jewel Glow Tealight");
});

test("an unknown, empty or missing product leaves the home page as it is", () => {
  for (const search of ["?product=no-such-gift", "?product=", "?product=JEWEL-GLOW-TEALIGHT", "?type=diwali", "", "?product=__proto__"]) {
    const page = harness({ search });
    assert.doesNotThrow(() => page.openSharedProduct(), search);
    assert.notEqual(page.lightbox.open, true, search);
    assert.equal(page.pushes.length, 0, search);
    assert.equal(page.replaces.length, 0, search + " leaves the address alone");
    assert.equal(page.windowObject.history.scrollRestoration, undefined, "a normal page keeps the browser's own scroll restoring");
  }
  const noLocation = harness({ noLocation: true });
  assert.doesNotThrow(() => noLocation.openSharedProduct());
  assert.notEqual(noLocation.lightbox.open, true);
});

test("script.js opens the shared product last, after the catalogue and the cards' Add to cart buttons are set up", () => {
  assert.match(script, /initOrderRequestFlow\(\);\n(?:    \/\/[^\n]*\n)?    if \(openSharedProduct\) openSharedProduct\(\);\n  \}/);
  assert.ok(script.indexOf("initCatalogueExperience();") < script.indexOf("if (openSharedProduct) openSharedProduct();"));
  assert.match(script, /var openSharedProduct = null;/);
});

test("the popup's Share button uses the phone's own share sheet when there is one", async () => {
  const page = harness({ search: "?product=jewel-glow-tealight" });
  page.openSharedProduct();
  assert.equal(page.elements["lightbox-share"].hidden, false);
  assert.equal(page.elements["lightbox-share-button"].attributes["aria-expanded"], "false");
  page.elements["lightbox-share-button"].listeners.click();
  assert.deepEqual(JSON.parse(JSON.stringify(page.calls.share)), [{ title: "Jewel Glow Tealight", text: "Jewel Glow Tealight – ₹249", url: `${SITE}/p/jewel-glow-tealight/` }]);
  await settle();
  assert.equal(page.elements["lightbox-share-options"].hidden, true, "no extra options beside the share sheet");
});

test("closing the share sheet is not an error, but a failed share offers the options", async () => {
  const cancelled = harness({ search: "?product=jewel-glow-tealight", share: () => Promise.reject(Object.assign(new Error("closed"), { name: "AbortError" })) });
  cancelled.openSharedProduct();
  cancelled.elements["lightbox-share-button"].listeners.click();
  await settle();
  assert.equal(cancelled.elements["lightbox-share-options"].hidden, true);
  const failed = harness({ search: "?product=jewel-glow-tealight", share: () => Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" })) });
  failed.openSharedProduct();
  failed.elements["lightbox-share-button"].listeners.click();
  await settle();
  assert.equal(failed.elements["lightbox-share-options"].hidden, false);
});

test("without a share sheet, Share shows Share on WhatsApp and Copy link, and Copy link says Link copied", async () => {
  const page = harness({ search: "?product=mr-and-mrs-name-plate", withShare: false, clipboard: () => Promise.resolve() });
  page.openSharedProduct();
  const { elements } = page;
  assert.equal(elements["lightbox-share-options"].hidden, true);
  elements["lightbox-share-button"].listeners.click();
  assert.equal(elements["lightbox-share-options"].hidden, false);
  assert.equal(elements["lightbox-share-button"].attributes["aria-expanded"], "true");
  assert.equal(elements["lightbox-share-whatsapp"].href, "https://wa.me/?text=" + encodeURIComponent(`Mr & Mrs Name Plate – ₹1,799 – ${SITE}/p/mr-and-mrs-name-plate/`));
  elements["lightbox-share-copy"].listeners.click();
  assert.deepEqual(JSON.parse(JSON.stringify(page.calls.clipboard)), [`${SITE}/p/mr-and-mrs-name-plate/`]);
  await settle();
  assert.equal(elements["lightbox-share-status"].textContent, "Link copied");
  elements["lightbox-share-button"].listeners.click();
  assert.equal(elements["lightbox-share-options"].hidden, true);
  assert.equal(elements["lightbox-share-button"].attributes["aria-expanded"], "false");
});

test("if the link cannot be copied the popup shows the link instead of claiming success", async () => {
  const blocked = harness({ search: "?product=jewel-glow-tealight", withShare: false, clipboard: () => Promise.reject(new Error("denied")) });
  blocked.openSharedProduct();
  blocked.elements["lightbox-share-button"].listeners.click();
  blocked.elements["lightbox-share-copy"].listeners.click();
  await settle();
  assert.equal(blocked.elements["lightbox-share-status"].textContent, `Could not copy. The link is ${SITE}/p/jewel-glow-tealight/`);
  const none = harness({ search: "?product=jewel-glow-tealight", withShare: false });
  none.openSharedProduct();
  none.elements["lightbox-share-button"].listeners.click();
  none.elements["lightbox-share-copy"].listeners.click();
  assert.equal(none.elements["lightbox-share-status"].textContent, `Could not copy. The link is ${SITE}/p/jewel-glow-tealight/`);
});

test("opening another product resets the share options and points them at that product", () => {
  const page = harness({ search: "?product=jewel-glow-tealight", withShare: false, clipboard: () => Promise.resolve() });
  page.openSharedProduct();
  page.elements["lightbox-share-button"].listeners.click();
  assert.equal(page.elements["lightbox-share-options"].hidden, false);
  page.lightbox.close();
  page.triggers[1].listeners.click({ defaultPrevented: false, button: 0, preventDefault() {} });
  assert.equal(page.elements["lightbox-share-options"].hidden, true);
  assert.equal(page.elements["lightbox-share-status"].textContent, "");
  assert.match(decodeURIComponent(page.elements["lightbox-share-whatsapp"].href), /Mr & Mrs Name Plate – ₹1,799 – .*\/p\/mr-and-mrs-name-plate\/$/);
});

test("a card without a share page offers no Share button", () => {
  const page = harness({ noSlugAttribute: true });
  page.triggers[0].listeners.click({ defaultPrevented: false, button: 0, preventDefault() {} });
  assert.equal(page.lightbox.open, true);
  assert.equal(page.elements["lightbox-share"].hidden, true);
});

test("the popup markup has an accessible Share button, the two options and a polite status", () => {
  const dialog = html.match(/<dialog class="lightbox-dialog"[\s\S]*?<\/dialog>/)[0];
  assert.match(dialog, /<div class="lightbox-share" id="lightbox-share" hidden>/);
  assert.match(dialog, /<button class="button button-line lightbox-share-button" id="lightbox-share-button" type="button" aria-expanded="false" aria-controls="lightbox-share-options">Share<\/button>/);
  assert.match(dialog, /<div class="lightbox-share-options" id="lightbox-share-options" hidden>/);
  assert.match(dialog, /<a class="button button-whatsapp" id="lightbox-share-whatsapp" href="https:\/\/wa\.me\/" target="_blank" rel="noopener">Share on WhatsApp<\/a>/);
  assert.match(dialog, /<button class="button button-line" id="lightbox-share-copy" type="button">Copy link<\/button>/);
  assert.match(dialog, /<p class="lightbox-share-status" id="lightbox-share-status" role="status" aria-live="polite"><\/p>/);
  assert.ok(dialog.indexOf('id="lightbox-request"') < dialog.indexOf('id="lightbox-share"'), "Share sits after the existing action");
  assert.match(css, /\.lightbox-share-status:empty\s*\{\s*display:\s*none/);
  assert.match(css, /\.lightbox-share-options\[hidden\]\s*\{\s*display:\s*none/);
});

test("every card photo link carries its own data-product-slug and the version is bumped", () => {
  const slugs = [...html.matchAll(/<a class="lightbox-trigger" data-lightbox-trigger[^>]*? data-product-slug="([a-z0-9-]+)"/g)].map((match) => match[1]);
  assert.ok(slugs.length > 90);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.doesNotMatch(html, /\?v=20261165/);
  assert.match(html, /script\.js\?v=20261171/);
});
