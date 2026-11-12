const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const analyticsPath = path.join(root, "analytics.js");
const source = fs.existsSync(analyticsPath) ? fs.readFileSync(analyticsPath, "utf8") : "";
const VERSION = "20261173";
// The versioned file GoatCounter publishes for SRI, and the hash its help page lists for it (https://www.goatcounter.com/help/countjs-versions).
const OFFICIAL_SRC = "https://gc.zgo.at/count.v5.js";
const OFFICIAL_HASH = "sha384-atnOLvQb9t+jTSipvd75X2yginT4PjVbqDdlJAmxMm+wYElFmeR6EmLP5bYeoRVQ";

// Every public page: all HTML except the Apps Script templates (served by Google) and the one meta-refresh redirect stub.
function publicPages(dir = "") {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return ["apps-script", "tests", "work", "node_modules", "assets", "customised-hampers"].includes(entry.name) || entry.name.startsWith(".") ? [] : publicPages(relative);
    return entry.name.endsWith(".html") ? [relative] : [];
  });
}

// Runs analytics.js with a fake page. The count script is only added once the page has loaded; fireLoad() is that moment.
function load({ goatcounter, failCreate = false, readyState = "loading" } = {}) {
  const appended = [];
  const loadListeners = [];
  const documentObject = {
    readyState,
    head: { appendChild(node) { appended.push(node); } },
    createElement(tag) {
      if (failCreate) throw new Error("blocked");
      return { tagName: tag, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
    },
  };
  const windowObject = { document: documentObject, addEventListener(type, listener) { if (type === "load") loadListeners.push(listener); } };
  if (goatcounter !== undefined) windowObject.goatcounter = goatcounter;
  vm.runInNewContext(source, { window: windowObject, document: documentObject, String, Boolean });
  const fireLoad = () => loadListeners.splice(0).forEach((listener) => listener());
  return { appended, windowObject, fireLoad };
}

test("analytics.js exists and, once the page has loaded, loads GoatCounter once, async, from the versioned file with its integrity hash", () => {
  assert.ok(source, "analytics.js is missing");
  const { appended, fireLoad } = load();
  assert.equal(appended.length, 0, "nothing is added while the page is still loading, so the load event is never held up");
  fireLoad();
  assert.equal(appended.length, 1);
  const tag = appended[0];
  assert.equal(tag.tagName, "script");
  assert.equal(tag.src, OFFICIAL_SRC);
  assert.equal(tag.integrity, OFFICIAL_HASH);
  assert.equal(tag.crossOrigin, "anonymous");
  assert.equal(tag.async, true);
  assert.equal(tag.attributes["data-goatcounter"], "https://saloniresinart.goatcounter.com/count");
});

test("a page that has already loaded gets the count script at once", () => {
  const { appended } = load({ readyState: "complete" });
  assert.equal(appended.length, 1);
});

test("the site code, count file and hash each live in analytics.js only, and no page or script repeats them", () => {
  assert.equal((source.match(/saloniresinart/g) || []).length, 1);
  const others = ["script.js", "order-form.js", "my-orders.js", "public-forms.js", "customizer.js", "index.html", "tools/product_pages.py"];
  for (const file of others) assert.doesNotMatch(read(file), /goatcounter\.com|gc\.zgo\.at|sha384-/i, file);
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie|indexedDB/, "no storage of any kind for analytics");
});

test("saloniTrack does nothing, and never throws, when GoatCounter is missing or has not loaded", () => {
  for (const goatcounter of [undefined, null, {}, { count: "not a function" }]) {
    const { windowObject } = load({ goatcounter });
    assert.equal(typeof windowObject.saloniTrack, "function");
    assert.doesNotThrow(() => windowObject.saloniTrack("order-form-open"));
    assert.equal(windowObject.saloniTrack("order-form-open"), undefined);
  }
});

test("a script tag that cannot be built (blocked or broken page) leaves saloniTrack as a harmless no-op", () => {
  const { windowObject, fireLoad } = load({ failCreate: true });
  assert.doesNotThrow(fireLoad);
  assert.doesNotThrow(() => windowObject.saloniTrack("my-orders-open"));
  const noWindowEvents = vm.runInNewContext(source + "; typeof window.saloniTrack", { window: {}, document: {}, String, Boolean });
  assert.equal(noWindowEvents, "function", "even a page with no readyState or load events does not throw");
});

test("events fired before the count script arrives are sent in order once it loads, at most 10, and never if it does not load", () => {
  const calls = [];
  const { appended, windowObject, fireLoad } = load();
  windowObject.saloniTrack("product-rose-tray");
  windowObject.saloniTrack("Not Allowed 8209238541");
  windowObject.saloniTrack("share-link-opened");
  fireLoad();
  assert.deepEqual(calls, [], "waiting for the script");
  windowObject.goatcounter = { count: (vars) => calls.push(vars.path) };
  appended[0].onload();
  assert.deepEqual(calls, ["product-rose-tray", "share-link-opened"], "only valid names, in order");
  windowObject.saloniTrack("order-sent");
  assert.deepEqual(calls, ["product-rose-tray", "share-link-opened", "order-sent"], "after that, sent at once");

  const flood = load();
  for (let index = 0; index < 25; index += 1) flood.windowObject.saloniTrack("event-" + String.fromCharCode(97 + (index % 26)));
  const sent = [];
  flood.fireLoad();
  flood.windowObject.goatcounter = { count: (vars) => sent.push(vars.path) };
  flood.appended[0].onload();
  assert.equal(sent.length, 10, "the wait list is capped");

  const blocked = load();
  blocked.windowObject.saloniTrack("order-form-open");
  blocked.fireLoad();
  assert.equal(blocked.windowObject.goatcounter, undefined, "a blocked script never defines goatcounter, and nothing is sent or thrown");
});

test("saloniTrack sends one event with the path, a title and event:true, and nothing else", () => {
  const calls = [];
  const { windowObject } = load({ goatcounter: { count: (vars) => calls.push(JSON.parse(JSON.stringify(vars))) } });
  windowObject.saloniTrack("product-rose-tray");
  windowObject.saloniTrack("advance-pay-phonepe", "Advance pay icon: PhonePe");
  assert.deepEqual(calls, [
    { path: "product-rose-tray", title: "product-rose-tray", event: true },
    { path: "advance-pay-phonepe", title: "Advance pay icon: PhonePe", event: true },
  ]);
});

test("a count call that throws does not reach the shopper", () => {
  const { windowObject } = load({ goatcounter: { count() { throw new Error("boom"); } } });
  assert.doesNotThrow(() => windowObject.saloniTrack("order-sent"));
});

test("event paths are an allow-list of plain lowercase words, so names, phones, notes, IDs and UPI data are dropped", () => {
  const calls = [];
  const { windowObject } = load({ goatcounter: { count: (vars) => calls.push(vars.path) } });
  const personal = [
    "Asha Verma", "8209238541", "order-8209238541", "asha@example.com", "saloni.art@okhdfcbank", "upi://pay?pa=a&am=500.00",
    "12 Hathi Bhata, Ajmer", "305001", "Request-1234567890", "a".repeat(81), "", "-leading", "product/rose", "product rose", null, undefined, 42, {},
  ];
  personal.forEach((value) => windowObject.saloniTrack(value));
  assert.deepEqual(calls, [], "none of these may leave the browser");
  ["product-silver-925-tray", "order-form-open", "advance-pay-googlepay"].forEach((value) => windowObject.saloniTrack(value));
  assert.deepEqual(calls, ["product-silver-925-tray", "order-form-open", "advance-pay-googlepay"]);
});

test("every public page loads analytics.js once with the shared cache version, before the page's own scripts", () => {
  const pages = publicPages();
  assert.ok(pages.length > 100, "index, sub-pages and every product page");
  for (const page of pages) {
    const html = read(page);
    const tags = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]*analytics\.js\?v=(\d+))"[^>]*>/g)];
    assert.equal(tags.length, 1, page);
    assert.equal(tags[0][2], VERSION, page);
    assert.match(tags[0][0], /\bdefer\b/, page + ": must not block the first paint");
    const depth = page.split(path.sep).length - 1;
    const expected = page.startsWith("p" + path.sep) ? "/analytics.js" : "../".repeat(depth) + "analytics.js";
    assert.equal(tags[0][1].split("?")[0], expected, page);
    assert.ok(tags[0].index < (html.indexOf("</head>") + 1), page + ": in the head");
    assert.ok(html.indexOf("analytics.js") < html.search(/<script\b[^>]*\bsrc="[^"]*(?:script|order-form|my-orders|customizer|public-forms)\.js/) || !/<script\b[^>]*\bsrc="[^"]*(?:script|order-form|my-orders|customizer|public-forms)\.js/.test(html), page + ": analytics.js comes first so saloniTrack exists");
  }
});

test("the shared cache version is bumped everywhere it is stamped", () => {
  for (const page of publicPages().filter((page) => !page.startsWith("p" + path.sep))) {
    assert.doesNotMatch(read(page), /\?v=20261172/, page);
  }
  assert.doesNotMatch(read("README.md"), /Cache version `20261172`/);
  assert.match(read("README.md"), /Cache version `20261173`/);
});

test("no page carries a Content-Security-Policy meta tag that would block GoatCounter", () => {
  for (const page of publicPages()) assert.doesNotMatch(read(page), /http-equiv="Content-Security-Policy"/i, page);
});

// Every track("...") call in the page scripts, as the source text of its argument.
function trackCalls(file) {
  return [...read(file).matchAll(/(?<!function )\btrack\(([^;\n]*?)\);/g)].map((match) => match[1].trim());
}

test("script.js, order-form.js and my-orders.js send only fixed event names, plus a product slug or an app name", () => {
  const allowed = [
    /^"[a-z][a-z0-9-]*"$/,
    /^"product-" \+ slug$/,
    /^"cart-add-" \+ slug$/,
    /^"advance-pay-" \+ option\.icon$/,
  ];
  const seen = [];
  for (const file of ["script.js", "order-form.js", "my-orders.js"]) {
    const calls = trackCalls(file);
    assert.ok(calls.length >= 1, file + " has no analytics events");
    for (const call of calls) {
      assert.ok(allowed.some((pattern) => pattern.test(call)), file + ": unexpected event argument " + call);
      seen.push(call);
    }
  }
  const fixed = seen.filter((call) => /^"[a-z]/.test(call) && !call.includes("+")).map((call) => call.slice(1, -1)).sort();
  assert.deepEqual([...new Set(fixed)], [
    "advance-popup-shown", "customizer-open", "my-orders-open", "order-form-open", "order-sent", "share-link-opened", "share-tap",
  ]);
  assert.ok(seen.includes('"product-" + slug') && seen.includes('"cart-add-" + slug') && seen.includes('"advance-pay-" + option.icon'));
});

test("the page scripts reach analytics only through the guarded window.saloniTrack", () => {
  for (const file of ["script.js", "order-form.js", "my-orders.js"]) {
    const code = read(file);
    assert.doesNotMatch(code, /window\.goatcounter|goatcounter\.count/, file);
    assert.match(code, /function track\(path\) \{ try \{ if \(window\.saloniTrack\) window\.saloniTrack\(path\); \} catch \(error\) \{\} \}/, file);
  }
});

test("the order form is counted when it opens, and an add to cart only when the item was really added", () => {
  const code = read("script.js");
  assert.match(code, /track\("order-form-open"\);\n\s*window\.saloniOrderForm\.open\(/);
  assert.match(code, /if \(toggleCatalogueSelection\([^\n]*\)\) \{?\s*var slug = slugOf\(card\);\s*if \(slug\) track\("cart-add-" \+ slug\);/);
  assert.match(code, /function toggleCatalogueSelection\(seed\) \{[\s\S]*?selectedCatalogueItems = nextItems;[\s\S]*?return true;\n    \}/, "returns true only after an item was added");
});

test("the README names what is counted, where to read it, how to switch it off and how to exclude own visits", () => {
  const readme = read("README.md");
  assert.match(readme, /## Visitor counts \(GoatCounter\)/);
  assert.match(readme, /saloniresinart\.goatcounter\.com/);
  assert.match(readme, /#toggle-goatcounter/);
  assert.match(readme, /analytics\.js/);
});
