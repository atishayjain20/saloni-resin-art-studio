const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Form.html"), "utf8");
const formSource = html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1]
  .replace(/<\?!= captchaEnabledJson \?>/g, "true")
  .replace(/<\?!= captchaSiteKeyJson \?>/g, JSON.stringify("site-key"));
const formSourceWithoutCaptchaSiteKey = formSource.replace('var captchaSiteKey = "site-key";', 'var captchaSiteKey = "";');

test("targets the top-level studio page rather than the immediate parent frame", () => {
  assert.match(formSource, /window\.top\.postMessage/);
  assert.doesNotMatch(formSource, /window\.parent\.postMessage/);
});

test("announces a seeded embedded form even when CAPTCHA has no site key", () => {
  const runtime = makeFormRuntime({ captchaSiteKey: "" });
  const ready = runtime.parentMessages.find((entry) => entry.message.type === "saloni-order-form-ready");
  assert.ok(ready);
  assert.equal(ready.message.nonce, "nonce-seed-123456");
  assert.equal(ready.message.siteKey, "");
});

test("customizer handoff copy does not ask customers to download or reattach a preview", () => {
  const status = html.match(/<p id="reference-image-status"[^>]*>[\s\S]*?<\/p>/)?.[0] || "";
  assert.match(status, /Optional: attach a separate reference image if it helps/);
  assert.match(status, /Customizer designs transfer directly with your request/);
  assert.doesNotMatch(status, /download it first|reattach/i);
});

test("keeps optional partner referral controls behind a collapsed native disclosure", () => {
  const disclosure = html.match(/<details class="referral-disclosure">[\s\S]*?<\/details>/)?.[0] || "";
  assert.match(disclosure, /<summary>Have a referral code\?<\/summary>/);
  assert.doesNotMatch(disclosure, /<details[^>]+\bopen\b/);
  assert.match(disclosure, /<label for="referral-code">Partner referral code \(optional\)[\s\S]*?name="referralCode"/);
  assert.match(disclosure, /<button id="check-referral"[^>]*>Check code<\/button>/);
  assert.match(disclosure, /<p id="referral-status"[^>]*>A code is optional\./);
});

test("has no remember checkbox or forget control and states the automatic 30-day device-only save", () => {
  assert.doesNotMatch(html, /id="remember-repeat-profile"|Remember my name, phone, and delivery details/);
  assert.doesNotMatch(html, /If you choose to remember them/);
  assert.match(html, /After you send a request, your name, phone, and delivery details are kept only in this browser for up to 30 days/);
  assert.doesNotMatch(html, /id="forget-repeat-profile"|Forget saved details on this device/);
  assert.doesNotMatch(html, /saloni-order-clear-repeat-profile/);
});

test("catalogue order form shows product context without internal metadata or mandatory dimensions", () => {
  const selectedDesign = html.match(/<fieldset>[\s\S]*?<legend>Selected design<\/legend>[\s\S]*?<\/fieldset>/)?.[0] || "";
  const dimensions = html.match(/<fieldset>[\s\S]*?<legend>What should Saloni make\?<\/legend>[\s\S]*?<\/fieldset>/)?.[0] || "";

  assert.match(selectedDesign, /<img[^>]+id="product-image"[^>]+alt=/);
  assert.match(selectedDesign, /id="product-name"/);
  assert.match(html, /<input id="request-id"[^>]+type="hidden"/);
  assert.match(html, /<input id="request-stage"[^>]+type="hidden"/);
  assert.match(html, /<input id="source-kind"[^>]+type="hidden"/);
  assert.match(html, /<input id="source-id"[^>]+type="hidden"/);
  assert.doesNotMatch(selectedDesign, />\s*Request ID\s*</);
  assert.doesNotMatch(selectedDesign, />\s*Source\s*</);
  assert.doesNotMatch(selectedDesign, />\s*Source ID\s*</);
  ["height-feet", "height-inches-part", "width-feet", "width-inches-part"].forEach((id) => {
    assert.doesNotMatch(dimensions, new RegExp(`id="${id}"[^>]+required`));
  });
  assert.match(formSource, /sourceKind[\s\S]*customizer[\s\S]*heightFeet/);
});

test("catalogue quote context is safe and customizer dimensions remain selected", () => {
  const standard = makeFormRuntime({ sourceId: "catalogue:romantic-heart-trinket-tray.webp" });
  assert.equal(standard.elements.get("product-context").hidden, false);
  assert.equal(standard.fields.requestStage.value, "quote");
  assert.equal(standard.elements.get("product-image").getAttribute("src"), "https://saloniresinart.com/assets/romantic-heart-trinket-tray.webp");
  assert.equal(standard.elements.get("product-image").getAttribute("alt"), "Test frame product photo");
  assert.equal(standard.elements.get("dimension-fields").hidden, true);
  assert.equal(standard.elements.get("shipping-fields").hidden, true);
  ["height-feet", "height-inches-part", "width-feet", "width-inches-part"].forEach((id) => assert.equal(standard.elements.get(id).getAttribute("required"), ""));

  const general = makeFormRuntime({ sourceId: "catalogue:general-custom-gift" });
  assert.equal(general.elements.get("product-context").hidden, true);
  assert.equal(general.elements.get("product-image").getAttribute("src"), "");

  const unsafe = makeFormRuntime({ sourceId: "catalogue:not-an-allowlisted-photo.webp" });
  assert.equal(unsafe.elements.get("product-context").hidden, true);
  assert.equal(unsafe.elements.get("product-image").getAttribute("src"), "");

  const customizer = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  assert.equal(customizer.elements.get("product-context").hidden, true);
  assert.equal(customizer.elements.get("dimension-fields").hidden, false);
  ["height-feet", "height-inches-part", "width-feet", "width-inches-part"].forEach((id) => assert.equal(customizer.elements.get(id).getAttribute("required"), "required"));
});

test("multi-item catalogue requests show only the item list, without repeated product name or bundle copy", () => {
  const runtime = makeFormRuntime({
    sourceId: "catalogue:multi-item",
    bundleItems: [
      { sourceId: "catalogue:one.webp", productName: "One", price: "249", size: "4 in", quantity: 1 },
      { sourceId: "catalogue:two.webp", productName: "Two", price: "399", size: "6 in", quantity: 2 },
    ],
  });
  assert.equal(runtime.elements.get("product-context").hidden, true);
  assert.equal(runtime.elements.get("product-image").getAttribute("src"), "");
  assert.equal(runtime.elements.get("product-name-row").hidden, true);
  assert.equal(runtime.elements.get("product-name-hint").hidden, true);
  assert.equal(runtime.elements.get("bundle-items").hidden, false);
  assert.equal(runtime.fields.productName.value, "One + 1 more");
  assert.doesNotMatch(html, /These catalogue items will be reviewed together in one request/);
  assert.doesNotMatch(html, /id="bundle-product-copy"/);
  assert.doesNotMatch(html, /Saved only in this browser/);
  assert.doesNotMatch(html, /The bundle name and total quantity follow your selected items/);
  const single = makeFormRuntime({ sourceId: "catalogue:romantic-heart-trinket-tray.webp" });
  assert.equal(single.elements.get("product-name-row").hidden, false);
  assert.equal(single.elements.get("product-name-hint").hidden, false);
});

test("bundle form renders every selected item and rebuilds authoritative quantities", async () => {
  const runtime = makeFormRuntime({
    sourceId: "catalogue:multi-item", productName: "3 selected catalogue items",
    bundleItems: [
      { sourceId: "catalogue:one.webp", productName: "One", price: "249", size: "4 in", quantity: 2 },
      { sourceId: "catalogue:two.webp", productName: "Two", price: "399", size: "6 in", quantity: 5 },
      { sourceId: "catalogue:three.webp", productName: "Three", price: "499", size: "8 in", quantity: 1 },
      { sourceId: "catalogue:four.webp", productName: "Four", price: "599", size: "10 in", quantity: 1 },
    ],
  });
  const list = runtime.elements.get("bundle-items");
  assert.equal(list.children.length, 4);
  assert.deepEqual(list.children.map((line) => line.getAttribute("data-product-name")), ["One", "Two", "Three", "Four"]);
  const quantities = list.children.map((line) => line.querySelector("input"));
  quantities[0].value = "2"; quantities[1].value = "5"; quantities[2].value = "1"; quantities[3].value = "0";
  quantities[3].dispatch("change");
  assert.equal(quantities[3].value, "1");
  quantities[3].value = "1";
  fillValid(runtime.fields);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  respondToken(runtime, 0);
  await Promise.resolve();
  assert.equal(runtime.fields.quantity.value, "9");
  assert.equal(runtime.fields.productName.value, "Four + 3 more");
  assert.match(runtime.fields.designDetails.value, /One .*4 in .*₹?249.* Qty 2/);
  assert.match(runtime.fields.designDetails.value, /Two .*Qty 5/);
  assert.match(runtime.fields.designDetails.value, /Three .*Qty 1/);
  assert.match(runtime.fields.designDetails.value, /Four .*Qty 1/);
  assert.doesNotMatch(runtime.fields.designDetails.value, /Source:|catalogue:|Quantity:/);
  assert.equal(runtime.fields.bundleSourceIds.value, "catalogue:four.webp x1, catalogue:one.webp x2, catalogue:three.webp x1, catalogue:two.webp x5");
});

test("bundle Product name shows the first product and a count of the rest", () => {
  assert.match(html, /name="productName" maxlength="2000"/);
  const runtime = makeFormRuntime({
    sourceId: "catalogue:multi-item",
    bundleItems: [
      { sourceId: "catalogue:one.webp", productName: "One", price: "249", size: "4 in", quantity: 1 },
      { sourceId: "catalogue:two.webp", productName: "Two", price: "399", size: "6 in", quantity: 1 },
      { sourceId: "catalogue:three.webp", productName: "Three", price: "499", size: "8 in", quantity: 1 },
    ],
  });
  assert.equal(runtime.fields.productName.value, "One + 2 more");
  assert.equal(runtime.fields.bundleSourceIds.value, "catalogue:one.webp x1, catalogue:three.webp x1, catalogue:two.webp x1");
});

test("bundle quantity changes rebuild details without stale quantities before shared notes", () => {
  const runtime = makeFormRuntime({
    sourceId: "catalogue:multi-item",
    bundleItems: [
      { sourceId: "catalogue:one.webp", productName: "One", price: "249", size: "4 in", quantity: 2 },
      { sourceId: "catalogue:two.webp", productName: "Two", price: "399", size: "6 in", quantity: 1 },
    ],
  });
  const notes = "Please use warm colours";
  runtime.fields.designDetails.value = [
    "One \u00b7 4 in \u00b7 249 \u00b7 Qty 2",
    "Two \u00b7 6 in \u00b7 399 \u00b7 Qty 1",
    "Order notes: " + notes,
  ].join("\n");
  runtime.fields.designDetails.dispatch("input");

  const firstQuantity = runtime.elements.get("bundle-items").children[0].querySelector("input");
  firstQuantity.value = "3";
  firstQuantity.dispatch("change");

  assert.equal(runtime.fields.designDetails.value, [
    "One \u00b7 4 in \u00b7 249 \u00b7 Qty 3",
    "Two \u00b7 6 in \u00b7 399 \u00b7 Qty 1",
    "Order notes: " + notes,
  ].join("\n"));
  assert.equal(runtime.fields.bundleSourceIds.value, "catalogue:one.webp x3, catalogue:two.webp x1");
});

test("bundle form keeps shared contact and delivery controls singular and scopes scrolling to selected designs", () => {
  assert.equal((html.match(/name="customerName"/g) || []).length, 1);
  assert.equal((html.match(/name="fulfillment"/g) || []).length, 1);
  assert.equal((html.match(/name="shippingAddress"/g) || []).length, 1);
  assert.match(html, /id="bundle-items"[^>]*class="bundle-items"/);
  assert.match(html, /\.bundle-items\s*\{[^}]*max-height:[^}]*overflow-y:\s*auto/s);
});

test("bundle details omit missing size and price parts and never show internal source ids", () => {
  const runtime = makeFormRuntime({
    sourceId: "catalogue:multi-item",
    bundleItems: [{ sourceId: "catalogue:solo.webp", productName: "Solo", price: "", size: "", quantity: 1 }],
  });
  assert.equal(runtime.fields.productName.value, "Solo");
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.fields.designDetails.value, "Solo \u00b7 Qty 1");
  assert.equal(runtime.fields.bundleSourceIds.value, "catalogue:solo.webp x1");
});

test("non-bundle requests never send bundleSourceIds", () => {
  const runtime = makeFormRuntime({ sourceId: "catalogue:romantic-heart-trinket-tray.webp" });
  assert.equal(runtime.fields.bundleSourceIds.value, "");
});

test("after a successful send More details is hidden and Start another brings it back closed", async () => {
  const runtime = makeFormRuntime();
  const details = runtime.elements.get("more-details");
  assert.equal(details.hidden, false);
  fillValid(runtime.fields);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  respondToken(runtime, 0);
  await Promise.resolve();
  runtime.callbacks[0].success({ ok: true, requestId: "request-seed", receivedAt: "now" });
  assert.equal(details.hidden, true);
  runtime.elements.get("another-button").dispatch("click");
  assert.equal(details.hidden, false);
  assert.equal(details.open, false);
});

test("keeps only the required fields visible and groups optional fields in a closed More details disclosure", () => {
  const more = html.match(/<details class="more-details" id="more-details">[\s\S]*?<\/details>\s*(?=<fieldset>\s*<legend>Optional reference image)/)?.[0] || "";
  assert.match(more, /<summary>More details \(optional\)<\/summary>/);
  assert.doesNotMatch(more.split("\n")[0], /\bopen\b/);
  ["email", "requested-date", "referral-code"].forEach((id) => assert.match(more, new RegExp(`id="${id}"`)));
  ["customer-name", "phone", "fulfillment", "shipping-address", "pin", "reference-image"].forEach((id) => assert.doesNotMatch(more, new RegExp(`id="${id}"`)));
  assert.match(html, /\.more-details > summary \{[^}]*min-height: 44px/);
  const details = html.match(/<legend>Your details<\/legend>[\s\S]*?<\/fieldset>/)[0];
  ["customer-name", "phone", "fulfillment", "shipping-address", "pin"].forEach((id) => assert.match(details, new RegExp(`id="${id}"`)));
  ["email", "requested-date", "referral-code"].forEach((id) => assert.doesNotMatch(details, new RegExp(`id="${id}"`)));
  assert.match(html, /<input id="bundle-source-ids" name="bundleSourceIds" type="hidden">/);
});

test("More details opens for a field error and starts open only for seeded optional values or customizer previews", async () => {
  const plain = makeFormRuntime();
  assert.equal(plain.elements.get("more-details").open, false);
  const emailError = makeFormRuntime();
  fillValid(emailError.fields);
  emailError.fields.email.value = "not-an-email";
  emailError.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  assert.equal(emailError.elements.get("more-details").open, true);
  assert.equal(emailError.fields.email.focused, true);
  const serverError = makeFormRuntime();
  fillValid(serverError.fields);
  serverError.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  respondToken(serverError, 0);
  await Promise.resolve();
  assert.equal(serverError.elements.get("more-details").open, false);
  serverError.callbacks[0].success({ ok: false, errors: { referralCode: "Enter a valid referral code or clear this field." } });
  assert.equal(serverError.elements.get("more-details").open, true);
  assert.equal(serverError.fields.referralCode.focused, true);
  for (const seedOverrides of [{ email: "a@b.co" }, { requestedDate: "2026-12-01" }, { referralCode: "ABC123" }]) {
    assert.equal(makeFormRuntime({ seedOverrides }).elements.get("more-details").open, true);
  }
  const customizer = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  assert.equal(customizer.elements.get("more-details").open, true);
});

const serverSource = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8");
const serverContext = { console, Number, String, JSON, Date, RegExp, Math, isFinite, Utilities: { getUuid: () => "00000000-0000-4000-8000-000000000000" } };
vm.createContext(serverContext);
vm.runInContext(serverSource, serverContext, { filename: "Code.gs" });
const MESSAGES = {
  phone: "Enter a 10-digit mobile number, e.g. 98765 43210.",
  customerName: "Enter your name (at least 2 letters).",
  pin: "Enter a valid 6-digit PIN code.",
  requestedDate: "Choose today or a later date.",
  shippingAddress: "Enter the full shipping address.",
};
function istDate(offsetDays) {
  return new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);
}
function errorText(runtime, field) {
  const error = runtime.errors.find((entry) => entry.id === field + "-error");
  return error ? error.textContent : "";
}
function shippingRuntime() {
  const runtime = makeFormRuntime({ requestStage: "", sourceKind: "general", sourceId: "general:custom" });
  runtime.fields.fulfillment.value = "shipping";
  runtime.fields.fulfillment.dispatch("change");
  runtime.elements.get("order-form").dispatch("change");
  return runtime;
}

test("client and server use identical messages for the contact validation rules", () => {
  Object.values(MESSAGES).forEach((message) => {
    assert.ok(html.includes(JSON.stringify(message)), "Form.html is missing: " + message);
    assert.ok(serverSource.includes(JSON.stringify(message)), "Code.gs is missing: " + message);
  });
});

test("client and server accept and reject the same phones, names, and PINs", () => {
  const phones = ["8209238541", "98765 43210", "+91 8209238541", "+91-98765-43210", "918209238541", "08209238541", "(+91) 98765 43210", "1234567", "5876543210", "98765", "+1 8209238541", "", "98765432101"];
  const names = ["A Customer", "Al", "Saloni", "राम", "ગીતા", "முருகன்", "প্রিয়া", "ਹਰਪ੍ਰੀਤ", "Mary-Jane O'Neil", "Åsa", "राधा शर्मा", "A", "12", "", " ", "  ", "--", "A1"];
  const pins = ["305001", "012345", "30500", "3050011", "", "30500a"];
  const check = (field, values, serverValid) => values.forEach((fieldValue) => {
    const runtime = makeFormRuntime();
    runtime.fields[field].value = fieldValue;
    runtime.fields[field].dispatch("blur");
    const clientRejects = runtime.fields[field].getAttribute("aria-invalid") === "true";
    assert.equal(clientRejects, !serverValid(fieldValue), field + " " + JSON.stringify(fieldValue));
  });
  check("phone", phones, (value) => serverContext.validIndianMobile_(value));
  check("customerName", names, (value) => serverContext.validCustomerName_(value));
  const shipping = (pin) => { const runtime = shippingRuntime(); runtime.fields.pin.value = pin; runtime.fields.pin.dispatch("blur"); return runtime.fields.pin.getAttribute("aria-invalid") === "true"; };
  pins.forEach((pin) => assert.equal(shipping(pin), !serverContext.validPin_(pin), "pin " + JSON.stringify(pin)));
});

test("blur validates a field with the shared rule, input revalidates only after an error, and fixing clears it", () => {
  const runtime = makeFormRuntime();
  const phone = runtime.fields.phone;
  phone.value = "12345";
  phone.dispatch("input");
  assert.equal(phone.getAttribute("aria-invalid"), "");
  phone.dispatch("blur");
  assert.equal(phone.getAttribute("aria-invalid"), "true");
  assert.match(phone.getAttribute("aria-describedby"), /phone-error/);
  assert.equal(errorText(runtime, "phone"), MESSAGES.phone);
  phone.value = "98765 43210";
  phone.dispatch("input");
  assert.equal(phone.getAttribute("aria-invalid"), "");
  assert.equal(phone.getAttribute("aria-describedby"), "");
  assert.equal(errorText(runtime, "phone"), "");
  phone.value = "1";
  phone.dispatch("input");
  assert.equal(phone.getAttribute("aria-invalid"), "");
  phone.dispatch("blur");
  assert.equal(phone.getAttribute("aria-invalid"), "true");
  phone.value = "12";
  phone.dispatch("input");
  assert.equal(errorText(runtime, "phone"), MESSAGES.phone);
  assert.equal(runtime.errors.filter((entry) => entry.id === "phone-error").length, 1);
  const name = runtime.fields.customerName;
  name.value = "A"; name.dispatch("blur");
  assert.equal(errorText(runtime, "customerName"), MESSAGES.customerName);
  name.value = "Asha"; name.dispatch("blur");
  assert.equal(name.getAttribute("aria-invalid"), "");
});

test("shipping address and PIN validate inline only when they apply and use the shared messages", () => {
  const pickup = makeFormRuntime({ requestStage: "", sourceKind: "general", sourceId: "general:custom" });
  pickup.fields.pin.value = "12"; pickup.fields.pin.dispatch("blur");
  pickup.fields.shippingAddress.value = "x"; pickup.fields.shippingAddress.dispatch("blur");
  assert.equal(pickup.fields.pin.getAttribute("aria-invalid"), "");
  assert.equal(pickup.fields.shippingAddress.getAttribute("aria-invalid"), "");
  const runtime = shippingRuntime();
  runtime.fields.shippingAddress.value = "Ajmer"; runtime.fields.shippingAddress.dispatch("blur");
  runtime.fields.pin.value = "012345"; runtime.fields.pin.dispatch("blur");
  assert.equal(errorText(runtime, "shippingAddress"), MESSAGES.shippingAddress);
  assert.equal(errorText(runtime, "pin"), MESSAGES.pin);
  runtime.fields.shippingAddress.value = "12 Hathi Bhata Road"; runtime.fields.shippingAddress.dispatch("input");
  runtime.fields.pin.value = "305001"; runtime.fields.pin.dispatch("input");
  assert.equal(runtime.fields.shippingAddress.getAttribute("aria-invalid"), "");
  assert.equal(runtime.fields.pin.getAttribute("aria-invalid"), "");
  const quote = makeFormRuntime();
  quote.fields.pin.value = "012345"; quote.fields.pin.dispatch("blur");
  assert.equal(errorText(quote, "pin"), MESSAGES.pin);
});

test("requested date gets today as its minimum and rejects earlier dates inline", () => {
  const runtime = makeFormRuntime();
  assert.equal(runtime.fields.requestedDate.getAttribute("min"), istDate(0));
  runtime.fields.requestedDate.value = istDate(-1); runtime.fields.requestedDate.dispatch("blur");
  assert.equal(errorText(runtime, "requestedDate"), MESSAGES.requestedDate);
  runtime.fields.requestedDate.value = istDate(0); runtime.fields.requestedDate.dispatch("input");
  assert.equal(runtime.fields.requestedDate.getAttribute("aria-invalid"), "");
  runtime.fields.requestedDate.value = ""; runtime.fields.requestedDate.dispatch("blur");
  assert.equal(runtime.fields.requestedDate.getAttribute("aria-invalid"), "");
  assert.match(html, /id="pin"[^>]*pattern="\[1-9\]\[0-9\]\{5\}"/);
});

test("an invalid optional date opens More details and the submit reports every contact error at once", () => {
  const runtime = shippingRuntime();
  fillValid(runtime.fields);
  runtime.fields.fulfillment.value = "shipping";
  Object.assign(runtime.fields.phone, { value: "123" });
  Object.assign(runtime.fields.customerName, { value: "A" });
  Object.assign(runtime.fields.shippingAddress, { value: "short" });
  Object.assign(runtime.fields.pin, { value: "012345" });
  Object.assign(runtime.fields.requestedDate, { value: istDate(-3) });
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  ["phone", "customerName", "shippingAddress", "pin", "requestedDate"].forEach((field) => assert.equal(errorText(runtime, field), MESSAGES[field], field));
  assert.equal(runtime.elements.get("more-details").open, true);
  assert.equal(runtime.callbacks.length, 0);
});

test("descriptive catalogue filenames are allowlisted while lookalikes stay hidden", () => {
  const filename = "premium-midnight-blue-tiered-set.jpeg";
  const selected = makeFormRuntime({ sourceId: `catalogue:${filename}` });
  assert.equal(selected.elements.get("product-context").hidden, false);
  assert.equal(selected.elements.get("product-image").getAttribute("src"), `https://saloniresinart.com/assets/${filename}`);

  const unknown = makeFormRuntime({ sourceId: "catalogue:premium-midnight-blue-tiered-set-v2.jpeg" });
  assert.equal(unknown.elements.get("product-context").hidden, true);
  assert.equal(unknown.elements.get("product-image").getAttribute("src"), "");
});

test("customizer form requests one embedded preview port with the seeded identity", () => {
  const runtime = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  const requests = runtime.parentMessages.filter((entry) => entry.message.type === "saloni-preview-request");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].message.type, "saloni-preview-request");
  assert.equal(requests[0].message.version, 1);
  assert.equal(requests[0].message.nonce, "nonce-seed-123456");
  assert.equal(requests[0].message.requestId, "request-seed");
  assert.equal(requests[0].message.mode, "order");
  assert.match(requests[0].message.transferId, /.+/);
  assert.equal(requests[0].targetOrigin, "https://saloniresinart.com");
  assert.equal(requests[0].ports.length, 1);
  assert.equal(requests[0].port, requests[0].ports[0]);
});

test("embedded preview requires the exact customizer source and an explicit true seed flag", () => {
  assert.equal(previewRequests(makeFormRuntime({ sourceKind: "customizer", previewExpected: true })).length, 1);
  for (const options of [
    { sourceKind: "customizer", previewExpected: false },
    { sourceKind: "customizer", omitPreviewExpected: true },
  ]) {
    const runtime = makeFormRuntime(options);
    assert.equal(previewRequests(runtime).length, 0);
    fillValid(runtime.fields);
    runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
    assert.equal(runtime.parentMessages.filter((entry) => entry.message.type === "saloni-order-captcha-request").length, 1);
  }
  assert.equal(previewRequests(makeFormRuntime({ sourceKind: "CUSTOMIZER", previewExpected: true })).length, 0);
});

test("quote shipping accepts a blank address when PIN is valid", async () => {
  const runtime = makeFormRuntime();
  fillValid(runtime.fields);
  runtime.fields.fulfillment.value = "shipping";
  runtime.fields.pin.value = "305001";
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  respondToken(runtime, 0);
  await Promise.resolve();
  assert.equal(runtime.submissions.length, 1);
});

test("quote pickup keeps PIN visible and validates it", async () => {
  const runtime = makeFormRuntime();
  fillValid(runtime.fields);
  assert.equal(runtime.elements.get("pin-field").hidden, false);
  runtime.fields.pin.value = "";
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.submissions.length, 0);
  assert.match(runtime.status.textContent, /correct/i);
  assert.match(runtime.fields.pin.getAttribute("aria-describedby"), /pin-error/);
  runtime.fields.pin.value = "305001";
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  respondToken(runtime, 0);
  await Promise.resolve();
  assert.equal(runtime.submissions.length, 1);
});

test("legacy pickup keeps PIN hidden and optional", async () => {
  const runtime = makeFormRuntime({ requestStage: "" });
  fillValid(runtime.fields);
  runtime.fields.pin.value = "";
  assert.equal(runtime.elements.get("pin-field").hidden, true);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  respondToken(runtime, 0);
  await Promise.resolve();
  assert.equal(runtime.submissions.length, 1);
});

test("customizer quote accepts blank address with valid contact, PIN, and dimensions", async () => {
  const runtime = makeFormRuntime({ requestStage: "quote", sourceKind: "customizer", previewExpected: false });
  fillValid(runtime.fields);
  runtime.fields.fulfillment.value = "shipping";
  runtime.fields.pin.value = "305001";
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  assert.equal(runtime.parentMessages.filter((entry) => entry.message.type === "saloni-order-captcha-request").length, 1);
  respondToken(runtime, 0);
  await Promise.resolve();
  assert.equal(runtime.submissions.length, 1);
});

test("customizer quote still rejects missing dimensions", () => {
  const runtime = makeFormRuntime({ requestStage: "quote", sourceKind: "customizer", previewExpected: false });
  fillValid(runtime.fields);
  runtime.fields.heightFeet.value = "";
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.submissions.length, 0);
  assert.equal(runtime.parentMessages.filter((entry) => entry.message.type === "saloni-order-captcha-request").length, 0);
  assert.match(runtime.status.textContent, /correct/i);
  assert.match(runtime.fields.heightFeet.getAttribute("aria-describedby"), /heightFeet-error/);
});

test("starting another customizer request restores its seeded dimensions", () => {
  const runtime = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  runtime.elements.get("another-button").dispatch("click");
  assert.equal(runtime.fields.requestId.value, "request-new");
  assert.equal(runtime.fields.requestStage.value, "quote");
  assert.equal(runtime.fields.sourceKind.value, "customizer");
  assert.equal(runtime.fields.sourceId.value, "customizer:resin-frame");
  assert.equal(runtime.elements.get("product-context").hidden, true);
  assert.equal(runtime.elements.get("dimension-fields").hidden, false);
  ["height-feet", "height-inches-part", "width-feet", "width-inches-part"].forEach((id) => assert.equal(runtime.elements.get(id).getAttribute("required"), "required"));
});

test("starting another catalogue request restores quote context and optional dimensions", () => {
  const runtime = makeFormRuntime({ sourceId: "catalogue:romantic-heart-trinket-tray.webp" });
  runtime.elements.get("another-button").dispatch("click");
  assert.equal(runtime.fields.requestId.value, "request-new");
  assert.equal(runtime.fields.requestStage.value, "quote");
  assert.equal(runtime.fields.sourceKind.value, "catalogue");
  assert.equal(runtime.fields.sourceId.value, "catalogue:romantic-heart-trinket-tray.webp");
  assert.equal(runtime.elements.get("product-context").hidden, false);
  assert.equal(runtime.elements.get("product-image").getAttribute("src"), "https://saloniresinart.com/assets/romantic-heart-trinket-tray.webp");
  assert.equal(runtime.elements.get("dimension-fields").hidden, true);
  ["height-feet", "height-inches-part", "width-feet", "width-inches-part"].forEach((id) => assert.equal(runtime.elements.get(id).getAttribute("required"), ""));
});

class FakeElement {
  constructor(id, value = "") {
    this.id = id; this.value = value; this.textContent = ""; this.hidden = false; this.disabled = false;
    this.files = []; this.listeners = {}; this.attributes = {}; this.children = []; this.parentNode = null; this.focused = false;
    this.className = ""; this.type = ""; this.name = id;
  }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  dispatch(type, event = {}) { if (this.listeners[type]) this.listeners[type](Object.assign({ target: this }, event)); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || ""; }
  removeAttribute(name) { delete this.attributes[name]; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); return child; }
  get firstChild() { return this.children[0] || null; }
  querySelector(selector) {
    if (selector === "input") {
      for (const child of this.children) {
        if (child.type === "number" || child.tagName === "INPUT") return child;
        const nested = child.querySelector && child.querySelector(selector);
        if (nested) return nested;
      }
    }
    return null;
  }
  focus() { this.focused = true; }
}

class FakePort {
  constructor() { this.peer = null; this.onmessage = null; this.closed = false; }
  postMessage(data) { if (!this.closed && this.peer && this.peer.onmessage) this.peer.onmessage({ data }); }
  close() { this.closed = true; }
}

class FakeMessageChannel {
  constructor() {
    this.port1 = new FakePort(); this.port2 = new FakePort();
    this.port1.peer = this.port2; this.port2.peer = this.port1;
  }
}

function makeFormRuntime({ captcha = "ready", captchaSiteKey = "site-key", timeout = 1, requestStage = "quote", sourceKind = "catalogue", sourceId = "catalogue:test", productName = "Test frame", bundleItems = [], supportsDataTransfer = true, previewExpected = false, omitPreviewExpected = false, seedOverrides = {} } = {}) {
  const ids = ["request-id", "request-stage", "source-kind", "source-id", "product-context", "product-image", "bundle-items", "product-name-row", "product-name-hint", "product-name", "quantity", "dimension-fields", "height-feet", "height-inches-part", "width-feet", "width-inches-part", "design-details", "customer-name", "phone", "email", "fulfillment", "shipping-address", "city", "state", "pin", "pin-field", "requested-date", "referral-code", "referral-status", "check-referral", "remember-repeat-profile", "forget-repeat-profile", "repeat-profile-status", "reference-image", "reference-image-preview-wrap", "reference-image-preview", "reference-image-status", "reference-image-actions", "retry-preview", "continue-without-preview", "remove-reference-image", "captcha-token", "form-status", "submit-button", "another-button", "shipping-fields", "seed-data", "more-details", "bundle-source-ids"];
  const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
  const form = new FakeElement("order-form");
  elements.set("order-form", form);
  const errors = [];
  const fields = {
    requestId: elements.get("request-id"), requestStage: elements.get("request-stage"), sourceKind: elements.get("source-kind"), sourceId: elements.get("source-id"), productName: elements.get("product-name"),
    quantity: elements.get("quantity"), heightFeet: elements.get("height-feet"), heightInchesPart: elements.get("height-inches-part"), widthFeet: elements.get("width-feet"), widthInchesPart: elements.get("width-inches-part"),
    designDetails: elements.get("design-details"), customerName: elements.get("customer-name"), phone: elements.get("phone"), email: elements.get("email"), fulfillment: elements.get("fulfillment"),
    shippingAddress: elements.get("shipping-address"), city: elements.get("city"), state: elements.get("state"), pin: elements.get("pin"), requestedDate: elements.get("requested-date"),
    referenceImage: elements.get("reference-image"), captchaToken: elements.get("captcha-token"), referralCode: elements.get("referral-code"), bundleSourceIds: elements.get("bundle-source-ids"),
  };
  const moreDetails = elements.get("more-details");
  moreDetails.open = false;
  moreDetails.summary = new FakeElement("more-details-summary");
  moreDetails.querySelector = (selector) => (selector === "summary" ? moreDetails.summary : null);
  moreDetails.contains = (element) => ["email", "requested-date", "referral-code", "reference-image"].includes(element && element.id);
  form.elements = fields;
  form.querySelectorAll = (selector) => {
    if (selector === "[aria-invalid]") return Object.values(fields).filter((field) => field.getAttribute("aria-invalid"));
    if (selector === ".field-error") return errors.slice();
    if (selector === "fieldset, #submit-button, #captcha-token") return [elements.get("submit-button"), elements.get("captcha-token")];
    return [];
  };
  form.reset = () => Object.values(fields).forEach((field) => { field.value = ""; field.files = []; });
  Object.values(fields).forEach((field) => { field.parentNode = { appendChild(child) { errors.push(child); } }; });
  const seed = Object.assign({ requestId: "request-seed", requestStage, channelNonce: "nonce-seed-123456", sourceKind, sourceId, productName, quantity: "1", dimensionFormat: "feet-inches", heightFeet: "3", heightInchesPart: "0", widthFeet: "4", widthInchesPart: "0", designDetails: "Details", bundleItems, customerName: "", phone: "", email: "", fulfillment: "pickup", shippingAddress: "", city: "", state: "", pin: "", requestedDate: "" }, seedOverrides);
  if (!omitPreviewExpected) seed.previewExpected = previewExpected;
  elements.get("seed-data").textContent = JSON.stringify(seed);
  const status = elements.get("form-status");
  const timers = [];
  const timerDelays = [];
  const clearedTimers = [];
  const submissions = [];
  const callbacks = [];
  const lookupCallbacks = [];
  const parentMessages = [];
  const run = {
    withSuccessHandler(callback) { this.success = callback; return this; },
    withFailureHandler(callback) { this.failure = callback; return this; },
    submitOrder(value) { submissions.push(value); callbacks.push({ success: this.success, failure: this.failure }); return this; },
    validateReferralCode(value) { lookupCallbacks.push({ value, success: this.success, failure: this.failure }); return this; },
  };
  class FakeFile extends Blob {
    constructor(parts, name, options) { super(parts, options); this.name = name; }
  }
  class FakeDataTransfer {
    constructor() { this.items = { add: (file) => { this._file = file; } }; }
    get files() { return this._file ? [this._file] : []; }
  }
  let objectUrlCounter = 0;
  const objectUrls = { created: [], revoked: [] };
  const pageListeners = {};
  const windowObject = {
    parent: { postMessage(message, targetOrigin, ports) { parentMessages.push({ message, targetOrigin, ports: ports || [], port: ports && ports[0] }); } },
    top: null,
    crypto: { randomUUID: () => "request-new" },
    MessageChannel: FakeMessageChannel,
    setTimeout(callback, delay) { timers.push(callback); timerDelays.push(delay); return timers.length; },
    clearTimeout(id) { clearedTimers.push(id); },
    File: FakeFile,
    Blob,
    DataTransfer: supportsDataTransfer ? FakeDataTransfer : undefined,
    URL: { createObjectURL() { const url = "blob:test-" + (++objectUrlCounter); objectUrls.created.push(url); return url; }, revokeObjectURL(url) { objectUrls.revoked.push(url); } },
    addEventListener(type, listener) { pageListeners[type] = listener; },
  };
  windowObject.google = { script: { run } };
  windowObject.top = windowObject.parent;
  const documentObject = {
    getElementById(id) { return elements.get(id) || errors.find((error) => error.id === id) || null; },
    createElement(tag) {
      const element = new FakeElement(tag); element.className = "";
      element.remove = () => { const index = errors.indexOf(element); if (index >= 0) errors.splice(index, 1); };
      return element;
    },
  };
  const context = {
    console, document: documentObject, window: windowObject, MessageChannel: FakeMessageChannel,
    google: { script: { run } },
    setTimeout: windowObject.setTimeout, clearTimeout: windowObject.clearTimeout,
    File: FakeFile, Blob, DataTransfer: supportsDataTransfer ? FakeDataTransfer : undefined, URL: windowObject.URL,
  };
  vm.createContext(context);
  vm.runInContext(captchaSiteKey ? formSource : formSourceWithoutCaptchaSiteKey, context, { filename: "Form.html" });
  elements.get("submit-button").dispatch("click");
  return { elements, fields, errors, status, timers, timerDelays, clearedTimers, submissions, callbacks, lookupCallbacks, parentMessages, windowObject, objectUrls, pageListeners };
}

function fillValid(fields) {
  Object.assign(fields.productName, { value: "Test frame" });
  Object.assign(fields.quantity, { value: "1" });
  Object.assign(fields.heightFeet, { value: "3" }); Object.assign(fields.heightInchesPart, { value: "0" });
  Object.assign(fields.widthFeet, { value: "4" }); Object.assign(fields.widthInchesPart, { value: "0" });
  Object.assign(fields.designDetails, { value: "Blue and gold" }); Object.assign(fields.customerName, { value: "A Customer" });
  Object.assign(fields.phone, { value: "8209238541" }); Object.assign(fields.fulfillment, { value: "pickup" }); Object.assign(fields.pin, { value: "305001" });
}

function respondToken(runtime, index, token = "captcha-token") {
  const request = runtime.parentMessages.filter((entry) => entry.message.type === "saloni-order-captcha-request")[index];
  request.port.postMessage({ type: "saloni-order-captcha-response", nonce: request.message.nonce, attemptId: request.message.attemptId, ok: true, token });
}

function previewRequests(runtime) {
  return runtime.parentMessages.filter((entry) => entry.message.type === "saloni-preview-request");
}

function respondPreview(runtime, index, data) {
  const request = previewRequests(runtime)[index];
  request.port.postMessage(Object.assign({
    type: "saloni-preview-response", version: 1, nonce: request.message.nonce,
    requestId: request.message.requestId, mode: "order", transferId: request.message.transferId, ok: true,
  }, data || {}));
}

function pngBlob(size = 4) {
  return new Blob([new Uint8Array(size)], { type: "image/png" });
}

test("preview accepts only the current full identity and ignores wrong or duplicate responses", () => {
  const runtime = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  const request = previewRequests(runtime)[0];
  for (const mismatch of [
    { version: 2 }, { nonce: "stale-nonce" }, { requestId: "stale-request" },
    { mode: "captcha" }, { transferId: "wrong-transfer" },
  ]) {
    request.port.postMessage(Object.assign({ type: "saloni-preview-response", version: 1, nonce: request.message.nonce, requestId: request.message.requestId, mode: "order", transferId: request.message.transferId, ok: true, blob: pngBlob() }, mismatch));
  }
  assert.equal(runtime.fields.referenceImage.files.length, 0);
  assert.equal(runtime.elements.get("continue-without-preview").hidden, true);
  respondPreview(runtime, 0, { blob: pngBlob() });
  const assigned = runtime.fields.referenceImage.files[0];
  assert.equal(assigned.name, "saloni-customizer-preview.png");
  assert.equal(assigned.type, "image/png");
  assert.equal(runtime.elements.get("reference-image-preview-wrap").hidden, false);
  request.port.postMessage({ type: "saloni-preview-response", version: 1, nonce: request.message.nonce, requestId: request.message.requestId, mode: "order", transferId: request.message.transferId, ok: false, error: "late" });
  assert.equal(runtime.fields.referenceImage.files[0], assigned);
  assert.equal(request.port.peer.closed, true);
});

test("preview rejects malformed, empty, wrong-MIME, and oversized blobs", () => {
  for (const blob of [
    { size: 4, type: "image/png" },
    new Blob([], { type: "image/png" }),
    new Blob([new Uint8Array(4)], { type: "image/jpeg" }),
    pngBlob(5 * 1024 * 1024 + 1),
  ]) {
    const runtime = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
    respondPreview(runtime, 0, { blob });
    assert.equal(runtime.fields.referenceImage.files.length, 0);
    assert.equal(runtime.elements.get("retry-preview").hidden, false);
    assert.equal(runtime.elements.get("continue-without-preview").hidden, false);
    assert.match(runtime.elements.get("reference-image-status").textContent, /Retry preview or continue/);
  }
});

test("preview errors render as text", () => {
  const runtime = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  respondPreview(runtime, 0, { ok: false, error: "<b>preview failed</b>" });
  assert.match(runtime.elements.get("reference-image-status").textContent, /<b>preview failed<\/b>/);
  assert.equal(runtime.elements.get("reference-image-status").innerHTML, undefined);

  const reasonOnly = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  respondPreview(reasonOnly, 0, { ok: false, reason: "legacy reason must be ignored" });
  assert.doesNotMatch(reasonOnly.elements.get("reference-image-status").textContent, /legacy reason/);
});

test("preview timeout can be retried with a fresh transfer while retaining seed identity", () => {
  const runtime = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  assert.equal(runtime.timerDelays[0], 10000);
  const first = previewRequests(runtime)[0];
  runtime.timers[0]();
  assert.equal(runtime.elements.get("retry-preview").hidden, false);
  runtime.windowObject.crypto.randomUUID = () => "fresh-transfer";
  runtime.elements.get("retry-preview").dispatch("click");
  const requests = previewRequests(runtime);
  assert.equal(requests.length, 2);
  assert.equal(first.port.peer.closed, true);
  assert.equal(requests[1].message.nonce, first.message.nonce);
  assert.equal(requests[1].message.requestId, first.message.requestId);
  assert.notEqual(requests[1].message.transferId, first.message.transferId);
  requests[1].port.postMessage({ type: "saloni-preview-response", version: 1, nonce: first.message.nonce, requestId: first.message.requestId, mode: "order", transferId: first.message.transferId, ok: true, blob: pngBlob() });
  assert.equal(runtime.fields.referenceImage.files.length, 0);
  respondPreview(runtime, 1, { blob: pngBlob() });
  assert.equal(runtime.fields.referenceImage.files[0].name, "saloni-customizer-preview.png");
});

test("manual replacement wins a pending race and explicit removal blocks late preview reuse", () => {
  const runtime = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  const request = previewRequests(runtime)[0];
  const manual = new File([pngBlob()], "manual.png", { type: "image/png" });
  runtime.fields.referenceImage.files = [manual];
  runtime.fields.referenceImage.dispatch("change");
  assert.equal(request.port.peer.closed, true);
  assert.equal(runtime.fields.referenceImage.files[0], manual);
  assert.match(runtime.elements.get("reference-image-status").textContent, /Reference image attached/);
  runtime.fields.referenceImage.files = [];
  runtime.elements.get("remove-reference-image").dispatch("click");
  assert.equal(runtime.fields.referenceImage.files.length, 0);
  assert.equal(runtime.elements.get("retry-preview").hidden, false);
  request.port.postMessage({ type: "saloni-preview-response", version: 1, nonce: request.message.nonce, requestId: request.message.requestId, mode: "order", transferId: request.message.transferId, ok: true, blob: pngBlob() });
  assert.equal(runtime.fields.referenceImage.files.length, 0);
});

test("failed automatic attachment offers explicit continuation and gates submit until resolved", async () => {
  const runtime = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  fillValid(runtime.fields);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.parentMessages.filter((entry) => entry.message.type === "saloni-order-captcha-request").length, 0);
  runtime.timers[0]();
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.parentMessages.filter((entry) => entry.message.type === "saloni-order-captcha-request").length, 0);
  runtime.elements.get("continue-without-preview").dispatch("click");
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  assert.equal(runtime.parentMessages.filter((entry) => entry.message.type === "saloni-order-captcha-request").length, 1);
});

test("unsupported DataTransfer retains the draft and exposes retry or continuation", () => {
  const runtime = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", supportsDataTransfer: false, previewExpected: true });
  respondPreview(runtime, 0, { blob: pngBlob() });
  assert.equal(runtime.fields.referenceImage.files.length, 0);
  assert.equal(runtime.elements.get("retry-preview").hidden, false);
  assert.equal(runtime.elements.get("continue-without-preview").hidden, false);
  assert.match(runtime.elements.get("reference-image-status").textContent, /cannot attach/);
});

test("assigned generated file and fields survive CAPTCHA and server failures", async () => {
  const tokenFailure = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  respondPreview(tokenFailure, 0, { blob: pngBlob() });
  fillValid(tokenFailure.fields);
  tokenFailure.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  const generated = tokenFailure.fields.referenceImage.files[0];
  respondToken(tokenFailure, 0, "");
  assert.equal(tokenFailure.fields.referenceImage.files[0], generated);
  assert.equal(tokenFailure.fields.productName.value, "Test frame");

  const serverFailure = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  respondPreview(serverFailure, 0, { blob: pngBlob() });
  fillValid(serverFailure.fields);
  serverFailure.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  const serverGenerated = serverFailure.fields.referenceImage.files[0];
  respondToken(serverFailure, 0);
  await Promise.resolve();
  serverFailure.callbacks[0].success({ ok: false, errors: { form: "The daily request limit has been reached." } });
  assert.equal(serverFailure.fields.referenceImage.files[0], serverGenerated);
  assert.equal(serverFailure.fields.productName.value, "Test frame");
  assert.match(serverFailure.status.textContent, /daily request limit/);
});

test("success and reset revoke the preview URL without reusing the old preview identity", async () => {
  const runtime = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  respondPreview(runtime, 0, { blob: pngBlob() });
  fillValid(runtime.fields);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  respondToken(runtime, 0);
  await Promise.resolve();
  runtime.callbacks[0].success({ ok: true, requestId: "request-seed", receivedAt: "now" });
  assert.equal(runtime.objectUrls.revoked.length, 1);
  const first = previewRequests(runtime)[0];
  runtime.windowObject.crypto.randomUUID = () => "fresh-request";
  runtime.elements.get("another-button").dispatch("click");
  const requests = previewRequests(runtime);
  assert.equal(requests.length, 1);
  assert.equal(first.port.peer.closed, true);
  assert.equal(runtime.fields.referenceImage.files.length, 0);
  assert.equal(runtime.fields.requestId.value, "fresh-request");
  assert.notEqual(runtime.fields.requestId.value, first.message.requestId);
  assert.equal(runtime.elements.get("retry-preview").hidden, true);
  assert.equal(runtime.elements.get("continue-without-preview").hidden, true);
  assert.match(runtime.elements.get("reference-image-status").textContent, /return to the designer/i);
  first.port.postMessage({ type: "saloni-preview-response", version: 1, nonce: first.message.nonce, requestId: first.message.requestId, mode: "order", transferId: first.message.transferId, ok: true, blob: pngBlob() });
  assert.equal(runtime.fields.referenceImage.files.length, 0);
});

test("always saves repeat details after a successful request and never after a failure", async () => {
  const failed = makeFormRuntime();
  fillValid(failed.fields);
  failed.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  respondToken(failed, 0);
  await Promise.resolve();
  failed.callbacks[0].failure(new Error("server failure"));
  assert.equal(failed.parentMessages.filter((entry) => entry.message.type === "saloni-order-save-repeat-profile").length, 0);

  const checked = makeFormRuntime();
  fillValid(checked.fields);
  checked.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  respondToken(checked, 0);
  await Promise.resolve();
  checked.callbacks[0].success({ ok: true, requestId: "request-seed", receivedAt: "now" });
  const save = checked.parentMessages.filter((entry) => entry.message.type === "saloni-order-save-repeat-profile");
  assert.equal(save.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(save[0].message.profile)), {
    customerName: "A Customer", phone: "8209238541", fulfillment: "pickup", shippingAddress: "", city: "", state: "", pin: "305001",
  });
  assert.equal(save[0].message.nonce, "nonce-seed-123456");
});

test("uses the existing seeded fields for repeat details", () => {
  const runtime = makeFormRuntime({ seedOverrides: { customerName: "Saved Customer", phone: "+91 8209238541", fulfillment: "shipping", shippingAddress: "61 Hathi Bhata", city: "Ajmer", state: "Rajasthan", pin: "305001" } });
  assert.equal(runtime.fields.customerName.value, "Saved Customer");
  assert.equal(runtime.fields.phone.value, "+91 8209238541");
  assert.equal(runtime.fields.fulfillment.value, "shipping");
  assert.equal(runtime.fields.shippingAddress.value, "61 Hathi Bhata");
});

test("page teardown closes a pending preview port and revokes its object URL", () => {
  const pending = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  const request = previewRequests(pending)[0];
  pending.pageListeners.pagehide();
  assert.equal(request.port.peer.closed, true);
  assert.deepEqual(pending.clearedTimers, [1]);

  const runtime = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  runtime.fields.referenceImage.files = [new File([pngBlob()], "manual.png", { type: "image/png" })];
  runtime.fields.referenceImage.dispatch("change");
  assert.equal(runtime.objectUrls.created.length, 1);
  runtime.pageListeners.pagehide();
  assert.deepEqual(runtime.objectUrls.revoked, runtime.objectUrls.created);
});

test("BFCache preserves an attached preview and allows submission after restore", async () => {
  const runtime = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  respondPreview(runtime, 0, { blob: pngBlob() });
  const assigned = runtime.fields.referenceImage.files[0];
  runtime.pageListeners.pagehide({ persisted: true });
  assert.equal(runtime.fields.referenceImage.files[0], assigned);
  assert.deepEqual(runtime.objectUrls.revoked, []);
  runtime.pageListeners.pageshow({ persisted: true });
  assert.equal(runtime.elements.get("retry-preview").hidden, true);
  assert.equal(previewRequests(runtime).length, 1);
  fillValid(runtime.fields);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  assert.equal(runtime.parentMessages.filter((entry) => entry.message.type === "saloni-order-captcha-request").length, 1);
  respondToken(runtime, 0);
  await Promise.resolve();
  assert.equal(runtime.submissions.length, 1);
});

test("BFCache exposes preview recovery and permits explicit continuation after restore", async () => {
  const runtime = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  const request = previewRequests(runtime)[0];
  runtime.pageListeners.pagehide({ persisted: true });
  assert.equal(request.port.peer.closed, true);
  assert.equal(runtime.elements.get("retry-preview").hidden, false);
  assert.equal(runtime.elements.get("continue-without-preview").hidden, false);
  runtime.pageListeners.pageshow({ persisted: true });
  assert.match(runtime.elements.get("reference-image-status").textContent, /Retry preview or continue/i);
  assert.equal(previewRequests(runtime).length, 1);
  runtime.elements.get("continue-without-preview").dispatch("click");
  fillValid(runtime.fields);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  assert.equal(runtime.parentMessages.filter((entry) => entry.message.type === "saloni-order-captcha-request").length, 1);
});

test("catalogue and general forms do not request an embedded preview", () => {
  assert.equal(previewRequests(makeFormRuntime({ sourceKind: "catalogue" })).length, 0);
  assert.equal(previewRequests(makeFormRuntime({ sourceKind: "general", sourceId: "general:custom-gift" })).length, 0);
});

test("clears accepted referral status on edits and ignores stale lookup responses", () => {
  const runtime = makeFormRuntime();
  const code = runtime.elements.get("referral-code");
  const check = runtime.elements.get("check-referral");
  code.value = "STUDIOA";
  check.dispatch("click");
  assert.equal(runtime.lookupCallbacks.length, 1);
  runtime.lookupCallbacks[0].success({ status: "active", code: "STUDIOA", displayName: "Studio A" });
  assert.match(runtime.elements.get("referral-status").textContent, /accepted for Studio A/);
  code.value = "UNKNOWN";
  code.dispatch("input");
  assert.doesNotMatch(runtime.elements.get("referral-status").textContent, /accepted for Studio A/);
  runtime.lookupCallbacks[0].success({ status: "active", code: "STUDIOA", displayName: "Studio A" });
  assert.doesNotMatch(runtime.elements.get("referral-status").textContent, /accepted for Studio A/);
});

test("late success completes and late failure restores the original attempt after an advisory timeout", async () => {
  const runtime = makeFormRuntime();
  fillValid(runtime.fields);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  respondToken(runtime, 0);
  await Promise.resolve();
  runtime.timers[0]();
  assert.match(runtime.status.textContent, /taking longer than expected/i);
  assert.equal(runtime.elements.get("submit-button").disabled, true);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.parentMessages.filter((entry) => entry.message.type === "saloni-order-captcha-request").length, 1);
  runtime.callbacks[0].success({ ok: true, requestId: "late", receivedAt: "late" });
  assert.match(runtime.status.textContent, /Request received/);
  assert.equal(runtime.elements.get("another-button").hidden, false);

  const failed = makeFormRuntime();
  fillValid(failed.fields);
  failed.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  respondToken(failed, 0);
  await Promise.resolve();
  failed.timers[0]();
  failed.callbacks[0].failure(new Error("network"));
  assert.match(failed.status.textContent, /unable to confirm/i);
  assert.equal(failed.elements.get("submit-button").disabled, false);
  assert.equal(failed.fields.productName.value, "Test frame");
  assert.equal(failed.fields.customerName.value, "A Customer");
  assert.equal(failed.fields.phone.value, "8209238541");
});

test("stalled CAPTCHA shows an advisory while general server errors remain readable", async () => {
  const stalled = makeFormRuntime({ captcha: "stalled" });
  fillValid(stalled.fields);
  stalled.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  stalled.timers[0]();
  assert.match(stalled.status.textContent, /taking longer than expected/i);
  assert.equal(stalled.elements.get("submit-button").disabled, true);

  const runtime = makeFormRuntime();
  fillValid(runtime.fields);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  respondToken(runtime, 0);
  await Promise.resolve();
  runtime.callbacks[0].success({ ok: false, errors: { form: "The daily request limit has been reached." } });
  assert.match(runtime.status.textContent, /daily request limit/);
});

test("uses the exact parent origin and preserves the draft and attachment after token failure", async () => {
  const runtime = makeFormRuntime();
  fillValid(runtime.fields);
  const file = { name: "reference.png", type: "image/png", size: 10 };
  runtime.fields.referenceImage.files = [file];
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  const first = runtime.parentMessages.filter((entry) => entry.message.type === "saloni-order-captcha-request")[0];
  assert.equal(first.targetOrigin, "https://saloniresinart.com");
  first.port.postMessage({ type: "saloni-order-captcha-response", nonce: first.message.nonce, attemptId: first.message.attemptId, ok: false });
  assert.match(runtime.status.textContent, /Captcha verification is required/);
  assert.equal(runtime.fields.productName.value, "Test frame");
  assert.equal(runtime.fields.referenceImage.files[0], file);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  respondToken(runtime, 1);
  await Promise.resolve();
  assert.equal(runtime.submissions.length, 1);
  assert.equal(runtime.fields.referenceImage.files[0], file);
});

test("client validation blocks invalid normalized dimensions and associates the focused error", () => {
  const runtime = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  runtime.elements.get("continue-without-preview").dispatch("click");
  runtime.fields.productName.value = "";
  runtime.fields.quantity.value = "1";
  runtime.fields.heightFeet.value = "5"; runtime.fields.heightInchesPart.value = "0.01";
  runtime.fields.widthFeet.value = "4"; runtime.fields.widthInchesPart.value = "0";
  runtime.fields.designDetails.value = ""; runtime.fields.customerName.value = ""; runtime.fields.phone.value = ""; runtime.fields.fulfillment.value = "pickup";
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.submissions.length, 0);
  assert.match(runtime.status.textContent, /correct/i);
  assert.equal(runtime.fields.heightFeet.focused || runtime.fields.productName.focused, true);
  assert.match(runtime.fields.productName.getAttribute("aria-describedby"), /productName-error/);
});
