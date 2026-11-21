// Razorpay full-payment backend (apps-script/Code.gs). Code.gs runs in a vm with every Google and Razorpay service mocked:
// no real network call, no real sheet, no real key.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const source = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8");

const LEGACY = ["Request ID", "Payload fingerprint", "Received at", "Source kind", "Source ID", "Product name", "Quantity", "Height value", "Height unit", "Height (in)", "Width value", "Width unit", "Width (in)", "Design details", "Customer name", "Phone", "Email", "Fulfilment", "Shipping address", "City", "State", "PIN", "Requested date", "Reference file link", "Status", "Staff notes"];
const PARTNER = ["Referral code", "Partner ID", "Partner name snapshot", "Final product subtotal", "Payment status", "Delivery status", "Commission rate snapshot", "Commission amount", "Commission status", "Payout batch ID", "Payout date"];
const ADVANCE = ["Advance amount", "Advance status"];
const SOURCE = ["Visit source"];
const PAYMENT = ["Razorpay order ID", "Razorpay payment ID", "Amount paid (₹)", "Paid at"];
const H37 = LEGACY.concat(PARTNER);
const H39 = H37.concat(ADVANCE);
const H40 = H39.concat(SOURCE);
const H44 = H40.concat(PAYMENT);
const COL = (name) => H44.indexOf(name);

const KEY_ID = "rzp_test_ABCDEF123456";
const KEY_SECRET = "super-secret-razorpay-value";
const PRICES = {
  "catalogue:rose.jpg": { name: "Rose Resin Frame", price: 1799, sizes: { "6-10-in": 1249, "12-18-in": 1799 } },
  "catalogue:coaster.jpg": { name: "Coaster Set", price: 499 },
  "catalogue:big.jpg": { name: "Grand Frame", price: 60000 },
};
const HOUR = 60 * 60 * 1000;
const OWNER = { activeEmail: "owner@example.com", effectiveEmail: "owner@example.com" };

function makeRuntime(options = {}) {
  const headers = (options.headers || H44).slice();
  const rows = (options.rows || []).map((row) => row.slice());
  const properties = Object.assign({
    ORDER_SHEET_ID: "sheet", ORDER_SHEET_TAB: "Orders", CAPTCHA_SECRET: "captcha-secret", CAPTCHA_MIN_SCORE: "0.5",
    PAYMENTS_MODE: "test", WHATSAPP_ADVANCE_LINK_DISABLED: "true", RAZORPAY_KEY_ID: KEY_ID, RAZORPAY_KEY_SECRET: KEY_SECRET, ORDER_ALERT_EMAIL: "saloni@example.com",
  }, options.properties || {});
  const cache = {};
  const rzp = { orders: {}, payments: {}, seq: 0, createFails: Boolean(options.rzpCreateFails), getFails: Boolean(options.rzpGetFails) };
  const state = {
    appendCalls: 0, fetches: [], emails: [], writes: [], logs: [], locked: false, triggerCreates: 0, headerWrites: 0,
    captchaResponse: options.captchaResponse || { success: true, hostname: "saloniresinart.com", action: "order_request", score: 0.9 },
    cachePuts: [], formats: [],
  };
  const pad = (row) => { const copy = row.slice(); while (copy.length < headers.length) copy.push(""); return copy; };
  const setCell = (row, column, value) => {
    state.writes.push({ row, column, value, lockHeld: state.locked });
    if (row === 1) { headers[column - 1] = value; state.headerWrites += 1; return; }
    while (rows[row - 2].length < column) rows[row - 2].push("");
    rows[row - 2][column - 1] = value;
  };
  const sheet = {
    getLastColumn: () => headers.length,
    getLastRow: () => rows.length + 1,
    getMaxColumns: () => state.maxColumns || headers.length,
    getMaxRows: () => rows.length + 1,
    insertColumnsAfter: (after, count) => { state.maxColumns = (state.maxColumns || headers.length) + count; },
    getRange: (row, column, numRows = 1, numColumns = 1) => ({
      getValues: () => [headers.map((v) => v)].concat(rows.map(pad)).slice(row - 1, row - 1 + numRows).map((cells) => cells.slice(column - 1, column - 1 + numColumns)),
      setValues: (values) => values.forEach((vr, i) => vr.forEach((v, j) => setCell(row + i, column + j, v))),
      setValue: (value) => setCell(row, column, value),
      getValue: () => (row === 1 ? headers[column - 1] : pad(rows[row - 2])[column - 1]),
      setNumberFormat: (format) => { state.formats.push({ row, column, numRows, numColumns, format }); },
    }),
    getDataRange: () => ({ getValues: () => [headers.slice()].concat(rows.map(pad)) }),
    appendRow: (row) => {
      state.appendCalls += 1;
      if (options.appendThrows) throw new Error("append failed");
      state.lastAppendLockHeld = state.locked;
      rows.push(row);
    },
    deleteRow: (rowNumber) => { rows.splice(rowNumber - 2, 1); },
  };
  const response = (code, body) => ({ getResponseCode: () => code, getContentText: () => (typeof body === "string" ? body : JSON.stringify(body)) });
  const fetch = (url, params) => {
    url = String(url);
    state.fetches.push({ url, method: (params && params.method) || "get", params, lockHeld: state.locked });
    if (url === "https://saloniresinart.com/prices.json") return options.pricesStatus ? response(options.pricesStatus, "") : response(200, options.prices || PRICES);
    if (url.indexOf("https://www.google.com/recaptcha/") === 0) {
      if (options.captchaThrows) throw new Error("captcha down");
      return response(200, state.captchaResponse);
    }
    if (url.indexOf("https://api.callmebot.com/") === 0) return response(200, "");
    if (url.indexOf("https://api.razorpay.com/v1/") === 0) {
      const expectedAuth = "Basic " + Buffer.from(properties.RAZORPAY_KEY_ID + ":" + properties.RAZORPAY_KEY_SECRET).toString("base64");
      assert.equal(params.headers.Authorization, expectedAuth, "Razorpay calls use Basic auth from Script Properties");
      assert.equal(params.muteHttpExceptions, true);
      const route = url.slice("https://api.razorpay.com/v1/".length);
      if (params.method === "post" && route === "orders") {
        if (rzp.createFails) return response(500, { error: { description: "boom customer@example.com" } });
        const body = JSON.parse(params.payload);
        const id = "order_T" + String(++rzp.seq).padStart(4, "0");
        rzp.orders[id] = { id, entity: "order", amount: body.amount, currency: body.currency, receipt: body.receipt, status: "created", notes: body.notes };
        return response(200, rzp.orders[id]);
      }
      if (rzp.getFails) return response(500, {});
      const paymentsMatch = /^orders\/(order_[A-Za-z0-9]+)\/payments$/.exec(route);
      if (paymentsMatch) return response(200, { entity: "collection", count: (rzp.payments[paymentsMatch[1]] || []).length, items: rzp.payments[paymentsMatch[1]] || [] });
      const orderMatch = /^orders\/(order_[A-Za-z0-9]+)$/.exec(route);
      if (orderMatch) return rzp.orders[orderMatch[1]] ? response(200, rzp.orders[orderMatch[1]]) : response(400, { error: {} });
      if (route === "orders?count=1") return response(200, { items: [] });
    }
    throw new Error("unexpected fetch " + url);
  };
  const lock = {
    tryLock: () => { state.locked = options.lockAvailable !== false; return state.locked; },
    releaseLock: () => { state.locked = false; },
  };
  const triggers = options.triggers || [];
  const runtimeContext = {
    console: { log: (...v) => state.logs.push(v.join(" ")), error: (...v) => state.logs.push(v.join(" ")) },
    Number, String, JSON, Date, RegExp, Math, isFinite, Object, Array, parseInt, parseFloat, encodeURIComponent,
    Utilities: {
      getUuid: () => "00000000-0000-4000-8000-000000000000",
      newBlob: (value) => ({ getBytes: () => Array.from(Buffer.from(String(value))) }),
      base64Encode: (text) => Buffer.from(String(text)).toString("base64"),
      computeHmacSha256Signature: (value, key) => Array.from(crypto.createHmac("sha256", String(key)).update(String(value)).digest()).map((b) => (b > 127 ? b - 256 : b)),
      DigestAlgorithm: { SHA_256: "SHA-256" },
      computeDigest: (_a, bytes) => Array.from(crypto.createHash("sha256").update(Buffer.from(bytes.map((b) => (b < 0 ? b + 256 : b)))).digest()).map((b) => (b > 127 ? b - 256 : b)),
      formatDate: (date, zone, format) => new Date(date).toISOString().slice(0, format === "yyyy-MM-dd" ? 10 : 16),
    },
    ContentService: { MimeType: { JSON: "JSON" }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => (key in properties ? properties[key] : null),
      setProperty: (key, value) => { properties[key] = String(value); },
      deleteProperty: (key) => { delete properties[key]; },
      getKeys: () => Object.keys(properties),
      getProperties: () => Object.assign({}, properties),
    }) },
    CacheService: { getScriptCache: () => ({
      get: (key) => (key in cache ? cache[key] : null),
      put: (key, value, ttl) => { state.cachePuts.push({ key, ttl }); cache[key] = value; },
      remove: (key) => { delete cache[key]; },
    }) },
    LockService: { getScriptLock: () => lock, getUserLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
    ScriptApp: {
      AuthMode: { FULL: "FULL" },
      requireScopes: (mode, scopes) => { state.scopes = scopes; },
      getProjectTriggers: () => triggers,
      newTrigger: (handler) => {
        const builder = { timeBased: () => builder, everyMinutes: () => builder, create: () => { state.triggerCreates += 1; triggers.push({ getHandlerFunction: () => handler }); } };
        return builder;
      },
    },
    MailApp: { sendEmail: (message) => { state.emails.push({ message, lockHeld: state.locked }); if (options.mailThrows) throw new Error("mail failed"); } },
    UrlFetchApp: { fetch },
    Session: {
      getScriptTimeZone: () => "UTC",
      getActiveUser: () => ({ getEmail: () => options.activeEmail || "" }),
      getEffectiveUser: () => ({ getEmail: () => options.effectiveEmail || "" }),
    },
  };
  vm.createContext(runtimeContext);
  vm.runInContext(source, runtimeContext, { filename: "Code.gs" });
  const sign = (orderId, paymentId, secret = KEY_SECRET) => crypto.createHmac("sha256", secret).update(orderId + "|" + paymentId).digest("hex");
  const settle = (orderId, paymentId, overrides = {}) => {
    const order = rzp.orders[orderId];
    const payment = Object.assign({ id: paymentId, entity: "payment", order_id: orderId, amount: order.amount, currency: "INR", status: "captured" }, overrides);
    (rzp.payments[orderId] = rzp.payments[orderId] || []).push(payment);
    if (payment.status === "captured") order.status = "paid"; else if (order.status === "created") order.status = "attempted";
    return payment;
  };
  const post = (body, action = "order") => JSON.parse(runtimeContext.doPost({ parameter: { action }, postData: { contents: JSON.stringify(body) } }).text);
  const rzpFetches = () => state.fetches.filter((f) => f.url.indexOf("api.razorpay.com") > 0);
  return { context: runtimeContext, state, rows, headers, properties, cache, rzp, sign, settle, post, rzpFetches, triggers };
}

function payBody(overrides = {}) {
  return Object.assign({
    requestId: "pay-request-0000000001", sourceKind: "catalogue", sourceId: "catalogue:rose.jpg", productName: "client supplied name",
    quantity: "1", designDetails: "", customerName: "Priya Sharma", phone: "9876543210", email: "priya@example.com",
    fulfillment: "shipping", shippingAddress: "12 MI Road, Jaipur", city: "Jaipur", state: "Rajasthan", pin: "302001", requestedDate: "",
    lines: [{ sourceId: "catalogue:rose.jpg", size: "6-10-in", photo: "", qty: 2 }],
    captchaToken: "captcha-token", expectedTotal: 2598, paymentTest: true,
  }, overrides);
}

const cellOf = (rt, name, index = 0) => rt.rows[index][COL(name)];

// Places one paid-branch order and returns the reply.
function placeOrder(rt, overrides) {
  const reply = rt.post(payBody(overrides));
  assert.equal(reply.ok, true, JSON.stringify(reply));
  return reply;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pricing and shipping

test("shippingFee_: pickup free, PIN 30-34 (Rajasthan) 100, any other PIN 150", () => {
  const rt = makeRuntime();
  const fee = rt.context.shippingFee_;
  assert.equal(fee("pickup", "302001"), 0);
  assert.equal(fee("pickup", ""), 0);
  for (const pin of ["300001", "302001", "305001", "314001", "341999", "345000"]) {
    assert.equal(fee("shipping", pin), pin.slice(0, 2) <= "34" ? 100 : 150, pin);
  }
  assert.equal(fee("shipping", "300000"), 100);
  assert.equal(fee("shipping", "349999"), 100);
  assert.equal(fee("shipping", "350000"), 150);
  assert.equal(fee("shipping", "299999"), 150);
  assert.equal(fee("shipping", "110001"), 150);
  assert.equal(fee("Shipping", "400001"), 150);
});

test("paid order: server computes items and shipping once per order, and ignores client prices", () => {
  const rt = makeRuntime();
  const reply = rt.post(payBody({
    expectedTotal: 1,
    lines: [{ sourceId: "catalogue:rose.jpg", size: "6-10-in", qty: 2, price: 1 }, { sourceId: "catalogue:coaster.jpg", size: "", qty: 3, unitPrice: 5 }],
  }));
  assert.equal(reply.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(reply.payment)), {
    keyId: KEY_ID, orderId: "order_T0001", currency: "INR", subtotal: 1249 * 2 + 499 * 3, shipping: 100, total: 1249 * 2 + 499 * 3 + 100, priceChanged: true,
  });
  assert.equal(reply.requestId, "pay-request-0000000001");
  const created = rt.rzp.orders.order_T0001;
  assert.equal(created.amount, (1249 * 2 + 499 * 3 + 100) * 100);
  assert.equal(created.currency, "INR");
  assert.equal(created.receipt, "pay-request-0000000001");
  assert.deepEqual(JSON.parse(JSON.stringify(created.notes)), { requestId: "pay-request-0000000001" });
});

test("priceChanged is false when the shown total matches, and the expected total never changes the amount", () => {
  const rt = makeRuntime();
  const reply = placeOrder(rt, { expectedTotal: 2598 });
  assert.equal(reply.payment.priceChanged, false);
  assert.equal(reply.payment.total, 2598);
  const bad = makeRuntime();
  const changed = placeOrder(bad, { expectedTotal: 100 });
  assert.equal(changed.payment.priceChanged, true);
  assert.equal(changed.payment.total, 2598);
  assert.equal(bad.rzp.orders.order_T0001.amount, 259800);
});

test("default size price, one-size items and every shipping band reach Razorpay in paise", () => {
  const cases = [
    { lines: [{ sourceId: "catalogue:rose.jpg", size: "", qty: 1 }], fulfillment: "pickup", pin: "", total: 1799 },
    { lines: [{ sourceId: "catalogue:rose.jpg", size: "12-18-in", qty: 1 }], fulfillment: "pickup", pin: "", total: 1799 },
    { lines: [{ sourceId: "catalogue:coaster.jpg", size: "", qty: 1 }], fulfillment: "shipping", pin: "341001", total: 599 },
    { lines: [{ sourceId: "catalogue:coaster.jpg", size: "", qty: 1 }], fulfillment: "shipping", pin: "350001", total: 649 },
    { lines: [{ sourceId: "catalogue:coaster.jpg", size: "", qty: 1 }], fulfillment: "shipping", pin: "110001", total: 649 },
  ];
  for (const item of cases) {
    const rt = makeRuntime();
    const reply = placeOrder(rt, { lines: item.lines, fulfillment: item.fulfillment, pin: item.pin, shippingAddress: item.fulfillment === "pickup" ? "" : "12 MI Road, Jaipur", expectedTotal: item.total });
    assert.equal(reply.payment.total, item.total);
    assert.equal(rt.rzp.orders.order_T0001.amount, item.total * 100);
  }
});

test("unknown item, unknown size, size on a one-size item and bad quantities are refused before Razorpay", () => {
  const bad = [
    [{ sourceId: "catalogue:missing.jpg", size: "", qty: 1 }, "unknown_item"],
    [{ sourceId: "catalogue:rose.jpg", size: "99-in", qty: 1 }, "unknown_item"],
    [{ sourceId: "catalogue:coaster.jpg", size: "6-10-in", qty: 1 }, "unknown_item"],
    [{ sourceId: "catalogue:rose.jpg", size: "", qty: 0 }, "invalid"],
    [{ sourceId: "catalogue:rose.jpg", size: "", qty: 21 }, "invalid"],
    [{ sourceId: "catalogue:rose.jpg", size: "", qty: 1.5 }, "invalid"],
    [{ sourceId: "catalogue:rose.jpg", size: "", qty: "2" }, "invalid"],
    [{ sourceId: "catalogue:rose.jpg", size: "", qty: -1 }, "invalid"],
    [{ sourceId: "customizer:thing", size: "", qty: 1 }, "unknown_item"],
    [{ sourceId: "__proto__", size: "", qty: 1 }, "unknown_item"],
    [{ sourceId: "catalogue:constructor", size: "", qty: 1 }, "unknown_item"],
  ];
  for (const [line, code] of bad) {
    const rt = makeRuntime();
    const reply = rt.post(payBody({ lines: [line] }));
    assert.equal(reply.ok, false, JSON.stringify(line));
    assert.equal(reply.error, code, JSON.stringify(line));
    assert.ok(reply.message && reply.message.length > 10);
    assert.equal(rt.rzpFetches().length, 0);
    assert.equal(rt.state.appendCalls, 0);
  }
  for (const lines of [[], "x", null, new Array(31).fill({ sourceId: "catalogue:coaster.jpg", size: "", qty: 1 })]) {
    const rt = makeRuntime();
    const reply = rt.post(payBody({ lines }));
    assert.equal(reply.ok, false);
    assert.equal(rt.rzpFetches().length, 0);
  }
  const total = makeRuntime();
  const tooMany = total.post(payBody({ lines: [1, 2, 3, 4, 5, 6].map(() => ({ sourceId: "catalogue:coaster.jpg", size: "", qty: 20 })) }));
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.error, "invalid");
});

test("an order above 1,00,000 rupees is refused as too_large", () => {
  const rt = makeRuntime();
  const reply = rt.post(payBody({ lines: [{ sourceId: "catalogue:big.jpg", size: "", qty: 2 }] }));
  assert.equal(reply.ok, false);
  assert.equal(reply.error, "too_large");
  assert.equal(rt.rzpFetches().length, 0);
  const edge = makeRuntime();
  const ok = edge.post(payBody({ lines: [{ sourceId: "catalogue:big.jpg", size: "", qty: 1 }, { sourceId: "catalogue:coaster.jpg", size: "", qty: 1 }], fulfillment: "pickup", pin: "", shippingAddress: "", expectedTotal: 60499 }));
  assert.equal(ok.ok, true);
});

test("a broken or missing price table fails closed", () => {
  for (const options of [{ pricesStatus: 500 }, { prices: { "catalogue:rose.jpg": { name: "x", price: -5 } } }, { prices: { "catalogue:rose.jpg": { name: "x", price: 12.5 } } }, { prices: [] }]) {
    const rt = makeRuntime(options);
    const reply = rt.post(payBody());
    assert.equal(reply.ok, false);
    assert.equal(reply.error, "payments_unavailable");
    assert.equal(rt.rzp.seq, 0);
    assert.equal(rt.state.appendCalls, 0);
  }
  const rt = makeRuntime({ pricesStatus: 500 });
  rt.post(payBody());
  rt.post(payBody({ requestId: "pay-request-0000000002" }));
  const priceFetches = rt.state.fetches.filter((f) => f.url.indexOf("prices.json") > 0);
  assert.equal(priceFetches.length, 1, "a failure is remembered so the table is not fetched on every request");
  assert.equal(rt.state.cachePuts.find((p) => /failed/.test(p.key)).ttl, 60);
});

test("the price table is cached for 10 minutes", () => {
  const rt = makeRuntime();
  placeOrder(rt);
  placeOrder(rt, { requestId: "pay-request-0000000002" });
  assert.equal(rt.state.fetches.filter((f) => f.url.indexOf("prices.json") > 0).length, 1);
  assert.equal(rt.state.cachePuts.find((p) => !/failed/.test(p.key)).ttl, 600);
});

// ---------------------------------------------------------------------------------------------------------------------
// The order row and the Razorpay order

test("a paid-branch order writes an Awaiting payment row with server-built product, quantity and subtotal", () => {
  const rt = makeRuntime();
  placeOrder(rt, {
    lines: [{ sourceId: "catalogue:rose.jpg", size: "6-10-in", photo: "rose-gold", qty: 2 }, { sourceId: "catalogue:coaster.jpg", size: "", photo: "Bad Colour!", qty: 1 }],
    expectedTotal: 3147 + 100, referralCode: "", visitSource: "google-shopping",
  });
  assert.equal(rt.rows.length, 1);
  assert.equal(rt.rows[0].length, 44);
  assert.equal(cellOf(rt, "Status"), "Awaiting payment");
  assert.equal(cellOf(rt, "Payment status"), "Pending");
  assert.equal(cellOf(rt, "Final product subtotal"), 1249 * 2 + 499);
  assert.equal(cellOf(rt, "Razorpay order ID"), "order_T0001");
  assert.equal(cellOf(rt, "Razorpay payment ID"), "");
  assert.equal(cellOf(rt, "Amount paid (₹)"), "");
  assert.equal(cellOf(rt, "Paid at"), "");
  assert.equal(cellOf(rt, "Quantity"), 3);
  assert.equal(cellOf(rt, "Visit source"), "google-shopping");
  assert.equal(cellOf(rt, "Source kind"), "catalogue");
  const name = cellOf(rt, "Product name");
  assert.ok(name.indexOf("client supplied name") === -1, "the client's product name is never trusted");
  assert.match(name, /Rose Resin Frame/);
  assert.match(name, /6-10-in/);
  assert.match(name, /rose-gold/);
  assert.match(name, /Coaster Set/);
  assert.ok(name.indexOf("Bad Colour") === -1, "an unsafe colour code is dropped");
  assert.equal(cellOf(rt, "Delivery status"), "Test");
  assert.equal(cellOf(rt, "Staff notes"), "Razorpay TEST");
  assert.equal(cellOf(rt, "Fulfilment"), "shipping");
  assert.equal(cellOf(rt, "PIN"), "302001");
  assert.equal(cellOf(rt, "Height (in)"), "");
  assert.equal(rt.state.emails.length, 0, "no alert before the order is paid");
});

test("the Razorpay order is created outside the lock and the row is appended inside it", () => {
  const rt = makeRuntime();
  placeOrder(rt);
  const create = rt.rzpFetches().find((f) => f.method === "post");
  assert.equal(create.lockHeld, false);
  assert.equal(rt.state.lastAppendLockHeld, true);
});

test("a failed Razorpay create adds no row and says payments are unavailable", () => {
  const rt = makeRuntime({ rzpCreateFails: true });
  const reply = rt.post(payBody());
  assert.equal(reply.ok, false);
  assert.equal(reply.error, "payments_unavailable");
  assert.equal(rt.rows.length, 0);
  assert.equal(rt.state.appendCalls, 0);
  assert.equal(rt.state.logs.join("\n").indexOf("customer@example.com"), -1, "the Razorpay error body is never logged");
  assert.equal(rt.state.logs.join("\n").indexOf(KEY_SECRET), -1);
});

test("a double submit of the same request returns the same Razorpay order and one row", () => {
  const rt = makeRuntime();
  const first = placeOrder(rt);
  const second = placeOrder(rt);
  assert.equal(second.payment.orderId, first.payment.orderId);
  assert.equal(rt.rows.length, 1);
  assert.equal(rt.rzp.seq, 1, "the second submit does not create another Razorpay order");
  assert.equal(second.payment.total, 2598);
  assert.equal(second.payment.keyId, KEY_ID);
  const conflict = rt.post(payBody({ customerName: "Someone Else" }));
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error, "invalid");
  assert.equal(rt.rows.length, 1);
});

test("two simultaneous creates for one request id keep one row (the second finds the first under the lock)", () => {
  const reference = makeRuntime();
  placeOrder(reference);
  const fingerprint = reference.rows[0][1];
  const rt = makeRuntime();
  // The first order lands between the other request's unlocked check and its append.
  const original = rt.context.UrlFetchApp.fetch;
  let injected = false;
  rt.context.UrlFetchApp.fetch = (url, params) => {
    const result = original(url, params);
    if (!injected && params && params.method === "post" && String(url).endsWith("/orders")) {
      injected = true;
      const row = new Array(44).fill("");
      row[0] = "pay-request-0000000001"; row[1] = fingerprint; row[2] = new Date();
      row[COL("Razorpay order ID")] = "order_FIRST0001"; row[COL("Payment status")] = "Pending";
      row[COL("Final product subtotal")] = 2498; row[COL("Fulfilment")] = "shipping"; row[COL("PIN")] = "302001";
      rt.rows.push(row);
    }
    return result;
  };
  const reply = rt.post(payBody());
  assert.equal(reply.ok, true);
  assert.equal(reply.payment.orderId, "order_FIRST0001");
  assert.equal(rt.rows.length, 1);
  assert.equal(rt.state.appendCalls, 0);
});

test("validation errors come back with the invalid code and field messages, before captcha and Razorpay", () => {
  const rt = makeRuntime();
  const reply = rt.post(payBody({ phone: "1", pin: "12" }));
  assert.equal(reply.ok, false);
  assert.equal(reply.error, "invalid");
  assert.ok(reply.errors.phone);
  assert.ok(reply.errors.pin);
  assert.equal(rt.state.fetches.length, 0);
  const noAddress = makeRuntime().post(payBody({ shippingAddress: "" }));
  assert.equal(noAddress.error, "invalid");
  const pickup = makeRuntime();
  assert.equal(pickup.post(payBody({ fulfillment: "pickup", shippingAddress: "", pin: "", expectedTotal: 2498 })).ok, true);
  assert.equal(pickup.post(payBody({ requestId: "short" })).error, "invalid");
});

test("captcha is checked on the paid path: failures and unavailability stop before pricing and Razorpay", () => {
  const low = makeRuntime({ captchaResponse: { success: true, hostname: "saloniresinart.com", action: "order_request", score: 0.1 } });
  const reply = low.post(payBody());
  assert.equal(reply.error, "captcha_failed");
  assert.equal(low.rzpFetches().length, 0);
  assert.equal(low.state.fetches.filter((f) => f.url.indexOf("prices.json") > 0).length, 0);
  const wrongAction = makeRuntime({ captchaResponse: { success: true, hostname: "saloniresinart.com", action: "other", score: 0.9 } });
  assert.equal(wrongAction.post(payBody()).error, "captcha_failed");
  const missing = makeRuntime();
  assert.equal(missing.post(payBody({ captchaToken: "" })).error, "captcha_failed");
  const down = makeRuntime({ captchaThrows: true });
  assert.equal(down.post(payBody()).error, "captcha_failed");
  const unconfigured = makeRuntime({ properties: { CAPTCHA_SECRET: "" } });
  assert.equal(unconfigured.post(payBody()).error, "captcha_failed");
});

test("test mode accepts a localhost captcha hostname; live mode does not", () => {
  const localhost = { success: true, hostname: "localhost", action: "order_request", score: 0.9 };
  assert.equal(makeRuntime({ captchaResponse: localhost }).post(payBody()).ok, true);
  const live = makeRuntime({ captchaResponse: localhost, properties: { PAYMENTS_MODE: "live", RAZORPAY_KEY_ID: "rzp_live_ABCDEF123456" } });
  assert.equal(live.post(payBody({ paymentTest: false })).error, "captcha_failed");
});

test("the daily cap counts every row, including unpaid checkouts", () => {
  const old = new Array(44).fill("");
  old[0] = "old-request-000001"; old[2] = new Date();
  const rt = makeRuntime({ rows: [old], properties: { DAILY_ACCEPTANCE_CAP: "1" } });
  const reply = rt.post(payBody());
  assert.equal(reply.ok, false);
  assert.equal(reply.error, "rate_limited");
  assert.equal(rt.rzpFetches().length, 0);
  assert.equal(rt.rows.length, 1);
});

test("a paused order form pauses the paid path too", () => {
  const rt = makeRuntime({ properties: { ORDER_FORM_DISABLED: "true" } });
  const reply = rt.post(payBody());
  assert.equal(reply.ok, false);
  assert.equal(reply.error, "payments_unavailable");
  assert.equal(rt.rzpFetches().length, 0);
});

test("payments need the 44-column sheet, both keys and a key that matches the mode", () => {
  const old = makeRuntime({ headers: H40 });
  assert.equal(old.post(payBody()).error, "payments_unavailable");
  assert.equal(old.rzp.seq, 0);
  assert.equal(makeRuntime({ properties: { RAZORPAY_KEY_SECRET: "" } }).post(payBody()).error, "payments_unavailable");
  assert.equal(makeRuntime({ properties: { RAZORPAY_KEY_ID: "" } }).post(payBody()).error, "payments_unavailable");
  const liveKeyInTest = makeRuntime({ properties: { RAZORPAY_KEY_ID: "rzp_live_ABCDEF123456" } });
  assert.equal(liveKeyInTest.post(payBody()).error, "payments_unavailable");
  assert.equal(liveKeyInTest.rzp.seq, 0);
  const testKeyInLive = makeRuntime({ properties: { PAYMENTS_MODE: "live" } });
  assert.equal(testKeyInLive.post(payBody({ paymentTest: false })).error, "payments_unavailable");
});

// ---------------------------------------------------------------------------------------------------------------------
// Mode switch: off and test without paymentTest keep today's behaviour

test("PAYMENTS_MODE unset or off writes the same row as today and never calls Razorpay or captcha", () => {
  const plain = {
    requestId: "request-1234567890", sourceKind: "catalogue", sourceId: "catalogue:test.png", productName: "Test frame", quantity: "1",
    dimensionFormat: "feet-inches", heightFeet: "1", heightInchesPart: "0", widthFeet: "1", widthInchesPart: "0",
    designDetails: "Blue and gold", customerName: "A Customer", phone: "8209238541", email: "", fulfillment: "pickup",
    shippingAddress: "", city: "", state: "", pin: "", requestedDate: "",
  };
  const baseline = makeRuntime({ properties: { PAYMENTS_MODE: "" } });
  assert.equal(baseline.post(plain).ok, true);
  const rowOf = (rt) => JSON.stringify(Array.from(rt.rows[0]).map((v) => (v instanceof Date ? "DATE" : v)));
  for (const properties of [{ PAYMENTS_MODE: "off" }, { PAYMENTS_MODE: "" }, { PAYMENTS_MODE: "garbage" }, { PAYMENTS_MODE: "test" }]) {
    const rt = makeRuntime({ properties });
    // Everything the new site might send is present; none of it may change the row.
    const reply = rt.post(Object.assign({}, plain, { lines: [{ sourceId: "catalogue:rose.jpg", size: "6-10-in", qty: 2 }], captchaToken: "t", expectedTotal: 9, paymentTest: false }));
    assert.equal(reply.ok, true, JSON.stringify(properties));
    assert.equal(reply.payment, undefined);
    assert.equal(rt.rzpFetches().length, 0);
    assert.equal(rt.state.fetches.filter((f) => f.url.indexOf("recaptcha") > 0).length, 0);
    assert.equal(rowOf(rt), rowOf(baseline), JSON.stringify(properties));
    assert.equal(rt.rows[0].slice(40).join(""), "", "the four payment cells stay blank");
  }
  // A 40-column sheet gets the same 40-cell row as before (visit source still last).
  const old = makeRuntime({ headers: H40, properties: { PAYMENTS_MODE: "" } });
  assert.equal(old.post(Object.assign({}, plain, { visitSource: "google-shopping" })).ok, true);
  assert.equal(old.rows[0].length, 40);
  assert.equal(old.rows[0][39], "google-shopping");
});

test("test mode only takes the paid path when the request says paymentTest:true", () => {
  const custom = { requestId: "request-1234567890", sourceKind: "catalogue", sourceId: "catalogue:rose.jpg", productName: "Rose", quantity: "1",
    dimensionFormat: "feet-inches", heightFeet: "1", heightInchesPart: "0", widthFeet: "1", widthInchesPart: "0", designDetails: "x",
    customerName: "A Customer", phone: "8209238541", fulfillment: "pickup", lines: [{ sourceId: "catalogue:rose.jpg", size: "", qty: 1 }], captchaToken: "t" };
  const rt = makeRuntime();
  const reply = rt.post(Object.assign({}, custom, { paymentTest: false }));
  assert.equal(reply.ok, true);
  assert.equal(reply.payment, undefined);
  assert.equal(rt.rzpFetches().length, 0);
  assert.equal(cellOf(rt, "Status"), "New request");
  const missing = makeRuntime();
  assert.equal(missing.post(custom).payment, undefined);
  const live = makeRuntime({ properties: { PAYMENTS_MODE: "live", RAZORPAY_KEY_ID: "rzp_live_ABCDEF123456" } });
  const paid = live.post(payBody({ paymentTest: false }));
  assert.equal(paid.ok, true);
  assert.equal(paid.payment.keyId, "rzp_live_ABCDEF123456");
  assert.equal(cellOf(live, "Delivery status"), "", "live rows are not marked as tests");
  assert.equal(cellOf(live, "Staff notes"), "");
});

test("the body the site builds for a cart (requestStage quote, sourceKind catalogue, lines) takes the paid path", () => {
  const siteBody = {
    requestId: "site-request-00000001", requestStage: "quote", sourceKind: "catalogue", sourceId: "catalogue:multi-item",
    productName: "Rose Resin Frame, Coaster Set", quantity: "3", dimensionFormat: "feet-inches", heightFeet: "", heightInchesPart: "", widthFeet: "", widthInchesPart: "",
    designDetails: "", customerName: "Priya Sharma", phone: "9876543210", email: "", fulfillment: "shipping",
    shippingAddress: "12 MI Road, Jaipur", city: "Jaipur", state: "Rajasthan", pin: "302001", requestedDate: "", referralCode: "", bundleSourceIds: "catalogue:rose.jpg x2, catalogue:coaster.jpg x1",
    lines: [{ sourceId: "catalogue:rose.jpg", size: "6-10-in", photo: "", qty: 2 }, { sourceId: "catalogue:coaster.jpg", size: "", photo: "", qty: 1 }],
    captchaToken: "captcha-token", expectedTotal: 3097, paymentTest: true,
  };
  const rt = makeRuntime();
  const reply = rt.post(siteBody);
  assert.equal(reply.ok, true, JSON.stringify(reply));
  assert.equal(reply.payment.total, 1249 * 2 + 499 + 100);
  assert.equal(reply.payment.priceChanged, false);
  assert.equal(cellOf(rt, "Status"), "Awaiting payment");
  assert.equal(cellOf(rt, "Quantity"), 3);
  const empty = makeRuntime();
  assert.equal(empty.post(Object.assign({}, siteBody, { requestStage: "" })).ok, true);
  // A quote with no lines, and a customizer quote, are still requests.
  const noLines = makeRuntime();
  const request = noLines.post(Object.assign({}, siteBody, { lines: undefined, heightFeet: "1", heightInchesPart: "0", widthFeet: "1", widthInchesPart: "0", designDetails: "x" }));
  assert.equal(request.payment, undefined);
  assert.equal(noLines.rzpFetches().length, 0);
  const customizer = makeRuntime();
  assert.equal(customizer.post(Object.assign({}, siteBody, { sourceKind: "customizer" })).payment, undefined);
  assert.equal(customizer.rzpFetches().length, 0);
});

test("custom requests keep the request path; live mode adds captcha to it", () => {
  const request = { requestId: "request-1234567890", requestStage: "quote", sourceKind: "customizer", sourceId: "customizer:frame", productName: "Custom frame", quantity: "1",
    dimensionFormat: "feet-inches", heightFeet: "1", heightInchesPart: "0", widthFeet: "1", widthInchesPart: "0", designDetails: "my design",
    customerName: "A Customer", phone: "8209238541", fulfillment: "pickup", pin: "302001", captchaToken: "good" };
  const live = { PAYMENTS_MODE: "live", RAZORPAY_KEY_ID: "rzp_live_ABCDEF123456" };
  const ok = makeRuntime({ properties: live });
  const reply = ok.post(request);
  assert.equal(reply.ok, true);
  assert.equal(reply.payment, undefined);
  assert.equal(cellOf(ok, "Status"), "New request");
  assert.equal(ok.state.fetches.filter((f) => f.url.indexOf("recaptcha") > 0).length, 1);
  assert.equal(ok.rzpFetches().length, 0);
  const blocked = makeRuntime({ properties: live, captchaResponse: { success: true, hostname: "saloniresinart.com", action: "order_request", score: 0.1 } });
  const refused = blocked.post(request);
  assert.equal(refused.ok, false);
  assert.ok(refused.errors && refused.errors.form);
  assert.equal(blocked.rows.length, 0);
  const noToken = makeRuntime({ properties: live });
  assert.equal(noToken.post(Object.assign({}, request, { captchaToken: "" })).ok, false);
  // A catalogue order with no lines is a request, not a paid order.
  const noLines = makeRuntime({ properties: live });
  const catalogueRequest = Object.assign({}, request, { requestStage: "", sourceKind: "catalogue", sourceId: "catalogue:rose.jpg" });
  assert.equal(noLines.post(catalogueRequest).payment, undefined);
});

// ---------------------------------------------------------------------------------------------------------------------
// Verify

function paidOrder(rt, overrides, paymentId = "pay_ABC123") {
  const reply = placeOrder(rt, overrides);
  const orderId = reply.payment.orderId;
  rt.settle(orderId, paymentId);
  return { reply, orderId, paymentId, requestId: reply.requestId };
}

test("verify with a valid signature marks the order paid and writes the payment cells", () => {
  const rt = makeRuntime();
  const { orderId, paymentId, requestId } = paidOrder(rt);
  const before = Date.now();
  const result = rt.post({ requestId, razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: rt.sign(orderId, paymentId) }, "verify");
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, status: "paid", requestId, total: 2598 });
  assert.equal(cellOf(rt, "Status"), "Confirmed");
  assert.equal(cellOf(rt, "Payment status"), "Paid");
  assert.equal(cellOf(rt, "Razorpay payment ID"), paymentId);
  assert.equal(cellOf(rt, "Amount paid (₹)"), 2598);
  const paidAt = cellOf(rt, "Paid at");
  assert.ok(paidAt instanceof Date && paidAt.getTime() >= before - 1000 && paidAt.getTime() <= Date.now() + 1000);
  assert.ok(rt.state.writes.filter((w) => w.row > 1).every((w) => w.lockHeld), "every cell write happens under the lock");
});

test("verify trusts the stored order id, not the client's", () => {
  const rt = makeRuntime();
  const { orderId, paymentId, requestId } = paidOrder(rt);
  // A signature that is valid for a different order id must not mark this order paid.
  const other = rt.post({ requestId, razorpay_payment_id: paymentId, razorpay_order_id: "order_OTHER", razorpay_signature: rt.sign("order_OTHER", paymentId) }, "verify");
  assert.equal(other.ok, false);
  const forged = rt.post({ requestId, razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: rt.sign(orderId, paymentId, "wrong-secret") }, "verify");
  assert.equal(forged.ok, false);
  const missingId = rt.post({ requestId, razorpay_signature: rt.sign(orderId, paymentId) }, "verify");
  assert.equal(missingId.ok, false);
  const garbage = rt.post({ requestId, razorpay_payment_id: paymentId, razorpay_signature: "zzzz" }, "verify");
  assert.equal(garbage.ok, false);
  assert.equal(cellOf(rt, "Payment status"), "Pending");
  assert.equal(cellOf(rt, "Status"), "Awaiting payment");
  assert.equal(rt.state.emails.length, 0);
  // The signature is also accepted when the client omits the order id (the stored id is used).
  const fine = rt.post({ requestId, razorpay_payment_id: paymentId, razorpay_signature: rt.sign(orderId, paymentId) }, "verify");
  assert.equal(fine.status, "paid");
});

test("another order's payment cannot settle this order", () => {
  const rt = makeRuntime();
  const a = paidOrder(rt, { requestId: "pay-request-AAAAAAAAAA" }, "pay_FORA");
  // Order B is not paid. The attacker has order A's payment id and a signature for A's order.
  const bReply = placeOrder(rt, { requestId: "pay-request-BBBBBBBBBB", customerName: "Other Buyer" });
  const attack = rt.post({ requestId: "pay-request-BBBBBBBBBB", razorpay_payment_id: a.paymentId, razorpay_order_id: a.orderId, razorpay_signature: rt.sign(a.orderId, a.paymentId) }, "verify");
  assert.equal(attack.ok, false);
  const noSig = rt.post({ requestId: "pay-request-BBBBBBBBBB" }, "verify");
  assert.equal(noSig.status, "pending");
  assert.equal(rt.rows[1][COL("Payment status")], "Pending");
  assert.equal(bReply.payment.orderId !== a.orderId, true);
});

test("a payment of the wrong amount or an uncaptured payment is not accepted", () => {
  const short = makeRuntime();
  const placed = placeOrder(short);
  short.settle(placed.payment.orderId, "pay_LOW", { amount: 100 });
  short.rzp.orders[placed.payment.orderId].status = "paid";
  const reply = short.post({ requestId: placed.requestId, razorpay_payment_id: "pay_LOW", razorpay_signature: short.sign(placed.payment.orderId, "pay_LOW") }, "verify");
  assert.notEqual(reply.status, "paid");
  assert.equal(cellOf(short, "Payment status"), "Pending");

  const failed = makeRuntime();
  const second = placeOrder(failed);
  failed.settle(second.payment.orderId, "pay_FAILED", { status: "failed" });
  const failedReply = failed.post({ requestId: second.requestId, razorpay_payment_id: "pay_FAILED", razorpay_signature: failed.sign(second.payment.orderId, "pay_FAILED") }, "verify");
  assert.notEqual(failedReply.status, "paid");
  assert.equal(cellOf(failed, "Payment status"), "Pending");

  const wrongReceipt = makeRuntime();
  const third = placeOrder(wrongReceipt);
  wrongReceipt.settle(third.payment.orderId, "pay_R");
  wrongReceipt.rzp.orders[third.payment.orderId].receipt = "someone-elses-order";
  const receiptReply = wrongReceipt.post({ requestId: third.requestId, razorpay_payment_id: "pay_R", razorpay_signature: wrongReceipt.sign(third.payment.orderId, "pay_R") }, "verify");
  assert.notEqual(receiptReply.status, "paid");
  assert.equal(cellOf(wrongReceipt, "Payment status"), "Pending");
});

test("verify trusts the Razorpay order, not editable sheet cells: editing the subtotal cell changes nothing", () => {
  const rt = makeRuntime();
  const { orderId, paymentId, requestId } = paidOrder(rt);
  rt.rows[0][COL("Final product subtotal")] = 1;
  rt.rows[0][COL("PIN")] = "110001";
  const result = rt.post({ requestId, razorpay_payment_id: paymentId, razorpay_signature: rt.sign(orderId, paymentId) }, "verify");
  assert.equal(result.status, "paid");
  assert.equal(result.total, 2598);
  assert.equal(cellOf(rt, "Amount paid (\u20B9)"), 2598);
  assert.equal(cellOf(rt, "Payment status"), "Paid");
  // The polling path reads the same order.
  const polled = makeRuntime();
  const placed = placeOrder(polled);
  polled.rows[0][2] = new Date(Date.now() - 1800000);
  polled.rows[0][COL("Final product subtotal")] = 99999;
  polled.settle(placed.payment.orderId, "pay_P");
  assert.equal(polled.context.reconcilePayments_().paid, 1);
  assert.equal(polled.rows[0][COL("Amount paid (\u20B9)")], 2598);
});

test("a second verify does not alert twice or rewrite the paid cells", () => {
  const rt = makeRuntime();
  const { orderId, paymentId, requestId } = paidOrder(rt);
  const body = { requestId, razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: rt.sign(orderId, paymentId) };
  assert.equal(rt.post(body, "verify").status, "paid");
  const paidAt = cellOf(rt, "Paid at");
  const writes = rt.state.writes.length;
  const emailsAfterFirst = rt.state.emails.length;
  assert.ok(emailsAfterFirst >= 1);
  const again = rt.post(body, "verify");
  assert.equal(again.status, "paid");
  assert.equal(again.total, 2598);
  assert.equal(rt.state.emails.length, emailsAfterFirst);
  assert.equal(rt.state.writes.length, writes);
  assert.equal(cellOf(rt, "Paid at"), paidAt);
});

test("markPaid_ only moves a Pending row, and only once", () => {
  const rt = makeRuntime();
  const { requestId } = paidOrder(rt);
  const props = rt.context.PropertiesService.getScriptProperties();
  const first = rt.context.markPaid_(requestId, "pay_ONE", 2598, props);
  assert.equal(first.changed, true);
  const second = rt.context.markPaid_(requestId, "pay_TWO", 2598, props);
  assert.equal(second.changed, false);
  assert.equal(cellOf(rt, "Razorpay payment ID"), "pay_ONE");
  const refunded = makeRuntime();
  const other = placeOrder(refunded);
  refunded.rows[0][COL("Payment status")] = "Refunded";
  assert.equal(refunded.context.markPaid_(other.requestId, "pay_X", 2598, refunded.context.PropertiesService.getScriptProperties()).changed, false);
  assert.equal(refunded.rows[0][COL("Payment status")], "Refunded");
  assert.equal(refunded.context.markPaid_("missing-request-0001", "pay_X", 1, refunded.context.PropertiesService.getScriptProperties()).changed, false);
});

test("verify sends one Saloni alert with amount and payment id, and one customer email", () => {
  const rt = makeRuntime();
  const { orderId, paymentId, requestId } = paidOrder(rt);
  rt.post({ requestId, razorpay_payment_id: paymentId, razorpay_signature: rt.sign(orderId, paymentId) }, "verify");
  const saloni = rt.state.emails.filter((e) => e.message.to === "saloni@example.com");
  const customer = rt.state.emails.filter((e) => e.message.to === "priya@example.com");
  assert.equal(saloni.length, 1);
  assert.equal(customer.length, 1);
  assert.match(saloni[0].message.body, /2598/);
  assert.match(saloni[0].message.body, /pay_ABC123/);
  assert.match(saloni[0].message.subject, /paid/i);
  assert.equal(saloni[0].lockHeld, false, "mail goes out after the lock is released");
  assert.match(customer[0].message.body, /2598/);
  assert.match(customer[0].message.body, /24 hours/);
  assert.equal(rt.state.logs.join("\n").indexOf("priya@example.com"), -1);
});

test("no customer email address means no customer email, and a mail failure never fails the verify", () => {
  const rt = makeRuntime();
  const { orderId, paymentId, requestId } = paidOrder(rt, { email: "" });
  rt.post({ requestId, razorpay_payment_id: paymentId, razorpay_signature: rt.sign(orderId, paymentId) }, "verify");
  assert.equal(rt.state.emails.filter((e) => e.message.to !== "saloni@example.com").length, 0);
  const broken = makeRuntime({ mailThrows: true });
  const placed = paidOrder(broken);
  const result = broken.post({ requestId: placed.requestId, razorpay_payment_id: placed.paymentId, razorpay_signature: broken.sign(placed.orderId, placed.paymentId) }, "verify");
  assert.equal(result.status, "paid");
  assert.equal(cellOf(broken, "Payment status"), "Paid");
});

test("with the alert queue on, the paid alert is queued with the payment details", () => {
  const rt = makeRuntime({ properties: { ORDER_ALERT_QUEUE_READY: "true" } });
  const { orderId, paymentId, requestId } = paidOrder(rt);
  rt.post({ requestId, razorpay_payment_id: paymentId, razorpay_signature: rt.sign(orderId, paymentId) }, "verify");
  const keys = Object.keys(rt.properties).filter((key) => key.indexOf("ORDER_ALERT_Q_") === 0);
  assert.equal(keys.length, 1);
  assert.equal(rt.state.emails.filter((e) => e.message.to === "saloni@example.com").length, 0);
  rt.context.sendQueuedOrderAlerts_();
  const sent = rt.state.emails.filter((e) => e.message.to === "saloni@example.com");
  assert.equal(sent.length, 1);
  assert.match(sent[0].message.body, /pay_ABC123/);
  assert.match(sent[0].message.body, /2598/);
});

test("verify without a signature is a payment check, limited to one Razorpay check per order per 60 seconds", () => {
  const rt = makeRuntime();
  const placed = placeOrder(rt);
  const first = rt.post({ requestId: placed.requestId }, "verify");
  assert.deepEqual(JSON.parse(JSON.stringify(first)), { ok: true, status: "pending", requestId: placed.requestId, total: 2598 });
  const afterFirst = rt.rzpFetches().length;
  assert.ok(afterFirst > 1);
  const second = rt.post({ requestId: placed.requestId }, "verify");
  assert.equal(second.status, "pending");
  assert.equal(rt.rzpFetches().length, afterFirst, "no second Razorpay check inside 60 seconds");
  assert.equal(rt.state.cachePuts.filter((p) => /pay-check/.test(p.key)).pop().ttl, 60);
  // Once the window passes (cache entry gone) and the payment has happened, the check settles the order.
  rt.settle(placed.payment.orderId, "pay_LATE");
  for (const key of Object.keys(rt.cache)) delete rt.cache[key];
  const third = rt.post({ requestId: placed.requestId }, "verify");
  assert.equal(third.status, "paid");
  assert.equal(cellOf(rt, "Razorpay payment ID"), "pay_LATE");
});

test("verify rejects bad input and unknown orders without touching Razorpay", () => {
  const rt = makeRuntime();
  assert.equal(rt.post({}, "verify").ok, false);
  assert.equal(rt.post({ requestId: "x" }, "verify").ok, false);
  const notFound = rt.post({ requestId: "missing-request-0001" }, "verify");
  assert.equal(notFound.ok, false);
  assert.equal(notFound.error, "not_found");
  assert.equal(rt.rzpFetches().length, 0);
  const bad = rt.post({ requestId: "missing-request-0001", razorpay_payment_id: { a: 1 }, razorpay_signature: 5 }, "verify");
  assert.equal(bad.ok, false);
  // A row with no Razorpay order (a custom request) is not payable.
  const plain = makeRuntime({ properties: { PAYMENTS_MODE: "" } });
  plain.post({ requestId: "request-1234567890", sourceKind: "catalogue", sourceId: "catalogue:rose.jpg", productName: "Rose", quantity: "1", dimensionFormat: "feet-inches", heightFeet: "1", heightInchesPart: "0", widthFeet: "1", widthInchesPart: "0", designDetails: "x", customerName: "A Customer", phone: "8209238541", fulfillment: "pickup" });
  const request = plain.post({ requestId: "request-1234567890" }, "verify");
  assert.equal(request.ok, false);
  assert.equal(plain.rzpFetches().length, 0);
});

test("verify still settles a pending order after PAYMENTS_MODE is switched off (rollback)", () => {
  const rt = makeRuntime();
  const { orderId, paymentId, requestId } = paidOrder(rt);
  rt.properties.PAYMENTS_MODE = "off";
  const result = rt.post({ requestId, razorpay_payment_id: paymentId, razorpay_signature: rt.sign(orderId, paymentId) }, "verify");
  assert.equal(result.status, "paid");
  const noKeys = makeRuntime({ properties: { RAZORPAY_KEY_SECRET: "" } });
  assert.equal(noKeys.post({ requestId: "pay-request-0000000001" }, "verify").ok, false);
});

test("a Razorpay outage during verify is an error, never a paid row", () => {
  const rt = makeRuntime();
  const { orderId, paymentId, requestId } = paidOrder(rt);
  rt.rzp.getFails = true;
  const result = rt.post({ requestId, razorpay_payment_id: paymentId, razorpay_signature: rt.sign(orderId, paymentId) }, "verify");
  assert.notEqual(result.status, "paid");
  assert.equal(cellOf(rt, "Payment status"), "Pending");
});

test("a paid row that was already settled reports paid without calling Razorpay", () => {
  const rt = makeRuntime();
  const { orderId, paymentId, requestId } = paidOrder(rt);
  rt.post({ requestId, razorpay_payment_id: paymentId, razorpay_signature: rt.sign(orderId, paymentId) }, "verify");
  const calls = rt.rzpFetches().length;
  assert.equal(rt.post({ requestId }, "verify").status, "paid");
  assert.equal(rt.rzpFetches().length, calls);
  // Re-submitting the order for a paid row says it is paid, with no payment object to open, and creates nothing new.
  const resubmit = rt.post(payBody());
  assert.deepEqual(JSON.parse(JSON.stringify(resubmit)), { ok: true, requestId, paid: true, total: 2598 });
  assert.equal(rt.rzp.seq, 1);
});

// ---------------------------------------------------------------------------------------------------------------------
// Polling inside the 1-minute trigger

function pendingRuntime(ageHours, extra = {}) {
  const rt = makeRuntime(extra);
  const placed = placeOrder(rt);
  rt.rows[0][2] = new Date(Date.now() - ageHours * HOUR);
  return { rt, placed };
}

test("polling marks a paid order paid and alerts once", () => {
  const { rt, placed } = pendingRuntime(0.5);
  rt.settle(placed.payment.orderId, "pay_POLL");
  const result = rt.context.reconcilePayments_();
  assert.equal(result.paid, 1);
  assert.equal(cellOf(rt, "Status"), "Confirmed");
  assert.equal(cellOf(rt, "Razorpay payment ID"), "pay_POLL");
  assert.equal(rt.state.emails.filter((e) => e.message.to === "saloni@example.com").length, 1);
  rt.context.reconcilePayments_();
  assert.equal(rt.state.emails.filter((e) => e.message.to === "saloni@example.com").length, 1);
});

test("polling leaves a young unpaid order pending and marks it Payment not completed after 2 hours", () => {
  const young = pendingRuntime(1);
  const youngResult = young.rt.context.reconcilePayments_();
  assert.equal(youngResult.paid, 0);
  assert.equal(cellOf(young.rt, "Status"), "Awaiting payment");
  const old = pendingRuntime(3);
  old.rt.context.reconcilePayments_();
  assert.equal(cellOf(old.rt, "Status"), "Payment not completed");
  assert.equal(cellOf(old.rt, "Payment status"), "Pending", "still Pending so a late payment can settle it");
  // It keeps being checked until 48 hours, and a late payment confirms it.
  old.rt.settle(old.placed.payment.orderId, "pay_LATE");
  old.rt.context.reconcilePayments_();
  assert.equal(cellOf(old.rt, "Status"), "Confirmed");
  assert.equal(cellOf(old.rt, "Payment status"), "Paid");
  // Past 48 hours the row is no longer checked.
  const stale = pendingRuntime(49);
  stale.rt.settle(stale.placed.payment.orderId, "pay_TOOLATE");
  const before = stale.rt.rzpFetches().length;
  assert.equal(stale.rt.context.reconcilePayments_().checked, 0);
  assert.equal(stale.rt.rzpFetches().length, before);
  assert.equal(cellOf(stale.rt, "Payment status"), "Pending");
});

function twelvePending() {
  const rt = makeRuntime();
  for (let i = 0; i < 12; i += 1) {
    placeOrder(rt, { requestId: "pay-request-" + String(1000000000 + i), customerName: "Buyer " + i });
    rt.rows[i][2] = new Date(Date.now() - (60 + i) * 60 * 1000);
  }
  return rt;
}
const orderIdOf = (i) => "order_T" + String(i + 1).padStart(4, "0");

test("polling checks at most 10 pending rows per pass, and every row is settled within two passes", () => {
  const rt = twelvePending();
  for (let i = 0; i < 12; i += 1) rt.settle(orderIdOf(i), "pay_" + i);
  const first = rt.context.reconcilePayments_();
  assert.equal(first.checked, 10);
  assert.equal(first.paid, 10);
  const second = rt.context.reconcilePayments_();
  assert.equal(second.checked, 2);
  assert.equal(second.paid, 2);
  assert.equal(rt.rows.filter((r) => r[COL("Payment status")] === "Paid").length, 12);
});

test("polling rotates: rows that stay unpaid are checked in turn, never-checked rows first", () => {
  const rt = twelvePending();
  const gets = () => rt.rzpFetches().filter((f) => f.method === "get" && !/payments$/.test(f.url)).map((f) => f.url.split("/").pop());
  rt.context.reconcilePayments_();
  const firstPass = gets();
  assert.equal(firstPass.length, 10);
  assert.deepEqual(firstPass.slice().sort(), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(orderIdOf).sort(), "the 10 newest are checked first");
  rt.state.fetches.length = 0;
  rt.settle(orderIdOf(10), "pay_10");
  rt.settle(orderIdOf(11), "pay_11");
  const second = rt.context.reconcilePayments_();
  const secondPass = gets();
  assert.equal(second.paid, 2, "the two rows the first pass skipped are checked first and settled");
  assert.ok(secondPass.slice(0, 2).sort().join() === [orderIdOf(10), orderIdOf(11)].sort().join());
  assert.equal(second.checked, 10);
  // Now the oldest-checked rows come first, so a long run of unpaid rows cannot starve the older ones.
  rt.state.fetches.length = 0;
  rt.context.reconcilePayments_();
  assert.equal(gets().length, 10);
});

test("polling stops after about 120 seconds so the 1-minute trigger never overruns", () => {
  const rt = twelvePending();
  let clock = Date.now();
  class FakeDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(clock); }
    static now() { return clock; }
  }
  const original = rt.context.UrlFetchApp.fetch;
  rt.context.UrlFetchApp.fetch = (url, params) => { clock += 70 * 1000; return original(url, params); };
  rt.context.Date = FakeDate;
  const result = rt.context.reconcilePayments_();
  assert.ok(result.checked >= 1 && result.checked <= 3, "checked " + result.checked);
});

test("polling is wired into the 1-minute alert trigger, runs about every 5 minutes and never stops alerts", () => {
  const { rt, placed } = pendingRuntime(0.5);
  rt.settle(placed.payment.orderId, "pay_WIRED");
  rt.context.sendQueuedOrderAlerts_();
  assert.equal(cellOf(rt, "Payment status"), "Paid");
  const stamp = Number(rt.properties.PAYMENTS_LAST_PASS);
  assert.ok(stamp > 0);
  const calls = rt.rzpFetches().length;
  rt.context.sendQueuedOrderAlerts_();
  assert.equal(rt.rzpFetches().length, calls, "a second run inside 4.5 minutes does nothing");
  rt.properties.PAYMENTS_LAST_PASS = String(Date.now() - 5 * 60 * 1000);
  rt.context.sendQueuedOrderAlerts_();
  assert.ok(Number(rt.properties.PAYMENTS_LAST_PASS) > stamp - 1);
  // No keys, no work: shops that never enabled payments pay nothing for this.
  const none = makeRuntime({ properties: { RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "" } });
  assert.equal(none.context.reconcilePaymentsIfDue_(), null);
  assert.equal(none.state.fetches.length, 0);
  // A Razorpay outage inside the pass does not throw out of the trigger.
  const down = pendingRuntime(0.5);
  down.rt.rzp.getFails = true;
  assert.doesNotThrow(() => down.rt.context.sendQueuedOrderAlerts_());
  assert.equal(cellOf(down.rt, "Payment status"), "Pending");
});

test("polling skips a 40-column sheet", () => {
  const rt = makeRuntime({ headers: H40 });
  assert.equal(rt.context.reconcilePayments_(), null);
});

// ---------------------------------------------------------------------------------------------------------------------
// Status, cancel, purge

test("order status codes: payment_pending and unpaid", () => {
  const rt = makeRuntime();
  const code = rt.context.orderStatusCode_;
  assert.equal(code("Awaiting payment"), "payment_pending");
  assert.equal(code("awaiting payment"), "payment_pending");
  assert.equal(code("Payment not completed"), "unpaid");
  assert.equal(code("Confirmed"), "confirmed");
  assert.equal(code("Cancellation requested"), "cancel_requested");
  assert.equal(code(""), "received");
});

test("the status action reports payment_pending, unpaid and paid (with paidAt and amount)", () => {
  const rt = makeRuntime();
  const pending = placeOrder(rt, { requestId: "pay-request-PENDING001" });
  const unpaid = placeOrder(rt, { requestId: "pay-request-UNPAID0001" });
  const paid = placeOrder(rt, { requestId: "pay-request-PAIDPAID01" });
  rt.rows[1][COL("Status")] = "Payment not completed";
  rt.settle(paid.payment.orderId, "pay_S");
  rt.post({ requestId: paid.requestId, razorpay_payment_id: "pay_S", razorpay_signature: rt.sign(paid.payment.orderId, "pay_S") }, "verify");
  const reply = rt.post({ requestIds: [pending.requestId, unpaid.requestId, paid.requestId, "not-an-order-0001"] }, "status");
  assert.equal(reply.ok, true);
  assert.equal(reply.statuses[pending.requestId], "payment_pending");
  assert.equal(reply.statuses[unpaid.requestId], "unpaid");
  assert.equal(reply.statuses[paid.requestId], "paid");
  const info = reply.paid[paid.requestId];
  assert.equal(info.amount, 2598);
  assert.equal(new Date(info.paidAt).getTime() > Date.now() - 60000, true);
  assert.equal(reply.paid[pending.requestId], undefined);
  // Once Saloni moves the order on, the code follows her status but paidAt stays available.
  rt.rows[2][COL("Status")] = "Shipped";
  const later = rt.post({ requestIds: [paid.requestId] }, "status");
  assert.equal(later.statuses[paid.requestId], "dispatched");
  assert.ok(later.paid[paid.requestId].paidAt);
  assert.equal(JSON.stringify(reply).indexOf("pay_S"), -1, "no payment id leaves the sheet");
  assert.equal(JSON.stringify(reply).indexOf("order_T"), -1);
});

test("cancelling a paid order within 24 hours asks for a refund; after 24 hours it is refused and nothing is written", () => {
  const rt = makeRuntime();
  const placed = paidOrder(rt);
  rt.post({ requestId: placed.requestId, razorpay_payment_id: placed.paymentId, razorpay_signature: rt.sign(placed.orderId, placed.paymentId) }, "verify");
  rt.state.emails.length = 0;
  const reply = rt.post({ requestId: placed.requestId }, "cancel");
  assert.equal(reply.ok, true);
  assert.equal(cellOf(rt, "Status"), "Cancellation requested");
  assert.equal(cellOf(rt, "Payment status"), "Paid", "the refund itself stays manual");
  assert.equal(rt.state.emails.length, 1);
  assert.match(rt.state.emails[0].message.body, /Refund due/i);
  assert.match(rt.state.emails[0].message.body, /2598/);
  assert.match(rt.state.emails[0].message.body, /pay_ABC123/);
  assert.equal(rt.post({ requestId: placed.requestId }, "cancel").already, true);

  const late = makeRuntime();
  const lateOrder = paidOrder(late);
  late.post({ requestId: lateOrder.requestId, razorpay_payment_id: lateOrder.paymentId, razorpay_signature: late.sign(lateOrder.orderId, lateOrder.paymentId) }, "verify");
  late.rows[0][COL("Paid at")] = new Date(Date.now() - 25 * HOUR);
  late.state.emails.length = 0;
  const writes = late.state.writes.length;
  const refused = late.post({ requestId: lateOrder.requestId }, "cancel");
  assert.equal(refused.ok, false);
  assert.equal(refused.error, "window_closed");
  assert.equal(late.state.writes.length, writes);
  assert.equal(late.state.emails.length, 0);
  assert.equal(cellOf(late, "Status"), "Confirmed");

  const started = makeRuntime();
  const startedOrder = paidOrder(started);
  started.post({ requestId: startedOrder.requestId, razorpay_payment_id: startedOrder.paymentId, razorpay_signature: started.sign(startedOrder.orderId, startedOrder.paymentId) }, "verify");
  started.rows[0][COL("Status")] = "In production";
  const startedWrites = started.state.writes.length;
  assert.equal(started.post({ requestId: startedOrder.requestId }, "cancel").error, "window_closed");
  assert.equal(started.state.writes.length, startedWrites);
});

test("cancelling an order that is not paid is refused as not_paid and writes nothing", () => {
  for (const status of ["Awaiting payment", "Payment not completed"]) {
    const rt = makeRuntime();
    const placed = placeOrder(rt);
    rt.rows[0][COL("Status")] = status;
    const writes = rt.state.writes.length;
    const reply = rt.post({ requestId: placed.requestId }, "cancel");
    assert.deepEqual(JSON.parse(JSON.stringify(reply)), { ok: false, error: "not_paid" });
    assert.equal(rt.state.writes.length, writes);
    assert.equal(rt.state.emails.length, 0);
    assert.equal(cellOf(rt, "Staff notes"), "Razorpay TEST");
  }
});

function purgeRow(requestId, ageDays, paymentId) {
  const row = new Array(44).fill("");
  row[0] = requestId;
  row[2] = new Date(Date.now() - ageDays * 24 * HOUR);
  if (paymentId) { row[COL("Razorpay payment ID")] = paymentId; row[COL("Payment status")] = "Paid"; }
  return row;
}

test("retention keeps paid orders 12 months; unpaid and request rows still go after 90 days", () => {
  const rows = [
    purgeRow("old-unpaid-000001", 100),
    purgeRow("old-paid-0000001", 100, "pay_1"),
    purgeRow("older-paid-00001", 400, "pay_2"),
    purgeRow("young-unpaid-0001", 10),
    purgeRow("staff-paid-0000001", 100),
  ];
  rows[4][COL("Payment status")] = "Paid"; // typed by hand for a partner order: no Razorpay payment, so the 90-day rule applies
  const rt = makeRuntime({ rows });
  const result = rt.context.purgeExpiredOrdersAt_(new Date());
  assert.equal(result.deletedRows, 3);
  assert.deepEqual(rt.rows.map((r) => r[0]), ["old-paid-0000001", "young-unpaid-0001"]);
});

// ---------------------------------------------------------------------------------------------------------------------
// Schema and setup

test("ensureSchema_ accepts 26/37/39/40/44 columns and nothing else", () => {
  for (const headers of [LEGACY, H37, H39, H40, H44]) {
    const rt = makeRuntime({ headers });
    assert.equal(rt.context.ensureSchema_(rt.context.SpreadsheetApp.openById().getSheetByName()), headers.length);
  }
  const wrong = makeRuntime({ headers: H44.slice(0, 42) });
  assert.throws(() => wrong.context.openOrderSheet_(wrong.context.PropertiesService.getScriptProperties()), /schema/i);
  const reordered = makeRuntime({ headers: H44.slice(0, 40).concat(["Paid at", "Razorpay order ID", "Razorpay payment ID", "Amount paid (₹)"]) });
  assert.throws(() => reordered.context.openOrderSheet_(reordered.context.PropertiesService.getScriptProperties()), /schema/i);
});

test("migratePaymentSchema_ takes 26, 37, 39 or 40 columns to 44 and is idempotent", () => {
  for (const headers of [LEGACY, H37, H39, H40]) {
    const rt = makeRuntime({ headers, rows: [purgeRow("keep-this-row-0001", 1)].map((r) => r.slice(0, headers.length)) });
    const sheet = rt.context.SpreadsheetApp.openById().getSheetByName();
    assert.equal(rt.context.migratePaymentSchema_(sheet), true);
    assert.deepEqual(rt.headers, H44);
    const writes = rt.state.headerWrites;
    assert.equal(rt.context.migratePaymentSchema_(sheet), false);
    assert.equal(rt.state.headerWrites, writes);
    assert.equal(rt.rows[0][0], "keep-this-row-0001");
    assert.equal(rt.rows.length, 1);
  }
  const formatted = makeRuntime({ headers: H40, rows: [purgeRow("keep-this-row-0001", 1).slice(0, 40)] });
  formatted.context.migratePaymentSchema_(formatted.context.SpreadsheetApp.openById().getSheetByName());
  const amountFormat = formatted.state.formats.find((f) => f.column === COL("Amount paid (\u20B9)") + 1);
  const paidAtFormat = formatted.state.formats.find((f) => f.column === COL("Paid at") + 1);
  assert.equal(amountFormat.format, "0");
  assert.match(paidAtFormat.format, /yyyy/i);
  assert.match(paidAtFormat.format, /hh/i);
  assert.ok(amountFormat.numRows >= 1 && paidAtFormat.numRows >= 1);
  const already = makeRuntime();
  assert.equal(already.context.migratePaymentSchema_(already.context.SpreadsheetApp.openById().getSheetByName()), false);
  assert.equal(already.state.headerWrites, 0);
});

test("the visit-source migration leaves a 44-column sheet alone", () => {
  const rt = makeRuntime();
  assert.equal(rt.context.migrateVisitSourceSchema_(rt.context.SpreadsheetApp.openById().getSheetByName()), false);
  assert.equal(rt.state.headerWrites, 0);
  assert.deepEqual(rt.headers, H44);
});

test("setupPayments is owner-only, migrates the sheet, installs the trigger once and checks the keys", () => {
  const visitor = makeRuntime({ headers: H40 });
  assert.throws(() => visitor.context.setupPayments(), /owner/i);
  assert.deepEqual(visitor.headers, H40);
  const rt = makeRuntime(Object.assign({ headers: H40 }, OWNER));
  const result = rt.context.setupPayments();
  assert.equal(result.orderColumns, 44);
  assert.equal(result.changed, true);
  assert.equal(result.triggerInstalled, true);
  assert.equal(result.mode, "test");
  assert.equal(result.keysOk, true);
  assert.deepEqual(rt.headers, H44);
  assert.equal(rt.state.triggerCreates, 1);
  assert.ok(rt.state.scopes.indexOf("https://www.googleapis.com/auth/script.external_request") >= 0);
  const again = rt.context.setupPayments();
  assert.equal(again.changed, false);
  assert.equal(again.triggerInstalled, false);
  assert.equal(rt.state.triggerCreates, 1);
  const noKeys = makeRuntime(Object.assign({ headers: H40, properties: { RAZORPAY_KEY_SECRET: "" } }, OWNER));
  const missing = noKeys.context.setupPayments();
  assert.equal(missing.keysOk, false);
  assert.equal(noKeys.state.fetches.length, 0);
  assert.equal(JSON.stringify(result).indexOf(KEY_SECRET), -1);
  assert.equal(rt.state.logs.join("\n").indexOf(KEY_SECRET), -1);
});

test("secrets stay in Script Properties: no key or secret appears in source", () => {
  assert.equal(/rzp_(test|live)_[A-Za-z0-9]{6,}/.test(source), false);
  assert.equal(/RAZORPAY_KEY_SECRET\s*=\s*["']/.test(source), false);
  // Nothing in the paid path logs response bodies or customer details.
  const razorpayBlock = source.slice(source.indexOf("function razorpay_"), source.indexOf("function razorpay_") + 2500);
  assert.equal(/getContentText\(\)\s*\)\s*;?\s*console/.test(razorpayBlock), false);
  assert.equal(/console\.(log|error)\([^)]*(body|payload|email|phone)/i.test(razorpayBlock), false);
});

test("the doPost router sends action=verify to the verify handler", () => {
  const rt = makeRuntime();
  const reply = rt.post({ requestId: "missing-request-0001" }, "verify");
  assert.equal(reply.error, "not_found");
});
