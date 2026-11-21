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

function harness({ search = "", hash = "", share, clipboard, withShare = true, slugs = { "jewel-glow-tealight": "Jewel Resin Tealight Holder", "mr-and-mrs-name-plate": "Mr & Mrs Name Plate" }, noSlugAttribute = false, noLocation = false, more = {}, thumbs = false, inCart = false, sizes = {}, cartSize = "" } = {}) {
  const cartButtons = {};
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
    // The card's own Add to cart button, as the catalogue makes it; a click toggles it like the real one.
    const cartButton = make({ clicks: 0, handoffs: [], attributes: Object.assign({ "data-order-prefill": "catalogue", "aria-pressed": inCart ? "true" : "false" }, inCart && cartSize ? { "data-cart-size": cartSize } : {}) });
    cartButton.click = function () { this.clicks += 1; this.handoffs.push(this.__saloniChosenSize); this.attributes["aria-pressed"] = this.attributes["aria-pressed"] === "true" ? "false" : "true"; };
    cartButtons[slug] = cartButton;
    const card = make({
      querySelector: (selector) => (selector === "figcaption strong" ? { textContent: name } : selector === '[data-order-prefill="catalogue"]' || selector === "[data-order-prefill]" ? cartButton : null),
      querySelectorAll: (selector) => (selector === ".product-pricing > div" ? rows : selector === "figcaption p" ? [{ textContent: "A short line." }] : []),
    });
    return make({
      href: `assets/${slug}.jpg`,
      attributes: noSlugAttribute ? {} : Object.assign({ "data-product-slug": slug }, more[slug] ? { "data-more-like-this": more[slug] } : {}, thumbs ? { "data-thumb": `assets/thumb/${slug}.jpg` } : {}, sizes[slug] ? { "data-sizes": sizes[slug] } : {}),
      querySelector: (selector) => (selector === "img" ? { alt: name + " photo" } : null),
      closest: (selector) => (selector === "article" ? card : null),
    });
  });
  const names = ["lightbox-share", "lightbox-share-button", "lightbox-share-options", "lightbox-share-whatsapp", "lightbox-share-copy", "lightbox-share-status", "lightbox-ask"];
  const elements = {};
  names.forEach((id) => { elements[id] = make(); });
  elements["lightbox-share"].hidden = true;
  elements["lightbox-share-options"].hidden = true;
  const image = make();
  const pushes = [];
  // The popup's "More like this" section: a list whose children are the buttons the script makes, and the scrolling figure.
  const moreList = make({ children: [], appendChild(child) { this.children.push(child); return child; } });
  Object.defineProperty(moreList, "textContent", { get() { return ""; }, set() { this.children = []; } });
  const figure = make({ scrollTop: 0 });
  elements["lightbox-more"] = make({ hidden: true });
  elements["lightbox-more-list"] = moreList;
  // The popup's size choice (a fieldset and the list the script fills with radio buttons), only when the test asks for it.
  const sizeList = make({ children: [], appendChild(child) { this.children.push(child); return child; } });
  Object.defineProperty(sizeList, "textContent", { get() { return ""; }, set() { this.children = []; } });
  if (Object.keys(sizes).length) { elements["lightbox-sizes"] = make({ hidden: true }); elements["lightbox-size-options"] = sizeList; }
  const lightbox = make({ querySelector: (selector) => (selector === ".lightbox-figure" ? figure : null), showModal() { this.open = true; }, close() { this.open = false; this.listeners.close(); } });
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
    createElement: (tag) => {
      // textContent reads the children's text like a real element, and setting it drops them.
      const node = make({ tagName: tag, children: [], className: "", _text: "", appendChild(child) { this.children.push(child); return child; }, closest() { return this; } });
      Object.defineProperty(node, "textContent", { get() { return this.children.length ? this.children.map((child) => child.textContent).join("") : this._text; }, set(value) { this._text = value; this.children = []; } });
      return node;
    },
    querySelectorAll: (selector) => (selector === "[data-lightbox-trigger]" ? triggers : []),
  };
  const result = vm.runInNewContext(`(function () { ${helpers}${lightboxBlock}\n return { openSharedProduct: typeof openSharedProduct === "function" ? openSharedProduct : null }; })()`, { document: documentObject, window: windowObject, URLSearchParams, URL });
  return { sizeList, elements, triggers, lightbox, image, figure, moreList, pushes, replaces, order, calls, windowObject, cartButtons, openSharedProduct: result.openSharedProduct };
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
  assert.equal(second.elements["lightbox-product-name"].textContent, "Jewel Resin Tealight Holder");
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
  assert.equal(page.elements["lightbox-product-name"].textContent, "Jewel Resin Tealight Holder");
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
  assert.deepEqual(JSON.parse(JSON.stringify(page.calls.share)), [{ title: "Jewel Resin Tealight Holder", text: "Jewel Resin Tealight Holder – ₹249", url: `${SITE}/p/jewel-glow-tealight/` }]);
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

test("Ask Saloni on WhatsApp in the popup names the open product and links its page", () => {
  const page = harness({});
  page.triggers[1].listeners.click({ defaultPrevented: false, button: 0, preventDefault() {} });
  assert.equal(page.elements["lightbox-ask"].href, "https://wa.me/918209238541?text=" + encodeURIComponent(`Hi Saloni, I have a question about Mr & Mrs Name Plate: ${SITE}/p/mr-and-mrs-name-plate/`));
  const plain = harness({ noSlugAttribute: true });
  plain.triggers[0].listeners.click({ defaultPrevented: false, button: 0, preventDefault() {} });
  assert.equal(plain.elements["lightbox-ask"].href, "https://wa.me/918209238541?text=" + encodeURIComponent("Hi Saloni, I have a question about " + plain.elements["lightbox-product-name"].textContent));
});

test("the popup has Ask Saloni on WhatsApp, the transit-damage line and Meet Saloni under the delivery line", () => {
  const dialog = html.match(/<dialog class="lightbox-dialog"[\s\S]*?<\/dialog>/)[0];
  assert.match(dialog, /<a class="button button-whatsapp lightbox-ask" id="lightbox-ask" href="https:\/\/wa\.me\/918209238541" target="_blank" rel="noopener"><svg class="whatsapp-icon" aria-hidden="true" focusable="false"[^>]*>[\s\S]*?<\/svg>Ask Saloni on WhatsApp<\/a>/);
  assert.match(dialog, /<p class="lightbox-damage-note">Damaged in transit\? Send Saloni photos and an unboxing video for replacement support\. Made to order, so no returns\. <a href="shipping-and-returns\/">Shipping &amp; returns<\/a><\/p>/);
  assert.match(dialog, /<p class="lightbox-maker"><img src="assets\/saloni-portrait\.jpg" alt="Saloni, the artist behind Saloni Resin Art Studio" width="320" height="320" loading="lazy" decoding="async"><span><strong>Meet Saloni<\/strong> · every piece is handmade by Saloni in her studio in Ajmer, Rajasthan\.<\/span><\/p>/);
  const at = (needle) => dialog.indexOf(needle);
  assert.ok(at('id="lightbox-delivery-note"') < at('id="lightbox-ask"') && at('id="lightbox-ask"') < at('class="lightbox-damage-note"'));
  assert.ok(at('id="lightbox-share"') < at('class="lightbox-maker"'), "Meet Saloni closes the popup's order box");
  assert.match(css, /\.lightbox-damage-note a\s*\{[^}]*min-height:\s*2\.75rem/);
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

const MORE_SLUGS = { "jewel-glow-tealight": "Jewel Resin Tealight Holder", "gold-fleck-lotus-light": "Gold Fleck Lotus Tealight Holder", "pastel-lotus-tealight": "Pastel Lotus Tealight Holder", "ivory-mandala-holder": "Ivory Mandala Tealight Holder", "emerald-glow-pair": "Emerald Tealight Holder Pair" };
const MORE = { "jewel-glow-tealight": "gold-fleck-lotus-light pastel-lotus-tealight ivory-mandala-holder emerald-glow-pair", "gold-fleck-lotus-light": "pastel-lotus-tealight jewel-glow-tealight" };
const moreNames = (page) => page.moreList.children.map((li) => li.children[0].textContent);

test("popup More like this: the card's own list becomes text buttons, and a tap swaps the product inside the open popup", () => {
  const page = harness({ slugs: MORE_SLUGS, more: MORE });
  const events = [];
  page.windowObject.saloniTrack = (name) => events.push(name);
  page.triggers[0].listeners.click({ button: 0, preventDefault() {} });
  assert.equal(page.elements["lightbox-more"].hidden, false);
  assert.deepEqual(moreNames(page), ["Gold Fleck Lotus Tealight Holder", "Pastel Lotus Tealight Holder", "Ivory Mandala Tealight Holder", "Emerald Tealight Holder Pair"]);
  assert.deepEqual(page.moreList.children.map((li) => li.children[0].attributes["data-more-slug"]), ["gold-fleck-lotus-light", "pastel-lotus-tealight", "ivory-mandala-holder", "emerald-glow-pair"]);
  assert.equal(page.moreList.children[0].children[0].attributes.type, "button");
  assert.deepEqual(page.moreList.children[0].children[0].children.map((child) => child.tagName), ["span"], "a card with no data-thumb gives a text-only item");
  // A tap on the first button: the filter may hide the target card, the popup stays open, Back still has one step.
  page.triggers[1].closest("article").hidden = true;
  page.figure.scrollTop = 400;
  page.moreList.listeners.click({ target: page.moreList.children[0].children[0] });
  assert.equal(page.lightbox.open, true);
  assert.equal(page.elements["lightbox-product-name"].textContent, "Gold Fleck Lotus Tealight Holder");
  assert.deepEqual(events, ["product-jewel-glow-tealight", "product-gold-fleck-lotus-light"]);
  assert.equal(page.pushes.length, 1, "no new history entry: Back closes the popup");
  assert.equal(page.figure.scrollTop, 0);
  assert.deepEqual(page.figure.focused, true, "focus moves to the scrolling area");
  assert.deepEqual(moreNames(page), ["Pastel Lotus Tealight Holder", "Jewel Resin Tealight Holder"], "the new product's own list, never itself");
  // Closing returns focus to the card that first opened the popup, and empties the section.
  page.lightbox.close();
  assert.equal(page.triggers[0].focused, true);
  assert.equal(page.triggers[1].focused, undefined);
  assert.equal(page.moreList.children.length, 0);
  assert.equal(page.elements["lightbox-more"].hidden, true);
});

test("popup More like this: the item shows the target card's own thumbnail, with an empty alt and the name as its text", () => {
  const page = harness({ slugs: MORE_SLUGS, more: MORE, thumbs: true });
  page.triggers[0].listeners.click({ button: 0, preventDefault() {} });
  const button = page.moreList.children[0].children[0];
  assert.deepEqual(button.children.map((child) => child.tagName), ["img", "span"]);
  const img = button.children[0];
  assert.equal(img.attributes.src, "assets/thumb/gold-fleck-lotus-light.jpg", "the URL comes from the target card's data-thumb");
  assert.equal(img.attributes.alt, "");
  assert.deepEqual([img.attributes.width, img.attributes.height, img.attributes.loading], ["300", "300", "lazy"]);
  assert.equal(button.textContent, "Gold Fleck Lotus Tealight Holder");
  assert.equal(button.attributes["data-more-slug"], "gold-fleck-lotus-light");
});

test("popup More like this: works after a shared link, skips unknown or own slugs, and a card with no list shows no section", () => {
  const shared = harness({ search: "?product=jewel-glow-tealight", slugs: MORE_SLUGS, more: MORE });
  shared.openSharedProduct();
  assert.equal(shared.moreList.children.length, 4);
  shared.moreList.listeners.click({ target: shared.moreList.children[1].children[0] });
  assert.equal(shared.elements["lightbox-product-name"].textContent, "Pastel Lotus Tealight Holder");
  const odd = harness({ slugs: MORE_SLUGS, more: { "jewel-glow-tealight": "jewel-glow-tealight no-such-gift emerald-glow-pair" } });
  odd.triggers[0].listeners.click({ button: 0, preventDefault() {} });
  assert.deepEqual(moreNames(odd), ["Emerald Tealight Holder Pair"]);
  const none = harness({ slugs: MORE_SLUGS, more: MORE });
  none.triggers[2].listeners.click({ button: 0, preventDefault() {} });
  assert.equal(none.elements["lightbox-more"].hidden, true);
  assert.equal(none.moreList.children.length, 0);
  const onlyOwn = harness({ slugs: MORE_SLUGS, more: { "jewel-glow-tealight": "jewel-glow-tealight no-such-gift" } });
  onlyOwn.triggers[0].listeners.click({ button: 0, preventDefault() {} });
  assert.equal(onlyOwn.elements["lightbox-more"].hidden, true);
});

test("popup More like this: the markup sits last in the figure after the care tips and the styles keep a 44px tap target", () => {
  assert.match(html, /<\/details>\s*<section class="lightbox-more" id="lightbox-more" aria-labelledby="lightbox-more-title" hidden><h3 id="lightbox-more-title">More like this<\/h3><ul class="lightbox-more-list" id="lightbox-more-list"><\/ul><\/section>\s*<\/figure>/);
  assert.match(css, /\.lightbox-more-item\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.lightbox-more-item:focus-visible/);
  assert.match(css, /\.lightbox-more-list\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
  assert.match(css, /\.lightbox-more-item img\s*\{[^}]*width:\s*6\.25rem[^}]*height:\s*6\.25rem/);
});

const SIZES_JSON = JSON.stringify({ default: "8-12-in", options: [{ code: "6-10-in", label: "6 × 10 in", price: "₹1,249" }, { code: "8-12-in", label: "8 × 12 in", price: "₹1,799" }, { code: "10-15-in", label: "10 × 15 in", price: "₹2,499" }] });
const SIZED = { "mr-and-mrs-name-plate": SIZES_JSON };

test("sizeOptions reads the card's data-sizes and refuses anything that is not a valid size list", () => {
  const api = vm.runInNewContext(`(function () { ${helpers}\nreturn { sizeOptions }; })()`, {});
  const trigger = (value) => ({ getAttribute: (name) => (name === "data-sizes" ? value : null) });
  const good = JSON.parse(JSON.stringify(api.sizeOptions(trigger(SIZES_JSON))));
  assert.equal(good.default, "8-12-in");
  assert.deepEqual(good.options.map((option) => [option.code, option.label, option.price]), [["6-10-in", "6 × 10 in", "₹1,249"], ["8-12-in", "8 × 12 in", "₹1,799"], ["10-15-in", "10 × 15 in", "₹2,499"]]);
  const option = (code, price = "₹100", label = "A") => ({ code, label, price });
  const bad = [undefined, null, "", "not json", "[]", "{}", JSON.stringify({ default: "a", options: [option("a")] }),
    JSON.stringify({ default: "z", options: [option("a"), option("b")] }), JSON.stringify({ options: [option("a"), option("b")] }),
    JSON.stringify({ default: "a", options: [option("a"), option("a")] }), JSON.stringify({ default: "a", options: [option("a"), option("B C")] }),
    JSON.stringify({ default: "a", options: [option("a"), option("b", "100")] }), JSON.stringify({ default: "a", options: [option("a"), option("b", "₹100", "")] }),
    JSON.stringify({ default: "constructor", options: [option("a"), option("b")] }), JSON.stringify({ default: "a", options: [option("a"), null] })];
  bad.forEach((value) => assert.equal(api.sizeOptions(trigger(value)), null, String(value)));
  assert.equal(api.sizeOptions(null), null);
  assert.equal(api.sizeOptions({}), null);
});

test("?product=<slug>&add=1&size=<code> adds that size; a missing or unknown size adds the default", () => {
  const pick = (search, extra = {}) => {
    const page = harness({ search, hash: "#marriage-gifts", sizes: SIZED, ...extra });
    page.openSharedProduct();
    return page.cartButtons["mr-and-mrs-name-plate"];
  };
  const chosen = pick("?product=mr-and-mrs-name-plate&add=1&size=10-15-in");
  assert.equal(chosen.clicks, 1);
  assert.deepEqual(chosen.handoffs, ["10-15-in"], "the size goes to the card's Add to cart in one go");
  assert.deepEqual(pick("?product=mr-and-mrs-name-plate&add=1").handoffs, ["8-12-in"], "no size: the default");
  assert.deepEqual(pick("?product=mr-and-mrs-name-plate&add=1&size=nope").handoffs, ["8-12-in"], "unknown size: the default");
  assert.deepEqual(pick("?product=mr-and-mrs-name-plate&add=1&size=__proto__").handoffs, ["8-12-in"]);
  const oneSize = harness({ search: "?product=jewel-glow-tealight&add=1&size=10-15-in", sizes: SIZED });
  oneSize.openSharedProduct();
  assert.equal(oneSize.cartButtons["jewel-glow-tealight"].clicks, 1, "a one-size card still just adds");
});

test("add=1 for an item in the cart with another size replaces that line; the same size or no size leaves the cart alone", () => {
  const run = (search, cartSize = "8-12-in") => {
    const page = harness({ search, sizes: SIZED, inCart: true, cartSize });
    page.openSharedProduct();
    return page.cartButtons["mr-and-mrs-name-plate"];
  };
  const changed = run("?product=mr-and-mrs-name-plate&add=1&size=10-15-in");
  assert.equal(changed.clicks, 1);
  assert.deepEqual(changed.handoffs, ["10-15-in"]);
  assert.equal(run("?product=mr-and-mrs-name-plate&add=1&size=8-12-in").clicks, 0, "same size");
  assert.equal(run("?product=mr-and-mrs-name-plate&add=1").clicks, 0, "no size in the link");
  assert.equal(run("?product=mr-and-mrs-name-plate&add=1&size=nope").clicks, 0, "unknown size");
});

test("opening a shared product also takes ?size= out of the address", () => {
  const page = harness({ search: "?ref=ABC&product=mr-and-mrs-name-plate&add=1&size=6-10-in&x=1", hash: "#marriage-gifts", sizes: SIZED });
  page.openSharedProduct();
  assert.deepEqual(page.replaces, ["/?ref=ABC&x=1#marriage-gifts"]);
  const popup = harness({ search: "?product=mr-and-mrs-name-plate&size=6-10-in", sizes: SIZED });
  popup.openSharedProduct();
  assert.deepEqual(popup.replaces, ["/"]);
});

test("the catalogue's own address tidying also drops a leftover size=", () => {
  assert.match(script, /\["type", "budget", "page", "q", "view", "product", "size"\]\.forEach\(function \(key\) \{ params\.delete\(key\); \}\);/);
});

const radios = (page) => page.sizeList.children.map((label) => label.children[0]);

test("the popup shows a radio button per size only for a sized product, with the default checked and the size's own price", () => {
  const page = harness({ sizes: SIZED });
  page.triggers[1].listeners.click({ button: 0, preventDefault() {} });
  assert.equal(page.elements["lightbox-sizes"].hidden, false);
  assert.deepEqual(radios(page).map((input) => [input.type, input.name, input.value, input.checked]), [["radio", "lightbox-size", "6-10-in", false], ["radio", "lightbox-size", "8-12-in", true], ["radio", "lightbox-size", "10-15-in", false]]);
  assert.deepEqual(page.sizeList.children.map((label) => label.children[1].textContent), ["6 × 10 in₹1,249", "8 × 12 in₹1,799", "10 × 15 in₹2,499"]);
  assert.equal(page.elements["lightbox-product-price"].textContent, "Price: ₹1,799");
  assert.equal(page.elements["lightbox-product-size"].hidden, true, "the size buttons replace the single size line");
  // A one-size product has none.
  page.lightbox.close();
  page.triggers[0].listeners.click({ button: 0, preventDefault() {} });
  assert.equal(page.elements["lightbox-sizes"].hidden, true);
  assert.equal(page.sizeList.children.length, 0);
  assert.equal(page.elements["lightbox-product-size"].hidden, false);
  assert.equal(page.elements["lightbox-product-price"].textContent, "Price: ₹249");
});

test("choosing another size changes the popup price; Add to cart hands that size to the card's button", () => {
  const page = harness({ sizes: SIZED });
  page.triggers[1].listeners.click({ button: 0, preventDefault() {} });
  radios(page)[2].checked = true;
  radios(page)[2].listeners.change();
  assert.equal(page.elements["lightbox-product-price"].textContent, "Price: ₹2,499");
  assert.equal(page.elements["lightbox-request"].textContent, "Add to cart");
  page.elements["lightbox-request"].listeners.click();
  assert.equal(page.cartButtons["mr-and-mrs-name-plate"].__saloniChosenSize, "10-15-in");
  assert.equal(page.cartButtons["mr-and-mrs-name-plate"].clicks, 1, "the card's own button still receives the click");
});

test("popup button wording follows the cart: Remove for the size in the cart, Update size in cart for another size", () => {
  const page = harness({ sizes: SIZED, inCart: true, cartSize: "10-15-in" });
  page.triggers[1].listeners.click({ button: 0, preventDefault() {} });
  assert.deepEqual(radios(page).map((input) => input.checked), [false, false, true], "the size in the cart is selected");
  assert.equal(page.elements["lightbox-request"].textContent, "Remove from cart");
  assert.equal(page.elements["lightbox-product-price"].textContent, "Price: ₹2,499");
  radios(page)[0].checked = true;
  radios(page)[0].listeners.change();
  assert.equal(page.elements["lightbox-request"].textContent, "Update size in cart");
  assert.match(page.elements["lightbox-request"].attributes["aria-label"], /^Update size of Mr & Mrs Name Plate in cart$/);
  assert.equal(page.elements["lightbox-product-price"].textContent, "Price: ₹1,249");
  radios(page)[2].checked = true;
  radios(page)[2].listeners.change();
  assert.equal(page.elements["lightbox-request"].textContent, "Remove from cart", "back to the size in the cart");
  radios(page)[0].checked = true;
  radios(page)[0].listeners.change();
  page.elements["lightbox-request"].listeners.click();
  assert.equal(page.cartButtons["mr-and-mrs-name-plate"].__saloniChosenSize, "6-10-in");
});

test("a shared ?size= link opens the popup on that size; an unknown size opens on the default", () => {
  const page = harness({ search: "?product=mr-and-mrs-name-plate&size=6-10-in", sizes: SIZED });
  page.openSharedProduct();
  assert.deepEqual(radios(page).map((input) => input.checked), [true, false, false]);
  assert.equal(page.elements["lightbox-product-price"].textContent, "Price: ₹1,249");
  const unknown = harness({ search: "?product=mr-and-mrs-name-plate&size=nope", sizes: SIZED });
  unknown.openSharedProduct();
  assert.deepEqual(radios(unknown).map((input) => input.checked), [false, true, false]);
  // The shared size is used once: the next popup opens on its own default.
  page.lightbox.close();
  page.triggers[1].listeners.click({ button: 0, preventDefault() {} });
  assert.deepEqual(radios(page).map((input) => input.checked), [false, true, false]);
});

test("closing the popup empties the size choice, and the arrow keys move between sizes instead of photos", () => {
  const page = harness({ sizes: SIZED });
  page.triggers[1].listeners.click({ button: 0, preventDefault() {} });
  assert.equal(page.sizeList.children.length, 3);
  const keys = [];
  page.lightbox.listeners.keydown({ key: "ArrowRight", target: { name: "lightbox-size" }, preventDefault() { keys.push("prevented"); } });
  assert.deepEqual(keys, [], "the radio group keeps its own arrow keys");
  page.lightbox.close();
  assert.equal(page.sizeList.children.length, 0);
  assert.equal(page.elements["lightbox-sizes"].hidden, true);
});

test("the popup markup holds the size fieldset between the price and the request button, and the styles keep 44px size buttons", () => {
  assert.match(html, /<span id="lightbox-product-price" hidden><\/span>\s*<fieldset class="size-choice lightbox-sizes" id="lightbox-sizes" hidden><legend>Size<\/legend><span class="size-options" id="lightbox-size-options"><\/span><\/fieldset>\s*<button class="button button-dark lightbox-request" id="lightbox-request"/);
  assert.match(css, /\.size-face\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.size-option input\s*\{[^}]*opacity:\s*0/);
  assert.doesNotMatch(css, /\.size-option input\s*\{[^}]*display:\s*none/, "the radio stays in the page for keyboards");
  assert.match(css, /\.size-option input:checked \+ \.size-face\s*\{[^}]*var\(--rose-ink\)/);
  assert.match(css, /\.size-option input:focus-visible \+ \.size-face/);
  assert.match(css, /\.size-choice\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(css, /\.product-size-count\s*\{/);
});

test("every card photo link carries its own data-product-slug and the version is bumped", () => {
  const slugs = [...html.matchAll(/<a class="lightbox-trigger" data-lightbox-trigger[^>]*? data-product-slug="([a-z0-9-]+)"/g)].map((match) => match[1]);
  assert.ok(slugs.length > 90);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.doesNotMatch(html, /\?v=20261165/);
  assert.match(html, /script\.js\?v=20261212/);
});

// --- Visitor counts: the product popup, the share button and a shared link, with no personal data ---
test("analytics: opening a product popup counts product-<slug> with the card's own slug", () => {
  const page = harness({ search: "" });
  const events = [];
  page.windowObject.saloniTrack = (name) => events.push(name);
  page.triggers[1].listeners.click({ button: 0, preventDefault() {} });
  assert.deepEqual(events, ["product-mr-and-mrs-name-plate"]);
  page.triggers[0].listeners.click({ button: 0, preventDefault() {} });
  assert.deepEqual(events, ["product-mr-and-mrs-name-plate", "product-jewel-glow-tealight"]);
});

test("analytics: a card without a slug is not counted, and a throwing or missing saloniTrack never stops the popup", () => {
  const noSlug = harness({ noSlugAttribute: true });
  const events = [];
  noSlug.windowObject.saloniTrack = (name) => events.push(name);
  noSlug.triggers[0].listeners.click({ button: 0, preventDefault() {} });
  assert.equal(noSlug.lightbox.open, true);
  assert.deepEqual(events, []);
  const throwing = harness({});
  throwing.windowObject.saloniTrack = () => { throw new Error("analytics broke"); };
  assert.doesNotThrow(() => throwing.triggers[0].listeners.click({ button: 0, preventDefault() {} }));
  assert.equal(throwing.lightbox.open, true);
  const bare = harness({});
  assert.doesNotThrow(() => bare.triggers[0].listeners.click({ button: 0, preventDefault() {} }));
  assert.equal(bare.lightbox.open, true);
});

test("analytics: a visit through a shared product link is counted, along with the product it opens", () => {
  const page = harness({ search: "?product=jewel-glow-tealight" });
  const events = [];
  page.windowObject.saloniTrack = (name) => events.push(name);
  page.openSharedProduct();
  assert.deepEqual(events, ["product-jewel-glow-tealight", "share-link-opened"]);
  const unknown = harness({ search: "?product=no-such-gift" });
  const none = [];
  unknown.windowObject.saloniTrack = (name) => none.push(name);
  unknown.openSharedProduct();
  assert.deepEqual(none, [], "an unknown link opens nothing and counts nothing");
});

test("analytics: pressing Share counts share-tap and never the link or product name", () => {
  const page = harness({ search: "?product=jewel-glow-tealight" });
  page.openSharedProduct();
  const events = [];
  page.windowObject.saloniTrack = (name) => events.push(name);
  page.elements["lightbox-share-button"].listeners.click();
  assert.deepEqual(events, ["share-tap"]);
});

test("?product=<slug>&add=1 from a product page puts it in the cart, with no popup step", () => {
  const page = harness({ search: "?product=mr-and-mrs-name-plate&add=1", hash: "#marriage-gifts" });
  page.openSharedProduct();
  assert.equal(page.cartButtons["mr-and-mrs-name-plate"].clicks, 1, "the card's own Add to cart runs once");
  assert.equal(page.cartButtons["mr-and-mrs-name-plate"].attributes["aria-pressed"], "true");
  assert.equal(page.cartButtons["jewel-glow-tealight"].clicks, 0);
  assert.notEqual(page.lightbox.open, true, "the popup does not open");
  assert.deepEqual(page.replaces, ["/#marriage-gifts"], "product and add leave the address, so a reload does not add it again");
  assert.equal(page.pushes.length, 0);
});

test("add=1 for an item already in the cart does not take it out again", () => {
  const page = harness({ search: "?product=jewel-glow-tealight&add=1", inCart: true });
  page.openSharedProduct();
  assert.equal(page.cartButtons["jewel-glow-tealight"].clicks, 0);
  assert.equal(page.cartButtons["jewel-glow-tealight"].attributes["aria-pressed"], "true");
  assert.notEqual(page.lightbox.open, true);
});

test("without add=1 a shared link still opens the popup and leaves the cart alone", () => {
  const page = harness({ search: "?product=jewel-glow-tealight&add=0" });
  page.openSharedProduct();
  assert.equal(page.lightbox.open, true);
  assert.equal(page.cartButtons["jewel-glow-tealight"].clicks, 0);
});
