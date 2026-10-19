/**
 * Google Apps Script web app for the static site's order-request iframe.
 *
 * The web app intentionally has no public read/list endpoint. doGet and doPost
 * only render the form; submitOrder is the single write path.
 */

var MAX_FILE_BYTES = 5 * 1024 * 1024;
var MAX_DIMENSION_INCHES = 48;
var DEFAULT_DAILY_ACCEPTANCE_CAP = 50;
var ORDER_HEADERS = [
  "Request ID", "Payload fingerprint", "Received at", "Source kind", "Source ID",
  "Product name", "Quantity", "Height value", "Height unit", "Height (in)",
  "Width value", "Width unit", "Width (in)", "Design details",
  "Customer name", "Phone", "Email", "Fulfilment", "Shipping address",
  "City", "State", "PIN", "Requested date", "Reference file link", "Status", "Staff notes"
];

function doGet() {
  return renderForm_({ seed: blankSeed_() });
}

function doPost(event) {
  var parameters = event && event.parameter ? event.parameter : {};
  var action = String(parameters.action || "");
  if (action === "seed") {
    return renderForm_({ seed: parseSeed_(parameters.seed) });
  }
  return renderForm_({ seed: blankSeed_() });
}

function renderForm_(state) {
  var properties = PropertiesService.getScriptProperties();
  var siteKey = String(properties.getProperty("CAPTCHA_SITE_KEY") || "");
  var captchaEnabled = true;
  var template = HtmlService.createTemplateFromFile("Form");
  template.seedJson = escapeSeedJson_(JSON.stringify((state && state.seed) || blankSeed_()));
  template.captchaEnabled = captchaEnabled;
  template.captchaSiteKey = siteKey;
  template.captchaSiteKeyJson = escapeSeedJson_(JSON.stringify(siteKey));
  template.captchaEnabledJson = captchaEnabled ? "true" : "false";
  template.captchaScriptUrl = siteKey
    ? "https://www.google.com/recaptcha/api.js?render=" + encodeURIComponent(siteKey)
    : "";
  return template.evaluate()
    .setTitle("Saloni Resin Art Studio order request")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
      return { ok: true, requestId: payload.requestId, receivedAt: existing.receivedAt };
    }
    if (dailyCapReached_(sheet, properties)) {
      return validationFailure_({ form: "The studio's daily request limit has been reached. Please try again tomorrow." });
    }

    var referenceFile = null;
    try {
      referenceFile = createReferenceFile_(payload);
      var receivedAt = new Date();
      sheet.appendRow(rowForPayload_(payload, fingerprint, receivedAt, referenceFile));
      return { ok: true, requestId: payload.requestId, receivedAt: receivedAt.toISOString() };
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
          return { ok: true, requestId: payload.requestId, receivedAt: afterAppend.receivedAt };
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

function collectPayload_(form) {
  var fulfillment = stringValue_(form.fulfillment);
  return {
    requestId: stringValue_(form.requestId),
    sourceKind: stringValue_(form.sourceKind),
    sourceId: stringValue_(form.sourceId),
    productName: stringValue_(form.productName),
    quantity: stringValue_(form.quantity),
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
    pin: fulfillment.toLowerCase() === "shipping" ? stringValue_(form.pin) : "",
    requestedDate: stringValue_(form.requestedDate),
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
  bounded_(errors, "sourceKind", payload.sourceKind, 80, false);
  bounded_(errors, "sourceId", payload.sourceId, 160, false);
  if (payload.sourceKind && ["catalogue", "customizer"].indexOf(payload.sourceKind.toLowerCase()) === -1) errors.sourceKind = "This source is not recognised.";
  if (payload.sourceId && !/^[A-Za-z0-9_.:/-]+$/.test(payload.sourceId)) errors.sourceId = "This source is not recognised.";
  bounded_(errors, "productName", payload.productName, 160, true);

  var quantity = Number(payload.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) errors.quantity = "Enter a quantity from 1 to 100.";

  var height = normalizeDimension_(payload.height, payload.heightUnit);
  var width = normalizeDimension_(payload.width, payload.widthUnit);
  if (height === null || height <= 0 || height > MAX_DIMENSION_INCHES) errors.height = "Height must be greater than 0 and no more than 48 inches.";
  if (width === null || width <= 0 || width > MAX_DIMENSION_INCHES) errors.width = "Width must be greater than 0 and no more than 48 inches.";
  if (!/^(in|inch|inches|ft|feet)$/.test(payload.heightUnit.toLowerCase())) errors.heightUnit = "Choose inches or feet.";
  if (!/^(in|inch|inches|ft|feet)$/.test(payload.widthUnit.toLowerCase())) errors.widthUnit = "Choose inches or feet.";

  bounded_(errors, "designDetails", payload.designDetails, 2000, true);
  bounded_(errors, "customerName", payload.customerName, 120, true);
  if (!payload.phone || payload.phone.length > 40 || (payload.phone.match(/[0-9]/g) || []).length < 7) errors.phone = "Enter a valid phone number.";
  if (payload.email && (payload.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))) errors.email = "Enter a valid email address or leave it blank.";
  if (["shipping", "pickup"].indexOf(payload.fulfillment.toLowerCase()) === -1) errors.fulfillment = "Choose shipping or pickup.";
  if (payload.fulfillment.toLowerCase() === "shipping") {
    bounded_(errors, "shippingAddress", payload.shippingAddress, 300, true);
    bounded_(errors, "city", payload.city, 100, true);
    bounded_(errors, "state", payload.state, 100, true);
    if (!/^\d{6}$/.test(payload.pin)) errors.pin = "Enter a 6-digit PIN for shipping.";
  } else {
    ["shippingAddress", "city", "state", "pin"].forEach(function (field) {
      if (payload[field].length > 300) errors[field] = "This field is too long.";
    });
  }
  if (payload.requestedDate && !isIsoDate_(payload.requestedDate)) errors.requestedDate = "Use a valid requested date.";

  var fileError = validateReferenceImage_(payload.referenceImage);
  if (fileError) errors.referenceImage = fileError;
  return { errors: errors, heightInches: height, widthInches: width };
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

function verifyCaptcha_(token, properties) {
  var secret = String(properties.getProperty("CAPTCHA_SECRET") || "");
  var expectedHostname = String(properties.getProperty("CAPTCHA_EXPECTED_HOSTNAME") || "");
  if (!secret || !expectedHostname || !token) return { ok: false, error: "Captcha is not ready. Please contact Saloni directly." };
  try {
    var response = UrlFetchApp.fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "post", payload: { secret: secret, response: token }, muteHttpExceptions: true
    });
    var result = JSON.parse(response.getContentText() || "{}");
    var hostnameMatches = String(result.hostname || "").toLowerCase() === expectedHostname.toLowerCase();
    var actionMatches = !result.action || result.action === "order_request";
    var scoreOk = result.score === undefined || Number(result.score) >= 0.5;
    return result.success === true && hostnameMatches && actionMatches && scoreOk
      ? { ok: true }
      : { ok: false, error: "Captcha verification failed. Please try again." };
  } catch (error) {
    return { ok: false, error: "Captcha verification is unavailable. Please try again." };
  }
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
    sheet.getRange(1, 1, 1, ORDER_HEADERS.length).setValues([ORDER_HEADERS]);
    return;
  }
  var existing = sheet.getRange(1, 1, 1, ORDER_HEADERS.length).getValues()[0].map(String);
  if (existing.join("\u001f") !== ORDER_HEADERS.join("\u001f")) throw new Error("Order sheet schema does not match the allowlist.");
}

function findRequest_(sheet, requestId) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  for (var index = 1; index < values.length; index += 1) {
    if (String(values[index][0]) === requestId) {
      return { fingerprint: String(values[index][1]), receivedAt: values[index][2] instanceof Date ? values[index][2].toISOString() : String(values[index][2]) };
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

function rowForPayload_(payload, fingerprint, receivedAt, referenceFile) {
  var validation = validatePayload_(payload);
  return [
    neutralizeForSheet_(payload.requestId), neutralizeForSheet_(fingerprint), receivedAt,
    neutralizeForSheet_(payload.sourceKind), neutralizeForSheet_(payload.sourceId), neutralizeForSheet_(payload.productName),
    Number(payload.quantity), neutralizeForSheet_(payload.height), neutralizeForSheet_(payload.heightUnit), validation.heightInches,
    neutralizeForSheet_(payload.width), neutralizeForSheet_(payload.widthUnit), validation.widthInches,
    neutralizeForSheet_(payload.designDetails),
    neutralizeForSheet_(payload.customerName), neutralizeForSheet_(payload.phone), neutralizeForSheet_(payload.email),
    neutralizeForSheet_(payload.fulfillment.toLowerCase()), neutralizeForSheet_(payload.shippingAddress),
    neutralizeForSheet_(payload.city), neutralizeForSheet_(payload.state), neutralizeForSheet_(payload.pin),
    neutralizeForSheet_(payload.requestedDate), referenceFile ? neutralizeForSheet_(referenceFile.getUrl()) : "",
    "New request", ""
  ];
}

function payloadFingerprint_(payload) {
  var file = payload.referenceImage;
  var fileDigest = file && typeof file.getBytes === "function" ? digestHex_(file.getBytes()) : "";
  var canonical = JSON.stringify({
    requestId: payload.requestId, sourceKind: payload.sourceKind, sourceId: payload.sourceId,
    productName: payload.productName, quantity: payload.quantity, height: payload.height,
    heightUnit: payload.heightUnit, width: payload.width, widthUnit: payload.widthUnit,
    designDetails: payload.designDetails, customerName: payload.customerName, phone: payload.phone,
    email: payload.email, fulfillment: payload.fulfillment, shippingAddress: payload.shippingAddress,
    city: payload.city, state: payload.state, pin: payload.pin, requestedDate: payload.requestedDate,
    fileDigest: fileDigest
  });
  return digestHex_(canonical);
}

function digestHex_(value) {
  var bytes = typeof value === "string" ? Utilities.newBlob(value).getBytes() : value;
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function (byte) { return (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, "0"); }).join("");
}

function neutralizeForSheet_(value) {
  var text = String(value == null ? "" : value);
  // A leading apostrophe makes untrusted text display literally instead of executing as a formula.
  if (text.startsWith("=") || text.startsWith("+") || text.startsWith("-") || text.startsWith("@")) return "'" + text;
  return text;
}

function parseSeed_(json) {
  var seed;
  try { seed = JSON.parse(String(json || "{}")); } catch (error) { seed = {}; }
  if (!seed || typeof seed !== "object" || Array.isArray(seed)) seed = {};
  return {
    requestId: /^[A-Za-z0-9_-]{12,80}$/.test(String(seed.requestId || "")) ? String(seed.requestId) : Utilities.getUuid(),
    sourceKind: boundedSeed_(seed.sourceKind, 80), sourceId: boundedSeed_(seed.sourceId, 160),
    productName: boundedSeed_(seed.productName, 160), quantity: boundedSeed_(seed.quantity, 4) || "1",
    height: boundedSeed_(seed.height, 12), heightUnit: boundedSeed_(seed.heightUnit, 10) || "in",
    width: boundedSeed_(seed.width, 12), widthUnit: boundedSeed_(seed.widthUnit, 10) || "in",
    designDetails: boundedSeed_(seed.designDetails, 2000), customerName: boundedSeed_(seed.customerName, 120),
    phone: boundedSeed_(seed.phone, 40), email: boundedSeed_(seed.email, 254), fulfillment: boundedSeed_(seed.fulfillment, 20) || "shipping",
    shippingAddress: boundedSeed_(seed.shippingAddress, 300), city: boundedSeed_(seed.city, 100), state: boundedSeed_(seed.state, 100),
    pin: boundedSeed_(seed.pin, 20), requestedDate: boundedSeed_(seed.requestedDate, 20)
  };
}

function blankSeed_() { return parseSeed_({}); }
function boundedSeed_(value, max) { return String(value == null ? "" : value).slice(0, max); }
function stringValue_(value) { return Array.isArray(value) ? String(value[0] || "") : String(value == null ? "" : value); }
function isTrue_(value) { return String(value || "").toLowerCase() === "true"; }
function escapeSeedJson_(json) { return String(json).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"); }
function validationFailure_(errors) { return { ok: false, errors: errors }; }
