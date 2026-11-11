/*
 * The Partner Circle application, the Corporate Gifting enquiry and the customer review, built into their pages.
 * Opening a form is instant: nothing is sent to Google until Submit, and Submit posts one JSON body to the Apps Script
 * web app straight away. The server's kill switches and daily caps protect these forms.
 */
(function () {
  "use strict";
  var TIMEOUT_MS = 30000;
  var LINK_PREFIX = "https://saloniresinart.com/?ref=";

  function newId(prefix) {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  // What the forms share: the field helpers, the status line and the JSON post.
  function kit(form) {
    var status = document.getElementById("form-status");
    var submitButton = document.getElementById("submit-button");
    var anotherButton = document.getElementById("another-button");
    var execUrl = form.getAttribute("data-order-form-url") || "";
    // A radio group is a list of inputs: the first one stands for it, and its error text goes in the group box (id "<field>-group") when there is one.
    function fieldInput(field) {
      var input = form.elements[field];
      if (input && !input.setAttribute && input[0]) input = input[0];
      return input;
    }
    function errorHost(field, input) { return document.getElementById(field + "-group") || input.parentNode; }
    var helpers = {
      status: status, submitButton: submitButton, anotherButton: anotherButton, fieldInput: fieldInput,
      value: function (name) { return form.elements[name] ? String(form.elements[name].value || "") : ""; },
      setStatus: function (message, kind) { status.textContent = message || ""; status.className = "status" + (kind ? " " + kind : ""); },
      focusStatus: function () { status.setAttribute("tabindex", "-1"); status.focus(); },
      setError: function (field, message) {
        var input = fieldInput(field);
        if (!input) return;
        input.setAttribute("aria-invalid", "true");
        var ids = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
        if (ids.indexOf(field + "-error") === -1) ids.push(field + "-error");
        input.setAttribute("aria-describedby", ids.join(" "));
        var error = document.getElementById(field + "-error");
        if (!error) { error = document.createElement("p"); error.id = field + "-error"; error.className = "field-error"; errorHost(field, input).appendChild(error); }
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
        helpers.focusFirst(errors);
      },
      focusFirst: function (errors) {
        var first = Object.keys(errors)[0];
        var input = first && fieldInput(first);
        if (input && input.focus) input.focus(); else helpers.focusStatus();
      },
      // Fields the shopper can fix get an inline error; a server message for the whole form (paused, full) goes in the status line.
      showServerErrors: function (errors) {
        errors = errors && typeof errors === "object" ? errors : { form: "Please correct the highlighted fields and try again." };
        Object.keys(errors).forEach(function (field) { helpers.setError(field, errors[field]); });
        helpers.setStatus(errors.form || "Please correct the highlighted fields and try again.", "error");
        helpers.focusFirst(errors);
      },
      setFormVisible: function (visible) {
        Array.prototype.forEach.call(form.querySelectorAll("fieldset, #submit-button"), function (element) { element.hidden = !visible; });
      },
      // Posts the body at once. Resolves with the parsed JSON answer; rejects when nothing could be sent or read.
      send: function (action, body) {
        return new Promise(function (resolve, reject) {
          if (!execUrl || execUrl.indexOf("REPLACE_WITH_") !== -1 || typeof window.fetch !== "function") { reject(new Error("not configured")); return; }
          // A text/plain JSON body is a "simple" request, so the browser sends it without a preflight.
          window.fetch(execUrl + "?action=" + action, { method: "POST", credentials: "omit", body: JSON.stringify(body) })
            .then(function (response) { return response.json(); }).then(resolve, reject);
        });
      }
    };
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
      k.send("partner", body).then(function (result) {
        if (!current(attempt)) return;
        if (result && result.ok === true) success(result, attempt);
        else if (result && result.errors) { restore(attempt); k.showServerErrors(result.errors); }
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
      attempt.sent = true;
      k.send("corporate", body).then(function (result) {
        if (!current(attempt)) return;
        if (result && result.ok === true) success(result, attempt);
        else if (result && result.errors) { restore(attempt); k.showServerErrors(result.errors); }
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

  function initReview(form) {
    var k = kit(form);
    var productSelect = document.getElementById("product-id");
    var productHint = document.getElementById("product-hint");
    var fileInput = document.getElementById("review-photos");
    var previews = document.getElementById("photo-previews");
    var active = false;
    var currentAttempt = null;
    var uncertainAttempt = null;
    var timeoutId = null;
    var photos = [];
    var preparing = 0;
    var generation = 0;
    var MAX_PHOTOS = 3;
    var MAX_SOURCE_BYTES = 15 * 1024 * 1024;
    var MAX_PHOTO_BYTES = 1024 * 1024;
    var MAX_SIDE = 1600;
    var QUALITIES = [0.85, 0.72, 0.6];
    var JPEG_PREFIX = "data:image/jpeg;base64,";
    var PHOTO_ERROR = "This photo could not be prepared; try another photo or post without photos";
    var PRODUCT_ID = /^catalogue:[A-Za-z0-9_.-]{1,160}$/;
    var BUSINESS_FIELDS = ["reviewId", "productId", "rating", "firstName", "city", "comment"];
    function snapshot() {
      var payload = {};
      BUSINESS_FIELDS.forEach(function (field) { payload[field] = k.value(field); });
      payload.photos = photos.map(function (photo) { return { type: "image/jpeg", data: photo.data }; });
      return payload;
    }
    function samePayload(first, second) { return JSON.stringify(first) === JSON.stringify(second); }
    function hasContact(text) { return /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/.test(text) || /(?:\d[\s\-().]*){10,}/.test(text) || /https?:\/\/|www\./i.test(text); }
    function validFirstName(name) { return name.length >= 2 && name.length <= 40 && !/[0-9@<>]/.test(name) && !hasContact(name); }
    function valid() {
      var errors = {};
      var name = k.value("firstName").trim();
      var city = k.value("city").trim();
      var comment = k.value("comment").trim();
      if (!/^[1-5]$/.test(k.value("rating"))) errors.rating = "Choose a rating from 1 to 5 stars.";
      if (name.length < 2 || name.length > 40 || /[0-9@]/.test(name) || hasContact(name)) errors.firstName = "Enter your first name, 2 to 40 letters, without numbers or @.";
      if (city && (city.length > 60 || /[0-9@]/.test(city) || hasContact(city))) errors.city = "Enter a city name without numbers or @, or leave it blank.";
      if (comment.length < 10 || comment.length > 800) errors.comment = "Write 10 to 800 characters.";
      else if (hasContact(comment)) errors.comment = "Please remove phone numbers, emails and web links from your review.";
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
      k.setStatus("These entries changed while an earlier review was still being confirmed. To protect the original review, it was not resent with a different ID or payload. Choose Write another review to post the changed details.", "error");
      k.focusStatus();
    }
    // The review may have been saved even though no answer arrived: a retry must resend exactly the same details and photos under the same ID.
    function uncertain(attempt) {
      if (!attempt.sent) return;
      attempt.uncertain = true;
      uncertainAttempt = attempt;
      if (!samePayload(snapshot(), attempt.payload)) showConflict();
      else { k.setStatus("We could not confirm the review yet. Your entries are still here; check them and try again.", "error"); k.focusStatus(); }
    }
    function success(attempt) {
      if (!current(attempt)) return;
      restore(attempt);
      uncertainAttempt = null;
      k.setFormVisible(false);
      k.anotherButton.hidden = false;
      k.setStatus("Thank you, " + attempt.payload.firstName.trim().split(/\s+/)[0] + ". Your review now shows on the home page of saloniresinart.com.", "success");
      k.focusStatus();
    }
    function failed(attempt) {
      if (!current(attempt)) return;
      restore(attempt);
      uncertain(attempt);
      if (!attempt.uncertain) k.setStatus("We were unable to post the review. Your entries are still here; please try again.", "error");
      k.focusStatus();
    }
    function renderPhotos() {
      while (previews.firstChild) previews.removeChild(previews.firstChild);
      photos.forEach(function (photo, index) {
        var item = document.createElement("li");
        var image = document.createElement("img");
        image.src = photo.preview;
        image.alt = "Selected photo " + (index + 1);
        var remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", "Remove photo " + (index + 1));
        remove.addEventListener("click", function () { photos = photos.filter(function (candidate) { return candidate !== photo; }); renderPhotos(); });
        item.appendChild(image);
        item.appendChild(remove);
        previews.appendChild(item);
      });
    }
    // Safari adds Exif and Photoshop blocks to canvas JPEGs. Drop every APP1-APP15 and comment segment, keep the rest.
    // Takes and returns a binary string; returns null when the JPEG structure cannot be read to the scan.
    function stripJpegMetadata(binary) {
      if (binary.charCodeAt(0) !== 0xff || binary.charCodeAt(1) !== 0xd8) return null;
      var out = binary.slice(0, 2);
      var offset = 2;
      while (offset + 1 < binary.length) {
        if (binary.charCodeAt(offset) !== 0xff) return null;
        var marker = binary.charCodeAt(offset + 1);
        if (marker === 0xff) { offset += 1; continue; }
        if (marker === 0xda || marker === 0xd9) return out + binary.slice(offset);
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { out += binary.slice(offset, offset + 2); offset += 2; continue; }
        if (offset + 3 >= binary.length) return null;
        var end = offset + 2 + binary.charCodeAt(offset + 2) * 256 + binary.charCodeAt(offset + 3);
        if (end > binary.length || end < offset + 4) return null;
        if (!((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe)) out += binary.slice(offset, end);
        offset = end;
      }
      return null;
    }
    // The original file is never sent: every photo is redrawn on a white canvas and re-encoded as a JPEG of at most 1 MB.
    function preparePhoto(file, done) {
      if (!file || (file.type !== "image/jpeg" && file.type !== "image/png")) { done("Choose JPG or PNG photos only."); return; }
      if (file.size > MAX_SOURCE_BYTES) { done("Each photo must be 15 MB or smaller."); return; }
      var url = "";
      function release() { try { if (url && window.URL && window.URL.revokeObjectURL) window.URL.revokeObjectURL(url); } catch (error) {} }
      try {
        url = window.URL.createObjectURL(file);
        var image = new window.Image();
        image.onload = function () {
          release();
          try {
            var width = image.naturalWidth || image.width;
            var height = image.naturalHeight || image.height;
            if (!width || !height) { done(PHOTO_ERROR); return; }
            var scale = Math.min(1, MAX_SIDE / Math.max(width, height));
            var canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            var context = canvas.getContext("2d");
            context.fillStyle = "#fff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            for (var index = 0; index < QUALITIES.length; index += 1) {
              var dataUrl = canvas.toDataURL("image/jpeg", QUALITIES[index]);
              if (typeof dataUrl !== "string" || dataUrl.indexOf(JPEG_PREFIX) !== 0) break;
              var clean = stripJpegMetadata(window.atob(dataUrl.slice(JPEG_PREFIX.length)));
              if (clean === null) break;
              if (clean.length <= MAX_PHOTO_BYTES) { done("", { data: window.btoa(clean), preview: dataUrl }); return; }
            }
            done(PHOTO_ERROR);
          } catch (error) { done(PHOTO_ERROR); }
        };
        image.onerror = function () { release(); done(PHOTO_ERROR); };
        image.src = url;
      } catch (error) { release(); done(PHOTO_ERROR); }
    }
    fileInput.addEventListener("change", function () {
      var files = Array.prototype.slice.call(fileInput.files || []);
      fileInput.value = "";
      if (!files.length) return;
      k.clearErrors();
      var batch = generation;
      if (photos.length + preparing + files.length > MAX_PHOTOS) { k.setError("photos", "You can add up to " + MAX_PHOTOS + " photos."); return; }
      preparing += files.length;
      function next(index) {
        if (index >= files.length) return;
        preparePhoto(files[index], function (error, prepared) {
          if (batch !== generation) return;
          preparing -= 1;
          if (error) k.setError("photos", error); else photos.push(prepared);
          renderPhotos();
          next(index + 1);
        });
      }
      next(0);
    });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (active) return;
      k.clearErrors();
      if (preparing > 0) { k.setStatus("Your photos are still being prepared. Please try again in a moment.", "error"); k.focusStatus(); return; }
      var errors = valid();
      if (Object.keys(errors).length) { k.setStatus("Please correct the highlighted fields and try again.", "error"); k.showErrors(errors); return; }
      var requestedPayload = snapshot();
      if (uncertainAttempt && !samePayload(requestedPayload, uncertainAttempt.payload)) { showConflict(); return; }
      var attempt = { payload: uncertainAttempt ? JSON.parse(JSON.stringify(uncertainAttempt.payload)) : requestedPayload, sent: false, uncertain: false };
      currentAttempt = attempt;
      active = true;
      k.submitButton.disabled = true;
      k.setStatus("Checking the review…", "");
      timeoutId = window.setTimeout(function () {
        if (!current(attempt)) return;
        restore(attempt);
        uncertain(attempt);
        if (!attempt.sent) { k.setStatus("Unable to verify the review yet. Your entries are still here; please try again.", "error"); k.focusStatus(); }
      }, TIMEOUT_MS);
      var body = JSON.parse(JSON.stringify(attempt.payload));
      attempt.sent = true;
      k.send("review", body).then(function (result) {
        if (!current(attempt)) return;
        if (result && result.ok === true) success(attempt);
        else if (result && result.errors) { restore(attempt); k.showServerErrors(result.errors); }
        else failed(attempt);
      }, function () { failed(attempt); });
    });
    k.anotherButton.addEventListener("click", function () {
      uncertainAttempt = null;
      currentAttempt = null;
      photos = [];
      preparing = 0;
      generation += 1;
      renderPhotos();
      form.reset();
      form.elements.reviewId.value = newId("review");
      k.setFormVisible(true);
      k.anotherButton.hidden = true;
      k.clearErrors();
      k.setStatus("", "");
      if (productSelect.focus) productSelect.focus();
    });

    form.elements.reviewId.value = newId("review");
    // A product popup star links here with ?product=...&rating=...; both are checked again before they reach the form.
    function queryValue(name) {
      var match = new RegExp("[?&]" + name + "=([^&#]*)").exec(String(window.location && window.location.search || ""));
      if (!match) return "";
      try { return decodeURIComponent(match[1].replace(/\+/g, " ")); } catch (error) { return ""; }
    }
    var productHintId = queryValue("product");
    var ratingHint = queryValue("rating");
    if (/^[1-5]$/.test(ratingHint)) form.elements.rating.value = ratingHint;
    // A shopper who ordered on this device starts with their first name filled in; they can still change it.
    try {
      var record = JSON.parse((window.localStorage && window.localStorage.getItem("saloniRepeatProfile")) || "null");
      var now = Date.now();
      var expiresAt = Number(record && record.expiresAt);
      var savedName = record && record.version === 1 && record.profile && typeof record.profile.customerName === "string" ? record.profile.customerName.trim().split(/\s+/)[0] : "";
      if (Number.isInteger(expiresAt) && expiresAt > now && expiresAt <= now + 30 * 24 * 60 * 60 * 1000 && validFirstName(savedName)) form.elements.firstName.value = savedName;
    } catch (error) {}
    // The product list is a small file on this site. Until it arrives, "The studio in general" is already usable.
    function showProducts(list) {
      var group = document.createElement("optgroup");
      group.label = "Products";
      var ids = [];
      list.forEach(function (item) {
        if (!item || typeof item.id !== "string" || typeof item.name !== "string") return;
        var option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name;
        group.appendChild(option);
        ids.push(item.id);
      });
      if (ids.length) productSelect.appendChild(group); else productHint.hidden = false;
      if (PRODUCT_ID.test(productHintId) && ids.indexOf(productHintId) !== -1 && productSelect.value === "studio") productSelect.value = productHintId;
    }
    var productsUrl = form.getAttribute("data-products-url");
    if (productsUrl && typeof window.fetch === "function") {
      window.fetch(productsUrl).then(function (response) {
        if (!response || !response.ok) throw new Error("products");
        return response.json();
      }).then(function (list) {
        if (Array.isArray(list)) showProducts(list); else productHint.hidden = false;
      }, function () { productHint.hidden = false; });
    } else productHint.hidden = false;
  }

  var partnerForm = document.getElementById("partner-form");
  if (partnerForm) initPartner(partnerForm);
  var corporateForm = document.getElementById("corporate-form");
  if (corporateForm) initCorporate(corporateForm);
  var reviewForm = document.getElementById("review-form");
  if (reviewForm) initReview(reviewForm);
}());
