const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const source = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8");
const page = fs.readFileSync(path.join(__dirname, "..", "corporate-gifting", "index.html"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const formMarkup = page.match(/<form id="corporate-form"[\s\S]*?<\/form>/)[0];
const formScript = fs.readFileSync(path.join(__dirname, "..", "public-forms.js"), "utf8");
const browserScript = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

function makeRuntime(options = {}) {
  const headers = (options.headers || ["Enquiry ID", "Received at", "Organisation name", "Contact name", "Phone / WhatsApp", "Email", "Enquiry type", "Occasion", "Approximate quantity", "Budget range", "Required date", "Delivery scope", "Brief", "Privacy accepted", "Status", "Staff notes", "Payload fingerprint"]).slice();
  const rows = (options.rows || []).map((row) => row.slice());
  const properties = Object.assign({ ORDER_SHEET_ID: "sheet", CORPORATE_PROGRAM_CONFIGURED: "true" }, options.properties || {});
  const state = { appendCalls: 0, fetchCalls: 0, deletedRows: [], lock: options.lockAvailable !== false };
  const protections = [];
  const sheet = {
    getLastRow: () => rows.length + 1,
    getLastColumn: () => headers.length,
    getMaxRows: () => 100,
    getProtections: () => protections,
    getRange: () => ({
      getValues: () => [headers],
      setValues: (values) => headers.splice(0, headers.length, ...values[0]),
      protect: () => {
        if (options.protectFailure) throw new Error("protection failed");
        const protection = { warningOnly: true, description: "", getDescription() { return this.description; }, setRange() {}, setWarningOnly(value) { this.warningOnly = value; }, getEditors: () => [], removeEditors() {}, addEditor() {}, canDomainEdit: () => false, setDescription(value) { this.description = value; } };
        protections.push(protection); return protection;
      }
    }),
    getDataRange: () => ({ getValues: () => [headers].concat(rows) }),
    appendRow: (row) => { state.appendCalls += 1; rows.push(row); if (options.appendMode === "persisted-throw") throw new Error("response lost"); if (options.appendMode === "before-throw") throw new Error("append failed"); },
    deleteRow: (rowNumber) => { if (options.deleteRowFailure) throw new Error("delete failed"); state.deletedRows.push(rowNumber); rows.splice(rowNumber - 2, 1); },
  };
  const utilities = {
    getUuid: () => "00000000-0000-4000-8000-000000000000",
    newBlob: (value) => ({ getBytes: () => Array.from(Buffer.from(String(value))) }),
    DigestAlgorithm: { SHA_256: "SHA-256" },
    computeDigest: (_algorithm, bytes) => Array.from(crypto.createHash("sha256").update(Buffer.from(bytes.map((byte) => byte < 0 ? byte + 256 : byte))).digest()).map((byte) => byte > 127 ? byte - 256 : byte),
    formatDate: (date) => new Date(date).toISOString().slice(0, 10),
  };
  const context = { console, Number, String, JSON, Date, RegExp, Math, Object, Array, isFinite, Utilities: utilities,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties[key] || "", setProperty: (key, value) => { properties[key] = value; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => state.lock, releaseLock: () => {} }) },
    SpreadsheetApp: { ProtectionType: { RANGE: "RANGE" }, openById: () => ({ getSheetByName: () => sheet }) },
    Session: { getScriptTimeZone: () => "UTC", getActiveUser: () => ({ getEmail: () => options.activeEmail || "" }), getEffectiveUser: () => ({ getEmail: () => options.effectiveEmail || "" }) },
    UrlFetchApp: { fetch: () => { state.fetchCalls += 1; throw new Error("no reCAPTCHA request is expected"); } },
    ContentService: { MimeType: { JSON: "JSON" }, createTextOutput: (text) => ({ text, setMimeType(type) { this.mimeType = type; return this; } }) },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "Code.gs" });
  return { context, rows, headers, state };
}

function validForm(overrides = {}) {
  return Object.assign({
    enquiryId: "enquiry-1234567890", organisationName: "Acme Private Limited", contactName: "A Customer", phone: "8209238541", email: "",
    enquiryType: "one-off", occasion: "employee birthday", approximateQuantity: "25", budgetRange: "INR total to quote", requiredDate: "2027-02-20",
    deliveryScope: "Ajmer and Jaipur offices", brief: "Resin keepsakes for an employee celebration. Please suggest suitable options.", privacyAccepted: "true", captchaToken: "token",
    ignoredInternalField: "must not be saved"
  }, overrides);
}

test("corporate mode is explicitly bounded", () => {
  const runtime = makeRuntime();
  assert.equal(runtime.context.boundedMode_("corporate"), "corporate");
  assert.equal(runtime.context.boundedMode_("unknown"), "order");
  assert.equal(runtime.context.corporateProgramConfig_(runtime.context.PropertiesService.getScriptProperties()).sheetId, "sheet");
  const seed = runtime.context.parseSeed_(JSON.stringify({ enquiryId: "enquiry-seed-123", organisationName: "Acme", deliveryScope: "Ajmer" }));
  assert.equal(seed.enquiryId, "enquiry-seed-123");
  assert.equal(seed.organisationName, undefined);
  assert.equal(seed.deliveryScope, undefined);
  assert.equal(Object.keys(runtime.context.validateCorporateEnquiry_(runtime.context.collectCorporateEnquiry_(validForm()))).length, 0);
});

test("a corporate enquiry submits without a captcha token and never calls reCAPTCHA", () => {
  const runtime = makeRuntime();
  const form = validForm(); delete form.captchaToken;
  assert.equal(runtime.context.submitCorporateEnquiry(form).ok, true);
  const stale = makeRuntime();
  assert.equal(stale.context.submitCorporateEnquiry(validForm({ captchaToken: "left-over-token" })).ok, true);
  assert.equal(runtime.state.fetchCalls + stale.state.fetchCalls, 0);
  assert.equal(runtime.rows.length, 1);
  assert.equal(stale.rows.length, 1);
});

test("corporate validation enforces allowlists, date, quantity, consent and field limits", () => {
  const runtime = makeRuntime();
  const errors = runtime.context.validateCorporateEnquiry_(runtime.context.collectCorporateEnquiry_(validForm({ enquiryType: "bulk", occasion: "party", approximateQuantity: "0", requiredDate: "2027-02-31", privacyAccepted: "false", brief: "x".repeat(1001) })));
  assert.deepEqual(Object.keys(errors).sort(), ["approximateQuantity", "enquiryType", "occasion", "privacyAccepted", "requiredDate", "brief"].sort());
});

test("accepted corporate enquiries use the fixed schema, ignore unknown fields and return only a receipt", () => {
  const runtime = makeRuntime();
  const result = runtime.context.submitCorporateEnquiry(validForm());
  assert.deepEqual(Object.keys(result).sort(), ["enquiryId", "ok", "receivedAt"].sort());
  assert.equal(runtime.rows[0].length, 17);
  assert.equal(runtime.rows[0][2], "Acme Private Limited");
  assert.doesNotMatch(runtime.rows[0].join("\u001f"), /must not be saved/);
});

test("corporate row neutralizes every untrusted text field before writing", () => {
  const runtime = makeRuntime();
  const result = runtime.context.submitCorporateEnquiry(validForm({
    organisationName: "=Acme Private Limited", contactName: "+A Customer", phone: "-8209238541",
    budgetRange: "@INR total to quote", deliveryScope: "-Ajmer and Jaipur offices", brief: "=Resin keepsakes"
  }));
  assert.equal(result.ok, true);
  const row = runtime.rows[0];
  assert.equal(row[2], "'=Acme Private Limited");
  assert.equal(row[3], "'+A Customer");
  assert.equal(row[4], "'-8209238541");
  assert.equal(row[9], "'@INR total to quote");
  assert.equal(row[11], "'-Ajmer and Jaipur offices");
  assert.equal(row[12], "'=Resin keepsakes");
  const writer = source.slice(source.indexOf("function submitCorporateEnquiry"), source.indexOf("function collectCorporateEnquiry_"));
  ["enquiryId", "organisationName", "contactName", "phone", "email", "enquiryType", "occasion", "budgetRange", "requiredDate", "deliveryScope", "brief"].forEach((field) => {
    assert.match(writer, new RegExp("neutralizeForSheet_\\(payload\\." + field + "\\)"));
  });
});

test("same ID and payload is idempotent, changed payload conflicts, and append uncertainty is reconciled", () => {
  const first = makeRuntime();
  first.context.submitCorporateEnquiry(validForm());
  const matching = makeRuntime({ rows: first.rows });
  assert.equal(matching.context.submitCorporateEnquiry(validForm()).ok, true);
  assert.equal(matching.state.appendCalls, 0);
  const conflict = makeRuntime({ rows: first.rows });
  assert.match(conflict.context.submitCorporateEnquiry(validForm({ brief: "Changed" })).errors.enquiryId, /conflict/i);
  const persisted = makeRuntime({ appendMode: "persisted-throw" });
  assert.equal(persisted.context.submitCorporateEnquiry(validForm()).ok, true);
  const duplicate = makeRuntime({ rows: first.rows.concat(first.rows) });
  assert.throws(() => duplicate.context.submitCorporateEnquiry(validForm()), /Unable to receive/);
});

test("corporate intake has an independent disable and daily cap", () => {
  const disabled = makeRuntime({ properties: { CORPORATE_FORM_DISABLED: "true" } });
  assert.equal(disabled.context.submitCorporateEnquiry(validForm()).ok, false);
  const capped = makeRuntime({ properties: { CORPORATE_DAILY_ACCEPTANCE_CAP: "1" }, rows: [["old-enquiry", new Date(), "", "", "", "", "", "", "", "", "", "", "", true, "", "", "fingerprint"]] });
  assert.match(capped.context.submitCorporateEnquiry(validForm()).errors.form, /daily|limit/i);
});

test("corporate retention removes only rows at the 90-day boundary and is harmless before setup", () => {
  const now = new Date("2027-01-01T00:00:00.000Z");
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const runtime = makeRuntime({ rows: [
    ["enquiry-expired", cutoff, "", "", "", "", "", "", "", "", "", "", "", true, "", "", "fingerprint"],
    ["enquiry-new", new Date(cutoff.getTime() + 1), "", "", "", "", "", "", "", "", "", "", "", true, "", "", "fingerprint"]
  ] });
  assert.equal(runtime.context.purgeCorporateRecords_(now, runtime.context.PropertiesService.getScriptProperties()).deletedRows, 1);
  assert.equal(runtime.rows[0][0], "enquiry-new");
  const missing = makeRuntime({ properties: { ORDER_SHEET_ID: "" } });
  assert.equal(missing.context.purgeCorporateRecords_(now, missing.context.PropertiesService.getScriptProperties()).deletedRows, 0);
  const paused = makeRuntime({ properties: { CORPORATE_FORM_DISABLED: "true" }, rows: [["enquiry-paused", cutoff, "", "", "", "", "", "", "", "", "", "", "", true, "", "", "fingerprint"]] });
  assert.equal(paused.context.purgeCorporateRecords_(now, paused.context.PropertiesService.getScriptProperties()).deletedRows, 1);
  const failed = makeRuntime({ deleteRowFailure: true, rows: [["enquiry-failed", cutoff, "", "", "", "", "", "", "", "", "", "", "", true, "", "", "fingerprint"]] });
  assert.throws(() => failed.context.purgeCorporateRecords_(now, failed.context.PropertiesService.getScriptProperties()), /cleanup failed/i);
  assert.equal(failed.rows.length, 1);
});

test("corporate setup is owner-gated and keeps readiness separate from intake", () => {
  const runtime = makeRuntime();
  assert.throws(() => runtime.context.setupCorporateGifting(), /deployment owner/);
  assert.equal(runtime.context.CORPORATE_PROGRAM_READY_PROPERTY, "CORPORATE_PROGRAM_CONFIGURED");
  const owner = makeRuntime({ activeEmail: "owner@example.com", effectiveEmail: "owner@example.com", properties: { CORPORATE_PROGRAM_CONFIGURED: "" } });
  assert.deepEqual(JSON.parse(JSON.stringify(owner.context.setupCorporateGifting())), { tab: "Corporate Enquiries", columns: 17 });
  assert.equal(owner.context.corporateProgramConfigured_(owner.context.PropertiesService.getScriptProperties()), true);
  const schemaFailure = makeRuntime({ activeEmail: "owner@example.com", effectiveEmail: "owner@example.com", headers: ["wrong schema"], properties: { CORPORATE_PROGRAM_CONFIGURED: "" } });
  assert.throws(() => schemaFailure.context.setupCorporateGifting(), /schema/i);
  assert.equal(schemaFailure.context.PropertiesService.getScriptProperties().getProperty("CORPORATE_PROGRAM_CONFIGURED"), "");
  const protectionFailure = makeRuntime({ activeEmail: "owner@example.com", effectiveEmail: "owner@example.com", protectFailure: true, properties: { CORPORATE_PROGRAM_CONFIGURED: "" } });
  assert.throws(() => protectionFailure.context.setupCorporateGifting(), /protect/i);
  assert.equal(protectionFailure.context.PropertiesService.getScriptProperties().getProperty("CORPORATE_PROGRAM_CONFIGURED"), "");
});

test("corporate page has concise accessible SEO, navigation, wording and excluded-field boundaries", () => {
  assert.match(page, /<link rel="canonical" href="https:\/\/saloniresinart\.com\/corporate-gifting\/">/);
  assert.match(page, /<title>Corporate Gifting &amp; Organisation Partnerships/);
  assert.match(page, /property="og:url" content="https:\/\/saloniresinart\.com\/corporate-gifting\/"/);
  assert.match(page, /<form id="corporate-form"/);
  assert.doesNotMatch(page, /<iframe|data-form-mode|data-intake-ready|Corporate gifting enquiries are being prepared/);
  assert.match(page, /8209238541/);
  assert.match(page, /saloniresin_art_studio/);
  assert.doesNotMatch(page, /Your entries stay in the form/);
  assert.match(page, /Organisation discounts available on quotation\./);
  assert.match(page, /Bulk and recurring resin-art gifts/);
  assert.match(page, /Partner Circle/);
  assert.match(page, /href="\.\.\/partners\/"/);
  assert.match(formMarkup, /name="enquiryId"/);
  assert.match(formMarkup, /name="privacyAccepted"/);
  assert.match(formMarkup, /Please do not include employee names or lists, birth dates, recipient addresses, payment details/);
  assert.doesNotMatch(formMarkup, /type="file"|name="employeeNames"|name="birthDate"|name="paymentDetails"/);
  // The review form (later in the same script) reads the saved first name; the corporate form and the shared kit use no browser storage.
  const corporateScript = formScript.slice(0, formScript.indexOf("function initReview")) ;
  assert.doesNotMatch(formMarkup + corporateScript, /localStorage|sessionStorage/);
  assert.match(formScript, /corporate_enquiry/);
});

test("corporate page names resin-art gifts and keeps a compact studio photo strip", () => {
  assert.match(page, /resin-art gifts/i);
  assert.doesNotMatch(page, /hamper/i);
  assert.match(page, /class="corporate-gift-strip"/);
  assert.match(page, /aria-label="Resin-art gift examples"/);
  for (const asset of [
    "studio-floral-handled-tray.jpeg",
    "studio-rose-hexagon-keepsake.jpeg",
    "studio-lilac-scalloped-tray.jpeg"
  ]) {
    assert.match(page, new RegExp(`src="\\.\\./assets/${asset}"`));
    assert.equal(fs.existsSync(path.join(__dirname, "..", "assets", asset)), true, `${asset} must remain a local studio asset`);
  }
  assert.match(page, /alt="Pressed-flower resin tray with a gold handle"/);
  assert.match(page, /alt="Pressed-flower resin hexagon keepsake"/);
  assert.match(page, /alt="Lilac resin trinket tray with gold details"/);
  assert.match(page, /corporate-gift-strip/);
  assert.doesNotMatch(page, /<section[^>]+corporate-gift-strip/);
  assert.match(styles, /\.corporate-gift-strip \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(3/);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.corporate-gift-strip \{/);
});

// --- JSON corporate endpoint used by the enquiry form built into the site ---
function corporatePost(runtime, body, action = "corporate") {
  const output = runtime.context.doPost({ parameter: { action }, postData: { type: "text/plain", contents: typeof body === "string" ? body : JSON.stringify(body) } });
  assert.equal(output.mimeType, "JSON");
  return JSON.parse(output.text);
}

test("action=corporate saves one enquiry for a valid JSON body and replays safely", () => {
  const runtime = makeRuntime();
  const result = corporatePost(runtime, validForm());
  assert.deepEqual(Object.keys(result).sort(), ["enquiryId", "ok", "receivedAt"].sort());
  assert.equal(result.enquiryId, "enquiry-1234567890");
  assert.equal(runtime.rows.length, 1);
  assert.equal(corporatePost(runtime, validForm()).ok, true);
  assert.equal(runtime.rows.length, 1);
  assert.equal(runtime.state.appendCalls, 1);
  assert.match(corporatePost(runtime, validForm({ brief: "A different brief that is long enough to be valid." })).errors.enquiryId, /conflict/i);
});

test("action=corporate submits without a captcha token, ignores a left-over one and never calls reCAPTCHA", () => {
  const missing = makeRuntime();
  const body = validForm(); delete body.captchaToken;
  assert.equal(corporatePost(missing, body).ok, true);
  const stale = makeRuntime();
  assert.equal(corporatePost(stale, validForm({ captchaToken: "left-over-token" })).ok, true);
  [missing, stale].forEach((runtime) => { assert.equal(runtime.state.appendCalls, 1); assert.equal(runtime.state.fetchCalls, 0); });
  assert.equal(JSON.stringify(stale.rows[0]).includes("left-over-token"), false);
});

test("action=corporate keeps validation, the kill switch and drops unknown fields", () => {
  const invalid = makeRuntime();
  assert.ok(corporatePost(invalid, validForm({ phone: "1" })).errors.phone);
  const paused = makeRuntime({ properties: { CORPORATE_FORM_DISABLED: "true" } });
  assert.match(corporatePost(paused, validForm()).errors.form, /paused/i);
  const extra = makeRuntime();
  assert.equal(corporatePost(extra, validForm({ injected: "<b>unexpected</b>" })).ok, true);
  assert.doesNotMatch(extra.rows[0].join("\u001f"), /must not be saved|unexpected/);
  [invalid, paused].forEach((runtime) => assert.equal(runtime.state.appendCalls, 0));
});

test("action=corporate answers invalid for broken JSON and unconfirmed when the save throws", () => {
  const runtime = makeRuntime();
  for (const body of ["{not json", "[]", "null", ""]) assert.deepEqual(corporatePost(runtime, body), { ok: false, error: "invalid" });
  assert.equal(runtime.state.appendCalls, 0);
  assert.deepEqual(corporatePost(makeRuntime({ lockAvailable: false }), validForm()), { ok: false, error: "unconfirmed" });
  assert.deepEqual(corporatePost(makeRuntime({ properties: { CORPORATE_PROGRAM_CONFIGURED: "" } }), validForm()), { ok: false, error: "unconfirmed" });
});

test("action=seed still renders the corporate form for pages cached before the change", () => {
  const runtime = makeRuntime();
  let templateName = "";
  const rendered = { setTitle() { return this; }, setXFrameOptionsMode() { return this; } };
  runtime.context.HtmlService = { createTemplateFromFile: (name) => { templateName = name; return { evaluate: () => rendered }; }, XFrameOptionsMode: { ALLOWALL: "ALLOWALL" } };
  runtime.context.doPost({ parameter: { action: "seed", mode: "corporate", seed: JSON.stringify({ enquiryId: "enquiry-cached-page" }) } });
  assert.equal(templateName, "CorporateForm");
});
