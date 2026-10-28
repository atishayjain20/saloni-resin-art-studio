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
  assert.match(legacyResult.errors.shippingAddress, /required/i);

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

test("requires exact CAPTCHA hostname, action, and finite score", () => {
  const valid = makeRuntime({
    properties: { CAPTCHA_MIN_SCORE: "0.7" },
    captchaResponse: { success: true, hostname: "saloniresinart.com", action: "order_request", score: 0.8 }
  });
  assert.equal(valid.context.submitOrder(validForm()).ok, true);
  for (const captchaResponse of [
    { success: true, hostname: "saloniresinart.com", score: 0.8 },
    { success: true, hostname: "saloniresinart.com", action: "other", score: 0.8 },
    { success: true, hostname: "saloniresinart.com", action: "order_request" },
    { success: true, hostname: "saloniresinart.com", action: "order_request", score: Infinity },
  ]) {
    const runtime = makeRuntime({ properties: { CAPTCHA_MIN_SCORE: "0.7" }, captchaResponse });
    assert.match(runtime.context.submitOrder(validForm()).errors.captcha, /Captcha/);
    assert.equal(runtime.state.appendCalls, 0);
  }
});

test("fails closed for blank thresholds and non-numeric or out-of-range CAPTCHA scores before writes", () => {
  for (const properties of [{ CAPTCHA_MIN_SCORE: "" }, { CAPTCHA_MIN_SCORE: "not-a-number" }, { CAPTCHA_MIN_SCORE: "1.1" }]) {
    const runtime = makeRuntime({ properties, captchaResponse: { success: true, hostname: "saloniresinart.com", action: "order_request", score: 0.9 } });
    const result = runtime.context.submitOrder(validForm({ referenceImage: imageBlob() }));
    assert.match(result.errors.captcha, /Captcha/);
    assert.equal(runtime.state.fileCreates, 0);
    assert.equal(runtime.state.appendCalls, 0);
  }
  for (const score of [null, "0.9", true, false, 1.1, -0.1]) {
    const runtime = makeRuntime({ captchaResponse: { success: true, hostname: "saloniresinart.com", action: "order_request", score } });
    const result = runtime.context.submitOrder(validForm({ referenceImage: imageBlob() }));
    assert.match(result.errors.captcha, /Captcha/);
    assert.equal(runtime.state.fileCreates, 0);
    assert.equal(runtime.state.appendCalls, 0);
  }
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
  const headers = [
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
    logs: [],
  };
  const sheet = {
    getLastColumn: () => headers.length,
    getLastRow: () => rows.length + 1,
    getRange: () => ({
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
  const lock = { tryLock: () => options.lockAvailable !== false, releaseLock: () => { state.released = true; } };
  const utilities = {
    getUuid: () => "00000000-0000-4000-8000-000000000000",
    newBlob: (value) => ({ getBytes: () => Array.from(Buffer.from(String(value))) }),
    DigestAlgorithm: { SHA_256: "SHA-256" },
    computeDigest: (_algorithm, bytes) => Array.from(crypto.createHash("sha256").update(Buffer.from(bytes.map((byte) => byte < 0 ? byte + 256 : byte))).digest()).map((byte) => byte > 127 ? byte - 256 : byte),
    formatDate: (date) => new Date(date).toISOString().slice(0, 10),
  };
  const runtimeContext = {
    console: { log: (...values) => state.logs.push(values.join(" ")), error: (...values) => state.logs.push(values.join(" ")) },
    Number, String, JSON, Date, RegExp, Math, isFinite, Object, Array,
    Utilities: utilities,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties[key] || "" }) },
    LockService: { getScriptLock: () => lock },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
    DriveApp: { getFolderById: () => folder, Access: { PRIVATE: "PRIVATE" } },
    Drive: { Files: { remove: (id) => {
      state.driveDeletes.push(id);
      if (options.driveDeleteThrows) throw new Error("file delete failed");
      const index = folderFiles.findIndex((file) => file.id === id);
      if (index >= 0) folderFiles.splice(index, 1);
    } } },
    ScriptApp: {
      getProjectTriggers: () => options.triggers || [],
      newTrigger: (handler) => {
        const builder = {
          timeBased() { return builder; },
          everyDays(days) { state.triggerConfig = Object.assign(state.triggerConfig || {}, { handler, everyDays: days }); return builder; },
          atHour(hour) { state.triggerConfig = Object.assign(state.triggerConfig || {}, { atHour: hour }); return builder; },
          create() { state.triggerCreates += 1; (options.triggers || (options.triggers = [])).push({ getHandlerFunction: () => handler }); return options.triggers.at(-1); },
        };
        return builder;
      },
    },
    UrlFetchApp: { fetch: () => {
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
  return { context: runtimeContext, state, rows, headers };
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

test("rejects disabled intake, wrong-host CAPTCHA, daily cap, and lock contention before writes", () => {
  const disabled = makeRuntime({ properties: { ORDER_FORM_DISABLED: "true" } });
  assert.equal(disabled.context.submitOrder(validForm()).ok, false);
  assert.equal(disabled.state.appendCalls, 0);
  const invalidCaptcha = makeRuntime({ captchaResponse: { success: false, hostname: "saloniresinart.com" } });
  assert.match(invalidCaptcha.context.submitOrder(validForm()).errors.captcha, /Captcha/);
  assert.equal(invalidCaptcha.state.appendCalls, 0);
  const wrongHost = makeRuntime({ captchaResponse: { success: true, hostname: "wrong.example", score: 0.9 } });
  assert.match(wrongHost.context.submitOrder(validForm()).errors.captcha, /Captcha/);
  assert.equal(wrongHost.state.appendCalls, 0);
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
