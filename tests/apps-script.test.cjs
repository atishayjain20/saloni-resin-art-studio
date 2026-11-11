const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const source = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8");
const context = { console, Number, String, JSON, Date, RegExp, Math, isFinite, Utilities: { getUuid: () => "00000000-0000-4000-8000-000000000000" } };
vm.createContext(context);
vm.runInContext(source, context, { filename: "Code.gs" });

test("normalizes independent mixed-unit dimensions and keeps the 48 inch boundary", () => {
  assert.equal(context.normalizeDimension_(3, "ft"), 36);
  assert.equal(context.normalizeDimension_(4, "feet"), 48);
  assert.equal(context.normalizeDimension_(36, "in"), 36);
  assert.equal(context.normalizeDimension_(48.01, "in"), 48.01);
  assert.equal(context.normalizeDimension_(1, "yards"), null);
});

test("accepts combined feet-and-inches dimensions through 60 inches", () => {
  const runtime = makeRuntime();
  const result = runtime.context.submitOrder(combinedForm());
  assert.equal(result.ok, true);
  assert.equal(runtime.rows[0][7], "4 ft 2 in");
  assert.equal(runtime.rows[0][8], "ft+in");
  assert.equal(runtime.rows[0][9], 50);
  assert.equal(runtime.rows[0][10], "5 ft 0 in");
  assert.equal(runtime.rows[0][11], "ft+in");
  assert.equal(runtime.rows[0][12], 60);
});

test("collects the request stage marker without coercion", () => {
  const marker = { toString: () => "quote" };
  const payload = context.collectPayload_(Object.assign(validForm(), { requestStage: marker }));
  assert.equal(payload.requestStage, marker);
});

test("accepts catalogue and general quote requests without dimensions or address fields, while keeping PIN required", () => {
  for (const sourceKind of ["catalogue", "general"]) {
    const runtime = makeRuntime();
    const result = runtime.context.submitOrder(validForm({
      requestId: "request-quote-" + sourceKind,
      requestStage: "quote",
      sourceKind,
      dimensionFormat: "feet-inches",
      heightFeet: "", heightInchesPart: "", widthFeet: "", widthInchesPart: "",
      height: "", heightUnit: "", width: "", widthUnit: "",
      fulfillment: "shipping", shippingAddress: "", city: "", state: "", pin: "305001"
    }));
    assert.equal(result.ok, true);
    assert.equal(runtime.rows[0].length, 26);
    assert.deepEqual(Array.from(runtime.rows[0].slice(7, 13)), ["", "", "", "", "", ""]);
    assert.deepEqual(Array.from(runtime.rows[0].slice(18, 22)), ["", "", "", "305001"]);
  }
  const missingPin = makeRuntime();
  const result = missingPin.context.submitOrder(validForm({
    requestStage: "quote", dimensionFormat: "feet-inches", heightFeet: "", heightInchesPart: "", widthFeet: "", widthInchesPart: "",
    height: "", heightUnit: "", width: "", widthUnit: "", fulfillment: "shipping", shippingAddress: "", city: "", state: "", pin: ""
  }));
  assert.match(result.errors.pin, /6-digit PIN/);
  assert.equal(missingPin.state.captchaCalls, 0);
  assert.equal(missingPin.state.appendCalls, 0);
});

test("keeps dimensions required for customizer and non-quote requests", () => {
  for (const overrides of [
    { requestStage: "quote", sourceKind: "customizer" },
    { requestStage: "", sourceKind: "catalogue" },
  ]) {
    const runtime = makeRuntime();
    const result = runtime.context.submitOrder(validForm(Object.assign(overrides, {
      dimensionFormat: "", heightFeet: "", heightInchesPart: "", widthFeet: "", widthInchesPart: "",
      height: "", heightUnit: "", width: "", widthUnit: "", fulfillment: "shipping", shippingAddress: "", city: "", state: "", pin: "305001"
    })));
    assert.equal(result.ok, false);
    assert.ok(result.errors.height || result.errors.width || result.errors.heightFeet || result.errors.widthFeet);
    assert.equal(runtime.state.captchaCalls, 0);
    assert.equal(runtime.state.appendCalls, 0);
  }
});

test("accepts customizer quote requests without address fields while requiring PIN and dimensions", () => {
  const runtime = makeRuntime();
  const result = runtime.context.submitOrder(combinedForm({
    requestId: "request-customizer-quote",
    requestStage: "quote", sourceKind: "customizer", fulfillment: "shipping",
    shippingAddress: "", city: "", state: "", pin: "305001"
  }));
  assert.equal(result.ok, true);
  assert.equal(runtime.rows[0][7], "4 ft 2 in");
  assert.equal(runtime.rows[0][12], 60);
  assert.deepEqual(Array.from(runtime.rows[0].slice(18, 22)), ["", "", "", "305001"]);

  const pickup = makeRuntime();
  assert.equal(pickup.context.submitOrder(combinedForm({
    requestId: "request-customizer-pickup",
    requestStage: "quote", sourceKind: "customizer", fulfillment: "pickup", pin: "305001"
  })).ok, true);
  const missingPickupPin = makeRuntime();
  const missingPickupResult = missingPickupPin.context.submitOrder(combinedForm({
    requestId: "request-customizer-pickup-missing-pin",
    requestStage: "quote", sourceKind: "customizer", fulfillment: "pickup", pin: ""
  }));
  assert.match(missingPickupResult.errors.pin, /6-digit PIN/);

  const legacyCustomizer = makeRuntime();
  const legacyResult = legacyCustomizer.context.submitOrder(combinedForm({
    requestId: "request-customizer-legacy",
    requestStage: "", sourceKind: "customizer", fulfillment: "shipping",
    shippingAddress: "", city: "", state: "", pin: "305001"
  }));
  assert.equal(legacyResult.ok, false);
  assert.equal(legacyResult.errors.shippingAddress, "Enter the full shipping address.");

  for (const overrides of [
    { pin: "" },
    { heightFeet: "", heightInchesPart: "", widthFeet: "", widthInchesPart: "" },
    { heightFeet: "4", heightInchesPart: "", widthFeet: "5", widthInchesPart: "0" },
    { heightFeet: "4", heightInchesPart: "12", widthFeet: "5", widthInchesPart: "0" },
  ]) {
    const invalid = makeRuntime();
    const failed = invalid.context.submitOrder(combinedForm(Object.assign({
      requestId: "request-customizer-invalid-" + Object.keys(overrides).join("-"),
      requestStage: "quote", sourceKind: "customizer", fulfillment: "shipping",
      shippingAddress: "", city: "", state: "", pin: "305001"
    }, overrides)));
    assert.equal(failed.ok, false);
    assert.ok(failed.errors.pin || failed.errors.height || failed.errors.width || failed.errors.heightFeet || failed.errors.heightInchesPart || failed.errors.widthFeet || failed.errors.widthInchesPart);
    assert.equal(invalid.state.captchaCalls, 0);
    assert.equal(invalid.state.appendCalls, 0);
  }
});

test("validates the complete dimension format when a quote supplies any dimension value", () => {
  for (const overrides of [
    { height: "3", heightUnit: "ft", width: "", widthUnit: "" },
    { heightFeet: "4", heightInchesPart: "", widthFeet: "", widthInchesPart: "" },
  ]) {
    const runtime = makeRuntime();
    const result = runtime.context.submitOrder(validForm(Object.assign({
      requestStage: "quote", dimensionFormat: "feet-inches", heightFeet: "", heightInchesPart: "", widthFeet: "", widthInchesPart: "",
      height: "", heightUnit: "", width: "", widthUnit: "", fulfillment: "shipping", shippingAddress: "", city: "", state: "", pin: "305001"
    }, overrides)));
    assert.equal(result.ok, false);
    assert.ok(result.errors.height || result.errors.width || result.errors.heightFeet || result.errors.widthFeet);
    assert.equal(runtime.state.captchaCalls, 0);
    assert.equal(runtime.state.appendCalls, 0);
  }
});

test("stores an optional custom size on a catalogue quote and still accepts none", () => {
  const quote = (overrides) => combinedForm(Object.assign({
    requestStage: "quote", sourceKind: "catalogue", fulfillment: "pickup", pin: "305001",
  }, overrides));
  const sized = makeRuntime();
  const result = sized.context.submitOrder(quote({ heightFeet: "1", heightInchesPart: "2", widthFeet: "0", widthInchesPart: "10" }));
  assert.equal(result.ok, true);
  assert.equal(sized.rows[0][7], "1 ft 2 in");
  assert.equal(sized.rows[0][9], 14);
  assert.equal(sized.rows[0][10], "0 ft 10 in");
  assert.equal(sized.rows[0][12], 10);

  const blank = makeRuntime();
  assert.equal(blank.context.submitOrder(quote({ heightFeet: "", heightInchesPart: "", widthFeet: "", widthInchesPart: "" })).ok, true);
  assert.deepEqual(Array.from(blank.rows[0].slice(7, 13)), ["", "", "", "", "", ""]);

  const invalid = makeRuntime();
  const rejected = invalid.context.submitOrder(quote({ heightFeet: "1", heightInchesPart: "12", widthFeet: "0", widthInchesPart: "10" }));
  assert.equal(rejected.ok, false);
  assert.ok(rejected.errors.heightInchesPart);
  assert.equal(invalid.state.appendCalls, 0);
});

test("rejects invalid request stage markers before CAPTCHA verification or writes", () => {
  for (const requestStage of ["Quote", "QUOTE", "quote ", 1, true, null, {}, ["quote"]]) {
    const runtime = makeRuntime({ captchaThrows: true });
    const result = runtime.context.submitOrder(validForm({ requestStage }));
    assert.equal(result.ok, false);
    assert.match(result.errors.requestStage, /request stage/i);
    assert.equal(runtime.state.captchaCalls, 0);
    assert.equal(runtime.state.appendCalls, 0);
  }
});

test("rejects invalid combined dimension parts and unknown dimension formats", () => {
  for (const overrides of [
    { heightFeet: "5", heightInchesPart: "0.01" },
    { heightFeet: "-1", heightInchesPart: "0" },
    { heightFeet: "4", heightInchesPart: "12" },
    { dimensionFormat: "metric" },
  ]) {
    const runtime = makeRuntime();
    const result = runtime.context.submitOrder(combinedForm(overrides));
    assert.equal(result.ok, false);
    assert.equal(runtime.state.appendCalls, 0);
  }
});

test("converts legacy fractional feet seeds without reversing axes", () => {
  const seed = context.parseSeed_(JSON.stringify({
    requestId: "request-legacy-seed", height: "0.67", heightUnit: "ft", width: "0.50", widthUnit: "ft"
  }));
  assert.equal(seed.dimensionFormat, "feet-inches");
  assert.equal(seed.heightFeet, "0");
  assert.equal(seed.heightInchesPart, "8.04");
  assert.equal(seed.widthFeet, "0");
  assert.equal(seed.widthInchesPart, "6");
});

test("preserves only the exact quote stage in seeds and keeps invalid markers before CAPTCHA", () => {
  const quoteSeed = context.parseSeed_(JSON.stringify({ requestStage: "quote" }));
  assert.equal(quoteSeed.requestStage, "quote");
  assert.equal(makeRuntime().context.submitOrder(validForm({
    requestStage: quoteSeed.requestStage, dimensionFormat: quoteSeed.dimensionFormat,
    heightFeet: "", heightInchesPart: "", widthFeet: "", widthInchesPart: "", height: "", heightUnit: "", width: "", widthUnit: "",
    shippingAddress: "", city: "", state: "", pin: "305001"
  })).ok, true);
  for (const marker of ["Quote", "quote ", "preview"]) {
    const seed = context.parseSeed_(JSON.stringify({ requestStage: marker }));
    assert.equal(seed.requestStage, "");
    const runtime = makeRuntime({ captchaThrows: true });
    const result = runtime.context.submitOrder(validForm({ requestStage: marker }));
    assert.match(result.errors.requestStage, /request stage/i);
    assert.equal(runtime.state.captchaCalls, 0);
  }
});

test("accepts an order with no captchaToken and never calls or depends on CAPTCHA", () => {
  const noToken = makeRuntime({ captchaThrows: true });
  const form = validForm();
  delete form.captchaToken;
  const result = noToken.context.submitOrder(form);
  assert.equal(result.ok, true);
  assert.equal(noToken.state.captchaCalls, 0);
  assert.equal(noToken.state.appendCalls, 1);
  for (const properties of [{ CAPTCHA_SECRET: "", CAPTCHA_MIN_SCORE: "" }, { CAPTCHA_MIN_SCORE: "not-a-number" }]) {
    const unconfigured = makeRuntime({ properties, captchaThrows: true });
    assert.equal(unconfigured.context.submitOrder(validForm({ captchaToken: "" })).ok, true);
    assert.equal(unconfigured.state.captchaCalls, 0);
  }
});

test("an order with no captchaToken still hits validation, the daily cap, and the kill switch", () => {
  const invalid = makeRuntime({ captchaThrows: true });
  assert.equal(invalid.context.submitOrder(validForm({ captchaToken: "", phone: "1" })).ok, false);
  assert.equal(invalid.state.appendCalls, 0);
  const daily = makeRuntime({ properties: { DAILY_ACCEPTANCE_CAP: "1" }, rows: [["old", "fingerprint", new Date(), "catalogue", "id"]], captchaThrows: true });
  assert.match(daily.context.submitOrder(validForm({ captchaToken: "" })).errors.form, /daily request limit/);
  const disabled = makeRuntime({ properties: { ORDER_FORM_DISABLED: "true" }, captchaThrows: true });
  assert.equal(disabled.context.submitOrder(validForm({ captchaToken: "" })).ok, false);
  assert.equal(disabled.state.appendCalls, 0);
});

test("neutralizes every spreadsheet formula prefix while leaving ordinary text unchanged", () => {
  for (const value of ["=SUM(A1:A2)", "+cmd", "-1+1", "@user"]) {
    assert.equal(context.neutralizeForSheet_(value)[0], "'");
  }
  assert.equal(context.neutralizeForSheet_("hello"), "hello");
});

test("checks actual image signatures and the five megabyte limit", () => {
  const jpeg = { getContentType: () => "image/jpeg", getBytes: () => [-1, -40, -1, 0] };
  const png = { getContentType: () => "image/png", getBytes: () => [137, 80, 78, 71, 13, 10, 26, 10] };
  const spoofed = { getContentType: () => "image/png", getBytes: () => [-1, -40, -1] };
  const oversized = { getContentType: () => "image/jpeg", getBytes: () => new Array(5 * 1024 * 1024 + 1).fill(0) };
  assert.equal(context.validateReferenceImage_(jpeg), null);
  assert.equal(context.validateReferenceImage_(png), null);
  assert.match(context.validateReferenceImage_(spoofed), /signature/);
  assert.match(context.validateReferenceImage_(oversized), /5 MB/);
});

test("bounds seed values and escapes seed JSON before HTMLService output", () => {
  const seed = context.parseSeed_(JSON.stringify({ requestId: "bad", productName: "<script>alert('x')</script>" }));
  assert.match(seed.requestId, /^[A-Za-z0-9-]{36}$/);
  assert.equal(seed.productName, "<script>alert('x')</script>");
  const escaped = context.escapeSeedJson_(JSON.stringify({ value: "</script><img>" }));
  assert.doesNotMatch(escaped, /<\/?script|<img/i);
  assert.match(escaped, /\\u003c/);
});

test("retains only a bounded valid bundle seed for rendering", () => {
  const items = [
    { sourceId: "catalogue:one.webp", productName: "One", price: "249", size: "4 in", quantity: 2 },
    { sourceId: "catalogue:two.webp", productName: "Two", price: "399", size: "6 in", quantity: 5 },
    { sourceId: "catalogue:three.webp", productName: "Three", price: "499", size: "8 in", quantity: 1 },
    { sourceId: "catalogue:bad", productName: "Zero", quantity: 0 },
  ];
  const seed = context.parseSeed_(JSON.stringify({ sourceId: "catalogue:multi-item", bundleItems: items }));
  assert.equal(seed.bundleItems.length, 3);
  assert.deepEqual(Array.from(seed.bundleItems.map((item) => item.productName)), ["One", "Two", "Three"]);
  assert.deepEqual(Array.from(seed.bundleItems.map((item) => item.quantity)), [2, 5, 1]);
  const overLimit = context.parseSeed_(JSON.stringify({ sourceId: "catalogue:multi-item", bundleItems: [{ sourceId: "catalogue:one", productName: "One", quantity: 101 }] }));
  assert.deepEqual(Array.from(overLimit.bundleItems), []);
});

test("accepts a full multi-item Product name within the 2000-character contract", () => {
  const productName = Array.from({ length: 12 }, (_, index) => "Selected catalogue product " + (index + 1)).join(", ");
  assert.ok(productName.length > 160);
  const seed = context.parseSeed_(JSON.stringify({ productName }));
  assert.equal(seed.productName, productName);
  const errors = context.validatePayload_(validForm({
    requestStage: "quote", sourceId: "catalogue:multi-item", productName,
    height: "", heightUnit: "", width: "", widthUnit: "", designDetails: "Bundle details"
  }));
  assert.equal(errors.productName, undefined);
});

test("round-trips only exact customizer previewExpected booleans through doPost and render", () => {
  for (const [input, expected] of [[true, true], [false, false], [undefined, false], ["true", false], [1, false], [{ value: true }, false]]) {
    const seed = { requestId: "request-preview-roundtrip", sourceKind: "customizer", productName: "Custom resin frame" };
    if (input !== undefined) seed.previewExpected = input;
    const runtime = makeRuntime();
    runtime.context.doPost({ parameter: { action: "seed", mode: "order", seed: JSON.stringify(seed) } });
    assert.equal(runtime.state.templateName, "Form");
    const renderedSeed = JSON.parse(runtime.state.renderedSeedJson);
    assert.equal(renderedSeed.formMode, "order");
    assert.equal(renderedSeed.previewExpected, expected);
  }

  const invalidMode = makeRuntime();
  invalidMode.context.doPost({ parameter: {
    action: "seed", mode: "order-no-preview",
    seed: JSON.stringify({ sourceKind: "customizer", previewExpected: true })
  } });
  assert.equal(invalidMode.state.templateName, "Form");
  assert.equal(JSON.parse(invalidMode.state.renderedSeedJson).formMode, "order");
  assert.equal(JSON.parse(invalidMode.state.renderedSeedJson).previewExpected, true);
});

function validForm(overrides = {}) {
  return Object.assign({
    requestId: "request-1234567890", sourceKind: "catalogue", sourceId: "catalogue:test.png",
    productName: "Test frame", quantity: "1", height: "3", heightUnit: "ft", width: "4", widthUnit: "ft",
    designDetails: "Blue and gold", customerName: "A Customer", phone: "8209238541", email: "",
    fulfillment: "pickup", shippingAddress: "", city: "", state: "", pin: "", requestedDate: "",
    captchaToken: "token", referenceImage: null,
  }, overrides);
}

function combinedForm(overrides = {}) {
  return validForm(Object.assign({
    dimensionFormat: "feet-inches", heightFeet: "4", heightInchesPart: "2", widthFeet: "5", widthInchesPart: "0",
    height: "", heightUnit: "", width: "", widthUnit: ""
  }, overrides));
}

function makeRuntime(options = {}) {
  const headers = options.headers ? options.headers.slice() : [
    "Request ID", "Payload fingerprint", "Received at", "Source kind", "Source ID", "Product name", "Quantity",
    "Height value", "Height unit", "Height (in)", "Width value", "Width unit", "Width (in)", "Design details",
    "Customer name", "Phone", "Email", "Fulfilment",
    "Shipping address", "City", "State", "PIN", "Requested date", "Reference file link", "Status", "Staff notes",
  ];
  const rows = (options.rows || []).map((row) => row.slice());
  const folderFiles = (options.folderFiles || []).map((file) => Object.assign({}, file));
  const state = {
    appendCalls: 0, fileCreates: 0, trashed: 0, dataReads: 0, captchaCalls: 0,
    templateName: "", renderedSeedJson: "", renderedFormModeJson: "",
    appendMode: options.appendMode || "success",
    failRecheck: Boolean(options.failRecheck),
    folderAccess: options.folderAccess || "PRIVATE",
    captchaResponse: options.captchaResponse || { success: true, hostname: "saloniresinart.com", action: "order_request", score: 0.9 },
    driveDeletes: [], retentionTrashed: 0, rowDeletes: [], triggerCreates: 0, triggerConfig: null,
    logs: [], rangeReads: [], locked: false, whatsappFetches: [], emails: [], base64Decodes: 0, cellWrites: [], formats: [],
  };
  const sheet = {
    getLastColumn: () => headers.length,
    getLastRow: () => rows.length + 1,
    getRange: (row, column, numRows, numColumns) => (row >= 2 ? {
      // A body cell: setValue (the cancellation request writes Status and Staff notes one cell at a time), or a block read (order status).
      getValues: () => {
        state.rangeReads.push({ row, column, numRows, numColumns });
        return rows.slice(row - 2, row - 2 + numRows).map((cells) => cells.slice(column - 1, column - 1 + numColumns));
      },
      setValue: (value) => { state.cellWrites.push({ row, column, value }); rows[row - 2][column - 1] = value; },
    } : {
      getValues: () => [headers],
      setValues: (values) => { headers.splice(0, headers.length, ...values[0]); },
    }),
    getDataRange: () => {
      state.dataReads += 1;
      if (state.failRecheck && state.appendCalls > 0) throw new Error("sheet read uncertain");
      return { getValues: () => [headers].concat(rows) };
    },
    appendRow: (row) => {
      state.appendCalls += 1;
      if (state.appendMode === "before-throw") throw new Error("append failed before persistence");
      rows.push(row);
      if (state.appendMode === "persisted-throw") throw new Error("append response lost");
    },
    deleteRow: (rowNumber) => {
      state.rowDeletes.push(rowNumber);
      if (options.deleteRowThrows) throw new Error("row delete failed");
      rows.splice(rowNumber - 2, 1);
    },
  };
  function iterator(items) {
    let index = 0;
    return { hasNext: () => index < items.length, next: () => items[index++] };
  }
  const folder = {
    getSharingAccess: () => state.folderAccess,
    createFile: (blob) => {
      state.fileCreates += 1;
      return {
        getUrl: () => "https://drive.google.test/file",
        getId: () => "file-id-1",
        setTrashed: () => { state.trashed += 1; if (options.cleanupThrows) throw new Error("cleanup failed"); },
      };
    },
    getFilesByName: (name) => iterator(folderFiles.filter((file) => file.name === name)),
    getFiles: () => iterator(folderFiles.slice()),
  };
  const properties = Object.assign({
    ORDER_SHEET_ID: "sheet", ORDER_SHEET_TAB: "Orders", ORDER_DRIVE_FOLDER_ID: "folder",
    CAPTCHA_SECRET: "secret", CAPTCHA_MIN_SCORE: "0.5",
  }, options.properties || {});
  const lock = {
    tryLock: () => { state.locked = options.lockAvailable !== false; return state.locked; },
    releaseLock: () => { state.released = true; state.locked = false; },
  };
  const utilities = {
    getUuid: () => "00000000-0000-4000-8000-000000000000",
    newBlob: (value, type, name) => {
      const bytes = typeof value === "string" ? Array.from(Buffer.from(value)) : Array.from(value);
      const blob = { getBytes: () => bytes, getContentType: () => type || "", getName: () => name || "", copyBlob: () => blob, setName: () => blob };
      return blob;
    },
    base64Decode: (text) => { state.base64Decodes += 1; return Array.from(Buffer.from(String(text), "base64")).map((byte) => byte > 127 ? byte - 256 : byte); },
    DigestAlgorithm: { SHA_256: "SHA-256" },
    computeDigest: (_algorithm, bytes) => Array.from(crypto.createHash("sha256").update(Buffer.from(bytes.map((byte) => byte < 0 ? byte + 256 : byte))).digest()).map((byte) => byte > 127 ? byte - 256 : byte),
    formatDate: (date, zone, format) => { state.formats.push([date, zone, format]); return new Date(date).toISOString().slice(0, 10); },
  };
  const runtimeContext = {
    console: { log: (...values) => state.logs.push(values.join(" ")), error: (...values) => state.logs.push(values.join(" ")) },
    Number, String, JSON, Date, RegExp, Math, isFinite, Object, Array,
    Utilities: utilities,
    ContentService: {
      MimeType: { JSON: "JSON" },
      createTextOutput: (text) => ({ text, setMimeType(type) { this.mimeType = type; return this; } }),
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => properties[key] || "",
      setProperty: (key, value) => {
        if (options.setPropertyThrows && String(key).startsWith("ORDER_ALERT_Q_")) throw new Error("property write failed");
        properties[key] = String(value);
      },
      deleteProperty: (key) => {
        if (options.deletePropertyThrows) throw new Error("property delete failed");
        delete properties[key];
      },
      getKeys: () => Object.keys(properties),
      getProperties: () => Object.assign({}, properties),
    }) },
    LockService: {
      getScriptLock: () => lock,
      getUserLock: () => ({
        tryLock: () => { state.userLockTries = (state.userLockTries || 0) + 1; return options.userLockAvailable !== false; },
        releaseLock: () => { state.userLockReleased = (state.userLockReleased || 0) + 1; },
      }),
    },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
    DriveApp: {
      getFolderById: () => folder, Access: { PRIVATE: "PRIVATE" },
      getFileById: (id) => {
        state.fileLookups = (state.fileLookups || []).concat(id);
        if (options.referenceFileMissing) throw new Error("File not found");
        return { getUrl: () => "https://drive.google.test/file" };
      },
    },
    Drive: { Files: { remove: (id) => {
      state.driveDeletes.push(id);
      if (options.driveDeleteThrows) throw new Error("file delete failed");
      const index = folderFiles.findIndex((file) => file.id === id);
      if (index >= 0) folderFiles.splice(index, 1);
    } } },
    ScriptApp: {
      AuthMode: { FULL: "FULL" },
      requireScopes: (mode, scopes) => { (state.requiredScopes || (state.requiredScopes = [])).push({ mode, scopes }); },
      getProjectTriggers: () => options.triggers || [],
      newTrigger: (handler) => {
        const builder = {
          timeBased() { return builder; },
          everyMinutes(minutes) { state.triggerConfig = Object.assign(state.triggerConfig || {}, { handler, everyMinutes: minutes }); return builder; },
          everyDays(days) { state.triggerConfig = Object.assign(state.triggerConfig || {}, { handler, everyDays: days }); return builder; },
          atHour(hour) { state.triggerConfig = Object.assign(state.triggerConfig || {}, { atHour: hour }); return builder; },
          create() { state.triggerCreates += 1; (options.triggers || (options.triggers = [])).push({ getHandlerFunction: () => handler }); return options.triggers.at(-1); },
        };
        return builder;
      },
    },
    MailApp: { sendEmail: (message) => {
      state.emails.push({ message, lockHeld: state.locked });
      if (options.mailThrows) throw new Error(typeof options.mailThrows === "string" ? options.mailThrows : "mail failed");
    } },
    UrlFetchApp: { fetch: (url, params) => {
      if (String(url).startsWith("https://api.callmebot.com/")) {
        state.whatsappFetches.push({ url: String(url), params, lockHeld: state.locked });
        if (options.whatsappThrows) throw new Error("whatsapp failed");
        return { getResponseCode: () => 200 };
      }
      state.captchaCalls += 1;
      if (options.captchaThrows) throw new Error("captcha should not be called");
      return { getContentText: () => JSON.stringify(state.captchaResponse) };
    } },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: "ALLOWALL" },
      createTemplateFromFile: (name) => {
        state.templateName = name;
        const template = {
          seedJson: "", captchaSiteKeyJson: "", captchaEnabledJson: "", formModeJson: "",
          evaluate: () => {
            state.renderedSeedJson = template.seedJson;
            state.renderedFormModeJson = template.formModeJson;
            const evaluated = {
              setTitle: (title) => { state.renderedTitle = title; return evaluated; },
              setXFrameOptionsMode: (mode) => { state.xFrameOptionsMode = mode; return evaluated; },
            };
            return evaluated;
          },
        };
        return template;
      },
    },
    Session: {
      getScriptTimeZone: () => "UTC",
      getActiveUser: () => ({ getEmail: () => options.activeEmail || "" }),
      getEffectiveUser: () => ({ getEmail: () => options.effectiveEmail || "" }),
    },
  };
  vm.createContext(runtimeContext);
  vm.runInContext(source, runtimeContext, { filename: "Code.gs" });
  return { context: runtimeContext, state, rows, headers, properties };
}

function retentionRow(requestId, receivedAt, referenceFileLink = "") {
  const row = new Array(26).fill("");
  row[0] = requestId;
  row[2] = receivedAt;
  row[23] = referenceFileLink;
  return row;
}

function retentionFile(id, name, createdAt) {
  return { id, name, createdAt, getId() { return this.id; }, getName() { return this.name; }, getDateCreated() { return this.createdAt; }, setTrashed() { throw new Error("retention must use Drive API"); } };
}

function imageBlob(bytes = [-1, -40, -1, 0]) {
  return {
    getBytes: () => bytes,
    getContentType: () => "image/jpeg",
    copyBlob: () => ({ setName: () => ({}) }),
  };
}

test("rejects disabled intake, daily cap, and lock contention before writes", () => {
  const disabled = makeRuntime({ properties: { ORDER_FORM_DISABLED: "true" } });
  assert.equal(disabled.context.submitOrder(validForm()).ok, false);
  assert.equal(disabled.state.appendCalls, 0);
  const daily = makeRuntime({ properties: { DAILY_ACCEPTANCE_CAP: "1" }, rows: [["old", "fingerprint", new Date(), "catalogue", "id"]] });
  assert.match(daily.context.submitOrder(validForm()).errors.form, /daily request limit/);
  assert.equal(daily.state.appendCalls, 0);
  const publicFolder = makeRuntime({ folderAccess: "ANYONE_WITH_LINK" });
  assert.throws(() => publicFolder.context.submitOrder(validForm({ referenceImage: imageBlob() })), /Unable to confirm/);
  assert.equal(publicFolder.state.fileCreates, 0);
  assert.equal(publicFolder.state.appendCalls, 0);
  const locked = makeRuntime({ lockAvailable: false });
  assert.throws(() => locked.context.submitOrder(validForm()), /Unable to confirm/);
  assert.equal(locked.state.appendCalls, 0);
});

test("returns matching duplicate success, conflicts on changed payload, and never creates a second file", () => {
  const first = validForm({ referenceImage: imageBlob() });
  const fingerprintRuntime = makeRuntime();
  const fingerprint = fingerprintRuntime.context.payloadFingerprint_(fingerprintRuntime.context.collectPayload_(first));
  const rows = [[first.requestId, fingerprint, new Date(), first.sourceKind, first.sourceId]];
  const matching = makeRuntime({ rows });
  const result = matching.context.submitOrder(first);
  assert.equal(result.ok, true);
  assert.equal(matching.state.appendCalls, 0);
  assert.equal(matching.state.fileCreates, 0);
  const conflict = makeRuntime({ rows });
  const changed = Object.assign({}, first, { productName: "Changed frame" });
  assert.match(conflict.context.submitOrder(changed).errors.requestId, /conflict/i);
  assert.equal(conflict.state.appendCalls, 0);
});

test("keeps the legacy fingerprint for retries without a dimension marker", () => {
  const form = validForm();
  const runtime = makeRuntime();
  const legacyFingerprint = runtime.context.digestHex_(JSON.stringify({
    requestId: form.requestId, sourceKind: form.sourceKind, sourceId: form.sourceId, productName: form.productName,
    quantity: form.quantity, height: form.height, heightUnit: form.heightUnit, width: form.width, widthUnit: form.widthUnit,
    designDetails: form.designDetails, customerName: form.customerName, phone: form.phone, email: form.email,
    fulfillment: form.fulfillment, shippingAddress: form.shippingAddress, city: form.city, state: form.state, pin: form.pin,
    requestedDate: form.requestedDate, fileDigest: ""
  }));
  const retry = makeRuntime({ rows: [[form.requestId, legacyFingerprint, new Date(), form.sourceKind, form.sourceId]] });
  assert.equal(retry.context.submitOrder(form).ok, true);
  assert.equal(retry.state.appendCalls, 0);
});

test("preserves all legacy fingerprint vectors and appends quote stage after referral", () => {
  const vectors = [
    validForm(),
    validForm({ referralCode: "ABC123" }),
    combinedForm(),
    combinedForm({ referralCode: "ABC123" }),
  ];
  for (const form of vectors) {
    const runtime = makeRuntime();
    const payload = runtime.context.collectPayload_(form);
    const canonical = {
      requestId: payload.requestId, sourceKind: payload.sourceKind, sourceId: payload.sourceId,
      productName: payload.productName, quantity: payload.quantity, height: payload.height,
      heightUnit: payload.heightUnit, width: payload.width, widthUnit: payload.widthUnit,
      designDetails: payload.designDetails, customerName: payload.customerName, phone: payload.phone,
      email: payload.email, fulfillment: payload.fulfillment, shippingAddress: payload.shippingAddress,
      city: payload.city, state: payload.state, pin: payload.pin, requestedDate: payload.requestedDate,
      fileDigest: ""
    };
    if (payload.dimensionFormat === "feet-inches") {
      canonical.dimensionFormat = payload.dimensionFormat;
      canonical.heightFeet = payload.heightFeet;
      canonical.heightInchesPart = payload.heightInchesPart;
      canonical.widthFeet = payload.widthFeet;
      canonical.widthInchesPart = payload.widthInchesPart;
    }
    if (payload.referralCode) canonical.referralCode = payload.referralCode;
    assert.equal(runtime.context.payloadFingerprint_(payload), runtime.context.digestHex_(JSON.stringify(canonical)));
  }

  const runtime = makeRuntime();
  const quote = runtime.context.collectPayload_(combinedForm({ requestStage: "quote", referralCode: "ABC123" }));
  const expected = {
    requestId: quote.requestId, sourceKind: quote.sourceKind, sourceId: quote.sourceId,
    productName: quote.productName, quantity: quote.quantity, height: quote.height,
    heightUnit: quote.heightUnit, width: quote.width, widthUnit: quote.widthUnit,
    designDetails: quote.designDetails, customerName: quote.customerName, phone: quote.phone,
    email: quote.email, fulfillment: quote.fulfillment, shippingAddress: quote.shippingAddress,
    city: quote.city, state: quote.state, pin: quote.pin, requestedDate: quote.requestedDate,
    fileDigest: "", dimensionFormat: quote.dimensionFormat, heightFeet: quote.heightFeet,
    heightInchesPart: quote.heightInchesPart, widthFeet: quote.widthFeet, widthInchesPart: quote.widthInchesPart,
    referralCode: quote.referralCode, requestStage: "quote"
  };
  assert.equal(runtime.context.payloadFingerprint_(quote), runtime.context.digestHex_(JSON.stringify(expected)));
});

test("keeps the row and fingerprint unchanged when bundleSourceIds is absent", () => {
  const form = combinedForm({ referralCode: "ABC123" });
  const runtime = makeRuntime();
  const without = runtime.context.collectPayload_(form);
  const blank = runtime.context.collectPayload_(Object.assign({}, form, { bundleSourceIds: "" }));
  assert.equal(runtime.context.payloadFingerprint_(without), runtime.context.payloadFingerprint_(blank));
  const row = runtime.context.rowForPayload_(without, "fp", new Date(), null, null, 2);
  assert.equal(row[4], form.sourceId);
  assert.equal(row.length, 26);
});

test("stores valid bundleSourceIds in the Source ID cell and in the fingerprint", () => {
  const bundleSourceIds = "catalogue:a.jpg x1, catalogue:b.jpg x2";
  const form = combinedForm({ sourceId: "catalogue:multi-item", productName: "A + 1 more", bundleSourceIds });
  const runtime = makeRuntime();
  assert.deepEqual(Object.assign({}, runtime.context.validatePayload_(runtime.context.collectPayload_(form)).errors), {});
  const payload = runtime.context.collectPayload_(form);
  assert.equal(payload.bundleSourceIds, bundleSourceIds);
  const row = runtime.context.rowForPayload_(payload, "fp", new Date(), null, null, 2);
  assert.equal(row[4], "catalogue:multi-item | " + bundleSourceIds);
  const plain = runtime.context.collectPayload_(Object.assign({}, form, { bundleSourceIds: "" }));
  assert.notEqual(runtime.context.payloadFingerprint_(payload), runtime.context.payloadFingerprint_(plain));
  const submitted = makeRuntime();
  assert.equal(submitted.context.submitOrder(form).ok, true);
  assert.equal(submitted.rows[0][4], "catalogue:multi-item | " + bundleSourceIds);
});

test("rejects malformed, oversized, or non-bundle bundleSourceIds before writes", () => {
  const bad = [
    { sourceId: "catalogue:multi-item", bundleSourceIds: "catalogue:a.jpg x1, =HYPERLINK(1) x2" },
    { sourceId: "catalogue:multi-item", bundleSourceIds: "catalogue:a.jpg x0, catalogue:b.jpg" },
    { sourceId: "catalogue:multi-item", bundleSourceIds: "catalogue:a.jpg x1,catalogue:b.jpg x2" },
    { sourceId: "catalogue:multi-item", bundleSourceIds: Array.from({ length: 300 }, (_, index) => "catalogue:product-" + index + ".jpg x1").join(", ") },
    { sourceId: "catalogue:test.png", bundleSourceIds: "catalogue:a.jpg x1" },
  ];
  for (const overrides of bad) {
    const runtime = makeRuntime();
    const result = runtime.context.submitOrder(combinedForm(overrides));
    assert.equal(result.ok, false);
    assert.ok(result.errors.bundleSourceIds);
    assert.equal(runtime.state.captchaCalls, 0);
    assert.equal(runtime.state.appendCalls, 0);
  }
});

const PHONE_MESSAGE = "Enter a 10-digit mobile number, e.g. 98765 43210.";
const NAME_MESSAGE = "Enter your name (at least 2 letters).";
const PIN_MESSAGE = "Enter a valid 6-digit PIN code.";
const DATE_MESSAGE = "Choose today or a later date.";
const ADDRESS_MESSAGE = "Enter the full shipping address.";
function istDate(offsetDays) {
  return new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);
}
function shippingForm(overrides = {}) {
  return combinedForm(Object.assign({ fulfillment: "shipping", shippingAddress: "12 Hathi Bhata Road", city: "Ajmer", state: "Rajasthan", pin: "305001" }, overrides));
}

test("accepts Indian mobile numbers with +91, 91, 0 prefixes and common separators", () => {
  ["8209238541", "98765 43210", "+91 8209238541", "+91-98765-43210", "918209238541", "08209238541", "(+91) 98765 43210", "6000000000", "7000000000"].forEach((phone) => {
    const errors = context.validatePayload_(validForm({ phone }));
    assert.equal(errors.errors.phone, undefined, phone);
  });
});

test("rejects phones that are not a ten-digit Indian mobile number", () => {
  ["", "1234567", "5876543210", "0123456789", "98765", "98765432101", "+1 8209238541", "+91 5209238541", "abcdefghij", "+9198765432109"].forEach((phone) => {
    assert.equal(context.validatePayload_(validForm({ phone })).errors.phone, PHONE_MESSAGE, phone);
  });
  assert.equal(context.validatePayload_(validForm({ phone: "9".repeat(41) })).errors.phone, PHONE_MESSAGE);
});

test("requires a customer name with at least two letters", () => {
  ["A Customer", "Al", "Saloni", "राम", "ગીતા", "முருகன்", "প্রিয়া", "ਹਰਪ੍ਰੀਤ", "Mary-Jane O'Neil", "  Åsa  ", "राधा शर्मा"].forEach((customerName) => {
    assert.equal(context.validatePayload_(validForm({ customerName })).errors.customerName, undefined, customerName);
  });
  ["", " ", "  ", "A", " A ", "12", "1 2 3", "- -", "--", "A1"].forEach((customerName) => {
    assert.equal(context.validatePayload_(validForm({ customerName })).errors.customerName, NAME_MESSAGE, JSON.stringify(customerName));
  });
});

test("requires a 6-digit PIN that does not start with 0 wherever a PIN is already required", () => {
  assert.equal(context.validatePayload_(shippingForm()).errors.pin, undefined);
  ["", "012345", "30500", "3050011", "30500a", "000000"].forEach((pin) => {
    assert.equal(context.validatePayload_(shippingForm({ pin })).errors.pin, PIN_MESSAGE, pin);
  });
  const quote = (overrides) => validForm(Object.assign({ requestStage: "quote", fulfillment: "pickup", height: "", heightUnit: "", width: "", widthUnit: "" }, overrides));
  assert.equal(context.validatePayload_(quote({ pin: "305001" })).errors.pin, undefined);
  assert.equal(context.validatePayload_(quote({ pin: "012345" })).errors.pin, PIN_MESSAGE);
  assert.equal(context.validatePayload_(quote({ pin: "" })).errors.pin, PIN_MESSAGE);
  assert.equal(context.validatePayload_(validForm({ fulfillment: "pickup", pin: "" })).errors.pin, undefined);
});

test("rejects a requested date before today in India time but accepts today and later", () => {
  assert.equal(context.validatePayload_(validForm({ requestedDate: istDate(0) })).errors.requestedDate, undefined);
  assert.equal(context.validatePayload_(validForm({ requestedDate: istDate(30) })).errors.requestedDate, undefined);
  assert.equal(context.validatePayload_(validForm({ requestedDate: "" })).errors.requestedDate, undefined);
  assert.equal(context.validatePayload_(validForm({ requestedDate: istDate(-1) })).errors.requestedDate, DATE_MESSAGE);
  assert.equal(context.validatePayload_(validForm({ requestedDate: "2020-01-01" })).errors.requestedDate, DATE_MESSAGE);
  assert.match(context.validatePayload_(validForm({ requestedDate: "2026-02-31" })).errors.requestedDate, /valid requested date/);
});

test("requires a full shipping address of at least ten characters when shipping", () => {
  assert.equal(context.validatePayload_(shippingForm()).errors.shippingAddress, undefined);
  ["", "   ", "Ajmer", "123456789", "  123456789  "].forEach((shippingAddress) => {
    assert.equal(context.validatePayload_(shippingForm({ shippingAddress })).errors.shippingAddress, ADDRESS_MESSAGE, JSON.stringify(shippingAddress));
  });
  assert.equal(context.validatePayload_(shippingForm({ shippingAddress: "1234567890" })).errors.shippingAddress, undefined);
  assert.equal(context.validatePayload_(validForm({ fulfillment: "pickup", shippingAddress: "" })).errors.shippingAddress, undefined);
});

test("submitOrder rejects bad contact values before CAPTCHA or writes even when the client is bypassed", () => {
  const runtime = makeRuntime();
  const result = runtime.context.submitOrder(shippingForm({ phone: "12345", customerName: "A", pin: "012345", shippingAddress: "short", requestedDate: "2020-01-01" }));
  assert.equal(result.ok, false);
  assert.equal(result.errors.phone, PHONE_MESSAGE);
  assert.equal(result.errors.customerName, NAME_MESSAGE);
  assert.equal(result.errors.pin, PIN_MESSAGE);
  assert.equal(result.errors.shippingAddress, ADDRESS_MESSAGE);
  assert.equal(result.errors.requestedDate, DATE_MESSAGE);
  assert.equal(runtime.state.captchaCalls, 0);
  assert.equal(runtime.state.appendCalls, 0);
});

test("reconciles append failures without deleting a file after persisted-then-threw", () => {
  const before = makeRuntime({ appendMode: "before-throw" });
  assert.throws(() => before.context.submitOrder(validForm({ referenceImage: imageBlob() })), /Unable to confirm/);
  assert.equal(before.state.fileCreates, 1);
  assert.equal(before.state.trashed, 1);
  const persisted = makeRuntime({ appendMode: "persisted-throw" });
  const result = persisted.context.submitOrder(validForm({ referenceImage: imageBlob() }));
  assert.equal(result.ok, true);
  assert.equal(persisted.state.fileCreates, 1);
  assert.equal(persisted.state.trashed, 0);
  const uncertain = makeRuntime({ appendMode: "before-throw", failRecheck: true });
  assert.throws(() => uncertain.context.submitOrder(validForm({ referenceImage: imageBlob() })), /Unable to confirm/);
  assert.equal(uncertain.state.appendCalls, 1);
  assert.equal(uncertain.state.fileCreates, 1);
  assert.equal(uncertain.state.trashed, 0);
  const cleanupFailure = makeRuntime({ appendMode: "before-throw", cleanupThrows: true });
  assert.throws(() => cleanupFailure.context.submitOrder(validForm({ referenceImage: imageBlob() })), /Unable to confirm/);
  assert.equal(cleanupFailure.state.trashed, 1);
});

test("preserves original dimension values and units and treats an empty blob as no attachment", () => {
  const runtime = makeRuntime();
  const result = runtime.context.submitOrder(validForm({ referenceImage: imageBlob([]) }));
  assert.equal(result.ok, true);
  assert.equal(runtime.state.fileCreates, 0);
  assert.equal(runtime.rows[0][7], "3 ft 0 in");
  assert.equal(runtime.rows[0][8], "ft+in");
  assert.equal(runtime.rows[0][9], 36);
  assert.equal(runtime.rows[0][10], "4 ft 0 in");
  assert.equal(runtime.rows[0][11], "ft+in");
  assert.equal(runtime.rows[0][12], 48);
});

test("purges the ninety-day boundary bottom-up and handles no-file rows", () => {
  const now = new Date("2026-10-19T00:00:00.000Z");
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const fileId = "file-expired";
  const rows = [
    retentionRow("request-boundary", cutoff, ""),
    retentionRow("request-newer", new Date(cutoff.getTime() + 1), ""),
    retentionRow("request-with-file", new Date(cutoff.getTime() - 1), "https://drive.google.test/file"),
  ];
  const runtime = makeRuntime({
    rows,
    folderFiles: [retentionFile(fileId, "order-request-with-file.jpg", cutoff)],
  });
  const result = runtime.context.purgeExpiredOrdersAt_(now);
  assert.equal(result.lastSuccessAt, now.toISOString());
  assert.equal(result.deletedRows, 2);
  assert.equal(result.deletedFiles, 1);
  assert.deepEqual(runtime.state.rowDeletes, [4, 2]);
  assert.deepEqual(runtime.state.driveDeletes, [fileId]);
  assert.equal(runtime.rows.length, 1);
  assert.equal(runtime.rows[0][0], "request-newer");
});

test("deletes no-file rows even when no Drive folder is configured", () => {
  const now = new Date("2026-10-19T00:00:00.000Z");
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const runtime = makeRuntime({ properties: { ORDER_DRIVE_FOLDER_ID: "" }, rows: [retentionRow("request-no-folder", cutoff, "")] });
  const result = runtime.context.purgeExpiredOrdersAt_(now);
  assert.equal(result.deletedRows, 1);
  assert.equal(runtime.rows.length, 0);
});

test("deletes only old exact-name orphans in the configured private folder", () => {
  const now = new Date("2026-10-19T00:00:00.000Z");
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const files = [
    retentionFile("orphan", "order-request-orphan.jpg", cutoff),
    retentionFile("short", "order-short.jpg", cutoff),
    retentionFile("foreign", "other-request-orphan.jpg", cutoff),
    retentionFile("wrong-extension", "order-request-orphan.txt", cutoff),
    retentionFile("new", "order-request-newer.png", new Date(cutoff.getTime() + 1)),
  ];
  const runtime = makeRuntime({ rows: [], folderFiles: files });
  const result = runtime.context.purgeExpiredOrdersAt_(now);
  assert.equal(result.deletedRows, 0);
  assert.equal(result.deletedFiles, 1);
  assert.deepEqual(runtime.state.driveDeletes, ["orphan"]);
  assert.deepEqual(runtime.state.logs, [JSON.stringify(result)]);
});

test("refuses retention work when the configured folder is public", () => {
  const now = new Date("2026-10-19T00:00:00.000Z");
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const runtime = makeRuntime({
    folderAccess: "ANYONE_WITH_LINK",
    rows: [retentionRow("request-public-folder", cutoff, "https://drive.google.test/file")],
    folderFiles: [retentionFile("file-public-folder", "order-request-public-folder.jpg", cutoff)],
  });
  assert.throws(() => runtime.context.purgeExpiredOrdersAt_(now), /Retention cleanup failed/);
  assert.equal(runtime.rows.length, 1);
  assert.equal(runtime.state.driveDeletes.length, 0);
});

test("processes valid records but refuses malformed expired rows", () => {
  const now = new Date("2026-10-19T00:00:00.000Z");
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const runtime = makeRuntime({ rows: [
    retentionRow("request-valid", cutoff, ""),
    retentionRow("bad id", cutoff, ""),
  ] });
  assert.throws(() => runtime.context.purgeExpiredOrdersAt_(now), /Retention cleanup failed/);
  assert.deepEqual(runtime.state.rowDeletes, [2]);
  assert.equal(runtime.rows.length, 1);
  assert.equal(runtime.rows[0][0], "bad id");
});

test("preserves rows and attachments for non-Date Received at values", () => {
  const now = new Date("2026-10-19T00:00:00.000Z");
  for (const [index, receivedAt] of [true, 12345, "not-a-date", "2020-01-01T00:00:00.000Z"].entries()) {
    const requestId = `request-malformed-${index}`;
    const runtime = makeRuntime({
      rows: [retentionRow(requestId, receivedAt, "https://drive.google.test/file")],
      folderFiles: [retentionFile(`file-malformed-${index}`, `order-${requestId}.jpg`, new Date("2020-01-01T00:00:00.000Z"))],
    });
    assert.throws(() => runtime.context.purgeExpiredOrdersAt_(now), /Retention cleanup failed/);
    assert.equal(runtime.rows.length, 1);
    assert.deepEqual(runtime.state.rowDeletes, []);
    assert.deepEqual(runtime.state.driveDeletes, []);
    assert.deepEqual(runtime.state.logs, [JSON.stringify({ failedAt: now.toISOString(), deletedRows: 0, deletedFiles: 0, errors: 1 })]);
  }
});

test("accepts a valid Date Received at cell at the retention boundary", () => {
  const now = new Date("2026-10-19T00:00:00.000Z");
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const runtime = makeRuntime({ rows: [retentionRow("request-valid-date", cutoff, "")] });
  const result = runtime.context.purgeExpiredOrdersAt_(now);
  assert.equal(result.deletedRows, 1);
  assert.equal(runtime.rows.length, 0);
});

test("keeps an attachment and row when file deletion fails, then succeeds on rerun", () => {
  const now = new Date("2026-10-19T00:00:00.000Z");
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const options = {
    rows: [retentionRow("request-file-failure", cutoff, "https://drive.google.test/file")],
    folderFiles: [retentionFile("file-failure", "order-request-file-failure.jpg", cutoff)],
    driveDeleteThrows: true,
  };
  const runtime = makeRuntime(options);
  assert.throws(() => runtime.context.purgeExpiredOrdersAt_(now), /Retention cleanup failed/);
  assert.equal(runtime.rows.length, 1);
  assert.equal(runtime.state.driveDeletes.length, 1);
  options.driveDeleteThrows = false;
  const result = runtime.context.purgeExpiredOrdersAt_(now);
  assert.equal(result.deletedRows, 1);
  assert.equal(result.deletedFiles, 1);
  assert.equal(runtime.rows.length, 0);
});

test("deletes a row after a prior file-success/row-failure run", () => {
  const now = new Date("2026-10-19T00:00:00.000Z");
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const options = {
    rows: [retentionRow("request-row-failure", cutoff, "https://drive.google.test/file")],
    folderFiles: [retentionFile("file-row-failure", "order-request-row-failure.jpg", cutoff)],
    deleteRowThrows: true,
  };
  const runtime = makeRuntime(options);
  assert.throws(() => runtime.context.purgeExpiredOrdersAt_(now), /Retention cleanup failed/);
  assert.equal(runtime.rows.length, 1);
  assert.equal(runtime.state.driveDeletes.length, 1);
  options.deleteRowThrows = false;
  const result = runtime.context.purgeExpiredOrdersAt_(now);
  assert.equal(result.deletedRows, 1);
  assert.equal(result.deletedFiles, 0);
  assert.equal(runtime.rows.length, 0);
});

test("runs while intake is disabled and logs only success time and counts", () => {
  const runtime = makeRuntime({ properties: { ORDER_FORM_DISABLED: "true" }, rows: [retentionRow("request-disabled", new Date("2020-01-01T00:00:00.000Z"), "")] });
  const result = runtime.context.purgeExpiredOrders_();
  assert.equal(result.deletedRows, 1);
  assert.equal(runtime.rows.length, 0);
  assert.deepEqual(runtime.state.logs, [JSON.stringify(result)]);
  assert.doesNotMatch(runtime.state.logs[0], /request-disabled/);
});

test("installs one daily retention trigger idempotently", () => {
  const options = { triggers: [] };
  const runtime = makeRuntime(options);
  assert.equal(runtime.context.installRetentionTrigger_(), true);
  assert.equal(runtime.context.installRetentionTrigger_(), false);
  assert.equal(runtime.state.triggerCreates, 1);
  assert.equal(runtime.state.triggerConfig.everyDays, 1);
  assert.equal(runtime.state.triggerConfig.atHour, 3);
});

test("owner-gates the public retention installer and keeps cleanup private", () => {
  const blank = makeRuntime({ activeEmail: "", effectiveEmail: "owner@example.com", triggers: [] });
  assert.throws(() => blank.context.installRetentionTrigger(), /Run this setup as the deployment owner/);
  assert.equal(blank.state.triggerCreates, 0);

  const mismatched = makeRuntime({ activeEmail: "owner@example.com", effectiveEmail: "other@example.com", triggers: [] });
  assert.throws(() => mismatched.context.installRetentionTrigger(), /Run this setup as the deployment owner/);
  assert.equal(mismatched.state.triggerCreates, 0);

  const owner = makeRuntime({ activeEmail: "owner@example.com", effectiveEmail: "owner@example.com", triggers: [] });
  const originalInstaller = owner.context.installRetentionTrigger_;
  let delegateCalls = 0;
  owner.context.installRetentionTrigger_ = function () {
    delegateCalls += 1;
    return originalInstaller();
  };
  assert.equal(owner.context.installRetentionTrigger(), true);
  assert.equal(delegateCalls, 1);
  assert.equal(owner.context.installRetentionTrigger(), false);
  assert.equal(delegateCalls, 2);
  assert.equal(owner.state.triggerCreates, 1);
  assert.match(source, /^function installRetentionTrigger_\(/m);
  assert.match(source, /^function purgeExpiredOrders_\(/m);
  assert.match(source, /^function purgeExpiredOrdersAt_\(/m);
  assert.doesNotMatch(source, /^function (purgeExpiredOrders|purgeExpiredOrdersAt)\(/m);
  assert.doesNotMatch(source.slice(0, source.indexOf("function renderForm_")), /purgeExpiredOrders/);
});

test("retention cleanup honors the existing script lock", () => {
  const runtime = makeRuntime({ lockAvailable: false, rows: [retentionRow("request-locked", new Date("2020-01-01T00:00:00.000Z"), "")] });
  assert.throws(() => runtime.context.purgeExpiredOrders_(), /Unable to start retention cleanup/);
  assert.equal(runtime.rows.length, 1);
});

const ALERT_PROPERTIES = { WHATSAPP_CALLMEBOT_KEY: "key 123", ORDER_ALERT_EMAIL: "saloni@example.com" };
const alertForm = (overrides = {}) => validForm(Object.assign({
  productName: "Resin photo frame", quantity: "2", customerName: "Priya Sharma", phone: "9876543210",
  email: "priya@example.com", fulfillment: "shipping", shippingAddress: "12 Secret Lane", city: "Jaipur", state: "Rajasthan",
  pin: "302001", designDetails: "Gold flowers", requestedDate: "2026-12-01", referralCode: "",
}, overrides));

test("a new order sends one privacy-light WhatsApp alert through CallMeBot after the lock is released", () => {
  const runtime = makeRuntime({ properties: ALERT_PROPERTIES });
  const result = runtime.context.submitOrder(alertForm());
  assert.equal(result.ok, true);
  assert.equal(runtime.rows.length, 1);
  assert.equal(runtime.state.whatsappFetches.length, 1);
  const fetch = runtime.state.whatsappFetches[0];
  assert.equal(fetch.lockHeld, false);
  assert.equal(fetch.params.muteHttpExceptions, true);
  const url = new URL(fetch.url);
  assert.equal(url.origin + url.pathname, "https://api.callmebot.com/whatsapp.php");
  assert.equal(url.searchParams.get("phone"), "918209238541");
  assert.equal(url.searchParams.get("apikey"), "key 123");
  const text = url.searchParams.get("text");
  assert.ok(text.startsWith("\u{1F6CD}\uFE0F New order on saloniresinart.com"));
  assert.ok(text.includes("Resin photo frame"));
  assert.ok(text.includes("\u00D7 2") || text.includes("\u00D72"));
  assert.ok(text.includes("Priya"));
  assert.ok(text.includes("Jaipur"));
  assert.ok(text.includes("Request request-"));
  assert.ok(text.includes("https://docs.google.com/spreadsheets/d/sheet/edit"));
  for (const secret of ["Sharma", "9876543210", "priya@example.com", "Secret Lane", "Gold flowers", "302001"]) {
    assert.equal(text.includes(secret), false, secret);
  }
});

test("a pickup order says Pickup in Ajmer and a custom WhatsApp phone is used", () => {
  const runtime = makeRuntime({ properties: Object.assign({ WHATSAPP_CALLMEBOT_PHONE: "919999999999" }, ALERT_PROPERTIES) });
  assert.equal(runtime.context.submitOrder(alertForm({ fulfillment: "pickup", shippingAddress: "", city: "", state: "", pin: "" })).ok, true);
  const url = new URL(runtime.state.whatsappFetches[0].url);
  assert.equal(url.searchParams.get("phone"), "919999999999");
  assert.ok(url.searchParams.get("text").includes("Pickup in Ajmer"));
});

test("a new order sends one full-detail email after the lock is released", () => {
  const runtime = makeRuntime({ properties: ALERT_PROPERTIES, effectiveEmail: "owner@example.com" });
  assert.equal(runtime.context.submitOrder(alertForm({ referenceImage: imageBlob() })).ok, true);
  assert.equal(runtime.state.emails.length, 1);
  const { message, lockHeld } = runtime.state.emails[0];
  assert.equal(lockHeld, false);
  assert.equal(message.to, "saloni@example.com");
  assert.equal(message.subject, "New order: Resin photo frame \u2013 Priya");
  for (const detail of ["Priya Sharma", "9876543210", "priya@example.com", "Resin photo frame", "2", "Gold flowers", "12 Secret Lane", "Jaipur", "Rajasthan", "302001", "2026-12-01", "request-1234567890", "https://drive.google.test/file", "https://docs.google.com/spreadsheets/d/sheet/edit"]) {
    assert.ok(message.body.includes(detail), detail);
  }
});

test("the alert email falls back to the script owner, and is skipped when no address exists", () => {
  const owner = makeRuntime({ properties: { WHATSAPP_CALLMEBOT_KEY: "k" }, effectiveEmail: "owner@example.com" });
  owner.context.submitOrder(alertForm());
  assert.equal(owner.state.emails[0].message.to, "owner@example.com");
  const none = makeRuntime({ properties: { WHATSAPP_CALLMEBOT_KEY: "k" } });
  assert.equal(none.context.submitOrder(alertForm()).ok, true);
  assert.equal(none.state.emails.length, 0);
});

test("a missing CallMeBot key skips WhatsApp but still sends the email", () => {
  const runtime = makeRuntime({ properties: { ORDER_ALERT_EMAIL: "saloni@example.com" } });
  assert.equal(runtime.context.submitOrder(alertForm()).ok, true);
  assert.equal(runtime.state.whatsappFetches.length, 0);
  assert.equal(runtime.state.emails.length, 1);
});

test("a replayed request, validation failure, daily cap, kill switch, and failed append send no alerts", () => {
  const first = alertForm();
  const helper = makeRuntime();
  const fingerprint = helper.context.payloadFingerprint_(helper.context.collectPayload_(first));
  const replay = makeRuntime({ properties: ALERT_PROPERTIES, rows: [[first.requestId, fingerprint, new Date(), first.sourceKind, first.sourceId]] });
  assert.equal(replay.context.submitOrder(first).ok, true);
  const invalid = makeRuntime({ properties: ALERT_PROPERTIES });
  assert.equal(invalid.context.submitOrder(alertForm({ customerName: "" })).ok, false);
  const daily = makeRuntime({ properties: Object.assign({ DAILY_ACCEPTANCE_CAP: "1" }, ALERT_PROPERTIES), rows: [["old", "fingerprint", new Date(), "catalogue", "id"]] });
  assert.equal(daily.context.submitOrder(alertForm()).ok, false);
  const disabled = makeRuntime({ properties: Object.assign({ ORDER_FORM_DISABLED: "true" }, ALERT_PROPERTIES) });
  assert.equal(disabled.context.submitOrder(alertForm()).ok, false);
  const failed = makeRuntime({ properties: ALERT_PROPERTIES, appendMode: "before-throw" });
  assert.throws(() => failed.context.submitOrder(alertForm()), /Unable to confirm/);
  for (const runtime of [replay, invalid, daily, disabled, failed]) {
    assert.equal(runtime.state.whatsappFetches.length, 0);
    assert.equal(runtime.state.emails.length, 0);
  }
});

test("WhatsApp or email failures never change the saved order or its result", () => {
  for (const failure of [{ whatsappThrows: true }, { mailThrows: true }, { whatsappThrows: true, mailThrows: true }]) {
    const runtime = makeRuntime(Object.assign({ properties: ALERT_PROPERTIES }, failure));
    const result = runtime.context.submitOrder(alertForm());
    assert.equal(result.ok, true);
    assert.equal(result.requestId, "request-1234567890");
    assert.equal(runtime.rows.length, 1);
    assert.equal(runtime.state.whatsappFetches.length, 1);
    assert.equal(runtime.state.emails.length, 1);
    assert.equal(runtime.state.logs.some((line) => /Priya|9876543210|Secret Lane|key 123/.test(line)), false);
  }
});

test("testOrderAlerts_ sends one labelled TEST WhatsApp and email with sample data", () => {
  const runtime = makeRuntime({ properties: ALERT_PROPERTIES });
  runtime.context.testOrderAlerts_();
  assert.equal(runtime.state.whatsappFetches.length, 1);
  assert.equal(runtime.state.emails.length, 1);
  assert.ok(new URL(runtime.state.whatsappFetches[0].url).searchParams.get("text").includes("TEST"));
  assert.match(runtime.state.emails[0].message.subject, /TEST/);
  assert.equal(runtime.rows.length, 0);
  assert.equal(/testOrderAlerts_/.test(runtime.context.doGet.toString() + runtime.context.doPost.toString()), false);
});

test("testOrderAlerts sends the TEST alerts only when the owner runs it from the editor", () => {
  const owner = makeRuntime({ properties: ALERT_PROPERTIES, activeEmail: "owner@example.com", effectiveEmail: "owner@example.com" });
  owner.context.testOrderAlerts();
  assert.deepEqual(JSON.parse(JSON.stringify(owner.state.requiredScopes)), [{ mode: "FULL", scopes: ["https://www.googleapis.com/auth/script.send_mail", "https://www.googleapis.com/auth/script.external_request"] }], "asks Google to show the permission screen for mail and outbound calls");
  assert.equal(owner.state.whatsappFetches.length, 1);
  assert.equal(owner.state.emails.length, 1);
  assert.ok(new URL(owner.state.whatsappFetches[0].url).searchParams.get("text").includes("TEST"));
  assert.match(owner.state.emails[0].message.subject, /TEST/);
});

test("testOrderAlerts refuses a web visitor or a different user and sends nothing", () => {
  for (const emails of [{ activeEmail: "", effectiveEmail: "owner@example.com" }, { activeEmail: "", effectiveEmail: "" }, { activeEmail: "stranger@example.com", effectiveEmail: "owner@example.com" }]) {
    const runtime = makeRuntime(Object.assign({ properties: ALERT_PROPERTIES }, emails));
    assert.throws(() => runtime.context.testOrderAlerts(), /Run this from the Apps Script editor as the owner\./);
    assert.equal(runtime.state.requiredScopes, undefined, "strangers never trigger a permission prompt");
    assert.equal(runtime.state.whatsappFetches.length, 0);
    assert.equal(runtime.state.emails.length, 0);
  }
  const runtime = makeRuntime();
  assert.equal(/testOrderAlerts/.test(runtime.context.doGet.toString() + runtime.context.doPost.toString()), false);
});

// --- Queued order alerts (alerts sent by a 1-minute trigger, not during the shopper's request) ---
const QUEUE_PREFIX = "ORDER_ALERT_Q_";
const queueKeys = (runtime) => Object.keys(runtime.properties).filter((key) => key.startsWith(QUEUE_PREFIX));
const QUEUED_PROPERTIES = Object.assign({ ORDER_ALERT_QUEUE_READY: "true" }, ALERT_PROPERTIES);

function queuedJob(runtime, requestId, overrides = {}) {
  const payload = runtime.context.collectPayload_(alertForm({ requestId }));
  const stored = {};
  for (const [name, value] of Object.entries(payload)) if (name !== "referenceImage") stored[name] = value;
  return JSON.stringify(Object.assign({ p: stored, r: "2026-11-10T08:00:00.000Z", f: "", a: 0, w: 0 }, overrides));
}

test("queue mode: a new order stores one alert property and sends nothing during the request", () => {
  const runtime = makeRuntime({ properties: QUEUED_PROPERTIES });
  const result = runtime.context.submitOrder(alertForm({ referenceImage: imageBlob() }));
  assert.equal(result.ok, true);
  assert.equal(runtime.rows.length, 1);
  assert.equal(runtime.state.emails.length, 0);
  assert.equal(runtime.state.whatsappFetches.length, 0);
  assert.deepEqual(queueKeys(runtime), [QUEUE_PREFIX + "request-1234567890"]);
  const job = JSON.parse(runtime.properties[QUEUE_PREFIX + "request-1234567890"]);
  assert.equal(job.p.customerName, "Priya Sharma");
  assert.equal(job.f, "file-id-1");
  assert.equal(job.a, 0);
  assert.ok(!isNaN(Date.parse(job.r)));
  assert.equal("referenceImage" in job.p, false);
});

test("not-ready mode sends the alerts immediately as before and queues nothing", () => {
  for (const flag of [{}, { ORDER_ALERT_QUEUE_READY: "false" }, { ORDER_ALERT_QUEUE_READY: "" }]) {
    const runtime = makeRuntime({ properties: Object.assign({}, ALERT_PROPERTIES, flag) });
    assert.equal(runtime.context.submitOrder(alertForm()).ok, true);
    assert.equal(runtime.state.emails.length, 1);
    assert.equal(runtime.state.whatsappFetches.length, 1);
    assert.equal(queueKeys(runtime).length, 0);
  }
});

test("a failed property write falls back to an immediate alert and the order still succeeds", () => {
  const runtime = makeRuntime({ properties: QUEUED_PROPERTIES, setPropertyThrows: true });
  const result = runtime.context.submitOrder(alertForm());
  assert.equal(result.ok, true);
  assert.equal(runtime.rows.length, 1);
  assert.equal(runtime.state.emails.length, 1);
  assert.equal(runtime.state.whatsappFetches.length, 1);
  assert.equal(queueKeys(runtime).length, 0);
});

test("more than 30 queued alerts means the trigger is broken, so new orders send immediately", () => {
  const properties = Object.assign({}, QUEUED_PROPERTIES);
  for (let index = 0; index < 31; index += 1) properties[QUEUE_PREFIX + "old-request-" + index] = "{}";
  const runtime = makeRuntime({ properties });
  assert.equal(runtime.context.submitOrder(alertForm()).ok, true);
  assert.equal(runtime.state.emails.length, 1);
  assert.equal(queueKeys(runtime).length, 31);
  const atLimit = Object.assign({}, QUEUED_PROPERTIES);
  for (let index = 0; index < 30; index += 1) atLimit[QUEUE_PREFIX + "old-request-" + index] = "{}";
  const queued = makeRuntime({ properties: atLimit });
  queued.context.submitOrder(alertForm());
  assert.equal(queued.state.emails.length, 0);
  assert.equal(queueKeys(queued).length, 31);
});

test("a replay of the same request never queues or sends a second alert", () => {
  const runtime = makeRuntime({ properties: QUEUED_PROPERTIES });
  assert.equal(runtime.context.submitOrder(alertForm()).ok, true);
  assert.equal(queueKeys(runtime).length, 1);
  const first = runtime.properties[queueKeys(runtime)[0]];
  runtime.context.sendQueuedOrderAlerts_();
  assert.equal(runtime.state.emails.length, 1);
  assert.equal(runtime.context.submitOrder(alertForm()).ok, true);
  assert.equal(runtime.rows.length, 1);
  assert.equal(queueKeys(runtime).length, 0);
  assert.equal(runtime.state.emails.length, 1);
  assert.ok(first);
});

test("the sender emails the full details, then deletes the property, oldest order first", () => {
  const runtime = makeRuntime({ properties: QUEUED_PROPERTIES, folderFiles: [] });
  runtime.properties[QUEUE_PREFIX + "newer-request-2"] = queuedJob(runtime, "newer-request-2", { r: "2026-11-10T09:00:00.000Z", f: "file-9" });
  runtime.properties[QUEUE_PREFIX + "older-request-1"] = queuedJob(runtime, "older-request-1");
  assert.equal(runtime.context.sendQueuedOrderAlerts_(), 2);
  assert.equal(runtime.state.emails.length, 2);
  assert.match(runtime.state.emails[0].message.body, /Request ID: older-request-1/);
  assert.match(runtime.state.emails[1].message.body, /Request ID: newer-request-2/);
  assert.match(runtime.state.emails[0].message.body, /Customer: Priya Sharma/);
  assert.match(runtime.state.emails[0].message.body, /Ship to: 12 Secret Lane, Jaipur, Rajasthan, 302001/);
  assert.match(runtime.state.emails[1].message.body, /Reference image: https:\/\/drive\.google\.test\/file/);
  assert.equal(runtime.state.whatsappFetches.length, 2);
  assert.equal(queueKeys(runtime).length, 0);
  assert.equal(runtime.properties.ORDER_ALERT_QUEUE_READY, "true", "flag and other settings are never touched");
  assert.equal(runtime.properties.ORDER_ALERT_EMAIL, "saloni@example.com");
  assert.equal(runtime.context.sendQueuedOrderAlerts_(), 0);
  assert.equal(runtime.state.emails.length, 2, "nothing is sent twice");
});

test("end to end: queue during submit, the sender then sends exactly one email and one WhatsApp", () => {
  const runtime = makeRuntime({ properties: QUEUED_PROPERTIES });
  runtime.context.submitOrder(alertForm());
  runtime.context.sendQueuedOrderAlerts_();
  runtime.context.sendQueuedOrderAlerts_();
  assert.equal(runtime.state.emails.length, 1);
  assert.equal(runtime.state.whatsappFetches.length, 1);
  assert.equal(runtime.state.emails[0].message.to, "saloni@example.com");
  assert.match(runtime.state.emails[0].message.subject, /New order: Resin photo frame/);
});

test("an email failure keeps the alert, counts the attempt, and gives up after 5 tries", () => {
  const options = { properties: QUEUED_PROPERTIES, mailThrows: true };
  const runtime = makeRuntime(options);
  runtime.properties[QUEUE_PREFIX + "request-failing-1"] = queuedJob(runtime, "request-failing-1");
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    assert.equal(runtime.context.sendQueuedOrderAlerts_(), 0);
    const job = JSON.parse(runtime.properties[QUEUE_PREFIX + "request-failing-1"]);
    assert.equal(job.a, attempt);
  }
  assert.equal(runtime.state.whatsappFetches.length, 1, "WhatsApp is best effort and is not repeated on retries");
  runtime.context.sendQueuedOrderAlerts_();
  assert.equal(queueKeys(runtime).length, 0, "customer details are not kept forever");
  assert.ok(runtime.state.logs.some((line) => /Gave up on order alert request-/.test(line)));
  assert.equal(runtime.state.logs.some((line) => /Priya|9876543210|Secret Lane/.test(line)), false);
  assert.equal(runtime.state.emails.length, 5);
});

test("a retry after a failure sends once and then removes the alert", () => {
  const options = { properties: QUEUED_PROPERTIES, mailThrows: true };
  const runtime = makeRuntime(options);
  runtime.properties[QUEUE_PREFIX + "request-retry-12"] = queuedJob(runtime, "request-retry-12");
  runtime.context.sendQueuedOrderAlerts_();
  assert.equal(queueKeys(runtime).length, 1);
  options.mailThrows = false;
  assert.equal(runtime.context.sendQueuedOrderAlerts_(), 1);
  assert.equal(queueKeys(runtime).length, 0);
});

test("a mail quota error keeps every alert, does not count an attempt, and stops the run", () => {
  const runtime = makeRuntime({ properties: QUEUED_PROPERTIES, mailThrows: "Service invoked too many times for one day: email." });
  runtime.properties[QUEUE_PREFIX + "request-quota-01"] = queuedJob(runtime, "request-quota-01");
  runtime.properties[QUEUE_PREFIX + "request-quota-02"] = queuedJob(runtime, "request-quota-02", { r: "2026-11-10T08:05:00.000Z" });
  assert.equal(runtime.context.sendQueuedOrderAlerts_(), 0);
  assert.equal(runtime.state.emails.length, 1, "stops after the first quota error");
  assert.equal(queueKeys(runtime).length, 2);
  assert.equal(JSON.parse(runtime.properties[QUEUE_PREFIX + "request-quota-01"]).a, 0);
});

test("a missing reference file still sends the alert, without the link", () => {
  const runtime = makeRuntime({ properties: QUEUED_PROPERTIES, referenceFileMissing: true });
  runtime.properties[QUEUE_PREFIX + "request-nofile-01"] = queuedJob(runtime, "request-nofile-01", { f: "gone-file" });
  assert.equal(runtime.context.sendQueuedOrderAlerts_(), 1);
  assert.deepEqual(runtime.state.fileLookups, ["gone-file"]);
  assert.equal(runtime.state.emails.length, 1);
  assert.doesNotMatch(runtime.state.emails[0].message.body, /Reference image/);
  assert.equal(queueKeys(runtime).length, 0);
});

test("an unreadable queued alert is dropped without blocking the others", () => {
  const runtime = makeRuntime({ properties: QUEUED_PROPERTIES });
  runtime.properties[QUEUE_PREFIX + "request-broken-1"] = "not json";
  runtime.properties[QUEUE_PREFIX + "request-good-001"] = queuedJob(runtime, "request-good-001");
  assert.equal(runtime.context.sendQueuedOrderAlerts_(), 1);
  assert.equal(queueKeys(runtime).length, 0);
});

test("the sender skips the run when another run holds the lock, and uses a lock that never blocks orders", () => {
  const runtime = makeRuntime({ properties: QUEUED_PROPERTIES, userLockAvailable: false });
  runtime.properties[QUEUE_PREFIX + "request-locked-01"] = queuedJob(runtime, "request-locked-01");
  assert.equal(runtime.context.sendQueuedOrderAlerts_(), 0);
  assert.equal(runtime.state.emails.length, 0);
  assert.equal(queueKeys(runtime).length, 1);
  assert.equal(runtime.state.locked, false, "the order script lock is never taken by the sender");
  const free = makeRuntime({ properties: QUEUED_PROPERTIES });
  free.properties[QUEUE_PREFIX + "request-free-0001"] = queuedJob(free, "request-free-0001");
  free.context.sendQueuedOrderAlerts_();
  assert.equal(free.state.userLockReleased, 1);
});

test("setupOrderAlertQueue installs exactly one 1-minute trigger and then sets the ready flag", () => {
  const options = { triggers: [], activeEmail: "owner@example.com", effectiveEmail: "owner@example.com" };
  const runtime = makeRuntime(options);
  runtime.context.setupOrderAlertQueue();
  runtime.context.setupOrderAlertQueue();
  assert.equal(runtime.state.triggerCreates, 1);
  assert.equal(runtime.state.triggerConfig.handler, "sendQueuedOrderAlerts_");
  assert.equal(runtime.state.triggerConfig.everyMinutes, 1);
  assert.equal(runtime.properties.ORDER_ALERT_QUEUE_READY, "true");
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.state.requiredScopes[0].scopes)), [
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/script.send_mail",
    "https://www.googleapis.com/auth/script.external_request",
  ]);
});

test("setupOrderAlertQueue refuses a web visitor or another user and changes nothing", () => {
  for (const emails of [{ activeEmail: "", effectiveEmail: "owner@example.com" }, { activeEmail: "stranger@example.com", effectiveEmail: "owner@example.com" }]) {
    const runtime = makeRuntime(Object.assign({ triggers: [] }, emails));
    assert.throws(() => runtime.context.setupOrderAlertQueue(), /Run this from the Apps Script editor as the owner\./);
    assert.equal(runtime.state.triggerCreates, 0);
    assert.equal(runtime.properties.ORDER_ALERT_QUEUE_READY, undefined);
    assert.equal(runtime.state.requiredScopes, undefined);
  }
  const runtime = makeRuntime();
  assert.equal(/setupOrderAlertQueue|sendQueuedOrderAlerts_/.test(runtime.context.doGet.toString() + runtime.context.doPost.toString()), false);
});

// --- JSON order endpoint used by the order form built into the site ---
const JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]).toString("base64");
const PNG_BASE64 = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]).toString("base64");

function orderPost(runtime, body, action = "order") {
  const output = runtime.context.doPost({
    parameter: { action },
    postData: { type: "text/plain", contents: typeof body === "string" ? body : JSON.stringify(body) },
  });
  assert.equal(output.mimeType, "JSON");
  return JSON.parse(output.text);
}

function postedOrder(overrides = {}) {
  const form = validForm(overrides);
  delete form.captchaToken;
  return form;
}

test("action=order appends one row and sends one alert for a valid JSON order", () => {
  const runtime = makeRuntime({ properties: ALERT_PROPERTIES });
  const result = orderPost(runtime, postedOrder());
  assert.equal(result.ok, true);
  assert.equal(result.requestId, "request-1234567890");
  assert.equal(runtime.rows.length, 1);
  assert.equal(runtime.state.appendCalls, 1);
  assert.equal(runtime.state.whatsappFetches.length, 1);
  assert.equal(runtime.state.emails.length, 1);
});

test("action=order ignores unknown fields and the old captcha token", () => {
  const runtime = makeRuntime();
  const result = orderPost(runtime, Object.assign(postedOrder(), { captchaToken: "x", injected: "<b>", __proto__: { admin: true } }));
  assert.equal(result.ok, true);
  assert.equal(runtime.state.captchaCalls, 0);
  assert.equal(runtime.rows.flat().includes("<b>"), false);
});

test("action=order replays the same request without a second row and rejects a conflicting replay", () => {
  const runtime = makeRuntime();
  assert.equal(orderPost(runtime, postedOrder()).ok, true);
  const replay = orderPost(runtime, postedOrder());
  assert.equal(replay.ok, true);
  assert.equal(runtime.rows.length, 1);
  assert.equal(runtime.state.appendCalls, 1);
  const conflict = orderPost(runtime, postedOrder({ productName: "Changed frame" }));
  assert.equal(conflict.ok, false);
  assert.match(conflict.errors.requestId, /conflict/i);
  assert.equal(runtime.rows.length, 1);
});

test("action=order keeps the kill switch, validation, and the daily cap of 50", () => {
  const paused = makeRuntime({ properties: { ORDER_FORM_DISABLED: "true" } });
  assert.match(orderPost(paused, postedOrder()).errors.form, /paused/);
  assert.equal(paused.state.appendCalls, 0);
  const invalid = makeRuntime();
  assert.ok(orderPost(invalid, postedOrder({ phone: "123" })).errors.phone);
  assert.equal(invalid.state.appendCalls, 0);
  const rows = Array.from({ length: 50 }, (_, index) => [`old-request-${index}`, "fp", new Date(), "catalogue", "id"]);
  const capped = makeRuntime({ rows });
  assert.match(orderPost(capped, postedOrder()).errors.form, /daily request limit/);
  assert.equal(capped.state.appendCalls, 0);
});

test("action=order stores a decoded JPEG or PNG reference image", () => {
  for (const [type, data] of [["image/jpeg", JPEG_BASE64], ["image/png", PNG_BASE64]]) {
    const runtime = makeRuntime();
    const result = orderPost(runtime, postedOrder({ referenceImage: { type, data } }));
    assert.equal(result.ok, true, type);
    assert.equal(runtime.state.fileCreates, 1);
    assert.equal(runtime.state.base64Decodes, 1);
  }
});

test("action=order rejects a bad, wrongly typed, mismatched, or oversized image without decoding the big ones", () => {
  const limit = Math.ceil((5 * 1024 * 1024) / 3) * 4;
  const cases = [
    [{ type: "image/jpeg", data: "not base64 !!" }, /JPG or PNG/, 0],
    [{ type: "image/gif", data: JPEG_BASE64 }, /JPG or PNG/, 0],
    [{ type: "image/jpeg", data: PNG_BASE64 }, /signature/, 1],
    [{ type: "image/jpeg", data: "A".repeat(limit + 4) }, /5 MB/, 0],
    ["just-a-string", /JPG or PNG/, 0],
  ];
  for (const [referenceImage, message, decodes] of cases) {
    const runtime = makeRuntime();
    const result = orderPost(runtime, postedOrder({ referenceImage }));
    assert.equal(result.ok, false);
    assert.match(result.errors.referenceImage, message);
    assert.equal(runtime.state.base64Decodes, decodes);
    assert.equal(runtime.state.appendCalls, 0);
    assert.equal(runtime.state.fileCreates, 0);
  }
});

test("action=order answers invalid for broken JSON and unconfirmed when the save throws", () => {
  const runtime = makeRuntime();
  for (const body of ["{not json", "[]", "null", ""]) {
    assert.deepEqual(orderPost(runtime, body), { ok: false, error: "invalid" });
  }
  assert.equal(runtime.state.appendCalls, 0);
  const locked = makeRuntime({ lockAvailable: false });
  assert.deepEqual(orderPost(locked, postedOrder()), { ok: false, error: "unconfirmed" });
  assert.equal(locked.state.appendCalls, 0);
});

test("action=referral returns the code status and never throws", () => {
  const runtime = makeRuntime();
  assert.deepEqual(orderPost(runtime, { code: "!!" }, "referral"), { status: "invalid", code: "" });
  runtime.context.lookupPartner_ = () => ({ status: "active" });
  assert.deepEqual(orderPost(runtime, { code: "friend-10" }, "referral"), { status: "active", code: "FRIEND-10" });
  runtime.context.lookupPartner_ = () => { throw new Error("sheet down"); };
  assert.deepEqual(orderPost(runtime, { code: "friend-10" }, "referral"), { status: "error", code: "FRIEND-10" });
  assert.deepEqual(orderPost(runtime, "{broken", "referral"), { status: "error", code: "" });
});

test("action=seed still renders the order form for pages cached before the change", () => {
  const runtime = makeRuntime();
  runtime.context.doPost({ parameter: { action: "seed", mode: "order", seed: JSON.stringify({ requestId: "request-cached-page" }) } });
  assert.equal(runtime.state.templateName, "Form");
});

// --- action=cancel: the shopper asks Saloni to cancel (it never cancels by itself) ---
const CANCEL_ID = "request-1234567890";
const cancelPost = (runtime, body) => orderPost(runtime, body, "cancel");
function orderedRuntime(options = {}) {
  const runtimeOptions = Object.assign({ properties: ALERT_PROPERTIES }, options);
  const runtime = makeRuntime(runtimeOptions);
  runtime.options = runtimeOptions;
  assert.equal(orderPost(runtime, postedOrder(alertFormFields())).ok, true);
  runtime.state.emails.length = 0;
  runtime.state.cellWrites.length = 0;
  runtime.state.dataReads = 0;
  return runtime;
}
function alertFormFields() { const form = alertForm(); delete form.captchaToken; return form; }

test("action=cancel marks the order, adds a dated Staff notes line, and sends one email after the lock is released", () => {
  const runtime = orderedRuntime();
  const before = runtime.rows[0].slice();
  assert.equal(before[24], "New request");
  const result = cancelPost(runtime, { requestId: CANCEL_ID });
  assert.deepEqual(result, { ok: true });
  assert.equal(runtime.rows[0][24], "Cancellation requested");
  assert.match(runtime.rows[0][25], /^Customer asked to cancel on .+ IST via My orders$/);
  assert.ok(runtime.state.formats.some((call) => call[1] === "Asia/Kolkata" && call[2] === "dd MMM yyyy, hh:mm a"), "the note date is written in India time");
  runtime.rows[0].forEach((cell, index) => { if (index !== 24 && index !== 25) assert.equal(cell, before[index], "column " + index + " is unchanged"); });
  assert.equal(runtime.rows.length, 1);
  assert.deepEqual(runtime.state.cellWrites.map((write) => write.column).sort(), [25, 26]);
  assert.equal(runtime.state.emails.length, 1);
  const { message, lockHeld } = runtime.state.emails[0];
  assert.equal(lockHeld, false);
  assert.equal(message.to, "saloni@example.com");
  assert.equal(message.subject, "Cancellation request: Resin photo frame \u2013 Priya");
  for (const detail of [CANCEL_ID, "Resin photo frame", "2", "New request", "https://docs.google.com/spreadsheets/d/sheet/edit"]) assert.ok(message.body.includes(detail), detail);
  assert.match(message.body, /Received:/);
  assert.equal(runtime.state.whatsappFetches.length, 1, "only the order's own alert; cancelling sends no WhatsApp");
});

test("action=cancel appends to existing Staff notes instead of replacing them and keeps text formula-safe", () => {
  const runtime = orderedRuntime();
  runtime.rows[0][25] = "Call before 5pm";
  assert.equal(cancelPost(runtime, { requestId: CANCEL_ID }).ok, true);
  assert.match(runtime.rows[0][25], /^Call before 5pm \| Customer asked to cancel on /);
  const formula = orderedRuntime();
  formula.rows[0][25] = "=HYPERLINK(1)";
  cancelPost(formula, { requestId: CANCEL_ID });
  assert.ok(formula.rows[0][25].startsWith("'=HYPERLINK(1)"));
});

test("action=cancel with an unknown request ID answers not_found and writes and sends nothing", () => {
  const runtime = orderedRuntime();
  const result = cancelPost(runtime, { requestId: "request-unknown-0000" });
  assert.deepEqual(result, { ok: false, error: "not_found" });
  assert.equal(runtime.state.cellWrites.length, 0);
  assert.equal(runtime.state.emails.length, 0);
  assert.equal(runtime.rows[0][24], "New request");
});

test("action=cancel rejects a bad request ID or body before any sheet read", () => {
  for (const body of [{ requestId: "short" }, { requestId: "has space in it!!" }, { requestId: "x".repeat(81) }, { requestId: 1234567890123 }, { requestId: ["request-1234567890"] }, {}, "not json", "[]", "null"]) {
    const runtime = orderedRuntime();
    const result = cancelPost(runtime, body);
    assert.equal(result.ok, false, JSON.stringify(body));
    assert.equal(result.error, "invalid");
    assert.equal(runtime.state.dataReads, 0, "no sheet read for " + JSON.stringify(body));
    assert.equal(runtime.state.cellWrites.length, 0);
    assert.equal(runtime.state.emails.length, 0);
  }
});

test("action=cancel repeated is idempotent: already, no second write and no second email", () => {
  const runtime = orderedRuntime();
  assert.deepEqual(cancelPost(runtime, { requestId: CANCEL_ID }), { ok: true });
  const notes = runtime.rows[0][25];
  const again = cancelPost(runtime, { requestId: CANCEL_ID });
  assert.deepEqual(again, { ok: true, already: true });
  assert.equal(runtime.state.emails.length, 1);
  assert.equal(runtime.rows[0][25], notes);
  assert.equal(runtime.state.cellWrites.length, 2);
});

test("ORDER_CANCEL_DISABLED pauses cancellations before any sheet read, but ORDER_FORM_DISABLED does not", () => {
  const paused = orderedRuntime();
  paused.properties.ORDER_CANCEL_DISABLED = "true";
  assert.deepEqual(cancelPost(paused, { requestId: CANCEL_ID }), { ok: false, error: "paused" });
  assert.equal(paused.state.dataReads, 0);
  assert.equal(paused.rows[0][24], "New request");
  assert.equal(paused.state.emails.length, 0);
  const ordersPaused = orderedRuntime();
  ordersPaused.properties.ORDER_FORM_DISABLED = "true";
  assert.deepEqual(cancelPost(ordersPaused, { requestId: CANCEL_ID }), { ok: true });
});

test("a failing email never fails the cancellation request", () => {
  const runtime = orderedRuntime();
  runtime.context.MailApp.sendEmail = () => { throw new Error("mail down"); };
  const result = cancelPost(runtime, { requestId: CANCEL_ID });
  assert.deepEqual(result, { ok: true });
  assert.equal(runtime.rows[0][24], "Cancellation requested");
});

test("the cancel email goes to the script owner when ORDER_ALERT_EMAIL is not set, and is skipped when there is no address", () => {
  const owner = orderedRuntime({ properties: {}, effectiveEmail: "owner@example.com" });
  assert.equal(cancelPost(owner, { requestId: CANCEL_ID }).ok, true);
  assert.equal(owner.state.emails.length, 1);
  assert.equal(owner.state.emails[0].message.to, "owner@example.com");
  const none = orderedRuntime({ properties: {} });
  assert.equal(cancelPost(none, { requestId: CANCEL_ID }).ok, true);
  assert.equal(none.state.emails.length, 0);
});

test("the cancel reply carries no customer data, and lock trouble or a sheet error is unconfirmed", () => {
  const runtime = orderedRuntime();
  const text = runtime.context.doPost({ parameter: { action: "cancel" }, postData: { contents: JSON.stringify({ requestId: CANCEL_ID }) } }).text;
  for (const secret of ["Priya", "9876543210", "priya@example.com", "Secret Lane", "Resin photo frame", "302001"]) assert.ok(!text.includes(secret), secret);
  const busy = orderedRuntime();
  busy.options.lockAvailable = false;
  assert.deepEqual(cancelPost(busy, { requestId: CANCEL_ID }), { ok: false, error: "unconfirmed" });
  assert.equal(busy.rows[0][24], "New request");
  const broken = orderedRuntime();
  broken.properties.ORDER_SHEET_ID = "";
  assert.deepEqual(cancelPost(broken, { requestId: CANCEL_ID }), { ok: false, error: "unconfirmed" });
});

test("a cancel request never overwrites a Status Saloni already set: note and email only, reply ok", () => {
  for (const status of ["Cancelled", "Confirmed", "In progress", "Dispatched"]) {
    const runtime = orderedRuntime();
    runtime.rows[0][24] = status;
    runtime.rows[0][25] = "Started the tray";
    const before = runtime.rows[0].slice();
    assert.deepEqual(cancelPost(runtime, { requestId: CANCEL_ID }), { ok: true }, status);
    assert.equal(runtime.rows[0][24], status, "Status is kept: " + status);
    assert.match(runtime.rows[0][25], /^Started the tray \| Customer asked to cancel on .+ IST via My orders$/);
    runtime.rows[0].forEach((cell, index) => { if (index !== 25) assert.equal(cell, before[index]); });
    assert.deepEqual(runtime.state.cellWrites.map((write) => write.column), [26], "only Staff notes is written");
    assert.equal(runtime.state.emails.length, 1);
    const { message, lockHeld } = runtime.state.emails[0];
    assert.equal(lockHeld, false);
    assert.equal(message.subject, "Cancellation request: Resin photo frame \u2013 Priya (status: " + status + ")");
    assert.ok(message.body.includes("Status before this request: " + status));
    assert.match(message.body, /Status was not changed/);
  }
});

test("a repeat request on a row with another Status finds the Staff notes line and answers already, with no second email", () => {
  const runtime = orderedRuntime();
  runtime.rows[0][24] = "Confirmed";
  assert.deepEqual(cancelPost(runtime, { requestId: CANCEL_ID }), { ok: true });
  const notes = runtime.rows[0][25];
  assert.deepEqual(cancelPost(runtime, { requestId: CANCEL_ID }), { ok: true, already: true });
  assert.equal(runtime.rows[0][25], notes);
  assert.equal(runtime.rows[0][24], "Confirmed");
  assert.equal(runtime.state.emails.length, 1);
  assert.equal(runtime.state.cellWrites.length, 1);
});

test("a blank Status is treated like New request: it becomes Cancellation requested", () => {
  const runtime = orderedRuntime();
  runtime.rows[0][24] = "";
  assert.deepEqual(cancelPost(runtime, { requestId: CANCEL_ID }), { ok: true });
  assert.equal(runtime.rows[0][24], "Cancellation requested");
  assert.equal(runtime.state.emails.length, 1);
  assert.ok(!runtime.state.emails[0].message.subject.includes("(status:"));
  assert.ok(!/Status was not changed/.test(runtime.state.emails[0].message.body));
});

// --- action=status: "My orders" reads the Status column as a fixed code (never free text, notes or customer data) ---
const statusPost = (runtime, body) => orderPost(runtime, body, "status");
function statusRuntime(statuses, options = {}) {
  const rows = statuses.map((status, index) => {
    const row = new Array(26).fill("");
    row[0] = "request-status-" + String(index).padStart(4, "0");
    row[14] = "Priya Sharma"; row[15] = "9876543210"; row[16] = "priya@example.com"; row[18] = "Secret Lane 12";
    row[24] = status;
    row[25] = "Private staff note about the customer";
    return row;
  });
  const runtime = makeRuntime(Object.assign({ rows }, options));
  runtime.ids = rows.map((row) => row[0]);
  return runtime;
}

test("action=status maps the Status cell to a fixed code (trimmed, case-insensitive)", () => {
  const table = [
    ["", "received"], ["New request", "received"], ["  new REQUEST ", "received"],
    ["Cancellation requested", "cancel_requested"], ["cancellation REQUESTED", "cancel_requested"],
    ["Cancelled", "cancelled"], ["Canceled", "cancelled"], ["Order cancelled by Saloni", "cancelled"],
    ["Cancellation declined", "cancel_declined"], ["  cancellation DECLINED ", "cancel_declined"], ["Declined", "cancelled"], ["Order declined", "cancelled"], ["Rejected", "cancelled"], ["Cancel request declined by Saloni", "cancel_declined"],
    ["Confirmed", "confirmed"], ["accepted", "confirmed"],
    ["In progress", "in_progress"], ["Making", "in_progress"], ["IN MAKING", "in_progress"], ["Preparing", "in_progress"],
    ["Ready", "ready"], ["Ready for pickup", "ready"],
    ["Dispatched", "dispatched"], ["Shipped", "dispatched"], ["Out for delivery", "dispatched"],
    ["Delivered", "delivered"], ["Completed", "delivered"], ["Picked up", "delivered"],
    ["Waiting for the cousin to pick colours", "in_progress"], ["Test", "in_progress"],
  ];
  const runtime = statusRuntime(table.map(([status]) => status));
  const result = statusPost(runtime, { requestIds: runtime.ids });
  assert.equal(result.ok, true);
  table.forEach(([status, code], index) => assert.equal(result.statuses[runtime.ids[index]], code, JSON.stringify(status)));
});

test("action=status answers only for ids found, ignores invalid ids, and reads the sheet once without writing", () => {
  const runtime = statusRuntime(["Confirmed", "Shipped"]);
  const result = statusPost(runtime, { requestIds: [runtime.ids[0], "request-unknown-0000", "bad id", "short", 42, null, runtime.ids[1], runtime.ids[0]] });
  assert.deepEqual(result, { ok: true, statuses: { [runtime.ids[0]]: "confirmed", [runtime.ids[1]]: "dispatched" } });
  assert.equal(runtime.state.rangeReads.length, 1, "one block read");
  assert.equal(runtime.state.rangeReads[0].column + runtime.state.rangeReads[0].numColumns - 1, 25, "reads up to the Status column only");
  assert.equal(runtime.state.dataReads, 0, "no whole-sheet read");
  assert.equal(runtime.state.cellWrites.length, 0);
  assert.ok(!runtime.state.released, "no lock is taken for a read");
  assert.equal(runtime.state.emails.length, 0);
  const none = statusPost(statusRuntime(["Confirmed"]), { requestIds: ["request-unknown-0000"] });
  assert.deepEqual(none, { ok: true, statuses: {} });
});

test("action=status with no valid id is invalid before any sheet read", () => {
  for (const body of [{ requestIds: [] }, { requestIds: ["short", 1, {}] }, { requestIds: "request-status-0000" }, { requestIds: {} }, {}, "not json", "[]", "null"]) {
    const runtime = statusRuntime(["Confirmed"]);
    assert.deepEqual(statusPost(runtime, body), { ok: false, error: "invalid" }, JSON.stringify(body));
    assert.equal(runtime.state.rangeReads.length + runtime.state.dataReads, 0);
  }
});

test("action=status copes with ids that look like object method names", () => {
  const runtime = statusRuntime(["Confirmed"]);
  const result = statusPost(runtime, { requestIds: ["hasOwnProperty", "propertyIsEnumerable", runtime.ids[0]] });
  assert.deepEqual(result, { ok: true, statuses: { [runtime.ids[0]]: "confirmed" } });
});

test("action=status trims a request to the first 50 ids", () => {
  const runtime = statusRuntime(new Array(60).fill("Confirmed"));
  const result = statusPost(runtime, { requestIds: runtime.ids });
  assert.deepEqual(Object.keys(result.statuses), runtime.ids.slice(0, 50));
});

test("action=status never returns Status words, Staff notes or customer data", () => {
  const runtime = statusRuntime(["Waiting for Priya's cousin to decide", "Confirmed"]);
  const text = runtime.context.doPost({ parameter: { action: "status" }, postData: { contents: JSON.stringify({ requestIds: runtime.ids }) } }).text;
  for (const secret of ["Priya", "9876543210", "priya@example.com", "Secret Lane", "Private staff note", "cousin", "Waiting"]) assert.ok(!text.includes(secret), secret);
  assert.deepEqual(JSON.parse(text), { ok: true, statuses: { [runtime.ids[0]]: "in_progress", [runtime.ids[1]]: "confirmed" } });
});

test("ORDER_STATUS_DISABLED pauses status checks before any sheet read, and sheet trouble is unconfirmed", () => {
  const paused = statusRuntime(["Confirmed"], { properties: { ORDER_STATUS_DISABLED: "true" } });
  assert.deepEqual(statusPost(paused, { requestIds: paused.ids }), { ok: false, error: "paused" });
  assert.equal(paused.state.rangeReads.length + paused.state.dataReads, 0);
  const broken = statusRuntime(["Confirmed"]);
  broken.properties.ORDER_SHEET_ID = "";
  assert.deepEqual(statusPost(broken, { requestIds: broken.ids }), { ok: false, error: "unconfirmed" });
});

test("other actions are unaffected by action=status and its kill switch", () => {
  const runtime = orderedRuntime();
  runtime.properties.ORDER_STATUS_DISABLED = "true";
  assert.deepEqual(cancelPost(runtime, { requestId: CANCEL_ID }), { ok: true });
  assert.equal(orderPost(orderedRuntime(), postedOrder({ requestId: "request-other-12345" })).ok, true);
});

// --- Advance payment by UPI: new "Advance amount" / "Advance status" columns at the END of the Orders sheet ---
const LEGACY_LAYOUT = ["Request ID", "Payload fingerprint", "Received at", "Source kind", "Source ID", "Product name", "Quantity", "Height value", "Height unit", "Height (in)", "Width value", "Width unit", "Width (in)", "Design details", "Customer name", "Phone", "Email", "Fulfilment", "Shipping address", "City", "State", "PIN", "Requested date", "Reference file link", "Status", "Staff notes"];
const PARTNER_COLUMNS = ["Referral code", "Partner ID", "Partner name snapshot", "Final product subtotal", "Payment status", "Delivery status", "Commission rate snapshot", "Commission amount", "Commission status", "Payout batch ID", "Payout date"];
const PARTNER_LAYOUT = LEGACY_LAYOUT.concat(PARTNER_COLUMNS);
const ADVANCE_LAYOUT = PARTNER_LAYOUT.concat(["Advance amount", "Advance status"]);
const VALID_UPI = { UPI_PAYEE_ID: "saloni.art@okhdfcbank", UPI_PAYEE_NAME: "Saloni Resin Art" };

function advanceRuntime(cells, options = {}) {
  // cells: [Status, Advance amount, Advance status] per order, on the 39-column layout.
  const rows = cells.map(([status, amount, advanceStatus], index) => {
    const row = new Array(ADVANCE_LAYOUT.length).fill("");
    row[0] = "request-advance-" + String(index).padStart(4, "0");
    row[14] = "Priya Sharma"; row[15] = "9876543210"; row[16] = "priya@example.com"; row[18] = "Secret Lane 12";
    row[24] = status; row[25] = "Private staff note about the customer";
    row[26] = "FRIENDCODE"; row[29] = 4321; row[33] = 432.1;
    row[37] = amount; row[38] = advanceStatus;
    return row;
  });
  const runtime = makeRuntime(Object.assign({ rows, headers: ADVANCE_LAYOUT, properties: VALID_UPI }, options));
  runtime.ids = rows.map((row) => row[0]);
  return runtime;
}
const advanceOf = (runtime, index = 0) => (statusPost(runtime, { requestIds: runtime.ids }).advance || {})[runtime.ids[index]];

test("ensureSchema_ accepts exactly the legacy, partner and advance layouts and returns their width", () => {
  const sheetWith = (headers) => ({ getLastRow: () => 1, getLastColumn: () => headers.length, getRange: (_r, _c, _n, count) => ({ getValues: () => [headers.slice(0, count)] }) });
  const runtime = makeRuntime();
  assert.equal(runtime.context.ensureSchema_(sheetWith(LEGACY_LAYOUT)), 26);
  assert.equal(runtime.context.ensureSchema_(sheetWith(PARTNER_LAYOUT)), 37);
  assert.equal(runtime.context.ensureSchema_(sheetWith(ADVANCE_LAYOUT)), 39);
  assert.equal(runtime.context.ADVANCE_ORDER_HEADERS.join("|"), "Advance amount|Advance status");
  const bad = [
    PARTNER_LAYOUT.concat(["Advance amount"]),                                 // a single advance column
    PARTNER_LAYOUT.concat(["Advance status", "Advance amount"]),               // swapped
    PARTNER_LAYOUT.concat(["Advance amount", "Advance state"]),                // typo
    ADVANCE_LAYOUT.concat(["Extra"]),                                          // a hand-added column
    LEGACY_LAYOUT.concat(["Advance amount", "Advance status"]),                // advance without partner columns
    ADVANCE_LAYOUT.slice(0, 30),
  ];
  bad.forEach((headers) => assert.throws(() => runtime.context.ensureSchema_(sheetWith(headers)), /schema does not match/, String(headers.length)));
});

test("an order is written on each of the three layouts with the same leading columns", () => {
  for (const [headers, width] of [[LEGACY_LAYOUT, 26], [PARTNER_LAYOUT, 37], [ADVANCE_LAYOUT, 39]]) {
    const runtime = makeRuntime({ headers, properties: ALERT_PROPERTIES });
    assert.equal(orderPost(runtime, postedOrder()).ok, true, "layout " + width);
    assert.equal(runtime.rows.length, 1);
    assert.equal(runtime.rows[0].length, width);
    assert.equal(runtime.rows[0][0], "request-1234567890");
    assert.equal(runtime.rows[0][24], "New request");
    assert.deepEqual(Array.from(runtime.rows[0].slice(26)), new Array(width - 26).fill(""), "partner and advance cells start blank");
    // The same request again finds the saved row (findRequest_) and does not add a second one.
    assert.equal(orderPost(runtime, postedOrder()).ok, true);
    assert.equal(runtime.rows.length, 1);
  }
});

test("a referred order on the advance layout keeps its partner columns and leaves the advance cells blank", () => {
  const runtime = makeRuntime({ headers: ADVANCE_LAYOUT, properties: ALERT_PROPERTIES });
  runtime.context.resolveReferralForOrder_ = () => ({ active: true, status: "active", code: "FRIEND-10", partnerId: "partner-1", displayName: "Friend Studio", rate: 0.1 });
  assert.equal(orderPost(runtime, postedOrder({ referralCode: "FRIEND-10" })).ok, true);
  assert.equal(runtime.rows[0].length, 39);
  assert.equal(runtime.rows[0][26], "FRIEND-10");
  assert.equal(runtime.rows[0][32], 0.1);
  assert.match(runtime.rows[0][33], /^=IF\(/);
  assert.deepEqual(Array.from(runtime.rows[0].slice(37)), ["", ""]);
  const legacy = makeRuntime({ headers: LEGACY_LAYOUT, properties: ALERT_PROPERTIES });
  legacy.context.resolveReferralForOrder_ = runtime.context.resolveReferralForOrder_;
  // The old layout still refuses an attributed order (the error is generic by design), and writes nothing.
  assert.deepEqual(orderPost(legacy, postedOrder({ referralCode: "FRIEND-10" })), { ok: false, error: "unconfirmed" });
  assert.equal(legacy.rows.length, 0);
});

test("cancel on the advance layout changes only Status and Staff notes and keeps the advance cells", () => {
  const runtime = advanceRuntime([["Confirmed", 500, ""]], { properties: Object.assign({}, VALID_UPI, ALERT_PROPERTIES) });
  assert.deepEqual(cancelPost(runtime, { requestId: runtime.ids[0] }), { ok: true });
  assert.equal(runtime.rows[0][37], 500);
  assert.equal(runtime.rows[0][38], "");
  assert.equal(runtime.state.cellWrites.length, 1);
  assert.equal(runtime.state.cellWrites[0].column, 26);
});

test("action=status adds advance only for a confirmed order with a valid amount and a valid payee", () => {
  const runtime = advanceRuntime([["Confirmed", 500, ""]]);
  const reply = statusPost(runtime, { requestIds: runtime.ids });
  assert.deepEqual(reply, {
    ok: true,
    statuses: { [runtime.ids[0]]: "confirmed" },
    advance: { [runtime.ids[0]]: { amount: 500, payee: "saloni.art@okhdfcbank", name: "Saloni Resin Art" } },
  });
  assert.equal(runtime.state.rangeReads.length, 1, "still one block read");
  assert.equal(runtime.state.rangeReads[0].column + runtime.state.rangeReads[0].numColumns - 1, 39, "reads the two advance columns too");
  assert.equal(runtime.state.cellWrites.length, 0);
  assert.ok(!runtime.state.released, "no lock for a read");
});

test("action=status accepts the amount spellings Saloni may type and rejects everything else", () => {
  const good = [[500, 500], ["500", 500], [" 500 ", 500], ["₹500", 500], ["₹ 500", 500], ["Rs 500", 500], ["Rs. 500", 500], ["rs500", 500], ["INR 500", 500], ["500.00", 500], ["500.0", 500], [1, 1], ["200000", 200000], [200000, 200000]];
  const bad = ["", null, 0, "0", "0.00", -5, "-500", "500.5", 500.5, "500.50", "200001", 200001, 1e21, "1e3", "1,500", "five hundred", "500 rupees", "Rs", "₹", "500/-", "5 00", "NaN", "0500", "500.000", "$500", true, "=500", "500; DROP"];
  const runtime = advanceRuntime(good.concat(bad.map((value) => [value, value])).map(([value]) => ["Confirmed", value, ""]));
  const reply = statusPost(runtime, { requestIds: runtime.ids });
  good.forEach(([value, amount], index) => assert.equal(reply.advance[runtime.ids[index]].amount, amount, JSON.stringify(value)));
  bad.forEach((value, index) => assert.equal(reply.advance[runtime.ids[good.length + index]], undefined, JSON.stringify(value)));
  assert.equal(reply.statuses[runtime.ids[good.length]], "confirmed", "a bad amount still reports the status");
});

test("action=status gives advance only while the order reads Confirmed", () => {
  const runtime = advanceRuntime([["", 500, ""], ["New request", 500, ""], ["Accepted", 500, ""], ["In progress", 500, ""], ["Ready", 500, ""], ["Delivered", 500, ""], ["Cancelled", 500, ""], ["Cancellation requested", 500, ""], ["Cancellation declined", 500, ""]]);
  const reply = statusPost(runtime, { requestIds: runtime.ids });
  assert.deepEqual(Object.keys(reply.advance), [runtime.ids[2]]);
});

test("action=status without a valid payee gives no advance, and the payee is checked against the UPI shape", () => {
  for (const properties of [{}, { UPI_PAYEE_NAME: "Saloni" }, { UPI_PAYEE_ID: "saloni@okhdfcbank" }]) {
    const runtime = advanceRuntime([["Confirmed", 500, ""]], { properties });
    const reply = statusPost(runtime, { requestIds: runtime.ids });
    if (properties.UPI_PAYEE_ID) assert.equal(reply.advance[runtime.ids[0]].payee, "saloni@okhdfcbank");
    else assert.deepEqual(reply, { ok: true, statuses: { [runtime.ids[0]]: "confirmed" } });
  }
  for (const payee of ["saloni", "@okhdfcbank", "a@b", "sal oni@okhdfcbank", "saloni@ok hdfcbank", "saloni@1bank", "saloni@bank&am=1", "saloni@bank?x=1", "saloni@@bank", "a@okhdfcbank", "<b>@bank", "saloni@ba\nnk", "upi://pay?pa=x@y", "x".repeat(257) + "@bank", "saloni@" + "b".repeat(66)]) {
    const runtime = advanceRuntime([["Confirmed", 500, ""]], { properties: { UPI_PAYEE_ID: payee, UPI_PAYEE_NAME: "Saloni" } });
    assert.deepEqual(statusPost(runtime, { requestIds: runtime.ids }), { ok: true, statuses: { [runtime.ids[0]]: "confirmed" } }, JSON.stringify(payee));
  }
  for (const payee of ["saloni@okhdfcbank", "a.b-c_d9@ybl", "98765.43210@paytm", "name@sbi.co", "  saloni@upi  ", "saloni@bank\n"]) {
    const runtime = advanceRuntime([["Confirmed", 500, ""]], { properties: { UPI_PAYEE_ID: payee, UPI_PAYEE_NAME: "Saloni" } });
    assert.equal(advanceOf(runtime).payee, payee.trim(), payee);
  }
});

test("action=status shortens a long UPI_PAYEE_NAME and falls back when it is empty", () => {
  const long = advanceRuntime([["Confirmed", 500, ""]], { properties: { UPI_PAYEE_ID: "saloni@upi", UPI_PAYEE_NAME: "  Saloni   Resin\n Art " + "x".repeat(100) } });
  assert.equal(advanceOf(long).name.length <= 60, true);
  assert.equal(advanceOf(long).name.startsWith("Saloni Resin Art x"), true);
  const none = advanceRuntime([["Confirmed", 500, ""]], { properties: { UPI_PAYEE_ID: "saloni@upi" } });
  assert.equal(advanceOf(none).name, "Saloni Resin Art Studio");
});

test("action=status reports advance_paid once the advance is marked Paid or Received, and never offers the button then", () => {
  const cells = [["Confirmed", 500, "Paid"], ["Confirmed", 500, "received"], ["Confirmed", 500, "  PAID  "], ["Confirmed", 500, "Paid - UPI 123"], ["Confirmed", "", "Paid"], ["In progress", 500, "Paid"], ["Confirmed", 500, "Pending"], ["Confirmed", 500, "Not paid"], ["Confirmed", 500, "Partially paid"], ["Confirmed", 500, "Unpaid"]];
  const runtime = advanceRuntime(cells);
  const reply = statusPost(runtime, { requestIds: runtime.ids });
  const expected = ["advance_paid", "advance_paid", "advance_paid", "advance_paid", "advance_paid", "advance_paid", "confirmed", "confirmed", "confirmed", "confirmed"];
  expected.forEach((code, index) => assert.equal(reply.statuses[runtime.ids[index]], code, JSON.stringify(cells[index])));
  assert.deepEqual(Object.keys(reply.advance).sort(), runtime.ids.slice(6).sort(), "only the unpaid rows keep a button");
});

test("action=status keeps later and cancelled statuses as they are even when the advance is paid", () => {
  const runtime = advanceRuntime([["Ready", 500, "Paid"], ["Dispatched", 500, "Paid"], ["Delivered", 500, "Paid"], ["Cancelled", 500, "Paid"], ["Cancellation requested", 500, "Paid"], ["Cancellation declined", 500, "Paid"], ["Declined", 500, "Paid"], ["New request", 500, "Paid"]]);
  const reply = statusPost(runtime, { requestIds: runtime.ids });
  assert.deepEqual(runtime.ids.map((id) => reply.statuses[id]), ["ready", "dispatched", "delivered", "cancelled", "cancel_requested", "cancel_declined", "cancelled", "advance_paid"]);
  assert.equal(reply.advance, undefined);
});

test("action=status never returns other columns, even next to the advance cells", () => {
  const runtime = advanceRuntime([["Confirmed", 500, ""], ["Confirmed", 300, "Paid"]]);
  const text = runtime.context.doPost({ parameter: { action: "status" }, postData: { contents: JSON.stringify({ requestIds: runtime.ids }) } }).text;
  for (const secret of ["Priya", "9876543210", "priya@example.com", "Secret Lane", "Private staff note", "FRIENDCODE", "4321", "432.1", "Paid"]) assert.ok(!text.includes(secret), secret);
  assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ["advance", "ok", "statuses"]);
  assert.deepEqual(Object.keys(JSON.parse(text).advance[runtime.ids[0]]).sort(), ["amount", "name", "payee"]);
});

test("UPI_ADVANCE_DISABLED switches the advance off without touching the status check", () => {
  const runtime = advanceRuntime([["Confirmed", 500, ""], ["Confirmed", 500, "Paid"]], { properties: Object.assign({ UPI_ADVANCE_DISABLED: "true" }, VALID_UPI) });
  assert.deepEqual(statusPost(runtime, { requestIds: runtime.ids }), { ok: true, statuses: { [runtime.ids[0]]: "confirmed", [runtime.ids[1]]: "confirmed" } });
  assert.equal(runtime.state.rangeReads[0].column + runtime.state.rangeReads[0].numColumns - 1, 25, "the advance columns are not even read");
});

test("action=status on the legacy and partner layouts is unchanged and offers no advance", () => {
  for (const headers of [LEGACY_LAYOUT, PARTNER_LAYOUT]) {
    const runtime = statusRuntime(["Confirmed", "Shipped"], { headers, properties: VALID_UPI });
    assert.deepEqual(statusPost(runtime, { requestIds: runtime.ids }), { ok: true, statuses: { [runtime.ids[0]]: "confirmed", [runtime.ids[1]]: "dispatched" } });
    assert.equal(runtime.state.rangeReads[0].column + runtime.state.rangeReads[0].numColumns - 1, 25);
  }
});

test("action=status does not mix up advance cells between orders and ignores ids it did not ask for", () => {
  const runtime = advanceRuntime([["Confirmed", 100, ""], ["Confirmed", 200, ""], ["Confirmed", 300, ""]]);
  const reply = statusPost(runtime, { requestIds: [runtime.ids[2], runtime.ids[0], runtime.ids[2]] });
  assert.deepEqual(Object.keys(reply.advance).sort(), [runtime.ids[0], runtime.ids[2]]);
  assert.equal(reply.advance[runtime.ids[0]].amount, 100);
  assert.equal(reply.advance[runtime.ids[2]].amount, 300);
});
