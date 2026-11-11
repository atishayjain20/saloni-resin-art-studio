const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// The Partner Circle application and the Corporate Gifting enquiry are built into their pages (public-forms.js).
// These tests run that script against the real form markup of each page, with a fake DOM, fake reCAPTCHA and a fake fetch.
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const source = read("public-forms.js");
const REFERRAL_LINK_PREFIX = "https://saloniresinart.com/?ref=";
const EXEC_URL = "https://script.google.com/macros/s/AKfycbydFuwmR32zO3Sj28a1YWZNTgThHctu-LnpkWVJAkUOQZfRgnzS1qTfbb2JeHvYa-Qg/exec";
const SITE_KEY = "6Lcyc_YtAAAAAH9NRP14nKWeaeVcIBXs5PwrhmT3";
const KINDS = {
  partner: { page: "partners/index.html", form: "partner-form", action: "partner", captchaAction: "partner_application", idField: "applicationId" },
  corporate: { page: "corporate-gifting/index.html", form: "corporate-form", action: "corporate", captchaAction: "corporate_enquiry", idField: "enquiryId" },
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

class FakeElement {
  constructor(tag, id = "") {
    this.tagName = tag; this.id = id; this.name = ""; this.type = ""; this.value = ""; this.checked = false; this.hidden = false; this.disabled = false;
    this.className = ""; this.attributes = {}; this.children = []; this.parentNode = null; this.listeners = {}; this.focused = false; this._text = "";
  }
  get textContent() { return this._text; }
  set textContent(value) { this._text = String(value); this.children = []; }
  set innerHTML(_value) { throw new Error("innerHTML must not be used"); }
  addEventListener(type, listener) { (this.listeners[type] = this.listeners[type] || []).push(listener); }
  dispatch(type, event = {}) { (this.listeners[type] || []).forEach((listener) => listener(Object.assign({ target: this, preventDefault() {} }, event))); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : ""; }
  removeAttribute(name) { delete this.attributes[name]; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); return child; }
  remove() { if (this.parentNode && this.parentNode.removeChild) this.parentNode.removeChild(this); }
  focus() { this.focused = true; }
}

function attributesOf(text) {
  const attributes = {};
  for (const match of text.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attributes[match[1]] = match[2] === undefined ? "" : match[2];
  return attributes;
}

function makeRuntime(kind, options = {}) {
  const config = KINDS[kind];
  const markup = read(config.page).match(new RegExp(`<form id="${config.form}"[\\s\\S]*?</form>`))[0];
  const form = new FakeElement("form", config.form);
  const elements = new Map([[config.form, form]]);
  const fields = {};
  const fieldsets = [];
  const errors = [];
  for (const match of markup.matchAll(/<(\w+)\b([^>]*)>/g)) {
    const attributes = attributesOf(match[2]);
    if (match[1] === "form") { Object.entries(attributes).forEach(([name, value]) => form.setAttribute(name, value)); continue; }
    if (match[1] === "fieldset") { fieldsets.push(new FakeElement("fieldset")); continue; }
    if (!attributes.id) continue;
    const element = new FakeElement(match[1], attributes.id);
    element.name = attributes.name || "";
    element.type = attributes.type || "";
    element.hidden = "hidden" in attributes;
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    elements.set(attributes.id, element);
    if (attributes.name) {
      fields[attributes.name] = element;
      element.parentNode = { children: [], appendChild(child) { child.parentNode = this; errors.push(child); this.children.push(child); return child; }, removeChild(child) { const index = errors.indexOf(child); if (index >= 0) errors.splice(index, 1); } };
    }
  }
  form.elements = fields;
  form.reset = () => Object.values(fields).forEach((field) => { field.value = ""; field.checked = false; });
  form.querySelectorAll = (selector) => {
    if (selector === "[aria-invalid]") return Object.values(fields).filter((field) => field.getAttribute("aria-invalid"));
    if (selector === ".field-error") return errors.slice();
    if (selector === "fieldset, #submit-button") return fieldsets.concat([elements.get("submit-button")]);
    return [];
  };
  const timers = [];
  const fetches = [];
  const executions = [];
  const scripts = [];
  const clipboardWrites = [];
  const selections = [];
  const captchaState = { token: null, reject: false };
  const recaptcha = {
    ready: (callback) => callback(),
    execute: (siteKey, opts) => {
      executions.push({ siteKey, action: opts.action });
      if (captchaState.reject) return Promise.reject(new Error("captcha failed"));
      return Promise.resolve(captchaState.token === null ? "token-" + executions.length : captchaState.token);
    },
  };
  let uuid = 0;
  const windowObject = {
    crypto: { randomUUID: () => `${kind}-id-${++uuid}-abcdef` },
    setTimeout(fn, delay) { timers.push({ fn, delay, cleared: false }); return timers.length; },
    clearTimeout(id) { if (timers[id - 1]) timers[id - 1].cleared = true; },
    navigator: options.clipboard === false ? {} : { clipboard: { writeText: (text) => { clipboardWrites.push(text); return options.clipboardReject ? Promise.reject(new Error("denied")) : Promise.resolve(); } } },
    getSelection: () => ({ removeAllRanges() {}, addRange(range) { selections.push(range.node); } }),
    // The only network the forms use: a JSON POST to the web app, answered when the test says so.
    fetch(url, init) {
      return new Promise((resolve, reject) => {
        fetches.push({ url, init, body: JSON.parse(init.body), respond: (result) => { resolve({ json: () => Promise.resolve(result) }); return settle(); }, fail: (error = new Error("network")) => { reject(error); return settle(); } });
      });
    },
  };
  if (options.captcha !== "lazy") windowObject.grecaptcha = recaptcha;
  const head = { appendChild(script) { script.parentNode = head; scripts.push(script); return script; }, removeChild(script) { scripts.splice(scripts.indexOf(script), 1); } };
  const documentObject = {
    head,
    getElementById: (id) => elements.get(id) || errors.find((element) => element.id === id) || null,
    createElement: (tag) => new FakeElement(tag),
    querySelector: (selector) => (/recaptcha/.test(selector) ? scripts.find((script) => /recaptcha/.test(script.src || "")) || null : null),
    createRange: () => ({ node: null, selectNodeContents(node) { this.node = node; } }),
    execCommand: () => false,
  };
  const context = { console, document: documentObject, window: windowObject, navigator: windowObject.navigator, Promise };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "public-forms.js" });
  const runtime = {
    config, form, elements, fields, fieldsets, errors, timers, fetches, executions, scripts, captchaState, clipboardWrites, selections, windowObject,
    status: elements.get("form-status"), submitButton: elements.get("submit-button"), another: elements.get("another-button"),
    box: elements.get("referral-result"),
    submit: async () => { form.dispatch("submit"); await settle(); },
    // The reCAPTCHA script that a first focus appended finishes loading (or fails).
    finishScript(ok) {
      if (ok) windowObject.grecaptcha = recaptcha;
      scripts.forEach((script) => script.dispatch(ok ? "load" : "error"));
      return settle();
    },
    timeout: () => timers.filter((timer) => timer.delay === 30000 && !timer.cleared).pop().fn(),
  };
  return runtime;
}

function fill(runtime, overrides = {}) {
  const values = runtime.config.form === "partner-form"
    ? { applicantName: "Asha", businessName: "Asha Studio", category: "Planner", serviceArea: "Ajmer", phone: "8209238541", email: "asha@example.com", website: "https://example.com", typicalCustomers: "Couples and families", referralPlan: "I will share stories" }
    : { organisationName: "Acme Private Limited", contactName: "A Customer", phone: "8209238541", email: "contact@example.com", enquiryType: "one-off", occasion: "employee birthday", approximateQuantity: "25", budgetRange: "INR total to quote", requiredDate: "2027-02-20", deliveryScope: "Ajmer and Jaipur offices", brief: "Resin keepsakes for an employee celebration." };
  Object.entries(Object.assign(values, overrides)).forEach(([name, value]) => { runtime.fields[name].value = value; });
  (runtime.fields.rulesAccepted || runtime.fields.privacyAccepted).checked = true;
  return runtime;
}

const withoutToken = (body) => { const copy = Object.assign({}, body); delete copy.captchaToken; return copy; };

for (const kind of Object.keys(KINDS)) {
  const { page, form: formId, action, captchaAction, idField } = KINDS[kind];
  const pageHtml = read(page);

  test(`${kind}: the form is built into the page, with no iframe, frame messaging or Apps Script template`, () => {
    assert.match(pageHtml, new RegExp(`<form id="${formId}"[^>]*data-order-form-url="${EXEC_URL.replace(/[./]/g, "\\$&")}"[^>]*data-captcha-site-key="${SITE_KEY}"`));
    assert.doesNotMatch(pageHtml, /<iframe|order-form-embed|order-form-frame|data-form-mode|data-intake-ready/);
    assert.match(pageHtml, /<script class="site-script" src="\.\.\/script\.js\?v=\d+" defer><\/script>\s*<script class="public-forms-script" src="\.\.\/public-forms\.js\?v=\d+" defer><\/script>/);
    assert.doesNotMatch(pageHtml, /recaptcha\/api\.js/);
    assert.doesNotMatch(source, /postMessage|MessageChannel|google\.script|window\.top|window\.parent|PARENT_ORIGIN|innerHTML/);
    assert.match(pageHtml, /<noscript>[\s\S]*8209238541[\s\S]*<\/noscript>/);
  });

  test(`${kind}: opening the page shows the form and sends nothing: no request, no reCAPTCHA script`, () => {
    const runtime = makeRuntime(kind, { captcha: "lazy" });
    assert.equal(runtime.fetches.length, 0);
    assert.equal(runtime.scripts.length, 0);
    assert.equal(runtime.timers.length, 0);
    assert.notEqual(runtime.fields[idField].value, "", "a request id is ready before the first Submit");
    assert.equal(runtime.form.hidden, false);
  });

  test(`${kind}: the reCAPTCHA script loads once, the first time the form is focused`, async () => {
    const runtime = makeRuntime(kind, { captcha: "lazy" });
    runtime.form.dispatch("focusin");
    runtime.form.dispatch("focusin");
    assert.equal(runtime.scripts.length, 1);
    assert.equal(runtime.scripts[0].src, "https://www.google.com/recaptcha/api.js?render=" + SITE_KEY);
    await runtime.finishScript(true);
    runtime.form.dispatch("focusin");
    assert.equal(runtime.scripts.length, 1);
    assert.equal(runtime.fetches.length, 0);
    const ready = makeRuntime(kind);
    ready.form.dispatch("focusin");
    assert.equal(ready.scripts.length, 0, "nothing to load when reCAPTCHA is already on the page");
  });

  test(`${kind}: Submit before the script finished loading waits for it, then sends one JSON post with the token`, async () => {
    const runtime = fill(makeRuntime(kind, { captcha: "lazy" }));
    runtime.form.dispatch("focusin");
    await runtime.submit();
    assert.equal(runtime.fetches.length, 0, "no post until the captcha token exists");
    assert.equal(runtime.submitButton.disabled, true);
    await runtime.finishScript(true);
    assert.equal(runtime.scripts.length, 1);
    assert.deepEqual(runtime.executions, [{ siteKey: SITE_KEY, action: captchaAction }]);
    assert.equal(runtime.fetches.length, 1);
    assert.equal(runtime.fetches[0].url, `${EXEC_URL}?action=${action}`);
    assert.equal(runtime.fetches[0].init.method, "POST");
    assert.equal(runtime.fetches[0].init.credentials, "omit");
    assert.equal(runtime.fetches[0].body.captchaToken, "token-1");
    assert.equal(runtime.fetches[0].body[idField], runtime.fields[idField].value);
  });

  test(`${kind}: Submit loads the script itself when the form was never focused`, async () => {
    const runtime = fill(makeRuntime(kind, { captcha: "lazy" }));
    await runtime.submit();
    assert.equal(runtime.scripts.length, 1);
    await runtime.finishScript(true);
    assert.equal(runtime.fetches.length, 1);
  });

  test(`${kind}: invalid entries show inline errors, focus the first one, and use neither reCAPTCHA nor the network`, async () => {
    const runtime = fill(makeRuntime(kind), { phone: "12" });
    await runtime.submit();
    assert.equal(runtime.executions.length, 0);
    assert.equal(runtime.fetches.length, 0);
    assert.equal(runtime.fields.phone.getAttribute("aria-invalid"), "true");
    assert.match(runtime.elements.get("form-status").textContent, /Please correct the highlighted fields/);
    assert.equal(runtime.fields.phone.focused, true);
    assert.equal(runtime.submitButton.disabled, false);
    runtime.fields.phone.value = "8209238541";
    await runtime.submit();
    assert.equal(runtime.fields.phone.getAttribute("aria-invalid"), "");
    assert.equal(runtime.errors.length, 0);
    assert.equal(runtime.fetches.length, 1);
  });

  test(`${kind}: a missing, rejected or unloadable captcha shows the captcha message, keeps the entries and sends nothing`, async () => {
    const empty = fill(makeRuntime(kind));
    empty.captchaState.token = "";
    await empty.submit();
    assert.match(empty.status.textContent, /Captcha verification is required/);
    assert.equal(empty.status.focused, true);
    const rejected = fill(makeRuntime(kind));
    rejected.captchaState.reject = true;
    await rejected.submit();
    assert.match(rejected.status.textContent, /Captcha verification is required/);
    const noScript = fill(makeRuntime(kind, { captcha: "lazy" }));
    await noScript.submit();
    await noScript.finishScript(false);
    assert.match(noScript.status.textContent, /Captcha verification is required/);
    assert.equal(noScript.scripts.length, 0, "a script that failed to load is removed so a later try can load it again");
    for (const runtime of [empty, rejected, noScript]) {
      assert.equal(runtime.fetches.length, 0);
      assert.equal(runtime.submitButton.disabled, false);
      assert.equal(runtime.fields.phone.value, "8209238541");
    }
    empty.captchaState.token = null;
    await empty.submit();
    assert.equal(empty.fetches.length, 1, "the next try works");
  });

  test(`${kind}: the server answering with field errors or a form message keeps the entries and shows them`, async () => {
    const runtime = fill(makeRuntime(kind));
    await runtime.submit();
    await runtime.fetches[0].respond({ ok: false, errors: { phone: "Enter a valid phone number.", captcha: "Captcha verification failed. Please try again." } });
    assert.equal(runtime.fields.phone.getAttribute("aria-invalid"), "true");
    assert.equal(runtime.errors.find((error) => error.id === "phone-error").textContent, "Enter a valid phone number.");
    assert.equal(runtime.status.textContent, "Captcha verification failed. Please try again.");
    assert.equal(runtime.submitButton.disabled, false);
    assert.equal(runtime.fields.phone.value, "8209238541");
    assert.equal(runtime.fieldsets.some((fieldset) => fieldset.hidden), false);
    await runtime.submit();
    assert.equal(runtime.errors.some((error) => error.id === "phone-error"), false, "old errors are cleared on the next Submit");
    const paused = fill(makeRuntime(kind));
    await paused.submit();
    await paused.fetches[0].respond({ ok: false, errors: { form: "Paused. Please contact Saloni directly." } });
    assert.equal(paused.status.textContent, "Paused. Please contact Saloni directly.");
  });

  test(`${kind}: after 30 seconds it says it could not send, keeps the entries, and a late answer is ignored`, async () => {
    const runtime = fill(makeRuntime(kind));
    await runtime.submit();
    assert.equal(runtime.timers.filter((timer) => timer.delay === 30000).length, 1);
    runtime.timeout();
    assert.match(runtime.status.textContent, kind === "partner" ? /Unable to send the application yet/ : /(could not confirm|Unable to verify)/);
    assert.equal(runtime.status.focused, true);
    assert.equal(runtime.submitButton.disabled, false);
    const message = runtime.status.textContent;
    await runtime.fetches[0].respond({ ok: true, [idField]: runtime.fields[idField].value, referralLink: REFERRAL_LINK_PREFIX + "LATE" });
    assert.equal(runtime.status.textContent, message);
    assert.equal(runtime.fieldsets.some((fieldset) => fieldset.hidden), false);
  });

  test(`${kind}: a network failure or an unconfirmed answer keeps the entries and a retry keeps the same request id`, async () => {
    for (const failure of ["network", "unconfirmed", "invalid"]) {
      const runtime = fill(makeRuntime(kind));
      await runtime.submit();
      const id = runtime.fetches[0].body[idField];
      if (failure === "network") await runtime.fetches[0].fail(); else await runtime.fetches[0].respond({ ok: false, error: failure });
      assert.match(runtime.status.textContent, kind === "partner" ? /unable to send the application/i : /(could not confirm|unable to send the enquiry)/i, failure);
      assert.equal(runtime.status.focused, true);
      assert.equal(runtime.submitButton.disabled, false);
      assert.equal(runtime.fields.phone.value, "8209238541");
      await runtime.submit();
      assert.equal(runtime.fetches.length, 2);
      assert.equal(runtime.fetches[1].body[idField], id, "the retry is the same request, so the server can recognise it");
      assert.deepEqual(withoutToken(runtime.fetches[1].body), withoutToken(runtime.fetches[0].body));
    }
  });

  test(`${kind}: Submit is ignored while a request is in flight`, async () => {
    const runtime = fill(makeRuntime(kind));
    await runtime.submit();
    await runtime.submit();
    assert.equal(runtime.fetches.length, 1);
    assert.equal(runtime.submitButton.disabled, true);
  });

  test(`${kind}: Start another gives a fresh request id and shows the form again`, async () => {
    const runtime = fill(makeRuntime(kind));
    await runtime.submit();
    const first = runtime.fetches[0].body[idField];
    await runtime.fetches[0].respond(kind === "partner" ? { ok: true, applicationId: first, referralLink: REFERRAL_LINK_PREFIX + "ASHASTUD7K2M" } : { ok: true, enquiryId: first, receivedAt: "now" });
    assert.equal(runtime.another.hidden, false);
    assert.equal(runtime.fieldsets.every((fieldset) => fieldset.hidden), true);
    assert.equal(runtime.submitButton.hidden, true);
    runtime.another.dispatch("click");
    assert.notEqual(runtime.fields[idField].value, first);
    assert.equal(runtime.fieldsets.some((fieldset) => fieldset.hidden), false);
    assert.equal(runtime.submitButton.hidden, false);
    assert.equal(runtime.another.hidden, true);
    assert.equal(runtime.status.textContent, "");
  });
}

test("partner: the success view shows the referral link with a copy button and never uses innerHTML", async () => {
  const link = REFERRAL_LINK_PREFIX + "ASHASTUD7K2M";
  const runtime = fill(makeRuntime("partner"));
  await runtime.submit();
  assert.deepEqual(runtime.fetches[0].body.rulesAccepted, true);
  assert.equal(runtime.fetches[0].body.category, "Planner");
  await runtime.fetches[0].respond({ ok: true, applicationId: runtime.fields.applicationId.value, receivedAt: "now", referralCode: "ASHASTUD7K2M", referralLink: link });
  assert.equal(runtime.status.textContent, "You're in! Your referral link:");
  assert.equal(runtime.status.focused, true);
  assert.equal(runtime.box.hidden, false);
  const anchor = runtime.box.children.find((child) => child.tagName === "a");
  const copy = runtime.box.children.find((child) => child.tagName === "button");
  assert.equal(anchor.textContent, link);
  assert.equal(anchor.getAttribute("href"), link);
  assert.equal(copy.textContent, "Copy link");
  assert.match(runtime.box.children.map((child) => child.textContent).join(" "), /couples/i);
  copy.dispatch("click");
  await settle();
  assert.deepEqual(runtime.clipboardWrites, [link]);
  assert.equal(copy.textContent, "Copied");
  runtime.another.dispatch("click");
  assert.equal(runtime.box.hidden, true);
  assert.equal(runtime.box.children.length, 0);
});

test("partner: the link is selected when the clipboard is unavailable, and an unexpected link is never shown", async () => {
  const link = REFERRAL_LINK_PREFIX + "ASHASTUD7K2M";
  const runtime = fill(makeRuntime("partner", { clipboard: false }));
  await runtime.submit();
  await runtime.fetches[0].respond({ ok: true, applicationId: "application-seed-123", referralLink: link });
  const anchor = runtime.box.children.find((child) => child.tagName === "a");
  runtime.box.children.find((child) => child.tagName === "button").dispatch("click");
  assert.deepEqual(runtime.selections, [anchor]);
  const hostile = fill(makeRuntime("partner"));
  await hostile.submit();
  await hostile.fetches[0].respond({ ok: true, applicationId: "application-seed-123", referralLink: "javascript:alert(1)" });
  assert.equal(hostile.box.children.length, 0);
  assert.match(hostile.status.textContent, /Saloni will contact you with your referral link\. Application ID: application-seed-123/);
});

test("partner: when no link came back it says the link follows", async () => {
  const runtime = fill(makeRuntime("partner"));
  await runtime.submit();
  await runtime.fetches[0].respond({ ok: true, applicationId: "application-seed-123", receivedAt: "now" });
  assert.equal(runtime.status.textContent, "Application received. Saloni will contact you with your referral link. Application ID: application-seed-123");
  assert.equal(runtime.box.hidden, true);
  assert.equal(runtime.another.hidden, false);
});

test("partner: requires every field, a category, a phone, and the rules, and checks email and website", async () => {
  const runtime = makeRuntime("partner");
  await runtime.submit();
  for (const field of ["applicantName", "businessName", "category", "serviceArea", "phone", "typicalCustomers", "referralPlan", "rulesAccepted"]) {
    assert.equal(runtime.fields[field].getAttribute("aria-invalid"), "true", field);
  }
  assert.equal(runtime.fetches.length, 0);
  assert.equal(runtime.fields.applicantName.focused, true);
  fill(runtime, { email: "not-an-email", website: "ftp://example.com" });
  await runtime.submit();
  assert.equal(runtime.fields.email.getAttribute("aria-invalid"), "true");
  assert.equal(runtime.fields.website.getAttribute("aria-invalid"), "true");
  assert.equal(runtime.fields.applicantName.getAttribute("aria-invalid"), "");
});

test("corporate: requires the organisation, contact, scope, brief, type, occasion, phone and privacy, and checks the optional fields", async () => {
  const runtime = makeRuntime("corporate");
  await runtime.submit();
  for (const field of ["organisationName", "contactName", "phone", "enquiryType", "occasion", "deliveryScope", "brief", "privacyAccepted"]) {
    assert.equal(runtime.fields[field].getAttribute("aria-invalid"), "true", field);
  }
  assert.equal(runtime.fetches.length, 0);
  fill(runtime, { email: "nope", approximateQuantity: "0", requiredDate: "tomorrow" });
  await runtime.submit();
  for (const field of ["email", "approximateQuantity", "requiredDate"]) assert.equal(runtime.fields[field].getAttribute("aria-invalid"), "true", field);
  assert.equal(runtime.fetches.length, 0);
});

test("corporate: sends every business field and the privacy consent, and shows the receipt with the enquiry id", async () => {
  const runtime = fill(makeRuntime("corporate"));
  await runtime.submit();
  const body = runtime.fetches[0].body;
  assert.deepEqual(Object.keys(body).sort(), ["approximateQuantity", "brief", "budgetRange", "captchaToken", "contactName", "deliveryScope", "email", "enquiryId", "enquiryType", "occasion", "organisationName", "phone", "privacyAccepted", "requiredDate"]);
  assert.equal(body.privacyAccepted, true);
  await runtime.fetches[0].respond({ ok: true, enquiryId: body.enquiryId, receivedAt: "now" });
  assert.match(runtime.status.textContent, new RegExp(`^Enquiry received\\. Saloni will review.*Enquiry ID: ${body.enquiryId}$`));
  assert.equal(runtime.status.className, "status success");
  assert.equal(runtime.another.hidden, false);
});

test("corporate: entries changed while an earlier enquiry is unconfirmed are not resent, and a stale success is ignored", async () => {
  const runtime = fill(makeRuntime("corporate"));
  await runtime.submit();
  const original = runtime.fetches[0].body;
  runtime.fields.organisationName.value = "Edited while pending";
  runtime.timeout();
  assert.match(runtime.status.textContent, /changed while an earlier enquiry/i);
  assert.equal(runtime.status.focused, true);
  assert.equal(runtime.another.hidden, false);
  const before = runtime.status.textContent;
  await runtime.fetches[0].respond({ ok: true, enquiryId: original.enquiryId, receivedAt: "late" });
  assert.equal(runtime.status.textContent, before);
  assert.equal(runtime.fieldsets.some((fieldset) => fieldset.hidden), false);
  await runtime.submit();
  assert.equal(runtime.fetches.length, 1, "a changed payload must not be sent under the old ID");
  runtime.another.dispatch("click");
  assert.notEqual(runtime.fields.enquiryId.value, original.enquiryId);
  assert.equal(runtime.status.textContent, "");
  fill(runtime, { organisationName: "Edited while pending" });
  await runtime.submit();
  assert.equal(runtime.fetches.length, 2, "after Start another the changed details go out under a new ID");
  assert.notEqual(runtime.fetches[1].body.enquiryId, original.enquiryId);
});

test("corporate: an unconfirmed enquiry is retried with the exact original details and stale answers cannot control the retry", async () => {
  const runtime = fill(makeRuntime("corporate"));
  await runtime.submit();
  const original = runtime.fetches[0].body;
  runtime.timeout();
  assert.match(runtime.status.textContent, /could not confirm/i);
  assert.equal(runtime.status.getAttribute("tabindex"), "-1");
  await runtime.submit();
  assert.equal(runtime.fetches.length, 2);
  assert.deepEqual(withoutToken(runtime.fetches[1].body), withoutToken(original));
  await runtime.fetches[0].respond({ ok: true, enquiryId: original.enquiryId, receivedAt: "stale" });
  assert.match(runtime.status.textContent, /checking/i);
  await runtime.fetches[1].respond({ ok: true, enquiryId: original.enquiryId, receivedAt: "fresh" });
  assert.match(runtime.status.textContent, /Enquiry received/);
});

test("corporate: a failed captcha on the retry sends nothing and keeps blocking changed details under the unresolved ID", async () => {
  const runtime = fill(makeRuntime("corporate"));
  await runtime.submit();
  const original = runtime.fetches[0].body;
  runtime.timeout();
  runtime.captchaState.token = "";
  await runtime.submit();
  assert.equal(runtime.fetches.length, 1, "a failed retry captcha must not call the backend");
  runtime.fields.organisationName.value = "Changed after retry captcha failure";
  await runtime.submit();
  assert.equal(runtime.fetches.length, 1, "changed details must not be sent under the unresolved ID");
  assert.equal(runtime.fields.enquiryId.value, original.enquiryId);
  assert.equal(runtime.another.hidden, false);
  assert.match(runtime.status.textContent, /Start another enquiry/i);
});

test("corporate: a server captcha rejection on the retry keeps the possible-save details and blocks a changed third submission", async () => {
  const runtime = fill(makeRuntime("corporate"));
  await runtime.submit();
  const original = runtime.fetches[0].body;
  runtime.timeout();
  await runtime.submit();
  await runtime.fetches[1].respond({ ok: false, errors: { captcha: "Captcha verification failed. Please try again." } });
  assert.equal(runtime.fetches.length, 2);
  assert.equal(runtime.fetches[1].body.enquiryId, original.enquiryId);
  runtime.fields.organisationName.value = "Changed after server rejection";
  await runtime.submit();
  assert.equal(runtime.fetches.length, 2, "changed details must not be sent after an unresolved server response");
  assert.equal(runtime.another.hidden, false);
  assert.match(runtime.status.textContent, /Start another enquiry/i);
});
