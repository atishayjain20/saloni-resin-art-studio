const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const source = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8");
const page = fs.readFileSync(path.join(__dirname, "..", "corporate-gifting", "index.html"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const formHtml = fs.readFileSync(path.join(__dirname, "..", "apps-script", "CorporateForm.html"), "utf8");
const browserScript = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

function makeRuntime(options = {}) {
  const headers = (options.headers || ["Enquiry ID", "Received at", "Organisation name", "Contact name", "Phone / WhatsApp", "Email", "Enquiry type", "Occasion", "Approximate quantity", "Budget range", "Required date", "Delivery scope", "Brief", "Privacy accepted", "Status", "Staff notes", "Payload fingerprint"]).slice();
  const rows = (options.rows || []).map((row) => row.slice());
  const properties = Object.assign({ ORDER_SHEET_ID: "sheet", CORPORATE_PROGRAM_CONFIGURED: "true", CAPTCHA_SECRET: "secret", CAPTCHA_MIN_SCORE: "0.5" }, options.properties || {});
  const state = { appendCalls: 0, deletedRows: [], captchaResponse: options.captchaResponse || { success: true, hostname: "saloniresinart.com", action: "corporate_enquiry", score: 0.9 }, lock: options.lockAvailable !== false };
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
    UrlFetchApp: { fetch: () => ({ getContentText: () => JSON.stringify(state.captchaResponse) }) },
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

test("corporate mode and CAPTCHA action are explicitly bounded", () => {
  const runtime = makeRuntime();
  assert.equal(runtime.context.boundedMode_("corporate"), "corporate");
  assert.equal(runtime.context.boundedMode_("unknown"), "order");
  assert.equal(runtime.context.corporateProgramConfig_(runtime.context.PropertiesService.getScriptProperties()).sheetId, "sheet");
  const seed = runtime.context.parseSeed_(JSON.stringify({ enquiryId: "enquiry-seed-123", organisationName: "Acme", deliveryScope: "Ajmer" }));
  assert.equal(seed.enquiryId, "enquiry-seed-123");
  assert.equal(seed.organisationName, undefined);
  assert.equal(seed.deliveryScope, undefined);
  assert.equal(Object.keys(runtime.context.validateCorporateEnquiry_(runtime.context.collectCorporateEnquiry_(validForm()))).length, 0);
  const wrongAction = makeRuntime({ captchaResponse: { success: true, hostname: "saloniresinart.com", action: "order_request", score: 0.9 } });
  assert.match(wrongAction.context.submitCorporateEnquiry(validForm()).errors.captcha, /Captcha/);
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
  assert.match(page, /data-form-mode="corporate"/);
  assert.match(page, /data-intake-ready="true"/);
  assert.match(page, /Corporate gifting enquiries are being prepared/);
  assert.match(page, /8209238541/);
  assert.match(page, /saloniresin_art_studio/);
  assert.doesNotMatch(page, /Your entries stay in the form/);
  assert.match(page, /title="Saloni Resin Art Studio organisation gifting enquiry form"/);
  assert.match(page, /Organisation discounts available on quotation\./);
  assert.match(page, /Bulk and recurring resin-art gifts/);
  assert.match(page, /Partner Circle/);
  assert.match(page, /href="\.\.\/partners\/"/);
  assert.match(formHtml, /name="enquiryId"/);
  assert.match(formHtml, /name="privacyAccepted"/);
  assert.match(formHtml, /Please do not include employee names or lists, birth dates, recipient addresses, payment details/);
  assert.doesNotMatch(formHtml, /type="file"|name="employeeNames"|name="birthDate"|name="paymentDetails"|localStorage|sessionStorage/);
  assert.match(browserScript, /corporate_enquiry/);
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

class CorporateFakeElement {
  constructor(id, name, value = "") {
    this.id = id; this.name = name || id; this.value = value; this.textContent = ""; this.hidden = false;
    this.disabled = false; this.checked = false; this.listeners = {}; this.attributes = {}; this.children = [];
    this.parentNode = null; this.focused = false; this.className = "";
  }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  dispatch(type, event = {}) { if (this.listeners[type]) this.listeners[type](Object.assign({ target: this }, event)); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || ""; }
  removeAttribute(name) { delete this.attributes[name]; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this); }
  focus() { this.focused = true; }
}

class CorporateFakePort {
  constructor() { this.peer = null; this.onmessage = null; this.closed = false; }
  postMessage(data) { if (!this.closed && this.peer && this.peer.onmessage) this.peer.onmessage({ data }); }
  close() { this.closed = true; }
}

class CorporateFakeMessageChannel {
  constructor() { this.port1 = new CorporateFakePort(); this.port2 = new CorporateFakePort(); this.port1.peer = this.port2; this.port2.peer = this.port1; }
}

function makeCorporateFormRuntime() {
  const sourceScript = formHtml.match(/<script>\n([\s\S]*?)\n<\/script>/)[1]
    .replace(/<\?!= captchaEnabledJson \?>/g, "true")
    .replace(/<\?!= captchaSiteKeyJson \?>/g, JSON.stringify("site-key"));
  const ids = ["organisation-name", "contact-name", "phone", "email", "enquiry-type", "occasion", "approximate-quantity", "budget-range", "required-date", "delivery-scope", "brief", "privacy-accepted", "enquiry-id", "captcha-token", "form-status", "submit-button", "another-button", "seed-data"];
  const elements = new Map(ids.map((id) => [id, new CorporateFakeElement(id)]));
  const fields = {
    organisationName: elements.get("organisation-name"), contactName: elements.get("contact-name"), phone: elements.get("phone"), email: elements.get("email"),
    enquiryType: elements.get("enquiry-type"), occasion: elements.get("occasion"), approximateQuantity: elements.get("approximate-quantity"), budgetRange: elements.get("budget-range"),
    requiredDate: elements.get("required-date"), deliveryScope: elements.get("delivery-scope"), brief: elements.get("brief"), privacyAccepted: elements.get("privacy-accepted"),
    enquiryId: elements.get("enquiry-id"), captchaToken: elements.get("captcha-token")
  };
  const form = new CorporateFakeElement("corporate-form");
  elements.set("corporate-form", form);
  form.elements = fields;
  const fieldsets = [new CorporateFakeElement("organisation-fieldset"), new CorporateFakeElement("planning-fieldset"), new CorporateFakeElement("privacy-fieldset")];
  const errors = [];
  form.querySelectorAll = (selector) => {
    if (selector === "[aria-invalid]") return Object.values(fields).filter((field) => field.getAttribute("aria-invalid"));
    if (selector === ".field-error") return errors;
    if (selector === "fieldset, #submit-button, #captcha-token") return fieldsets.concat([elements.get("submit-button"), elements.get("captcha-token")]);
    return [];
  };
  form.reset = () => Object.values(fields).forEach((field) => { field.value = ""; field.checked = false; });
  Object.values(fields).forEach((field) => { field.parentNode = { children: [], appendChild(child) { errors.push(child); } }; });
  elements.get("seed-data").textContent = JSON.stringify({ enquiryId: "enquiry-seed-123", channelNonce: "nonce-seed-123456" });
  const status = elements.get("form-status");
  status.setAttribute("tabindex", "-1");
  const timers = [];
  const submissions = [];
  const callbacks = [];
  const parentMessages = [];
  const run = {
    withSuccessHandler(callback) { this.success = callback; return this; },
    withFailureHandler(callback) { this.failure = callback; return this; },
    submitCorporateEnquiry(value) { submissions.push(JSON.parse(JSON.stringify(value))); callbacks.push({ success: this.success, failure: this.failure }); return this; }
  };
  const windowObject = {
    crypto: { randomUUID: (() => { let count = 0; return () => "corporate-attempt-" + (++count); })() },
    MessageChannel: CorporateFakeMessageChannel,
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {},
    top: { postMessage(message, targetOrigin, ports) { parentMessages.push({ message, targetOrigin, port: ports && ports[0] }); } }
  };
  const documentObject = {
    getElementById(id) { return elements.get(id) || null; },
    createElement(tag) { return new CorporateFakeElement(tag); }
  };
  const context = { console, document: documentObject, window: windowObject, google: { script: { run } } };
  vm.createContext(context);
  vm.runInContext(sourceScript, context, { filename: "CorporateForm.html" });
  return { elements, fields, form, fieldsets, status, timers, submissions, callbacks, parentMessages, windowObject };
}

function fillCorporateForm(runtime) {
  Object.assign(runtime.fields.organisationName, { value: "Acme Private Limited" });
  Object.assign(runtime.fields.contactName, { value: "A Customer" });
  Object.assign(runtime.fields.phone, { value: "8209238541" });
  Object.assign(runtime.fields.email, { value: "contact@example.com" });
  Object.assign(runtime.fields.enquiryType, { value: "one-off" });
  Object.assign(runtime.fields.occasion, { value: "employee birthday" });
  Object.assign(runtime.fields.approximateQuantity, { value: "25" });
  Object.assign(runtime.fields.budgetRange, { value: "INR total to quote" });
  Object.assign(runtime.fields.requiredDate, { value: "2027-02-20" });
  Object.assign(runtime.fields.deliveryScope, { value: "Ajmer and Jaipur offices" });
  Object.assign(runtime.fields.brief, { value: "Resin keepsakes for an employee celebration." });
  runtime.fields.privacyAccepted.checked = true;
}

function respondCorporateCaptcha(runtime, index, overrides = {}) {
  const request = runtime.parentMessages.filter((entry) => entry.message.type === "saloni-order-captcha-request")[index];
  assert.ok(request, "captcha request should exist");
  request.port.postMessage(Object.assign({ type: "saloni-order-captcha-response", nonce: request.message.nonce, attemptId: request.message.attemptId, ok: true, token: "captcha-token" }, overrides));
}

test("corporate form rejects wrong nonce or attempt, ignores stale success, and offers conflict recovery", () => {
  const runtime = makeCorporateFormRuntime();
  fillCorporateForm(runtime);
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondCorporateCaptcha(runtime, 0, { nonce: "wrong-nonce" });
  respondCorporateCaptcha(runtime, 0, { attemptId: "wrong-attempt" });
  assert.equal(runtime.submissions.length, 0);
  respondCorporateCaptcha(runtime, 0);
  assert.equal(runtime.submissions.length, 1);
  const original = runtime.submissions[0];
  runtime.fields.organisationName.value = "Edited while pending";
  runtime.timers[0]();
  assert.match(runtime.status.textContent, /changed while an earlier enquiry/i);
  assert.equal(runtime.status.focused, true);
  assert.equal(runtime.elements.get("another-button").hidden, false);
  const beforeLateSuccess = runtime.status.textContent;
  runtime.callbacks[0].success({ ok: true, enquiryId: original.enquiryId, receivedAt: "late" });
  assert.equal(runtime.status.textContent, beforeLateSuccess);
  assert.equal(runtime.fieldsets.some((fieldset) => fieldset.hidden), false);
  runtime.form.dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.submissions.length, 1, "changed payload must not retry under the old ID");
  runtime.elements.get("another-button").dispatch("click");
  assert.notEqual(runtime.fields.enquiryId.value, original.enquiryId);
  assert.equal(runtime.status.textContent, "");
});

test("corporate uncertain retry reuses the exact original payload and stale callbacks cannot control a retry", () => {
  const runtime = makeCorporateFormRuntime();
  fillCorporateForm(runtime);
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondCorporateCaptcha(runtime, 0);
  const original = runtime.submissions[0];
  runtime.timers[0]();
  assert.match(runtime.status.textContent, /could not confirm/i);
  assert.equal(runtime.status.getAttribute("tabindex"), "-1");
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondCorporateCaptcha(runtime, 1);
  assert.equal(runtime.submissions.length, 2);
  assert.deepEqual(runtime.submissions[1], original);
  runtime.callbacks[0].success({ ok: true, enquiryId: original.enquiryId, receivedAt: "stale" });
  assert.match(runtime.status.textContent, /checking|enquiry received/i);
  runtime.callbacks[1].success({ ok: true, enquiryId: original.enquiryId, receivedAt: "fresh" });
  assert.match(runtime.status.textContent, /Enquiry received/);
});

test("a retry CAPTCHA failure keeps the unresolved payload and blocks later edits under its ID", () => {
  const runtime = makeCorporateFormRuntime();
  fillCorporateForm(runtime);
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondCorporateCaptcha(runtime, 0);
  const original = runtime.submissions[0];
  runtime.timers[0]();
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondCorporateCaptcha(runtime, 1, { ok: false, token: "" });
  assert.equal(runtime.submissions.length, 1, "failed retry CAPTCHA must not call the backend");
  runtime.fields.organisationName.value = "Changed after retry CAPTCHA failure";
  runtime.form.dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.submissions.length, 1, "changed details must not be sent under the unresolved ID");
  assert.equal(runtime.fields.enquiryId.value, original.enquiryId);
  assert.equal(runtime.elements.get("another-button").hidden, false);
  assert.match(runtime.status.textContent, /Start another enquiry/i);
});

test("a retry server CAPTCHA rejection keeps the possible-save payload and blocks a changed third submission", () => {
  const runtime = makeCorporateFormRuntime();
  fillCorporateForm(runtime);
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondCorporateCaptcha(runtime, 0);
  const original = runtime.submissions[0];
  runtime.timers[0]();
  runtime.form.dispatch("submit", { preventDefault() {} });
  respondCorporateCaptcha(runtime, 1);
  runtime.callbacks[1].success({ ok: false, errors: { captcha: "Captcha verification was rejected." } });
  assert.equal(runtime.submissions.length, 2);
  assert.equal(runtime.submissions[1].enquiryId, original.enquiryId);
  runtime.fields.organisationName.value = "Changed after server rejection";
  runtime.form.dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.submissions.length, 2, "changed details must not be sent after an unresolved server response");
  assert.equal(runtime.elements.get("another-button").hidden, false);
  assert.match(runtime.status.textContent, /Start another enquiry/i);
});

test("corporate timeout, CAPTCHA failure, and network failure focus the status region on the first attempt", () => {
  const captchaFailure = makeCorporateFormRuntime();
  fillCorporateForm(captchaFailure);
  captchaFailure.form.dispatch("submit", { preventDefault() {} });
  respondCorporateCaptcha(captchaFailure, 0, { ok: false, token: "" });
  assert.match(captchaFailure.status.textContent, /Captcha verification is required/);
  assert.equal(captchaFailure.status.focused, true);
  const networkFailure = makeCorporateFormRuntime();
  fillCorporateForm(networkFailure);
  networkFailure.form.dispatch("submit", { preventDefault() {} });
  respondCorporateCaptcha(networkFailure, 0);
  networkFailure.callbacks[0].failure(new Error("network"));
  assert.match(networkFailure.status.textContent, /could not confirm/i);
  assert.equal(networkFailure.status.focused, true);
});

test("corporate form script is syntactically valid and protects retries and stale callbacks", () => {
  const formScript = formHtml.match(/<script>\n([\s\S]*?)\n<\/script>/)[1]
    .replace(/<\?!= captchaEnabledJson \?>/g, "true")
    .replace(/<\?!= captchaSiteKeyJson \?>/g, JSON.stringify("site-key"));
  assert.doesNotThrow(() => new vm.Script(formScript));
  assert.match(formScript, /MessageChannel/);
  assert.match(formScript, /setTimeout/);
  assert.match(formScript, /current\(attempt\)/);
  assert.match(formScript, /submitCorporateEnquiry/);
  assert.match(formScript, /aria-invalid/);
  assert.match(formHtml, /id="form-status"[^>]*tabindex="-1"/);
});
