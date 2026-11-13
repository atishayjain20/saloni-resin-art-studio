const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const formSource = fs.readFileSync(path.join(root, "order-form.js"), "utf8");
const stylesheet = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const formMarkup = indexHtml.match(/<form id="order-form"[\s\S]*?<\/form>/)[0];
// The form's markup, its styles and its script, searched together by the copy and layout checks below.
const html = formMarkup + "\n" + stylesheet + "\n" + formSource;

test("the order form is built into the page and never talks to a frame, a parent window, or google.script.run", () => {
  assert.doesNotMatch(formSource, /postMessage|MessageChannel|google\.script|window\.top|window\.parent|pagehide|pageshow|PARENT_ORIGIN/);
  assert.match(formSource, /window\.saloniOrderForm = \{ open: open \}/);
  assert.doesNotMatch(indexHtml, /id="order-form-frame"/);
  assert.match(indexHtml, /<script class="order-form-script" src="order-form\.js\?v=\d+" defer><\/script>\s*<script class="site-script" src="script\.js/);
});

test("opening the form shows it at once with the seeded request and sends nothing", () => {
  const runtime = makeFormRuntime({ sourceKind: "catalogue" });
  assert.equal(runtime.form.hidden, false);
  assert.equal(runtime.elements.get("order-form-intro").hidden, false);
  assert.equal(runtime.fields.requestId.value, "request-seed");
  assert.equal(runtime.fetches.length, 0);
});

test("the form's ids do not clash with the rest of the page", () => {
  const ids = [...indexHtml.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, []);
  assert.match(formMarkup, /id="order-reference-image"/);
  assert.match(formMarkup, /id="order-privacy-details"/);
});

test("customizer handoff copy does not ask customers to download or reattach a preview", () => {
  const status = html.match(/<p id="reference-image-status"[^>]*>[\s\S]*?<\/p>/)?.[0] || "";
  assert.match(status, /Optional: attach a separate reference image if it helps/);
  assert.doesNotMatch(status, /Customizer designs transfer/);
  assert.doesNotMatch(status, /download it first|reattach/i);
  const status_ = (runtime) => runtime.elements.get("reference-image-status").textContent;
  const catalogue = makeFormRuntime();
  assert.equal(status_(catalogue), "Optional: attach a separate reference image if it helps.");
  const customizer = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: false });
  assert.match(status_(customizer), /Customizer designs transfer directly with your request/);
  assert.doesNotMatch(status_(customizer), /download it first|reattach/i);
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
  assert.equal(standard.elements.get("product-image").getAttribute("src"), "assets/romantic-heart-trinket-tray.webp");
  assert.equal(standard.elements.get("product-image").getAttribute("alt"), "Test frame product photo");
  assert.equal(standard.elements.get("custom-size").hidden, false);
  assert.equal(standard.elements.get("dimension-fields").parentNode.id, "custom-size");
  assert.equal(standard.elements.get("dimension-fields").hidden, false);
  assert.equal(standard.elements.get("bundle-sizes").hidden, true);
  assert.equal(standard.elements.get("shipping-fields").hidden, true);
  ["height-feet", "height-inches-part", "width-feet", "width-inches-part"].forEach((id) => assert.equal(standard.elements.get(id).getAttribute("required"), ""));

  const general = makeFormRuntime({ sourceId: "catalogue:general-custom-gift" });
  assert.equal(general.elements.get("product-context").hidden, true);
  assert.equal(general.elements.get("product-image").getAttribute("src"), "");

  const unsafe = makeFormRuntime({ sourceId: "catalogue:../secret" });
  assert.equal(unsafe.elements.get("product-context").hidden, true);
  assert.equal(unsafe.elements.get("product-image").getAttribute("src"), "");

  const customizer = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  assert.equal(customizer.elements.get("product-context").hidden, true);
  assert.equal(customizer.elements.get("dimension-fields").hidden, false);
  assert.equal(customizer.elements.get("custom-size").hidden, true);
  assert.notEqual(customizer.elements.get("dimension-fields").parentNode && customizer.elements.get("dimension-fields").parentNode.id, "custom-size");
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
  await Promise.resolve();
  await runtime.callbacks[0].success({ ok: true, requestId: "request-seed", receivedAt: "now" });
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
  ["customer-name", "phone", "fulfillment", "shipping-address", "pin", "order-reference-image"].forEach((id) => assert.doesNotMatch(more, new RegExp(`id="${id}"`)));
  assert.match(html, /\.more-details > summary \{[^}]*min-height: 44px/);
  const details = html.match(/<legend>Your details<\/legend>[\s\S]*?<\/fieldset>/)[0];
  ["customer-name", "phone", "fulfillment", "shipping-address", "pin"].forEach((id) => assert.match(details, new RegExp(`id="${id}"`)));
  ["email", "requested-date", "referral-code"].forEach((id) => assert.doesNotMatch(details, new RegExp(`id="${id}"`)));
  assert.match(html, /<input id="bundle-source-ids" name="bundleSourceIds" type="hidden">/);
});

test("More details opens for a field error and starts open only for seeded optional values", async () => {
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
  await Promise.resolve();
  assert.equal(serverError.elements.get("more-details").open, false);
  await serverError.callbacks[0].success({ ok: false, errors: { referralCode: "Enter a valid referral code or clear this field." } });
  assert.equal(serverError.elements.get("more-details").open, true);
  assert.equal(serverError.fields.referralCode.focused, true);
  for (const seedOverrides of [{ email: "a@b.co" }, { requestedDate: "2026-12-01" }, { referralCode: "ABC123" }]) {
    assert.equal(makeFormRuntime({ seedOverrides }).elements.get("more-details").open, true);
  }
  const customizer = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  assert.equal(customizer.elements.get("more-details").open, false);
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
    assert.ok(html.includes(JSON.stringify(message)), "the order form is missing: " + message);
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

test("the product photo is the site's own image file, and ids that are not an image file show none", () => {
  const filename = "premium-midnight-blue-tiered-set.jpeg";
  const selected = makeFormRuntime({ sourceId: `catalogue:${filename}` });
  assert.equal(selected.elements.get("product-context").hidden, false);
  assert.equal(selected.elements.get("product-image").getAttribute("src"), `assets/${filename}`);
  for (const sourceId of ["catalogue:customizer-design-help", "catalogue:multi-item", "catalogue:a/b.webp", "catalogue:..%2Fx.png", "catalogue:photo.svg"]) {
    const runtime = makeFormRuntime({ sourceId });
    assert.equal(runtime.elements.get("product-context").hidden, true, sourceId);
    assert.equal(runtime.elements.get("product-image").getAttribute("src"), "", sourceId);
  }
});

test("quote shipping accepts a blank address when PIN is valid", async () => {
  const runtime = makeFormRuntime();
  fillValid(runtime.fields);
  runtime.fields.fulfillment.value = "shipping";
  runtime.fields.pin.value = "305001";
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
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
  assert.equal(runtime.submissions.length, 1);
  await Promise.resolve();
  assert.equal(runtime.submissions.length, 1);
});

test("customizer quote still rejects missing dimensions", () => {
  const runtime = makeFormRuntime({ requestStage: "quote", sourceKind: "customizer", previewExpected: false });
  fillValid(runtime.fields);
  runtime.fields.heightFeet.value = "";
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.submissions.length, 0);
  assert.equal(runtime.submissions.length, 0);
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
  assert.equal(runtime.elements.get("custom-size").hidden, true);
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
  assert.equal(runtime.elements.get("product-image").getAttribute("src"), "assets/romantic-heart-trinket-tray.webp");
  assert.equal(runtime.elements.get("custom-size").hidden, false);
  assert.equal(runtime.elements.get("dimension-fields").parentNode.id, "custom-size");
  assert.equal(runtime.elements.get("dimension-fields").hidden, false);
  ["height-feet", "height-inches-part", "width-feet", "width-inches-part"].forEach((id) => assert.equal(runtime.elements.get(id).getAttribute("required"), ""));
});

// ---- Custom size (optional) in More details ----
function findById(root, id) {
  if (!root) return null;
  if (root.id === id) return root;
  for (const child of root.children || []) {
    const found = findById(child, id);
    if (found) return found;
  }
  return null;
}
function sizeInput(runtime, index, part) { return findById(runtime.elements.get("bundle-sizes"), `bundle-size-${index}-${part}`); }
function sizeError(runtime, index, part) {
  const input = sizeInput(runtime, index, part);
  const grid = input && input.parentNode && input.parentNode.parentNode;
  assert.ok(!grid || grid.className === "bundle-size", "row errors belong to the row grid, not the narrow cell");
  const error = grid ? grid.children.find((child) => child.className === "field-error") : null;
  return error ? error.textContent : "";
}
function setSize(runtime, index, values) {
  Object.entries(values).forEach(([part, text]) => { const input = sizeInput(runtime, index, part); input.value = text; input.dispatch("change"); });
}
function submitForm(runtime) { runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} }); }
async function submitAndSend(runtime) {
  submitForm(runtime);
  await Promise.resolve();
}
const SIZE_ITEMS = [
  { sourceId: "catalogue:one.webp", productName: "One", price: "249", size: "4 in", quantity: 1 },
  { sourceId: "catalogue:two.webp", productName: "Two", price: "399", size: "6 in", quantity: 1 },
];
function cartRuntime(items = SIZE_ITEMS) {
  const runtime = makeFormRuntime({ sourceId: "catalogue:multi-item", bundleItems: items.map((item) => Object.assign({}, item)) });
  fillValid(runtime.fields);
  runtime.fields.designDetails.value = "";
  return runtime;
}

test("the form has a custom size fieldset as the first thing in More details, with no name on the cart rows", () => {
  const more = html.match(/<details class="more-details" id="more-details">\s*<summary>[^<]*<\/summary>\s*([\s\S]*?)<fieldset>\s*<legend>Optional details/)?.[1] || "";
  assert.match(more, /<fieldset id="custom-size" hidden>\s*<legend>Custom size \(optional\)<\/legend>\s*<div id="bundle-sizes" hidden><\/div>\s*<\/fieldset>/);
  assert.match(html, /\.bundle-size\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  const renderer = formSource.match(/function renderBundleItems\(\)[\s\S]*?\n  function revealField/)[0];
  assert.doesNotMatch(renderer, /innerHTML/);
  assert.doesNotMatch(renderer, /\.name\s*=\s*["']?bundle-size/);
});

test("a cart order hides the read-only Quantity row but still submits the total", async () => {
  assert.match(html, /<label id="quantity-row" for="quantity">Quantity /);
  const fresh = makeFormRuntime({ sourceId: "catalogue:multi-item", bundleItems: SIZE_ITEMS.map((item) => Object.assign({}, item)) });
  assert.equal(fresh.elements.get("quantity-row").hidden, true);
  assert.equal(fresh.fields.quantity.value, "2");
  const runtime = cartRuntime();
  await submitAndSend(runtime);
  assert.equal(runtime.submissions.length, 1);
  assert.equal(runtime.submissions[0].quantity, "2");
  const single = makeFormRuntime({ sourceId: "catalogue:romantic-heart-trinket-tray.webp" });
  assert.notEqual(single.elements.get("quantity-row").hidden, true);
});

test("per-item custom size inputs are 44px tall and aligned to the bottom of each cell", () => {
  assert.match(html, /\.bundle-size label\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*justify-content:\s*flex-end/);
  assert.match(html, /\.bundle-size input\s*\{[^}]*min-height:\s*44px/);
});

test("More details summary has a focus ring and its chevron respects reduced motion", () => {
  assert.match(html, /summary:focus-visible\s*\{[^}]*outline:\s*3px solid #b24b60/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.more-details > summary::after\s*\{[^}]*transition:\s*none/);
});

test("a single product moves the size fields into Custom size and a blank size is accepted", async () => {
  const runtime = makeFormRuntime({ sourceId: "catalogue:romantic-heart-trinket-tray.webp" });
  fillValid(runtime.fields);
  ["heightFeet", "heightInchesPart", "widthFeet", "widthInchesPart"].forEach((name) => { runtime.fields[name].value = ""; });
  await submitAndSend(runtime);
  assert.equal(runtime.submissions.length, 1);
  assert.equal(runtime.errors.length, 0);
});

test("a single product posts a custom size typed in More details", async () => {
  const runtime = makeFormRuntime({ sourceId: "catalogue:romantic-heart-trinket-tray.webp" });
  fillValid(runtime.fields);
  Object.assign(runtime.fields.heightFeet, { value: "1" }); Object.assign(runtime.fields.heightInchesPart, { value: "2" });
  Object.assign(runtime.fields.widthFeet, { value: "0" }); Object.assign(runtime.fields.widthInchesPart, { value: "10" });
  await submitAndSend(runtime);
  assert.equal(runtime.submissions.length, 1);
  assert.equal(runtime.fields.heightFeet.value, "1");
  assert.equal(runtime.fields.heightInchesPart.value, "2");
  assert.equal(runtime.fields.widthFeet.value, "0");
  assert.equal(runtime.fields.widthInchesPart.value, "10");
  assert.equal(runtime.errors.length, 0);
});

test("a single product with only one dimension asks for both and opens More details on the missing one", () => {
  const runtime = makeFormRuntime({ sourceId: "catalogue:romantic-heart-trinket-tray.webp" });
  fillValid(runtime.fields);
  Object.assign(runtime.fields.heightFeet, { value: "1" }); Object.assign(runtime.fields.heightInchesPart, { value: "2" });
  Object.assign(runtime.fields.widthFeet, { value: "" }); Object.assign(runtime.fields.widthInchesPart, { value: "" });
  submitForm(runtime);
  assert.equal(runtime.submissions.length, 0);
  assert.equal(errorText(runtime, "widthFeet"), "Enter both height and width, or leave both blank.");
  assert.equal(runtime.fields.widthFeet.getAttribute("aria-invalid"), "true");
  assert.match(runtime.fields.widthFeet.getAttribute("aria-describedby"), /widthFeet-error/);
  assert.equal(runtime.elements.get("more-details").open, true);
  assert.equal(runtime.fields.widthFeet.focused, true);
});

test("a single product fills a blank feet or inches part with 0 when the other part is typed", async () => {
  const runtime = makeFormRuntime({ sourceId: "catalogue:romantic-heart-trinket-tray.webp" });
  fillValid(runtime.fields);
  Object.assign(runtime.fields.heightFeet, { value: "" }); Object.assign(runtime.fields.heightInchesPart, { value: "10" });
  Object.assign(runtime.fields.widthFeet, { value: "2" }); Object.assign(runtime.fields.widthInchesPart, { value: "" });
  await submitAndSend(runtime);
  assert.equal(runtime.fields.heightFeet.value, "0");
  assert.equal(runtime.fields.widthInchesPart.value, "0");
  assert.equal(runtime.submissions.length, 1);
});

test("a single product rejects an oversized custom size with the shared message", () => {
  const runtime = makeFormRuntime({ sourceId: "catalogue:romantic-heart-trinket-tray.webp" });
  fillValid(runtime.fields);
  Object.assign(runtime.fields.heightFeet, { value: "5" }); Object.assign(runtime.fields.heightInchesPart, { value: "1" });
  submitForm(runtime);
  assert.equal(errorText(runtime, "heightFeet"), "Height must be no more than 60 inches.");
  assert.equal(runtime.submissions.length, 0);
});

test("a cart renders one labelled, unnamed size row per product inside Custom size", () => {
  const runtime = cartRuntime();
  assert.equal(runtime.elements.get("custom-size").hidden, false);
  assert.equal(runtime.elements.get("bundle-sizes").hidden, false);
  assert.equal(runtime.elements.get("dimension-fields").hidden, true);
  const rows = runtime.elements.get("bundle-sizes").children;
  assert.equal(rows.length, 2);
  const names = ["heightFeet", "heightInchesPart", "widthFeet", "widthInchesPart"];
  names.forEach((part) => {
    const input = sizeInput(runtime, 0, part);
    assert.ok(input, part);
    assert.equal(input.type, "number");
    assert.equal(input.getAttribute("name"), "");
  });
  assert.equal(sizeInput(runtime, 1, "heightFeet").getAttribute("aria-label"), "Height ft for Two");
  assert.equal(sizeInput(runtime, 0, "widthInchesPart").getAttribute("aria-label"), "Width in for One");
  assert.equal(sizeInput(runtime, 0, "heightFeet").max, "5");
  assert.equal(sizeInput(runtime, 0, "heightInchesPart").max, "11.99");
});

test("a cart adds the custom size only to the item that has one, and posts no size field names", async () => {
  const runtime = cartRuntime();
  setSize(runtime, 0, { heightFeet: "1", heightInchesPart: "2", widthInchesPart: "10" });
  await submitAndSend(runtime);
  const lines = runtime.fields.designDetails.value.split("\n");
  assert.equal(lines[0], "One · 4 in · 249 · Qty 1 · Custom size: H 1 ft 2 in × W 10 in");
  assert.equal(lines[1], "Two · 6 in · 399 · Qty 1");
  assert.equal(runtime.submissions.length, 1);
  assert.ok(!Object.keys(runtime.fields).some((key) => key.startsWith("bundle-size")));
});

test("a cart size with a whole foot, a partial axis, or inches only formats compactly", () => {
  const runtime = cartRuntime();
  setSize(runtime, 0, { heightFeet: "2", widthInchesPart: "6.50" });
  assert.match(runtime.fields.designDetails.value.split("\n")[0], /Custom size: H 2 ft × W 6\.5 in$/);
  setSize(runtime, 0, { heightFeet: "", heightInchesPart: "0" });
  assert.doesNotMatch(runtime.fields.designDetails.value, /Custom size/);
});

test("a cart row over 60 inches shows its error on that row and opens More details", () => {
  const runtime = cartRuntime();
  setSize(runtime, 1, { heightFeet: "5", heightInchesPart: "1", widthFeet: "1" });
  submitForm(runtime);
  assert.equal(runtime.submissions.length, 0);
  assert.equal(sizeError(runtime, 1, "heightFeet"), "Height must be no more than 60 inches.");
  assert.equal(sizeInput(runtime, 1, "heightFeet").getAttribute("aria-invalid"), "true");
  assert.match(sizeInput(runtime, 1, "heightFeet").getAttribute("aria-describedby"), /bundle-size-1-heightFeet-error/);
  assert.equal(sizeInput(runtime, 1, "heightFeet").focused, true);
  assert.equal(runtime.elements.get("more-details").open, true);
});

test("a cart row with only one dimension asks for both, and a row left blank passes", async () => {
  const runtime = cartRuntime();
  setSize(runtime, 0, { heightFeet: "1" });
  submitForm(runtime);
  assert.equal(sizeError(runtime, 0, "widthFeet"), "Enter both height and width, or leave both blank.");
  assert.equal(sizeError(runtime, 1, "widthFeet"), "");
  assert.equal(runtime.submissions.length, 0);
  setSize(runtime, 0, { heightFeet: "" });
  await submitAndSend(runtime);
  assert.equal(runtime.submissions.length, 1);
});

test("editing sizes then quantities twice does not turn the old list into Order notes", () => {
  const runtime = cartRuntime();
  setSize(runtime, 0, { heightFeet: "1", widthFeet: "2" });
  const quantities = runtime.elements.get("bundle-items").children.map((line) => line.querySelector("input"));
  quantities[0].value = "2"; quantities[0].dispatch("change");
  quantities[1].value = "3"; quantities[1].dispatch("change");
  assert.doesNotMatch(runtime.fields.designDetails.value, /Order notes:/);
  assert.equal(runtime.fields.designDetails.value.split("\n").length, 2);
  assert.match(runtime.fields.designDetails.value, /One .*Qty 2 · Custom size: H 1 ft × W 2 ft\nTwo .*Qty 3$/);
});

test("customer notes survive size and quantity edits", () => {
  const runtime = cartRuntime();
  runtime.fields.designDetails.value = "Warm colours";
  runtime.fields.designDetails.dispatch("input");
  setSize(runtime, 0, { heightFeet: "1", widthFeet: "2" });
  const quantity = runtime.elements.get("bundle-items").children[1].querySelector("input");
  quantity.value = "2"; quantity.dispatch("change");
  assert.match(runtime.fields.designDetails.value, /\nOrder notes: Warm colours$/);
  assert.equal((runtime.fields.designDetails.value.match(/Order notes:/g) || []).length, 1);
});

test("Start another request rebuilds the cart rows empty and drops the old sizes from the notes", () => {
  const runtime = cartRuntime();
  setSize(runtime, 1, { heightFeet: "1", heightInchesPart: "2", widthFeet: "0", widthInchesPart: "10" });
  assert.match(runtime.fields.designDetails.value, /Custom size: H 1 ft 2 in \u00d7 W 10 in/);
  runtime.elements.get("another-button").dispatch("click");
  assert.equal(runtime.elements.get("bundle-sizes").children.length, 2);
  assert.equal(sizeInput(runtime, 1, "heightFeet").value, "");
  assert.doesNotMatch(runtime.fields.designDetails.value, /Custom size/);
});

test("a size that would push the list past 2000 characters is refused and reverted", () => {
  const long = "N".repeat(150);
  const items = Array.from({ length: 11 }, (_, index) => ({ sourceId: `catalogue:item${String(index).padStart(2, "0")}.webp`, productName: `${long}${String(index).padStart(2, "0")}`, price: "249", size: "4 in", quantity: 1 }));
  const runtime = cartRuntime(items);
  assert.equal(runtime.elements.get("bundle-sizes").children.length, 11);
  let refusedAt = -1;
  for (let index = 0; index < items.length && refusedAt < 0; index += 1) {
    setSize(runtime, index, { heightFeet: "5", widthFeet: "5" });
    if (/too long/i.test(runtime.status.textContent)) refusedAt = index;
    else assert.ok(runtime.fields.designDetails.value.length <= 2000);
  }
  assert.ok(refusedAt > 0, "a refusal should happen before every row is filled");
  assert.equal(sizeInput(runtime, refusedAt, "widthFeet").value, "");
  assert.ok(runtime.fields.designDetails.value.length <= 2000);
  assert.doesNotMatch(runtime.fields.designDetails.value.split("\n")[refusedAt], /Custom size/);
});

test("a customizer order keeps the size block in What should Saloni make and hides Custom size", () => {
  const runtime = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true });
  assert.equal(runtime.elements.get("custom-size").hidden, true);
  assert.equal(runtime.elements.get("bundle-sizes").hidden, true);
  assert.equal(runtime.elements.get("dimension-fields").hidden, false);
  assert.notEqual(runtime.elements.get("dimension-fields").parentNode && runtime.elements.get("dimension-fields").parentNode.id, "custom-size");
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

class FakeFileReader {
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = "data:" + blob.type + ";base64," + Buffer.from(buffer).toString("base64");
      if (this.onload) this.onload();
    }, () => { if (this.onerror) this.onerror(); });
  }
}

function makeFormRuntime({ timeout = 1, requestStage = "quote", sourceKind = "catalogue", sourceId = "catalogue:test", productName = "Test frame", bundleItems = [], previewExpected = false, omitPreviewExpected = false, previewBlob = null, seedOverrides = {} } = {}) {
  const ids = ["order-form-embed", "order-form-intro", "success-celebration", "request-id", "request-stage", "source-kind", "source-id", "product-context", "product-image", "bundle-items", "product-name-row", "product-name-hint", "product-name", "quantity-row", "quantity", "custom-size", "bundle-sizes", "dimension-fields", "height-feet", "height-inches-part", "width-feet", "width-inches-part", "design-details", "customer-name", "phone", "email", "fulfillment", "shipping-address", "city", "state", "pin", "pin-field", "requested-date", "referral-code", "referral-status", "check-referral", "order-reference-image", "reference-image-preview-wrap", "reference-image-preview", "reference-image-status", "reference-image-actions", "remove-reference-image", "form-status", "submit-button", "another-button", "shipping-fields", "more-details", "bundle-source-ids"];
  const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
  elements.get("order-form-embed").setAttribute("data-order-form-url", "https://script.google.com/macros/s/test/exec");
  const form = new FakeElement("order-form");
  form.hidden = true;
  elements.get("order-form-intro").hidden = true;
  elements.set("order-form", form);
  const errors = [];
  const created = [];
  const fields = {
    requestId: elements.get("request-id"), requestStage: elements.get("request-stage"), sourceKind: elements.get("source-kind"), sourceId: elements.get("source-id"), productName: elements.get("product-name"),
    quantity: elements.get("quantity"), heightFeet: elements.get("height-feet"), heightInchesPart: elements.get("height-inches-part"), widthFeet: elements.get("width-feet"), widthInchesPart: elements.get("width-inches-part"),
    designDetails: elements.get("design-details"), customerName: elements.get("customer-name"), phone: elements.get("phone"), email: elements.get("email"), fulfillment: elements.get("fulfillment"),
    shippingAddress: elements.get("shipping-address"), city: elements.get("city"), state: elements.get("state"), pin: elements.get("pin"), requestedDate: elements.get("requested-date"),
    referenceImage: elements.get("order-reference-image"), referralCode: elements.get("referral-code"), bundleSourceIds: elements.get("bundle-source-ids"),
  };
  const moreDetails = elements.get("more-details");
  moreDetails.open = false;
  moreDetails.summary = new FakeElement("more-details-summary");
  moreDetails.querySelector = (selector) => (selector === "summary" ? moreDetails.summary : null);
  const dimensionIds = ["height-feet", "height-inches-part", "width-feet", "width-inches-part"];
  moreDetails.contains = (element) => {
    const id = element && element.id;
    if (["email", "requested-date", "referral-code", "order-reference-image"].includes(id)) return true;
    if (typeof id === "string" && id.startsWith("bundle-size-")) return true;
    return dimensionIds.includes(id) && elements.get("dimension-fields").parentNode?.id === "custom-size";
  };
  form.elements = fields;
  form.querySelectorAll = (selector) => {
    if (selector === "[aria-invalid]") return Object.values(fields).concat(created).filter((field) => field.getAttribute("aria-invalid"));
    if (selector === ".field-error") {
      const attached = (element) => element.parentNode && element.parentNode.children && element.parentNode.children.includes(element);
      return errors.concat(created.filter((element) => element.className === "field-error" && !errors.includes(element) && attached(element)));
    }
    if (selector === "fieldset, #submit-button") return [elements.get("submit-button")];
    return [];
  };
  form.reset = () => Object.values(fields).forEach((field) => { field.value = ""; field.files = []; });
  Object.values(fields).forEach((field) => { field.parentNode = { appendChild(child) { errors.push(child); } }; });
  const seed = Object.assign({ requestId: "request-seed", requestStage, sourceKind, sourceId, productName, quantity: "1", dimensionFormat: "feet-inches", heightFeet: "3", heightInchesPart: "0", widthFeet: "4", widthInchesPart: "0", designDetails: "Details", bundleItems, customerName: "", phone: "", email: "", fulfillment: "pickup", shippingAddress: "", city: "", state: "", pin: "", requestedDate: "" }, seedOverrides);
  if (!omitPreviewExpected) seed.previewExpected = previewExpected;
  const status = elements.get("form-status");
  const timers = [];
  const timerDelays = [];
  const clearedTimers = [];
  const fetches = [];
  const submissions = [];
  const callbacks = [];
  const lookupCallbacks = [];
  const savedProfiles = [];
  class FakeFile extends Blob {
    constructor(parts, name, options) { super(parts, options); this.name = name; }
  }
  const imaging = { bitmapSize: { width: 4000, height: 3000 }, decodeError: false, noToBlob: false, jpegBytes: 120000, canvases: [], bitmapsClosed: 0 };
  class FakeCanvas {
    constructor() {
      this.width = 0; this.height = 0;
      this.calls = [];
      const calls = this.calls;
      this.context = {
        set fillStyle(value) { calls.push(["fillStyle", value]); },
        fillRect(...args) { calls.push(["fillRect", ...args]); },
        drawImage(...args) { calls.push(["drawImage", ...args.slice(1)]); },
      };
      if (!imaging.noToBlob) this.toBlob = (callback, type, quality) => { this.exported = { type, quality }; callback(new Blob([new Uint8Array(imaging.jpegBytes)], { type })); };
      imaging.canvases.push(this);
    }
    getContext() { return this.context; }
  }
  let objectUrlCounter = 0;
  const objectUrls = { created: [], revoked: [] };
  const windowObject = {
    crypto: { randomUUID: () => "request-new" },
    setTimeout(callback, delay) { timers.push(callback); timerDelays.push(delay); return timers.length; },
    clearTimeout(id) { clearedTimers.push(id); },
    File: FakeFile,
    Blob,
    FileReader: FakeFileReader,
    URL: { createObjectURL() { const url = "blob:test-" + (++objectUrlCounter); objectUrls.created.push(url); return url; }, revokeObjectURL(url) { objectUrls.revoked.push(url); } },
    createImageBitmap() {
      if (imaging.decodeError) return Promise.reject(new Error("decode failed"));
      return Promise.resolve({ width: imaging.bitmapSize.width, height: imaging.bitmapSize.height, close() { imaging.bitmapsClosed += 1; } });
    },
    // The only network the form uses: a JSON POST to the web app, answered when the test says so.
    fetch(url, options) {
      const entry = { url, options, body: JSON.parse(options.body) };
      fetches.push(entry);
      return new Promise((resolve, reject) => {
        const answer = {
          success(result) { resolve({ json: () => Promise.resolve(result) }); return settle(); },
          failure(error) { reject(error); return settle(); },
        };
        if (/[?]action=order$/.test(url)) { submissions.push(entry.body); callbacks.push(answer); }
        else if (/[?]action=referral$/.test(url)) lookupCallbacks.push(Object.assign({ value: entry.body.code }, answer));
      });
    },
  };
  const documentObject = {
    getElementById(id) { return elements.get(id) || errors.find((error) => error.id === id) || created.find((element) => element.id === id) || null; },
    createElement(tag) {
      if (tag === "canvas") return new FakeCanvas();
      const element = new FakeElement(tag); element.className = ""; element.name = "";
      created.push(element);
      element.remove = () => {
        const index = errors.indexOf(element);
        if (index >= 0) errors.splice(index, 1);
        const createdIndex = created.indexOf(element);
        if (createdIndex >= 0) created.splice(createdIndex, 1);
        if (element.parentNode && element.parentNode.removeChild) element.parentNode.removeChild(element);
      };
      return element;
    },
  };
  const context = {
    console, document: documentObject, window: windowObject,
    setTimeout: windowObject.setTimeout, clearTimeout: windowObject.clearTimeout,
    File: FakeFile, Blob, URL: windowObject.URL,
  };
  vm.createContext(context);
  vm.runInContext(formSource, context, { filename: "order-form.js" });
  windowObject.saloniOrderForm.open(seed, { previewBlob, onSent: (profile) => savedProfiles.push(profile) });
  return { form, imaging, elements, fields, errors, status, timers, timerDelays, clearedTimers, fetches, submissions, callbacks, lookupCallbacks, savedProfiles, windowObject, objectUrls, seed, open: windowObject.saloniOrderForm.open };
}

function fillValid(fields) {
  Object.assign(fields.productName, { value: "Test frame" });
  Object.assign(fields.quantity, { value: "1" });
  Object.assign(fields.heightFeet, { value: "3" }); Object.assign(fields.heightInchesPart, { value: "0" });
  Object.assign(fields.widthFeet, { value: "4" }); Object.assign(fields.widthInchesPart, { value: "0" });
  Object.assign(fields.designDetails, { value: "Blue and gold" }); Object.assign(fields.customerName, { value: "A Customer" });
  Object.assign(fields.phone, { value: "8209238541" }); Object.assign(fields.fulfillment, { value: "pickup" }); Object.assign(fields.pin, { value: "305001" });
}

function pngBlob(size = 4) {
  return new Blob([new Uint8Array(size)], { type: "image/png" });
}

function jpegBlob(size = 4) {
  return new Blob([new Uint8Array(size)], { type: "image/jpeg" });
}

const customizerOptions = { sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: true };
const submitOrderForm = (runtime) => runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });

test("a customizer preview is attached when the form opens, with its name, thumbnail and a remove button", () => {
  const runtime = makeFormRuntime(Object.assign({ previewBlob: jpegBlob() }, customizerOptions));
  assert.match(runtime.elements.get("reference-image-status").textContent, /Customizer preview attached as saloni-customizer-preview\.jpg/);
  assert.equal(runtime.elements.get("reference-image-preview-wrap").hidden, false);
  assert.equal(runtime.elements.get("reference-image-preview").getAttribute("alt"), "Attached customizer preview");
  assert.equal(runtime.elements.get("remove-reference-image").hidden, false);
  assert.equal(runtime.elements.get("submit-button").disabled, false);
  assert.equal(runtime.fetches.length, 0);
});

test("a PNG preview from the older site is attached with a matching .png name and sent as image/png", async () => {
  const runtime = makeFormRuntime(Object.assign({ previewBlob: pngBlob(8) }, customizerOptions));
  assert.match(runtime.elements.get("reference-image-status").textContent, /saloni-customizer-preview\.png/);
  fillValid(runtime.fields);
  submitOrderForm(runtime);
  assert.equal(runtime.status.textContent, "Sending your request and design preview…");
  await settle();
  assert.equal(runtime.submissions.length, 1);
  assert.deepEqual(runtime.submissions[0].referenceImage, { type: "image/png", data: Buffer.alloc(8).toString("base64") });
});

test("the customizer preview is sent as base64 in the JSON body, not shrunk", async () => {
  const runtime = makeFormRuntime(Object.assign({ previewBlob: jpegBlob(1000 * 1024) }, customizerOptions));
  fillValid(runtime.fields);
  submitOrderForm(runtime);
  await settle();
  assert.equal(runtime.imaging.canvases.length, 0);
  const image = runtime.submissions[0].referenceImage;
  assert.equal(image.type, "image/jpeg");
  assert.equal(Buffer.from(image.data, "base64").length, 1000 * 1024);
  assert.equal(runtime.fetches[0].url, "https://script.google.com/macros/s/test/exec?action=order");
  assert.equal(runtime.fetches[0].options.method, "POST");
  assert.equal(runtime.fetches[0].options.credentials, "omit");
  assert.equal(typeof runtime.fetches[0].options.body, "string");
  assert.equal(runtime.fetches[0].options.headers, undefined, "a text/plain body needs no preflight");
});

test("a 1.6 MB customizer PNG preview is attached, and one over 5 MB is not", () => {
  const ok = makeFormRuntime(Object.assign({ previewBlob: pngBlob(1.6 * 1024 * 1024) }, customizerOptions));
  assert.match(ok.elements.get("reference-image-status").textContent, /attached as saloni-customizer-preview\.png/);
  const tooBig = makeFormRuntime(Object.assign({ previewBlob: pngBlob(5 * 1024 * 1024 + 1) }, customizerOptions));
  assert.match(tooBig.elements.get("reference-image-status").textContent, /could not be attached/);
  assert.equal(tooBig.elements.get("remove-reference-image").hidden, true);
});

test("a preview that is empty, the wrong type, or missing is not attached and the form can still be sent", async () => {
  for (const blob of [
    { size: 4, type: "image/jpeg" },
    new Blob([], { type: "image/jpeg" }),
    new Blob([new Uint8Array(4)], { type: "image/webp" }),
    new Blob([new Uint8Array(4)], { type: "" }),
    null,
  ]) {
    const runtime = makeFormRuntime(Object.assign({ previewBlob: blob }, customizerOptions));
    assert.equal(runtime.elements.get("reference-image-preview-wrap").hidden, true);
    assert.match(runtime.elements.get("reference-image-status").textContent, /could not be attached\. You can still send your request/);
    fillValid(runtime.fields);
    submitOrderForm(runtime);
    await settle();
    assert.equal(runtime.submissions.length, 1);
    assert.equal(Object.hasOwn(runtime.submissions[0], "referenceImage"), false);
  }
});

test("catalogue, general and non-preview customizer forms attach no preview", () => {
  for (const options of [{ sourceKind: "catalogue" }, { sourceKind: "general", sourceId: "general:custom-gift" }, { sourceKind: "customizer", previewExpected: false }, { sourceKind: "customizer", omitPreviewExpected: true }, { sourceKind: "CUSTOMIZER", previewExpected: true }]) {
    const runtime = makeFormRuntime(Object.assign({ previewBlob: jpegBlob() }, options));
    assert.equal(runtime.elements.get("reference-image-preview-wrap").hidden, true, JSON.stringify(options));
    assert.equal(runtime.elements.get("remove-reference-image").hidden, true);
  }
});

test("a shopper's own file replaces the customizer preview, and removing it leaves no image", async () => {
  const runtime = makeFormRuntime(Object.assign({ previewBlob: jpegBlob() }, customizerOptions));
  runtime.fields.referenceImage.files = [new File([pngBlob(6)], "manual.png", { type: "image/png" })];
  runtime.fields.referenceImage.dispatch("change");
  await settle();
  assert.match(runtime.elements.get("reference-image-status").textContent, /Reference image attached/);
  fillValid(runtime.fields);
  submitOrderForm(runtime);
  assert.equal(runtime.status.textContent, "Sending your request…");
  await settle();
  assert.deepEqual(runtime.submissions[0].referenceImage, { type: "image/png", data: Buffer.alloc(6).toString("base64") });

  const removed = makeFormRuntime(Object.assign({ previewBlob: jpegBlob() }, customizerOptions));
  removed.elements.get("remove-reference-image").dispatch("click");
  assert.equal(removed.elements.get("reference-image-preview-wrap").hidden, true);
  assert.equal(removed.elements.get("remove-reference-image").hidden, true);
  assert.match(removed.elements.get("reference-image-status").textContent, /Customizer preview removed/);
  fillValid(removed.fields);
  submitOrderForm(removed);
  await settle();
  assert.equal(Object.hasOwn(removed.submissions[0], "referenceImage"), false);
});

test("cancelling the file picker keeps the customizer preview", () => {
  const runtime = makeFormRuntime(Object.assign({ previewBlob: jpegBlob() }, customizerOptions));
  runtime.fields.referenceImage.files = [];
  runtime.fields.referenceImage.dispatch("change");
  assert.equal(runtime.elements.get("remove-reference-image").hidden, false);
  assert.equal(runtime.elements.get("reference-image-preview-wrap").hidden, false);
});

test("the attached image and the typed details survive a failed send, and the retry keeps the same request id", async () => {
  const runtime = makeFormRuntime(Object.assign({ previewBlob: jpegBlob() }, customizerOptions));
  fillValid(runtime.fields);
  submitOrderForm(runtime);
  await settle();
  await runtime.callbacks[0].failure(new Error("offline"));
  assert.match(runtime.status.textContent, /unable to confirm.*entries are still here/i);
  assert.equal(runtime.elements.get("remove-reference-image").hidden, false);
  assert.equal(runtime.fields.productName.value, "Test frame");
  submitOrderForm(runtime);
  await settle();
  assert.equal(runtime.submissions.length, 2);
  assert.equal(runtime.submissions[1].requestId, runtime.submissions[0].requestId);
  assert.equal(runtime.submissions[1].requestId, "request-seed");
  assert.ok(runtime.submissions[1].referenceImage.data.length > 0);
});

test("a server answer with field errors keeps the image and the entries and focuses the field", async () => {
  const runtime = makeFormRuntime(Object.assign({ previewBlob: jpegBlob() }, customizerOptions));
  fillValid(runtime.fields);
  submitOrderForm(runtime);
  await settle();
  await runtime.callbacks[0].success({ ok: false, errors: { form: "The daily request limit has been reached." } });
  assert.equal(runtime.elements.get("remove-reference-image").hidden, false);
  assert.equal(runtime.fields.productName.value, "Test frame");
  assert.match(runtime.status.textContent, /daily request limit/);
});

test("an unconfirmed or invalid answer shows the unable-to-confirm message and keeps the entries", async () => {
  for (const answer of [{ ok: false, error: "unconfirmed" }, { ok: false, error: "invalid" }, null]) {
    const runtime = makeFormRuntime();
    fillValid(runtime.fields);
    submitOrderForm(runtime);
    await runtime.callbacks[0].success(answer);
    assert.match(runtime.status.textContent, /unable to confirm.*entries are still here/i);
    assert.equal(runtime.elements.get("submit-button").disabled, false);
    assert.equal(runtime.fields.customerName.value, "A Customer");
  }
});

test("a server error on the image is shown next to the image field", async () => {
  const runtime = makeFormRuntime();
  fillValid(runtime.fields);
  submitOrderForm(runtime);
  await runtime.callbacks[0].success({ ok: false, errors: { referenceImage: "The reference image must be 5 MB or smaller." } });
  assert.equal(errorText(runtime, "referenceImage"), "The reference image must be 5 MB or smaller.");
  assert.equal(runtime.fields.referenceImage.focused, true);
});

test("success revokes the preview URL, and Start another gets a new request id and no old preview", async () => {
  const runtime = makeFormRuntime(Object.assign({ previewBlob: jpegBlob() }, customizerOptions));
  fillValid(runtime.fields);
  submitOrderForm(runtime);
  await settle();
  await runtime.callbacks[0].success({ ok: true, requestId: "request-seed", receivedAt: "now" });
  runtime.windowObject.crypto.randomUUID = () => "fresh-request";
  runtime.elements.get("another-button").dispatch("click");
  assert.equal(runtime.objectUrls.revoked.length, runtime.objectUrls.created.length);
  assert.equal(runtime.fields.requestId.value, "fresh-request");
  assert.equal(runtime.elements.get("reference-image-preview-wrap").hidden, true);
  assert.equal(runtime.elements.get("remove-reference-image").hidden, true);
  assert.match(runtime.elements.get("reference-image-status").textContent, /return to the designer/i);
  fillValid(runtime.fields);
  submitOrderForm(runtime);
  await settle();
  assert.equal(runtime.submissions[1].requestId, "fresh-request");
  assert.equal(Object.hasOwn(runtime.submissions[1], "referenceImage"), false);
});

test("opening the form again replaces the old request, its entries and its image", async () => {
  const runtime = makeFormRuntime(Object.assign({ previewBlob: jpegBlob() }, customizerOptions));
  fillValid(runtime.fields);
  runtime.open({ requestId: "request-second", requestStage: "quote", sourceKind: "catalogue", sourceId: "catalogue:romantic-heart-trinket-tray.webp", productName: "Tray", quantity: "1", designDetails: "Tray details", fulfillment: "pickup" }, {});
  assert.equal(runtime.fields.requestId.value, "request-second");
  assert.equal(runtime.fields.productName.value, "Tray");
  assert.equal(runtime.fields.customerName.value, "");
  assert.equal(runtime.elements.get("reference-image-preview-wrap").hidden, true);
  assert.equal(runtime.form.hidden, false);
});

test("a late answer for an old request is ignored after the form is opened for another one", async () => {
  const runtime = makeFormRuntime();
  fillValid(runtime.fields);
  submitOrderForm(runtime);
  runtime.open({ requestId: "request-second", sourceKind: "catalogue", sourceId: "catalogue:other", productName: "Other", quantity: "1", designDetails: "d", fulfillment: "pickup" }, {});
  await runtime.callbacks[0].success({ ok: true, requestId: "request-seed", receivedAt: "now" });
  assert.equal(runtime.elements.get("another-button").hidden, true);
  assert.equal(runtime.elements.get("success-celebration").hidden, true);
  assert.equal(runtime.savedProfiles.length, 0);
});

test("always saves repeat details after a successful request and never after a failure", async () => {
  const failed = makeFormRuntime();
  fillValid(failed.fields);
  submitOrderForm(failed);
  await failed.callbacks[0].failure(new Error("server failure"));
  assert.equal(failed.savedProfiles.length, 0);

  const checked = makeFormRuntime();
  fillValid(checked.fields);
  submitOrderForm(checked);
  await checked.callbacks[0].success({ ok: true, requestId: "request-seed", receivedAt: "now" });
  assert.equal(checked.savedProfiles.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(checked.savedProfiles[0])), {
    customerName: "A Customer", phone: "8209238541", fulfillment: "pickup", shippingAddress: "", city: "", state: "", pin: "305001",
  });
});

test("uses the existing seeded fields for repeat details", () => {
  const runtime = makeFormRuntime({ seedOverrides: { customerName: "Saved Customer", phone: "+91 8209238541", fulfillment: "shipping", shippingAddress: "61 Hathi Bhata", city: "Ajmer", state: "Rajasthan", pin: "305001" } });
  assert.equal(runtime.fields.customerName.value, "Saved Customer");
  assert.equal(runtime.fields.phone.value, "+91 8209238541");
  assert.equal(runtime.fields.fulfillment.value, "shipping");
  assert.equal(runtime.fields.shippingAddress.value, "61 Hathi Bhata");
});

test("the referral check posts the code to the web app and ignores a stale answer", async () => {
  const runtime = makeFormRuntime();
  const code = runtime.elements.get("referral-code");
  code.value = "studioa";
  runtime.elements.get("check-referral").dispatch("click");
  assert.equal(runtime.fetches[0].url, "https://script.google.com/macros/s/test/exec?action=referral");
  assert.deepEqual(runtime.fetches[0].body, { code: "STUDIOA" });
  assert.equal(runtime.fetches[0].options.credentials, "omit");
  assert.equal(runtime.elements.get("check-referral").disabled, true);
  await runtime.lookupCallbacks[0].success({ status: "active", code: "STUDIOA" });
  assert.equal(runtime.elements.get("referral-status").textContent, "Code accepted.");
  assert.equal(runtime.elements.get("check-referral").disabled, false);
});

test("referral answers for paused, unknown, error and failed checks each get their own message", async () => {
  const cases = [["paused", /paused/], ["invalid", /not active/], ["error", /Could not check/]];
  for (const [state, pattern] of cases) {
    const runtime = makeFormRuntime();
    runtime.elements.get("referral-code").value = "STUDIOA";
    runtime.elements.get("check-referral").dispatch("click");
    await runtime.lookupCallbacks[0].success({ status: state });
    assert.match(runtime.elements.get("referral-status").textContent, pattern);
  }
  const offline = makeFormRuntime();
  offline.elements.get("referral-code").value = "STUDIOA";
  offline.elements.get("check-referral").dispatch("click");
  await offline.lookupCallbacks[0].failure(new Error("offline"));
  assert.match(offline.elements.get("referral-status").textContent, /Could not check the code/);
  assert.equal(offline.elements.get("check-referral").disabled, false);
});

test("clears accepted referral status on edits and ignores stale lookup responses", async () => {
  const runtime = makeFormRuntime();
  const code = runtime.elements.get("referral-code");
  const check = runtime.elements.get("check-referral");
  code.value = "STUDIOA";
  check.dispatch("click");
  assert.equal(runtime.lookupCallbacks.length, 1);
  await runtime.lookupCallbacks[0].success({ status: "active", code: "STUDIOA", displayName: "Studio A" });
  assert.equal(runtime.elements.get("referral-status").textContent, "Code accepted.");
  assert.doesNotMatch(runtime.elements.get("referral-status").textContent, /Studio A/);
  code.value = "UNKNOWN";
  code.dispatch("input");
  assert.doesNotMatch(runtime.elements.get("referral-status").textContent, /Code accepted/);
  await runtime.lookupCallbacks[0].success({ status: "active", code: "STUDIOA", displayName: "Studio A" });
  assert.doesNotMatch(runtime.elements.get("referral-status").textContent, /Code accepted|Studio A/);
});

test("late success completes and late failure restores the original attempt after an advisory timeout", async () => {
  const runtime = makeFormRuntime();
  fillValid(runtime.fields);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  await Promise.resolve();
  runtime.timers[0]();
  assert.match(runtime.status.textContent, /Still sending.*keep this window open.*within a minute/i);
  assert.equal(runtime.elements.get("submit-button").disabled, true);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.submissions.length, 1);
  await runtime.callbacks[0].success({ ok: true, requestId: "late", receivedAt: "late" });
  assert.match(runtime.status.textContent, /Request received/);
  assert.equal(runtime.elements.get("another-button").hidden, false);

  const failed = makeFormRuntime();
  fillValid(failed.fields);
  failed.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  await Promise.resolve();
  failed.timers[0]();
  await failed.callbacks[0].failure(new Error("network"));
  assert.match(failed.status.textContent, /unable to confirm/i);
  assert.equal(failed.elements.get("submit-button").disabled, false);
  assert.equal(failed.fields.productName.value, "Test frame");
  assert.equal(failed.fields.customerName.value, "A Customer");
  assert.equal(failed.fields.phone.value, "8209238541");
});

test("a pending send shows the still-sending advisory while general server errors remain readable", async () => {
  const stalled = makeFormRuntime();
  fillValid(stalled.fields);
  stalled.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  stalled.timers[0]();
  assert.match(stalled.status.textContent, /Still sending.*keep this window open.*within a minute/i);
  assert.equal(stalled.elements.get("submit-button").disabled, true);

  const runtime = makeFormRuntime();
  fillValid(runtime.fields);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  await Promise.resolve();
  await runtime.callbacks[0].success({ ok: false, errors: { form: "The daily request limit has been reached." } });
  assert.match(runtime.status.textContent, /daily request limit/);
});

test("an order is sent straight to the web app with no CAPTCHA request, and the draft and attachment survive a failure", async () => {
  const runtime = makeFormRuntime();
  fillValid(runtime.fields);
  runtime.fields.referenceImage.files = [new File([pngBlob(10)], "reference.png", { type: "image/png" })];
  runtime.fields.referenceImage.dispatch("change");
  await settle();
  submitOrderForm(runtime);
  await settle();
  assert.equal(runtime.submissions.length, 1);
  assert.equal(runtime.status.textContent, "Sending your request\u2026");
  assert.equal(runtime.fetches.length, 1);
  assert.equal(Object.hasOwn(runtime.submissions[0], "captchaToken"), false);
  assert.equal(runtime.timerDelays[0], 30000);
  assert.deepEqual(runtime.submissions[0].referenceImage, { type: "image/png", data: Buffer.alloc(10).toString("base64") });
  await runtime.callbacks[0].failure(new Error("network"));
  assert.match(runtime.status.textContent, /unable to confirm/i);
  assert.equal(runtime.elements.get("submit-button").disabled, false);
  assert.equal(runtime.fields.productName.value, "Test frame");
  assert.equal(runtime.elements.get("remove-reference-image").hidden, false);
});
test("client validation blocks invalid normalized dimensions and associates the focused error", () => {
  const runtime = makeFormRuntime({ sourceKind: "customizer", sourceId: "customizer:resin-frame", previewExpected: false });
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

test("submit status goes straight to sending, then still sending at 30 seconds", async () => {
  const runtime = makeFormRuntime();
  fillValid(runtime.fields);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.timerDelays[0], 30000);
  assert.equal(runtime.status.textContent, "Sending your request…");
  assert.equal(runtime.callbacks.length, 1);
  runtime.timers[0]();
  assert.equal(runtime.status.textContent, "Still sending \u2013 please keep this window open. Your request is on its way and usually finishes within a minute.");
  assert.equal(runtime.elements.get("submit-button").disabled, true);
  await runtime.callbacks[0].success({ ok: true, requestId: "late", receivedAt: "late" });
  assert.match(runtime.status.textContent, /Request received/);
});

test("a shopper's own PNG reference upload is still sent with the plain sending text", async () => {
  const runtime = makeFormRuntime();
  runtime.fields.referenceImage.files = [new File([pngBlob()], "manual.png", { type: "image/png" })];
  runtime.fields.referenceImage.dispatch("change");
  fillValid(runtime.fields);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.status.textContent, "Sending your request…");
  await settle();
  assert.equal(runtime.submissions.length, 1);
  assert.equal(runtime.submissions[0].referenceImage.type, "image/png");
});

const settle = () => new Promise((resolve) => setImmediate(resolve));
const PREVIEW_LIMIT = 5 * 1024 * 1024;
const REFERENCE_TOO_LARGE = "This image is too large to send. Please choose a smaller photo or screenshot (under 1.5 MB).";
const largePng = (name = "wall photo.png", size = 4 * 1024 * 1024) => new File([pngBlob(size)], name, { type: "image/png" });

test("a large PNG reference is replaced by a JPEG of at most 1600 px, which is what gets sent", async () => {
  const runtime = makeFormRuntime();
  runtime.fields.referenceImage.files = [largePng()];
  runtime.fields.referenceImage.dispatch("change");
  await settle();
  const canvas = runtime.imaging.canvases[0];
  assert.deepEqual([canvas.width, canvas.height], [1600, 1200]);
  assert.deepEqual(canvas.exported, { type: "image/jpeg", quality: 0.82 });
  assert.equal(runtime.imaging.bitmapsClosed, 1);
  assert.equal(runtime.elements.get("reference-image-status").textContent, "Reference image attached.");
  assert.equal(runtime.elements.get("reference-image-preview-wrap").hidden, false);
  fillValid(runtime.fields);
  submitOrderForm(runtime);
  await settle();
  const image = runtime.submissions[0].referenceImage;
  assert.equal(image.type, "image/jpeg");
  assert.equal(Buffer.from(image.data, "base64").length, runtime.imaging.jpegBytes);
});
test("a large reference that is already small in pixels is not upscaled", async () => {
  const runtime = makeFormRuntime();
  runtime.imaging.bitmapSize = { width: 900, height: 600 };
  runtime.fields.referenceImage.files = [largePng()];
  runtime.fields.referenceImage.dispatch("change");
  await settle();
  assert.deepEqual([runtime.imaging.canvases[0].width, runtime.imaging.canvases[0].height], [900, 600]);
});

test("a small JPEG or PNG reference is kept unchanged without decoding", async () => {
  const runtime = makeFormRuntime();
  const small = new File([jpegBlob(600 * 1024)], "small.jpg", { type: "image/jpeg" });
  runtime.fields.referenceImage.files = [small];
  runtime.fields.referenceImage.dispatch("change");
  await settle();
  assert.equal(runtime.imaging.canvases.length, 0);
  assert.equal(runtime.elements.get("reference-image-status").textContent, "Reference image attached.");
  assert.equal(runtime.elements.get("submit-button").disabled, false);
  fillValid(runtime.fields);
  submitOrderForm(runtime);
  await settle();
  assert.equal(Buffer.from(runtime.submissions[0].referenceImage.data, "base64").length, 600 * 1024);
});
test("shrinking fills the canvas white before drawing so PNG transparency does not turn black", async () => {
  const runtime = makeFormRuntime();
  runtime.fields.referenceImage.files = [largePng()];
  runtime.fields.referenceImage.dispatch("change");
  await settle();
  const names = runtime.imaging.canvases[0].calls.map((call) => call[0]);
  assert.deepEqual(names, ["fillStyle", "fillRect", "drawImage"]);
  assert.equal(runtime.imaging.canvases[0].calls[0][1], "#ffffff");
  assert.deepEqual(runtime.imaging.canvases[0].calls[1].slice(1), [0, 0, 1600, 1200]);
});

test("Send stays disabled with a preparing message while the image shrinks and comes back after", async () => {
  const runtime = makeFormRuntime();
  runtime.fields.referenceImage.files = [largePng()];
  runtime.fields.referenceImage.dispatch("change");
  assert.equal(runtime.elements.get("submit-button").disabled, true);
  assert.equal(runtime.elements.get("reference-image-status").textContent, "Preparing your image…");
  fillValid(runtime.fields);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.submissions.length, 0);
  await settle();
  assert.equal(runtime.elements.get("submit-button").disabled, false);
});

test("an image that cannot be shrunk is cleared with the too-large message and Send is re-enabled", async () => {
  const failures = [
    (runtime) => { runtime.imaging.decodeError = true; },
    (runtime) => { runtime.imaging.noToBlob = true; },
    (runtime) => { runtime.imaging.jpegBytes = 1.6 * 1024 * 1024; },
  ];
  for (const arrange of failures) {
    const runtime = makeFormRuntime();
    arrange(runtime);
    runtime.fields.referenceImage.files = [largePng()];
    runtime.fields.referenceImage.dispatch("change");
    await settle();
    assert.equal(runtime.elements.get("reference-image-status").textContent, REFERENCE_TOO_LARGE);
    assert.match(runtime.elements.get("reference-image-status").className, /error/);
    assert.equal(runtime.elements.get("reference-image-preview-wrap").hidden, true);
    assert.equal(runtime.elements.get("remove-reference-image").hidden, true);
    assert.equal(runtime.elements.get("submit-button").disabled, false);
    fillValid(runtime.fields);
    submitOrderForm(runtime);
    await settle();
    assert.equal(Object.hasOwn(runtime.submissions[0], "referenceImage"), false, "nothing too large is ever sent");
  }
});
test("when shrinking fails but the original is within 1.5 MB, the original is what gets sent", async () => {
  const failures = [
    (runtime) => { runtime.imaging.decodeError = true; },
    (runtime) => { runtime.imaging.noToBlob = true; },
    (runtime) => { runtime.imaging.jpegBytes = 1.6 * 1024 * 1024; },
  ];
  for (const arrange of failures) {
    const runtime = makeFormRuntime();
    arrange(runtime);
    runtime.fields.referenceImage.files = [largePng("mid.png", 1000 * 1024)];
    runtime.fields.referenceImage.dispatch("change");
    await settle();
    assert.equal(runtime.elements.get("reference-image-status").textContent, "Reference image attached.");
    assert.equal(runtime.elements.get("reference-image-preview-wrap").hidden, false);
    assert.equal(runtime.elements.get("submit-button").disabled, false);
    fillValid(runtime.fields);
    submitOrderForm(runtime);
    await settle();
    assert.deepEqual([runtime.submissions[0].referenceImage.type, Buffer.from(runtime.submissions[0].referenceImage.data, "base64").length], ["image/png", 1000 * 1024]);
  }
});
test("the decoded image is closed even when the canvas is unavailable", async () => {
  const runtime = makeFormRuntime();
  runtime.imaging.noToBlob = true;
  runtime.fields.referenceImage.files = [largePng()];
  runtime.fields.referenceImage.dispatch("change");
  await settle();
  assert.equal(runtime.imaging.bitmapsClosed, 1);
  const empty = makeFormRuntime();
  empty.imaging.bitmapSize = { width: 0, height: 0 };
  empty.fields.referenceImage.files = [largePng()];
  empty.fields.referenceImage.dispatch("change");
  await settle();
  assert.equal(empty.imaging.bitmapsClosed, 1);
});

test("a newer file choice wins over a slower shrink of the previous one", async () => {
  const runtime = makeFormRuntime();
  runtime.fields.referenceImage.files = [largePng()];
  runtime.fields.referenceImage.dispatch("change");
  runtime.fields.referenceImage.files = [];
  runtime.fields.referenceImage.dispatch("change");
  await settle();
  assert.equal(runtime.elements.get("reference-image-status").textContent, "No reference image attached.");
  assert.equal(runtime.elements.get("submit-button").disabled, false);
  fillValid(runtime.fields);
  submitOrderForm(runtime);
  assert.equal(Object.hasOwn(runtime.submissions[0], "referenceImage"), false);
});

test("a received order shows the success celebration, and starting another request hides it", async () => {
  const runtime = makeFormRuntime();
  const celebration = runtime.elements.get("success-celebration");
  celebration.hidden = true;
  fillValid(runtime.fields);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(celebration.hidden, true, "nothing celebrates before the server answers");
  await runtime.callbacks[0].success({ ok: true, requestId: "req-1", receivedAt: "now" });
  assert.equal(celebration.hidden, false);
  assert.match(runtime.status.textContent, /Request received/);
  runtime.elements.get("another-button").dispatch("click");
  assert.equal(celebration.hidden, true);
});

test("a failed order never shows the success celebration", async () => {
  const runtime = makeFormRuntime();
  const celebration = runtime.elements.get("success-celebration");
  celebration.hidden = true;
  fillValid(runtime.fields);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  await Promise.resolve();
  await runtime.callbacks[0].failure(new Error("network"));
  assert.equal(celebration.hidden, true);
});

test("the success celebration is decorative, animated, and still for reduced motion", () => {
  const block = html.match(/<div id="success-celebration"[^>]*>[\s\S]*?<\/div>/);
  assert.ok(block, "celebration markup exists");
  assert.match(block[0], /aria-hidden="true"/);
  assert.match(block[0], /\shidden[\s>]/);
  assert.ok(html.indexOf('id="success-celebration"') < html.indexOf('id="form-status"'), "sits above the status text");
  assert.ok((block[0].match(/class="confetti"/g) || []).length >= 10, "has a burst of confetti");
  assert.match(html, /@keyframes success-draw/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)[^@]*\.success-celebration[^}]*animation:\s*none/);
});

// --- My orders: the form hands a confirmed order summary to window.saloniMyOrders.save ---
function watchMyOrders(runtime) {
  const saved = [];
  runtime.windowObject.saloniMyOrders = { save(summary) { saved.push(JSON.parse(JSON.stringify(summary))); return true; } };
  return saved;
}

test("My orders: a confirmed single catalogue request is saved once with its name, quantity, photo, price, fulfilment and typed notes", async () => {
  const runtime = makeFormRuntime({ sourceId: "catalogue:romantic-heart-trinket-tray.webp", seedOverrides: { price: "Rs 899" } });
  const saved = watchMyOrders(runtime);
  fillValid(runtime.fields);
  runtime.fields.quantity.value = "2";
  runtime.fields.designDetails.value = "Details\n  Please add the name Asha  ";
  runtime.fields.email.value = "private@example.com";
  runtime.fields.referralCode.value = "FRIEND10";
  submitOrderForm(runtime);
  assert.equal(saved.length, 0, "nothing is saved while the request is still being sent");
  await runtime.callbacks[0].success({ ok: true, requestId: "request-seed", receivedAt: "now" });
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0], {
    requestId: "request-seed",
    items: [{ name: "Test frame", quantity: 2, price: "Rs 899", image: "assets/romantic-heart-trinket-tray.webp" }],
    fulfillment: "pickup",
    notes: "Please add the name Asha",
  });
});

test("My orders: a cart order saves every item of the bundle with its own thumbnail and edited quantity", async () => {
  const runtime = cartRuntime();
  const saved = watchMyOrders(runtime);
  const quantity = runtime.elements.get("bundle-items").children[1].querySelector("input");
  quantity.value = "3"; quantity.dispatch("change");
  runtime.fields.designDetails.value = "Warm colours";
  runtime.fields.designDetails.dispatch("input");
  await submitAndSend(runtime);
  await runtime.callbacks[0].success({ ok: true, requestId: "request-seed", receivedAt: "now" });
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].items, [
    { name: "One", quantity: 1, price: "249", image: "assets/one.webp" },
    { name: "Two", quantity: 3, price: "399", image: "assets/two.webp" },
  ]);
  assert.equal(saved[0].notes, "Warm colours");
});

test("My orders: general and customizer requests save the product name shown in the form, with no photo", async () => {
  for (const options of [{ sourceId: "catalogue:general-custom-gift", productName: "Custom gift enquiry" }, { sourceKind: "customizer", sourceId: "customizer:resin-frame", productName: "Custom resin frame", previewExpected: false }]) {
    const runtime = makeFormRuntime(options);
    const saved = watchMyOrders(runtime);
    fillValid(runtime.fields);
    runtime.fields.productName.value = options.productName;
    runtime.fields.designDetails.value = "Details";
    submitOrderForm(runtime);
    await runtime.callbacks[0].success({ ok: true, requestId: "request-seed", receivedAt: "now" });
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0].items, [{ name: options.productName, quantity: 1, price: "", image: "" }]);
    assert.equal(saved[0].notes, "", "the pre-filled design text is not the shopper's note");
  }
});

test("My orders: nothing is saved when the send fails, is unconfirmed, or the server returns field errors", async () => {
  const outcomes = [
    (runtime) => runtime.callbacks[0].failure(new Error("network")),
    (runtime) => runtime.callbacks[0].success({ ok: false }),
    (runtime) => runtime.callbacks[0].success({ errors: { phone: "bad" } }),
    (runtime) => runtime.callbacks[0].success(null),
  ];
  for (const outcome of outcomes) {
    const runtime = makeFormRuntime();
    const saved = watchMyOrders(runtime);
    fillValid(runtime.fields);
    submitOrderForm(runtime);
    await outcome(runtime);
    assert.equal(saved.length, 0);
  }
});

test("My orders: the saved summary carries no phone, email, address, PIN, image data or referral code, and a storage error never breaks the success screen", async () => {
  const runtime = makeFormRuntime();
  const saved = watchMyOrders(runtime);
  fillValid(runtime.fields);
  Object.assign(runtime.fields.shippingAddress, { value: "61 Hathi Bhata" });
  runtime.fields.email.value = "private@example.com";
  runtime.fields.referralCode.value = "FRIEND10";
  submitOrderForm(runtime);
  await runtime.callbacks[0].success({ ok: true, requestId: "request-seed", receivedAt: "now", referralCode: "FRIEND10" });
  const text = JSON.stringify(saved[0]);
  assert.deepEqual(Object.keys(saved[0]).sort(), ["fulfillment", "items", "notes", "requestId"]);
  for (const secret of ["8209238541", "private@example.com", "Hathi", "305001", "FRIEND10", "A Customer"]) assert.ok(!text.includes(secret), secret);

  const throwing = makeFormRuntime();
  throwing.windowObject.saloniMyOrders = { save() { throw new Error("storage denied"); } };
  fillValid(throwing.fields);
  submitOrderForm(throwing);
  await throwing.callbacks[0].success({ ok: true, requestId: "request-seed", receivedAt: "now" });
  assert.equal(throwing.elements.get("success-celebration").hidden, false);
  assert.match(throwing.status.textContent, /Request received/);
});

test("My orders: notes are trimmed and capped at 300 characters", async () => {
  const runtime = makeFormRuntime({ seedOverrides: { designDetails: "" } });
  const saved = watchMyOrders(runtime);
  fillValid(runtime.fields);
  runtime.fields.designDetails.value = "  " + "n".repeat(500) + "  ";
  submitOrderForm(runtime);
  await runtime.callbacks[0].success({ ok: true, requestId: "request-seed", receivedAt: "now" });
  assert.equal(saved[0].notes, "n".repeat(300));
});

// --- Visitor counts: "order sent" is counted only after the server confirms, and carries nothing from the form ---
test("analytics: order-sent is counted once the server confirms, with no personal data in the event", async () => {
  const runtime = makeFormRuntime();
  const events = [];
  runtime.windowObject.saloniTrack = (...args) => events.push(args);
  fillValid(runtime.fields);
  runtime.fields.referralCode.value = "FRIEND10";
  submitOrderForm(runtime);
  assert.deepEqual(events, [], "nothing is counted while the request is still being sent");
  await runtime.callbacks[0].success({ ok: true, requestId: "request-seed", receivedAt: "now", referralCode: "FRIEND10" });
  assert.deepEqual(events, [["order-sent"]]);
  assert.match(runtime.status.textContent, /Request received/);
});

test("analytics: a failed, refused or unconfirmed send is never counted as sent", async () => {
  const failed = makeFormRuntime();
  const events = [];
  failed.windowObject.saloniTrack = (name) => events.push(name);
  fillValid(failed.fields);
  submitOrderForm(failed);
  await failed.callbacks[0].failure(new Error("network"));
  assert.deepEqual(events, []);
  const refused = makeFormRuntime();
  refused.windowObject.saloniTrack = (name) => events.push(name);
  fillValid(refused.fields);
  submitOrderForm(refused);
  await refused.callbacks[0].success({ ok: false, error: "Please check the form." });
  assert.deepEqual(events, []);
});

test("analytics: a missing or throwing saloniTrack does not stop the success screen or My orders saving", async () => {
  const throwing = makeFormRuntime();
  throwing.windowObject.saloniTrack = () => { throw new Error("analytics broke"); };
  const saved = watchMyOrders(throwing);
  fillValid(throwing.fields);
  submitOrderForm(throwing);
  await throwing.callbacks[0].success({ ok: true, requestId: "request-seed", receivedAt: "now" });
  assert.equal(saved.length, 1);
  assert.equal(throwing.elements.get("success-celebration").hidden, false);
  const bare = makeFormRuntime();
  fillValid(bare.fields);
  submitOrderForm(bare);
  await bare.callbacks[0].success({ ok: true, requestId: "request-seed", receivedAt: "now" });
  assert.equal(bare.elements.get("success-celebration").hidden, false);
});
