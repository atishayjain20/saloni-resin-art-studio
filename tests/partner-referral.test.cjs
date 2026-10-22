const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const code = fs.readFileSync(path.join(root, "apps-script", "Code.gs"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");

test("publishes the partner page and keeps referral links in the browser session", () => {
  const page = fs.readFileSync(path.join(root, "partners", "index.html"), "utf8");
  assert.match(page, /Saloni Resin Art Partner Circle/);
  assert.match(page, /data-form-mode="partner"/);
  assert.match(script, /saloniReferralCode/);
  assert.match(script, /saloniReferral/);
});

test("exposes only bounded referral validation and application submission", () => {
  const context = { console, Number, String, JSON, Date, RegExp, Math, isFinite, Object, Array };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "Code.gs" });
  assert.equal(typeof context.validateReferralCode, "function");
  assert.equal(typeof context.submitPartnerApplication, "function");
  assert.match(code, /PARTNER_APPLICATION_CAPTCHA_ACTION/);
  assert.match(code, /Partner Commissions/);
  assert.match(code, /Commission rate snapshot/);
  assert.match(code, /function approvePartner_\(/);
  assert.match(code, /function pausePartner_\(/);
  assert.match(code, /function correctOrderAttribution_\(/);
  const submitOrderSource = code.slice(code.indexOf("function submitOrder("), code.indexOf("function submitPartnerApplication("));
  assert.doesNotMatch(submitOrderSource, /migrateOrdersSchema_\(/);
  assert.match(code, /partnerTransferVerified_/);
});

test("adds the editable referral field to the order form", () => {
  const form = fs.readFileSync(path.join(root, "apps-script", "Form.html"), "utf8");
  assert.match(form, /name="referralCode"/);
  assert.match(form, /validateReferralCode/);
  assert.match(form, /aria-live/);
});

test("returns only public active-code fields and rejects duplicate configuration", () => {
  const partnerHeaders = ["Partner ID", "Referral code", "Partner display name", "Contact name", "Category", "City / service area", "Phone / WhatsApp", "Email", "Instagram / website", "Commission rate", "Status", "Approved at", "Referral link", "Staff notes", "Closed at"];
  const rows = [partnerHeaders, ["partner-1", "AJMERPHOTO01", "Ajmer Photo Studio", "", "Photographer", "Ajmer", "", "", "", 0.05, "Active", new Date(), "https://saloniresinart.com/?ref=AJMERPHOTO01", "", ""]];
  const properties = { PARTNER_SHEET_ID: "private-sheet" };
  const sheet = { getLastRow: () => rows.length, getDataRange: () => ({ getValues: () => rows }), getRange: () => ({ getValues: () => [partnerHeaders] }) };
  const context = {
    console, Number, String, JSON, Date, RegExp, Math, isFinite, Object, Array,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties[key] || "" }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "Code.gs" });
  assert.deepEqual(JSON.parse(JSON.stringify(context.validateReferralCode(" ajmerphoto01 "))), { status: "active", code: "AJMERPHOTO01", displayName: "Ajmer Photo Studio" });
  assert.deepEqual(JSON.parse(JSON.stringify(context.validateReferralCode("unknown01"))), { status: "invalid", code: "UNKNOWN01" });
  rows.push(["partner-2", "AJMERPHOTO01", "Duplicate", "", "Photographer", "Ajmer", "", "", "", 0.05, "Active", new Date(), "", "", ""]);
  assert.deepEqual(JSON.parse(JSON.stringify(context.validateReferralCode("AJMERPHOTO01"))), { status: "error", code: "AJMERPHOTO01" });
});

test("appends an immutable rate snapshot and formula to a referred order row", () => {
  const context = { console, Number, String, JSON, Date, RegExp, Math, isFinite, Object, Array };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "Code.gs" });
  const payload = {
    requestId: "request-1234567890", sourceKind: "catalogue", sourceId: "catalogue:test.png", productName: "Test frame",
    quantity: "1", dimensionFormat: "feet-inches", heightFeet: "3", heightInchesPart: "0", widthFeet: "4", widthInchesPart: "0",
    designDetails: "Blue and gold", customerName: "A Customer", phone: "8209238541", email: "", fulfillment: "pickup",
    shippingAddress: "", city: "", state: "", pin: "", requestedDate: "", referralCode: "AJMERPHOTO01"
  };
  const row = context.rowForPayload_(payload, "fingerprint", new Date("2026-10-22T00:00:00.000Z"), null, {
    active: true, code: "AJMERPHOTO01", partnerId: "partner-1", displayName: "Ajmer Photo Studio", rate: 0.05
  }, 4);
  assert.equal(row.length, 37);
  assert.equal(row[26], "AJMERPHOTO01");
  assert.equal(row[27], "partner-1");
  assert.equal(row[32], 0.05);
  assert.match(row[33], /^=IF\(/);
  assert.equal(context.neutralizeForSheet_("  =SUM(A1:A2)")[0], "'");
});

test("keeps only the normalized code for the current session when storage is unavailable", () => {
  const links = [{ href: "../#order", getAttribute() { return this.href; }, setAttribute(_name, value) { this.href = value; } }];
  const ready = [];
  const documentObject = {
    documentElement: { classList: { add() {} } },
    addEventListener(_type, listener) { ready.push(listener); },
    querySelectorAll(selector) { return selector === "a[href]" ? links : []; },
    querySelector() { return null; },
    getElementById() { return null; },
  };
  const windowObject = {
    location: { search: "?ref= ajmerphoto01 ", href: "https://saloniresinart.com/", origin: "https://saloniresinart.com" },
    get sessionStorage() { throw new Error("storage denied"); },
    addEventListener() {},
  };
  const context = { console, document: documentObject, window: windowObject, URL, URLSearchParams, IntersectionObserver: undefined };
  vm.createContext(context);
  vm.runInContext(script, context, { filename: "script.js" });
  ready[0]();
  assert.equal(context.window.saloniReferral.read(), "AJMERPHOTO01");
  assert.match(links[0].href, /ref=AJMERPHOTO01/);
});

test("preserves paid and void commission history and rejects a conflicting ledger row", () => {
  const order = referredOrderRow({ commissionStatus: "Paid", commissionAmount: 50, payoutBatch: "batch-7", payoutDate: new Date("2026-10-21") });
  const paid = partnerRuntime();
  assert.deepEqual(paid.context.ensureCommissionRecord_(order, "request-123456", paid.properties, new Date("2026-10-22"))[8], "Paid");
  assert.equal(paid.commissionRows[0][7], 50);
  assert.equal(paid.commissionRows[0][9], "batch-7");
  const voided = partnerRuntime();
  const voidOrder = referredOrderRow({ commissionStatus: "Void", payment: "Paid", delivery: "Delivered", commissionAmount: 0 });
  assert.equal(voided.context.ensureCommissionRecord_(voidOrder, "request-123456", voided.properties, new Date("2026-10-22"))[8], "Void");
  const ledgerOrder = referredOrderRow({ commissionStatus: "Pending" }); ledgerOrder[28] = "=1+1";
  const ledgerText = partnerRuntime({ orderRows: [ledgerOrder], commissionRows: [["commission-request-123456", "partner-1", "=1+1", "2026-10", "catalogue", 1000, 0.05, "", "Pending", "", "", "", ""]] });
  assert.equal(ledgerText.context.ensureCommissionRecord_(ledgerText.orderSheet.rows[0], "request-123456", ledgerText.properties, new Date("2026-10-22"))[8], "Eligible");
  assert.equal(ledgerText.commissionRows[0][2], "'=1+1");
  const preserved = partnerRuntime({ orderRows: [referredOrderRow({ commissionStatus: "Approved", commissionAmount: 50, payoutBatch: "batch-7", payoutDate: new Date("2026-10-21") })], commissionRows: [["commission-request-123456", "partner-1", "Studio", "2026-10", "catalogue", 1000, 0.05, 50, "Paid", "batch-7", new Date("2026-10-21"), "", ""]] });
  assert.equal(preserved.context.ensureCommissionRecord_(preserved.orderSheet.rows[0], "request-123456", preserved.properties, new Date("2026-10-22"))[8], "Paid");
  const conflict = partnerRuntime({ commissionRows: [["commission-request-123456", "wrong-partner", "Studio", "2026-10", "catalogue", 1000, 0.05, 50, "Pending", "", "", "", ""]] });
  assert.throws(() => conflict.context.ensureCommissionRecord_(order, "request-123456", conflict.properties, new Date("2026-10-22")), /conflict|mismatch/i);
});

test("retention keeps the source order when a commission conflict cannot be reconciled", () => {
  const runtime = partnerRuntime({ setup: true, migrated: true, orderRows: [referredOrderRow()], commissionRows: [["commission-request-123456", "wrong-partner", "Studio", "2026-10", "catalogue", 1000, 0.05, 50, "Pending", "", "", "", ""]] });
  runtime.context.setupPartnerProgram();
  assert.throws(() => runtime.context.purgeExpiredOrdersAt_(new Date("2027-01-01")), /Retention cleanup failed/);
  assert.equal(runtime.orderSheet.rows.length, 1);
});

test("applications, setup, and protection use the configured default contract", () => {
  const runtime = partnerRuntime({ setup: true });
  const application = applicationForm();
  assert.equal(runtime.context.submitPartnerApplication(application).ok, true);
  assert.equal(runtime.applicationRows.length, 1);
  const wrongAction = partnerRuntime({ captchaResponse: { success: true, hostname: "saloniresinart.com", action: "order_request", score: 0.9 } });
  assert.match(wrongAction.context.submitPartnerApplication(application).errors.captcha, /Captcha/);
  assert.equal(wrongAction.applicationRows.length, 0);
  assert.equal(runtime.context.setupPartnerProgram().orderColumns, 37);
  assert.equal(runtime.properties.values.PARTNER_PROGRAM_CONFIGURED, "true");
  assert.equal(runtime.context.partnerProgramConfigured_(runtime.properties), true);
  assert.equal(runtime.protections.length >= 4, true);
  assert.equal(runtime.protections.every((protection) => protection.warningOnly === false), true);
  assert.equal(runtime.protections.some((protection) => protection.numRows === runtime.orderSheet.maxRows), true);
  const custom = partnerRuntime({ properties: { PARTNER_APPLICATIONS_SHEET_TAB: "Applications", PARTNERS_SHEET_TAB: "Partner Directory", PARTNER_COMMISSIONS_SHEET_TAB: "Commission Ledger" }, customTabNames: true });
  assert.deepEqual(JSON.parse(JSON.stringify(custom.context.setupPartnerProgram().tabs)), ["Applications", "Partner Directory", "Commission Ledger"]);
});

test("order migration expands sheet capacity without changing legacy rows", () => {
  const legacyRows = [
    ["request-legacy-1", "fingerprint-1", new Date("2026-10-01"), "catalogue", "source-1", "Frame", 1, 12, "in", 12, 18, "in", 18, "details-1", "Asha", "8209238541", "asha@example.com", "Ship", "Ajmer", "Ajmer", "Rajasthan", "305001", "2026-11-01", "", "New", "note-1"],
    ["request-legacy-2", "fingerprint-2", new Date("2026-10-02"), "custom", "source-2", "Plaque", 2, 8, "in", 8, 10, "in", 10, "details-2", "Nina", "8209238542", "nina@example.com", "Pickup", "Jaipur", "Jaipur", "Rajasthan", "302001", "2026-11-02", "", "Confirmed", "note-2"]
  ];
  const runtime = partnerRuntime({ orderRows: legacyRows, orderMaxColumns: 26 });
  const beforeRows = runtime.orderSheet.rows.map((row) => row.slice());
  const migration = runtime.context.setupPartnerProgram();
  assert.equal(migration.orderColumns, 37);
  assert.equal(runtime.orderSheet.maxColumns, 37);
  assert.deepEqual(runtime.orderSheet.insertions, [{ after: 26, count: 11 }]);
  assert.equal(runtime.orderSheet.headers.length, 37);
  assert.deepEqual(runtime.orderSheet.headers, Array.from(runtime.context.ORDER_HEADERS));
  assert.deepEqual(runtime.orderSheet.rows, beforeRows);
  assert.equal(runtime.properties.values.PARTNER_PROGRAM_CONFIGURED, "true");

  runtime.context.setupPartnerProgram();
  assert.deepEqual(runtime.orderSheet.insertions, [{ after: 26, count: 11 }]);
  assert.deepEqual(runtime.orderSheet.rows, beforeRows);
});

test("order migration uses spare capacity and skips insertion when capacity is sufficient", () => {
  const spare = partnerRuntime({ orderMaxColumns: 30 });
  spare.context.setupPartnerProgram();
  assert.equal(spare.orderSheet.maxColumns, 37);
  assert.deepEqual(spare.orderSheet.insertions, [{ after: 30, count: 7 }]);

  const enough = partnerRuntime({ orderMaxColumns: 40 });
  enough.context.setupPartnerProgram();
  assert.equal(enough.orderSheet.maxColumns, 40);
  assert.deepEqual(enough.orderSheet.insertions, []);
  assert.deepEqual(enough.orderSheet.headers, Array.from(enough.context.ORDER_HEADERS));
});

test("order migration rejects invalid headers before insertion and leaves readiness unset on insertion failure", () => {
  const invalidHeaders = ["Wrong Request ID"].concat(partnerRuntime().context.ORDER_HEADERS.slice(1, 26));
  const invalid = partnerRuntime({ orderHeaders: invalidHeaders, orderMaxColumns: 26 });
  assert.throws(() => invalid.context.setupPartnerProgram(), /schema/i);
  assert.deepEqual(invalid.orderSheet.insertions, []);
  assert.deepEqual(invalid.orderSheet.headers, invalidHeaders);
  assert.equal(invalid.properties.values.PARTNER_PROGRAM_CONFIGURED || "", "");

  const legacyRows = [["request-legacy-1", "fingerprint-1", new Date("2026-10-01"), "catalogue", "source-1", "Frame", 1, 12, "in", 12, 18, "in", 18, "details-1", "Asha", "8209238541", "asha@example.com", "Ship", "Ajmer", "Ajmer", "Rajasthan", "305001", "2026-11-01", "", "New", "note-1"]];
  const failed = partnerRuntime({ orderRows: legacyRows, orderMaxColumns: 26, failOrderColumnInsertion: true });
  const beforeRows = failed.orderSheet.rows.map((row) => row.slice());
  const beforeHeaders = failed.orderSheet.headers.slice();
  assert.throws(() => failed.context.setupPartnerProgram(), /column insertion failed/i);
  assert.deepEqual(failed.orderSheet.insertions, []);
  assert.equal(failed.orderSheet.maxColumns, 26);
  assert.deepEqual(failed.orderSheet.rows, beforeRows);
  assert.deepEqual(failed.orderSheet.headers, beforeHeaders);
  assert.equal(failed.properties.values.PARTNER_PROGRAM_CONFIGURED || "", "");
});

test("correction is locked, audited with old and new rates, and rejects frozen rows", () => {
  const runtime = partnerRuntime({ setup: true, migrated: true, orderRows: [referredOrderRow({ commissionStatus: "Pending", rate: 0.05 })], partnerRows: [["partner-1", "AJMERPHOTO01", "Studio", "Asha", "photographer", "Ajmer", "8209238541", "asha@example.com", "https://example.com", 0.05, "Active", new Date("2026-10-01"), "https://saloniresinart.com/?ref=AJMERPHOTO01", "", ""], ["partner-2", "NEWCODE01", "New Studio", "Nina", "photographer", "Ajmer", "8209238542", "nina@example.com", "https://example.com", 0.07, "Active", new Date("2026-10-01"), "https://saloniresinart.com/?ref=NEWCODE01", "", ""]] });
  const result = runtime.context.correctOrderAttribution_("request-123456", "NEWCODE01", "staff correction");
  assert.equal(result.referralCode, "NEWCODE01");
  assert.equal(runtime.lock.calls, 1);
  assert.match(String(runtime.orderSheet.rows[0][25]), /AJMERPHOTO01.*0\.05.*NEWCODE01.*0\.07.*staff correction/);
  const frozen = partnerRuntime({ setup: true, migrated: true, orderRows: [referredOrderRow({ commissionStatus: "Paid" })], partnerRows: [["partner-1", "AJMERPHOTO01", "Studio", "Asha", "photographer", "Ajmer", "8209238541", "asha@example.com", "https://example.com", 0.05, "Active", new Date("2026-10-01"), "https://saloniresinart.com/?ref=AJMERPHOTO01", "", ""], ["partner-2", "NEWCODE01", "New Studio", "Nina", "photographer", "Ajmer", "8209238542", "nina@example.com", "https://example.com", 0.07, "Active", new Date("2026-10-01"), "https://saloniresinart.com/?ref=NEWCODE01", "", ""]] });
  assert.throws(() => frozen.context.correctOrderAttribution_("request-123456", "NEWCODE01", "too late"), /frozen|Paid/i);
  assert.equal(frozen.orderSheet.rows[0][26], "AJMERPHOTO01");
  const blocked = partnerRuntime({ setup: true, migrated: true, lockAvailable: false, orderRows: [referredOrderRow({ commissionStatus: "Pending" })] });
  assert.throws(() => blocked.context.correctOrderAttribution_("request-123456", "AJMERPHOTO01", "blocked"), /Unable to correct/);
  assert.equal(blocked.orderSheet.rows[0][26], "AJMERPHOTO01");
});

test("approved application cleanup requires copied contact and consent fields", () => {
  const runtime = partnerRuntime({ partnerRows: [["partner-1", "AJMERPHOTO01", "Asha Studio", "Asha", "photographer", "Ajmer", "8209238541", "asha@example.com", "https://example.com", 0.05, "Active", new Date("2026-10-01"), "https://saloniresinart.com/?ref=AJMERPHOTO01", "", ""]] });
  const applicationHeaders = ["Application ID", "Received at", "Applicant name", "Business name", "Category", "City / service area", "Phone / WhatsApp", "Email", "Instagram / website", "Typical customers", "Referral plan", "Rules accepted", "Status", "Review notes", "Reviewed at", "Payload fingerprint", "Partner ID"];
  const application = ["application-123456", new Date("2026-01-01"), "Asha", "Asha Studio", "photographer", "Ajmer", "8209238541", "asha@example.com", "https://example.com", "Families", "I will share stories", true, "Approved", "", new Date("2026-01-02"), "fingerprint", "partner-1"];
  assert.equal(runtime.context.partnerTransferVerified_("partner-1", runtime.properties, application, Object.fromEntries(applicationHeaders.map((header, index) => [header, index]))), true);
  const incomplete = application.slice();
  incomplete[7] = "wrong@example.com";
  assert.equal(runtime.context.partnerTransferVerified_("partner-1", runtime.properties, incomplete, Object.fromEntries(applicationHeaders.map((header, index) => [header, index]))), false);
});

test("lookup outage is retryable and distinct from an invalid code", () => {
  const runtime = partnerRuntime({ partnerLookupThrows: true });
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.context.validateReferralCode("AJMERPHOTO01"))), { status: "error", code: "AJMERPHOTO01" });
  const normal = partnerRuntime();
  assert.deepEqual(JSON.parse(JSON.stringify(normal.context.validateReferralCode("UNKNOWN01"))), { status: "invalid", code: "UNKNOWN01" });
});

test("collection referral capture runs when the shared script loads after DOMContentLoaded", () => {
  const links = [{ href: "../#order", getAttribute() { return this.href; }, setAttribute(_name, value) { this.href = value; }, hasAttribute() { return false; } }];
  const documentObject = {
    readyState: "complete",
    documentElement: { classList: { add() {} } },
    addEventListener() { throw new Error("must not wait for DOMContentLoaded"); },
    querySelectorAll(selector) { return selector === "a[href]" ? links : []; },
    querySelector() { return null; },
    getElementById() { return null; },
  };
  const windowObject = { location: { search: "?ref=ajmerphoto01", href: "https://saloniresinart.com/collection/", origin: "https://saloniresinart.com" }, sessionStorage: { getItem: () => "", setItem() {}, removeItem() {} }, addEventListener() {} };
  const context = { console, document: documentObject, window: windowObject, URL, URLSearchParams, IntersectionObserver: undefined };
  vm.createContext(context);
  vm.runInContext(script, context, { filename: "script.js" });
  assert.equal(context.window.saloniReferral.read(), "AJMERPHOTO01");
  assert.match(links[0].href, /ref=AJMERPHOTO01/);
});

test("partner page keeps terms visible and consent links to the complete rules", () => {
  const page = fs.readFileSync(path.join(root, "partners", "index.html"), "utf8");
  const form = fs.readFileSync(path.join(root, "apps-script", "PartnerForm.html"), "utf8");
  assert.match(page, /id="rules"/);
  assert.match(page, /cancelled|refunded|self-referred|void/i);
  assert.match(page, /monthly.*manual payout/i);
  const partnerSeedStart = script.indexOf('if (frameState.mode === "partner")');
  assert.ok(partnerSeedStart >= 0);
  assert.doesNotMatch(script.slice(partnerSeedStart, partnerSeedStart + 180), /scrollToForm/);
  assert.match(form, /Partner Circle rules/);
});

test("correction preserves formulas, defaults direct rows, and recalculates the target formula", () => {
  const formula = '=IF(AD2>0,AD2*AG2,0)';
  const order = referredOrderRow({ commissionStatus: "Pending", commissionAmount: 50 }); order[1] = "=CUSTOM(A2)"; order[14] = "=1+1";
  const runtime = partnerRuntime({ setup: true, migrated: true, orderRows: [order], orderFormulas: [["", "=CUSTOM(A2)", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", formula, "", "", ""]], partnerRows: [["partner-1", "AJMERPHOTO01", "Studio", "Asha", "photographer", "Ajmer", "8209238541", "asha@example.com", "https://example.com", 0.05, "Active", new Date("2026-10-01"), "https://saloniresinart.com/?ref=AJMERPHOTO01", "", ""], ["partner-2", "NEWCODE01", "New Studio", "Nina", "photographer", "Ajmer", "8209238542", "nina@example.com", "https://example.com", 0.07, "Active", new Date("2026-10-01"), "https://saloniresinart.com/?ref=NEWCODE01", "", ""]] });
  runtime.context.correctOrderAttribution_("request-123456", "NEWCODE01", "formula correction");
  assert.equal(runtime.orderSheet.rows[0][1], "'=CUSTOM(A2)");
  assert.equal(runtime.orderSheet.formulas[0][1], "");
  assert.equal(runtime.orderSheet.rows[0][14], "'=1+1");
  assert.match(runtime.orderSheet.formulas[0][33], /^=IF\(AND\(AD2>0/);
  const direct = new Array(37).fill(""); direct[0] = "request-123456"; direct[2] = new Date("2026-10-01"); direct[3] = "catalogue"; direct[29] = 1000;
  const directRuntime = partnerRuntime({ setup: true, migrated: true, orderRows: [direct], partnerRows: [["partner-2", "NEWCODE01", "New Studio", "Nina", "photographer", "Ajmer", "8209238542", "nina@example.com", "https://example.com", 0.07, "Active", new Date("2026-10-01"), "https://saloniresinart.com/?ref=NEWCODE01", "", ""]] });
  directRuntime.context.correctOrderAttribution_("request-123456", "NEWCODE01", "attribute direct");
  assert.equal(directRuntime.orderSheet.rows[0][30], "Pending");
  assert.equal(directRuntime.orderSheet.rows[0][31], "New");
  assert.equal(directRuntime.orderSheet.rows[0][34], "Pending");
  assert.match(directRuntime.orderSheet.formulas[0][33], /^=IF\(AND\(AD2>0/);
});

test("approval and pause lock, resume idempotently, and preserve closure time", () => {
  const blocked = partnerRuntime({ applicationRows: [applicationRow()], partnerRows: [], lockAvailable: false });
  assert.throws(() => blocked.context.approvePartner_("application-123456", { referralCode: "NEWCODE01", displayName: "Changed", rate: 0.07 }), /Unable to approve/);
  assert.equal(blocked.partnerRows.length, 0);
  const pauseBlocked = partnerRuntime({ partnerRows: [["partner-1", "AJMERPHOTO01", "Studio", "Asha", "photographer", "Ajmer", "8209238541", "asha@example.com", "https://example.com", 0.05, "Active", new Date("2026-10-01"), "https://saloniresinart.com/?ref=AJMERPHOTO01", "", ""]], lockAvailable: false });
  assert.throws(() => pauseBlocked.context.pausePartner_("partner-1", "Paused", "blocked"), /Unable to update/);
  const resumed = partnerRuntime({ applicationRows: [applicationRow()], partnerRows: [], appendPartnerThrowsOnce: true });
  const approved = resumed.context.approvePartner_("application-123456", { referralCode: "NEWCODE01", displayName: "Changed", rate: 0.07 });
  assert.equal(approved.partnerId, "partner-application-123456");
  assert.equal(resumed.partnerRows.length, 1);
  assert.equal(resumed.partnerRows[0][2], "Asha Studio");
  assert.equal(resumed.applicationRows[0][12], "Approved");
  const firstClosed = resumed.context.pausePartner_("partner-application-123456", "Closed", "first close");
  assert.equal(firstClosed, true);
  const closureAt = resumed.partnerRows[0][14];
  resumed.context.pausePartner_("partner-application-123456", "Closed", "repeat close");
  assert.equal(resumed.partnerRows[0][14].getTime(), closureAt.getTime());
  resumed.context.pausePartner_("partner-application-123456", "Active", "reopen");
  assert.equal(resumed.partnerRows[0][14], "");
  const pauseRow = ["partner-1", "AJMERPHOTO01", "Studio", "Asha", "photographer", "Ajmer", "8209238541", "asha@example.com", "https://example.com", 0.05, "Active", new Date("2026-10-01"), "https://saloniresinart.com/?ref=AJMERPHOTO01", "=1+1", ""];
  const pauseResumed = partnerRuntime({ partnerRows: [pauseRow], failPartnerUpdateOnce: true });
  assert.throws(() => pauseResumed.context.pausePartner_("partner-1", "Closed"), /partner status update failed|set/i);
  assert.equal(pauseResumed.context.pausePartner_("partner-1", "Closed"), true);
  assert.equal(pauseResumed.partnerRows[0][10], "Closed");
  assert.equal(pauseResumed.partnerRows[0][13], "'=1+1");
  const updateResumed = partnerRuntime({ applicationRows: [applicationRow()], partnerRows: [], appendPartnerThrowsOnce: true, failApplicationUpdateOnce: true });
  assert.throws(() => updateResumed.context.approvePartner_("application-123456", { referralCode: "NEWCODE02", rate: 0.06 }), /Unable to approve|set|application update failed/i);
  assert.equal(updateResumed.partnerRows.length, 1);
  assert.equal(updateResumed.context.approvePartner_("application-123456", { referralCode: "NEWCODE02", rate: 0.06 }).partnerId, "partner-application-123456");
  assert.equal(updateResumed.partnerRows.length, 1);
  assert.equal(updateResumed.applicationRows[0][12], "Approved");
});

test("monthly sync is the one resumable ledger path and permits first known subtotal only once", () => {
  const runtime = partnerRuntime({ setup: true, migrated: true, orderRows: [referredOrderRow({ subtotal: "", payment: "Pending", delivery: "New", commissionStatus: "Pending", commissionAmount: "" })] });
  runtime.context.setupPartnerProgram();
  assert.equal(runtime.context.syncOrderCommission_("request-123456").status, "Pending");
  assert.equal(runtime.commissionRows.length, 1);
  runtime.orderSheet.rows[0][29] = 1000; runtime.orderSheet.rows[0][30] = "Paid"; runtime.orderSheet.rows[0][31] = "Delivered";
  assert.equal(runtime.context.syncOrderCommission_("request-123456").status, "Eligible");
  assert.equal(runtime.commissionRows.length, 1);
  assert.equal(runtime.commissionRows[0][5], 1000);
  assert.equal(runtime.commissionRows[0][7], 50);
  runtime.orderSheet.rows[0][34] = "Paid"; runtime.orderSheet.rows[0][33] = 50; runtime.orderSheet.rows[0][35] = "batch-9"; runtime.orderSheet.rows[0][36] = new Date("2026-10-30");
  assert.equal(runtime.context.syncOrderCommission_("request-123456").status, "Paid");
  assert.equal(runtime.commissionRows[0][9], "batch-9");
  const conflict = partnerRuntime({ setup: true, migrated: true, orderRows: [referredOrderRow({ subtotal: 1000 })], commissionRows: [["commission-request-123456", "partner-1", "Studio", "2026-10", "catalogue", 900, 0.05, 45, "Pending", "", "", "", ""]] });
  conflict.context.setupPartnerProgram();
  assert.throws(() => conflict.context.syncOrderCommission_("request-123456"), /mismatch|conflict/i);
});

test("default Pending refunded orders archive as frozen Void, while refunded Paid is retained", () => {
  const refunded = partnerRuntime({ setup: true, migrated: true, orderRows: [referredOrderRow({ payment: "Refunded", delivery: "Delivered", commissionStatus: "Pending" })] });
  refunded.context.setupPartnerProgram();
  assert.equal(refunded.context.syncOrderCommission_("request-123456").status, "Void");
  assert.equal(refunded.commissionRows[0][7], 0);
  assert.equal(refunded.context.purgeExpiredOrdersAt_(new Date("2027-01-01")).deletedRows, 1);
  assert.equal(refunded.orderSheet.rows.length, 0);
  const paid = partnerRuntime({ setup: true, migrated: true, orderRows: [referredOrderRow({ commissionStatus: "Paid", payment: "Refunded", commissionAmount: 50, payoutBatch: "batch-7", payoutDate: new Date("2026-10-21") })], commissionRows: [["commission-request-123456", "partner-1", "Studio", "2026-10", "catalogue", 1000, 0.05, 50, "Paid", "batch-7", new Date("2026-10-21"), "", ""]] });
  paid.context.setupPartnerProgram();
  assert.throws(() => paid.context.syncOrderCommission_("request-123456"), /conflict|frozen|refund/i);
  assert.equal(paid.orderSheet.rows.length, 1);
  assert.equal(paid.commissionRows[0][7], 50);
});

test("refunded Eligible and Approved commissions become frozen zero-value Void before cleanup", () => {
  ["Eligible", "Approved"].forEach((status) => {
    const runtime = partnerRuntime({ setup: true, migrated: true, orderRows: [referredOrderRow({ payment: "Refunded", delivery: "Delivered", commissionStatus: status, commissionAmount: 50 })] });
    runtime.context.setupPartnerProgram();
    assert.equal(runtime.context.syncOrderCommission_("request-123456").status, "Void");
    assert.equal(runtime.commissionRows[0][7], 0);
    assert.equal(runtime.context.purgeExpiredOrdersAt_(new Date("2027-01-01")).deletedRows, 1);
    assert.equal(runtime.orderSheet.rows.length, 0);
  });
});

test("approval ignores display-name overrides and rejects duplicate partner identity", () => {
  const application = applicationRow(); application[2] = "=1+1"; application[3] = "=Business"; application[9] = "=Customers";
  const runtime = partnerRuntime({ applicationRows: [application], partnerRows: [] });
  runtime.context.approvePartner_("application-123456", { referralCode: "NEWCODE01", displayName: "Untrusted override", rate: 0.07 });
  assert.equal(runtime.partnerRows[0][2], "'=Business");
  assert.equal(runtime.partnerRows[0][3], "'=1+1");
  assert.equal(runtime.applicationRows[0][2], "'=1+1");
  assert.equal(runtime.applicationRows[0][9], "'=Customers");
  const duplicate = partnerRuntime({ applicationRows: [applicationRow()], partnerRows: [["partner-application-123456", "OTHER01", "Asha Studio", "Asha", "photographer", "Ajmer", "8209238541", "asha@example.com", "https://example.com", 0.07, "Active", new Date("2026-10-01"), "https://saloniresinart.com/?ref=OTHER01", "", ""]] });
  assert.throws(() => duplicate.context.approvePartner_("application-123456", { referralCode: "NEWCODE01", rate: 0.07 }), /conflict|exists/i);
});

test("setup reruns protections and fails closed, while application retry and cap remain bounded", () => {
  const protectedRuntime = partnerRuntime({ setup: true, protectionsReusable: true });
  protectedRuntime.context.setupPartnerProgram();
  const firstProtectionCount = protectedRuntime.protections.length;
  protectedRuntime.context.setupPartnerProgram();
  assert.equal(protectedRuntime.protections.length, firstProtectionCount);
  const failed = partnerRuntime({ protectFailure: true });
  assert.throws(() => failed.context.setupPartnerProgram(), /protect|Unable/);
  assert.notEqual(failed.properties.values.PARTNER_PROGRAM_CONFIGURED, "true");
  const capped = partnerRuntime({ properties: { PARTNER_DAILY_ACCEPTANCE_CAP: "1" }, applicationRows: [["old-application", new Date(), "Asha", "Asha Studio", "photographer", "Ajmer", "8209238541", "asha@example.com", "https://example.com", "Families", "Plan", true, "Pending", "", "", "fingerprint", ""] ] });
  const result = capped.context.submitPartnerApplication(applicationForm());
  assert.match(result.errors.form, /limit/i);
});

function applicationForm() {
  return { applicationId: "application-123456", applicantName: "Asha", businessName: "Asha Studio", category: "photographer", serviceArea: "Ajmer", phone: "8209238541", email: "asha@example.com", website: "https://example.com", typicalCustomers: "Families", referralPlan: "I will share stories", rulesAccepted: "true", captchaToken: "token" };
}

function applicationRow() {
  return ["application-123456", new Date("2026-10-01"), "Asha", "Asha Studio", "photographer", "Ajmer", "8209238541", "asha@example.com", "https://example.com", "Families", "I will share stories", true, "Pending", "", "", "fingerprint", ""];
}

function referredOrderRow(overrides = {}) {
  const row = new Array(37).fill("");
  row[0] = "request-123456"; row[2] = new Date("2026-10-01"); row[3] = "catalogue";
  row[24] = ""; row[25] = "New request"; row[26] = "AJMERPHOTO01"; row[27] = "partner-1"; row[28] = "Studio";
  row[29] = overrides.subtotal == null ? 1000 : overrides.subtotal; row[30] = overrides.payment == null ? "Paid" : overrides.payment; row[31] = overrides.delivery == null ? "Delivered" : overrides.delivery; row[32] = overrides.rate == null ? 0.05 : overrides.rate;
  row[33] = overrides.commissionAmount == null ? 50 : overrides.commissionAmount; row[34] = overrides.commissionStatus || "Pending"; row[35] = overrides.payoutBatch || ""; row[36] = overrides.payoutDate || "";
  return row;
}

function partnerRuntime(options = {}) {
  const values = Object.assign({ ORDER_SHEET_ID: "sheet", ORDER_SHEET_TAB: "Orders", CAPTCHA_SECRET: "secret", CAPTCHA_MIN_SCORE: "0.5" }, options.properties || {});
  const legacyHeaders = ["Request ID", "Payload fingerprint", "Received at", "Source kind", "Source ID", "Product name", "Quantity", "Height value", "Height unit", "Height (in)", "Width value", "Width unit", "Width (in)", "Design details", "Customer name", "Phone", "Email", "Fulfilment", "Shipping address", "City", "State", "PIN", "Requested date", "Reference file link", "Status", "Staff notes"];
  const fullHeaders = legacyHeaders.concat(["Referral code", "Partner ID", "Partner name snapshot", "Final product subtotal", "Payment status", "Delivery status", "Commission rate snapshot", "Commission amount", "Commission status", "Payout batch ID", "Payout date"]);
  const applicationHeaders = ["Application ID", "Received at", "Applicant name", "Business name", "Category", "City / service area", "Phone / WhatsApp", "Email", "Instagram / website", "Typical customers", "Referral plan", "Rules accepted", "Status", "Review notes", "Reviewed at", "Payload fingerprint", "Partner ID"];
  const partnerHeaders = ["Partner ID", "Referral code", "Partner display name", "Contact name", "Category", "City / service area", "Phone / WhatsApp", "Email", "Instagram / website", "Commission rate", "Status", "Approved at", "Referral link", "Staff notes", "Closed at"];
  const commissionHeaders = ["Commission ID", "Partner ID / code", "Partner name snapshot", "Order month", "Product category", "Final product subtotal", "Commission rate", "Commission amount", "Commission status", "Payout batch ID", "Paid at", "Payment reference", "Staff notes"];
  const rows = options.orderRows ? options.orderRows.map((row) => row.slice()) : [];
  const applicationRows = options.applicationRows ? options.applicationRows.map((row) => row.slice()) : [];
  const partnerRows = options.partnerRows ? options.partnerRows.map((row) => row.slice()) : [["partner-1", "AJMERPHOTO01", "Studio", "Asha", "photographer", "Ajmer", "8209238541", "asha@example.com", "https://example.com", 0.05, "Active", new Date("2026-10-01"), "https://saloniresinart.com/?ref=AJMERPHOTO01", "", ""]];
  const commissionRows = options.commissionRows ? options.commissionRows.map((row) => row.slice()) : [];
  const orderFormulas = options.orderFormulas ? options.orderFormulas.map((row) => row.slice()) : [];
  const protections = [];
  const lock = { calls: 0, tryLock: () => { lock.calls += 1; return options.lockAvailable !== false; }, releaseLock() {} };
  function sheet(name, headers, dataRows, maxRows = 1000, formulaRows = [], maxColumns = headers.length) {
    const target = { name, headers, rows: dataRows.map((row) => row.slice()), formulas: formulaRows.map((row) => row.slice()), maxRows, maxColumns, insertions: [], getLastRow: () => target.rows.length + 1, getLastColumn: () => target.headers.length, getMaxRows: () => target.maxRows, getMaxColumns: () => target.maxColumns };
    while (target.formulas.length < target.rows.length) target.formulas.push([]);
    target.getDataRange = () => ({ getValues: () => [target.headers].concat(target.rows.map((row) => { const padded = row.slice(); while (padded.length < target.headers.length) padded.push(""); return padded; })) });
    target.getRange = (row, column, rowCount, columnCount) => {
      const range = {
        getValues: () => row === 1 ? [target.headers.slice(column - 1, column - 1 + (columnCount || target.headers.length))] : [((target.rows[row - 2] || []).slice(column - 1, column - 1 + (columnCount || target.headers.length)))],
        getFormulas: () => row === 1 ? [new Array(columnCount || target.headers.length).fill("")] : [((target.formulas[row - 2] || []).slice(column - 1, column - 1 + (columnCount || target.headers.length)))],
        setValues(valuesToSet) { if (column + (valuesToSet[0] || []).length - 1 > target.maxColumns) throw new Error("range exceeds sheet capacity"); for (let r = 0; r < valuesToSet.length; r += 1) { if (row === 1) { valuesToSet[r].forEach((value, c) => { target.headers[column - 1 + c] = value; }); } else { const destination = target.rows[row - 2 + r] || []; const formulaDestination = target.formulas[row - 2 + r] || []; while (destination.length < target.headers.length) destination.push(""); while (formulaDestination.length < target.headers.length) formulaDestination.push(""); valuesToSet[r].forEach((value, c) => { destination[column - 1 + c] = value; formulaDestination[column - 1 + c] = typeof value === "string" && value.charAt(0) === "=" ? value : ""; }); target.rows[row - 2 + r] = destination; target.formulas[row - 2 + r] = formulaDestination; if (options.failApplicationUpdateOnce && target.name === applicationTab && row > 1 && column === 1 && !options._applicationUpdateFailed) { options._applicationUpdateFailed = true; throw new Error("application update failed after write"); } if (options.failPartnerUpdateOnce && target.name === partnerTab && row > 1 && column === 1 && !options._partnerUpdateFailed) { options._partnerUpdateFailed = true; throw new Error("partner status update failed after write"); } } } },
        setValue(value) { range.setValues([[value]]); },
        protect() { if (options.protectFailure) throw new Error("protection failed"); const protection = { sheet: target, warningOnly: true, numRows: rowCount || 1, numColumns: columnCount || 1, setWarningOnly(value) { protection.warningOnly = value; }, setDescription(value) { protection.description = value; }, getDescription() { return protection.description || ""; }, setRange(rangeToSet) { protection.numRows = rangeToSet.rowCount || target.maxRows; protection.numColumns = rangeToSet.columnCount || protection.numColumns; }, getEditors() { return []; }, removeEditors() { protection.removedEditors = true; }, addEditor() { protection.addedEditor = true; }, canDomainEdit: () => true, setDomainEdit(value) { protection.domainEdit = value; } }; protections.push(protection); return protection; },
      };
      return range;
    };
    target.insertColumnsAfter = (after, count) => {
      if (options.failOrderColumnInsertion && target.name === "Orders") throw new Error("column insertion failed");
      if (after !== target.maxColumns) throw new Error("column insertion position mismatch");
      target.maxColumns += count;
      target.insertions.push({ after, count });
    };
    target.getProtections = () => protections.filter((protection) => protection.sheet === target);
    target.appendRow = (row) => { const next = row.slice(); while (next.length < target.headers.length) next.push(""); target.rows.push(next); target.formulas.push(new Array(target.headers.length).fill("")); if (options.appendPartnerThrowsOnce && target.name === partnerTab && !options._partnerAppendFailed) { options._partnerAppendFailed = true; throw new Error("partner append failed after write"); } };
    target.deleteRow = (rowNumber) => target.rows.splice(rowNumber - 2, 1);
    return target;
  }
  const orderHeaders = options.orderHeaders || (options.migrated ? fullHeaders : legacyHeaders);
  const orderSheet = sheet("Orders", orderHeaders, rows, 1000, orderFormulas, options.orderMaxColumns || orderHeaders.length);
  const applicationTab = values.PARTNER_APPLICATIONS_SHEET_TAB || "Partner Applications";
  const partnerTab = values.PARTNERS_SHEET_TAB || "Partners";
  const commissionTab = values.PARTNER_COMMISSIONS_SHEET_TAB || "Partner Commissions";
  const applicationSheet = sheet(applicationTab, applicationHeaders, applicationRows);
  const partnerSheet = sheet(partnerTab, partnerHeaders, partnerRows);
  const commissionSheet = sheet(commissionTab, commissionHeaders, commissionRows);
  const sheets = { Orders: orderSheet }; sheets[applicationTab] = applicationSheet; sheets[partnerTab] = partnerSheet; sheets[commissionTab] = commissionSheet;
  const spreadsheet = { getSheetByName: (name) => sheets[name] || null, insertSheet: (name) => { const headers = name === applicationTab ? applicationHeaders : name === partnerTab ? partnerHeaders : commissionHeaders; const created = sheet(name, headers, []); sheets[name] = created; return created; } };
  const properties = { values, getProperty: (key) => values[key] || "", setProperty: (key, value) => { values[key] = String(value); } };
  const utilities = { getUuid: () => "00000000-0000-4000-8000-000000000000", formatDate: (date) => new Date(date).toISOString().slice(0, 7), newBlob: (value) => ({ getBytes: () => Array.from(Buffer.from(String(value))) }), DigestAlgorithm: { SHA_256: "SHA-256" }, computeDigest: (_algorithm, bytes) => Array.from(require("node:crypto").createHash("sha256").update(Buffer.from(bytes)).digest()).map((byte) => byte > 127 ? byte - 256 : byte) };
  const context = { console, Number, String, JSON, Date, RegExp, Math, isFinite, Object, Array, Utilities: utilities, PropertiesService: { getScriptProperties: () => properties }, LockService: { getScriptLock: () => lock }, SpreadsheetApp: { openById: () => spreadsheet, ProtectionType: { RANGE: "RANGE" } }, Session: { getScriptTimeZone: () => "UTC", getActiveUser: () => ({ getEmail: () => "owner@example.com" }), getEffectiveUser: () => ({ getEmail: () => "owner@example.com" }) }, UrlFetchApp: { fetch: () => ({ getContentText: () => JSON.stringify(options.captchaResponse || { success: true, hostname: "saloniresinart.com", action: "partner_application", score: 0.9 }) }) } };
  if (options.partnerLookupThrows) context.SpreadsheetApp.openById = () => { throw new Error("sheet unavailable"); };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "Code.gs" });
  return { context, properties, orderSheet, applicationRows: applicationSheet.rows, partnerRows: partnerSheet.rows, protections, lock, commissionRows: commissionSheet.rows };
}
