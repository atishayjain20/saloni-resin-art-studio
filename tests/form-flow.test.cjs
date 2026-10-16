const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Form.html"), "utf8");
const formSource = html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1]
  .replace(/<\?!= captchaEnabledJson \?>/g, "true")
  .replace(/<\?!= captchaSiteKeyJson \?>/g, JSON.stringify("site-key"));

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
  focus() { this.focused = true; }
}

function makeFormRuntime({ captcha = "ready", timeout = 1 } = {}) {
  const ids = ["request-id", "source-kind", "source-id", "product-name", "quantity", "height", "height-unit", "width", "width-unit", "design-details", "customer-name", "phone", "email", "fulfillment", "shipping-address", "city", "state", "pin", "requested-date", "reference-image", "captcha-token", "form-status", "submit-button", "another-button", "shipping-fields", "seed-data"];
  const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
  const form = new FakeElement("order-form");
  elements.set("order-form", form);
  const errors = [];
  const fields = {
    requestId: elements.get("request-id"), sourceKind: elements.get("source-kind"), sourceId: elements.get("source-id"), productName: elements.get("product-name"),
    quantity: elements.get("quantity"), height: elements.get("height"), heightUnit: elements.get("height-unit"), width: elements.get("width"), widthUnit: elements.get("width-unit"),
    designDetails: elements.get("design-details"), customerName: elements.get("customer-name"), phone: elements.get("phone"), email: elements.get("email"), fulfillment: elements.get("fulfillment"),
    shippingAddress: elements.get("shipping-address"), city: elements.get("city"), state: elements.get("state"), pin: elements.get("pin"), requestedDate: elements.get("requested-date"),
    referenceImage: elements.get("reference-image"), captchaToken: elements.get("captcha-token"),
  };
  form.elements = fields;
  form.querySelectorAll = (selector) => {
    if (selector === "[aria-invalid]") return Object.values(fields).filter((field) => field.getAttribute("aria-invalid"));
    if (selector === ".field-error") return errors;
    if (selector === "fieldset, #submit-button, #captcha-token") return [elements.get("submit-button"), elements.get("captcha-token")];
    return [];
  };
  form.reset = () => Object.values(fields).forEach((field) => { field.value = ""; field.files = []; });
  Object.values(fields).forEach((field) => { field.parentNode = { appendChild(child) { errors.push(child); } }; });
  elements.get("seed-data").textContent = JSON.stringify({ requestId: "request-seed", sourceKind: "catalogue", sourceId: "catalogue:test", productName: "Test frame", quantity: "1", height: "3", heightUnit: "ft", width: "4", widthUnit: "ft", designDetails: "Details", customerName: "", phone: "", email: "", fulfillment: "pickup", shippingAddress: "", city: "", state: "", pin: "", requestedDate: "" });
  const status = elements.get("form-status");
  const timers = [];
  const submissions = [];
  const callbacks = [];
  const parentMessages = [];
  const run = {
    withSuccessHandler(callback) { this.success = callback; return this; },
    withFailureHandler(callback) { this.failure = callback; return this; },
    submitOrder(value) { submissions.push(value); callbacks.push({ success: this.success, failure: this.failure }); return this; },
  };
  const windowObject = {
    parent: { postMessage(message) { parentMessages.push(message); } },
    crypto: { randomUUID: () => "request-new" },
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {},
    grecaptcha: captcha === "stalled" ? { ready() {} } : { ready(callback) { callback(); }, execute() { return Promise.resolve("captcha-token"); } },
  };
  const documentObject = {
    getElementById(id) { return elements.get(id) || null; },
    createElement(tag) { const element = new FakeElement(tag); element.className = ""; return element; },
  };
  const context = {
    console, document: documentObject, window: windowObject,
    google: { script: { run } },
    setTimeout: windowObject.setTimeout, clearTimeout: windowObject.clearTimeout,
  };
  vm.createContext(context);
  vm.runInContext(formSource, context, { filename: "Form.html" });
  elements.get("submit-button").dispatch("click");
  return { elements, fields, status, timers, submissions, callbacks, parentMessages, windowObject };
}

function fillValid(fields) {
  Object.assign(fields.productName, { value: "Test frame" });
  Object.assign(fields.quantity, { value: "1" });
  Object.assign(fields.height, { value: "3" }); Object.assign(fields.heightUnit, { value: "ft" });
  Object.assign(fields.width, { value: "4" }); Object.assign(fields.widthUnit, { value: "ft" });
  Object.assign(fields.designDetails, { value: "Blue and gold" }); Object.assign(fields.customerName, { value: "A Customer" });
  Object.assign(fields.phone, { value: "8209238541" }); Object.assign(fields.fulfillment, { value: "pickup" });
}

test("late success and failure from timed-out attempt cannot control a retry", async () => {
  const runtime = makeFormRuntime();
  fillValid(runtime.fields);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  runtime.timers[0]();
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  runtime.callbacks[0].success({ ok: true, requestId: "old", receivedAt: "old" });
  assert.match(runtime.status.textContent, /Checking/);
  runtime.callbacks[1].failure(new Error("network"));
  assert.match(runtime.status.textContent, /unable to confirm/i);
});

test("stalled CAPTCHA is bounded and general server errors remain readable", async () => {
  const stalled = makeFormRuntime({ captcha: "stalled" });
  fillValid(stalled.fields);
  stalled.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  stalled.timers[0]();
  assert.match(stalled.status.textContent, /unable to confirm/i);

  const runtime = makeFormRuntime();
  fillValid(runtime.fields);
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  await Promise.resolve();
  runtime.callbacks[0].success({ ok: false, errors: { form: "The daily request limit has been reached." } });
  assert.match(runtime.status.textContent, /daily request limit/);
});

test("client validation blocks invalid normalized dimensions and associates the focused error", () => {
  const runtime = makeFormRuntime();
  runtime.fields.productName.value = "";
  runtime.fields.quantity.value = "1";
  runtime.fields.height.value = "5"; runtime.fields.heightUnit.value = "ft";
  runtime.fields.width.value = "4"; runtime.fields.widthUnit.value = "ft";
  runtime.fields.designDetails.value = ""; runtime.fields.customerName.value = ""; runtime.fields.phone.value = ""; runtime.fields.fulfillment.value = "pickup";
  runtime.elements.get("order-form").dispatch("submit", { preventDefault() {} });
  assert.equal(runtime.submissions.length, 0);
  assert.match(runtime.status.textContent, /correct/i);
  assert.equal(runtime.fields.height.focused || runtime.fields.productName.focused, true);
  assert.match(runtime.fields.productName.getAttribute("aria-describedby"), /productName-error/);
});
