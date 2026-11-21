/*
 * The order request form, built into the page. Opening it is instant: nothing is fetched until the shopper presses Send.
 * script.js calls window.saloniOrderForm.open(seed, { previewBlob, onSent, onPaid }) and owns the dialog around it.
 *
 * Online payment (Razorpay) is off unless the page says otherwise: data-payments="live" on #order-form-embed turns it on for
 * everyone, ?payments=test turns on test mode in this browser (the request carries paymentTest: true). A cart of catalogue items
 * with a fixed price is then paid at checkout; every other request (custom design, custom size, price on request, an item over 20
 * pieces, a total over the online limit) stays the request it always was. Checkout.js loads only when the shopper pays.
 */
(function () {
  "use strict";
  var form = document.getElementById("order-form");
  if (!form) return;
  var intro = document.getElementById("order-form-intro");
  var embed = document.getElementById("order-form-embed");
  var seed = {};
  var formElement = form;
  var status = document.getElementById("form-status");
  var submitButton = document.getElementById("submit-button");
  var anotherButton = document.getElementById("another-button");
  var celebration = document.getElementById("success-celebration");
  var shippingFields = document.getElementById("shipping-fields");
  var pinField = document.getElementById("pin-field");
  var productContext = document.getElementById("product-context");
  var productImage = document.getElementById("product-image");
  var productNameRow = document.getElementById("product-name-row");
  var quantityRow = document.getElementById("quantity-row");
  var productNameHint = document.getElementById("product-name-hint");
  var bundleItemsElement = document.getElementById("bundle-items");
  var dimensionFields = document.getElementById("dimension-fields");
  var customSize = document.getElementById("custom-size");
  var bundleSizesElement = document.getElementById("bundle-sizes");
  var referenceImage = document.getElementById("order-reference-image");
  var referenceImagePreviewWrap = document.getElementById("reference-image-preview-wrap");
  var referenceImagePreview = document.getElementById("reference-image-preview");
  var referenceImageStatus = document.getElementById("reference-image-status");
  var referenceImageActions = document.getElementById("reference-image-actions");
  var removeReferenceImageButton = document.getElementById("remove-reference-image");
  var referralInput = form.elements.referralCode || document.getElementById("referral-code");
  var referralStatus = document.getElementById("referral-status");
  var checkReferral = document.getElementById("check-referral");
  var moreDetails = document.getElementById("more-details");
  var checkoutSummary = document.getElementById("checkout-summary");
  var checkoutLines = document.getElementById("checkout-lines");
  var checkoutSubtotal = document.getElementById("checkout-subtotal");
  var checkoutShipping = document.getElementById("checkout-shipping");
  var checkoutTotal = document.getElementById("checkout-total");
  var checkoutTestNote = document.getElementById("checkout-test-note");
  var finalQuoteNote = document.getElementById("order-final-quote-note");
  var successTitle = document.getElementById("success-title");
  var dialogTitle = document.getElementById("order-dialog-title");
  var referenceFieldset = document.getElementById("reference-image-fieldset");
  var REQUEST_BUTTON_TEXT = submitButton.textContent;
  var REQUEST_TITLE_TEXT = successTitle ? successTitle.textContent : "";
  var REQUEST_DIALOG_TITLE = dialogTitle ? dialogTitle.textContent : "";
  var TEST_NOTE_NEUTRAL = checkoutTestNote ? checkoutTestNote.textContent : "";
  var TEST_NOTE_CONFIRMED = "Test payment mode: use Razorpay test details only. No real money is charged.";
  var active = false;
  var currentAttempt = null;
  var timeoutId = null;
  var referralCheckVersion = 0;
  var referralAcceptedCode = "";
  var onSent = null;
  var onPaid = null;
  var PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
  var PREVIEW_FILENAMES = { "image/jpeg": "saloni-customizer-preview.jpg", "image/png": "saloni-customizer-preview.png" };
  function previewFilename(type) { return PREVIEW_FILENAMES[String(type || "").toLowerCase()] || ""; }
  var REFERENCE_MAX_BYTES = 1536 * 1024;
  var REFERENCE_KEEP_BYTES = 700 * 1024;
  var REFERENCE_MAX_SIDE = 1600;
  var REFERENCE_TOO_LARGE = "This image is too large to send. Please choose a smaller photo or screenshot (under 1.5 MB).";
  var UNCONFIRMED = "We were unable to confirm the request. Your entries are still here; please try again.";
  var referencePreparing = false;
  // The one image that will be sent: { blob, name, preview } where preview marks the customizer design.
  var attachedImage = null;
  var attachmentGeneration = 0;
  var previewObjectUrl = "";

  // Visitor counts (analytics.js): a fixed event name only. A no-op when analytics is not there.
  function track(path) { try { if (window.saloniTrack) window.saloniTrack(path); } catch (error) {} }
  function value(name) { return form.elements[name] ? String(form.elements[name].value || "") : ""; }
  function isBundle() { return String(seed.sourceKind || "").toLowerCase() === "catalogue" && String(seed.sourceId || "") === "catalogue:multi-item"; }
  function bundleQuantity(item) {
    var quantity = Number(item && item.quantity);
    return Number.isInteger(quantity) && quantity >= 1 && quantity <= 100 ? quantity : 1;
  }
  function bundleTotal(items) { return items.reduce(function (total, item) { return total + bundleQuantity(item); }, 0); }
  function sortedBundleItems(items) { return items.slice().sort(function (left, right) { return left.sourceId.localeCompare(right.sourceId); }); }
  function bundleProductName(items) {
    var sorted = sortedBundleItems(items);
    return sorted[0].productName + (sorted.length > 1 ? " + " + (sorted.length - 1) + " more" : "");
  }
  var SIZE_PARTS = ["heightFeet", "heightInchesPart", "widthFeet", "widthInchesPart"];
  function emptyCustomSize() { return { heightFeet: "", heightInchesPart: "", widthFeet: "", widthInchesPart: "" }; }
  function sizeAxis(feetText, inchesText) {
    var feet = String(feetText || "").trim() || "0";
    var inches = String(inchesText || "").trim() || "0";
    if (!/^\d+$/.test(feet) || !/^\d+(\.\d+)?$/.test(inches)) return "";
    var feetNumber = Number(feet);
    var inchesNumber = Number(inches);
    var total = feetNumber * 12 + inchesNumber;
    if (inchesNumber >= 12 || total <= 0 || total > 60) return "";
    var inchesLabel = String(inchesNumber) + " in";
    if (feetNumber === 0) return inchesLabel;
    return feetNumber + " ft" + (inchesNumber > 0 ? " " + inchesLabel : "");
  }
  function customSizeText(item) {
    var size = item && item.customSize;
    if (!size) return "";
    var height = sizeAxis(size.heightFeet, size.heightInchesPart);
    var width = sizeAxis(size.widthFeet, size.widthInchesPart);
    return height && width ? "Custom size: H " + height + " \u00d7 W " + width : "";
  }
  function bundleDetails(items) {
    return sortedBundleItems(items).map(function (item) {
      return [item.productName, item.size, item.price, "Qty " + bundleQuantity(item), customSizeText(item)].filter(Boolean).join(" \u00b7 ");
    }).join("\n");
  }
  function bundleSourceIds(items) {
    return sortedBundleItems(items).map(function (item) { return item.sourceId + " x" + bundleQuantity(item); }).join(", ");
  }
  function normalizeBundleItems(items) {
    if (!Array.isArray(items) || !items.length || items.length > 100) return [];
    var seen = {};
    var normalized = [];
    for (var index = 0; index < items.length; index += 1) {
      var item = items[index] || {};
      var sourceId = String(item.sourceId || "").trim().slice(0, 160);
      var productName = String(item.productName || "").trim().slice(0, 160);
      var price = String(item.price || "").trim().slice(0, 120);
      var size = String(item.size || "").trim().slice(0, 120);
      var sizeCode = String(item.sizeCode || "");
      var photo = String(item.photo || "");
      if (sizeCode.length > 40 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sizeCode)) sizeCode = "";
      if (photo.length > 40 || !/^[a-z]+(?:-[a-z]+)*$/.test(photo)) photo = "";
      var quantity = Number(item.quantity);
      if (!sourceId || !/^[A-Za-z0-9_.:/-]+$/.test(sourceId) || !productName || !Number.isInteger(quantity) || quantity < 1 || quantity > 100 || seen[sourceId]) return [];
      seen[sourceId] = true;
      normalized.push({ sourceId: sourceId, productName: productName, price: price, size: size, sizeCode: sizeCode, photo: photo, quantity: quantity, customSize: emptyCustomSize() });
    }
    return bundleTotal(normalized) <= 100 && bundleDetails(normalized).length <= 2000 ? normalized : [];
  }
  var bundleItems = normalizeBundleItems(seed.bundleItems);
  var bundleNotes = "";
  var syncingBundleFields = false;
  function bundleNotesFromField(fieldValue) {
    var current = String(fieldValue || "");
    var canonical = bundleDetails(bundleItems);
    var prefix = canonical + "\nOrder notes: ";
    if (current === canonical) return "";
    return current.indexOf(prefix) === 0 ? current.slice(prefix.length) : current;
  }
  function updateBundleScalars(includeDetails, explicitNotes) {
    if (!isBundle() || !bundleItems.length) return;
    form.elements.productName.value = bundleProductName(bundleItems);
    form.elements.quantity.value = String(bundleTotal(bundleItems));
    form.elements.bundleSourceIds.value = bundleSourceIds(bundleItems);
    renderCheckout();
    if (includeDetails) {
      var notes = String(typeof explicitNotes === "string" ? explicitNotes : bundleNotes || bundleNotesFromField(value("designDetails")) || "").trim();
      syncingBundleFields = true;
      form.elements.designDetails.value = bundleDetails(bundleItems) + (notes ? "\nOrder notes: " + notes : "");
      syncingBundleFields = false;
      bundleNotes = notes;
    }
  }
  // One entry per quantity box in the selected-items list: { input, item, line, error }.
  var quantityRecords = [];
  // "" when the box holds a whole number from 1 to 100 and the total of all items stays within 100, else what to tell the shopper.
  function quantityProblem(record) {
    var requested = String(record.input.value || "").trim();
    var next = /^\d+$/.test(requested) ? Number(requested) : NaN;
    if (!Number.isInteger(next) || next < 1 || next > 100) return "Enter a whole number from 1 to 100.";
    var others = bundleItems.reduce(function (total, other) { return other === record.item ? total : total + bundleQuantity(other); }, 0);
    return others + next > 100 ? "The total for all items must be 100 or less." : "";
  }
  function clearQuantityError(record) {
    if (record.error && record.line.removeChild) record.line.removeChild(record.error);
    record.error = null;
    record.input.removeAttribute("aria-invalid");
    record.input.removeAttribute("aria-describedby");
  }
  // The typed number stays in the box; the error sits in the item's own line, with a way to ask for more than 100 pieces.
  function showQuantityError(record, message) {
    clearQuantityError(record);
    var error = document.createElement("p");
    error.className = "field-error";
    error.id = record.input.id + "-error";
    error.textContent = message + " For more than 100 pieces, ";
    var link = document.createElement("a");
    link.setAttribute("href", "corporate-gifting/");
    link.textContent = "send a corporate gifting enquiry";
    var stop = document.createElement("span");
    stop.textContent = ".";
    error.appendChild(link);
    error.appendChild(stop);
    record.line.appendChild(error);
    record.error = error;
    record.input.setAttribute("aria-invalid", "true");
    record.input.setAttribute("aria-describedby", error.id);
  }
  // True (after showing every error and focusing the first wrong box) when any quantity box holds something that cannot be sent.
  function blockInvalidQuantities() {
    var first = null;
    quantityRecords.forEach(function (record) {
      var problem = quantityProblem(record);
      if (problem) { showQuantityError(record, problem); if (!first) first = record.input; }
    });
    if (first) { if (first.focus) first.focus(); return true; }
    // Every box is fine now. What was typed is what gets sent, even when an earlier change left an old error behind
    // (a number that was too big until another box was lowered): write the typed numbers into the items and clear the errors.
    var changed = quantityRecords.some(function (record) { return Number(String(record.input.value).trim()) !== bundleQuantity(record.item); });
    var notes = String(bundleNotesFromField(value("designDetails")) || bundleNotes || "").trim();
    var before = quantityRecords.map(function (record) { return bundleQuantity(record.item); });
    quantityRecords.forEach(function (record) { record.item.quantity = Number(String(record.input.value).trim()); clearQuantityError(record); });
    if (changed && bundleDetails(bundleItems).length > 2000) {
      quantityRecords.forEach(function (record, index) { record.item.quantity = before[index]; record.input.value = String(before[index]); });
      setStatus("Those quantities make the selected list too long. Lower a quantity before continuing.", "error");
      return true;
    }
    if (changed) { bundleNotes = notes; updateBundleScalars(true, notes); }
    return false;
  }
  function renderBundleItems() {
    quantityRecords = [];
    if (!bundleItemsElement) return;
    var visible = isBundle() && bundleItems.length > 0;
    bundleItemsElement.hidden = !visible;
    renderBundleSizes();
    while (bundleItemsElement.firstChild) bundleItemsElement.removeChild(bundleItemsElement.firstChild);
    if (!visible) return;
    bundleItems.forEach(function (item) {
      var line = document.createElement("div");
      line.className = "bundle-item";
      line.setAttribute("role", "listitem");
      line.setAttribute("data-product-name", item.productName);
      var name = document.createElement("span");
      name.className = "bundle-item-name";
      name.textContent = item.productName;
      var label = document.createElement("label");
      var inputId = "bundle-quantity-" + item.sourceId.replace(/[^A-Za-z0-9_-]/g, "-");
      label.setAttribute("for", inputId);
      label.textContent = "Quantity";
      var input = document.createElement("input");
      input.id = inputId;
      input.type = "number";
      input.min = "1"; input.max = "100"; input.step = "1"; input.inputMode = "numeric";
      input.value = String(bundleQuantity(item));
      input.setAttribute("aria-label", "Quantity for " + item.productName);
      var record = { input: input, item: item, line: line, error: null };
      quantityRecords.push(record);
      input.addEventListener("change", function () {
        var problem = quantityProblem(record);
        if (problem) { showQuantityError(record, problem); return; }
        clearQuantityError(record);
        var nextQuantity = Number(String(input.value).trim());
        var previous = bundleQuantity(item);
        var notesBeforeChange = String(bundleNotesFromField(value("designDetails")) || bundleNotes || "").trim();
        item.quantity = nextQuantity;
        if (bundleDetails(bundleItems).length > 2000) {
          item.quantity = previous;
          input.value = String(previous);
          setStatus("Those quantities make the selected list too long. Lower a quantity before continuing.", "error");
          return;
        }
        bundleNotes = notesBeforeChange;
        setStatus("", "");
        updateBundleScalars(true, notesBeforeChange);
      });
      label.appendChild(input);
      line.appendChild(name);
      line.appendChild(label);
      bundleItemsElement.appendChild(line);
    });
  }
  var bundleSizeInputs = {};
  var SIZE_LABELS = { heightFeet: "Height ft", heightInchesPart: "Height in", widthFeet: "Width ft", widthInchesPart: "Width in" };
  function renderBundleSizes() {
    bundleSizeInputs = {};
    if (!bundleSizesElement) return;
    while (bundleSizesElement.firstChild) bundleSizesElement.removeChild(bundleSizesElement.firstChild);
    if (!isBundle() || !bundleItems.length) return;
    bundleItems.forEach(function (item, index) {
      var group = document.createElement("fieldset");
      group.className = "bundle-size-item";
      var legend = document.createElement("legend");
      legend.textContent = item.productName;
      group.appendChild(legend);
      var grid = document.createElement("div");
      grid.className = "bundle-size";
      SIZE_PARTS.forEach(function (part) {
        var source = form.elements[part];
        var id = "bundle-size-" + index + "-" + part;
        var label = document.createElement("label");
        label.setAttribute("for", id);
        label.textContent = SIZE_LABELS[part];
        var input = document.createElement("input");
        input.id = id;
        input.type = "number";
        input.min = source.getAttribute("min"); input.max = source.getAttribute("max"); input.step = source.getAttribute("step"); input.inputMode = source.getAttribute("inputmode");
        input.value = item.customSize[part];
        input.setAttribute("aria-label", SIZE_LABELS[part] + " for " + item.productName);
        input.addEventListener("change", function () {
          var previous = item.customSize[part];
          var notesBeforeChange = String(bundleNotesFromField(value("designDetails")) || bundleNotes || "").trim();
          item.customSize[part] = String(input.value || "").trim();
          if (bundleDetails(bundleItems).length > 2000) {
            item.customSize[part] = previous;
            input.value = previous;
            setStatus("Those sizes make the selected list too long. Remove a size before continuing.", "error");
            return;
          }
          bundleNotes = notesBeforeChange;
          setStatus("", "");
          updateBundleScalars(true, notesBeforeChange);
        });
        label.appendChild(input);
        grid.appendChild(label);
        bundleSizeInputs[id] = input;
      });
      group.appendChild(grid);
      bundleSizesElement.appendChild(group);
    });
  }
  function fieldInput(field) { return form.elements[field] || bundleSizeInputs[field]; }
  function revealField(input) {
    if (moreDetails && input && moreDetails.contains && moreDetails.contains(input) && !moreDetails.open) moreDetails.open = true;
  }
  function setError(field, message) {
    var input = fieldInput(field);
    if (!input) return;
    revealField(input);
    input.setAttribute("aria-invalid", "true");
    var describedBy = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    if (describedBy.indexOf(field + "-error") === -1) describedBy.push(field + "-error");
    input.setAttribute("aria-describedby", describedBy.join(" "));
    var error = document.getElementById(field + "-error");
    if (!error) { error = document.createElement("p"); error.id = field + "-error"; error.className = "field-error"; (bundleSizeInputs[field] ? input.parentNode.parentNode : input.parentNode).appendChild(error); }
    error.textContent = message;
  }
  function clearErrors() {
    Array.prototype.forEach.call(form.querySelectorAll("[aria-invalid]"), function (input) {
      input.removeAttribute("aria-invalid");
      var describedBy = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter(function (id) { return id && id !== (input.name || input.id) + "-error"; });
      if (describedBy.length) input.setAttribute("aria-describedby", describedBy.join(" ")); else input.removeAttribute("aria-describedby");
    });
    Array.prototype.forEach.call(form.querySelectorAll(".field-error"), function (error) { if (error.remove) error.remove(); });
  }
  function setStatus(message, kind) { status.textContent = message || ""; status.className = "status" + (kind ? " " + kind : ""); }
  // A request to be quoted: only the PIN is asked. A cart that is paid online is an order, so it asks for the full address.
  function isQuoteRequest() {
    return seed.requestStage === "quote" && ["catalogue", "general", "customizer"].indexOf(seed.sourceKind) >= 0 && !checkoutQuote();
  }
  function toggleShipping() {
    var shipping = value("fulfillment") === "shipping";
    var quoteRequest = isQuoteRequest();
    shippingFields.hidden = !shipping || quoteRequest;
    shippingFields.setAttribute("aria-hidden", String(!shipping || quoteRequest));
    var showPin = shipping || quoteRequest;
    pinField.hidden = !showPin;
    pinField.setAttribute("aria-hidden", String(!showPin));
  }
  function updateDimensionMaxes() {
    ["heightFeet", "widthFeet"].forEach(function (name) { form.elements[name].setAttribute("max", "5"); });
    ["heightInchesPart", "widthInchesPart"].forEach(function (name) { form.elements[name].setAttribute("max", "11.99"); });
  }
  function dimensionsRequired() { return String(seed.sourceKind || "").toLowerCase() === "customizer"; }
  function applyDimensionMode() {
    var customizer = dimensionsRequired();
    var bundle = isBundle();
    if (!customizer && !bundle && customSize && dimensionFields.parentNode !== customSize) customSize.appendChild(dimensionFields);
    var showDimensions = customizer || !bundle;
    dimensionFields.hidden = !showDimensions;
    dimensionFields.setAttribute("aria-hidden", String(!showDimensions));
    var showRows = bundle && bundleItems.length > 0;
    var showCustomSize = !customizer && (!bundle || showRows);
    if (customSize) { customSize.hidden = !showCustomSize; customSize.setAttribute("aria-hidden", String(!showCustomSize)); }
    if (bundleSizesElement) { bundleSizesElement.hidden = !showRows; bundleSizesElement.setAttribute("aria-hidden", String(!showRows)); }
    SIZE_PARTS.forEach(function (name) {
      var input = form.elements[name];
      if (!input) return;
      if (customizer) input.setAttribute("required", "required"); else input.removeAttribute("required");
    });
  }
  // A plain image file name is enough; ids such as general-custom-gift have no photo.
  function catalogueImagePath(sourceId) {
    var match = /^catalogue:([A-Za-z0-9][A-Za-z0-9._-]{0,150}\.(?:webp|jpe?g|png))$/i.exec(String(sourceId || ""));
    return match ? "assets/" + match[1] : "";
  }
  function productImagePath() { return catalogueImagePath(seed.sourceId); }
  function applyProductContext() {
    var bundle = isBundle();
    if (bundle) {
      form.elements.productName.setAttribute("readonly", "readonly");
      form.elements.quantity.setAttribute("readonly", "readonly");
      if (productNameRow) productNameRow.hidden = bundleItems.length > 0;
      if (quantityRow) quantityRow.hidden = bundleItems.length > 0;
      if (productNameHint) productNameHint.hidden = bundleItems.length > 0;
      productImage.hidden = true;
      productImage.removeAttribute("src");
      productImage.removeAttribute("alt");
      productContext.hidden = true;
      renderBundleItems();
      updateBundleScalars(false);
      return;
    }
    form.elements.productName.removeAttribute("readonly");
    form.elements.quantity.removeAttribute("readonly");
    if (productNameRow) productNameRow.hidden = false;
    if (quantityRow) quantityRow.hidden = false;
    if (productNameHint) productNameHint.hidden = false;
    if (bundleItemsElement) bundleItemsElement.hidden = true;
    productImage.hidden = false;
    var imagePath = productImagePath();
    if (!imagePath) {
      productContext.hidden = true;
      productImage.removeAttribute("src");
      productImage.removeAttribute("alt");
      return;
    }
    productImage.setAttribute("src", imagePath);
    productImage.setAttribute("alt", (value("productName") || "Selected product") + " product photo");
    productContext.hidden = false;
  }
  var DEFAULT_REFERENCE_HINT = "Optional: attach a separate reference image if it helps.";
  function applySeed(next) {
    var fields = ["requestId", "requestStage", "sourceKind", "sourceId", "productName", "quantity", "heightFeet", "heightInchesPart", "widthFeet", "widthInchesPart", "designDetails", "customerName", "phone", "email", "fulfillment", "shippingAddress", "city", "state", "pin", "requestedDate", "referralCode"];
    fields.forEach(function (field) { if (form.elements[field]) form.elements[field].value = next[field] == null ? "" : next[field]; });
    bundleItems = normalizeBundleItems(next.bundleItems);
    bundleNotes = "";
    form.elements.bundleSourceIds.value = "";
    if (moreDetails && (next.email || next.requestedDate || next.referralCode)) moreDetails.open = true;
    setReferenceImageStatus(DEFAULT_REFERENCE_HINT + (dimensionsRequired() ? " Customizer designs transfer directly with your request." : ""), "");
    if (isBundle() && bundleItems.length) form.elements.designDetails.value = "";
    toggleShipping();
    updateDimensionMaxes();
    applyProductContext();
    applyDimensionMode();
    renderCheckout();
  }
  function normalizeReferralCode(value) { var code = String(value || "").trim().toUpperCase(); return /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code) ? code : ""; }
  function showReferralStatus(message, kind) { if (!referralStatus) return; referralStatus.textContent = message; referralStatus.className = "hint" + (kind ? " " + kind : ""); }
  function clearReferralStatus() {
    referralCheckVersion += 1;
    referralAcceptedCode = "";
    if (checkReferral) checkReferral.disabled = false;
    var code = referralInput ? normalizeReferralCode(referralInput.value) : "";
    showReferralStatus(code ? "Code changed. Check it again before submitting." : "No code entered. The order can continue without partner credit.", "");
  }
  function repeatProfileFromForm() {
    return {
      customerName: value("customerName"), phone: value("phone"), fulfillment: value("fulfillment"),
      shippingAddress: value("shippingAddress"), city: value("city"), state: value("state"), pin: value("pin")
    };
  }
  function execUrl() {
    var url = embed ? String(embed.getAttribute("data-order-form-url") || "") : "";
    return url && url.indexOf("REPLACE_WITH_") === -1 ? url : "";
  }
  // A text/plain JSON body is a "simple" request, so the browser sends it without a preflight.
  function postJson(action, body) {
    var url = execUrl();
    if (!url || typeof window.fetch !== "function") return Promise.reject(new Error("The request form is not configured"));
    return window.fetch(url + "?action=" + action, { method: "POST", credentials: "omit", body: JSON.stringify(body) }).then(function (response) { return response.json(); });
  }

  function checkReferralCode() {
    if (!referralInput || !checkReferral) return;
    var code = normalizeReferralCode(referralInput.value);
    referralInput.value = code;
    var requestVersion = referralCheckVersion + 1;
    referralCheckVersion = requestVersion;
    referralAcceptedCode = "";
    if (!code) { showReferralStatus("No code entered. The order can continue without partner credit.", ""); return; }
    checkReferral.disabled = true; showReferralStatus("Checking this code…", "");
    var requested = code;
    function stale() { return requestVersion !== referralCheckVersion || normalizeReferralCode(referralInput.value) !== requested; }
    postJson("referral", { code: code }).then(function (result) {
      if (stale()) return;
      checkReferral.disabled = false;
      if (result && result.status === "active") { referralAcceptedCode = requested; showReferralStatus("Code accepted.", "success"); }
      else if (result && result.status === "error") { referralAcceptedCode = ""; showReferralStatus("Could not check the code; retry or clear it to continue without partner credit.", "error"); }
      else if (result && result.status === "paused") { referralAcceptedCode = ""; showReferralStatus("This code is paused. The order can continue without partner credit.", "error"); }
      else { referralAcceptedCode = ""; showReferralStatus("This code is not active. The order can continue without partner credit.", "error"); }
    }, function () {
      if (stale()) return;
      checkReferral.disabled = false;
      referralAcceptedCode = "";
      showReferralStatus("Could not check the code; retry or clear it to continue without partner credit.", "error");
    });
  }
  function newRequestId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "request-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }
  function isCustomizerOrderRequest() {
    return seed.sourceKind === "customizer" && seed.previewExpected === true;
  }
  function setReferenceImageStatus(message, kind) {
    if (!referenceImageStatus) return;
    referenceImageStatus.textContent = message || "";
    referenceImageStatus.className = "hint" + (kind ? " " + kind : "");
  }
  function revokePreviewObjectUrl() {
    if (!previewObjectUrl) return;
    var urlApi = window.URL || (typeof URL !== "undefined" ? URL : null);
    if (urlApi && typeof urlApi.revokeObjectURL === "function") {
      try { urlApi.revokeObjectURL(previewObjectUrl); } catch (error) {}
    }
    previewObjectUrl = "";
  }
  function updateReferenceImageActions() {
    if (referenceImageActions) referenceImageActions.hidden = !attachedImage;
    if (removeReferenceImageButton) removeReferenceImageButton.hidden = !attachedImage;
  }
  function dropAttachment() {
    attachmentGeneration += 1;
    attachedImage = null;
    revokePreviewObjectUrl();
    if (referenceImagePreviewWrap) referenceImagePreviewWrap.hidden = true;
    if (referenceImagePreview) referenceImagePreview.removeAttribute("src");
    updateReferenceImageActions();
  }
  function clearAttachment() {
    dropAttachment();
    clearReferenceFile();
  }
  function validPreviewBlob(blob) {
    return Boolean(blob && Object.prototype.toString.call(blob) === "[object Blob]" && typeof blob.size === "number" && blob.size > 0 && blob.size <= PREVIEW_MAX_BYTES && Boolean(previewFilename(blob.type)));
  }
  function showAttachedReference(blob, alt) {
    revokePreviewObjectUrl();
    var urlApi = window.URL || (typeof URL !== "undefined" ? URL : null);
    if (urlApi && typeof urlApi.createObjectURL === "function") {
      previewObjectUrl = urlApi.createObjectURL(blob);
      referenceImagePreview.setAttribute("src", previewObjectUrl);
      referenceImagePreviewWrap.hidden = false;
    }
    referenceImagePreview.setAttribute("alt", alt);
  }
  function attachCustomizerPreview(blob) {
    var name = previewFilename(blob.type);
    attachedImage = { blob: blob, name: name, preview: true };
    showAttachedReference(blob, "Attached customizer preview");
    setReferenceImageStatus("Customizer preview attached as " + name + ".");
    updateReferenceImageActions();
  }
  function isJpegOrPng(file) {
    return ["image/jpeg", "image/png"].indexOf(String(file.type || "").toLowerCase()) !== -1 || /\.(jpe?g|png)$/i.test(String(file.name || ""));
  }
  function setReferencePreparing(on) {
    referencePreparing = on;
    submitButton.disabled = on || active;
  }
  function clearReferenceFile() {
    try { referenceImage.value = ""; } catch (error) {}
  }
  function decodeReferenceImage(file) {
    var bitmapApi = window.createImageBitmap || (typeof createImageBitmap !== "undefined" ? createImageBitmap : null);
    if (typeof bitmapApi === "function") return bitmapApi.call(window, file);
    return new Promise(function (resolve, reject) {
      var urlApi = window.URL || (typeof URL !== "undefined" ? URL : null);
      var ImageCtor = window.Image || (typeof Image !== "undefined" ? Image : null);
      if (!urlApi || typeof urlApi.createObjectURL !== "function" || !ImageCtor) { reject(new Error("Image decoding is unavailable")); return; }
      var url = urlApi.createObjectURL(file);
      var image = new ImageCtor();
      image.onload = function () { try { urlApi.revokeObjectURL(url); } catch (error) {} resolve(image); };
      image.onerror = function () { try { urlApi.revokeObjectURL(url); } catch (error) {} reject(new Error("The image could not be decoded")); };
      image.src = url;
    });
  }
  function shrinkReferenceImage(file) {
    return decodeReferenceImage(file).then(function (source) {
      try {
        var sourceWidth = source.naturalWidth || source.width;
        var sourceHeight = source.naturalHeight || source.height;
        if (!(sourceWidth > 0 && sourceHeight > 0)) throw new Error("The image has no size");
        var scale = Math.min(1, REFERENCE_MAX_SIDE / Math.max(sourceWidth, sourceHeight));
        var width = Math.max(1, Math.round(sourceWidth * scale));
        var height = Math.max(1, Math.round(sourceHeight * scale));
        var canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        var context = canvas.getContext && canvas.getContext("2d");
        if (!context || typeof canvas.toBlob !== "function") throw new Error("Canvas is unavailable");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(source, 0, 0, width, height);
      } finally {
        if (typeof source.close === "function") { try { source.close(); } catch (error) {} }
      }
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) { if (blob) resolve(blob); else reject(new Error("The image could not be exported")); }, "image/jpeg", 0.82);
      });
    }).then(function (blob) {
      if (!blob.size || blob.size > REFERENCE_MAX_BYTES) throw new Error("The shrunk image is still too large");
      return { blob: blob, name: (String(file.name || "").replace(/\.[^.\/\\]*$/, "") || "reference-image") + ".jpg" };
    });
  }
  function prepareReferenceImage(file) {
    var generation = attachmentGeneration;
    setReferencePreparing(true);
    setReferenceImageStatus("Preparing your image…");
    var finish = function (shrunk) {
      if (generation !== attachmentGeneration) return;
      setReferencePreparing(false);
      if (shrunk) {
        attachedImage = { blob: shrunk.blob, name: shrunk.name, preview: false };
        showAttachedReference(shrunk.blob, "Attached reference image");
        setReferenceImageStatus("Reference image attached.");
      } else if (file.size <= REFERENCE_MAX_BYTES) {
        attachedImage = { blob: file, name: String(file.name || "reference-image"), preview: false };
        showAttachedReference(file, "Attached reference image");
        setReferenceImageStatus("Reference image attached.");
      } else {
        clearAttachment();
        setReferenceImageStatus(REFERENCE_TOO_LARGE, "error");
      }
      updateReferenceImageActions();
    };
    var started;
    try { started = shrinkReferenceImage(file); } catch (error) { started = Promise.reject(error); }
    started.then(finish, function () { finish(null); });
  }
  function handleReferenceImageChange() {
    var file = referenceImage.files && referenceImage.files[0];
    // Cancelling the file picker leaves the customizer preview alone; it has its own Remove button.
    if (!file && attachedImage && attachedImage.preview) return;
    dropAttachment();
    setReferencePreparing(false);
    if (file && (file.size > REFERENCE_KEEP_BYTES || !isJpegOrPng(file))) {
      prepareReferenceImage(file);
    } else if (file) {
      attachedImage = { blob: file, name: String(file.name || "reference-image"), preview: false };
      showAttachedReference(file, "Attached reference image");
      setReferenceImageStatus("Reference image attached.");
    } else {
      setReferenceImageStatus("No reference image attached.");
    }
    updateReferenceImageActions();
  }
  function removeAttachedImage() {
    var wasPreview = Boolean(attachedImage && attachedImage.preview);
    clearAttachment();
    setReferencePreparing(false);
    setReferenceImageStatus(wasPreview ? "Customizer preview removed." : "No reference image attached.");
  }
  // ---- Online payment (Razorpay) ----
  var CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
  var PAY_LIMIT = 100000;
  var PAY_MAX_QUANTITY = 20;
  var VERIFY_DELAYS = [3000, 6000, 10000];
  var CAPTCHA_WAIT_MS = 6000;
  var NOT_COMPLETED = "Payment not completed. Your cart is kept.";
  var pendingPayment = null;
  var paymentRetry = false;
  var checkoutCopyHidden = false;
  var referenceHiddenByCheckout = false;
  var checkoutLoading = false;
  var checkoutWaiters = [];
  var captchaLoading = false;
  var captchaWaiters = [];
  // "off" (a plain request), "test" (?payments=test in this browser) or "live" (data-payments="live" on the page).
  function paymentsMode() {
    var configured = embed ? String(embed.getAttribute("data-payments") || "") : "";
    if (configured === "live") return "live";
    var search = "";
    try { search = String(window.location && window.location.search || ""); } catch (error) { search = ""; }
    return /(?:^|[?&])payments=test(?:&|$)/.test(search) ? "test" : "off";
  }
  function rupees(amount) { return "₹" + String(amount).replace(/\B(?=(\d\d)+\d$)/g, ","); }
  function shippingFee(fulfillment, pin) {
    if (fulfillment === "pickup") return 0;
    if (!/^[1-9]\d{5}$/.test(pin)) return null;
    return /^3[0-4]/.test(pin) ? 100 : 150;
  }
  function hasCustomSize(item) {
    return SIZE_PARTS.some(function (part) { return String(item.customSize && item.customSize[part] || "").trim() !== ""; });
  }
  // The cart as it would be paid: { lines, subtotal, shipping, total } with shipping and total null until the PIN is valid.
  // null when the request must stay a request.
  function checkoutQuote() {
    if (paymentsMode() === "off" || !isBundle() || !bundleItems.length) return null;
    var fulfillment = value("fulfillment");
    if (["shipping", "pickup"].indexOf(fulfillment) === -1) return null;
    var subtotal = 0;
    var lines = [];
    for (var index = 0; index < bundleItems.length; index += 1) {
      var item = bundleItems[index];
      var price = priceNumber(item.price);
      var quantity = bundleQuantity(item);
      if (price === null || price < 1 || quantity > PAY_MAX_QUANTITY || hasCustomSize(item)) return null;
      subtotal += price * quantity;
      lines.push({ name: item.productName, quantity: quantity, amount: price * quantity });
    }
    var shipping = shippingFee(fulfillment, value("pin").trim());
    if (subtotal + (shipping || 0) > PAY_LIMIT) return null;
    return { lines: lines, subtotal: subtotal, shipping: shipping, total: shipping === null ? null : subtotal + shipping };
  }
  function paidLines() {
    return sortedBundleItems(bundleItems).map(function (item) {
      return { sourceId: item.sourceId, size: item.sizeCode || "", photo: item.photo || "", qty: bundleQuantity(item) };
    });
  }
  // Everything the order row would hold: when it changes, an order made earlier is not this order any more.
  function checkoutKey() {
    return JSON.stringify([ORDER_FIELDS.filter(function (field) { return field !== "requestId"; }).map(value), paidLines()]);
  }
  function setCheckoutCopyHidden(hidden) {
    if (hidden !== checkoutCopyHidden) {
      checkoutCopyHidden = hidden;
      if (intro) intro.hidden = hidden;
      if (finalQuoteNote) finalQuoteNote.hidden = hidden;
    }
    // A paid order does not store a reference image, so the upload is not offered; the dialog is a checkout, not a request.
    if (hidden !== referenceHiddenByCheckout) {
      referenceHiddenByCheckout = hidden;
      if (referenceFieldset) referenceFieldset.hidden = hidden;
    }
    if (dialogTitle) dialogTitle.textContent = hidden ? "Checkout" : REQUEST_DIALOG_TITLE;
  }
  function payLabel(total) {
    if (total === null) return "Pay online";
    return (paymentRetry ? "Try again · Pay " : "Pay ") + rupees(total);
  }
  // The summary (items, shipping, total, refund rule) and the button's words. A plain request keeps its own words.
  function renderCheckout() {
    var quote = checkoutQuote();
    toggleShipping();
    setCheckoutCopyHidden(Boolean(quote));
    if (!quote) {
      if (checkoutSummary) checkoutSummary.hidden = true;
      if (checkoutTestNote) checkoutTestNote.hidden = true;
      submitButton.textContent = REQUEST_BUTTON_TEXT;
      return;
    }
    // After the server answered, its figures are the ones to show (and a changed price is shown as changed).
    var served = pendingPayment && pendingPayment.key === checkoutKey() ? pendingPayment.payment : null;
    var figures = served || quote;
    // The note says "no real money" only once the server's own key is a Razorpay test key; a live key never shows it.
    var keyId = served && typeof served.keyId === "string" ? served.keyId : "";
    if (checkoutTestNote) {
      checkoutTestNote.hidden = paymentsMode() !== "test" || keyId.indexOf("rzp_live_") === 0;
      checkoutTestNote.textContent = keyId.indexOf("rzp_test_") === 0 ? TEST_NOTE_CONFIRMED : TEST_NOTE_NEUTRAL;
    }
    if (checkoutSummary) checkoutSummary.hidden = false;
    if (checkoutLines) {
      while (checkoutLines.firstChild) checkoutLines.removeChild(checkoutLines.firstChild);
      quote.lines.forEach(function (line) {
        var row = document.createElement("li");
        var name = document.createElement("span");
        name.textContent = line.name + " × " + line.quantity;
        var amount = document.createElement("span");
        amount.textContent = served && served.priceChanged ? "" : rupees(line.amount);
        row.appendChild(name);
        row.appendChild(amount);
        checkoutLines.appendChild(row);
      });
    }
    if (checkoutSubtotal) checkoutSubtotal.textContent = rupees(figures.subtotal);
    if (checkoutShipping) checkoutShipping.textContent = figures.shipping === null ? "Enter your PIN to see shipping" : rupees(figures.shipping);
    if (checkoutTotal) checkoutTotal.textContent = figures.total === null ? "" : rupees(figures.total);
    submitButton.textContent = payLabel(figures.total);
  }
  // The reCAPTCHA site key, or "" when payments are off: then nothing loads, no token is sent and nothing waits.
  function captchaKey() { return embed && paymentsMode() !== "off" ? String(embed.getAttribute("data-captcha-site-key") || "") : ""; }
  // Loads the reCAPTCHA script without running it. done(true) once grecaptcha.ready can be used, done(false) if it cannot load.
  function loadCaptcha(key, done) {
    if (window.grecaptcha && window.grecaptcha.ready) { done(true); return; }
    captchaWaiters.push(done);
    if (captchaLoading) return;
    captchaLoading = true;
    var existing = document.querySelector ? document.querySelector('script[src*="recaptcha/api.js"]') : null;
    var script = existing || document.createElement("script");
    function settle(ok) {
      if (!captchaLoading) return;
      captchaLoading = false;
      if (!ok && !existing && script.parentNode && script.parentNode.removeChild) script.parentNode.removeChild(script);
      var waiters = captchaWaiters;
      captchaWaiters = [];
      waiters.forEach(function (waiter) { waiter(ok); });
    }
    script.addEventListener("load", function () { settle(Boolean(window.grecaptcha && window.grecaptcha.ready)); });
    script.addEventListener("error", function () { settle(false); });
    if (!existing) {
      script.src = "https://www.google.com/recaptcha/api.js?render=" + encodeURIComponent(key);
      script.async = true;
      document.head.appendChild(script);
    }
  }
  // done(token): "" when there is no site key (nothing runs) or reCAPTCHA cannot give a token (the server decides what that means).
  function withCaptcha(done) {
    var key = captchaKey();
    if (!key) { done(""); return; }
    var finished = false;
    var timer = null;
    function finish(token) {
      if (finished) return;
      finished = true;
      if (timer !== null) window.clearTimeout(timer);
      done(typeof token === "string" ? token : "");
    }
    timer = window.setTimeout(function () { finish(""); }, CAPTCHA_WAIT_MS);
    loadCaptcha(key, function (ready) {
      if (!ready) { finish(""); return; }
      try {
        window.grecaptcha.ready(function () {
          try { window.grecaptcha.execute(key, { action: "order_request" }).then(finish, function () { finish(""); }); } catch (error) { finish(""); }
        });
      } catch (error) { finish(""); }
    });
  }
  function loadCheckout(done) {
    if (typeof window.Razorpay === "function") { done(true); return; }
    checkoutWaiters.push(done);
    if (checkoutLoading) return;
    checkoutLoading = true;
    var script = document.createElement("script");
    function settle(ok) {
      if (!checkoutLoading) return;
      checkoutLoading = false;
      if (!ok && script.parentNode && script.parentNode.removeChild) script.parentNode.removeChild(script);
      var waiters = checkoutWaiters;
      checkoutWaiters = [];
      waiters.forEach(function (waiter) { waiter(ok); });
    }
    script.addEventListener("load", function () { settle(typeof window.Razorpay === "function"); });
    script.addEventListener("error", function () { settle(false); });
    script.src = CHECKOUT_SRC;
    script.async = true;
    document.head.appendChild(script);
  }
  // Razorpay draws its window in <body>. The checkout sits in a modal <dialog>, which the browser keeps in its top layer above any
  // z-index and which makes the rest of the page inert, so the payment window opened hidden and unclickable behind it. While the
  // payment window is open the dialog stays open but non-modal; it becomes modal again when the window closes.
  var orderDialog = document.getElementById("order-dialog");
  var swapCloses = 0;
  if (orderDialog && window.addEventListener) {
    // The swap closes the dialog for a moment; the page's own close handler must not treat that as the shopper closing it.
    window.addEventListener("close", function (event) {
      if (swapCloses > 0 && event.target === orderDialog) { swapCloses -= 1; event.stopImmediatePropagation(); }
    }, true);
  }
  function setDialogModal(modal) {
    // Cleared even when the shopper closed the checkout while paying, so a later open is not dimmed twice.
    if (modal && orderDialog && orderDialog.classList) orderDialog.classList.toggle("order-dialog-paying", false);
    if (!orderDialog || !orderDialog.open || typeof orderDialog.show !== "function") return;
    var isModal = true;
    try { isModal = orderDialog.matches(":modal"); } catch (error) {}
    if (isModal === modal) return;
    swapCloses += 1;
    orderDialog.close();
    // The class keeps the non-modal checkout fixed in place over a dimmed page, as it looked while modal.
    if (orderDialog.classList) orderDialog.classList.toggle("order-dialog-paying", !modal);
    if (modal) orderDialog.showModal(); else orderDialog.show();
  }
  function phoneDigits() { var digits = value("phone").replace(/\D/g, ""); return digits.length > 10 ? digits.slice(-10) : digits; }
  function stopPaying(attempt, message) {
    paymentRetry = true;
    restoreSubmitState(attempt);
    setStatus(message, "error");
    renderCheckout();
    // The Razorpay window took focus away; put it back on the button that tries again.
    if (submitButton.focus) submitButton.focus();
  }
  function openPayment(attempt, pending) {
    setStatus("Opening the payment window…", "");
    loadCheckout(function (loaded) {
      if (!isCurrent(attempt)) return;
      if (!loaded) { clearErrors(); stopPaying(attempt, "The payment window could not load. Check your connection and try again. Your cart is kept."); return; }
      var payment = pending.payment;
      var checkout;
      try {
        checkout = new window.Razorpay({
          key: payment.keyId,
          order_id: payment.orderId,
          amount: payment.total * 100,
          currency: "INR",
          name: "Saloni Resin Art Studio",
          description: "Order " + pending.requestId.slice(0, 8),
          prefill: { name: value("customerName").trim(), contact: phoneDigits(), email: value("email").trim() },
          theme: { color: "#b0125b" },
          timeout: 900,
          handler: function (response) {
            setDialogModal(true);
            if (pending.done) return;
            pending.done = true;
            verifyPayment(attempt, pending, response || {}, 0);
          },
          modal: { ondismiss: function () { setDialogModal(true); if (!pending.done && isCurrent(attempt)) stopPaying(attempt, NOT_COMPLETED); } }
        });
        checkout.on("payment.failed", function () { if (!pending.done && isCurrent(attempt)) setStatus(NOT_COMPLETED, "error"); });
        setStatus("Finish your payment in the payment window.", "");
        setDialogModal(false);
        checkout.open();
      } catch (error) {
        setDialogModal(true);
        stopPaying(attempt, "The payment window could not open. Your cart is kept. Please try again.");
      }
    });
  }
  // Asks the server whether the payment landed: now, then again after 3, 6 and 10 seconds while it says "pending" or cannot answer.
  function verifyPayment(attempt, pending, response, step) {
    if (isCurrent(attempt)) setStatus("Confirming your payment…", "");
    function again() {
      if (step < VERIFY_DELAYS.length) window.setTimeout(function () { verifyPayment(attempt, pending, response, step + 1); }, VERIFY_DELAYS[step]);
      else finishPayment(attempt, pending, "payment_pending", null);
    }
    postJson("verify", { requestId: pending.requestId, razorpay_payment_id: response.razorpay_payment_id, razorpay_order_id: response.razorpay_order_id, razorpay_signature: response.razorpay_signature }).then(function (result) {
      if (result && result.ok === true && result.status === "paid") finishPayment(attempt, pending, "paid", result);
      else if (result && result.ok === true && result.status === "unpaid") { pending.done = false; if (isCurrent(attempt)) stopPaying(attempt, NOT_COMPLETED); }
      else again();
    }, again);
  }
  // The shopper paid. Whatever the page is showing now, the cart is cleared and My orders hears about it once.
  function finishPayment(attempt, pending, outcome, result) {
    if (pending.finished) return;
    pending.finished = true;
    var paid = outcome === "paid";
    var total = result && Number.isInteger(result.total) ? result.total : pending.payment.total;
    if (pendingPayment === pending) pendingPayment = null;
    if (pending.onSent) { try { pending.onSent(pending.profile); } catch (error) {} }
    if (pending.onPaid) { try { pending.onPaid(); } catch (error) {} }
    var summary = pending.summary;
    summary.status = outcome;
    if (paid) summary.paidAt = Date.now();
    saveMyOrder(null, summary);
    if (paid) {
      track("order-sent");
      reportPurchase({ requestId: pending.requestId }, { items: pending.items, total: total });
    }
    if (!isCurrent(attempt)) return;
    restoreSubmitState(attempt);
    form.querySelectorAll("fieldset, #submit-button").forEach(function (element) { element.hidden = true; });
    if (moreDetails) moreDetails.hidden = true;
    if (checkoutSummary) checkoutSummary.hidden = true;
    anotherButton.hidden = false;
    if (paid) {
      if (celebration) celebration.hidden = false;
      if (successTitle) successTitle.textContent = "Order confirmed!";
      setStatus("Order confirmed. ID " + pending.requestId + ". We received your payment of " + rupees(total) + ". Saloni will start making your order and will contact you if she needs anything.", "success");
    } else {
      setStatus("We are still confirming your payment. If money left your account, your order is safe: check My orders in a few minutes, or call or message Saloni with this ID: " + pending.requestId, "");
    }
    if (status.focus) { status.setAttribute("tabindex", "-1"); status.focus(); }
  }
  function stopStillSending() {
    if (timeoutId) window.clearTimeout(timeoutId);
    timeoutId = null;
  }
  // The server already has this order paid (an earlier answer was lost): confirm it, never pay it again.
  function confirmAlreadyPaid(attempt, key, quote, result, payload) {
    var pending = { key: key, requestId: String(result.requestId || payload.requestId), payment: { total: quote.total }, finished: false, onSent: onSent, onPaid: onPaid };
    pending.profile = repeatProfileFromForm();
    pending.items = purchaseItems();
    pending.summary = myOrderSummary({ requestId: pending.requestId });
    finishPayment(attempt, pending, "paid", result);
  }
  // Try again after a closed or failed payment: ask the server first whether the money already arrived.
  function retryPayment(attempt, pending) {
    setStatus("Checking your payment…", "");
    postJson("verify", { requestId: pending.requestId }).then(function (result) {
      if (!isCurrent(attempt)) return;
      if (result && result.ok === true && result.status === "paid") { pending.done = true; finishPayment(attempt, pending, "paid", result); }
      else openPayment(attempt, pending);
    }, function () {
      if (isCurrent(attempt)) openPayment(attempt, pending);
    });
  }
  // The order is made on the server (once per set of entries); the shopper pays it in the Razorpay window.
  function startPayment(attempt, quote) {
    var key = checkoutKey();
    var reuse = pendingPayment && pendingPayment.key === key ? pendingPayment : null;
    if (pendingPayment && !reuse) { pendingPayment = null; form.elements.requestId.value = newRequestId(); }
    if (reuse) {
      if (paymentRetry) retryPayment(attempt, reuse); else openPayment(attempt, reuse);
      return;
    }
    setStatus("Starting your payment…", "");
    timeoutId = window.setTimeout(function () {
      if (!isCurrent(attempt)) return;
      setStatus("Still starting your payment – please keep this window open. This usually finishes within a minute.", "");
      if (status.focus) { status.setAttribute("tabindex", "-1"); status.focus(); }
    }, 30000);
    var payload = orderPayload();
    payload.lines = paidLines();
    payload.expectedTotal = quote.total;
    if (paymentsMode() === "test") payload.paymentTest = true;
    // A paid order does not store a reference image, so none is sent.
    prepareAndSend(attempt, payload, null, function () {
      postJson("order", payload).then(function (result) {
        stopStillSending();
        if (!isCurrent(attempt)) return;
        if (result && result.ok === true && result.paid === true) confirmAlreadyPaid(attempt, key, quote, result, payload);
        else if (result && result.ok === true && result.payment && typeof result.payment === "object") {
          var payment = result.payment;
          var pending = { key: key, requestId: String(result.requestId || payload.requestId), payment: payment, done: false, finished: false, onSent: onSent, onPaid: onPaid };
          pending.profile = repeatProfileFromForm();
          pending.items = purchaseItems();
          pending.summary = myOrderSummary({ requestId: pending.requestId });
          pendingPayment = pending;
          paymentRetry = false;
          if (payment.priceChanged === true) {
            restoreSubmitState(attempt);
            clearErrors();
            renderCheckout();
            setStatus("The price changed since you added these items. The new total is " + rupees(payment.total) + ". Check it, then tap Pay again.", "error");
            if (status.focus) { status.setAttribute("tabindex", "-1"); status.focus(); }
            return;
          }
          renderCheckout();
          openPayment(attempt, pending);
        } else if (result && result.ok === true) showSuccess(result, attempt);
        else if (result && result.errors && typeof result.errors === "object") showFailure("Please correct the highlighted fields and try again.", result.errors, attempt);
        else showFailure(result && typeof result.message === "string" && result.message ? result.message : UNCONFIRMED, null, attempt);
      }, function () {
        stopStillSending();
        if (isCurrent(attempt)) showFailure("We were unable to start the payment. Your entries are still here; please try again.", null, attempt);
      });
    });
  }
  function isCurrent(attempt) { return currentAttempt === attempt && active; }
  function restoreSubmitState(attempt) {
    if (attempt && currentAttempt !== attempt) return;
    active = false;
    submitButton.disabled = false;
    if (timeoutId) window.clearTimeout(timeoutId);
    timeoutId = null;
  }
  function focusFirstError(errors) {
    var first = errors && Object.keys(errors).filter(function (field) { return field !== "form"; })[0];
    var firstInput = first && fieldInput(first);
    if (firstInput && firstInput.focus) { revealField(firstInput); firstInput.focus(); return; }
    if (status.focus) { status.setAttribute("tabindex", "-1"); status.focus(); }
  }
  function showFailure(message, errors, attempt) {
    if (attempt && !isCurrent(attempt)) return;
    restoreSubmitState(attempt); clearErrors();
    if (errors) Object.keys(errors).forEach(function (field) { if (field !== "form") setError(field, errors[field]); });
    var general = errors && errors.form;
    setStatus(general || message, "error");
    focusFirstError(errors);
  }
  // What "My orders" keeps about a confirmed request: no contact details, address, images or referral code.
  function myOrderSummary(result) {
    var items;
    var notes;
    if (isBundle() && bundleItems.length) {
      items = sortedBundleItems(bundleItems).map(function (item) {
        return { name: item.productName, quantity: bundleQuantity(item), price: item.price, image: catalogueImagePath(item.sourceId) };
      });
      notes = bundleNotesFromField(value("designDetails"));
    } else {
      var quantity = Number(value("quantity"));
      items = [{ name: value("productName").trim(), quantity: Number.isInteger(quantity) && quantity >= 1 && quantity <= 100 ? quantity : 1, price: String(seed.price || "").trim(), image: catalogueImagePath(seed.sourceId) }];
      // The field starts with the pre-filled design text; only what the shopper added is their note.
      var details = value("designDetails");
      var prefilled = String(seed.designDetails || "");
      notes = prefilled && details.indexOf(prefilled) === 0 ? details.slice(prefilled.length) : details === prefilled ? "" : details;
    }
    return { requestId: String(result && result.requestId || value("requestId")), items: items, fulfillment: value("fulfillment"), notes: String(notes || "").trim().slice(0, 300).trim() };
  }
  // The Google purchase event (google.js, after the shopper accepted cookies): the request ID and, for each product with a
  // page, its product ID, price and quantity. Never a name, phone, address, product name or note.
  function priceNumber(text) {
    var match = /^\u20b9\s?([\d,]+)$/.exec(String(text || "").trim());
    return match ? Number(match[1].replace(/,/g, "")) : null;
  }
  function productSlug(sourceId) {
    var imagePath = catalogueImagePath(sourceId);
    if (!imagePath) return "";
    try {
      var link = document.querySelector('a[data-product-slug][href="' + imagePath + '"]');
      return link ? String(link.getAttribute("data-product-slug") || "") : "";
    } catch (error) { return ""; }
  }
  function purchaseItems() {
    var lines;
    if (isBundle() && bundleItems.length) {
      lines = sortedBundleItems(bundleItems).map(function (item) { return { sourceId: item.sourceId, price: item.price, quantity: bundleQuantity(item) }; });
    } else {
      var quantity = Number(value("quantity"));
      lines = [{ sourceId: seed.sourceId, price: seed.price, quantity: Number.isInteger(quantity) && quantity >= 1 && quantity <= 100 ? quantity : 1 }];
    }
    var items = [];
    lines.forEach(function (line) {
      var slug = productSlug(line.sourceId);
      if (!slug) return;
      var item = { item_id: slug, quantity: line.quantity };
      var price = priceNumber(line.price);
      if (price !== null) item.price = price;
      items.push(item);
    });
    return items;
  }
  // known: { items, total } already worked out (a paid order reports the server's total); otherwise the form's own items.
  function reportPurchase(result, known) {
    try {
      if (!window.saloniGoogle || typeof window.saloniGoogle.purchase !== "function") return;
      var items = known ? known.items : purchaseItems();
      var total = known ? known.total : items.reduce(function (sum, item) { return sum + (item.price || 0) * item.quantity; }, 0);
      window.saloniGoogle.purchase({ transaction_id: String(result && result.requestId || value("requestId")), value: total, items: items });
    } catch (error) {}
  }
  function saveMyOrder(result, summary) {
    var store = window.saloniMyOrders;
    if (!store || typeof store.save !== "function") return;
    try { store.save(summary || myOrderSummary(result)); } catch (error) {}
  }
  function showSuccess(result, attempt) {
    if (attempt && !isCurrent(attempt)) return;
    restoreSubmitState(attempt);
    form.querySelectorAll("fieldset, #submit-button").forEach(function (element) { element.hidden = true; });
    if (moreDetails) moreDetails.hidden = true;
    anotherButton.hidden = false;
    var referralMessage = result.referralCode ? " Referral code accepted: " + result.referralCode + "." : " No partner credit was recorded for this request.";
    if (onSent) {
      try { onSent(repeatProfileFromForm()); } catch (error) {}
    }
    saveMyOrder(result);
    track("order-sent");
    reportPurchase(result);
    // A visual "it worked" moment, so shoppers know without reading; the status text stays the accessible message.
    if (celebration) celebration.hidden = false;
    setStatus("Request received. Saloni will contact you to confirm the design, price, and delivery. Production is not confirmed." + referralMessage + " Request ID: " + result.requestId, "success");
    if (status.focus) { status.setAttribute("tabindex", "-1"); status.focus(); }
  }
  function validIsoDate(text) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    var parts = text.split("-").map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
  }
  function istToday() { return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10); }
  function fieldError(name) {
    var text = value(name);
    if (name === "phone") return text.length <= 40 && /^(?:\+91|91|0)?[6-9]\d{9}$/.test(text.replace(/[\s\-()]/g, "")) ? "" : "Enter a 10-digit mobile number, e.g. 98765 43210.";
    if (name === "customerName") return text.replace(/[\s0-9.,'’"\-_()\/&@#!?:;]/g, "").length >= 2 ? "" : "Enter your name (at least 2 letters).";
    if (name === "pin") return value("fulfillment") !== "shipping" && !isQuoteRequest() || /^[1-9]\d{5}$/.test(text) ? "" : "Enter a valid 6-digit PIN code.";
    if (name === "shippingAddress") return value("fulfillment") !== "shipping" || isQuoteRequest() || text.trim().length >= 10 ? "" : "Enter the full shipping address.";
    if (name === "requestedDate") return !text ? "" : !validIsoDate(text) ? "Use a valid requested date." : text < istToday() ? "Choose today or a later date." : "";
    return "";
  }
  var inlineFields = ["customerName", "phone", "shippingAddress", "pin", "requestedDate"];
  function clearError(field) {
    var input = fieldInput(field);
    if (!input) return;
    input.removeAttribute("aria-invalid");
    var describedBy = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter(function (id) { return id && id !== field + "-error"; });
    if (describedBy.length) input.setAttribute("aria-describedby", describedBy.join(" ")); else input.removeAttribute("aria-describedby");
    var error = document.getElementById(field + "-error");
    if (error && error.remove) error.remove();
  }
  function validateField(field) {
    var message = fieldError(field);
    if (message) setError(field, message); else clearError(field);
  }
  function dimensionErrors(feetText, inchesText, label, feetKey, inchesKey, errors) {
    var feet = Number(feetText);
    var inches = Number(inchesText);
    if (!/^\d+$/.test(feetText) || !Number.isInteger(feet) || feet < 0) errors[feetKey] = label + " feet must be a whole, non-negative number.";
    if (!/^\d+(\.\d+)?$/.test(inchesText) || !Number.isFinite(inches) || inches < 0 || inches >= 12) errors[inchesKey] = label + " inches must be from 0 up to (but not including) 12.";
    var total = feet * 12 + inches;
    if (Number.isFinite(total) && total <= 0) errors[feetKey] = label + " must be greater than 0 inches.";
    if (Number.isFinite(total) && total > 60) errors[feetKey] = label + " must be no more than 60 inches.";
  }
  function optionalSizeErrors(texts, keyFor, errors) {
    var filled = SIZE_PARTS.some(function (part) { return String(texts[part] || "").trim() !== ""; });
    if (!filled) return;
    [["height", "Height"], ["width", "Width"]].forEach(function (axis) {
      var feetText = String(texts[axis[0] + "Feet"] || "").trim();
      var inchesText = String(texts[axis[0] + "InchesPart"] || "").trim();
      if (!feetText && !inchesText) errors[keyFor(axis[0] + "Feet")] = "Enter both height and width, or leave both blank.";
      else dimensionErrors(feetText || "0", inchesText || "0", axis[1], keyFor(axis[0] + "Feet"), keyFor(axis[0] + "InchesPart"), errors);
    });
  }
  function fillBlankSizeParts() {
    ["height", "width"].forEach(function (axis) {
      var feet = form.elements[axis + "Feet"];
      var inches = form.elements[axis + "InchesPart"];
      var feetBlank = !String(feet.value || "").trim();
      var inchesBlank = !String(inches.value || "").trim();
      if (feetBlank !== inchesBlank) { if (feetBlank) feet.value = "0"; else inches.value = "0"; }
    });
  }
  function clientValidationErrors() {
    var errors = {};
    function required(name, message) { if (!value(name).trim()) errors[name] = message; }
    required("productName", "This field is required.");
    var quantity = Number(value("quantity"));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) errors.quantity = "Enter a quantity from 1 to 100.";
    if (dimensionsRequired()) {
      dimensionErrors(value("heightFeet"), value("heightInchesPart"), "Height", "heightFeet", "heightInchesPart", errors);
      dimensionErrors(value("widthFeet"), value("widthInchesPart"), "Width", "widthFeet", "widthInchesPart", errors);
    } else if (isBundle()) {
      bundleItems.forEach(function (item, index) {
        optionalSizeErrors(item.customSize, function (part) { return "bundle-size-" + index + "-" + part; }, errors);
      });
    } else {
      optionalSizeErrors({ heightFeet: value("heightFeet"), heightInchesPart: value("heightInchesPart"), widthFeet: value("widthFeet"), widthInchesPart: value("widthInchesPart") }, function (part) { return part; }, errors);
    }
    required("designDetails", "This field is required.");
    inlineFields.forEach(function (name) { var message = fieldError(name); if (message) errors[name] = message; });
    if (value("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value("email"))) errors.email = "Enter a valid email address or leave it blank.";
    var fulfillment = value("fulfillment");
    if (["shipping", "pickup"].indexOf(fulfillment) === -1) errors.fulfillment = "Choose shipping or pickup.";
    var quoteRequest = isQuoteRequest();
    if (fulfillment === "shipping") {
      if (!quoteRequest) {
        required("city", "City is required.");
        required("state", "State is required.");
      }
    }
    return errors;
  }
  var ORDER_FIELDS = ["requestId", "requestStage", "sourceKind", "sourceId", "productName", "quantity", "dimensionFormat", "heightFeet", "heightInchesPart", "widthFeet", "widthInchesPart", "designDetails", "customerName", "phone", "email", "fulfillment", "shippingAddress", "city", "state", "pin", "requestedDate", "referralCode", "bundleSourceIds"];
  function orderPayload() {
    var payload = {};
    ORDER_FIELDS.forEach(function (field) { payload[field] = value(field); });
    // Where the visit came from (google.js); not a form field, so it is not in ORDER_FIELDS.
    try { payload.visitSource = window.saloniVisitSource ? String(window.saloniVisitSource.read() || "") : ""; } catch (error) { payload.visitSource = ""; }
    return payload;
  }
  function imageMimeType(image) {
    var type = String(image.blob.type || "").toLowerCase();
    if (type === "image/jpeg" || type === "image/png") return type;
    return /\.png$/i.test(image.name) ? "image/png" : "image/jpeg";
  }
  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new window.FileReader();
      reader.onload = function () {
        var text = String(reader.result || "");
        var comma = text.indexOf(",");
        resolve(comma === -1 ? "" : text.slice(comma + 1));
      };
      reader.onerror = function () { reject(new Error("The image could not be read")); };
      reader.readAsDataURL(blob);
    });
  }
  // Adds the reCAPTCHA token (when the page has a site key) and the attached image, then calls send().
  function prepareAndSend(attempt, payload, image, send) {
    withCaptcha(function (token) {
      if (!isCurrent(attempt)) return;
      if (captchaKey()) payload.captchaToken = token;
      if (!image) { send(); return; }
      blobToBase64(image.blob).then(function (data) {
        if (!isCurrent(attempt)) return;
        payload.referenceImage = { type: imageMimeType(image), data: data };
        send();
      }, function () {
        if (isCurrent(attempt)) showFailure("The reference image could not be read. Remove it or choose it again.", { referenceImage: "The reference image could not be read." }, attempt);
      });
    });
  }
  function sendOrder(attempt, payload) {
    postJson("order", payload).then(function (result) {
      if (!isCurrent(attempt)) return;
      if (result && result.ok === true) showSuccess(result, attempt);
      else if (result && result.errors && typeof result.errors === "object") showFailure("Please correct the highlighted fields and try again.", result.errors, attempt);
      else showFailure(UNCONFIRMED, null, attempt);
    }, function () {
      if (!isCurrent(attempt)) return;
      showFailure(UNCONFIRMED, null, attempt);
    });
  }
  function resetFormState(requestId) {
    clearAttachment();
    setReferencePreparing(false);
    restoreSubmitState();
    currentAttempt = null;
    pendingPayment = null;
    paymentRetry = false;
    referenceHiddenByCheckout = false;
    if (celebration) celebration.hidden = true;
    if (successTitle) successTitle.textContent = REQUEST_TITLE_TEXT;
    form.reset();
    form.querySelectorAll("fieldset, #submit-button").forEach(function (element) { element.hidden = false; });
    anotherButton.hidden = true; clearErrors(); setStatus("", "");
    if (moreDetails) { moreDetails.hidden = false; moreDetails.open = false; }
    applySeed(seed);
    if (requestId) form.elements.requestId.value = requestId;
    clearReferralStatus();
  }

  form.addEventListener("change", function () {
    toggleShipping(); updateDimensionMaxes(); renderCheckout();
    inlineFields.forEach(function (name) { if (form.elements[name] && form.elements[name].getAttribute("aria-invalid") === "true") validateField(name); });
  });
  inlineFields.forEach(function (name) {
    var input = form.elements[name];
    if (!input) return;
    input.addEventListener("blur", function () { validateField(name); });
    input.addEventListener("input", function () {
      if (input.getAttribute("aria-invalid") === "true") validateField(name);
      if (name === "pin") renderCheckout();
    });
  });
  if (form.elements.requestedDate) form.elements.requestedDate.setAttribute("min", istToday());
  if (form.elements.designDetails) form.elements.designDetails.addEventListener("input", function () {
    if (isBundle() && !syncingBundleFields) bundleNotes = bundleNotesFromField(value("designDetails"));
  });
  if (referenceImage) referenceImage.addEventListener("change", handleReferenceImageChange);
  if (removeReferenceImageButton) removeReferenceImageButton.addEventListener("click", removeAttachedImage);
  if (referralInput) { referralInput.addEventListener("input", clearReferralStatus); referralInput.addEventListener("change", clearReferralStatus); }
  if (checkReferral) checkReferral.addEventListener("click", checkReferralCode);
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (active) return;
    if (referencePreparing) { setStatus("Preparing your image… please try again in a moment.", ""); return; }
    // A quantity the shopper typed that cannot be sent is shown and focused before anything else is checked.
    if (isBundle() && blockInvalidQuantities()) return;
    if (isBundle()) updateBundleScalars(true);
    else if (!dimensionsRequired()) fillBlankSizeParts();
    clearErrors();
    var validationErrors = clientValidationErrors();
    if (Object.keys(validationErrors).length) {
      showFailure("Please correct the highlighted fields and try again.", validationErrors);
      return;
    }
    var attempt = { id: newRequestId() };
    currentAttempt = attempt;
    active = true;
    submitButton.disabled = true;
    var image = attachedImage;
    var quote = checkoutQuote();
    if (quote) { startPayment(attempt, quote); return; }
    setStatus(image && image.preview ? "Sending your request and design preview…" : "Sending your request…", "");
    timeoutId = window.setTimeout(function () {
      if (!isCurrent(attempt)) return;
      attempt.stillSending = true;
      setStatus("Still sending – please keep this window open. Your request is on its way and usually finishes within a minute.", "");
      if (status.focus) { status.setAttribute("tabindex", "-1"); status.focus(); }
    }, 30000);
    var payload = orderPayload();
    prepareAndSend(attempt, payload, image, function () { sendOrder(attempt, payload); });
  });
  anotherButton.addEventListener("click", function () {
    var hadCustomizerPreview = isCustomizerOrderRequest();
    resetFormState(newRequestId());
    if (hadCustomizerPreview) setReferenceImageStatus("This is a new request. Return to the designer and choose \"Request this design\" again for a new generated preview.");
  });

  // Starts a fresh form for one request. Called by script.js each time the shopper chooses something to order.
  function open(nextSeed, options) {
    options = options || {};
    seed = nextSeed && typeof nextSeed === "object" ? nextSeed : {};
    onSent = typeof options.onSent === "function" ? options.onSent : null;
    onPaid = typeof options.onPaid === "function" ? options.onPaid : null;
    resetFormState(seed.requestId ? String(seed.requestId) : newRequestId());
    if (isCustomizerOrderRequest()) {
      if (validPreviewBlob(options.previewBlob)) attachCustomizerPreview(options.previewBlob);
      else setReferenceImageStatus("The customizer preview could not be attached. You can still send your request.", "error");
    }
    form.hidden = false;
    checkoutCopyHidden = false;
    if (intro) intro.hidden = false;
    if (finalQuoteNote) finalQuoteNote.hidden = false;
    renderCheckout();
  }
  window.saloniOrderForm = { open: open };
}());
