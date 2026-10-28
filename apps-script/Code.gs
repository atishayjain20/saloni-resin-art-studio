/**
 * Google Apps Script web app for the static site's order-request iframe.
 *
 * The web app intentionally has no public read/list endpoint. doGet and doPost
 * only render a bounded order, partner, or corporate form; public writes stay in the three
 * validated submission functions below.
 */

var MAX_FILE_BYTES = 5 * 1024 * 1024;
var MAX_DIMENSION_INCHES = 60;
var DEFAULT_DAILY_ACCEPTANCE_CAP = 50;
var DEFAULT_PARTNER_DAILY_ACCEPTANCE_CAP = 20;
var DEFAULT_CORPORATE_DAILY_ACCEPTANCE_CAP = 20;
var PARTNER_APPLICATION_CAPTCHA_ACTION = "partner_application";
var CORPORATE_ENQUIRY_CAPTCHA_ACTION = "corporate_enquiry";
var ORDER_CAPTCHA_ACTION = "order_request";
var RETENTION_DAYS = 90;
var RETENTION_MILLISECONDS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
var ORDER_FILE_NAME_PATTERN = /^order-([A-Za-z0-9_-]{12,80})\.(jpg|png)$/;
var LEGACY_ORDER_HEADERS = [
  "Request ID", "Payload fingerprint", "Received at", "Source kind", "Source ID",
  "Product name", "Quantity", "Height value", "Height unit", "Height (in)",
  "Width value", "Width unit", "Width (in)", "Design details",
  "Customer name", "Phone", "Email", "Fulfilment", "Shipping address",
  "City", "State", "PIN", "Requested date", "Reference file link", "Status", "Staff notes"
];
var PARTNER_ORDER_HEADERS = [
  "Referral code", "Partner ID", "Partner name snapshot", "Final product subtotal", "Payment status",
  "Delivery status", "Commission rate snapshot", "Commission amount", "Commission status",
  "Payout batch ID", "Payout date"
];
var ORDER_HEADERS = LEGACY_ORDER_HEADERS.concat(PARTNER_ORDER_HEADERS);
var PARTNER_APPLICATION_HEADERS = [
  "Application ID", "Received at", "Applicant name", "Business name", "Category", "City / service area",
  "Phone / WhatsApp", "Email", "Instagram / website", "Typical customers", "Referral plan", "Rules accepted",
  "Status", "Review notes", "Reviewed at", "Payload fingerprint", "Partner ID"
];
var PARTNER_HEADERS = [
  "Partner ID", "Referral code", "Partner display name", "Contact name", "Category", "City / service area",
  "Phone / WhatsApp", "Email", "Instagram / website", "Commission rate", "Status", "Approved at",
  "Referral link", "Staff notes", "Closed at"
];
var COMMISSION_HEADERS = [
  "Commission ID", "Partner ID / code", "Partner name snapshot", "Order month", "Product category",
  "Final product subtotal", "Commission rate", "Commission amount", "Commission status", "Payout batch ID",
  "Paid at", "Payment reference", "Staff notes"
];
var CORPORATE_ENQUIRY_HEADERS = [
  "Enquiry ID", "Received at", "Organisation name", "Contact name", "Phone / WhatsApp", "Email",
  "Enquiry type", "Occasion", "Approximate quantity", "Budget range", "Required date", "Delivery scope",
  "Brief", "Privacy accepted", "Status", "Staff notes", "Payload fingerprint"
];
var PARTNER_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
var PARTNER_PROGRAM_READY_PROPERTY = "PARTNER_PROGRAM_CONFIGURED";
var CORPORATE_PROGRAM_READY_PROPERTY = "CORPORATE_PROGRAM_CONFIGURED";
var COMMISSION_STATUSES = ["Pending", "Eligible", "Approved", "Paid", "Void"];
var PAYMENT_STATUSES = ["Pending", "Paid", "Refunded", "Not applicable"];
var DELIVERY_STATUSES = ["New", "Confirmed", "In production", "Shipped", "Delivered", "Cancelled", "Test"];

function doGet(event) {
  var parameters = event && event.parameter ? event.parameter : {};
  return renderForm_({ seed: blankSeed_(), mode: boundedMode_(parameters.mode) });
}

function doPost(event) {
  var parameters = event && event.parameter ? event.parameter : {};
  var action = String(parameters.action || "");
  var mode = boundedMode_(parameters.mode);
  if (action === "seed") {
    var seed = parseSeed_(parameters.seed);
    seed.formMode = mode;
    if (mode === "partner") seed.applicationId = boundedSeed_(parameters.applicationId || seed.applicationId, 80);
    if (mode === "corporate") seed.enquiryId = boundedSeed_(parameters.enquiryId || seed.enquiryId, 80);
    return renderForm_({ seed: seed, mode: mode });
  }
  return renderForm_({ seed: blankSeed_(), mode: mode });
}

function renderForm_(state) {
  var properties = PropertiesService.getScriptProperties();
  var siteKey = String(properties.getProperty("CAPTCHA_SITE_KEY") || "");
  var captchaEnabled = true;
  var mode = boundedMode_(state && state.mode);
  var seed = (state && state.seed) || blankSeed_();
  seed.formMode = mode;
  var templateName = mode === "partner" ? "PartnerForm" : mode === "corporate" ? "CorporateForm" : "Form";
  var template = HtmlService.createTemplateFromFile(templateName);
  template.seedJson = escapeSeedJson_(JSON.stringify(seed));
  template.captchaSiteKeyJson = escapeSeedJson_(JSON.stringify(siteKey));
  template.captchaEnabledJson = captchaEnabled ? "true" : "false";
  template.formModeJson = escapeSeedJson_(JSON.stringify(mode));
  return template.evaluate()
    .setTitle(mode === "partner" ? "Saloni Resin Art partner application" : mode === "corporate" ? "Saloni Resin Art organisation enquiry" : "Saloni Resin Art Studio order request")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function boundedMode_(value) {
  var mode = String(value || "").toLowerCase();
  return mode === "partner" || mode === "corporate" ? mode : "order";
}

function purgeExpiredOrders_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Unable to start retention cleanup.");
  try {
    return purgeExpiredOrdersAt_(new Date());
  } finally {
    lock.releaseLock();
  }
}

function installRetentionTrigger() {
  var activeEmail = String(Session.getActiveUser().getEmail() || "").trim();
  var effectiveEmail = String(Session.getEffectiveUser().getEmail() || "").trim();
  if (!activeEmail || activeEmail.toLowerCase() !== effectiveEmail.toLowerCase()) {
    throw new Error("Run this setup as the deployment owner.");
  }
  return installRetentionTrigger_();
}

function installRetentionTrigger_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Unable to install retention trigger.");
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var index = 0; index < triggers.length; index += 1) {
      if (triggers[index].getHandlerFunction() === "purgeExpiredOrders_") return false;
    }
    ScriptApp.newTrigger("purgeExpiredOrders_")
      .timeBased()
      .everyDays(1)
      .atHour(3)
      .create();
    return true;
  } finally {
    lock.releaseLock();
  }
}

function purgeExpiredOrdersAt_(now) {
  var runAt = retentionDate_(now);
  if (!runAt) throw new Error("Retention cleanup requires a valid date.");
  var properties = PropertiesService.getScriptProperties();
  var sheet = openOrderSheet_(properties);
  var orderColumns = orderSchemaLength_(sheet);
  var values = sheet.getDataRange().getValues();
  var cutoff = new Date(runAt.getTime() - RETENTION_MILLISECONDS);
  var knownRequestIds = {};
  var expiredRows = [];
  var errors = 0;

  for (var index = 1; index < values.length; index += 1) {
    var row = values[index];
    var requestId = String(row[0] == null ? "" : row[0]);
    if (requestId) knownRequestIds[requestId] = true;
    var rawReceivedAt = row[2];
    var receivedAt = retentionDate_(rawReceivedAt);
    if (!receivedAt) {
      if (rawReceivedAt !== null && rawReceivedAt !== undefined && rawReceivedAt !== "") errors += 1;
      continue;
    }
    if (receivedAt.getTime() > cutoff.getTime()) continue;
    if (!/^[A-Za-z0-9_-]{12,80}$/.test(requestId)) {
      errors += 1;
      continue;
    }
    expiredRows.push({
      rowNumber: index + 1,
      requestId: requestId,
      row: row,
      hasReference: Boolean(String(row[23] == null ? "" : row[23]).trim())
    });
  }

  var folderId = String(properties.getProperty("ORDER_DRIVE_FOLDER_ID") || "");
  var folder = null;
  if (folderId) {
    try {
      folder = openRetentionFolder_(properties);
    } catch (folderError) {
      errors += 1;
    }
  }

  var deletedFiles = 0;
  var deletedRows = 0;
  expiredRows.sort(function (left, right) { return right.rowNumber - left.rowNumber; });
  expiredRows.forEach(function (record) {
    if (orderColumns === ORDER_HEADERS.length && (String(record.row[26] || "").trim() || String(record.row[27] || "").trim())) {
      try {
        ensureCommissionRecord_(record.row, record.requestId, properties, runAt);
      } catch (ledgerError) {
        errors += 1;
        return;
      }
    }
    var fileFailure = false;
    if (record.hasReference) {
      if (!folder) {
        errors += 1;
        return;
      }
      var files;
      try {
        files = retentionFilesForRequest_(folder, record.requestId);
      } catch (fileLookupError) {
        errors += 1;
        return;
      }
      files.forEach(function (file) {
        try {
          permanentlyDeleteFile_(file);
          deletedFiles += 1;
        } catch (fileDeleteError) {
          errors += 1;
          fileFailure = true;
        }
      });
    }
    if (fileFailure) return;
    try {
      sheet.deleteRow(record.rowNumber);
      deletedRows += 1;
    } catch (rowDeleteError) {
      errors += 1;
    }
  });

  if (folder) {
    try {
      var files = folder.getFiles();
      var orphanFiles = [];
      while (files.hasNext()) {
        var file = files.next();
        var match = ORDER_FILE_NAME_PATTERN.exec(String(file.getName() || ""));
        if (!match || knownRequestIds[match[1]]) continue;
        var createdAt = retentionDate_(file.getDateCreated());
        if (!createdAt || createdAt.getTime() > cutoff.getTime()) continue;
        orphanFiles.push(file);
      }
      orphanFiles.forEach(function (file) {
        try {
          permanentlyDeleteFile_(file);
          deletedFiles += 1;
        } catch (orphanDeleteError) {
          errors += 1;
        }
      });
    } catch (orphanLookupError) {
      errors += 1;
    }
  }

  if (partnerProgramConfigured_(properties)) {
    try {
      var partnerCleanup = purgePartnerRecords_(runAt, properties);
      deletedRows += partnerCleanup.deletedRows;
    } catch (partnerCleanupError) {
      errors += 1;
    }
  }
  if (corporateProgramConfigured_(properties)) {
    try {
      var corporateCleanup = purgeCorporateRecords_(runAt, properties);
      deletedRows += corporateCleanup.deletedRows;
    } catch (corporateCleanupError) {
      errors += 1;
    }
  }
  var summary = { lastSuccessAt: runAt.toISOString(), deletedRows: deletedRows, deletedFiles: deletedFiles };
  if (errors) {
    console.error(JSON.stringify({ failedAt: runAt.toISOString(), deletedRows: deletedRows, deletedFiles: deletedFiles, errors: errors }));
    throw new Error("Retention cleanup failed.");
  }
  console.log(JSON.stringify(summary));
  return summary;
}

function purgeCorporateRecords_(now, properties) {
  var sheet = openCorporateTab_(properties, false);
  if (!sheet) return { deletedRows: 0 };
  ensureCorporateTabSchema_(sheet, false);
  var values = sheet.getDataRange().getValues();
  var cutoff = new Date(now.getTime() - RETENTION_MILLISECONDS);
  var deletedRows = 0;
  var errors = 0;
  for (var rowIndex = values.length - 1; rowIndex >= 1; rowIndex -= 1) {
    var row = values[rowIndex];
    var receivedAt = retentionDate_(row[1]);
    if (!receivedAt) {
      if (row[1] !== null && row[1] !== undefined && row[1] !== "") errors += 1;
      continue;
    }
    if (receivedAt.getTime() > cutoff.getTime()) continue;
    if (!/^[A-Za-z0-9_-]{12,80}$/.test(String(row[0] || ""))) {
      errors += 1;
      continue;
    }
    try {
      sheet.deleteRow(rowIndex + 1);
      deletedRows += 1;
    } catch (deleteError) { errors += 1; }
  }
  if (errors) throw new Error("Corporate retention cleanup failed.");
  return { deletedRows: deletedRows };
}

function openRetentionFolder_(properties) {
  var folderId = String(properties.getProperty("ORDER_DRIVE_FOLDER_ID") || "");
  if (!folderId) throw new Error("Order Drive folder is not configured.");
  var folder = DriveApp.getFolderById(folderId);
  if (folder.getSharingAccess && folder.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error("Order Drive folder is not restricted.");
  return folder;
}

function partnerProgramConfigured_(properties) {
  return Boolean(partnerProgramConfig_(properties) && isTrue_(properties.getProperty(PARTNER_PROGRAM_READY_PROPERTY)));
}

function partnerProgramConfig_(properties) {
  var sheetId = String(properties.getProperty("PARTNER_SHEET_ID") || properties.getProperty("ORDER_SHEET_ID") || "").trim();
  if (!sheetId) return null;
  return {
    sheetId: sheetId,
    applicationsTab: String(properties.getProperty("PARTNER_APPLICATIONS_SHEET_TAB") || "Partner Applications"),
    partnersTab: String(properties.getProperty("PARTNERS_SHEET_TAB") || "Partners"),
    commissionsTab: String(properties.getProperty("PARTNER_COMMISSIONS_SHEET_TAB") || "Partner Commissions")
  };
}

function ensureCommissionRecord_(orderRow, requestId, properties, now) {
  var sheet = openPartnerTab_(properties, "PARTNER_COMMISSIONS_SHEET_TAB", "Partner Commissions");
  ensurePartnerTabSchema_(sheet, COMMISSION_HEADERS);
  var commissionId = "commission-" + requestId;
  var values = sheet.getDataRange().getValues();
  var index = headerIndex_(values[0].map(String));
  var matches = [];
  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) if (String(values[rowIndex][index["Commission ID"]]) === commissionId) matches.push(values[rowIndex]);
  if (matches.length > 1) throw new Error("Commission ledger has duplicate records.");
  var code = String(orderRow[26] || "").trim();
  var partnerId = String(orderRow[27] || "").trim();
  var name = String(orderRow[28] || "");
  if (!code && !partnerId) throw new Error("Commission source has no partner attribution.");
  var rawSubtotal = orderRow[29];
  var subtotalText = String(rawSubtotal == null ? "" : rawSubtotal).trim();
  var subtotal = subtotalText ? Number(rawSubtotal) : NaN;
  if (subtotalText && (!isFinite(subtotal) || subtotal < 0)) throw new Error("Commission subtotal is not valid.");
  var rawRate = orderRow[32];
  var rate = Number(rawRate);
  if (rawRate === "" || rawRate === null || rawRate === undefined || !isFinite(rate) || rate < 0 || rate > 1) throw new Error("Commission rate snapshot is not valid.");
  var payment = String(orderRow[30] || "");
  var delivery = String(orderRow[31] || "");
  var explicitStatus = commissionStatus_(orderRow[34]);
  if (PAYMENT_STATUSES.indexOf(payment) === -1) throw new Error("Payment status is not valid.");
  if (DELIVERY_STATUSES.indexOf(delivery) === -1) throw new Error("Delivery status is not valid.");
  var eligible = payment === "Paid" && delivery === "Delivered" && isFinite(subtotal) && subtotal > 0;
  var voidFacts = isCommissionVoid_(payment, delivery);
  if (voidFacts && explicitStatus === "Paid") throw new Error("Paid commission cannot be refunded or voided.");
  if (!voidFacts && explicitStatus === "Paid" && !eligible) throw new Error("Paid commission is not eligible.");
  if (!voidFacts && explicitStatus === "Approved" && !eligible) throw new Error("Approved commission is not eligible.");
  if (!voidFacts && explicitStatus === "Eligible" && !eligible) throw new Error("Eligible commission is not eligible.");
  var status = voidFacts ? "Void" : (!explicitStatus || explicitStatus === "Pending" ? eligible ? "Eligible" : "Pending" : explicitStatus);
  var sourceAmountText = String(orderRow[33] == null ? "" : orderRow[33]).trim();
  var sourceAmount = sourceAmountText ? Number(orderRow[33]) : NaN;
  if (sourceAmountText && (!isFinite(sourceAmount) || sourceAmount < 0)) throw new Error("Commission amount is not valid.");
  var amount = status === "Void" ? 0 : status === "Paid"
    ? (isFinite(sourceAmount) ? Math.round(sourceAmount * 100) / 100 : eligible ? Math.round(subtotal * rate * 100) / 100 : NaN)
    : (status === "Eligible" || status === "Approved") && eligible ? Math.round(subtotal * rate * 100) / 100 : "";
  if (status === "Paid" && !isFinite(amount)) throw new Error("Paid commission amount is not known.");
  var payoutBatch = String(orderRow[35] || "");
  var payoutDate = orderRow[36] || "";
  if (status === "Paid" && (!payoutBatch || !payoutDate)) throw new Error("Paid commission payout is incomplete.");
  var month = retentionDate_(orderRow[2]) ? Utilities.formatDate(retentionDate_(orderRow[2]), Session.getScriptTimeZone(), "yyyy-MM") : Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM");
  var expected = [commissionId, neutralizeForSheet_(partnerId || code), neutralizeForSheet_(name), month, neutralizeForSheet_(orderRow[3] || ""),
    subtotalText ? subtotal : "", rate, amount, status, neutralizeForSheet_(payoutBatch), payoutDate, "", ""];
  if (matches.length === 1) return reconcileCommissionRecord_(sheet, matches[0], expected, index);
  try {
    sheet.appendRow(commissionWritePayload_(sheet, expected));
  } catch (appendError) {
    var after = sheet.getDataRange().getValues();
    var afterMatches = after.slice(1).filter(function (candidate) { return String(candidate[0]) === commissionId; });
    if (afterMatches.length === 1) return reconcileCommissionRecord_(sheet, afterMatches[0], expected, index);
    if (afterMatches.length > 1) throw new Error("Commission ledger has duplicate records.");
    throw appendError;
  }
  var finalValues = sheet.getDataRange().getValues();
  var finalMatches = finalValues.slice(1).filter(function (candidate) { return String(candidate[0]) === commissionId; });
  if (finalMatches.length === 1) return reconcileCommissionRecord_(sheet, finalMatches[0], expected, index);
  if (finalMatches.length > 1) throw new Error("Commission ledger has duplicate records.");
  throw new Error("Commission ledger write could not be verified.");
}

function commissionStatus_(value) {
  var status = String(value == null ? "" : value).trim();
  if (!status) return "";
  if (COMMISSION_STATUSES.indexOf(status) === -1) throw new Error("Commission status is not valid.");
  return status;
}

function isCommissionVoid_(payment, delivery) {
  return payment === "Refunded" || delivery === "Cancelled" || delivery === "Test";
}

function commissionMonthValue_(sheet, value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    var date = retentionDate_(value);
    return date ? Utilities.formatDate(date, sheet.getParent().getSpreadsheetTimeZone(), "yyyy-MM") : null;
  }
  return typeof value === "string" ? value : null;
}

function commissionWritePayload_(sheet, values) {
  var payload = values.slice();
  var month = commissionMonthValue_(sheet, payload[3]);
  if (month === null) throw new Error("Commission ledger month is not valid.");
  payload[3] = month ? "'" + month : month;
  return payload;
}

function reconcileCommissionRecord_(sheet, existing, expected, index) {
  [1, 2, 3, 4, 6].forEach(function (position) {
    var existingValue = position === 3 ? commissionMonthValue_(sheet, existing[position]) : typeof existing[position] === "string" ? neutralizeForSheet_(existing[position]) : existing[position];
    var expectedValue = typeof expected[position] === "string" ? neutralizeForSheet_(expected[position]) : expected[position];
    if (String(existingValue == null ? "" : existingValue) !== String(expectedValue == null ? "" : expectedValue)) throw new Error("Commission ledger snapshot mismatch.");
  });
  var currentStatus = commissionStatus_(existing[8]);
  if (!currentStatus) throw new Error("Commission ledger status is not valid.");
  var expectedStatus = commissionStatus_(expected[8]);
  var existingSubtotal = String(existing[5] == null ? "" : existing[5]).trim();
  var expectedSubtotal = String(expected[5] == null ? "" : expected[5]).trim();
  if (existingSubtotal && expectedSubtotal && Number(existing[5]) !== Number(expected[5])) throw new Error("Commission ledger snapshot mismatch.");
  if ((currentStatus === "Paid" || currentStatus === "Void") && existingSubtotal !== expectedSubtotal) throw new Error("Commission ledger snapshot mismatch.");
  if (String(existing[7] == null ? "" : existing[7]) !== String(expected[7] == null ? "" : expected[7]) && (currentStatus === "Paid" || currentStatus === "Void") && String(expected[7] == null ? "" : expected[7]) !== "") throw new Error("Commission amount mismatch.");
  if (String(existing[9] == null ? "" : existing[9]) !== String(expected[9] == null ? "" : expected[9]) && (currentStatus === "Paid" || currentStatus === "Void") && String(expected[9] || "").trim()) throw new Error("Payout batch mismatch.");
  if (String(existing[10] == null ? "" : existing[10]) !== String(expected[10] == null ? "" : expected[10]) && (currentStatus === "Paid" || currentStatus === "Void") && expected[10]) throw new Error("Payout date mismatch.");
  if (currentStatus === "Paid" || currentStatus === "Void") {
    if (expectedStatus !== currentStatus && ["Pending", "Eligible", "Approved"].indexOf(expectedStatus) !== -1) return existing;
    if (expectedStatus !== currentStatus) throw new Error("Commission ledger frozen status mismatch.");
    return existing;
  }
  if (!existingSubtotal && expectedSubtotal) {
    // An unresolved Pending row can learn its first final subtotal exactly once.
  } else if (existingSubtotal && !expectedSubtotal) {
    expected[5] = existing[5];
  }
  var nextStatus = expectedStatus;
  if (expectedStatus === "Pending" && (currentStatus === "Eligible" || currentStatus === "Approved")) nextStatus = currentStatus;
  if (currentStatus === "Approved" && expectedStatus === "Eligible") nextStatus = "Approved";
  var merged = existing.slice().map(function (value) { return typeof value === "string" ? neutralizeForSheet_(value) : value; });
  merged[3] = expected[3];
  if (!existingSubtotal && expectedSubtotal) merged[5] = expected[5];
  merged[8] = nextStatus;
  if (nextStatus === "Void") merged[7] = 0;
  else if (String(existing[7] == null ? "" : existing[7]) !== "" && String(expected[7] == null ? "" : expected[7]) !== "" && Number(existing[7]) !== Number(expected[7])) throw new Error("Commission amount mismatch.");
  else if (String(existing[7] == null ? "" : existing[7]) === "" && String(expected[7] == null ? "" : expected[7]) !== "") merged[7] = expected[7];
  if ((nextStatus === "Paid" || nextStatus === "Void") && String(expected[9] || "").trim() && !String(existing[9] || "").trim()) merged[9] = expected[9];
  if ((nextStatus === "Paid" || nextStatus === "Void") && expected[10] && !existing[10]) merged[10] = expected[10];
  if (merged.join("\u001f") !== existing.join("\u001f")) {
    sheet.getRange(commissionRowNumber_(sheet, expected[0]), 1, 1, COMMISSION_HEADERS.length).setValues([commissionWritePayload_(sheet, merged)]);
    var verified = sheet.getDataRange().getValues().filter(function (candidate) { return String(candidate[0]) === String(expected[0]); });
    if (verified.length !== 1 || verified[0].join("\u001f") !== merged.join("\u001f")) throw new Error("Commission ledger update could not be verified.");
    return verified[0];
  }
  return existing;
}

function commissionRowNumber_(sheet, commissionId) {
  var values = sheet.getDataRange().getValues();
  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) if (String(values[rowIndex][0]) === String(commissionId)) return rowIndex + 1;
  throw new Error("Commission ledger row was not found.");
}

function purgePartnerRecords_(now, properties) {
  var deletedRows = 0;
  var errors = 0;
  try {
    var applications = openPartnerTab_(properties, "PARTNER_APPLICATIONS_SHEET_TAB", "Partner Applications");
    ensurePartnerTabSchema_(applications, PARTNER_APPLICATION_HEADERS);
    var appValues = applications.getDataRange().getValues();
    var appIndex = headerIndex_(appValues[0].map(String));
    for (var appRow = appValues.length - 1; appRow >= 1; appRow -= 1) {
      var received = retentionDate_(appValues[appRow][appIndex["Received at"]]);
      var reviewed = retentionDate_(appValues[appRow][appIndex["Reviewed at"]]);
      var status = String(appValues[appRow][appIndex.Status] || "Pending");
      var expiry = status === "Approved" ? (reviewed && new Date(reviewed.getTime() + 7 * 24 * 60 * 60 * 1000)) : status === "Rejected" || status === "Withdrawn" ? (reviewed && new Date(reviewed.getTime() + RETENTION_MILLISECONDS)) : (received && new Date(received.getTime() + RETENTION_MILLISECONDS));
      var partnerId = String(appValues[appRow][appIndex["Partner ID"]] || "").trim();
      var approvedTransfer = status !== "Approved" ? true : Boolean(partnerId && partnerTransferVerified_(partnerId, properties, appValues[appRow], appIndex));
      if (expiry && expiry.getTime() <= now.getTime() && approvedTransfer) {
        applications.deleteRow(appRow + 1);
        deletedRows += 1;
      } else if (status === "Approved" && !approvedTransfer) errors += 1;
      else if ((status === "Approved" || status === "Rejected" || status === "Withdrawn") && !reviewed) errors += 1;
      else if (status === "Pending" && !received) errors += 1;
    }
  } catch (applicationError) { errors += 1; }
  try {
    var partners = openPartnerTab_(properties, "PARTNERS_SHEET_TAB", "Partners");
    ensurePartnerTabSchema_(partners, PARTNER_HEADERS);
    var partnerValues = partners.getDataRange().getValues();
    var partnerIndex = headerIndex_(partnerValues[0].map(String));
    for (var partnerRow = 1; partnerRow < partnerValues.length; partnerRow += 1) {
      var closedRaw = partnerValues[partnerRow][partnerIndex["Closed at"]];
      var closed = retentionDate_(closedRaw);
      var partnerStatus = String(partnerValues[partnerRow][partnerIndex.Status] || "");
      if (partnerStatus === "Closed" && !closed) { errors += 1; continue; }
      if (partnerStatus === "Closed" && closed && closed.getTime() + RETENTION_MILLISECONDS <= now.getTime()) {
        ["Contact name", "City / service area", "Phone / WhatsApp", "Email", "Instagram / website", "Staff notes"].forEach(function (field) {
          if (partnerIndex[field] !== undefined) partners.getRange(partnerRow + 1, partnerIndex[field] + 1).setValue("");
        });
      }
    }
  } catch (partnerError) { errors += 1; }
  if (errors) throw new Error("Partner retention cleanup failed.");
  return { deletedRows: deletedRows };
}

function partnerTransferVerified_(partnerId, properties, applicationRow, applicationIndex) {
  if (!applicationRow || !applicationIndex || String(applicationRow[applicationIndex.Status] || "") !== "Approved" || applicationRow[applicationIndex["Rules accepted"]] !== true || !String(applicationRow[applicationIndex["Referral plan"]] || "").trim()) return false;
  var partners = openPartnerTab_(properties, "PARTNERS_SHEET_TAB", "Partners");
  ensurePartnerTabSchema_(partners, PARTNER_HEADERS);
  var values = partners.getDataRange().getValues();
  var index = headerIndex_(values[0].map(String));
  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    var row = values[rowIndex];
    if (String(row[index["Partner ID"]] || "").trim() !== partnerId) continue;
    var code = normalizeReferralCode_(row[index["Referral code"]]);
    var link = String(row[index["Referral link"]] || "");
    var required = ["Partner display name", "Contact name", "Category", "City / service area", "Phone / WhatsApp"];
    var complete = required.every(function (field) { return String(row[index[field]] == null ? "" : row[index[field]]).trim(); });
    var displayName = String(row[index["Partner display name"]] || "");
    var applicationName = String(applicationRow[applicationIndex["Business name"]] || "");
    var applicantName = String(applicationRow[applicationIndex["Applicant name"]] || "");
    var copied = (displayName === applicationName || displayName === applicantName) &&
      String(row[index["Contact name"]] || "") === String(applicationRow[applicationIndex["Applicant name"]] || "") &&
      String(row[index.Category] || "") === String(applicationRow[applicationIndex.Category] || "") &&
      String(row[index["City / service area"]] || "") === String(applicationRow[applicationIndex["City / service area"]] || "") &&
      String(row[index["Phone / WhatsApp"]] || "") === String(applicationRow[applicationIndex["Phone / WhatsApp"]] || "") &&
      String(row[index.Email] || "") === String(applicationRow[applicationIndex.Email] || "") &&
      String(row[index["Instagram / website"]] || "") === String(applicationRow[applicationIndex["Instagram / website"]] || "");
    var rate = Number(row[index["Commission rate"]]);
    var approvedAt = retentionDate_(row[index["Approved at"]]);
    return Boolean(code && link === "https://saloniresinart.com/?ref=" + encodeURIComponent(code) && complete && copied && isFinite(rate) && rate >= 0 && rate <= 1 && approvedAt);
  }
  return false;
}

function retentionFilesForRequest_(folder, requestId) {
  var files = [];
  ["jpg", "png"].forEach(function (extension) {
    var iterator = folder.getFilesByName("order-" + requestId + "." + extension);
    while (iterator.hasNext()) files.push(iterator.next());
  });
  return files;
}

function permanentlyDeleteFile_(file) {
  var fileId = String(file.getId() || "");
  if (!fileId) throw new Error("Retention file has no ID.");
  Drive.Files.remove(fileId);
}

function retentionDate_(value) {
  if (Object.prototype.toString.call(value) !== "[object Date]" || isNaN(value.getTime())) return null;
  return new Date(value.getTime());
}

function submitOrder(form) {
  var properties = PropertiesService.getScriptProperties();
  if (isTrue_(properties.getProperty("ORDER_FORM_DISABLED"))) {
    return validationFailure_({ form: "Order requests are paused. Please contact Saloni directly." });
  }

  var payload = collectPayload_(form || {});
  var validation = validatePayload_(payload);
  if (Object.keys(validation.errors).length) return validationFailure_(validation.errors);

  var captcha = verifyCaptcha_(payload.captchaToken, properties);
  if (!captcha.ok) return validationFailure_({ captcha: captcha.error });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Unable to confirm order request.");

  try {
    var sheet = openOrderSheet_(properties);
    var fingerprint = payloadFingerprint_(payload);
    var existing = findRequest_(sheet, payload.requestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return validationFailure_({ requestId: "Request ID conflict: these details differ from the saved request. Start another request." });
      }
      return {
        ok: true, requestId: payload.requestId, receivedAt: existing.receivedAt,
        referralCode: existing.referralCode, partnerName: existing.partnerName,
        referralStatus: existing.partnerId ? "active" : "invalid"
      };
    }
    if (dailyCapReached_(sheet, properties)) {
      return validationFailure_({ form: "The studio's daily request limit has been reached. Please try again tomorrow." });
    }

    var attribution = null;
    if (payload.referralCode) attribution = resolveReferralForOrder_(payload.referralCode, properties);
    var schemaLength = orderSchemaLength_(sheet);
    if (attribution && attribution.active && schemaLength === LEGACY_ORDER_HEADERS.length) {
      throw new Error("Partner referral setup is not complete.");
    }
    var referenceFile = null;
    try {
      referenceFile = createReferenceFile_(payload);
      var receivedAt = new Date();
      var rowNumber = Number(sheet.getLastRow && sheet.getLastRow()) + 1;
      var row = schemaLength === ORDER_HEADERS.length
        ? rowForPayload_(payload, fingerprint, receivedAt, referenceFile, attribution || { active: false }, rowNumber)
        : rowForPayload_(payload, fingerprint, receivedAt, referenceFile);
      sheet.appendRow(row);
      return {
        ok: true, requestId: payload.requestId, receivedAt: receivedAt.toISOString(),
        referralCode: attribution && attribution.active ? attribution.code : "",
        partnerName: attribution && attribution.active ? attribution.displayName : "",
        referralStatus: attribution && attribution.active ? "active" : payload.referralCode ? attribution.status : "invalid"
      };
    } catch (appendError) {
      // appendRow can persist a row and still throw. Reconcile before touching
      // the file so a successful write is never orphaned by cleanup.
      var afterAppend;
      try {
        afterAppend = findRequest_(sheet, payload.requestId);
      } catch (reconciliationError) {
        // The outcome is unknown. Keep the file for staff reconciliation.
        throw new Error("Unable to confirm order request.");
      }
      if (afterAppend) {
        if (afterAppend.fingerprint === fingerprint) {
          return {
            ok: true, requestId: payload.requestId, receivedAt: afterAppend.receivedAt,
            referralCode: afterAppend.referralCode, partnerName: afterAppend.partnerName,
            referralStatus: afterAppend.partnerId ? "active" : "invalid"
          };
        }
        // A conflicting row is evidence that a write occurred; do not trash
        // the newly-created file when the row/file relationship is uncertain.
        throw new Error("Unable to confirm order request.");
      }
      if (referenceFile) {
        try {
          referenceFile.setTrashed(true);
        } catch (cleanupError) {
          // Do not hide cleanup failure behind a false success.
          throw new Error("Unable to confirm order request.");
        }
      }
      throw appendError;
    }
  } catch (error) {
    throw new Error("Unable to confirm order request.");
  } finally {
    lock.releaseLock();
  }
}

function submitPartnerApplication(form) {
  var properties = PropertiesService.getScriptProperties();
  if (isTrue_(properties.getProperty("PARTNER_FORM_DISABLED"))) {
    return validationFailure_({ form: "Partner applications are paused. Please contact Saloni directly." });
  }
  var payload = collectApplication_(form || {});
  var validation = validateApplication_(payload);
  if (Object.keys(validation).length) return validationFailure_(validation);
  var captcha = verifyCaptcha_(payload.captchaToken, properties, PARTNER_APPLICATION_CAPTCHA_ACTION);
  if (!captcha.ok) return validationFailure_({ captcha: captcha.error });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Unable to receive the partner application.");
  try {
    var sheet = openPartnerTab_(properties, "PARTNER_APPLICATIONS_SHEET_TAB", "Partner Applications");
    ensurePartnerTabSchema_(sheet, PARTNER_APPLICATION_HEADERS);
    var fingerprint = applicationFingerprint_(payload);
    var existing = findApplication_(sheet, payload.applicationId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) return validationFailure_({ applicationId: "Application ID conflict: these details differ from the saved application." });
      return { ok: true, applicationId: payload.applicationId, receivedAt: existing.receivedAt };
    }
    if (partnerDailyCapReached_(sheet, properties)) return validationFailure_({ form: "The studio's partner application limit has been reached. Please try again tomorrow." });
    var receivedAt = new Date();
    var row = [
      neutralizeForSheet_(payload.applicationId), receivedAt, neutralizeForSheet_(payload.applicantName),
      neutralizeForSheet_(payload.businessName), neutralizeForSheet_(payload.category), neutralizeForSheet_(payload.serviceArea),
      neutralizeForSheet_(payload.phone), neutralizeForSheet_(payload.email), neutralizeForSheet_(payload.website),
      neutralizeForSheet_(payload.typicalCustomers), neutralizeForSheet_(payload.referralPlan), true, "Pending", "", "",
      neutralizeForSheet_(fingerprint), ""
    ];
    try {
      sheet.appendRow(row);
    } catch (appendError) {
      var afterAppend = findApplication_(sheet, payload.applicationId);
      if (afterAppend && afterAppend.fingerprint === fingerprint) return { ok: true, applicationId: payload.applicationId, receivedAt: afterAppend.receivedAt };
      if (afterAppend) return validationFailure_({ applicationId: "Application ID conflict: these details differ from the saved application." });
      throw appendError;
    }
    return { ok: true, applicationId: payload.applicationId, receivedAt: receivedAt.toISOString() };
  } catch (error) {
    throw new Error("Unable to receive the partner application.");
  } finally {
    lock.releaseLock();
  }
}

function submitCorporateEnquiry(form) {
  var properties = PropertiesService.getScriptProperties();
  if (isTrue_(properties.getProperty("CORPORATE_FORM_DISABLED"))) {
    return validationFailure_({ form: "Organisation enquiries are paused. Please contact Saloni directly." });
  }
  if (!corporateProgramConfigured_(properties)) throw new Error("Unable to receive the organisation enquiry.");
  var payload = collectCorporateEnquiry_(form || {});
  var validation = validateCorporateEnquiry_(payload);
  if (Object.keys(validation).length) return validationFailure_(validation);
  var captcha = verifyCaptcha_(payload.captchaToken, properties, CORPORATE_ENQUIRY_CAPTCHA_ACTION);
  if (!captcha.ok) return validationFailure_({ captcha: captcha.error });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Unable to receive the organisation enquiry.");
  try {
    var sheet = openCorporateTab_(properties, true);
    ensureCorporateTabSchema_(sheet, false);
    var fingerprint = corporateEnquiryFingerprint_(payload);
    var existing = findCorporateEnquiry_(sheet, payload.enquiryId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) return validationFailure_({ enquiryId: "Enquiry ID conflict: these details differ from the saved enquiry." });
      return { ok: true, enquiryId: payload.enquiryId, receivedAt: existing.receivedAt };
    }
    if (corporateDailyCapReached_(sheet, properties)) return validationFailure_({ form: "The studio's organisation enquiry limit has been reached. Please try again tomorrow." });
    var receivedAt = new Date();
    var row = [
      neutralizeForSheet_(payload.enquiryId), receivedAt, neutralizeForSheet_(payload.organisationName),
      neutralizeForSheet_(payload.contactName), neutralizeForSheet_(payload.phone), neutralizeForSheet_(payload.email),
      neutralizeForSheet_(payload.enquiryType), neutralizeForSheet_(payload.occasion),
      payload.approximateQuantity === "" ? "" : Number(payload.approximateQuantity),
      neutralizeForSheet_(payload.budgetRange), neutralizeForSheet_(payload.requiredDate),
      neutralizeForSheet_(payload.deliveryScope), neutralizeForSheet_(payload.brief), true, "New enquiry", "",
      neutralizeForSheet_(fingerprint)
    ];
    try {
      sheet.appendRow(row);
    } catch (appendError) {
      var afterAppend;
      try { afterAppend = findCorporateEnquiry_(sheet, payload.enquiryId); }
      catch (reconciliationError) { throw new Error("Unable to confirm organisation enquiry."); }
      if (afterAppend && afterAppend.fingerprint === fingerprint) return { ok: true, enquiryId: payload.enquiryId, receivedAt: afterAppend.receivedAt };
      if (afterAppend) return validationFailure_({ enquiryId: "Enquiry ID conflict: these details differ from the saved enquiry." });
      throw appendError;
    }
    return { ok: true, enquiryId: payload.enquiryId, receivedAt: receivedAt.toISOString() };
  } catch (error) {
    if (error && error.message && /Enquiry ID conflict/.test(error.message)) throw error;
    throw new Error("Unable to receive the organisation enquiry.");
  } finally {
    lock.releaseLock();
  }
}

function collectCorporateEnquiry_(form) {
  return {
    enquiryId: stringValue_(form.enquiryId), organisationName: stringValue_(form.organisationName),
    contactName: stringValue_(form.contactName), phone: stringValue_(form.phone), email: stringValue_(form.email),
    enquiryType: stringValue_(form.enquiryType), occasion: stringValue_(form.occasion),
    approximateQuantity: stringValue_(form.approximateQuantity), budgetRange: stringValue_(form.budgetRange),
    requiredDate: stringValue_(form.requiredDate), deliveryScope: stringValue_(form.deliveryScope),
    brief: stringValue_(form.brief), privacyAccepted: isTrue_(form.privacyAccepted),
    captchaToken: stringValue_(form.captchaToken)
  };
}

function validateCorporateEnquiry_(payload) {
  var errors = {};
  if (!/^[A-Za-z0-9_-]{12,80}$/.test(payload.enquiryId)) errors.enquiryId = "Please reload the form and try again.";
  bounded_(errors, "organisationName", payload.organisationName, 160, true);
  bounded_(errors, "contactName", payload.contactName, 120, true);
  if (!payload.phone || payload.phone.length > 40 || (payload.phone.match(/[0-9]/g) || []).length < 7) errors.phone = "Enter a valid phone or WhatsApp number.";
  if (payload.email && (payload.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))) errors.email = "Enter a valid email address or leave it blank.";
  if (["one-off", "recurring", "exploring"].indexOf(payload.enquiryType) === -1) errors.enquiryType = "Choose the type of gifting enquiry.";
  if (["festival", "employee birthday", "5-year milestone", "10-year milestone", "event", "mixed occasions", "other"].indexOf(payload.occasion) === -1) errors.occasion = "Choose the occasion that fits best.";
  if (payload.approximateQuantity && (!/^\d{1,9}$/.test(payload.approximateQuantity) || Number(payload.approximateQuantity) < 1)) errors.approximateQuantity = "Enter a positive whole number, or leave it blank.";
  bounded_(errors, "budgetRange", payload.budgetRange, 120, false);
  if (payload.requiredDate && !isIsoDate_(payload.requiredDate)) errors.requiredDate = "Use a valid required date.";
  bounded_(errors, "deliveryScope", payload.deliveryScope, 300, true);
  bounded_(errors, "brief", payload.brief, 1000, true);
  if (payload.privacyAccepted !== true) errors.privacyAccepted = "Accept the privacy notice to send an enquiry.";
  return errors;
}

function corporateEnquiryFingerprint_(payload) {
  return digestHex_(JSON.stringify({
    enquiryId: payload.enquiryId, organisationName: payload.organisationName, contactName: payload.contactName,
    phone: payload.phone, email: payload.email, enquiryType: payload.enquiryType, occasion: payload.occasion,
    approximateQuantity: payload.approximateQuantity, budgetRange: payload.budgetRange, requiredDate: payload.requiredDate,
    deliveryScope: payload.deliveryScope, brief: payload.brief, privacyAccepted: payload.privacyAccepted
  }));
}

function findCorporateEnquiry_(sheet, enquiryId) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  var match = null;
  for (var index = 1; index < values.length; index += 1) {
    if (String(values[index][0]) !== enquiryId) continue;
    if (match) throw new Error("Corporate enquiry ID is duplicated.");
    match = {
      fingerprint: String(values[index][16] || ""),
      receivedAt: values[index][1] instanceof Date ? values[index][1].toISOString() : String(values[index][1])
    };
  }
  return match;
}

function corporateDailyCapReached_(sheet, properties) {
  var configured = Number(properties.getProperty("CORPORATE_DAILY_ACCEPTANCE_CAP"));
  var cap = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_CORPORATE_DAILY_ACCEPTANCE_CAP;
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var values = sheet.getDataRange().getValues();
  var count = 0;
  for (var index = 1; index < values.length; index += 1) {
    var received = values[index][1];
    if (received && Utilities.formatDate(new Date(received), Session.getScriptTimeZone(), "yyyy-MM-dd") === today) count += 1;
  }
  return count >= cap;
}

function corporateProgramConfig_(properties) {
  var sheetId = String(properties.getProperty("ORDER_SHEET_ID") || "").trim();
  return sheetId ? { sheetId: sheetId, tabName: "Corporate Enquiries" } : null;
}

function corporateProgramConfigured_(properties) {
  return Boolean(corporateProgramConfig_(properties) && isTrue_(properties.getProperty(CORPORATE_PROGRAM_READY_PROPERTY)));
}

function setupCorporateGifting() {
  var activeEmail = String(Session.getActiveUser().getEmail() || "").trim();
  var effectiveEmail = String(Session.getEffectiveUser().getEmail() || "").trim();
  if (!activeEmail || activeEmail.toLowerCase() !== effectiveEmail.toLowerCase()) throw new Error("Run this setup as the deployment owner.");
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Unable to start corporate setup.");
  try {
    var properties = PropertiesService.getScriptProperties();
    var config = corporateProgramConfig_(properties);
    if (!config) throw new Error("Corporate sheet is not configured.");
    var spreadsheet = SpreadsheetApp.openById(config.sheetId);
    var sheet = spreadsheet.getSheetByName(config.tabName);
    if (!sheet && spreadsheet.insertSheet) sheet = spreadsheet.insertSheet(config.tabName);
    if (!sheet) throw new Error("Corporate sheet tab is not configured.");
    ensureCorporateTabSchema_(sheet);
    if (!protectCorporateTab_(sheet)) throw new Error("Unable to protect corporate sheet tab.");
    if (properties.setProperty) properties.setProperty(CORPORATE_PROGRAM_READY_PROPERTY, "true");
    return { tab: config.tabName, columns: CORPORATE_ENQUIRY_HEADERS.length };
  } finally { lock.releaseLock(); }
}

function collectApplication_(form) {
  return {
    applicationId: stringValue_(form.applicationId), applicantName: stringValue_(form.applicantName),
    businessName: stringValue_(form.businessName), category: stringValue_(form.category),
    serviceArea: stringValue_(form.serviceArea), phone: stringValue_(form.phone), email: stringValue_(form.email),
    website: stringValue_(form.website), typicalCustomers: stringValue_(form.typicalCustomers),
    referralPlan: stringValue_(form.referralPlan), rulesAccepted: isTrue_(form.rulesAccepted),
    captchaToken: stringValue_(form.captchaToken)
  };
}

function validateApplication_(payload) {
  var errors = {};
  if (!/^[A-Za-z0-9_-]{12,80}$/.test(payload.applicationId)) errors.applicationId = "Please reload the form and try again.";
  bounded_(errors, "applicantName", payload.applicantName, 120, true);
  bounded_(errors, "businessName", payload.businessName, 160, true);
  bounded_(errors, "serviceArea", payload.serviceArea, 160, true);
  bounded_(errors, "typicalCustomers", payload.typicalCustomers, 1000, true);
  bounded_(errors, "referralPlan", payload.referralPlan, 1000, true);
  if (["photographer", "planner", "decorator", "florist", "gift shop", "creator", "other"].indexOf(payload.category.toLowerCase()) === -1) errors.category = "Choose a partner category.";
  if (!payload.phone || payload.phone.length > 40 || (payload.phone.match(/[0-9]/g) || []).length < 7) errors.phone = "Enter a valid phone number.";
  if (payload.email && (payload.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))) errors.email = "Enter a valid email address or leave it blank.";
  if (payload.website && (payload.website.length > 500 || !/^https?:\/\/[^\s]+$/i.test(payload.website))) errors.website = "Use an http or https website address, or leave it blank.";
  if (payload.rulesAccepted !== true) errors.rulesAccepted = "Accept the partner rules and privacy notice to apply.";
  return errors;
}

function applicationFingerprint_(payload) {
  return digestHex_(JSON.stringify({
    applicationId: payload.applicationId, applicantName: payload.applicantName, businessName: payload.businessName,
    category: payload.category, serviceArea: payload.serviceArea, phone: payload.phone, email: payload.email,
    website: payload.website, typicalCustomers: payload.typicalCustomers, referralPlan: payload.referralPlan,
    rulesAccepted: payload.rulesAccepted
  }));
}

function findApplication_(sheet, applicationId) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  for (var index = 1; index < values.length; index += 1) {
    if (String(values[index][0]) === applicationId) return {
      fingerprint: String(values[index][15] || ""),
      receivedAt: values[index][1] instanceof Date ? values[index][1].toISOString() : String(values[index][1])
    };
  }
  return null;
}

function partnerDailyCapReached_(sheet, properties) {
  var configured = Number(properties.getProperty("PARTNER_DAILY_ACCEPTANCE_CAP"));
  var cap = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_PARTNER_DAILY_ACCEPTANCE_CAP;
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var values = sheet.getDataRange().getValues();
  var count = 0;
  for (var index = 1; index < values.length; index += 1) {
    var received = values[index][1];
    if (received && Utilities.formatDate(new Date(received), Session.getScriptTimeZone(), "yyyy-MM-dd") === today) count += 1;
  }
  return count >= cap;
}

function setupPartnerProgram() {
  var activeEmail = String(Session.getActiveUser().getEmail() || "").trim();
  var effectiveEmail = String(Session.getEffectiveUser().getEmail() || "").trim();
  if (!activeEmail || activeEmail.toLowerCase() !== effectiveEmail.toLowerCase()) throw new Error("Run this setup as the deployment owner.");
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Unable to start partner setup.");
  try { return setupPartnerProgram_(); } finally { lock.releaseLock(); }
}

function setupPartnerProgram_() {
  var properties = PropertiesService.getScriptProperties();
  var orderSheet = openOrderSheet_(properties);
  migrateOrdersSchema_(orderSheet);
  var config = partnerProgramConfig_(properties);
  if (!config) throw new Error("Partner sheet is not configured.");
  var spreadsheet = SpreadsheetApp.openById(config.sheetId);
  var tabs = [
    [config.applicationsTab, PARTNER_APPLICATION_HEADERS], [config.partnersTab, PARTNER_HEADERS], [config.commissionsTab, COMMISSION_HEADERS]
  ];
  tabs.forEach(function (entry) {
    var sheet = spreadsheet.getSheetByName(entry[0]);
    if (!sheet && spreadsheet.insertSheet) sheet = spreadsheet.insertSheet(entry[0]);
    if (!sheet) throw new Error("Partner sheet tab is not configured: " + entry[0]);
    ensurePartnerTabSchema_(sheet, entry[1]);
    if (!protectPartnerTab_(sheet, entry[0])) throw new Error("Unable to protect partner sheet tab: " + entry[0]);
  });
  if (!protectPartnerOrderColumns_(orderSheet)) throw new Error("Unable to protect order partner columns.");
  if (properties.setProperty) properties.setProperty(PARTNER_PROGRAM_READY_PROPERTY, "true");
  return { orderColumns: ORDER_HEADERS.length, tabs: tabs.map(function (entry) { return entry[0]; }) };
}

function protectPartnerOrderColumns_(sheet) {
  return protectRange_(sheet, LEGACY_ORDER_HEADERS.length + 1, PARTNER_ORDER_HEADERS.length, "Partner attribution and payout fields: staff-only");
}

function protectPartnerTab_(sheet, description) {
  return protectRange_(sheet, 1, sheet.getLastColumn(), description + ": staff-only");
}

function protectRange_(sheet, startColumn, columnCount, description) {
  if (!sheet.getRange || !sheet.getMaxRows || !columnCount) return false;
  try {
    var targetRange = sheet.getRange(1, startColumn, sheet.getMaxRows(), columnCount);
    var protection = null;
    if (sheet.getProtections && SpreadsheetApp.ProtectionType && SpreadsheetApp.ProtectionType.RANGE) {
      var existing = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE) || [];
      for (var protectionIndex = 0; protectionIndex < existing.length; protectionIndex += 1) {
        if (existing[protectionIndex].getDescription && existing[protectionIndex].getDescription() === description) {
          protection = existing[protectionIndex];
          break;
        }
      }
    }
    if (!protection) protection = targetRange.protect();
    if (protection.setRange) protection.setRange(targetRange);
    if (!protection || !protection.setWarningOnly || !protection.removeEditors || !protection.addEditor) return false;
    protection.setWarningOnly(false);
    var owner = Session.getEffectiveUser();
    if (!owner || !owner.getEmail || !String(owner.getEmail() || "").trim()) return false;
    var ownerEmail = String(owner.getEmail()).trim().toLowerCase();
    var editors = protection.getEditors ? protection.getEditors().filter(function (editor) {
      return !editor || !editor.getEmail || String(editor.getEmail() || "").trim().toLowerCase() !== ownerEmail;
    }) : [];
    if (editors.length) protection.removeEditors(editors);
    protection.addEditor(owner);
    if (protection.canDomainEdit && protection.canDomainEdit() && protection.setDomainEdit) protection.setDomainEdit(false);
    if (protection.setDescription) protection.setDescription(description);
    return true;
  } catch (error) { return false; }
}

function approvePartner_(applicationId, partnerFields) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Unable to approve partner.");
  try {
    var properties = PropertiesService.getScriptProperties();
    var applications = openPartnerTab_(properties, "PARTNER_APPLICATIONS_SHEET_TAB", "Partner Applications");
    var partners = openPartnerTab_(properties, "PARTNERS_SHEET_TAB", "Partners");
    ensurePartnerTabSchema_(applications, PARTNER_APPLICATION_HEADERS);
    ensurePartnerTabSchema_(partners, PARTNER_HEADERS);
    var values = applications.getDataRange().getValues();
    var index = headerIndex_(values[0].map(String));
    var matches = [];
    for (var i = 1; i < values.length; i += 1) if (String(values[i][index["Application ID"]]) === String(applicationId)) matches.push({ row: i + 1, values: values[i] });
    if (matches.length !== 1) throw new Error(matches.length ? "Partner application ID is duplicated." : "Partner application was not found.");
    var found = matches[0];
    var fields = partnerFields || {};
    var code = normalizeReferralCode_(fields.referralCode);
    var partnerId = "partner-" + String(applicationId);
    var displayName = String(found.values[index["Business name"]] || found.values[index["Applicant name"]] || "").trim();
    var rate = Number(fields.rate == null ? 0.05 : fields.rate);
    if (!PARTNER_CODE_PATTERN.test(code) || !displayName || !isFinite(rate) || rate < 0 || rate > 1) throw new Error("Partner approval values are not valid.");
    var partnerValues = partners.getDataRange().getValues();
    var partnerIndex = headerIndex_(partnerValues[0].map(String));
    var partnerMatches = [];
    for (var rowIndex = 1; rowIndex < partnerValues.length; rowIndex += 1) {
      var candidate = partnerValues[rowIndex];
      if (String(candidate[partnerIndex["Partner ID"]]) === partnerId || String(candidate[partnerIndex["Referral code"]]).toUpperCase() === code) partnerMatches.push({ row: rowIndex + 1, values: candidate });
    }
    if (partnerMatches.length > 1) throw new Error("Partner ID or referral code is duplicated.");
    var intended = [neutralizeForSheet_(partnerId), neutralizeForSheet_(code), neutralizeForSheet_(displayName), neutralizeForSheet_(String(found.values[index["Applicant name"]] || "")), neutralizeForSheet_(String(found.values[index.Category] || "")), neutralizeForSheet_(String(found.values[index["City / service area"]] || "")), neutralizeForSheet_(String(found.values[index["Phone / WhatsApp"]] || "")), neutralizeForSheet_(String(found.values[index.Email] || "")), neutralizeForSheet_(String(found.values[index["Instagram / website"]] || "")), rate];
    var existingPartner = partnerMatches.length ? partnerMatches[0].values : null;
    if (existingPartner && !partnerApprovalMatches_(existingPartner, intended, partnerIndex)) throw new Error("Existing partner approval conflicts with the requested fields.");
    var approvedAt = existingPartner && retentionDate_(existingPartner[partnerIndex["Approved at"]]) || new Date();
    if (!existingPartner) {
      var partnerRow = [neutralizeForSheet_(partnerId), neutralizeForSheet_(code), neutralizeForSheet_(displayName), neutralizeForSheet_(found.values[index["Applicant name"]]),
        neutralizeForSheet_(found.values[index.Category]), neutralizeForSheet_(found.values[index["City / service area"]]), neutralizeForSheet_(found.values[index["Phone / WhatsApp"]]), neutralizeForSheet_(found.values[index.Email]),
        neutralizeForSheet_(found.values[index["Instagram / website"]]), rate, "Active", approvedAt, "https://saloniresinart.com/?ref=" + encodeURIComponent(code), neutralizeForSheet_(fields.staffNotes || ""), ""];
      try {
        partners.appendRow(partnerRow);
      } catch (appendError) {
        var afterValues = partners.getDataRange().getValues();
        var afterMatches = afterValues.slice(1).filter(function (candidate) { return String(candidate[partnerIndex["Partner ID"]]) === partnerId && String(candidate[partnerIndex["Referral code"]]).toUpperCase() === code; });
        if (afterMatches.length !== 1 || !partnerApprovalMatches_(afterMatches[0], intended, partnerIndex)) throw appendError;
        existingPartner = afterMatches[0];
        approvedAt = retentionDate_(existingPartner[partnerIndex["Approved at"]]) || approvedAt;
      }
    }
    var currentStatus = String(found.values[index.Status] || "");
    var currentPartnerId = String(found.values[index["Partner ID"]] || "");
    if (currentStatus === "Approved" && currentPartnerId && currentPartnerId !== partnerId) throw new Error("Application is already linked to another partner.");
    var applicationUpdated = found.values.slice().map(function (value) { return typeof value === "string" ? neutralizeForSheet_(value) : value; });
    applicationUpdated[index.Status] = "Approved";
    applicationUpdated[index["Review notes"]] = currentStatus === "Approved" ? applicationUpdated[index["Review notes"]] : neutralizeForSheet_(fields.reviewNotes || "");
    applicationUpdated[index["Reviewed at"]] = currentStatus === "Approved" && retentionDate_(applicationUpdated[index["Reviewed at"]]) || approvedAt;
    applicationUpdated[index["Partner ID"]] = neutralizeForSheet_(partnerId);
    applications.getRange(found.row, 1, 1, PARTNER_APPLICATION_HEADERS.length).setValues([applicationUpdated]);
    var verifiedApplication = applications.getDataRange().getValues()[found.row - 1];
    if (!verifiedApplication || String(verifiedApplication[index.Status]) !== "Approved" || String(verifiedApplication[index["Partner ID"]]) !== String(applicationUpdated[index["Partner ID"]])) throw new Error("Partner approval link could not be verified.");
    return { partnerId: partnerId, code: code };
  } finally {
    lock.releaseLock();
  }
}

function partnerApprovalMatches_(row, intended, index) {
  return neutralizeForSheet_(String(row[index["Partner ID"]] || "")) === intended[0] && neutralizeForSheet_(String(row[index["Referral code"]] || "").toUpperCase()) === intended[1] &&
    neutralizeForSheet_(String(row[index["Partner display name"]] || "")) === intended[2] && neutralizeForSheet_(String(row[index["Contact name"]] || "")) === intended[3] &&
    neutralizeForSheet_(String(row[index.Category] || "")) === intended[4] && neutralizeForSheet_(String(row[index["City / service area"]] || "")) === intended[5] &&
    neutralizeForSheet_(String(row[index["Phone / WhatsApp"]] || "")) === intended[6] && neutralizeForSheet_(String(row[index.Email] || "")) === intended[7] &&
    neutralizeForSheet_(String(row[index["Instagram / website"]] || "")) === intended[8] && Number(row[index["Commission rate"]]) === intended[9] &&
    String(row[index["Referral link"]] || "") === "https://saloniresinart.com/?ref=" + encodeURIComponent(intended[1]);
}

function pausePartner_(partnerId, status, note) {
  var normalized = String(status || "Paused");
  if (["Active", "Paused", "Closed"].indexOf(normalized) === -1) throw new Error("Partner status is not valid.");
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Unable to update partner status.");
  try {
    var sheet = openPartnerTab_(PropertiesService.getScriptProperties(), "PARTNERS_SHEET_TAB", "Partners");
    var values = sheet.getDataRange().getValues();
    var index = headerIndex_(values[0].map(String));
    var matches = [];
    for (var row = 1; row < values.length; row += 1) if (String(values[row][index["Partner ID"]]) === String(partnerId)) matches.push({ row: row + 1, values: values[row] });
    if (matches.length !== 1) throw new Error(matches.length ? "Partner ID is duplicated." : "Partner was not found.");
    var found = matches[0];
    var updated = found.values.slice().map(function (value) { return typeof value === "string" ? neutralizeForSheet_(value) : value; });
    updated[index.Status] = normalized;
    if (note !== undefined) updated[index["Staff notes"]] = neutralizeForSheet_(note);
    if (index["Closed at"] !== undefined) {
      if (normalized === "Closed") updated[index["Closed at"]] = retentionDate_(updated[index["Closed at"]]) || new Date();
      else updated[index["Closed at"]] = "";
    }
    sheet.getRange(found.row, 1, 1, PARTNER_HEADERS.length).setValues([updated]);
    var verified = sheet.getDataRange().getValues()[found.row - 1];
    if (!verified || String(verified[index.Status]) !== normalized || (index["Closed at"] !== undefined && normalized === "Closed" && !retentionDate_(verified[index["Closed at"]]))) throw new Error("Partner status update could not be verified.");
    return true;
  } finally {
    lock.releaseLock();
  }
}

function correctOrderAttribution_(requestId, referralCode, reason) {
  if (!String(reason || "").trim() || String(reason).length > 500) throw new Error("A correction reason is required.");
  var properties = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Unable to correct order attribution.");
  try {
    var sheet = openOrderSheet_(properties);
    if (orderSchemaLength_(sheet) !== ORDER_HEADERS.length) migrateOrdersSchema_(sheet);
    var values = sheet.getDataRange().getValues();
    var headers = headerIndex_(values[0].map(String));
    var target = null;
    for (var row = 1; row < values.length; row += 1) if (String(values[row][0]) === String(requestId)) target = { row: row + 1, values: values[row] };
    if (!target) throw new Error("Order was not found.");
    while (target.values.length < ORDER_HEADERS.length) target.values.push("");
    var existingStatus = commissionStatus_(target.values[headers["Commission status"]]);
    if (existingStatus === "Paid" || existingStatus === "Void" || frozenCommissionExists_(requestId, properties)) throw new Error("The order commission is frozen.");
    var partner = resolveReferralForOrder_(referralCode, properties);
    if (!partner.active) throw new Error("The replacement referral code is not active.");
    var oldCode = String(target.values[headers["Referral code"]] || "");
    var oldRate = target.values[headers["Commission rate snapshot"]];
    var notes = String(target.values[headers["Staff notes"]] || "");
    var audit = new Date().toISOString() + " attribution " + oldCode + " (rate " + String(oldRate) + ") -> " + partner.code + " (rate " + String(partner.rate) + "): " + String(reason).trim();
    var updated = target.values.slice().map(function (value) { return typeof value === "string" ? neutralizeForSheet_(value) : value; });
    var targetRange = sheet.getRange(target.row, 1, 1, ORDER_HEADERS.length);
    updated[headers["Referral code"]] = neutralizeForSheet_(partner.code);
    updated[headers["Partner ID"]] = neutralizeForSheet_(partner.partnerId);
    updated[headers["Partner name snapshot"]] = neutralizeForSheet_(partner.displayName);
    updated[headers["Commission rate snapshot"]] = Number(partner.rate);
    updated[headers["Staff notes"]] = neutralizeForSheet_((notes ? notes + " | " : "") + audit);
    var paymentStatus = String(updated[headers["Payment status"]] || "").trim();
    var deliveryStatus = String(updated[headers["Delivery status"]] || "").trim();
    var commissionStatus = String(updated[headers["Commission status"]] || "").trim();
    if (!paymentStatus) paymentStatus = "Pending";
    if (!deliveryStatus) deliveryStatus = "New";
    if (!commissionStatus) commissionStatus = "Pending";
    if (PAYMENT_STATUSES.indexOf(paymentStatus) === -1 || DELIVERY_STATUSES.indexOf(deliveryStatus) === -1 || COMMISSION_STATUSES.indexOf(commissionStatus) === -1) throw new Error("Order commission status is not valid.");
    updated[headers["Payment status"]] = paymentStatus;
    updated[headers["Delivery status"]] = deliveryStatus;
    updated[headers["Commission status"]] = commissionStatus;
    updated[headers["Commission amount"]] = commissionAmountFormula_(target.row);
    updateCommissionAttribution_(target.values, updated, requestId, audit, properties);
    targetRange.setValues([updated]);
    var verified = sheet.getDataRange().getValues()[target.row - 1];
    var verifiedFormulas = targetRange.getFormulas ? targetRange.getFormulas()[0] : [];
    if (!verified || String(verified[headers["Referral code"]]) !== String(updated[headers["Referral code"]]) || Number(verified[headers["Commission rate snapshot"]]) !== Number(updated[headers["Commission rate snapshot"]]) || String(verified[headers["Staff notes"]]) !== String(updated[headers["Staff notes"]]) || String(verifiedFormulas[headers["Commission amount"]] || "") !== String(updated[headers["Commission amount"]])) throw new Error("Order attribution correction could not be verified.");
    return { requestId: requestId, referralCode: partner.code };
  } finally {
    lock.releaseLock();
  }
}

function updateCommissionAttribution_(before, desired, requestId, audit, properties) {
  if (!partnerProgramConfigured_(properties)) return false;
  var sheet = openPartnerTab_(properties, "PARTNER_COMMISSIONS_SHEET_TAB", "Partner Commissions");
  ensurePartnerTabSchema_(sheet, COMMISSION_HEADERS);
  var values = sheet.getDataRange().getValues();
  var matches = values.slice(1).filter(function (row) { return String(row[0]) === "commission-" + String(requestId); });
  if (matches.length > 1) throw new Error("Commission ledger has duplicate records.");
  if (!matches.length) return false;
  var existing = matches[0];
  var status = commissionStatus_(existing[8]);
  if (status === "Paid" || status === "Void") throw new Error("The order commission is frozen.");
  var oldIdentity = neutralizeForSheet_(String(before[27] || before[26] || ""));
  var newIdentity = neutralizeForSheet_(String(desired[27] || desired[26] || ""));
  var oldName = neutralizeForSheet_(String(before[28] || ""));
  var newName = neutralizeForSheet_(String(desired[28] || ""));
  var oldRate = Number(before[32]);
  var newRate = Number(desired[32]);
  var existingIdentity = neutralizeForSheet_(String(existing[1] || ""));
  var existingName = neutralizeForSheet_(String(existing[2] || ""));
  var matchesOld = existingIdentity === oldIdentity && existingName === oldName && Number(existing[6]) === oldRate;
  var matchesNew = existingIdentity === newIdentity && existingName === newName && Number(existing[6]) === newRate;
  if (!matchesOld && !matchesNew) throw new Error("Commission ledger snapshot mismatch.");
  var updated = existing.slice().map(function (value) { return typeof value === "string" ? neutralizeForSheet_(value) : value; });
  updated[1] = newIdentity;
  updated[2] = newName;
  updated[6] = newRate;
  if (status === "Eligible" || status === "Approved") {
    var subtotal = Number(desired[29]);
    if (!isFinite(subtotal) || subtotal <= 0) throw new Error("Commission subtotal is not valid.");
    updated[7] = Math.round(subtotal * newRate * 100) / 100;
  }
  if (String(updated[12] || "").indexOf(audit) === -1) updated[12] = neutralizeForSheet_((updated[12] ? String(updated[12]) + " | " : "") + audit);
  if (matchesNew && updated.join("\u001f") === existing.join("\u001f")) return true;
  sheet.getRange(commissionRowNumber_(sheet, "commission-" + String(requestId)), 1, 1, COMMISSION_HEADERS.length).setValues([commissionWritePayload_(sheet, updated)]);
  var verified = sheet.getDataRange().getValues().filter(function (row) { return String(row[0]) === "commission-" + String(requestId); });
  if (verified.length !== 1 || String(verified[0][1]) !== newIdentity || String(verified[0][2]) !== newName || Number(verified[0][6]) !== newRate) throw new Error("Commission correction could not be verified.");
  return true;
}

function syncOrderCommission_(requestId) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Unable to sync order commission.");
  try {
    var properties = PropertiesService.getScriptProperties();
    var sheet = openOrderSheet_(properties);
    var values = sheet.getDataRange().getValues();
    var matches = [];
    for (var row = 1; row < values.length; row += 1) if (String(values[row][0]) === String(requestId)) matches.push(values[row]);
    if (matches.length !== 1) throw new Error(matches.length ? "Order request ID is duplicated." : "Order was not found.");
    var result = ensureCommissionRecord_(matches[0], requestId, properties, new Date());
    return { commissionId: "commission-" + String(requestId), status: result[8] };
  } finally {
    lock.releaseLock();
  }
}

function frozenCommissionExists_(requestId, properties) {
  if (!partnerProgramConfigured_(properties)) return false;
  var sheet = openPartnerTab_(properties, "PARTNER_COMMISSIONS_SHEET_TAB", "Partner Commissions");
  ensurePartnerTabSchema_(sheet, COMMISSION_HEADERS);
  var values = sheet.getDataRange().getValues();
  for (var row = 1; row < values.length; row += 1) if (String(values[row][0]) === "commission-" + requestId) {
    var status = commissionStatus_(values[row][8]);
    return status === "Paid" || status === "Void";
  }
  return false;
}

function collectPayload_(form) {
  var fulfillment = stringValue_(form.fulfillment);
  return {
    requestId: stringValue_(form.requestId),
    requestStage: form.requestStage,
    sourceKind: stringValue_(form.sourceKind),
    sourceId: stringValue_(form.sourceId),
    productName: stringValue_(form.productName),
    quantity: stringValue_(form.quantity),
    dimensionFormat: stringValue_(form.dimensionFormat),
    heightFeet: stringValue_(form.heightFeet),
    heightInchesPart: stringValue_(form.heightInchesPart),
    widthFeet: stringValue_(form.widthFeet),
    widthInchesPart: stringValue_(form.widthInchesPart),
    height: stringValue_(form.height),
    heightUnit: stringValue_(form.heightUnit),
    width: stringValue_(form.width),
    widthUnit: stringValue_(form.widthUnit),
    designDetails: stringValue_(form.designDetails),
    customerName: stringValue_(form.customerName),
    phone: stringValue_(form.phone),
    email: stringValue_(form.email),
    fulfillment: fulfillment,
    shippingAddress: fulfillment.toLowerCase() === "shipping" ? stringValue_(form.shippingAddress) : "",
    city: fulfillment.toLowerCase() === "shipping" ? stringValue_(form.city) : "",
    state: fulfillment.toLowerCase() === "shipping" ? stringValue_(form.state) : "",
    pin: fulfillment.toLowerCase() === "shipping" || form.requestStage === "quote" ? stringValue_(form.pin) : "",
    requestedDate: stringValue_(form.requestedDate),
    referralCode: normalizeReferralCode_(form.referralCode),
    captchaToken: stringValue_(form.captchaToken),
    referenceImage: normalizeReferenceImage_(form.referenceImage)
  };
}

function normalizeReferenceImage_(blob) {
  if (!blob || typeof blob.getBytes !== "function") return null;
  return blob.getBytes().length ? blob : null;
}

function validatePayload_(payload) {
  var errors = {};
  var requestIdPattern = /^[A-Za-z0-9_-]{12,80}$/;
  if (!requestIdPattern.test(payload.requestId)) errors.requestId = "Please reload the form and try again.";
  if (payload.requestStage !== undefined && payload.requestStage !== "" && payload.requestStage !== "quote") {
    errors.requestStage = "This request stage is not recognised.";
  }
  bounded_(errors, "sourceKind", payload.sourceKind, 80, false);
  bounded_(errors, "sourceId", payload.sourceId, 160, false);
  if (payload.sourceKind && ["catalogue", "customizer", "general"].indexOf(payload.sourceKind.toLowerCase()) === -1) errors.sourceKind = "This source is not recognised.";
  if (payload.sourceId && !/^[A-Za-z0-9_.:/-]+$/.test(payload.sourceId)) errors.sourceId = "This source is not recognised.";
  bounded_(errors, "productName", payload.productName, 160, true);

  var quantity = Number(payload.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) errors.quantity = "Enter a quantity from 1 to 100.";

  var quoteRequest = payload.requestStage === "quote" && ["catalogue", "general"].indexOf(payload.sourceKind.toLowerCase()) >= 0;
  var customizerQuoteRequest = payload.requestStage === "quote" && payload.sourceKind.toLowerCase() === "customizer";
  var dimensionSupplied = [payload.heightFeet, payload.heightInchesPart, payload.widthFeet,
    payload.widthInchesPart, payload.height, payload.heightUnit, payload.width, payload.widthUnit]
    .some(function (value) { return value !== undefined && value !== null && String(value) !== ""; });
  var emptyDimension = { value: "", expression: "", unit: "", field: "", error: "" };
  var height = quoteRequest && !dimensionSupplied ? emptyDimension : dimensionValue_(payload, "height");
  var width = quoteRequest && !dimensionSupplied ? emptyDimension : dimensionValue_(payload, "width");
  if (height.error) errors[height.field] = height.error;
  if (width.error) errors[width.field] = width.error;

  bounded_(errors, "designDetails", payload.designDetails, 2000, true);
  bounded_(errors, "customerName", payload.customerName, 120, true);
  if (!payload.phone || payload.phone.length > 40 || (payload.phone.match(/[0-9]/g) || []).length < 7) errors.phone = "Enter a valid phone number.";
  if (payload.email && (payload.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))) errors.email = "Enter a valid email address or leave it blank.";
  if (["shipping", "pickup"].indexOf(payload.fulfillment.toLowerCase()) === -1) errors.fulfillment = "Choose shipping or pickup.";
  if (payload.fulfillment.toLowerCase() === "shipping") {
    bounded_(errors, "shippingAddress", payload.shippingAddress, 300, !quoteRequest && !customizerQuoteRequest);
    bounded_(errors, "city", payload.city, 100, !quoteRequest && !customizerQuoteRequest);
    bounded_(errors, "state", payload.state, 100, !quoteRequest && !customizerQuoteRequest);
    if (!/^\d{6}$/.test(payload.pin)) errors.pin = "Enter a 6-digit PIN for shipping.";
  } else {
    ["shippingAddress", "city", "state", "pin"].forEach(function (field) {
      if (payload[field].length > 300) errors[field] = "This field is too long.";
    });
    if ((quoteRequest || customizerQuoteRequest) && !/^\d{6}$/.test(payload.pin)) errors.pin = "Enter a 6-digit PIN for shipping.";
  }
  if (payload.requestedDate && !isIsoDate_(payload.requestedDate)) errors.requestedDate = "Use a valid requested date.";
  if (payload.referralCode && !PARTNER_CODE_PATTERN.test(payload.referralCode)) errors.referralCode = "Enter a valid referral code or clear this field.";

  var fileError = validateReferenceImage_(payload.referenceImage);
  if (fileError) errors.referenceImage = fileError;
  return {
    errors: errors,
    heightInches: height.value,
    widthInches: width.value,
    heightExpression: height.expression,
    widthExpression: width.expression,
    heightUnit: height.unit,
    widthUnit: width.unit
  };
}

function normalizeReferralCode_(value) {
  var code = String(value == null ? "" : value).trim().toUpperCase();
  return PARTNER_CODE_PATTERN.test(code) ? code : "";
}

function bounded_(errors, field, value, maxLength, required) {
  if (required && !value.trim()) errors[field] = "This field is required.";
  if (value.length > maxLength) errors[field] = "This field is too long.";
}

function normalizeDimension_(value, unit) {
  var number = Number(value);
  if (!isFinite(number) || number <= 0) return null;
  var normalizedUnit = String(unit || "").toLowerCase();
  if (["ft", "feet"].indexOf(normalizedUnit) >= 0) number *= 12;
  if (["in", "inch", "inches", "ft", "feet"].indexOf(normalizedUnit) === -1) return null;
  return number;
}

function dimensionValue_(payload, axis) {
  var format = payload.dimensionFormat;
  if (format && format !== "feet-inches") return { value: null, expression: "", unit: "ft+in", field: "dimensionFormat", error: "Choose feet and inches for each dimension." };
  if (format === "feet-inches") {
    var feetField = axis + "Feet";
    var inchesField = axis + "InchesPart";
    var feetText = payload[feetField];
    var inchesText = payload[inchesField];
    if (!/^\d+$/.test(feetText)) return { value: null, expression: "", unit: "ft+in", field: feetField, error: "Enter whole, non-negative feet." };
    var feet = Number(feetText);
    var inches = Number(inchesText);
    if (!isFinite(feet) || feet < 0 || !/^\d+(\.\d+)?$/.test(inchesText) || !isFinite(inches) || inches < 0 || inches >= 12) {
      return { value: null, expression: "", unit: "ft+in", field: inchesField, error: "Inches must be from 0 up to (but not including) 12." };
    }
    var total = feet * 12 + inches;
    if (total <= 0 || total > MAX_DIMENSION_INCHES) return { value: null, expression: "", unit: "ft+in", field: feetField, error: "Each dimension must be greater than 0 and no more than 60 inches." };
    return { value: total, expression: canonicalDimension_(total), unit: "ft+in", field: "", error: "" };
  }
  var legacyValue = normalizeDimension_(payload[axis], payload[axis + "Unit"]);
  if (legacyValue === null || legacyValue <= 0 || legacyValue > MAX_DIMENSION_INCHES) {
    return { value: legacyValue, expression: "", unit: "", field: axis, error: "Each dimension must be greater than 0 and no more than 60 inches." };
  }
  if (!/^(in|inch|inches|ft|feet)$/.test(String(payload[axis + "Unit"]).toLowerCase())) {
    return { value: legacyValue, expression: "", unit: "", field: axis + "Unit", error: "Choose inches or feet." };
  }
  return { value: legacyValue, expression: canonicalDimension_(legacyValue), unit: "ft+in", field: "", error: "" };
}

function canonicalDimension_(inches) {
  var rounded = Math.round(inches * 1000000) / 1000000;
  var feet = Math.floor(rounded / 12);
  var remainder = Math.round((rounded - feet * 12) * 1000000) / 1000000;
  var remainderText = String(remainder).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  return feet + " ft " + (remainderText || "0") + " in";
}

function isIsoDate_(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  var parts = value.split("-").map(Number);
  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
}

function validateReferenceImage_(blob) {
  if (!blob || typeof blob.getBytes !== "function") return null;
  var mime = String(blob.getContentType() || "").toLowerCase();
  var bytes = blob.getBytes();
  if (["image/jpeg", "image/png"].indexOf(mime) === -1) return "Attach one JPG or PNG image.";
  if (bytes.length > MAX_FILE_BYTES) return "The reference image must be 5 MB or smaller.";
  if (!hasImageSignature_(bytes, mime)) return "The reference image file signature does not match its type.";
  return null;
}

function hasImageSignature_(bytes, mime) {
  if (mime === "image/jpeg") return bytes.length >= 3 && bytes[0] === -1 && bytes[1] === -40 && bytes[2] === -1;
  var png = [137, 80, 78, 71, 13, 10, 26, 10];
  return bytes.length >= png.length && png.every(function (value, index) { return (bytes[index] + 256) % 256 === value; });
}

function verifyCaptcha_(token, properties, expectedAction) {
  var secret = String(properties.getProperty("CAPTCHA_SECRET") || "");
  var rawThreshold = properties.getProperty("CAPTCHA_MIN_SCORE");
  var thresholdText = String(rawThreshold == null ? "" : rawThreshold).trim();
  var threshold = Number(thresholdText);
  if (!secret || !token || !thresholdText || !isFinite(threshold) || threshold < 0 || threshold > 1) return { ok: false, error: "Captcha is not ready. Please contact Saloni directly." };
  try {
    var response = UrlFetchApp.fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "post", payload: { secret: secret, response: token }, muteHttpExceptions: true
    });
    var result = JSON.parse(response.getContentText() || "{}");
    var hostnameMatches = String(result.hostname || "").toLowerCase() === "saloniresinart.com";
    var actionMatches = result.action === (expectedAction || ORDER_CAPTCHA_ACTION);
    var scoreOk = typeof result.score === "number" && isFinite(result.score) && result.score >= 0 && result.score <= 1 && result.score >= threshold;
    return result.success === true && hostnameMatches && actionMatches && scoreOk
      ? { ok: true }
      : { ok: false, error: "Captcha verification failed. Please try again." };
  } catch (error) {
    return { ok: false, error: "Captcha verification is unavailable. Please try again." };
  }
}

function validateReferralCode(code) {
  var normalized = normalizeReferralCode_(code);
  if (!normalized || !PARTNER_CODE_PATTERN.test(normalized)) return { status: "invalid", code: normalized };
  try {
    var partner = lookupPartner_(normalized, PropertiesService.getScriptProperties());
    var response = { status: partner.status, code: normalized };
    if (partner.status === "active") response.displayName = partner.displayName;
    return response;
  } catch (error) {
    return { status: "error", code: normalized };
  }
}

function resolveReferralForOrder_(code, properties) {
  var normalized = normalizeReferralCode_(code);
  if (!normalized || !PARTNER_CODE_PATTERN.test(normalized)) return { status: "invalid", code: normalized, active: false };
  var partner = lookupPartner_(normalized, properties);
  partner.active = partner.status === "active";
  return partner;
}

function lookupPartner_(code, properties) {
  var normalized = normalizeReferralCode_(code);
  var sheet = openPartnerTab_(properties, "PARTNERS_SHEET_TAB", "Partners");
  ensurePartnerTabSchema_(sheet, PARTNER_HEADERS);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return { status: "invalid", code: normalized, active: false };
  var headers = values[0].map(String);
  var index = headerIndex_(headers);
  var matches = [];
  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    var row = values[rowIndex];
    if (String(row[index["Referral code"]] == null ? "" : row[index["Referral code"]]).trim().toUpperCase() === normalized) matches.push(row);
  }
  if (matches.length > 1) throw new Error("Referral code is duplicated in the Partners tab.");
  if (!matches.length) return { status: "invalid", code: normalized, active: false };
  var row = matches[0];
  var status = String(row[index.Status] == null ? "" : row[index.Status]).trim();
  if (["Active", "Paused", "Closed"].indexOf(status) === -1) throw new Error("Partner status is not configured.");
  var rawRate = row[index["Commission rate"]];
  var rate = Number(rawRate);
  if (rawRate === "" || rawRate === null || rawRate === undefined || !isFinite(rate) || rate < 0 || rate > 1) throw new Error("Partner commission rate is not valid.");
  return {
    status: status.toLowerCase(), code: normalized, active: status === "Active",
    partnerId: String(row[index["Partner ID"]] == null ? "" : row[index["Partner ID"]]),
    displayName: String(row[index["Partner display name"]] == null ? "" : row[index["Partner display name"]]).slice(0, 120),
    rate: rate
  };
}

function headerIndex_(headers) {
  var index = {};
  headers.forEach(function (header, position) { index[header] = position; });
  return index;
}

function openPartnerTab_(properties, propertyName, defaultName) {
  var config = partnerProgramConfig_(properties);
  if (!config) throw new Error("Partner sheet is not configured.");
  var tabName = propertyName === "PARTNER_APPLICATIONS_SHEET_TAB" ? config.applicationsTab : propertyName === "PARTNERS_SHEET_TAB" ? config.partnersTab : propertyName === "PARTNER_COMMISSIONS_SHEET_TAB" ? config.commissionsTab : String(defaultName || "");
  var spreadsheet = SpreadsheetApp.openById(config.sheetId);
  var sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) throw new Error("Partner sheet tab is not configured.");
  return sheet;
}

function openCorporateTab_(properties, required) {
  var config = corporateProgramConfig_(properties);
  if (!config) {
    if (required) throw new Error("Corporate sheet is not configured.");
    return null;
  }
  var spreadsheet = SpreadsheetApp.openById(config.sheetId);
  var sheet = spreadsheet.getSheetByName(config.tabName);
  if (!sheet && required) throw new Error("Corporate sheet tab is not configured.");
  return sheet || null;
}

function ensureCorporateTabSchema_(sheet, allowCreate) {
  if (sheet.getLastRow() === 0) {
    if (allowCreate === false) throw new Error("Corporate sheet schema is not ready.");
    sheet.getRange(1, 1, 1, CORPORATE_ENQUIRY_HEADERS.length).setValues([CORPORATE_ENQUIRY_HEADERS]);
    return true;
  }
  var columns = Number(sheet.getLastColumn && sheet.getLastColumn()) || CORPORATE_ENQUIRY_HEADERS.length;
  if (columns !== CORPORATE_ENQUIRY_HEADERS.length) throw new Error("Corporate sheet schema does not match the allowlist.");
  var existing = sheet.getRange(1, 1, 1, CORPORATE_ENQUIRY_HEADERS.length).getValues()[0].map(String);
  if (existing.join("\u001f") !== CORPORATE_ENQUIRY_HEADERS.join("\u001f")) throw new Error("Corporate sheet schema does not match the allowlist.");
  return false;
}

function protectCorporateTab_(sheet) {
  return protectRange_(sheet, 1, CORPORATE_ENQUIRY_HEADERS.length, "Corporate enquiries: staff-only");
}

function ensurePartnerTabSchema_(sheet, expected) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
    return true;
  }
  var columns = Number(sheet.getLastColumn && sheet.getLastColumn()) || expected.length;
  if (columns !== expected.length) throw new Error("Partner sheet schema does not match the allowlist.");
  var existing = sheet.getRange(1, 1, 1, expected.length).getValues()[0].map(String);
  if (existing.join("\u001f") !== expected.join("\u001f")) throw new Error("Partner sheet schema does not match the allowlist.");
  return false;
}

function openOrderSheet_(properties) {
  var sheetId = String(properties.getProperty("ORDER_SHEET_ID") || "");
  var tabName = String(properties.getProperty("ORDER_SHEET_TAB") || "Orders");
  if (!sheetId) throw new Error("Order sheet is not configured.");
  var spreadsheet = SpreadsheetApp.openById(sheetId);
  var sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) throw new Error("Order sheet tab is not configured.");
  ensureSchema_(sheet);
  return sheet;
}

function ensureSchema_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, LEGACY_ORDER_HEADERS.length).setValues([LEGACY_ORDER_HEADERS]);
    return LEGACY_ORDER_HEADERS.length;
  }
  var columns = Number(sheet.getLastColumn && sheet.getLastColumn()) || LEGACY_ORDER_HEADERS.length;
  var expected = columns === LEGACY_ORDER_HEADERS.length ? LEGACY_ORDER_HEADERS : columns === ORDER_HEADERS.length ? ORDER_HEADERS : null;
  if (!expected) throw new Error("Order sheet schema does not match the allowlist.");
  var existing = sheet.getRange(1, 1, 1, expected.length).getValues()[0].map(String);
  if (existing.join("\u001f") !== expected.join("\u001f")) throw new Error("Order sheet schema does not match the allowlist.");
  return expected.length;
}

function migrateOrdersSchema_(sheet) {
  var columns = ensureSchema_(sheet);
  if (columns === ORDER_HEADERS.length) return false;
  var maxColumns = Number(sheet.getMaxColumns && sheet.getMaxColumns()) || columns;
  if (maxColumns < ORDER_HEADERS.length) sheet.insertColumnsAfter(maxColumns, ORDER_HEADERS.length - maxColumns);
  var range = sheet.getRange(1, columns + 1, 1, PARTNER_ORDER_HEADERS.length);
  range.setValues([PARTNER_ORDER_HEADERS]);
  if (sheet.getRange(1, 1, 1, ORDER_HEADERS.length).getValues()[0].map(String).join("\u001f") !== ORDER_HEADERS.join("\u001f")) {
    throw new Error("Order sheet migration could not verify the appended headers.");
  }
  return true;
}

function orderSchemaLength_(sheet) {
  return ensureSchema_(sheet);
}

function findRequest_(sheet, requestId) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  for (var index = 1; index < values.length; index += 1) {
    if (String(values[index][0]) === requestId) {
      return {
        fingerprint: String(values[index][1]),
        receivedAt: values[index][2] instanceof Date ? values[index][2].toISOString() : String(values[index][2]),
        referralCode: String(values[index][26] == null ? "" : values[index][26]),
        partnerId: String(values[index][27] == null ? "" : values[index][27]),
        partnerName: String(values[index][28] == null ? "" : values[index][28]),
        commissionRate: values[index][32] == null ? "" : values[index][32]
      };
    }
  }
  return null;
}

function dailyCapReached_(sheet, properties) {
  var configuredCap = Number(properties.getProperty("DAILY_ACCEPTANCE_CAP"));
  var cap = Number.isInteger(configuredCap) && configuredCap > 0 ? configuredCap : DEFAULT_DAILY_ACCEPTANCE_CAP;
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var values = sheet.getDataRange().getValues();
  var count = 0;
  for (var index = 1; index < values.length; index += 1) {
    var received = values[index][2];
    if (received && Utilities.formatDate(new Date(received), Session.getScriptTimeZone(), "yyyy-MM-dd") === today) count += 1;
  }
  return count >= cap;
}

function createReferenceFile_(payload) {
  if (!payload.referenceImage) return null;
  var properties = PropertiesService.getScriptProperties();
  var folderId = String(properties.getProperty("ORDER_DRIVE_FOLDER_ID") || "");
  if (!folderId) throw new Error("Order Drive folder is not configured.");
  var folder = DriveApp.getFolderById(folderId);
  if (folder.getSharingAccess && folder.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error("Order Drive folder is not restricted.");
  var mime = String(payload.referenceImage.getContentType() || "").toLowerCase();
  var extension = mime === "image/png" ? ".png" : ".jpg";
  var safeName = "order-" + payload.requestId.replace(/[^A-Za-z0-9_-]/g, "_") + extension;
  var blob = payload.referenceImage.copyBlob().setName(safeName);
  return folder.createFile(blob);
}

function rowForPayload_(payload, fingerprint, receivedAt, referenceFile, attribution, rowNumber) {
  var validation = validatePayload_(payload);
  var row = [
    neutralizeForSheet_(payload.requestId), neutralizeForSheet_(fingerprint), receivedAt,
    neutralizeForSheet_(payload.sourceKind), neutralizeForSheet_(payload.sourceId), neutralizeForSheet_(payload.productName),
    Number(payload.quantity), neutralizeForSheet_(validation.heightExpression), neutralizeForSheet_(validation.heightUnit), validation.heightInches,
    neutralizeForSheet_(validation.widthExpression), neutralizeForSheet_(validation.widthUnit), validation.widthInches,
    neutralizeForSheet_(payload.designDetails),
    neutralizeForSheet_(payload.customerName), neutralizeForSheet_(payload.phone), neutralizeForSheet_(payload.email),
    neutralizeForSheet_(payload.fulfillment.toLowerCase()), neutralizeForSheet_(payload.shippingAddress),
    neutralizeForSheet_(payload.city), neutralizeForSheet_(payload.state), neutralizeForSheet_(payload.pin),
    neutralizeForSheet_(payload.requestedDate), referenceFile ? neutralizeForSheet_(referenceFile.getUrl()) : "",
    "New request", ""
  ];
  if (attribution) {
    var rowIndex = Number(rowNumber) || 2;
    var attributed = attribution.active === true;
    row = row.concat([
      attributed ? neutralizeForSheet_(attribution.code) : "",
      attributed ? neutralizeForSheet_(attribution.partnerId) : "",
      attributed ? neutralizeForSheet_(attribution.displayName) : "",
      "", attributed ? "Pending" : "", attributed ? "New" : "",
      attributed ? Number(attribution.rate) : "",
      attributed ? commissionAmountFormula_(rowIndex) : "",
      attributed ? "Pending" : "", "", ""
    ]);
  }
  return row;
}

function commissionAmountFormula_(rowNumber) {
  var rowIndex = Number(rowNumber) || 2;
  return '=IF(AND(AD' + rowIndex + '>0,AE' + rowIndex + '=\"Paid\",AF' + rowIndex + '=\"Delivered\",AG' + rowIndex + '>0,AI' + rowIndex + '<>\"Void\"),ROUND(AD' + rowIndex + '*AG' + rowIndex + ',2),0)';
}

function payloadFingerprint_(payload) {
  var file = payload.referenceImage;
  var fileDigest = file && typeof file.getBytes === "function" ? digestHex_(file.getBytes()) : "";
  var canonical = {
    requestId: payload.requestId, sourceKind: payload.sourceKind, sourceId: payload.sourceId,
    productName: payload.productName, quantity: payload.quantity, height: payload.height,
    heightUnit: payload.heightUnit, width: payload.width, widthUnit: payload.widthUnit,
    designDetails: payload.designDetails, customerName: payload.customerName, phone: payload.phone,
    email: payload.email, fulfillment: payload.fulfillment, shippingAddress: payload.shippingAddress,
    city: payload.city, state: payload.state, pin: payload.pin, requestedDate: payload.requestedDate,
    fileDigest: fileDigest
  };
  if (payload.dimensionFormat === "feet-inches") {
    canonical.dimensionFormat = payload.dimensionFormat;
    canonical.heightFeet = payload.heightFeet;
    canonical.heightInchesPart = payload.heightInchesPart;
    canonical.widthFeet = payload.widthFeet;
    canonical.widthInchesPart = payload.widthInchesPart;
  }
  if (payload.referralCode) canonical.referralCode = payload.referralCode;
  if (payload.requestStage === "quote") canonical.requestStage = payload.requestStage;
  return digestHex_(JSON.stringify(canonical));
}

function digestHex_(value) {
  var bytes = typeof value === "string" ? Utilities.newBlob(value).getBytes() : value;
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function (byte) { return (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, "0"); }).join("");
}

function neutralizeForSheet_(value) {
  var text = String(value == null ? "" : value);
  // A leading apostrophe makes untrusted text display literally instead of executing as a formula.
  if (text.startsWith("=") || text.startsWith("+") || text.startsWith("-") || text.startsWith("@") || /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) return "'" + text;
  return text;
}

function parseSeed_(json) {
  var seed;
  try { seed = JSON.parse(String(json || "{}")); } catch (error) { seed = {}; }
  if (!seed || typeof seed !== "object" || Array.isArray(seed)) seed = {};
  var height = boundedSeed_(seed.height, 12);
  var heightUnit = boundedSeed_(seed.heightUnit, 10) || "in";
  var width = boundedSeed_(seed.width, 12);
  var widthUnit = boundedSeed_(seed.widthUnit, 10) || "in";
  var heightParts = legacyParts_(height, heightUnit);
  var widthParts = legacyParts_(width, widthUnit);
  var suppliedFormat = boundedSeed_(seed.dimensionFormat, 20);
  var suppliedHeightFeet = boundedSeed_(seed.heightFeet, 12);
  var suppliedHeightInches = boundedSeed_(seed.heightInchesPart, 20);
  var suppliedWidthFeet = boundedSeed_(seed.widthFeet, 12);
  var suppliedWidthInches = boundedSeed_(seed.widthInchesPart, 20);
  var useSuppliedParts = suppliedFormat === "feet-inches" && suppliedHeightFeet && suppliedHeightInches && suppliedWidthFeet && suppliedWidthInches;
  return {
    requestId: /^[A-Za-z0-9_-]{12,80}$/.test(String(seed.requestId || "")) ? String(seed.requestId) : Utilities.getUuid(),
    requestStage: seed.requestStage === "quote" ? "quote" : "",
    previewExpected: seed.previewExpected === true,
    sourceKind: boundedSeed_(seed.sourceKind, 80), sourceId: boundedSeed_(seed.sourceId, 160),
    productName: boundedSeed_(seed.productName, 160), quantity: boundedSeed_(seed.quantity, 4) || "1",
    dimensionFormat: "feet-inches",
    height: height, heightUnit: heightUnit, heightFeet: useSuppliedParts ? suppliedHeightFeet : heightParts ? heightParts.feet : "", heightInchesPart: useSuppliedParts ? suppliedHeightInches : heightParts ? heightParts.inches : "",
    width: width, widthUnit: widthUnit, widthFeet: useSuppliedParts ? suppliedWidthFeet : widthParts ? widthParts.feet : "", widthInchesPart: useSuppliedParts ? suppliedWidthInches : widthParts ? widthParts.inches : "",
    designDetails: boundedSeed_(seed.designDetails, 2000), customerName: boundedSeed_(seed.customerName, 120),
    phone: boundedSeed_(seed.phone, 40), email: boundedSeed_(seed.email, 254), fulfillment: boundedSeed_(seed.fulfillment, 20) || "shipping",
    shippingAddress: boundedSeed_(seed.shippingAddress, 300), city: boundedSeed_(seed.city, 100), state: boundedSeed_(seed.state, 100),
    pin: boundedSeed_(seed.pin, 20), requestedDate: boundedSeed_(seed.requestedDate, 20),
    referralCode: normalizeReferralCode_(seed.referralCode),
    applicationId: /^[A-Za-z0-9_-]{12,80}$/.test(String(seed.applicationId || "")) ? String(seed.applicationId) : "",
    enquiryId: /^[A-Za-z0-9_-]{12,80}$/.test(String(seed.enquiryId || "")) ? String(seed.enquiryId) : Utilities.getUuid(),
    formMode: boundedMode_(seed.formMode),
    channelNonce: /^[A-Za-z0-9_-]{16,128}$/.test(String(seed.channelNonce || "")) ? String(seed.channelNonce) : ""
  };
}

function legacyParts_(value, unit) {
  var inches = normalizeDimension_(value, unit);
  if (inches === null || inches <= 0 || inches > MAX_DIMENSION_INCHES) return null;
  var expression = canonicalDimension_(inches).match(/^(\d+) ft ([0-9.]+) in$/);
  return expression ? { feet: expression[1], inches: expression[2] } : null;
}

function blankSeed_() { return parseSeed_({}); }
function boundedSeed_(value, max) { return String(value == null ? "" : value).slice(0, max); }
function stringValue_(value) { return Array.isArray(value) ? String(value[0] || "") : String(value == null ? "" : value); }
function isTrue_(value) { return String(value || "").toLowerCase() === "true"; }
function escapeSeedJson_(json) { return String(json).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"); }
function validationFailure_(errors) { return { ok: false, errors: errors }; }
