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

function validForm(overrides = {}) {
  return Object.assign({
    requestId: "request-1234567890", sourceKind: "catalogue", sourceId: "catalogue:test.png",
    productName: "Test frame", quantity: "1", height: "3", heightUnit: "ft", width: "4", widthUnit: "ft",
    designDetails: "Blue and gold", customerName: "A Customer", phone: "8209238541", email: "",
    fulfillment: "pickup", shippingAddress: "", city: "", state: "", pin: "", requestedDate: "",
    captchaToken: "token", referenceImage: null,
  }, overrides);
}

function makeRuntime(options = {}) {
  const headers = [
    "Request ID", "Payload fingerprint", "Received at", "Source kind", "Source ID", "Product name", "Quantity",
    "Height value", "Height unit", "Height (in)", "Width value", "Width unit", "Width (in)", "Design details",
    "Customer name", "Phone", "Email", "Fulfilment",
    "Shipping address", "City", "State", "PIN", "Requested date", "Reference file link", "Status", "Staff notes",
  ];
  const rows = (options.rows || []).map((row) => row.slice());
  const state = {
    appendCalls: 0, fileCreates: 0, trashed: 0, dataReads: 0,
    appendMode: options.appendMode || "success",
    failRecheck: Boolean(options.failRecheck),
    folderAccess: options.folderAccess || "PRIVATE",
    captchaResponse: options.captchaResponse || { success: true, hostname: "expected.example", score: 0.9 },
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
  };
  const folder = {
    getSharingAccess: () => state.folderAccess,
    createFile: (blob) => {
      state.fileCreates += 1;
      return {
        getUrl: () => "https://drive.google.test/file",
        setTrashed: () => { state.trashed += 1; if (options.cleanupThrows) throw new Error("cleanup failed"); },
      };
    },
  };
  const properties = Object.assign({
    ORDER_SHEET_ID: "sheet", ORDER_SHEET_TAB: "Orders", ORDER_DRIVE_FOLDER_ID: "folder",
    CAPTCHA_SECRET: "secret", CAPTCHA_EXPECTED_HOSTNAME: "expected.example",
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
    console, Number, String, JSON, Date, RegExp, Math, isFinite, Object, Array,
    Utilities: utilities,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties[key] || "" }) },
    LockService: { getScriptLock: () => lock },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
    DriveApp: { getFolderById: () => folder, Access: { PRIVATE: "PRIVATE" } },
    UrlFetchApp: { fetch: () => ({ getContentText: () => JSON.stringify(state.captchaResponse) }) },
    Session: { getScriptTimeZone: () => "UTC" },
  };
  vm.createContext(runtimeContext);
  vm.runInContext(source, runtimeContext, { filename: "Code.gs" });
  return { context: runtimeContext, state, rows, headers };
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
  const invalidCaptcha = makeRuntime({ captchaResponse: { success: false, hostname: "expected.example" } });
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
  assert.equal(runtime.rows[0][7], "3");
  assert.equal(runtime.rows[0][8], "ft");
  assert.equal(runtime.rows[0][9], 36);
  assert.equal(runtime.rows[0][10], "4");
  assert.equal(runtime.rows[0][11], "ft");
  assert.equal(runtime.rows[0][12], 48);
});
