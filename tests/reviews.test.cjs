const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "apps-script", "Code.gs"), "utf8");

const REVIEW_HEADERS = ["Review ID", "Received at", "Status", "Rating", "Product ID", "Product name", "First name", "City", "Comment", "Photo file IDs", "Public consent", "Payload fingerprint", "Staff notes"];
const PRODUCTS_URL = "https://saloniresinart.com/reviews/products.json";
const DEFAULT_PRODUCTS = [{ id: "catalogue:resin-clock.jpg", name: "Blue hour resin clock" }, { id: "catalogue:personalized-floral-hoop.jpg", name: "A tiny beginning" }];
const LEGACY_ORDER_HEADERS = ["Request ID", "Payload fingerprint", "Received at", "Source kind", "Source ID", "Product name", "Quantity", "Height value", "Height unit", "Height (in)", "Width value", "Width unit", "Width (in)", "Design details", "Customer name", "Phone", "Email", "Fulfilment", "Shipping address", "City", "State", "PIN", "Requested date", "Reference file link", "Status", "Staff notes"];

function plain(value) { return JSON.parse(JSON.stringify(value)); }

class FakeRange {
  constructor(sheet, row, column, rows, columns) { Object.assign(this, { sheet, row, column, rows, columns }); }
  getSheet() { return this.sheet; }
  getRow() { return this.row; }
  getColumn() { return this.column; }
  getLastRow() { return this.row + this.rows - 1; }
  getLastColumn() { return this.column + this.columns - 1; }
  getValues() {
    const out = [];
    for (let r = 0; r < this.rows; r += 1) {
      const line = [];
      for (let c = 0; c < this.columns; c += 1) { const value = (this.sheet.data[this.row - 1 + r] || [])[this.column - 1 + c]; line.push(value === undefined ? "" : value); }
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    values.forEach((line, r) => line.forEach((value, c) => {
      const rowIndex = this.row - 1 + r;
      while (this.sheet.data.length <= rowIndex) this.sheet.data.push([]);
      this.sheet.data[rowIndex][this.column - 1 + c] = value;
    }));
    return this;
  }
  setValue(value) { return this.setValues([[value]]); }
  setDataValidation(rule) { this.sheet.validations.push({ row: this.row, column: this.column, a1: this.a1, rule }); return this; }
  protect() {
    if (this.sheet.options.protectFailure) throw new Error("protection failed");
    const protection = { description: "", warningOnly: true, getDescription() { return this.description; }, setRange() {}, setWarningOnly(value) { this.warningOnly = value; }, getEditors: () => [], removeEditors() {}, addEditor() {}, canDomainEdit: () => false, setDescription(value) { this.description = value; } };
    this.sheet.protections.push(protection);
    return protection;
  }
}

class FakeSheet {
  constructor(name, data, options, state) { Object.assign(this, { name, data, options, state, validations: [], protections: [] }); }
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return this.data.reduce((max, row) => Math.max(max, row.length), 0); }
  getMaxRows() { return 100; }
  getProtections() { return this.protections; }
  getRange(row, column, rows = 1, columns = 1) {
    if (typeof row === "string") {
      const match = /^([A-Z])(\d+):([A-Z])$/.exec(row);
      const range = new FakeRange(this, Number(match[2]), match[1].charCodeAt(0) - 64, this.getMaxRows() - Number(match[2]) + 1, 1);
      range.a1 = row;
      return range;
    }
    return new FakeRange(this, row, column, rows, columns);
  }
  protect() {
    if (this.options.protectFailure) throw new Error("protection failed");
    const protection = { sheetLevel: true, description: "", warningOnly: true, getDescription() { return this.description; }, setWarningOnly(value) { this.warningOnly = value; }, getEditors: () => [], removeEditors() {}, addEditor() {}, canDomainEdit: () => false, setDescription(value) { this.description = value; } };
    this.protections.push(protection);
    return protection;
  }
  getDataRange() {
    this.state.dataReads += 1;
    if (this.options.readThrows) throw new Error("sheet read failed");
    return { getValues: () => this.data.map((row) => row.slice()) };
  }
  deleteRow(rowNumber) { this.state.rowDeletes.push(rowNumber); this.data.splice(rowNumber - 1, 1); }
  appendRow(row) {
    this.state.appendCalls += 1;
    if (this.options.appendMode === "before-throw") throw new Error("append failed");
    this.data.push(row);
    if (this.options.appendMode === "persisted-throw") throw new Error("response lost");
  }
}

function makeRuntime(options = {}) {
  const state = {
    appendCalls: 0, dataReads: 0, captchaCalls: 0, productFetches: 0, files: [], removed: [], cache: new Map(), cachePuts: 0, cacheTtls: {}, cacheRemoves: [],
    triggers: [], triggerCreates: 0, rowDeletes: [], lockCalls: 0, released: 0, templateName: "", template: null, createFileCalls: 0,
    captchaResponse: options.captchaResponse || { success: true, hostname: "saloniresinart.com", action: "review_submission", score: 0.9 },
  };
  const properties = Object.assign({
    ORDER_SHEET_ID: "sheet", ORDER_SHEET_TAB: "Orders", ORDER_DRIVE_FOLDER_ID: "order-folder", REVIEW_PHOTOS_FOLDER_ID: "review-folder",
    REVIEWS_CONFIGURED: "true", CAPTCHA_SECRET: "secret", CAPTCHA_MIN_SCORE: "0.5",
  }, options.properties || {});
  const sheets = {};
  const reviewsSheet = new FakeSheet("Reviews", options.noTab ? [] : [options.headers || REVIEW_HEADERS.slice()].concat((options.rows || []).map((row) => row.slice())), options, state);
  if (!options.noTab) sheets.Reviews = reviewsSheet;
  sheets.Orders = new FakeSheet("Orders", [LEGACY_ORDER_HEADERS.slice()].concat((options.orderRows || []).map((row) => row.slice())), options, state);
  const spreadsheet = {
    getSheetByName: (name) => sheets[name] || null,
    insertSheet: (name) => { sheets[name] = new FakeSheet(name, [], options, state); return sheets[name]; },
  };
  const fileById = {};
  (options.existingFiles || []).forEach((id) => { fileById[id] = makeFile(id, "existing.jpg", "review-folder"); });
  (options.foreignFiles || []).forEach((id) => { fileById[id] = makeFile(id, "private-order.jpg", "order-folder"); });
  function makeFile(id, name, folderId) {
    const file = {
      id, name, folderId, sharing: ["ANYONE_WITH_LINK", "VIEW"], trashed: false,
      getId() { return this.id; }, getName() { return this.name; },
      getParents() { const parents = [{ getId: () => folderId }]; let index = 0; return { hasNext: () => index < parents.length, next: () => parents[index++] }; },
      setSharing(access, permission) { if (options.sharingFailure) throw new Error("sharing failed"); this.sharing = [access, permission]; return this; },
      setTrashed(value) { if (options.trashThrows) throw new Error("trash failed"); this.trashed = value; return this; },
    };
    state.files.push(file);
    return file;
  }
  function makeFolder(id) {
    return {
      id,
      getSharingAccess: () => (id === "review-folder" ? options.reviewFolderAccess || "PRIVATE" : "PRIVATE"),
      createFile(blob) {
        state.createFileCalls += 1;
        if (options.createFileFailAt && state.createFileCalls === options.createFileFailAt) throw new Error("drive create failed");
        const file = makeFile("drive-file-" + state.files.length + "-abcdefghijklmnopqrstuvwxyz", blob.getName(), id);
        file.bytes = blob.getBytes(); file.type = blob.type;
        fileById[file.id] = file;
        return file;
      },
      getFiles: () => ({ hasNext: () => false, next: () => null }),
      getFilesByName: () => ({ hasNext: () => false, next: () => null }),
    };
  }
  const utilities = {
    getUuid: () => "00000000-0000-4000-8000-000000000000",
    newBlob: (value, type, name) => {
      const bytes = typeof value === "string" ? Array.from(Buffer.from(value)) : value;
      return { type, name, getBytes: () => bytes, getName: () => name };
    },
    base64Decode: (text) => Array.from(Buffer.from(text, "base64")).map((byte) => (byte > 127 ? byte - 256 : byte)),
    DigestAlgorithm: { SHA_256: "SHA-256" },
    computeDigest: (_algorithm, bytes) => Array.from(crypto.createHash("sha256").update(Buffer.from(bytes.map((byte) => (byte < 0 ? byte + 256 : byte)))).digest()).map((byte) => (byte > 127 ? byte - 256 : byte)),
    formatDate: (date, zone) => new Date(new Date(date).getTime() + (zone === "Asia/Kolkata" ? 19800000 : 0)).toISOString().slice(0, 10),
  };
  const productsBody = options.productsBody !== undefined ? options.productsBody : JSON.stringify(options.products || DEFAULT_PRODUCTS);
  const context = {
    console: { log() {}, error() {} }, Number, String, JSON, Date, RegExp, Math, Object, Array, isFinite, Utilities: utilities,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties[key] || "", setProperty: (key, value) => { properties[key] = value; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { state.lockCalls += 1; return options.lockAvailable !== false; }, releaseLock: () => { state.released += 1; } }) },
    SpreadsheetApp: {
      ProtectionType: { RANGE: "RANGE", SHEET: "SHEET" },
      openById: () => spreadsheet,
      newDataValidation: () => {
        const rule = {};
        const builder = { requireValueInList(list, dropdown) { rule.list = list.slice(); rule.dropdown = dropdown; return builder; }, setAllowInvalid(value) { rule.allowInvalid = value; return builder; }, build() { return rule; } };
        return builder;
      },
    },
    DriveApp: {
      Access: { PRIVATE: "PRIVATE", ANYONE_WITH_LINK: "ANYONE_WITH_LINK" }, Permission: { VIEW: "VIEW", NONE: "NONE" },
      getFolderById: (id) => { if (!id || id === "missing") throw new Error("no folder"); return makeFolder(id); },
      getFileById: (id) => { if (!fileById[id]) throw new Error("no file " + id); return fileById[id]; },
    },
    Drive: { Files: { remove: (id) => { state.removed.push(id); if (options.removeThrows) throw new Error("remove failed"); } } },
    CacheService: { getScriptCache: () => ({
      get: (key) => (state.cache.has(key) ? state.cache.get(key) : null),
      put: (key, value, ttl) => { state.cachePuts += 1; state.cacheTtls[key] = ttl; state.cache.set(key, value); },
      remove: (key) => { state.cacheRemoves.push(key); state.cache.delete(key); },
    }) },
    ContentService: { MimeType: { JSON: "JSON" }, createTextOutput: (text) => ({ text, mime: "", setMimeType(mime) { this.mime = mime; return this; }, getContent() { return this.text; } }) },
    ScriptApp: {
      getProjectTriggers: () => state.triggers,
      newTrigger: (handler) => {
        const config = { handler };
        const builder = {
          forSpreadsheet(id) { config.spreadsheet = id; return builder; },
          onEdit() { config.event = "onEdit"; return builder; },
          create() { state.triggerCreates += 1; state.triggers.push({ getHandlerFunction: () => handler, config }); return state.triggers.at(-1); },
        };
        return builder;
      },
    },
    Session: { getScriptTimeZone: () => "UTC", getActiveUser: () => ({ getEmail: () => options.activeEmail || "" }), getEffectiveUser: () => ({ getEmail: () => options.effectiveEmail || "" }) },
    UrlFetchApp: { fetch: (url) => {
      if (url === PRODUCTS_URL) {
        state.productFetches += 1;
        if (options.productsThrows) throw new Error("fetch failed");
        return { getResponseCode: () => options.productsStatus || 200, getContentText: () => productsBody };
      }
      state.captchaCalls += 1;
      return { getContentText: () => JSON.stringify(state.captchaResponse) };
    } },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: "ALLOWALL" },
      createTemplateFromFile: (name) => {
        state.templateName = name;
        const template = { evaluate: () => { const evaluated = { setTitle: (title) => { state.title = title; return evaluated; }, setXFrameOptionsMode: () => evaluated }; return evaluated; } };
        state.template = template;
        return template;
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "Code.gs" });
  return { context, state, sheet: reviewsSheet, sheets, rows: reviewsSheet.data, properties, fileById, makeFile };
}

function makeJpeg({ app1, size, extra = [] } = {}) {
  const segment = (marker, payload) => Buffer.concat([Buffer.from([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255]), payload]);
  const head = [Buffer.from([0xff, 0xd8]), segment(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1"))];
  if (app1) head.push(segment(0xe1, Buffer.from(app1, "latin1")));
  extra.forEach(([marker, payload]) => head.push(segment(marker, Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "latin1"))));
  head.push(segment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])));
  const tail = Buffer.from([0xff, 0xd9]);
  const fixed = Buffer.concat(head).length + tail.length;
  return Buffer.concat([...head, Buffer.alloc(Math.max(4, (size || fixed + 16) - fixed), 0x11), tail]);
}
const photo = (buffer, type = "image/jpeg") => ({ type, data: buffer.toString("base64") });

function validForm(overrides = {}) {
  return Object.assign({
    reviewId: "review-1234567890", productId: "studio", rating: "5", firstName: "Asha", city: "Ajmer",
    comment: "Lovely resin frame, arrived safely and looks beautiful.", publicConsent: true, photos: [], captchaToken: "token", ignoredInternalField: "must not be saved",
  }, overrides);
}

function reviewRow(overrides = {}) {
  const base = { id: "review-row-0000001", at: new Date("2026-11-01T10:00:00Z"), status: "Published", rating: 5, productId: "studio", productName: "", firstName: "Asha", city: "Ajmer", comment: "Lovely frame, thank you.", photos: "", consent: true, fingerprint: "fp-secret", notes: "private staff note" };
  const v = Object.assign(base, overrides);
  return [v.id, v.at, v.status, v.rating, v.productId, v.productName, v.firstName, v.city, v.comment, v.photos, v.consent, v.fingerprint, v.notes];
}

test("a review with no captcha token is still refused", () => {
  const runtime = makeRuntime();
  assert.match(runtime.context.submitReview(validForm({ captchaToken: "" })).errors.captcha, /Captcha/);
});

test("review mode, captcha action and kill switch are bounded", () => {
  const runtime = makeRuntime();
  assert.equal(runtime.context.boundedMode_("review"), "review");
  assert.equal(runtime.context.boundedMode_("unknown"), "order");
  assert.equal(runtime.context.REVIEW_CAPTCHA_ACTION, "review_submission");
  assert.equal(runtime.context.REVIEWS_READY_PROPERTY, "REVIEWS_CONFIGURED");
  assert.deepEqual(plain(runtime.context.REVIEW_STATUSES), ["Published", "Hidden", "Removed"]);
  assert.deepEqual(plain(runtime.context.REVIEW_HEADERS), REVIEW_HEADERS);
  const seed = runtime.context.parseSeed_(JSON.stringify({ reviewId: "review-seed-12345", comment: "must be ignored" }));
  assert.equal(seed.reviewId, "review-seed-12345");
  assert.equal(seed.comment, undefined);
  assert.match(runtime.context.parseSeed_("{}").reviewId, /^[0-9a-f-]{36}$/);
  const wrongAction = makeRuntime({ captchaResponse: { success: true, hostname: "saloniresinart.com", action: "order_request", score: 0.9 } });
  assert.match(wrongAction.context.submitReview(validForm()).errors.captcha, /Captcha/);
  assert.equal(wrongAction.state.appendCalls, 0);
  const paused = makeRuntime({ properties: { REVIEWS_DISABLED: "true" } });
  const result = paused.context.submitReview(validForm({ photos: [photo(makeJpeg())] }));
  assert.equal(result.ok, false);
  assert.match(result.errors.form, /paused/i);
  assert.equal(paused.state.createFileCalls, 0);
  assert.equal(paused.state.appendCalls, 0);
  assert.equal(paused.state.captchaCalls, 0);
  const unconfigured = makeRuntime({ properties: { REVIEWS_CONFIGURED: "" } });
  assert.throws(() => unconfigured.context.submitReview(validForm()), /Unable to post the review\./);
  assert.equal(unconfigured.state.appendCalls, 0);
});

test("review form renders from the ReviewForm template with the product list and paused flag", () => {
  const runtime = makeRuntime();
  runtime.context.doPost({ parameter: { action: "seed", mode: "review", seed: JSON.stringify({ reviewId: "review-seed-12345" }) } });
  assert.equal(runtime.state.templateName, "ReviewForm");
  assert.deepEqual(plain(JSON.parse(runtime.state.template.reviewProductsJson)), DEFAULT_PRODUCTS);
  assert.equal(runtime.state.template.reviewsPausedJson, "false");
  assert.match(runtime.state.title, /review/i);
  const paused = makeRuntime({ properties: { REVIEWS_DISABLED: "true" }, productsBody: "not json" });
  paused.context.doGet({ parameter: { mode: "review" } });
  assert.equal(paused.state.template.reviewsPausedJson, "true");
  assert.equal(paused.state.template.reviewProductsJson, "null");
});

test("a review seed passes a valid product and rating through to the form and drops anything else", () => {
  const runtime = makeRuntime();
  runtime.context.doPost({ parameter: { action: "seed", mode: "review", seed: JSON.stringify({ reviewId: "review-seed-12345", productId: "catalogue:diwali-jewel-glow-tealight.jpg", rating: "4" }) } });
  const seed = JSON.parse(runtime.state.template.seedJson);
  assert.equal(seed.productId, "catalogue:diwali-jewel-glow-tealight.jpg");
  assert.equal(seed.rating, "4");
  runtime.context.doPost({ parameter: { action: "seed", mode: "review", seed: JSON.stringify({ productId: "<script>alert(1)</script>", rating: "9" }) } });
  const bad = JSON.parse(runtime.state.template.seedJson);
  assert.equal(bad.productId, "");
  assert.equal(bad.rating, "");
  runtime.context.doPost({ parameter: { action: "seed", mode: "order", seed: JSON.stringify({ productId: "catalogue:diwali-jewel-glow-tealight.jpg", rating: "4" }) } });
  const order = JSON.parse(runtime.state.template.seedJson);
  assert.equal(order.productId, undefined);
  assert.equal(order.rating, undefined);
});

test("a review seed passes a plain first name through to the form and drops anything else", () => {
  const runtime = makeRuntime();
  const nameOf = (firstName) => {
    runtime.context.doPost({ parameter: { action: "seed", mode: "review", seed: JSON.stringify({ firstName }) } });
    return JSON.parse(runtime.state.template.seedJson).firstName;
  };
  assert.equal(nameOf(" Asha "), "Asha");
  assert.equal(nameOf("Mary-Jane"), "Mary-Jane");
  assert.equal(nameOf("A"), "");
  assert.equal(nameOf("asha@mail.com"), "");
  assert.equal(nameOf("Asha1"), "");
  assert.equal(nameOf("<b>Asha</b>"), "");
  assert.equal(nameOf("x".repeat(41)), "");
  assert.equal(nameOf(42), "");
});

// --- JSON review endpoint used by the review form built into the site ---
function reviewPost(runtime, body, action = "review") {
  const output = runtime.context.doPost({ parameter: { action }, postData: { type: "text/plain", contents: typeof body === "string" ? body : JSON.stringify(body) } });
  assert.equal(output.mime, "JSON");
  return JSON.parse(output.text);
}
function postedReview(overrides = {}) {
  const form = validForm(overrides);
  delete form.publicConsent;
  delete form.ignoredInternalField;
  return form;
}

test("action=review saves one review for a valid JSON body, with photos, and replays safely", () => {
  const runtime = makeRuntime();
  const body = postedReview({ photos: [photo(makeJpeg()), photo(makeJpeg({ size: 400 }))] });
  const result = reviewPost(runtime, body);
  assert.equal(result.ok, true);
  assert.equal(result.reviewId, "review-1234567890");
  assert.equal(result.status, "Published");
  assert.equal(runtime.rows.length, 2);
  assert.equal(runtime.rows[1][9].split(",").length, 2);
  assert.equal(runtime.state.createFileCalls, 2);
  assert.equal(runtime.state.captchaCalls, 1);
  const replay = reviewPost(runtime, body);
  assert.equal(replay.ok, true);
  assert.equal(runtime.rows.length, 2);
  assert.equal(runtime.state.createFileCalls, 2);
  const conflict = reviewPost(runtime, Object.assign({}, body, { comment: "A different comment that is long enough." }));
  assert.equal(conflict.ok, false);
  assert.match(conflict.errors.reviewId, /conflict/i);
  assert.equal(runtime.rows.length, 2);
});

test("action=review refuses a missing or failed captcha with no row and no stored photo", () => {
  const withPhoto = { photos: [photo(makeJpeg())] };
  const missing = makeRuntime();
  assert.match(reviewPost(missing, postedReview(Object.assign({ captchaToken: "" }, withPhoto))).errors.captcha, /Captcha/);
  const absent = makeRuntime();
  const body = postedReview(withPhoto); delete body.captchaToken;
  assert.match(reviewPost(absent, body).errors.captcha, /Captcha/);
  const rejected = makeRuntime({ captchaResponse: { success: false, hostname: "saloniresinart.com", action: "review_submission", score: 0.9 } });
  assert.match(reviewPost(rejected, postedReview(withPhoto)).errors.captcha, /Captcha/);
  const wrongAction = makeRuntime({ captchaResponse: { success: true, hostname: "saloniresinart.com", action: "product_rating", score: 0.9 } });
  assert.match(reviewPost(wrongAction, postedReview(withPhoto)).errors.captcha, /Captcha/);
  const wrongHost = makeRuntime({ captchaResponse: { success: true, hostname: "localhost", action: "review_submission", score: 0.9 } });
  assert.match(reviewPost(wrongHost, postedReview(withPhoto)).errors.captcha, /Captcha/);
  [missing, absent, rejected, wrongAction, wrongHost].forEach((runtime) => {
    assert.equal(runtime.rows.length, 1, "no row");
    assert.equal(runtime.state.createFileCalls, 0, "no stored photo");
    assert.equal(runtime.state.appendCalls, 0);
  });
});

test("action=review rejects too many, oversized and wrongly typed photos before decoding them", () => {
  const runtime = makeRuntime();
  let decodes = 0;
  const decode = runtime.context.Utilities.base64Decode;
  runtime.context.Utilities.base64Decode = (text) => { decodes += 1; return decode(text); };
  const one = photo(makeJpeg());
  assert.ok(reviewPost(runtime, postedReview({ photos: [one, one, one, one] })).errors.photos);
  assert.ok(reviewPost(runtime, postedReview({ photos: Array.from({ length: 50 }, () => one) })).errors.photos);
  assert.ok(reviewPost(runtime, postedReview({ photos: [{ type: "image/jpeg", data: "A".repeat(Math.ceil(1024 * 1024 / 3) * 4 + 4) }] })).errors.photos);
  assert.ok(reviewPost(runtime, postedReview({ photos: [{ type: "image/png", data: one.data }] })).errors.photos);
  assert.ok(reviewPost(runtime, postedReview({ photos: [{ type: "image/jpeg", data: "not base64!!" }] })).errors.photos);
  assert.ok(reviewPost(runtime, postedReview({ photos: [{ type: "image/jpeg", data: "" }] })).errors.photos);
  assert.equal(decodes, 0, "nothing was decoded");
  assert.equal(runtime.rows.length, 1);
  assert.equal(runtime.state.createFileCalls, 0);
  assert.equal(runtime.state.captchaCalls, 0);
});

test("action=review keeps validation, the kill switch and the daily cap, and drops unknown fields", () => {
  const invalid = makeRuntime();
  assert.ok(reviewPost(invalid, postedReview({ rating: "9" })).errors.rating);
  assert.ok(reviewPost(invalid, postedReview({ comment: "Call me on 8209238541 anytime" })).errors.comment);
  assert.equal(invalid.rows.length, 1);
  const paused = makeRuntime({ properties: { REVIEWS_DISABLED: "true" } });
  assert.match(reviewPost(paused, postedReview({ photos: [photo(makeJpeg())] })).errors.form, /paused/i);
  assert.equal(paused.state.createFileCalls, 0);
  assert.equal(paused.state.captchaCalls, 0);
  const capped = makeRuntime({ properties: { REVIEW_DAILY_ACCEPTANCE_CAP: "1" }, rows: [reviewRow({ at: new Date() })] });
  assert.match(reviewPost(capped, postedReview()).errors.form, /limit/i);
  const extra = makeRuntime();
  const sent = reviewPost(extra, Object.assign(postedReview(), { injected: "<b>unexpected</b>", status: "Hidden", publicConsent: true, photos: [Object.assign(photo(makeJpeg()), { name: "x.jpg", injected: "<i>y</i>" })] }));
  assert.equal(sent.ok, true);
  assert.equal(extra.rows[1][2], "Published");
  assert.equal(extra.rows[1][10], false, "publicConsent is not taken from the page");
  assert.doesNotMatch(extra.rows[1].join("\u001f"), /unexpected|<i>/);
});

test("action=review answers invalid for broken JSON and unconfirmed when the save throws", () => {
  const runtime = makeRuntime();
  for (const body of ["{not json", "[]", "null", ""]) assert.deepEqual(reviewPost(runtime, body), { ok: false, error: "invalid" });
  assert.equal(runtime.rows.length, 1);
  const locked = makeRuntime({ lockAvailable: false });
  assert.deepEqual(reviewPost(locked, postedReview()), { ok: false, error: "unconfirmed" });
  const unconfigured = makeRuntime({ properties: { REVIEWS_CONFIGURED: "" } });
  assert.deepEqual(reviewPost(unconfigured, postedReview()), { ok: false, error: "unconfirmed" });
  assert.equal(locked.rows.length, 1);
});

test("the review action never runs the seed renderer, and action=seed still renders the review form for cached pages", () => {
  const runtime = makeRuntime();
  reviewPost(runtime, postedReview());
  assert.equal(runtime.state.templateName, "");
  runtime.context.doPost({ parameter: { action: "seed", mode: "review", seed: JSON.stringify({ reviewId: "review-cached-12345" }) } });
  assert.equal(runtime.state.templateName, "ReviewForm");
});

const RATING_CAPTCHA = { success: true, hostname: "saloniresinart.com", action: "product_rating", score: 0.9 };
const rate = (runtime, overrides = {}) => JSON.parse(runtime.context.doPost({ parameter: Object.assign({ action: "rate", productId: DEFAULT_PRODUCTS[0].id, rating: "4", ratingId: "rating-abcdef123456", captchaToken: "token" }, overrides) }).getContent());

test("a quick rating from a product popup is saved as a Published rating-only row", () => {
  const runtime = makeRuntime({ captchaResponse: RATING_CAPTCHA });
  runtime.state.cache.set("reviews-public-v1", "{}");
  assert.deepEqual(rate(runtime), { ok: true, rating: 4 });
  const row = runtime.rows.at(-1);
  assert.equal(row[0], "rating-abcdef123456");
  assert.equal(row[2], "Published");
  assert.equal(row[3], 4);
  assert.equal(row[4], DEFAULT_PRODUCTS[0].id);
  assert.equal(row[5], DEFAULT_PRODUCTS[0].name);
  assert.deepEqual(plain(row.slice(6, 11)), ["", "", "", "", false]);
  assert.match(row[11], /^[0-9a-f]{64}$/);
  assert.equal(row[12], "Quick rating from a product popup");
  assert.equal(runtime.state.captchaCalls, 1);
  assert.ok(runtime.state.cacheRemoves.includes("reviews-public-v1"));
  assert.equal(runtime.state.released, runtime.state.lockCalls);
});

test("a quick rating needs a known product, a 1 to 5 rating, a rating ID and a passing captcha", () => {
  const runtime = makeRuntime({ captchaResponse: RATING_CAPTCHA });
  assert.deepEqual(rate(runtime, { productId: "studio" }), { ok: false, error: "invalid" });
  assert.deepEqual(rate(runtime, { productId: "catalogue:not-in-the-list.jpg" }), { ok: false, error: "invalid" });
  assert.deepEqual(rate(runtime, { rating: "6" }), { ok: false, error: "invalid" });
  assert.deepEqual(rate(runtime, { rating: "4.5" }), { ok: false, error: "invalid" });
  assert.deepEqual(rate(runtime, { ratingId: "short" }), { ok: false, error: "invalid" });
  assert.equal(runtime.state.captchaCalls, 0);
  const reviewToken = makeRuntime();
  assert.deepEqual(rate(reviewToken), { ok: false, error: "captcha" });
  const lowScore = makeRuntime({ captchaResponse: Object.assign({}, RATING_CAPTCHA, { score: 0.1 }) });
  assert.deepEqual(rate(lowScore), { ok: false, error: "captcha" });
  assert.equal(runtime.rows.length + reviewToken.rows.length + lowScore.rows.length, 3);
});

test("quick ratings stop with the reviews switch, before setup, at their own daily cap and when busy", () => {
  assert.deepEqual(rate(makeRuntime({ captchaResponse: RATING_CAPTCHA, properties: { REVIEWS_DISABLED: "true" } })), { ok: false, error: "paused" });
  assert.deepEqual(rate(makeRuntime({ captchaResponse: RATING_CAPTCHA, properties: { REVIEWS_CONFIGURED: "" } })), { ok: false, error: "unavailable" });
  const today = new Date();
  const quick = (index) => reviewRow({ id: "rating-cap-" + String(index).padStart(8, "0"), at: today, productId: DEFAULT_PRODUCTS[0].id, firstName: "", city: "", comment: "", consent: false, notes: "Quick rating from a product popup" });
  const capped = makeRuntime({ captchaResponse: RATING_CAPTCHA, properties: { RATING_DAILY_ACCEPTANCE_CAP: "2" }, rows: [quick(1), quick(2)] });
  assert.deepEqual(rate(capped), { ok: false, error: "cap" });
  assert.equal(capped.rows.length, 3);
  assert.equal(makeRuntime().context.DEFAULT_RATING_DAILY_ACCEPTANCE_CAP, 100);
  assert.deepEqual(rate(makeRuntime({ captchaResponse: RATING_CAPTCHA, lockAvailable: false })), { ok: false, error: "busy" });
  const manyReviews = Array.from({ length: 20 }, (_, index) => reviewRow({ id: "review-cap-" + String(index).padStart(6, "0"), at: today }));
  assert.equal(rate(makeRuntime({ captchaResponse: RATING_CAPTCHA, rows: manyReviews })).ok, true, "written reviews do not use up the rating cap");
  const ratingsOnly = Array.from({ length: 25 }, (_, index) => quick(index));
  assert.equal(makeRuntime({ rows: ratingsOnly }).context.submitReview(validForm()).ok, true, "quick ratings do not use up the review cap");
});

test("one product takes at most 10 quick ratings a day by default, and the limit can be changed", () => {
  const today = new Date();
  const quick = (index, productId) => reviewRow({ id: "rating-prod-" + String(index).padStart(8, "0"), at: today, productId, firstName: "", city: "", comment: "", consent: false, notes: "Quick rating from a product popup" });
  const ten = Array.from({ length: 10 }, (_, index) => quick(index, DEFAULT_PRODUCTS[0].id));
  const full = makeRuntime({ captchaResponse: RATING_CAPTCHA, rows: ten });
  assert.deepEqual(rate(full), { ok: false, error: "cap" });
  assert.equal(rate(full, { productId: DEFAULT_PRODUCTS[1].id }).ok, true, "another product still takes ratings");
  const yesterday = Array.from({ length: 10 }, (_, index) => reviewRow({ id: "rating-old-" + String(index).padStart(8, "0"), at: new Date(today.getTime() - 2 * 86400000), productId: DEFAULT_PRODUCTS[0].id, firstName: "", city: "", comment: "", consent: false }));
  assert.equal(rate(makeRuntime({ captchaResponse: RATING_CAPTCHA, rows: yesterday })).ok, true);
  assert.deepEqual(rate(makeRuntime({ captchaResponse: RATING_CAPTCHA, properties: { RATING_PRODUCT_DAILY_CAP: "2" }, rows: ten.slice(0, 2) })), { ok: false, error: "cap" });
  assert.equal(makeRuntime().context.DEFAULT_RATING_PRODUCT_DAILY_CAP, 10);
});

test("the same quick rating sent twice is saved once, and a changed rating under the same ID conflicts", () => {
  const runtime = makeRuntime({ captchaResponse: RATING_CAPTCHA });
  assert.equal(rate(runtime).ok, true);
  assert.deepEqual(rate(runtime), { ok: true, rating: 4 });
  assert.equal(runtime.rows.length, 2);
  assert.deepEqual(rate(runtime, { rating: "2" }), { ok: false, error: "conflict" });
  assert.equal(runtime.rows.length, 2);
});

test("the public feed counts quick ratings per product but lists only written reviews", () => {
  const quick = (id, rating, status = "Published") => reviewRow({ id, rating, status, productId: DEFAULT_PRODUCTS[0].id, firstName: "", city: "", comment: "", consent: false, notes: "Quick rating from a product popup" });
  const rows = [
    reviewRow({ id: "review-written-001", rating: 5, productId: DEFAULT_PRODUCTS[0].id, productName: DEFAULT_PRODUCTS[0].name }),
    quick("rating-quick-000001", 3), quick("rating-quick-000002", 4), quick("rating-hidden-00001", 1, "Hidden"),
    reviewRow({ id: "review-studio-001", rating: 4 }),
  ];
  const runtime = makeRuntime({ rows });
  const body = JSON.parse(runtime.context.doGet({ parameter: { action: "reviews" } }).getContent());
  assert.deepEqual(body.reviews.map((review) => review.id).sort(), ["review-studio-001", "review-written-001"]);
  assert.deepEqual(body.summary, { count: 2, average: 4.5 });
  assert.deepEqual(plain(body.ratings), { [DEFAULT_PRODUCTS[0].id]: [12, 3] });
});

test("rating, names, comment and contact details are validated, and a review without consent is accepted", () => {
  const runtime = makeRuntime();
  const errorsFor = (overrides) => runtime.context.validateReview_(runtime.context.collectReview_(validForm(overrides)), {});
  for (const rating of ["0", "6", "4.5", "x", "", "11"]) assert.ok(errorsFor({ rating }).rating, "rating " + rating);
  for (const rating of ["1", "2", "3", "4", "5"]) assert.equal(errorsFor({ rating }).rating, undefined, "rating " + rating);
  assert.ok(errorsFor({ firstName: "A" }).firstName);
  assert.ok(errorsFor({ firstName: "x".repeat(41) }).firstName);
  assert.equal(errorsFor({ firstName: "x".repeat(40) }).firstName, undefined);
  assert.ok(errorsFor({ firstName: "Asha2" }).firstName);
  assert.ok(errorsFor({ firstName: "Asha@home" }).firstName);
  assert.ok(errorsFor({ firstName: "1234" }).firstName);
  assert.equal(errorsFor({ city: "" }).city, undefined);
  assert.ok(errorsFor({ city: "x".repeat(61) }).city);
  assert.ok(errorsFor({ city: "Ajmer 305001" }).city);
  assert.ok(errorsFor({ city: "a@b" }).city);
  assert.ok(errorsFor({ comment: "123456789" }).comment, "9 chars");
  assert.ok(errorsFor({ comment: "short" }).comment);
  assert.equal(errorsFor({ comment: "x".repeat(10) }).comment, undefined);
  assert.equal(errorsFor({ comment: "x".repeat(800) }).comment, undefined);
  assert.ok(errorsFor({ comment: "x".repeat(801) }).comment);
  assert.ok(errorsFor({ comment: "Write to asha@example.com for the details" }).comment);
  assert.ok(errorsFor({ comment: "Call me on 8209238541 anytime" }).comment);
  assert.ok(errorsFor({ comment: "Call me on 820 923 8541 anytime" }).comment);
  assert.ok(errorsFor({ comment: "Call me on 820-923-8541 anytime" }).comment);
  assert.ok(errorsFor({ comment: "See https://example.com for more" }).comment);
  assert.ok(errorsFor({ comment: "See www.example.com for more" }).comment);
  assert.equal(errorsFor({ comment: "I paid 1200 rupees for a 12 inch frame." }).comment, undefined);
  assert.equal(errorsFor({ publicConsent: false }).publicConsent, undefined);
  assert.equal(errorsFor({ publicConsent: undefined }).publicConsent, undefined);
  assert.ok(errorsFor({ reviewId: "short" }).reviewId);
  assert.equal(errorsFor({}).firstName, undefined);
  assert.deepEqual(Object.keys(errorsFor({})), []);
});

test("the stored first name is the first word only and unknown fields are ignored", () => {
  const runtime = makeRuntime();
  const result = runtime.context.submitReview(validForm({ firstName: "Asha Kumari" }));
  assert.equal(result.ok, true);
  assert.equal(runtime.rows[1][6], "Asha");
  assert.doesNotMatch(runtime.rows[1].join("\u001f"), /must not be saved/);
  assert.equal(runtime.rows[1].length, 13);
});

test("products come from the server list, never from the client", () => {
  const runtime = makeRuntime();
  assert.equal(runtime.context.submitReview(validForm({ productId: "studio" })).ok, true);
  assert.equal(runtime.rows[1][4], "studio");
  assert.equal(runtime.rows[1][5], "");
  const known = runtime.context.submitReview(validForm({ reviewId: "review-2234567890", productId: "catalogue:resin-clock.jpg", productName: "Client supplied name" }));
  assert.equal(known.ok, true);
  assert.equal(runtime.rows[2][4], "catalogue:resin-clock.jpg");
  assert.equal(runtime.rows[2][5], "Blue hour resin clock");
  const unknown = runtime.context.submitReview(validForm({ reviewId: "review-3234567890", productId: "catalogue:nope.jpg" }));
  assert.equal(unknown.ok, false);
  assert.ok(unknown.errors.productId);
  assert.equal(runtime.rows.length, 3);
  assert.equal(runtime.state.productFetches, 1, "the product list is fetched once and cached across submits");
});

test("a malformed or unreachable product list blocks product reviews but not studio reviews", () => {
  for (const options of [{ productsBody: "not json" }, { productsBody: JSON.stringify([{ id: "bad id", name: "x" }]) }, { productsBody: JSON.stringify([{ id: "catalogue:a.jpg", name: "A" }, { id: "catalogue:a.jpg", name: "B" }]) }, { productsStatus: 500 }, { productsThrows: true }]) {
    const runtime = makeRuntime(options);
    const product = runtime.context.submitReview(validForm({ productId: "catalogue:a.jpg" }));
    assert.equal(product.ok, false);
    assert.match(product.errors.productId, /product list is unavailable/i);
    assert.equal(runtime.context.submitReview(validForm({ reviewId: "review-4234567890" })).ok, true);
  }
});

test("photos are limited, JPEG only, signed, small and free of metadata", () => {
  const runtime = makeRuntime();
  const photosError = (photos) => runtime.context.validateReview_(runtime.context.collectReview_(validForm({ photos })), {}).photos;
  const submit = (photos, id) => runtime.context.submitReview(validForm({ reviewId: id || "review-5234567890", photos }));
  const clean = photo(makeJpeg());
  assert.equal(photosError([clean, clean, clean]), undefined);
  assert.ok(photosError([clean, clean, clean, clean]));
  assert.ok(photosError([photo(makeJpeg(), "image/png")]));
  assert.ok(photosError([{ type: "image/jpeg", data: "***not base64***" }]));
  assert.ok(photosError([{ type: "image/jpeg", data: "A".repeat(1398105) }]));
  assert.ok(submit([{ type: "image/jpeg", data: Buffer.from("not a jpeg at all").toString("base64") }]).errors.photos);
  assert.ok(submit([photo(makeJpeg({ size: 1024 * 1024 + 1 }))]).errors.photos);
  assert.ok(submit([photo(makeJpeg({ app1: "Exif\0\0MM\0*" }))]).errors.photos);
  assert.ok(submit([photo(makeJpeg({ app1: "http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>" }))]).errors.photos);
  assert.ok(submit([photo(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff])]))]).errors.photos, "a truncated segment fails closed");
  assert.equal(runtime.state.createFileCalls, 0);
  assert.equal(runtime.rows.length, 1);
  assert.equal(submit([photo(makeJpeg({ size: 1024 * 1024 }))], "review-6234567890").ok, true);
  assert.equal(runtime.state.createFileCalls, 1);
});

test("photo files go to the review folder, are named per review and shared by link", () => {
  const runtime = makeRuntime();
  const result = runtime.context.submitReview(validForm({ photos: [photo(makeJpeg()), photo(makeJpeg({ size: 200 }))] }));
  assert.equal(result.ok, true);
  assert.equal(runtime.state.files.length, 2);
  assert.deepEqual(runtime.state.files.map((file) => file.name), ["review-review-1234567890-1.jpg", "review-review-1234567890-2.jpg"]);
  runtime.state.files.forEach((file) => {
    assert.equal(file.folderId, "review-folder");
    assert.deepEqual(file.sharing, ["ANYONE_WITH_LINK", "VIEW"]);
    assert.equal(file.type, "image/jpeg");
  });
  assert.equal(runtime.rows[1][9], runtime.state.files.map((file) => file.id).join(","));
  assert.deepEqual(plain(runtime.state.cacheRemoves), ["reviews-public-v1"]);
  assert.doesNotMatch(source.slice(source.indexOf("function submitReview"), source.indexOf("function collectReview_")), /createReferenceFile_/);
});

test("the review photo folder must be set, different from the order folder and private", () => {
  for (const properties of [{ REVIEW_PHOTOS_FOLDER_ID: "" }, { REVIEW_PHOTOS_FOLDER_ID: "order-folder" }]) {
    const runtime = makeRuntime({ properties });
    assert.throws(() => runtime.context.submitReview(validForm({ photos: [photo(makeJpeg())] })), /Unable to post the review\./);
    assert.equal(runtime.state.createFileCalls, 0);
    assert.equal(runtime.rows.length, 1);
  }
  const open = makeRuntime({ reviewFolderAccess: "ANYONE_WITH_LINK" });
  assert.throws(() => open.context.submitReview(validForm({ photos: [photo(makeJpeg())] })), /Unable to post the review\./);
  assert.equal(open.state.createFileCalls, 0);
  const noPhotos = makeRuntime({ properties: { REVIEW_PHOTOS_FOLDER_ID: "" } });
  assert.equal(noPhotos.context.submitReview(validForm()).ok, true, "a review without photos needs no folder");
});

test("the same review ID and payload is idempotent and a changed payload conflicts", () => {
  const first = makeRuntime();
  const form = validForm({ photos: [photo(makeJpeg())] });
  const created = first.context.submitReview(form);
  assert.equal(created.ok, true);
  assert.deepEqual(Object.keys(created).sort(), ["ok", "receivedAt", "reviewId", "status"]);
  assert.equal(created.status, "Published");
  const filesBefore = first.state.createFileCalls;
  const again = first.context.submitReview(form);
  assert.equal(again.ok, true);
  assert.equal(again.receivedAt, created.receivedAt);
  assert.equal(first.rows.length, 2);
  assert.equal(first.state.createFileCalls, filesBefore, "a replay creates no extra files");
  const conflict = first.context.submitReview(validForm({ comment: "A different comment, but the same ID.", photos: [photo(makeJpeg())] }));
  assert.match(conflict.errors.reviewId, /conflict/i);
  assert.equal(first.state.createFileCalls, filesBefore);
  assert.equal(first.rows.length, 2);
  const otherPhoto = first.context.submitReview(validForm({ photos: [photo(makeJpeg({ size: 300 }))] }));
  assert.match(otherPhoto.errors.reviewId, /conflict/i);
});

test("append failures are reconciled and files follow the row", () => {
  const persisted = makeRuntime({ appendMode: "persisted-throw" });
  const ok = persisted.context.submitReview(validForm({ photos: [photo(makeJpeg())] }));
  assert.equal(ok.ok, true);
  assert.equal(persisted.state.files.filter((file) => file.trashed).length, 0, "a persisted row keeps its photos");
  const failed = makeRuntime({ appendMode: "before-throw" });
  assert.throws(() => failed.context.submitReview(validForm({ photos: [photo(makeJpeg()), photo(makeJpeg({ size: 99 }))] })), /Unable to post the review\./);
  assert.equal(failed.state.files.length, 2);
  assert.equal(failed.state.files.every((file) => file.trashed), true);
  assert.equal(failed.rows.length, 1);
  assert.equal(failed.state.released, 1);
  const locked = makeRuntime({ lockAvailable: false });
  assert.throws(() => locked.context.submitReview(validForm({ photos: [photo(makeJpeg())] })), /Unable to post the review\./);
  assert.equal(locked.state.files.every((file) => file.trashed), true);
  assert.equal(locked.rows.length, 1);
  const driveFailure = makeRuntime({ createFileFailAt: 2 });
  assert.throws(() => driveFailure.context.submitReview(validForm({ photos: [photo(makeJpeg()), photo(makeJpeg({ size: 99 }))] })), /Unable to post the review\./);
  assert.equal(driveFailure.state.files.every((file) => file.trashed), true);
  assert.equal(driveFailure.rows.length, 1);
  const sharingFailure = makeRuntime({ sharingFailure: true });
  assert.throws(() => sharingFailure.context.submitReview(validForm({ photos: [photo(makeJpeg())] })), /Unable to post the review\./);
  assert.equal(sharingFailure.state.files.every((file) => file.trashed), true);
  const duplicated = makeRuntime({ rows: [reviewRow({ id: "review-1234567890", fingerprint: "other" }), reviewRow({ id: "review-1234567890", fingerprint: "other" })] });
  assert.throws(() => duplicated.context.submitReview(validForm({ photos: [photo(makeJpeg())] })), /Unable to post the review\./);
  assert.equal(duplicated.state.createFileCalls, 0);
});

test("a row written by a racing request is honoured inside the lock and the new files are trashed", () => {
  const runtime = makeRuntime();
  const form = validForm({ photos: [photo(makeJpeg())] });
  const original = runtime.context.findReview_;
  let calls = 0;
  runtime.context.findReview_ = (sheet, id) => {
    calls += 1;
    if (calls === 1) return null;
    return { fingerprint: runtime.context.reviewFingerprint_(runtime.context.collectReview_(form), [runtime.context.digestHex_(Array.from(Buffer.from(form.photos[0].data, "base64")).map((byte) => (byte > 127 ? byte - 256 : byte)))]), receivedAt: "2026-11-08T00:00:00.000Z", status: "Published" };
  };
  const result = runtime.context.submitReview(form);
  assert.equal(result.ok, true);
  assert.equal(result.receivedAt, "2026-11-08T00:00:00.000Z");
  assert.equal(runtime.state.files.every((file) => file.trashed), true);
  assert.equal(runtime.rows.length, 1);
  runtime.context.findReview_ = original;
});

test("the daily cap defaults to 20, can be overridden, and creates no files when reached", () => {
  const today = new Date();
  const many = Array.from({ length: 20 }, (_, index) => reviewRow({ id: "review-cap-" + String(index).padStart(6, "0"), at: today }));
  const capped = makeRuntime({ rows: many });
  const blocked = capped.context.submitReview(validForm({ photos: [photo(makeJpeg())] }));
  assert.match(blocked.errors.form, /limit|tomorrow/i);
  assert.equal(capped.state.createFileCalls, 0);
  assert.equal(capped.rows.length, 21);
  const under = makeRuntime({ rows: many.slice(0, 19) });
  assert.equal(under.context.submitReview(validForm()).ok, true);
  const one = makeRuntime({ properties: { REVIEW_DAILY_ACCEPTANCE_CAP: "1" }, rows: [reviewRow({ at: today })] });
  assert.match(one.context.submitReview(validForm()).errors.form, /limit|tomorrow/i);
  const yesterday = makeRuntime({ properties: { REVIEW_DAILY_ACCEPTANCE_CAP: "1" }, rows: [reviewRow({ at: new Date(today.getTime() - 2 * 86400000) })] });
  assert.equal(yesterday.context.submitReview(validForm()).ok, true);
  assert.equal(makeRuntime().context.DEFAULT_REVIEW_DAILY_ACCEPTANCE_CAP, 20);
});

test("formula-looking review text is neutralised before it reaches the Sheet", () => {
  const runtime = makeRuntime();
  const result = runtime.context.submitReview(validForm({ firstName: "=Asha", city: "+Ajmer", comment: "@everyone this frame is lovely, thank you" }));
  assert.equal(result.ok, true);
  assert.equal(runtime.rows[1][6], "'=Asha");
  assert.equal(runtime.rows[1][7], "'+Ajmer");
  assert.equal(runtime.rows[1][8], "'@everyone this frame is lovely, thank you");
  const dash = makeRuntime();
  dash.context.submitReview(validForm({ city: "-Ajmer", comment: "-1+1 is a funny way to start a comment" }));
  assert.equal(dash.rows[1][7], "'-Ajmer");
  assert.equal(dash.rows[1][8], "'-1+1 is a funny way to start a comment");
  assert.match(source, /neutralizeForSheet_\(payload\.comment\)/);
});

test("a stored review row has the fixed shape and records consent, status and fingerprint", () => {
  const runtime = makeRuntime();
  const result = runtime.context.submitReview(validForm({ productId: "catalogue:resin-clock.jpg", rating: "4" }));
  const row = runtime.rows[1];
  assert.equal(row[0], "review-1234567890");
  assert.equal(row[1] instanceof Date || typeof row[1] === "object", true);
  assert.equal(row[2], "Published");
  assert.equal(row[3], 4);
  assert.equal(row[10], true);
  assert.match(row[11], /^[0-9a-f]{64}$/);
  assert.equal(row[12], "");
  assert.equal(result.receivedAt, row[1].toISOString());
  assert.equal(runtime.state.lockCalls, 1);
  assert.equal(runtime.state.released, 1);
});

test("a review sent without the consent field is accepted and stored with Public consent false", () => {
  const runtime = makeRuntime();
  const form = validForm();
  delete form.publicConsent;
  const result = runtime.context.submitReview(form);
  assert.ok(result && result.ok !== false, JSON.stringify(plain(result)));
  assert.equal(runtime.rows.length, 2);
  assert.equal(runtime.rows[1][2], "Published");
  assert.equal(runtime.rows[1][10], false);
});

const FILE_A = "fileAAAAAAAAAAAAAAAAAAAAA1";
const FILE_B = "fileBBBBBBBBBBBBBBBBBBBBB2";
const read = (runtime) => JSON.parse(runtime.context.publicReviewsResponse_().getContent());

test("the public read endpoint returns only exact Published rows with an allowlisted shape", () => {
  const runtime = makeRuntime({ rows: [
    reviewRow({ id: "review-row-published1", rating: 5, at: new Date("2026-11-01T10:00:00Z"), photos: FILE_A + "," + FILE_B, productId: "catalogue:resin-clock.jpg", productName: "Blue hour resin clock" }),
    reviewRow({ id: "review-row-hidden0001", status: "Hidden" }),
    reviewRow({ id: "review-row-removed001", status: "Removed" }),
    reviewRow({ id: "review-row-spaced0001", status: "published " }),
    reviewRow({ id: "review-row-lowercase1", status: "published" }),
    reviewRow({ id: "review-row-blank00001", status: "" }),
    reviewRow({ id: "review-row-badrating1", rating: 9 }),
    reviewRow({ id: "review-row-newest0001", rating: 4, at: new Date("2026-11-05T18:40:00Z"), firstName: "Meera", city: "", photos: "bad id!," + FILE_A }),
  ] });
  const result = read(runtime);
  assert.equal(result.ok, true);
  assert.equal(result.intake, "open");
  assert.deepEqual(result.summary, { count: 2, average: 4.5 });
  assert.deepEqual(result.reviews.map((review) => review.id), ["review-row-newest0001", "review-row-published1"]);
  result.reviews.forEach((review) => assert.deepEqual(Object.keys(review), ["id", "rating", "productId", "productName", "firstName", "city", "comment", "date", "photos"]));
  assert.equal(result.reviews[0].date, "2026-11-06", "dates use the Asia/Kolkata day");
  assert.deepEqual(result.reviews[0].photos, [FILE_A], "invalid photo IDs are dropped");
  assert.deepEqual(result.reviews[1].photos, [FILE_A, FILE_B]);
  assert.deepEqual(Object.keys(result).sort(), ["intake", "ok", "ratings", "reviews", "summary"]);
  const text = JSON.stringify(result);
  assert.doesNotMatch(text, /fp-secret|private staff note|consent/i);
});

test("the public list is capped at 50, newest first, and counts every published review", () => {
  const rows = Array.from({ length: 60 }, (_, index) => reviewRow({ id: "review-many-" + String(index).padStart(6, "0"), at: new Date(Date.UTC(2026, 0, 1) + index * 3600000), rating: index % 2 ? 5 : 4 }));
  const result = read(makeRuntime({ rows }));
  assert.equal(result.reviews.length, 50);
  assert.equal(result.reviews[0].id, "review-many-000059");
  assert.equal(result.summary.count, 60);
  assert.equal(result.summary.average, 4.5);
  assert.equal(read(makeRuntime()).summary.count, 0);
});

test("the public list is cached for six hours, cleared by a write, and intake stays live", () => {
  const runtime = makeRuntime({ rows: [reviewRow({ id: "review-cache-000001" })] });
  assert.equal(read(runtime).reviews.length, 1);
  assert.equal(runtime.state.dataReads, 1);
  assert.equal(runtime.state.cachePuts, 1);
  assert.equal(runtime.state.cacheTtls["reviews-public-v1"], 21600, "kept for the CacheService maximum of six hours");
  assert.equal(read(runtime).reviews.length, 1);
  assert.equal(runtime.state.dataReads, 1, "a cache hit skips the Sheet read");
  runtime.properties.REVIEWS_DISABLED = "true";
  const paused = read(runtime);
  assert.equal(paused.intake, "paused");
  assert.equal(paused.reviews.length, 1, "paused intake still shows reviews");
  assert.equal(runtime.state.dataReads, 1);
  runtime.properties.REVIEWS_DISABLED = "false";
  assert.equal(read(runtime).intake, "open");
  runtime.properties.REVIEWS_CONFIGURED = "";
  assert.equal(read(runtime).intake, "paused");
  runtime.properties.REVIEWS_CONFIGURED = "true";
  assert.equal(runtime.context.submitReview(validForm()).ok, true);
  assert.deepEqual(plain(runtime.state.cacheRemoves), ["reviews-public-v1"]);
  const refreshed = read(runtime);
  assert.equal(refreshed.reviews.length, 2);
  assert.equal(refreshed.reviews[0].firstName, "Asha");
  assert.equal(runtime.state.dataReads > 1, true);
  const big = makeRuntime({ rows: Array.from({ length: 50 }, (_, index) => reviewRow({ id: "review-big-" + String(index).padStart(7, "0"), comment: "x".repeat(3000) })) });
  assert.equal(read(big).reviews.length, 50);
  assert.equal(big.state.cachePuts, 0, "a body over 95,000 characters is not cached");
});

test("read failures and an unconfigured backend fail closed", () => {
  const failing = makeRuntime({ readThrows: true });
  assert.deepEqual(read(failing), { ok: false });
  const wrongSchema = makeRuntime({ headers: ["wrong"] });
  assert.deepEqual(read(wrongSchema), { ok: false });
  const missingTab = makeRuntime({ noTab: true });
  assert.deepEqual(read(missingTab), { ok: false });
  const unconfigured = makeRuntime({ properties: { REVIEWS_CONFIGURED: "" }, rows: [reviewRow()] });
  const result = read(unconfigured);
  assert.deepEqual(result, { ok: true, intake: "paused", summary: { count: 0, average: 0 }, reviews: [], ratings: {} });
  assert.equal(unconfigured.state.dataReads, 0);
  const response = makeRuntime({ rows: [reviewRow()] }).context.doGet({ parameter: { action: "reviews" } });
  assert.equal(response.mime, "JSON");
  assert.equal(JSON.parse(response.getContent()).ok, true);
});

test("doGet without the reviews action still renders only a bounded form", () => {
  const runtime = makeRuntime();
  runtime.context.doGet({ parameter: { action: "other", mode: "corporate" } });
  assert.equal(runtime.state.templateName, "CorporateForm");
  runtime.context.doGet({});
  assert.equal(runtime.state.templateName, "Form");
});

test("a Reviews tab edit clears the cache and Hidden, Removed and Published change the photo files", () => {
  const rows = [reviewRow({ id: "review-edit-0000001", status: "Hidden", photos: FILE_A + "," + FILE_B })];
  const runtime = makeRuntime({ rows, existingFiles: [FILE_A, FILE_B] });
  runtime.state.cache.set("reviews-public-v1", "{}");
  runtime.context.onReviewsSheetEdit_({ range: runtime.sheet.getRange(2, 3) });
  assert.equal(runtime.state.cache.has("reviews-public-v1"), false);
  [FILE_A, FILE_B].forEach((id) => assert.deepEqual(runtime.fileById[id].sharing, ["PRIVATE", "NONE"]));
  runtime.rows[1][2] = "Published";
  runtime.context.onReviewsSheetEdit_({ range: runtime.sheet.getRange(2, 3) });
  [FILE_A, FILE_B].forEach((id) => assert.deepEqual(runtime.fileById[id].sharing, ["ANYONE_WITH_LINK", "VIEW"]));
  runtime.rows[1][2] = "Removed";
  const removesBefore = runtime.state.cacheRemoves.length;
  runtime.context.onReviewsSheetEdit_({ range: runtime.sheet.getRange(2, 3) });
  assert.deepEqual(plain(runtime.state.removed), [FILE_A, FILE_B]);
  assert.equal(runtime.rows[1][9], "");
  assert.equal(runtime.state.cacheRemoves.length - removesBefore, 2, "cleared again after the photo IDs change, so a read during the edit cannot keep old photos for hours");
  assert.equal(runtime.rows[1][2], "Removed");
});

test("a Reviews edit outside the Status column, in another tab, or in the header leaves photos alone", () => {
  const runtime = makeRuntime({ rows: [reviewRow({ id: "review-edit-0000002", status: "Hidden", photos: FILE_A })], existingFiles: [FILE_A] });
  runtime.state.cache.set("reviews-public-v1", "{}");
  runtime.context.onReviewsSheetEdit_({ range: runtime.sheet.getRange(2, 9) });
  assert.equal(runtime.state.cache.has("reviews-public-v1"), false, "any Reviews edit clears the cache");
  assert.deepEqual(runtime.fileById[FILE_A].sharing, ["ANYONE_WITH_LINK", "VIEW"]);
  runtime.context.onReviewsSheetEdit_({ range: runtime.sheet.getRange(1, 3) });
  assert.deepEqual(runtime.fileById[FILE_A].sharing, ["ANYONE_WITH_LINK", "VIEW"]);
  runtime.state.cache.set("reviews-public-v1", "{}");
  runtime.context.onReviewsSheetEdit_({ range: runtime.sheets.Orders.getRange(2, 3) });
  assert.equal(runtime.state.cache.has("reviews-public-v1"), true, "other tabs are ignored");
  assert.deepEqual(runtime.state.removed, []);
  runtime.context.onReviewsSheetEdit_({});
  runtime.context.onReviewsSheetEdit_(undefined);
});

test("a multi-row Status paste updates every row, and a failed delete keeps the IDs for a retry", () => {
  const rows = [reviewRow({ id: "review-edit-0000003", status: "Hidden", photos: FILE_A }), reviewRow({ id: "review-edit-0000004", status: "Hidden", photos: FILE_B })];
  const runtime = makeRuntime({ rows, existingFiles: [FILE_A, FILE_B] });
  runtime.context.onReviewsSheetEdit_({ range: runtime.sheet.getRange(2, 3, 2, 1) });
  assert.deepEqual(runtime.fileById[FILE_B].sharing, ["PRIVATE", "NONE"]);
  const failing = makeRuntime({ rows: [reviewRow({ status: "Removed", photos: FILE_A })], existingFiles: [FILE_A], removeThrows: true });
  assert.throws(() => failing.context.onReviewsSheetEdit_({ range: failing.sheet.getRange(2, 3) }), /photo update failed/i);
  assert.equal(failing.rows[1][9], FILE_A);
});

test("setupReviews is owner-only, builds the exact schema, protects the tab and installs one trigger", () => {
  const stranger = makeRuntime({ noTab: true, properties: { REVIEWS_CONFIGURED: "" } });
  assert.throws(() => stranger.context.setupReviews(), /deployment owner/);
  const owner = { noTab: true, activeEmail: "owner@example.com", effectiveEmail: "owner@example.com", properties: { REVIEWS_CONFIGURED: "" } };
  const runtime = makeRuntime(owner);
  assert.deepEqual(plain(runtime.context.setupReviews()), { tab: "Reviews", columns: 13, trigger: true });
  assert.deepEqual(runtime.sheets.Reviews.data[0], REVIEW_HEADERS);
  assert.equal(runtime.sheets.Reviews.protections.length, 1);
  assert.equal(runtime.sheets.Reviews.protections[0].warningOnly, false);
  assert.deepEqual(plain(runtime.sheets.Reviews.validations[0].rule), { list: ["Published", "Hidden", "Removed"], dropdown: true, allowInvalid: false });
  assert.equal(runtime.sheets.Reviews.validations[0].column, 3);
  assert.equal(runtime.state.triggerCreates, 1);
  assert.deepEqual(plain(runtime.state.triggers[0].config), { handler: "onReviewsSheetEdit_", spreadsheet: "sheet", event: "onEdit" });
  assert.equal(runtime.properties.REVIEWS_CONFIGURED, "true");
  runtime.context.setupReviews();
  assert.equal(runtime.state.triggerCreates, 1, "running setup twice keeps one trigger");
  assert.equal(runtime.sheets.Reviews.protections.length, 1);
});

test("setupReviews refuses unsafe folders, wrong schemas and failed protection without marking reviews ready", () => {
  const base = { noTab: true, activeEmail: "owner@example.com", effectiveEmail: "owner@example.com" };
  const cases = [
    [{ properties: { REVIEWS_CONFIGURED: "", REVIEW_PHOTOS_FOLDER_ID: "order-folder" } }, /folder/i],
    [{ properties: { REVIEWS_CONFIGURED: "", REVIEW_PHOTOS_FOLDER_ID: "" } }, /folder/i],
    [{ properties: { REVIEWS_CONFIGURED: "" }, reviewFolderAccess: "ANYONE_WITH_LINK" }, /restricted|private/i],
    [{ noTab: false, headers: ["wrong schema"], properties: { REVIEWS_CONFIGURED: "" } }, /schema/i],
    [{ properties: { REVIEWS_CONFIGURED: "" }, protectFailure: true }, /protect/i],
  ];
  for (const [extra, pattern] of cases) {
    const runtime = makeRuntime(Object.assign({}, base, extra));
    assert.throws(() => runtime.context.setupReviews(), pattern);
    assert.equal(runtime.properties.REVIEWS_CONFIGURED, "");
    assert.equal(runtime.state.triggerCreates, 0 + (extra.protectFailure ? 0 : 0));
  }
});

test("the 90-day order retention never touches review rows or review photos", () => {
  const old = new Date(Date.now() - 200 * 86400000);
  const orderRow = new Array(26).fill("");
  orderRow[0] = "request-expired-0001";
  orderRow[2] = new Date(Date.now() - 120 * 86400000);
  const runtime = makeRuntime({ rows: [reviewRow({ id: "review-old-00000001", at: old, photos: FILE_A })], existingFiles: [FILE_A], orderRows: [orderRow] });
  const summary = runtime.context.purgeExpiredOrdersAt_(new Date());
  assert.equal(summary.deletedRows, 1);
  assert.deepEqual(plain(runtime.state.rowDeletes), [2], "only the order row was deleted");
  assert.equal(runtime.sheets.Orders.data.length, 1);
  assert.equal(runtime.rows.length, 2);
  assert.deepEqual(runtime.state.removed, []);
  assert.deepEqual(runtime.fileById[FILE_A].sharing, ["ANYONE_WITH_LINK", "VIEW"]);
});

// ---- ReviewForm.html (iframe form) ----
const formHtml = fs.existsSync(path.join(root, "apps-script", "ReviewForm.html")) ? fs.readFileSync(path.join(root, "apps-script", "ReviewForm.html"), "utf8") : "";

class FormElement {
  constructor(id, name, value = "") {
    Object.assign(this, { id, name: name || id, value, textContent: "", hidden: false, disabled: false, checked: false, className: "", listeners: {}, attributes: {}, children: [], parentNode: null, focused: false, files: [] });
  }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  dispatch(type, event = {}) { if (this.listeners[type]) this.listeners[type](Object.assign({ target: this }, event)); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || ""; }
  removeAttribute(name) { delete this.attributes[name]; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); return child; }
  get firstChild() { return this.children[0] || null; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this); }
  focus() { this.focused = true; }
}
class FormPort {
  constructor() { this.peer = null; this.onmessage = null; this.closed = false; }
  postMessage(data) { if (!this.closed && this.peer && this.peer.onmessage) this.peer.onmessage({ data }); }
  close() { this.closed = true; }
}
class FormChannel { constructor() { this.port1 = new FormPort(); this.port2 = new FormPort(); this.port1.peer = this.port2; this.port2.peer = this.port1; } }

function makeFormRuntime(options = {}) {
  assert.ok(formHtml, "apps-script/ReviewForm.html must exist");
  const sourceScript = formHtml.match(/<script>\n([\s\S]*?)\n<\/script>/)[1]
    .replace(/<\?!= reviewsPausedJson \?>/g, options.paused ? "true" : "false")
    .replace(/<\?!= captchaEnabledJson \?>/g, "true")
    .replace(/<\?!= captchaSiteKeyJson \?>/g, JSON.stringify("site-key"));
  const ids = ["seed-data", "review-products-data", "form-status", "submit-button", "another-button", "paused-message", "product-id", "product-hint", "rating-group", "review-photos", "photo-previews", "review-form"];
  const elements = new Map(ids.map((id) => [id, new FormElement(id)]));
  const fields = { productId: elements.get("product-id"), rating: new FormElement("rating"), firstName: new FormElement("first-name", "firstName"), city: new FormElement("city", "city"), comment: new FormElement("comment", "comment"), reviewId: new FormElement("review-id", "reviewId"), captchaToken: new FormElement("captcha-token", "captchaToken"), photos: elements.get("review-photos") };
  fields.productId.name = "productId"; fields.photos.name = "photos"; fields.rating.name = "rating";
  fields.rating.setAttribute = fields.rating.setAttribute.bind(fields.rating);
  ["product-hint", "paused-message", "another-button"].forEach((id) => { elements.get(id).hidden = true; });
  const form = elements.get("review-form");
  form.elements = fields;
  const fieldsets = [new FormElement("details"), new FormElement("photos-fieldset")];
  const errors = [];
  form.querySelectorAll = (selector) => {
    if (selector === "[aria-invalid]") return Object.values(fields).filter((field) => field.getAttribute("aria-invalid"));
    if (selector === ".field-error") return errors;
    if (selector === "fieldset, #submit-button") return fieldsets.concat([elements.get("submit-button")]);
    return [];
  };
  form.reset = () => { ["productId", "rating", "firstName", "city", "comment"].forEach((name) => { fields[name].value = name === "productId" ? "studio" : ""; }); };
  Object.values(fields).forEach((field) => { field.parentNode = { children: [], appendChild(child) { errors.push(child); } }; });
  elements.get("rating-group").appendChild = (child) => { errors.push(child); return child; };
  fields.productId.value = "studio";
  elements.get("seed-data").textContent = JSON.stringify(Object.assign({ reviewId: "review-seed-123456", channelNonce: "nonce-seed-123456" }, options.seed));
  elements.get("review-products-data").textContent = options.products === undefined ? JSON.stringify(DEFAULT_PRODUCTS) : JSON.stringify(options.products);
  const status = elements.get("form-status");
  status.setAttribute("tabindex", "-1");
  const timers = []; const submissions = []; const callbacks = []; const parentMessages = []; const canvases = []; const revoked = [];
  const run = {
    withSuccessHandler(callback) { this.success = callback; return this; },
    withFailureHandler(callback) { this.failure = callback; return this; },
    submitReview(value) { submissions.push(JSON.parse(JSON.stringify(value))); callbacks.push({ success: this.success, failure: this.failure }); return this; },
  };
  const imageBehaviour = options.image || { width: 4000, height: 3000 };
  class FakeImage {
    set src(value) {
      this._src = value;
      const finish = () => { if (imageBehaviour.fail) this.onerror(); else { this.naturalWidth = imageBehaviour.width; this.naturalHeight = imageBehaviour.height; this.onload(); } };
      if (imageBehaviour.defer) pendingImages.push(finish); else finish();
    }
  }
  const encoder = options.encoder || ((quality) => (quality > 0.7 ? 1500000 : 800000));
  const pendingImages = [];
  const windowObject = {
    crypto: { randomUUID: (() => { let count = 0; return () => "review-attempt-" + (++count) + "-abcdef"; })() },
    MessageChannel: FormChannel, Image: FakeImage,
    atob: (text) => Buffer.from(text, "base64").toString("binary"), btoa: (text) => Buffer.from(text, "binary").toString("base64"),
    URL: { createObjectURL: () => "blob:original-photo", revokeObjectURL: (url) => revoked.push(url) },
    setTimeout(callback) { timers.push(callback); return timers.length; }, clearTimeout() {},
    top: { postMessage(message, targetOrigin, ports) { parentMessages.push({ message, targetOrigin, port: ports && ports[0] }); } },
  };
  const documentObject = {
    getElementById: (id) => elements.get(id) || null,
    createElement(tag) {
      const element = new FormElement(tag);
      if (tag === "canvas") {
        canvases.push(element);
        if (!options.noCanvas) {
          element.calls = []; element.qualities = [];
          element.getContext = () => ({ set fillStyle(value) { element.calls.push(["fillStyle", value]); }, fillRect: (...args) => element.calls.push(["fillRect", ...args]), drawImage: (...args) => element.calls.push(["drawImage", ...args.slice(1)]) });
          element.toDataURL = (type, quality) => {
            if (options.toDataUrlThrows) throw new Error("tainted");
            element.qualities.push(quality);
            if (options.dataUrl) return options.dataUrl(quality);
            return (options.notJpeg ? "data:image/png;base64," : "data:image/jpeg;base64,") + makeJpeg({ size: Math.max(encoder(quality), 200) }).toString("base64");
          };
        }
      }
      return element;
    },
  };
  const context = { console, document: documentObject, window: windowObject, google: { script: { run } }, Math, JSON, Date, Array, Object, String, Number, Boolean, RegExp };
  vm.createContext(context);
  vm.runInContext(sourceScript, context, { filename: "ReviewForm.html" });
  return { imageBehaviour, pendingImages, elements, fields, form, fieldsets, status, timers, submissions, callbacks, parentMessages, canvases, revoked, previews: elements.get("photo-previews"), fileInput: elements.get("review-photos"), errors };
}

function fillReviewForm(runtime, overrides = {}) {
  const values = Object.assign({ rating: "5", firstName: "Asha Kumari", city: "Ajmer", comment: "Lovely resin frame, arrived safely and looks beautiful.", productId: "studio" }, overrides);
  Object.keys(values).forEach((name) => { runtime.fields[name].value = values[name]; });
}
function respondReviewCaptcha(runtime, index, overrides = {}) {
  const request = runtime.parentMessages.filter((entry) => entry.message.type === "saloni-order-captcha-request")[index];
  assert.ok(request, "captcha request should exist");
  request.port.postMessage(Object.assign({ type: "saloni-order-captcha-response", nonce: request.message.nonce, attemptId: request.message.attemptId, ok: true, token: "captcha-token" }, overrides));
}
function addPhotos(runtime, files) {
  runtime.fileInput.files = files;
  runtime.fileInput.dispatch("change");
}
const jpegFile = (size = 3 * 1024 * 1024) => ({ type: "image/jpeg", size, name: "IMG_0001.jpg" });

test("the review form script parses and announces itself to the parent with its mode", () => {
  assert.ok(formHtml);
  const sourceScript = formHtml.match(/<script>\n([\s\S]*?)\n<\/script>/)[1].replace(/<\?!= \w+ \?>/g, "true");
  assert.doesNotThrow(() => new vm.Script(sourceScript));
  assert.match(formHtml, /id="form-status"[^>]*tabindex="-1"/);
  assert.match(formHtml, /<seedScript|<script id="seed-data" type="application\/json"><\?!= seedJson \?><\/script>/);
  const runtime = makeFormRuntime();
  assert.equal(runtime.fields.reviewId.value, "review-seed-123456");
  const ready = runtime.parentMessages.find((entry) => entry.message.type === "saloni-order-form-ready");
  assert.equal(ready.message.mode, "review");
  assert.equal(ready.targetOrigin, "https://saloniresinart.com");
});

test("the form starts on the product and rating from the seed only when they are valid", () => {
  const runtime = makeFormRuntime({ seed: { productId: DEFAULT_PRODUCTS[1].id, rating: "4" } });
  assert.equal(runtime.fields.productId.value, DEFAULT_PRODUCTS[1].id);
  assert.equal(runtime.fields.rating.value, "4");
  const unknown = makeFormRuntime({ seed: { productId: "catalogue:not-a-product.jpg", rating: "7" } });
  assert.equal(unknown.fields.productId.value, "studio");
  assert.equal(unknown.fields.rating.value, "");
  assert.equal(runtime.fields.firstName.value, "");
  const named = makeFormRuntime({ seed: { firstName: "Asha" } });
  assert.equal(named.fields.firstName.value, "Asha");
  const noList = makeFormRuntime({ products: null, seed: { productId: DEFAULT_PRODUCTS[1].id, rating: "5" } });
  assert.equal(noList.fields.productId.value, "studio");
  assert.equal(noList.fields.rating.value, "5");
});

test("the review form has the specified fields and no consent checkbox, consent text or intro", () => {
  for (const name of ["productId", "rating", "firstName", "city", "comment", "reviewId", "captchaToken", "photos"]) assert.match(formHtml, new RegExp('name="' + name + '"'));
  assert.equal((formHtml.match(/type="radio" name="rating"/g) || []).length, 5);
  assert.match(formHtml, /<option value="studio">The studio in general<\/option>/);
  assert.match(formHtml, /name="firstName" maxlength="40" autocomplete="given-name"/);
  assert.match(formHtml, /First name \(shown publicly\)/);
  assert.match(formHtml, /name="city" maxlength="60"/);
  assert.match(formHtml, /name="comment" maxlength="800"/);
  assert.match(formHtml, /type="file"[^>]*accept="image\/jpeg,image\/png"[^>]*multiple/);
  assert.doesNotMatch(formHtml, /publicConsent|public-consent|<input[^>]*type="checkbox"|class="consent"|I agree that|Reviews stay until removed|Show my review/);
  assert.doesNotMatch(formHtml, /class="intro"|Tell others about your Saloni resin art|appears on the Reviews page/);
  assert.match(formHtml, /Reviews are public on the home page\./);
  assert.doesNotMatch(formHtml, /public on the Reviews page|saloni-review-submitted|notifyParent/);
  assert.doesNotMatch(formHtml, /Do not include phone numbers|Location data is removed/);
  assert.match(formHtml, /Post review/);
  assert.match(formHtml, /Write another review/);
  assert.doesNotMatch(formHtml, /name="(phone|email)"|localStorage|sessionStorage|innerHTML/);
});

test("product choices come from the server list through text nodes, with a hint when the list is missing", () => {
  const runtime = makeFormRuntime({ products: [{ id: "catalogue:a.jpg", name: "<img src=x onerror=alert(1)>" }, { id: 5, name: "bad" }] });
  const group = runtime.fields.productId.children[0];
  assert.equal(group.label, "Products");
  assert.equal(group.children.length, 1);
  assert.equal(group.children[0].textContent, "<img src=x onerror=alert(1)>");
  assert.equal(group.children[0].value, "catalogue:a.jpg");
  assert.equal(runtime.elements.get("product-hint").hidden, true);
  const missing = makeFormRuntime({ products: null });
  assert.equal(missing.fields.productId.children.length, 0);
  assert.equal(missing.elements.get("product-hint").hidden, false);
  const paused = makeFormRuntime({ paused: true });
  assert.equal(paused.form.hidden, true);
  assert.equal(paused.elements.get("paused-message").hidden, false);
  assert.match(formHtml, /New reviews are paused right now\./);
});

test("the form checks the rating, names, comment and contact details before sending", () => {
  const runtime = makeFormRuntime();
  fillReviewForm(runtime, { rating: "", firstName: "A1", city: "Ajmer 305001", comment: "short" });
  runtime.form.dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.submissions.length, 0);
  assert.equal(runtime.parentMessages.filter((entry) => entry.message.type === "saloni-order-captcha-request").length, 0);
  assert.deepEqual(runtime.errors.map((error) => error.id).sort(), ["city-error", "comment-error", "firstName-error", "rating-error"]);
  for (const comment of ["Mail me at asha@example.com please", "Call 820 923 8541 for details", "Visit www.example.com now"]) {
    const again = makeFormRuntime();
    fillReviewForm(again, { comment });
    again.form.dispatch("submit", { preventDefault() {} });
    assert.equal(again.submissions.length, 0, comment);
    assert.ok(again.errors.some((error) => error.id === "comment-error"));
  }
});

test("a valid review is sent with the parent captcha token and the exact payload shape", () => {
  const runtime = makeFormRuntime();
  fillReviewForm(runtime);
  runtime.form.dispatch("submit", { preventDefault() {} });
  const request = runtime.parentMessages.find((entry) => entry.message.type === "saloni-order-captcha-request");
  assert.equal(request.message.mode, "review");
  assert.equal(request.message.nonce, "nonce-seed-123456");
  respondReviewCaptcha(runtime, 0);
  assert.equal(runtime.submissions.length, 1);
  assert.deepEqual(runtime.submissions[0], { reviewId: "review-seed-123456", productId: "studio", rating: "5", firstName: "Asha Kumari", city: "Ajmer", comment: "Lovely resin frame, arrived safely and looks beautiful.", photos: [], captchaToken: "captcha-token" });
});

test("review success thanks the first name, says where the review shows and offers another review", () => {
  const runtime = makeFormRuntime();
  fillReviewForm(runtime);
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondReviewCaptcha(runtime, 0);
  runtime.callbacks[0].success({ ok: true, reviewId: "review-seed-123456", receivedAt: "now", status: "Published" });
  assert.equal(runtime.status.textContent, "Thank you, Asha. Your review now shows on the home page of saloniresinart.com.");
  assert.equal(runtime.status.className, "status success");
  assert.equal(runtime.fieldsets.every((fieldset) => fieldset.hidden), true);
  assert.equal(runtime.elements.get("another-button").hidden, false);
  assert.equal(runtime.parentMessages.some((entry) => entry.message.type === "saloni-review-submitted"), false, "the parent no longer listens, so nothing is posted");
  runtime.elements.get("another-button").dispatch("click");
  assert.notEqual(runtime.fields.reviewId.value, "review-seed-123456");
  assert.equal(runtime.status.textContent, "");
  assert.equal(runtime.fieldsets.some((fieldset) => fieldset.hidden), false);
});

test("the review form rejects a wrong nonce or attempt, ignores stale success and offers conflict recovery", () => {
  const runtime = makeFormRuntime();
  fillReviewForm(runtime);
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondReviewCaptcha(runtime, 0, { nonce: "wrong-nonce" });
  respondReviewCaptcha(runtime, 0, { attemptId: "wrong-attempt" });
  assert.equal(runtime.submissions.length, 0);
  respondReviewCaptcha(runtime, 0);
  const original = runtime.submissions[0];
  runtime.fields.comment.value = "Edited while the first request was pending, still long enough.";
  runtime.timers[0]();
  assert.match(runtime.status.textContent, /changed while an earlier review/i);
  assert.equal(runtime.elements.get("another-button").hidden, false);
  const before = runtime.status.textContent;
  runtime.callbacks[0].success({ ok: true, reviewId: original.reviewId, receivedAt: "late" });
  assert.equal(runtime.status.textContent, before);
  runtime.form.dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.submissions.length, 1, "a changed payload must not be sent under the old ID");
  runtime.elements.get("another-button").dispatch("click");
  assert.notEqual(runtime.fields.reviewId.value, original.reviewId);
});

test("an uncertain review retry resends the same snapshot and stale callbacks cannot control it", () => {
  const runtime = makeFormRuntime();
  fillReviewForm(runtime);
  addPhotos(runtime, [jpegFile()]);
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondReviewCaptcha(runtime, 0);
  const original = runtime.submissions[0];
  runtime.timers[0]();
  assert.match(runtime.status.textContent, /could not confirm/i);
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondReviewCaptcha(runtime, 1);
  assert.equal(runtime.submissions.length, 2);
  assert.deepEqual(runtime.submissions[1], Object.assign({}, original));
  runtime.callbacks[0].success({ ok: true });
  assert.match(runtime.status.textContent, /checking/i);
  runtime.callbacks[1].success({ ok: true });
  assert.match(runtime.status.textContent, /Thank you, Asha/);
  const failing = makeFormRuntime();
  fillReviewForm(failing);
  failing.form.dispatch("submit", { preventDefault() {} });
  respondReviewCaptcha(failing, 0);
  failing.callbacks[0].failure(new Error("network"));
  assert.match(failing.status.textContent, /could not confirm/i);
  assert.equal(failing.status.focused, true);
  const captchaFailure = makeFormRuntime();
  fillReviewForm(captchaFailure);
  captchaFailure.form.dispatch("submit", { preventDefault() {} });
  respondReviewCaptcha(captchaFailure, 0, { ok: false, token: "" });
  assert.match(captchaFailure.status.textContent, /Captcha verification is required/);
  assert.equal(captchaFailure.submissions.length, 0);
});

test("server field errors land on the right field and keep the form open for a fix", () => {
  const runtime = makeFormRuntime();
  fillReviewForm(runtime);
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondReviewCaptcha(runtime, 0);
  runtime.callbacks[0].success({ ok: false, errors: { comment: "Please remove phone numbers, emails and web links from your review." } });
  assert.ok(runtime.errors.some((error) => error.id === "comment-error" && /remove phone numbers/.test(error.textContent)));
  assert.equal(runtime.fields.comment.focused, true);
  assert.equal(runtime.fieldsets.some((fieldset) => fieldset.hidden), false);
  runtime.fields.comment.value = "Fixed, and a bit longer than ten characters.";
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondReviewCaptcha(runtime, 1);
  assert.equal(runtime.submissions.length, 2);
});

test("photos are redrawn on a white canvas, shrunk until at most 1 MB, and the original is never sent", () => {
  const runtime = makeFormRuntime();
  addPhotos(runtime, [jpegFile(), { type: "image/png", size: 2000000, name: "shot.png" }]);
  assert.equal(runtime.canvases.length, 2);
  const canvas = runtime.canvases[0];
  assert.equal(canvas.width, 1600);
  assert.equal(canvas.height, 1200);
  assert.deepEqual(canvas.calls.slice(0, 2), [["fillStyle", "#fff"], ["fillRect", 0, 0, 1600, 1200]]);
  assert.deepEqual(canvas.calls[2], ["drawImage", 0, 0, 1600, 1200]);
  assert.deepEqual(canvas.qualities, [0.85, 0.72, 0.6], "quality steps down until the result fits in 1 MB");
  assert.deepEqual(runtime.revoked, ["blob:original-photo", "blob:original-photo"]);
  assert.equal(runtime.previews.children.length, 2);
  assert.equal(runtime.previews.children[0].children[1].textContent, "Remove");
  fillReviewForm(runtime);
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondReviewCaptcha(runtime, 0);
  const sent = runtime.submissions[0];
  assert.equal(sent.photos.length, 2);
  sent.photos.forEach((item) => { assert.equal(item.type, "image/jpeg"); assert.equal(item.data, makeJpeg({ size: 800000 }).toString("base64")); });
  assert.doesNotMatch(JSON.stringify(sent), /blob:|IMG_0001|shot\.png/);
  const small = makeFormRuntime({ image: { width: 800, height: 600 }, encoder: () => 90000 });
  addPhotos(small, [jpegFile()]);
  assert.equal(small.canvases[0].width, 800, "small photos are not scaled up");
  assert.deepEqual(small.canvases[0].qualities, [0.85]);
});

test("a photo that cannot be prepared is rejected, never sent as the original", () => {
  const cases = [
    [{ noCanvas: true }, [jpegFile()]],
    [{ toDataUrlThrows: true }, [jpegFile()]],
    [{ image: { fail: true } }, [jpegFile()]],
    [{ encoder: () => 2000000 }, [jpegFile()]],
    [{ notJpeg: true }, [jpegFile()]],
  ];
  for (const [options, files] of cases) {
    const runtime = makeFormRuntime(options);
    addPhotos(runtime, files);
    assert.ok(runtime.errors.some((error) => error.id === "photos-error" && /could not be prepared; try another photo or post without photos/.test(error.textContent)), JSON.stringify(options));
    assert.equal(runtime.previews.children.length, 0);
    fillReviewForm(runtime);
    runtime.form.dispatch("submit", { preventDefault() {} });
    respondReviewCaptcha(runtime, 0);
    assert.deepEqual(runtime.submissions[0].photos, []);
  }
  const wrongType = makeFormRuntime();
  addPhotos(wrongType, [{ type: "image/gif", size: 1000, name: "a.gif" }]);
  assert.equal(wrongType.canvases.length, 0);
  assert.ok(wrongType.errors.some((error) => error.id === "photos-error"));
  const huge = makeFormRuntime();
  addPhotos(huge, [jpegFile(15 * 1024 * 1024 + 1)]);
  assert.equal(huge.canvases.length, 0);
  assert.ok(huge.errors.some((error) => /15 MB/.test(error.textContent)));
  const exact = makeFormRuntime();
  addPhotos(exact, [jpegFile(15 * 1024 * 1024)]);
  assert.equal(exact.canvases.length, 1);
});

test("more than three photos are rejected and a photo can be removed before sending", () => {
  const runtime = makeFormRuntime();
  addPhotos(runtime, [jpegFile(), jpegFile(), jpegFile(), jpegFile()]);
  assert.equal(runtime.previews.children.length, 0);
  assert.ok(runtime.errors.some((error) => error.id === "photos-error" && /up to 3 photos/.test(error.textContent)));
  addPhotos(runtime, [jpegFile(), jpegFile()]);
  addPhotos(runtime, [jpegFile(), jpegFile()]);
  assert.equal(runtime.previews.children.length, 2, "a second pick that would pass three is rejected as a whole");
  runtime.previews.children[0].children[1].dispatch("click");
  assert.equal(runtime.previews.children.length, 1);
  addPhotos(runtime, [jpegFile()]);
  assert.equal(runtime.previews.children.length, 2);
  fillReviewForm(runtime);
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondReviewCaptcha(runtime, 0);
  assert.equal(runtime.submissions[0].photos.length, 2);
});

test("a photo change after an uncertain send is treated as a changed payload", () => {
  const runtime = makeFormRuntime();
  fillReviewForm(runtime);
  addPhotos(runtime, [jpegFile()]);
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondReviewCaptcha(runtime, 0);
  runtime.timers[0]();
  runtime.previews.children[0].children[1].dispatch("click");
  runtime.form.dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.submissions.length, 1);
  assert.match(runtime.status.textContent, /Write another review/);
});

// ---- script.js on the Reviews page ----
const siteScript = fs.readFileSync(path.join(root, "script.js"), "utf8");
const ORIGIN = "https://n-current-script.googleusercontent.com";
const PHOTO_ONE = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const CALM = "Reviews could not be loaded right now. Please try again later.";

class DomNode {
  constructor(tag, id, allowHtml) {
    Object.assign(this, { tag, id: id || "", allowHtml: Boolean(allowHtml), children: [], attributes: {}, listeners: {}, textContent: "", hidden: false, className: "", parentNode: null, classList: { add() {}, remove() {} }, name: id || "", value: "", contentWindow: {}, removed: false });
  }
  get innerHTML() { return this._html || ""; }
  set innerHTML(value) { if (!this.allowHtml) throw new Error("innerHTML must not be used for review data"); this._html = String(value); this.textContent = this._html.replace(/<[^>]*>/g, ""); }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  dispatch(type, event = {}) { if (this.listeners[type]) this.listeners[type](Object.assign({ target: this }, event)); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || ""; }
  removeAttribute(name) { delete this.attributes[name]; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); child.parentNode = null; return child; }
  get firstChild() { return this.children[0] || null; }
  remove() { this.removed = true; if (this.parentNode) this.parentNode.removeChild(this); }
  focus() {}
}
const walk = (node, visit) => { visit(node); node.children.forEach((child) => walk(child, visit)); };
const findAll = (node, predicate) => { const out = []; walk(node, (item) => { if (predicate(item)) out.push(item); }); return out; };
const settle = async () => { for (let index = 0; index < 6; index += 1) await new Promise((resolve) => setImmediate(resolve)); };

function sampleReview(overrides = {}) {
  return Object.assign({ id: "review-sample-0001", rating: 4, productId: "studio", productName: "", firstName: "Asha", city: "Ajmer", comment: "Lovely frame.", date: "2026-11-08", photos: [] }, overrides);
}

function runReviewsPage(options = {}) {
  const posted = []; const fetchCalls = []; const timers = []; const executed = []; const deferred = [];
  const elements = new Map();
  const embed = new DomNode("div", "order-form-embed", true);
  if (!options.home) embed.attributes["data-form-mode"] = "review";
  embed.attributes["data-order-form-url"] = options.configured === false ? "https://script.google.test/REPLACE_WITH_ID/exec" : "https://script.google.test/exec";
  const frame = new DomNode("iframe", "order-form-frame", true); frame.name = "order-frame"; frame.hidden = true;
  frame.parentNode = { replaceChild(next, previous) { elements.set(next.id, next); next.parentNode = this; previous.parentNode = null; } };
  const status = new DomNode("div", "order-form-status", true);
  const summary = new DomNode("p", "reviews-summary"); summary.hidden = true;
  const reviewsStatus = new DomNode("p", "reviews-status"); reviewsStatus.textContent = "Loading reviews…";
  const list = new DomNode("ul", "reviews-list");
  const section = new DomNode("section", "customer-reviews");
  // Only the home page has the reviews section; the write page has none.
  (options.home ? [embed, frame, status, summary, reviewsStatus, list, section] : [embed, frame, status]).forEach((element) => elements.set(element.id, element));
  let response = options.body;
  const windowObject = {
    location: { href: "https://saloniresinart.com/" + (options.home ? "" : "reviews/") + (options.search || ""), search: options.search || "" }, matchMedia: () => ({ matches: false }), crypto: { randomUUID: (() => { let n = 0; return () => "request-" + (++n); })() },
    addEventListener(type, listener) { if (type === "message") this.messageListener = listener; },
    setTimeout: (callback) => { timers.push(callback); return timers.length; }, clearTimeout() {},
    grecaptcha: { ready: (callback) => callback(), execute: (siteKey, request) => { executed.push(request); return Promise.resolve("parent-token"); } },
  };
  const store = Object.assign({}, options.storage);
  if (options.brokenStorage) {
    windowObject.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  } else if (options.storage) {
    windowObject.localStorage = { getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null), setItem: (key, value) => { store[key] = String(value); }, removeItem: (key) => { delete store[key]; } };
  }
  const observers = [];
  if (options.observer) {
    windowObject.IntersectionObserver = class { constructor(callback, init) { this.callback = callback; this.init = init; this.targets = []; this.disconnected = false; observers.push(this); } observe(target) { this.targets.push(target); } unobserve() {} disconnect() { this.disconnected = true; } };
  }
  if (!options.noFetch) {
    windowObject.fetch = (url, init) => {
      fetchCalls.push({ url, init });
      if (options.hang) return new Promise(() => {});
      if (options.defer) return new Promise((resolve, reject) => deferred.push({ resolve: () => resolve({ json: () => Promise.resolve(response) }), reject: () => reject(new Error("network")) }));
      if (options.fetchRejects) return Promise.reject(new Error("network"));
      return Promise.resolve({ json: () => (options.nonJson ? Promise.reject(new SyntaxError("Unexpected token <")) : Promise.resolve(response)) });
    };
  }
  const documentObject = {
    documentElement: { classList: { add() {} } }, body: { appendChild() {}, removeChild() {} },
    addEventListener(type, listener) { if (type === "DOMContentLoaded") this.ready = listener; },
    getElementById: (id) => elements.get(id) || null,
    querySelectorAll: () => [], querySelector: () => null,
    createElement(tag) { const node = new DomNode(tag, "", false); if (tag === "form") node.submit = () => posted.push(node); return node; },
  };
  const context = { console, document: documentObject, window: windowObject, URL, IntersectionObserver: windowObject.IntersectionObserver, Date, Math };
  vm.createContext(context);
  vm.runInContext(siteScript, context, { filename: "script.js" });
  documentObject.ready();
  const seedOf = () => JSON.parse(posted.at(-1).children.find((child) => child.name === "seed").value);
  return { elements, status, summary, reviewsStatus, list, section, observers, posted, fetchCalls, timers, executed, windowObject, store, deferred, seedOf, setResponse: (value) => { response = value; }, frame: () => elements.get("order-form-frame") };
}
const openBody = (reviews = [sampleReview()], extra = {}) => Object.assign({ ok: true, intake: "open", summary: { count: reviews.length, average: 4 }, reviews }, extra);

test("the Reviews page seeds the review form at once, without reading the feed first", () => {
  const page = runReviewsPage({ body: openBody() });
  assert.equal(page.fetchCalls.length, 0, "no feed fetch before or after the form starts");
  assert.equal(page.posted.length, 1, "the form is seeded in the same turn the page starts");
  const seed = page.seedOf();
  assert.equal(seed.sourceKind, "review");
  assert.equal(seed.formMode, "review");
  assert.equal(seed.productName, "");
  assert.match(seed.reviewId, /^request-\d+$/);
  assert.equal(page.posted[0].children.find((child) => child.name === "mode").value, "review");
  assert.equal(page.posted[0].action, "https://script.google.test/exec");
  assert.equal(page.list.children.length, 0, "the write page no longer renders a review list");
});

test("the Reviews page passes a valid product and rating from the address into the form seed", () => {
  const page = runReviewsPage({ search: "?product=catalogue%3Adiwali-jewel-glow-tealight.jpg&rating=4" });
  const seed = page.seedOf();
  assert.equal(seed.productId, "catalogue:diwali-jewel-glow-tealight.jpg");
  assert.equal(seed.rating, "4");
  const bad = runReviewsPage({ search: "?product=%3Cscript%3E&rating=9" });
  assert.equal(bad.seedOf().productId, undefined);
  assert.equal(bad.seedOf().rating, undefined);
  const dotted = runReviewsPage({ search: "?product=catalogue%3Aa%2Fb&rating=0" });
  assert.equal(dotted.seedOf().productId, undefined);
  assert.equal(dotted.seedOf().rating, undefined);
});

const repeatProfile = (customerName, expiresAt = Date.now() + 24 * 60 * 60 * 1000) => ({ saloniRepeatProfile: JSON.stringify({ version: 1, expiresAt, profile: { customerName, phone: "98765 43210", fulfillment: "pickup", pin: "305001" } }) });

test("the Reviews page fills the first name from the saved order details, and only a valid one", () => {
  assert.equal(runReviewsPage({ storage: repeatProfile("  Asha Sharma ") }).seedOf().firstName, "Asha");
  assert.equal(runReviewsPage().seedOf().firstName, undefined);
  assert.equal(runReviewsPage({ storage: repeatProfile("Asha Sharma", Date.now() - 1000) }).seedOf().firstName, undefined);
  assert.equal(runReviewsPage({ storage: repeatProfile("A Sharma") }).seedOf().firstName, undefined);
  assert.equal(runReviewsPage({ storage: repeatProfile("asha@mail.com") }).seedOf().firstName, undefined);
  assert.equal(runReviewsPage({ storage: { saloniRepeatProfile: "not json" } }).seedOf().firstName, undefined);
});

test("the Reviews page with an unconfigured backend shows the calm not-configured message and no form", () => {
  const page = runReviewsPage({ configured: false });
  assert.equal(page.posted.length, 0);
  assert.equal(page.fetchCalls.length, 0);
  assert.equal(page.frame().hidden, true);
  assert.equal(page.status.hidden, false);
  assert.match(page.status.textContent, /not configured for this preview yet/);
  assert.match(page.status.innerHTML, /href="tel:\+918209238541"/);
});

test("the Reviews page seeds the form even when the feed would say intake is paused; the form shows its own paused message", async () => {
  const page = runReviewsPage({ body: openBody([sampleReview()], { intake: "paused" }) });
  await settle();
  assert.equal(page.posted.length, 1);
  assert.equal(page.fetchCalls.length, 0);
  assert.equal(page.list.children.length, 0);
  assert.match(formHtml, /id="paused-message"[^>]*hidden/);
});

test("the home page reads the feed without custom headers only when the reviews section nears the viewport", async () => {
  const page = runReviewsPage({ home: true, observer: true, body: openBody([sampleReview(), sampleReview({ id: "review-sample-0002", rating: 5 })], { summary: { count: 2, average: 4.5 } }) });
  await settle();
  assert.equal(page.fetchCalls.length, 0, "nothing is fetched before the section is near");
  const observer = page.observers.find((item) => item.targets.includes(page.section));
  assert.ok(observer, "the reviews section is observed");
  assert.match(observer.init.rootMargin, /^600px/);
  observer.callback([{ isIntersecting: false }], observer);
  await settle();
  assert.equal(page.fetchCalls.length, 0, "an entry that is not intersecting does not load");
  observer.callback([{ isIntersecting: true }], observer);
  await settle();
  assert.equal(page.fetchCalls.length, 1);
  assert.equal(page.fetchCalls[0].url, "https://script.google.test/exec?action=reviews");
  assert.deepEqual(plain(page.fetchCalls[0].init), { credentials: "omit", cache: "no-store" });
  assert.equal(observer.disconnected, true);
  observer.callback([{ isIntersecting: true }], observer);
  await settle();
  assert.equal(page.fetchCalls.length, 1, "the feed is read once");
  assert.equal(page.list.children.length, 2);
  assert.equal(page.summary.hidden, false);
  assert.equal(page.summary.textContent, "4.5 out of 5 · 2 reviews");
  assert.equal(page.reviewsStatus.hidden, true);
  assert.equal(page.posted.length, 0, "the home page does not seed the review form");
});

test("the home page reads the feed at once when IntersectionObserver is missing", async () => {
  const page = runReviewsPage({ home: true, body: openBody() });
  await settle();
  assert.equal(page.fetchCalls.length, 1);
  assert.equal(page.list.children.length, 1);
});

test("a single review reads as one review and an empty list invites the first one", async () => {
  const one = runReviewsPage({ home: true, body: openBody([sampleReview()], { summary: { count: 1, average: 4 } }) });
  await settle();
  assert.equal(one.summary.textContent, "4.0 out of 5 · 1 review");
  const empty = runReviewsPage({ home: true, body: openBody([], { summary: { count: 0, average: 0 } }) });
  await settle();
  assert.equal(empty.reviewsStatus.textContent, "No reviews yet. Be the first to share yours.");
  assert.equal(empty.reviewsStatus.hidden, false);
  assert.equal(empty.summary.hidden, true);
  assert.equal(empty.list.children.length, 0);
});

test("review cards show stars, name, product, date and comment as text only", async () => {
  const hostile = "<img src=x onerror=alert(1)> line one\nline two";
  const page = runReviewsPage({ home: true, body: openBody([sampleReview({ comment: hostile, firstName: "<b>Asha</b>", city: "Ajmer", productId: "catalogue:resin-clock.jpg", productName: "Blue hour resin clock", date: "2026-11-08" }), sampleReview({ id: "review-sample-0002", city: "", productName: "", rating: 5, date: "2026-01-02" })]) });
  await settle();
  const [first, second] = page.list.children;
  assert.equal(first.tag, "li");
  const text = (node, className) => findAll(node, (item) => item.className === className).map((item) => item.textContent);
  assert.deepEqual(text(first, "review-comment"), [hostile]);
  assert.equal(findAll(first, (item) => item.tag === "img").length, 0, "comment markup must never become elements");
  assert.deepEqual(text(first, "review-stars"), ["★★★★☆"]);
  assert.equal(findAll(first, (item) => item.className === "review-stars")[0].getAttribute("aria-hidden"), "true");
  assert.deepEqual(text(first, "sr-only"), ["Rated 4 out of 5"]);
  assert.deepEqual(text(first, "review-author"), ["<b>Asha</b>, Ajmer"]);
  assert.deepEqual(text(first, "review-product"), ["Blue hour resin clock"]);
  assert.deepEqual(text(first, "review-date"), ["8 Nov 2026"]);
  assert.deepEqual(text(second, "review-author"), ["Asha"]);
  assert.deepEqual(text(second, "review-product"), ["Studio review"]);
  assert.deepEqual(text(second, "review-date"), ["2 Jan 2026"]);
  assert.deepEqual(text(second, "review-stars"), ["★★★★★"]);
  assert.match(siteScript.slice(siteScript.indexOf("function renderReviews")), /textContent/);
});

test("malformed review items are skipped and bad photo IDs are dropped", async () => {
  const page = runReviewsPage({ home: true, body: openBody([
    sampleReview({ photos: ["bad id with spaces", "short", PHOTO_ONE, "../../etc/passwd", "x".repeat(101), 42, null] }),
    sampleReview({ id: "review-bad-rating", rating: 9 }),
    sampleReview({ id: "review-bad-rating2", rating: "5" }),
    null, "text",
  ]) });
  await settle();
  assert.equal(page.list.children.length, 1);
  const links = findAll(page.list, (item) => item.tag === "a");
  assert.equal(links.length, 1);
  assert.equal(links[0].href, "https://lh3.googleusercontent.com/d/" + PHOTO_ONE + "=w1600");
  assert.equal(links[0].target, "_blank");
  assert.equal(links[0].rel, "noreferrer");
});

test("review photos use the googleusercontent URL, then the Drive thumbnail, then are removed", async () => {
  const page = runReviewsPage({ home: true, body: openBody([sampleReview({ productId: "catalogue:resin-clock.jpg", productName: "Blue hour resin clock", photos: [PHOTO_ONE] })]) });
  await settle();
  const image = findAll(page.list, (item) => item.tag === "img")[0];
  assert.equal(image.src, "https://lh3.googleusercontent.com/d/" + PHOTO_ONE + "=w800");
  assert.equal(image.getAttribute("loading"), "lazy");
  assert.equal(image.getAttribute("decoding"), "async");
  assert.equal(image.getAttribute("referrerpolicy"), "no-referrer");
  assert.equal(image.getAttribute("alt"), "Customer photo 1 for Blue hour resin clock");
  const link = image.parentNode;
  image.dispatch("error");
  assert.equal(image.src, "https://drive.google.com/thumbnail?id=" + PHOTO_ONE + "&sz=w800");
  assert.equal(link.href, "https://drive.google.com/thumbnail?id=" + PHOTO_ONE + "&sz=w1600");
  image.dispatch("error");
  assert.equal(link.removed, true);
  const studio = runReviewsPage({ home: true, body: openBody([sampleReview({ photos: [PHOTO_ONE] })]) });
  await settle();
  assert.equal(findAll(studio.list, (item) => item.tag === "img")[0].getAttribute("alt"), "Customer photo 1 for the studio");
});

// The home reviews and the popup rating line show a saved copy of the last good feed at once, then replace it with the fresh feed.
const FEED_CACHE_KEY = "saloni-reviews-feed";
const FEED_URL = "https://script.google.test/exec";
const savedFeed = (body, extra = {}) => JSON.stringify(Object.assign({ v: 1, url: FEED_URL, savedAt: Date.now() - 60 * 1000, data: body }, extra));
const cardTexts = (page) => findAll(page.list, (item) => item.className === "review-comment").map((item) => item.textContent);

test("the home reviews show the saved copy at once and the fresh feed replaces it when it arrives", async () => {
  const old = openBody([sampleReview({ comment: "Saved copy review." })], { summary: { count: 1, average: 4 } });
  const fresh = openBody([sampleReview({ comment: "Fresh one." }), sampleReview({ id: "review-sample-0002", comment: "Fresh two.", rating: 5 })], { summary: { count: 2, average: 4.5 } });
  const page = runReviewsPage({ home: true, defer: true, body: fresh, storage: { [FEED_CACHE_KEY]: savedFeed(old) } });
  await settle();
  assert.equal(page.fetchCalls.length, 1, "the fresh read still starts");
  assert.deepEqual(cardTexts(page), ["Saved copy review."], "the saved copy shows before the network answers");
  assert.equal(page.summary.textContent, "4.0 out of 5 · 1 review");
  assert.equal(page.reviewsStatus.hidden, true);
  page.deferred[0].resolve();
  await settle();
  assert.deepEqual(cardTexts(page), ["Fresh one.", "Fresh two."], "the fresh feed wins");
  assert.equal(page.summary.textContent, "4.5 out of 5 · 2 reviews");
  assert.equal(page.fetchCalls.length, 1);
  const stored = JSON.parse(page.store[FEED_CACHE_KEY]);
  assert.deepEqual(plain(stored.data), plain(fresh), "the fresh feed becomes the saved copy");
});

test("a failed refresh keeps the saved reviews on screen instead of the could-not-load message", async () => {
  const old = openBody([sampleReview({ comment: "Saved copy review." })]);
  for (const options of [{ fetchRejects: true }, { body: { ok: false } }, { nonJson: true }]) {
    const page = runReviewsPage(Object.assign({ home: true, storage: { [FEED_CACHE_KEY]: savedFeed(old) } }, options));
    await settle();
    assert.deepEqual(cardTexts(page), ["Saved copy review."], JSON.stringify(Object.keys(options)));
    assert.equal(page.reviewsStatus.hidden, true);
    assert.notEqual(page.reviewsStatus.textContent, CALM);
    assert.equal(JSON.parse(page.store[FEED_CACHE_KEY]).data.reviews[0].comment, "Saved copy review.", "a failed read never overwrites the saved copy");
  }
  const hanging = runReviewsPage({ home: true, hang: true, storage: { [FEED_CACHE_KEY]: savedFeed(old) } });
  await settle();
  hanging.timers.forEach((timer) => timer());
  await settle();
  assert.deepEqual(cardTexts(hanging), ["Saved copy review."], "a timed-out refresh keeps the saved copy too");
  assert.equal(hanging.reviewsStatus.hidden, true);
});

test("an unchanged fresh feed leaves the shown reviews alone and only renews the saved timestamp", async () => {
  const body = openBody([sampleReview({ comment: "Same review." })]);
  const page = runReviewsPage({ home: true, defer: true, body, storage: { [FEED_CACHE_KEY]: savedFeed(body, { savedAt: Date.now() - 3 * 24 * 60 * 60 * 1000 }) } });
  await settle();
  const shown = page.list.children[0];
  assert.ok(shown, "the saved copy shows");
  page.deferred[0].resolve();
  await settle();
  assert.equal(page.list.children[0], shown, "the cards are not rebuilt when nothing changed");
  assert.ok(Date.now() - JSON.parse(page.store[FEED_CACHE_KEY]).savedAt < 60 * 1000, "the saved copy is renewed");
});

test("a saved copy that is old, from another address, the wrong version or the wrong shape is ignored", async () => {
  const good = openBody([sampleReview({ comment: "Saved copy review." })]);
  const day = 24 * 60 * 60 * 1000;
  const copies = {
    "older than 7 days": savedFeed(good, { savedAt: Date.now() - 8 * day }),
    "saved in the future": savedFeed(good, { savedAt: Date.now() + 2 * day }),
    "no timestamp": savedFeed(good, { savedAt: "yesterday" }),
    "wrong version": savedFeed(good, { v: 2 }),
    "another backend": savedFeed(good, { url: "https://script.google.test/other" }),
    "feed not ok": savedFeed(Object.assign({}, good, { ok: false })),
    "reviews not a list": savedFeed(Object.assign({}, good, { reviews: "x" })),
    "no summary": savedFeed({ ok: true, reviews: [] }),
    "not JSON": "<html>",
    "too big": savedFeed(openBody([sampleReview({ comment: "x".repeat(150000) })])),
  };
  for (const [name, raw] of Object.entries(copies)) {
    const page = runReviewsPage({ home: true, defer: true, body: openBody([sampleReview({ comment: "Fresh one." })]), storage: { [FEED_CACHE_KEY]: raw } });
    await settle();
    assert.equal(page.list.children.length, 0, name + ": nothing is shown before the network answers");
    assert.equal(page.reviewsStatus.textContent, "Loading reviews…", name);
    page.deferred[0].resolve();
    await settle();
    assert.deepEqual(cardTexts(page), ["Fresh one."], name);
  }
});

test("only a good feed under 100 KB is saved, with a version, address and timestamp, and storage errors change nothing", async () => {
  const body = openBody([sampleReview({ comment: "Fresh one." })]);
  const page = runReviewsPage({ home: true, body, storage: {} });
  await settle();
  const saved = JSON.parse(page.store[FEED_CACHE_KEY]);
  assert.deepEqual(Object.keys(saved).sort(), ["data", "savedAt", "url", "v"]);
  assert.equal(saved.v, 1);
  assert.equal(saved.url, FEED_URL);
  assert.ok(Math.abs(saved.savedAt - Date.now()) < 60 * 1000);
  assert.deepEqual(plain(saved.data), plain(body), "exactly what the public feed returned");
  for (const options of [{ fetchRejects: true }, { body: { ok: false } }, { body: { ok: true, reviews: "x" } }, { nonJson: true }]) {
    const failed = runReviewsPage(Object.assign({ home: true, storage: {} }, options));
    await settle();
    assert.equal(FEED_CACHE_KEY in failed.store, false, "nothing saved for " + JSON.stringify(Object.keys(options)));
  }
  const huge = runReviewsPage({ home: true, body: openBody([sampleReview({ comment: "x".repeat(150000) })]), storage: { [FEED_CACHE_KEY]: savedFeed(body) } });
  await settle();
  assert.equal(huge.list.children.length, 1, "the fresh feed still shows");
  assert.equal(FEED_CACHE_KEY in huge.store, false, "a feed over the cap is not saved and the older copy is dropped");
  const broken = runReviewsPage({ home: true, body, brokenStorage: true });
  await settle();
  assert.deepEqual(cardTexts(broken), ["Fresh one."], "blocked storage still shows the fresh feed");
  const blockedFail = runReviewsPage({ home: true, fetchRejects: true, brokenStorage: true });
  await settle();
  assert.equal(blockedFail.reviewsStatus.textContent, CALM);
});

test("on the home page an unreadable, failing or missing feed shows a calm message and no list", async () => {
  const variants = [
    { nonJson: true }, { body: { ok: false } }, { body: null }, { body: { ok: true, reviews: "x" } }, { body: "<html>" }, { fetchRejects: true }, { noFetch: true },
    { body: openBody(), configured: false },
  ];
  for (const options of variants) {
    const page = runReviewsPage(Object.assign({ home: true }, options));
    await settle();
    assert.equal(page.reviewsStatus.textContent, CALM, JSON.stringify(Object.keys(options)));
    assert.equal(page.reviewsStatus.hidden, false);
    assert.equal(page.posted.length, 0, "no form seed");
    assert.equal(page.summary.hidden, true);
    assert.equal(page.list.children.length, 0);
  }
  const hanging = runReviewsPage({ home: true, hang: true });
  await settle();
  assert.equal(hanging.timers.length > 0, true);
  hanging.timers.forEach((timer) => timer());
  assert.equal(hanging.reviewsStatus.textContent, CALM);
  assert.equal(hanging.posted.length, 0);
});

test("the home page still lists reviews when the feed says new reviews are paused", async () => {
  const page = runReviewsPage({ home: true, body: openBody([sampleReview()], { intake: "paused" }) });
  await settle();
  assert.equal(page.list.children.length, 1);
  assert.equal(page.posted.length, 0);
});

test("the review form uses the review_submission captcha action through the pinned sender", async () => {
  const page = runReviewsPage({});
  const nonce = page.seedOf().channelNonce;
  const frame = page.frame();
  page.windowObject.messageListener({ origin: ORIGIN, source: frame.contentWindow, data: { type: "saloni-order-form-ready", nonce, siteKey: "site-key", mode: "review" }, ports: [] });
  const sent = [];
  const port = { postMessage: (message) => sent.push(message), close() {} };
  page.windowObject.messageListener({ origin: ORIGIN, source: frame.contentWindow, data: { type: "saloni-order-captcha-request", nonce, attemptId: "attempt-1", mode: "review" }, ports: [port] });
  await settle();
  assert.deepEqual(plain(page.executed), [{ action: "review_submission" }]);
  assert.equal(sent[0].ok, true);
  assert.equal(sent[0].attemptId, "attempt-1");
});

test("a review announced by the pinned form triggers no feed fetch and no second seed", async () => {
  const page = runReviewsPage({});
  const nonce = page.seedOf().channelNonce;
  const frame = page.frame();
  const listener = page.windowObject.messageListener;
  listener({ origin: ORIGIN, source: frame.contentWindow, data: { type: "saloni-order-form-ready", nonce, siteKey: "site-key" }, ports: [] });
  listener({ origin: ORIGIN, source: frame.contentWindow, data: { type: "saloni-review-submitted", nonce }, ports: [] });
  await settle();
  assert.equal(page.fetchCalls.length, 0, "an old form that still announces a review changes nothing");
  assert.equal(page.posted.length, 1, "the success message in the iframe is not replaced");
});

test("the Reviews page is the only page left on the iframe form path and the page chrome is untouched", () => {
  assert.match(siteScript, /!frame && requestedMode === "review"/);
  assert.match(siteScript, /var captchaAction = "review_submission"/);
  assert.doesNotMatch(siteScript, /loadReviewPage|REVIEW_CONTACT|saloni-review-submitted/, "the review-page list and its reload are gone");
  assert.match(siteScript, /\n  function renderReviews\(data\)/, "the list renderer is shared at the top level");
  assert.doesNotThrow(() => new vm.Script(siteScript));
});

// ---- review fixes: WebKit canvas output, server hardening, form generation counter ----
const WEBKIT_JPEG = fs.readFileSync(path.join(__dirname, "fixtures", "webkit-canvas-jpeg.b64"), "utf8").trim();
const signedBytes = (buffer) => Array.from(buffer).map((byte) => (byte > 127 ? byte - 256 : byte));
const markersOf = (buffer) => {
  const found = [];
  let offset = 2;
  while (offset + 3 < buffer.length) {
    const marker = buffer[offset + 1];
    found.push(marker);
    if (marker === 0xda || marker === 0xd9) break;
    offset += 2 + buffer[offset + 2] * 256 + buffer[offset + 3];
  }
  return found;
};

test("B1: the real WebKit canvas JPEG (Exif and Photoshop blocks) is stripped by the form and accepted by the server", () => {
  const original = Buffer.from(WEBKIT_JPEG, "base64");
  assert.ok(markersOf(original).includes(0xe1) && markersOf(original).includes(0xed), "fixture is real WebKit output");
  const server = makeRuntime();
  assert.equal(server.context.jpegHasMetadata_(signedBytes(original)), true, "the server stays strict");
  const runtime = makeFormRuntime({ dataUrl: () => "data:image/jpeg;base64," + WEBKIT_JPEG });
  addPhotos(runtime, [jpegFile()]);
  assert.equal(runtime.previews.children.length, 1);
  assert.equal(runtime.errors.length, 0);
  fillReviewForm(runtime);
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondReviewCaptcha(runtime, 0);
  const sent = Buffer.from(runtime.submissions[0].photos[0].data, "base64");
  const markers = markersOf(sent);
  assert.deepEqual(markers.filter((marker) => marker >= 0xe1 && marker <= 0xef || marker === 0xfe), []);
  assert.ok(markers.includes(0xe0), "JFIF is kept");
  assert.ok(markers.includes(0xdb) && markers.includes(0xc0) && markers.includes(0xc4) && markers.includes(0xda), "image segments are kept");
  assert.equal(sent.length, original.length - 76 - 56 - 4 + 0, "only the APP1 and APP13 segments (with their markers) were removed");
  assert.equal(server.context.jpegHasMetadata_(signedBytes(sent)), false);
  const accepted = server.context.submitReview(validForm({ photos: [{ type: "image/jpeg", data: runtime.submissions[0].photos[0].data }] }));
  assert.equal(accepted.ok, true);
});

test("B1: the form drops APP1 to APP15 and COM segments, keeps the others, and measures the stripped size", () => {
  const extra = [[0xe2, "ICC_PROFILE\0abc"], [0xe1, Buffer.alloc(60000, 0x41)], [0xe1, Buffer.alloc(60000, 0x42)], [0xed, "Photoshop 3.0\0"], [0xee, "Adobe"], [0xef, "x"], [0xfe, "a comment with a secret"], [0xdb, Buffer.alloc(10, 1)]];
  const noisy = makeJpeg({ extra, size: 1024 * 1024 + 70000 });
  assert.ok(noisy.length > 1024 * 1024, "raw bytes are over 1 MB");
  const runtime = makeFormRuntime({ dataUrl: () => "data:image/jpeg;base64," + noisy.toString("base64") });
  addPhotos(runtime, [jpegFile()]);
  assert.equal(runtime.canvases[0].qualities.length, 1, "the stripped size fits, so the first quality is used");
  fillReviewForm(runtime);
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondReviewCaptcha(runtime, 0);
  const sent = Buffer.from(runtime.submissions[0].photos[0].data, "base64");
  assert.deepEqual(markersOf(sent).filter((marker) => marker !== 0xdb && marker !== 0xe0 && marker !== 0xda), [], "no APPn beyond APP0 or COM is left");
  assert.ok(markersOf(sent).includes(0xe0) && markersOf(sent).filter((marker) => marker === 0xdb).length === 1);
  assert.ok(sent.length <= 1024 * 1024);
  assert.equal(sent.indexOf(Buffer.from("secret")), -1);
  const tooBig = makeFormRuntime({ dataUrl: () => "data:image/jpeg;base64," + makeJpeg({ size: 1024 * 1024 + 5 }).toString("base64") });
  addPhotos(tooBig, [jpegFile()]);
  assert.equal(tooBig.canvases[0].qualities.length, 3);
  assert.equal(tooBig.previews.children.length, 0);
  const garbage = makeFormRuntime({ dataUrl: () => "data:image/jpeg;base64," + Buffer.from("not a jpeg at all").toString("base64") });
  addPhotos(garbage, [jpegFile()]);
  assert.ok(garbage.errors.some((error) => error.id === "photos-error"));
  const truncated = makeFormRuntime({ dataUrl: () => "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2]).toString("base64") });
  addPhotos(truncated, [jpegFile()]);
  assert.ok(truncated.errors.some((error) => error.id === "photos-error"));
});

test("H4: the server also rejects APP13, COM and extended XMP segments", () => {
  const runtime = makeRuntime();
  const has = (options) => runtime.context.jpegHasMetadata_(signedBytes(makeJpeg(options)));
  assert.equal(has({}), false);
  assert.equal(has({ extra: [[0xe2, "ICC_PROFILE\0abc"]] }), false, "other segments are not the server's business");
  assert.equal(has({ extra: [[0xed, "Photoshop 3.0\0"]] }), true);
  assert.equal(has({ extra: [[0xfe, "hello"]] }), true);
  assert.equal(has({ extra: [[0xe1, "http://ns.adobe.com/xmp/extension/\0abcdef"]] }), true);
  assert.equal(has({ extra: [[0xe1, "http://ns.adobe.com/xap/1.0/\0<x/>"]] }), true);
  for (const extra of [[0xed, "Photoshop 3.0\0"], [0xfe, "hello"], [0xe1, "http://ns.adobe.com/xmp/extension/\0abcdef"]]) {
    const result = makeRuntime().context.submitReview(validForm({ photos: [photo(makeJpeg({ extra: [extra] }))] }));
    assert.ok(result.errors && result.errors.photos);
  }
});

test("H1: the edit trigger only touches files that live in the review photo folder", () => {
  const rows = [reviewRow({ id: "review-edit-0000010", status: "Hidden", photos: FILE_A + "," + FILE_B })];
  const hidden = makeRuntime({ rows, existingFiles: [FILE_A], foreignFiles: [FILE_B] });
  hidden.context.onReviewsSheetEdit_({ range: hidden.sheet.getRange(2, 3) });
  assert.deepEqual(hidden.fileById[FILE_A].sharing, ["PRIVATE", "NONE"]);
  assert.deepEqual(hidden.fileById[FILE_B].sharing, ["ANYONE_WITH_LINK", "VIEW"], "a foreign file is never re-shared or made private");
  const published = makeRuntime({ rows: [reviewRow({ id: "review-edit-0000011", status: "Published", photos: FILE_B })], foreignFiles: [FILE_B] });
  published.fileById[FILE_B].sharing = ["PRIVATE", "NONE"];
  published.context.onReviewsSheetEdit_({ range: published.sheet.getRange(2, 3) });
  assert.deepEqual(published.fileById[FILE_B].sharing, ["PRIVATE", "NONE"], "a foreign file is never made public");
  const removed = makeRuntime({ rows: [reviewRow({ id: "review-edit-0000012", status: "Removed", photos: FILE_A + "," + FILE_B })], existingFiles: [FILE_A], foreignFiles: [FILE_B] });
  removed.context.onReviewsSheetEdit_({ range: removed.sheet.getRange(2, 3) });
  assert.deepEqual(plain(removed.state.removed), [FILE_A], "a foreign file is never deleted");
  assert.equal(removed.rows[1][9], FILE_B, "the skipped id is left in the cell");
  const unset = makeRuntime({ rows: [reviewRow({ status: "Removed", photos: FILE_A })], existingFiles: [FILE_A], properties: { REVIEW_PHOTOS_FOLDER_ID: "" } });
  unset.context.onReviewsSheetEdit_({ range: unset.sheet.getRange(2, 3) });
  assert.deepEqual(unset.state.removed, [], "without a configured folder nothing can be verified, so nothing is deleted");
  assert.equal(unset.rows[1][9], FILE_A);
});

test("H2: setup protects the whole sheet and validates the whole Status column", () => {
  const runtime = makeRuntime({ noTab: true, activeEmail: "owner@example.com", effectiveEmail: "owner@example.com", properties: { REVIEWS_CONFIGURED: "" } });
  runtime.context.setupReviews();
  const sheet = runtime.sheets.Reviews;
  assert.equal(sheet.protections.length, 1);
  assert.equal(sheet.protections[0].sheetLevel, true, "sheet.protect() covers rows added later");
  assert.equal(sheet.protections[0].warningOnly, false);
  assert.equal(sheet.protections[0].getDescription(), "Customer reviews: staff-only");
  assert.equal(sheet.validations.length, 1);
  assert.equal(sheet.validations[0].column, 3);
  assert.equal(sheet.validations[0].a1, "C2:C", "the dropdown covers every row below the header");
  runtime.context.setupReviews();
  assert.equal(sheet.protections.length, 1, "running setup twice keeps one protection");
});

test("H3: a failing product list is cached for 60 seconds so requests do not refetch it", () => {
  const runtime = makeRuntime({ productsStatus: 500 });
  const one = runtime.context.submitReview(validForm({ productId: "catalogue:a.jpg" }));
  const two = runtime.context.submitReview(validForm({ productId: "catalogue:a.jpg" }));
  assert.match(one.errors.productId, /unavailable/i);
  assert.match(two.errors.productId, /unavailable/i);
  assert.equal(runtime.state.productFetches, 1);
  assert.equal(runtime.context.reviewProducts_(), null);
  assert.equal(runtime.state.productFetches, 1);
  assert.equal(runtime.state.cacheTtls["review-products-failed-v1"], 60);
  runtime.state.cache.delete("review-products-failed-v1");
  runtime.context.reviewProducts_();
  assert.equal(runtime.state.productFetches, 2, "after the failure note expires the list is fetched again");
  const good = makeRuntime();
  good.context.reviewProducts_(); good.context.reviewProducts_();
  assert.equal(good.state.productFetches, 1);
  assert.equal(good.state.cache.has("review-products-failed-v1"), false);
});

test("R5: Write another review while photos are preparing cannot leak old photos or break the counter", () => {
  const runtime = makeFormRuntime();
  fillReviewForm(runtime);
  addPhotos(runtime, [jpegFile()]);
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondReviewCaptcha(runtime, 0);
  runtime.callbacks[0].success({ ok: true });
  runtime.imageBehaviour.defer = true;
  addPhotos(runtime, [jpegFile(), jpegFile()]);
  assert.equal(runtime.pendingImages.length, 1);
  runtime.elements.get("another-button").dispatch("click");
  runtime.imageBehaviour.defer = false;
  runtime.pendingImages.splice(0).forEach((finish) => finish());
  assert.equal(runtime.previews.children.length, 0, "stale callbacks add nothing to the new form");
  assert.equal(runtime.pendingImages.length, 0, "and the stale chain does not start the next photo");
  addPhotos(runtime, [jpegFile(), jpegFile(), jpegFile(), jpegFile()]);
  assert.ok(runtime.errors.some((error) => error.id === "photos-error" && /up to 3 photos/.test(error.textContent)), "the counter is not negative");
  assert.equal(runtime.previews.children.length, 0);
  addPhotos(runtime, [jpegFile(), jpegFile(), jpegFile()]);
  assert.equal(runtime.previews.children.length, 3);
});
