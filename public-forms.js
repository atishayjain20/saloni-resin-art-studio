/*
 * The Partner Circle application and the Corporate Gifting enquiry, built into their pages.
 * Opening a form is instant: nothing is sent to Google until Submit. The reCAPTCHA script loads the first time the
 * shopper focuses the form, and Submit asks it for a token and posts one JSON body to the Apps Script web app.
 */
(function () {
  "use strict";
  var TIMEOUT_MS = 30000;
  var LINK_PREFIX = "https://saloniresinart.com/?ref=";
  var captcha = { loading: false, waiters: [] };

  function newId(prefix) {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  // Loads the reCAPTCHA script once, without running it. done(true) when grecaptcha.ready can be used, done(false) if it cannot load.
  function loadCaptcha(siteKey, done) {
    if (window.grecaptcha && window.grecaptcha.ready) { if (done) done(true); return; }
    if (!siteKey) { if (done) done(false); return; }
    if (done) captcha.waiters.push(done);
    if (captcha.loading) return;
    captcha.loading = true;
    var existing = document.querySelector ? document.querySelector('script[src*="recaptcha/api.js"]') : null;
    var script = existing || document.createElement("script");
    function settle(ok) {
      if (!captcha.loading) return;
      captcha.loading = false;
      if (!ok && !existing && script.parentNode && script.parentNode.removeChild) script.parentNode.removeChild(script);
      var waiters = captcha.waiters;
      captcha.waiters = [];
      waiters.forEach(function (waiter) { waiter(ok); });
    }
    script.addEventListener("load", function () { settle(Boolean(window.grecaptcha && window.grecaptcha.ready)); });
    script.addEventListener("error", function () { settle(false); });
    if (!existing) {
      script.src = "https://www.google.com/recaptcha/api.js?render=" + encodeURIComponent(siteKey);
      script.async = true;
      document.head.appendChild(script);
    }
  }

  function captchaToken(siteKey, action, done) {
    var finished = false;
    function finish(token) { if (finished) return; finished = true; done(typeof token === "string" ? token : ""); }
    loadCaptcha(siteKey, function (ready) {
      if (!ready) { finish(""); return; }
      try {
        window.grecaptcha.ready(function () {
          try {
            var result = window.grecaptcha.execute(siteKey, { action: action });
            if (!result || typeof result.then !== "function") { finish(""); return; }
            result.then(finish, function () { finish(""); });
          } catch (error) { finish(""); }
        });
      } catch (error) { finish(""); }
    });
  }

  // What both forms share: the field helpers, the status line, the captcha token and the JSON post.
  function kit(form) {
    var status = document.getElementById("form-status");
    var submitButton = document.getElementById("submit-button");
    var anotherButton = document.getElementById("another-button");
    var siteKey = form.getAttribute("data-captcha-site-key") || "";
    var execUrl = form.getAttribute("data-order-form-url") || "";
    var helpers = {
      status: status, submitButton: submitButton, anotherButton: anotherButton,
      value: function (name) { return form.elements[name] ? String(form.elements[name].value || "") : ""; },
      setStatus: function (message, kind) { status.textContent = message || ""; status.className = "status" + (kind ? " " + kind : ""); },
      focusStatus: function () { status.setAttribute("tabindex", "-1"); status.focus(); },
      setError: function (field, message) {
        var input = form.elements[field];
        if (!input) return;
        input.setAttribute("aria-invalid", "true");
        var ids = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
        if (ids.indexOf(field + "-error") === -1) ids.push(field + "-error");
        input.setAttribute("aria-describedby", ids.join(" "));
        var error = document.getElementById(field + "-error");
        if (!error) { error = document.createElement("p"); error.id = field + "-error"; error.className = "field-error"; input.parentNode.appendChild(error); }
        error.textContent = message;
      },
      clearErrors: function () {
        Array.prototype.forEach.call(form.querySelectorAll("[aria-invalid]"), function (input) {
          input.removeAttribute("aria-invalid");
          var ids = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter(function (id) { return id && id !== input.name + "-error"; });
          if (ids.length) input.setAttribute("aria-describedby", ids.join(" ")); else input.removeAttribute("aria-describedby");
        });
        Array.prototype.forEach.call(form.querySelectorAll(".field-error"), function (error) { if (error.remove) error.remove(); });
      },
      showErrors: function (errors) {
        Object.keys(errors).forEach(function (field) { helpers.setError(field, errors[field]); });
        var first = Object.keys(errors)[0];
        if (first && form.elements[first] && form.elements[first].focus) form.elements[first].focus(); else helpers.focusStatus();
      },
      // Fields the shopper can fix get an inline error; a server message for the whole form (paused, full, captcha) goes in the status line.
      showServerErrors: function (errors) {
        errors = errors && typeof errors === "object" ? errors : { form: "Please correct the highlighted fields and try again." };
        Object.keys(errors).forEach(function (field) { helpers.setError(field, errors[field]); });
        helpers.setStatus(errors.form || errors.captcha || "Please correct the highlighted fields and try again.", "error");
        var first = Object.keys(errors)[0];
        if (first && form.elements[first] && form.elements[first].focus) form.elements[first].focus(); else helpers.focusStatus();
      },
      setFormVisible: function (visible) {
        Array.prototype.forEach.call(form.querySelectorAll("fieldset, #submit-button"), function (element) { element.hidden = !visible; });
      },
      // Asks reCAPTCHA for a token, then posts the body. gate(hasToken) decides whether to go on (false: stop, nothing is sent).
      // Resolves with the parsed JSON answer, or null when nothing was sent.
      send: function (action, captchaAction, body, gate) {
        return new Promise(function (resolve, reject) {
          captchaToken(siteKey, captchaAction, function (token) {
            if (gate(Boolean(token)) === false || !token) { resolve(null); return; }
            if (!execUrl || execUrl.indexOf("REPLACE_WITH_") !== -1 || typeof window.fetch !== "function") { reject(new Error("not configured")); return; }
            body.captchaToken = token;
            // A text/plain JSON body is a "simple" request, so the browser sends it without a preflight.
            window.fetch(execUrl + "?action=" + action, { method: "POST", credentials: "omit", body: JSON.stringify(body) })
              .then(function (response) { return response.json(); }).then(resolve, reject);
          });
        });
      }
    };
    // The page shows the form already; reCAPTCHA is fetched the first time someone touches it.
    form.addEventListener("focusin", function () { loadCaptcha(siteKey); });
    return helpers;
  }

  function initPartner(form) {
    var k = kit(form);
    var referralResult = document.getElementById("referral-result");
    var active = false;
    var currentAttempt = null;
    var timeoutId = null;
    var FIELDS = ["applicationId", "applicantName", "businessName", "category", "serviceArea", "phone", "email", "website", "typicalCustomers", "referralPlan"];
    var UNABLE = "We were unable to send the application. Your entries are still here; please try again.";
    function valid() {
      var errors = {};
      ["applicantName", "businessName", "serviceArea", "typicalCustomers", "referralPlan"].forEach(function (field) { if (!k.value(field).trim()) errors[field] = "This field is required."; });
      if (!k.value("category")) errors.category = "Choose a partner category.";
      if (!k.value("phone") || (k.value("phone").match(/[0-9]/g) || []).length < 7) errors.phone = "Enter a valid phone number.";
      if (k.value("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k.value("email"))) errors.email = "Enter a valid email address or leave it blank.";
      if (k.value("website") && !/^https?:\/\/[^\s]+$/i.test(k.value("website"))) errors.website = "Use an http or https website address, or leave it blank.";
      if (!form.elements.rulesAccepted.checked) errors.rulesAccepted = "Accept the partner rules and privacy notice to apply.";
      return errors;
    }
    function current(attempt) { return currentAttempt === attempt && active; }
    function restore(attempt) {
      if (attempt && !current(attempt)) return;
      active = false;
      k.submitButton.disabled = false;
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    function selectNode(node) {
      try { var range = document.createRange(); range.selectNodeContents(node); var selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); return true; } catch (error) { return false; }
    }
    function copyLink(link, node, button) {
      function copied() { button.textContent = "Copied"; }
      function fallback() {
        var selected = selectNode(node);
        try { if (document.execCommand && document.execCommand("copy")) { copied(); return; } } catch (error) {}
        button.textContent = selected ? "Link selected - copy it now" : "Copy the link above";
      }
      var clipboard = window.navigator && window.navigator.clipboard;
      if (clipboard && clipboard.writeText) { try { clipboard.writeText(link).then(copied, fallback); } catch (error) { fallback(); } } else fallback();
    }
    function showReferral(link) {
      referralResult.textContent = "";
      var anchor = document.createElement("a");
      anchor.setAttribute("href", link); anchor.setAttribute("target", "_blank"); anchor.setAttribute("rel", "noreferrer");
      anchor.textContent = link;
      var copy = document.createElement("button");
      copy.setAttribute("type", "button"); copy.textContent = "Copy link";
      copy.addEventListener("click", function () { copyLink(link, anchor, copy); });
      var hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = "Share this link with couples and families you help. Orders that use it count toward your commission.";
      referralResult.appendChild(anchor); referralResult.appendChild(copy); referralResult.appendChild(hint);
      referralResult.hidden = false;
    }
    function success(result, attempt) {
      if (!current(attempt)) return;
      restore(attempt);
      k.setFormVisible(false);
      k.anotherButton.hidden = false;
      var link = typeof result.referralLink === "string" && result.referralLink.indexOf(LINK_PREFIX) === 0 ? result.referralLink : "";
      if (link) { k.setStatus("You're in! Your referral link:", "success"); showReferral(link); }
      else k.setStatus("Application received. Saloni will contact you with your referral link. Application ID: " + result.applicationId, "success");
      k.focusStatus();
    }
    function failed(attempt) {
      if (!current(attempt)) return;
      restore(attempt);
      k.setStatus(UNABLE, "error");
      k.focusStatus();
    }
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (active) return;
      k.clearErrors();
      var errors = valid();
      if (Object.keys(errors).length) { k.setStatus("Please correct the highlighted fields and try again.", "error"); k.showErrors(errors); return; }
      var attempt = {};
      currentAttempt = attempt;
      active = true;
      k.submitButton.disabled = true;
      k.setStatus("Checking the application…", "");
      timeoutId = window.setTimeout(function () {
        if (!current(attempt)) return;
        restore(attempt);
        k.setStatus("Unable to send the application yet. Your entries are still here; please try again.", "error");
        k.focusStatus();
      }, TIMEOUT_MS);
      var body = {};
      FIELDS.forEach(function (field) { body[field] = k.value(field); });
      body.rulesAccepted = Boolean(form.elements.rulesAccepted.checked);
      k.send("partner", "partner_application", body, function (hasToken) {
        if (!current(attempt)) return false;
        if (!hasToken) { restore(attempt); k.setStatus("Captcha verification is required. Please try again.", "error"); k.focusStatus(); return false; }
        return true;
      }).then(function (result) {
        if (!result || !current(attempt)) return;
        if (result.ok === true) success(result, attempt);
        else if (result.errors) { restore(attempt); k.showServerErrors(result.errors); }
        else failed(attempt);
      }, function () { failed(attempt); });
    });
    k.anotherButton.addEventListener("click", function () {
      form.reset();
      form.elements.applicationId.value = newId("application");
      k.setFormVisible(true);
      k.anotherButton.hidden = true;
      referralResult.textContent = "";
      referralResult.hidden = true;
      k.clearErrors();
      k.setStatus("", "");
    });
    form.elements.applicationId.value = newId("application");
  }

  function initCorporate(form) {
    var k = kit(form);
    var active = false;
    var currentAttempt = null;
    var uncertainAttempt = null;
    var timeoutId = null;
    var BUSINESS_FIELDS = ["enquiryId", "organisationName", "contactName", "phone", "email", "enquiryType", "occasion", "approximateQuantity", "budgetRange", "requiredDate", "deliveryScope", "brief"];
    function snapshot() {
      var payload = {};
      BUSINESS_FIELDS.forEach(function (field) { payload[field] = k.value(field); });
      payload.privacyAccepted = Boolean(form.elements.privacyAccepted && form.elements.privacyAccepted.checked);
      return payload;
    }
    function samePayload(first, second) { return JSON.stringify(first) === JSON.stringify(second); }
    function valid() {
      var errors = {};
      ["organisationName", "contactName", "deliveryScope", "brief"].forEach(function (field) { if (!k.value(field).trim()) errors[field] = "This field is required."; });
      if (!k.value("enquiryType")) errors.enquiryType = "Choose the type of gifting enquiry.";
      if (!k.value("occasion")) errors.occasion = "Choose the occasion that fits best.";
      if (!k.value("phone") || (k.value("phone").match(/[0-9]/g) || []).length < 7) errors.phone = "Enter a valid phone or WhatsApp number.";
      if (k.value("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k.value("email"))) errors.email = "Enter a valid email address or leave it blank.";
      if (k.value("approximateQuantity") && (!/^\d{1,9}$/.test(k.value("approximateQuantity")) || Number(k.value("approximateQuantity")) < 1)) errors.approximateQuantity = "Enter a positive whole number, or leave it blank.";
      if (k.value("requiredDate") && !/^\d{4}-\d{2}-\d{2}$/.test(k.value("requiredDate"))) errors.requiredDate = "Use a valid required date.";
      if (!form.elements.privacyAccepted.checked) errors.privacyAccepted = "Accept the privacy notice to send an enquiry.";
      return errors;
    }
    function current(attempt) { return currentAttempt === attempt && active; }
    function restore(attempt) {
      if (attempt && !current(attempt)) return;
      active = false;
      k.submitButton.disabled = false;
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    function showConflict() {
      k.anotherButton.hidden = false;
      k.setStatus("These entries changed while an earlier enquiry was still being confirmed. To protect the original enquiry, it was not resent with a different ID or payload. Choose Start another enquiry to send the changed details.", "error");
      k.focusStatus();
    }
    // The enquiry may have been saved even though no answer arrived: a retry must resend exactly the same details under the same ID.
    function uncertain(attempt) {
      if (!attempt.sent) return;
      attempt.uncertain = true;
      uncertainAttempt = attempt;
      if (!samePayload(snapshot(), attempt.payload)) showConflict();
      else { k.setStatus("We could not confirm the enquiry yet. Your entries are still here; check them and try again.", "error"); k.focusStatus(); }
    }
    function success(result, attempt) {
      if (!current(attempt)) return;
      restore(attempt);
      uncertainAttempt = null;
      k.setFormVisible(false);
      k.anotherButton.hidden = false;
      k.setStatus("Enquiry received. Saloni will review feasibility, design, materials, quotation, and delivery with you. This does not confirm an order, schedule, price, or delivery date. Enquiry ID: " + result.enquiryId, "success");
      k.focusStatus();
    }
    function failed(attempt) {
      if (!current(attempt)) return;
      restore(attempt);
      uncertain(attempt);
      if (!attempt.uncertain) k.setStatus("We were unable to send the enquiry. Your entries are still here; please try again.", "error");
      k.focusStatus();
    }
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (active) return;
      k.clearErrors();
      var errors = valid();
      if (Object.keys(errors).length) { k.setStatus("Please correct the highlighted fields and try again.", "error"); k.showErrors(errors); return; }
      var requestedPayload = snapshot();
      if (uncertainAttempt && !samePayload(requestedPayload, uncertainAttempt.payload)) { showConflict(); return; }
      var attempt = { payload: uncertainAttempt ? JSON.parse(JSON.stringify(uncertainAttempt.payload)) : requestedPayload, sent: false, uncertain: false };
      currentAttempt = attempt;
      active = true;
      k.submitButton.disabled = true;
      k.setStatus("Checking the enquiry…", "");
      timeoutId = window.setTimeout(function () {
        if (!current(attempt)) return;
        restore(attempt);
        uncertain(attempt);
        if (!attempt.sent) { k.setStatus("Unable to verify the enquiry yet. Your entries are still here; please try again.", "error"); k.focusStatus(); }
      }, TIMEOUT_MS);
      var body = JSON.parse(JSON.stringify(attempt.payload));
      k.send("corporate", "corporate_enquiry", body, function (hasToken) {
        if (!current(attempt)) return false;
        if (!hasToken) { restore(attempt); k.setStatus("Captcha verification is required. Please try again.", "error"); k.focusStatus(); return false; }
        attempt.sent = true;
        return true;
      }).then(function (result) {
        if (!result || !current(attempt)) return;
        if (result.ok === true) success(result, attempt);
        else if (result.errors) { restore(attempt); k.showServerErrors(result.errors); }
        else failed(attempt);
      }, function () { failed(attempt); });
    });
    k.anotherButton.addEventListener("click", function () {
      uncertainAttempt = null;
      currentAttempt = null;
      form.reset();
      form.elements.enquiryId.value = newId("enquiry");
      k.setFormVisible(true);
      k.anotherButton.hidden = true;
      k.clearErrors();
      k.setStatus("", "");
    });
    form.elements.enquiryId.value = newId("enquiry");
  }

  var partnerForm = document.getElementById("partner-form");
  if (partnerForm) initPartner(partnerForm);
  var corporateForm = document.getElementById("corporate-form");
  if (corporateForm) initCorporate(corporateForm);
}());
