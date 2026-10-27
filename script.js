(function () {
  "use strict";

  var REFERRAL_STORAGE_KEY = "saloniReferralCode";
  var REFERRAL_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
  var referralFallbackCode = "";

  function normalizeReferralCode(value) {
    var code = String(value == null ? "" : value).trim().toUpperCase();
    return REFERRAL_PATTERN.test(code) ? code : "";
  }

  function readReferralCode() {
    try {
      if (window.sessionStorage) return normalizeReferralCode(window.sessionStorage.getItem(REFERRAL_STORAGE_KEY)) || referralFallbackCode;
    } catch (error) {}
    return referralFallbackCode;
  }

  function saveReferralCode(code) {
    var normalized = normalizeReferralCode(code);
    referralFallbackCode = normalized;
    try {
      if (window.sessionStorage) {
        if (normalized) window.sessionStorage.setItem(REFERRAL_STORAGE_KEY, normalized);
        else window.sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
      }
    } catch (error) {}
    return normalized;
  }

  function appendReferralToHref(href, code) {
    var normalized = normalizeReferralCode(code);
    if (!normalized || !href || /^(?:#|mailto:|tel:|javascript:|data:|blob:)/i.test(href)) return href;
    var base = window.location && window.location.href;
    if (!base || /script\.google\.com|googleusercontent\.com/i.test(href)) return href;
    try {
      var url = new URL(href, base);
      if (url.origin !== window.location.origin || /\.(?:jpg|jpeg|png|webp|svg|pdf|zip)$/i.test(url.pathname)) return href;
      if (!url.searchParams.has("ref")) url.searchParams.set("ref", normalized);
      return url.pathname + (url.search ? url.search : "") + (url.hash ? url.hash : "");
    } catch (error) { return href; }
  }

  function initReferralAttribution() {
    var location = window.location;
    if (!location) return "";
    var explicit = false;
    var value = "";
    try {
      var params = new URLSearchParams(location.search || "");
      explicit = params.has("ref");
      value = params.get("ref") || "";
    } catch (error) {}
    var code = explicit ? saveReferralCode(value) : readReferralCode();
    if (code && document.querySelectorAll) {
      document.querySelectorAll("a[href]").forEach(function (link) {
        if (link.hasAttribute && link.hasAttribute("download")) return;
        var href = link.getAttribute("href");
        var next = appendReferralToHref(href, code);
        if (next !== href) link.setAttribute("href", next);
      });
    }
    return code;
  }

  if (typeof window !== "undefined") window.saloniReferral = { normalize: normalizeReferralCode, read: readReferralCode, save: saveReferralCode, init: initReferralAttribution, append: appendReferralToHref };

  document.documentElement.classList.add("js");

  function initializePage() {
    var root = document.documentElement;
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var skipLink = document.querySelector(".skip-link");
    var mainContent = document.getElementById("main-content");
    if (skipLink && mainContent) {
      skipLink.addEventListener("click", function (event) {
        event.preventDefault();
        var targetHash = skipLink.getAttribute("href") || "#main-content";
        if (window.history && window.history.pushState) window.history.pushState({}, "", targetHash);
        else if (window.location) window.location.hash = targetHash;
        mainContent.focus({ preventScroll: true });
        mainContent.scrollIntoView({ behavior: "instant", block: "start" });
      });
    }

    var navToggle = document.getElementById("nav-toggle");
    var siteNav = document.getElementById("primary-navigation");
    if (navToggle && siteNav) {
      var navClosedIcon = navToggle.querySelector(".nav-toggle-closed");
      var navOpenIcon = navToggle.querySelector(".nav-toggle-open");
      function setNavOpen(open, restoreFocus) {
        siteNav.classList.toggle("is-open", open);
        navToggle.setAttribute("aria-expanded", String(open));
        navToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
        if (navClosedIcon) navClosedIcon.hidden = open;
        if (navOpenIcon) navOpenIcon.hidden = !open;
        if (!open && restoreFocus) navToggle.focus({ preventScroll: true });
      }
      navToggle.addEventListener("click", function () { setNavOpen(navToggle.getAttribute("aria-expanded") !== "true"); });
      siteNav.querySelectorAll("a").forEach(function (link) { link.addEventListener("click", function () { setNavOpen(false); }); });
      document.addEventListener("keydown", function (event) { if (event.key === "Escape" && navToggle.getAttribute("aria-expanded") === "true") setNavOpen(false, true); });
    }

    document.querySelectorAll("[data-carousel]").forEach(function (carousel) {
      var track = carousel.querySelector("[data-carousel-track]");
      var previous = carousel.querySelector("[data-carousel-prev]");
      var next = carousel.querySelector("[data-carousel-next]");
      if (!track || !previous || !next) return;

      function stepSize() {
        var firstCard = Array.prototype.find.call(track.children || [], function (card) {
          return !card.hidden && (!card.getAttribute || card.getAttribute("aria-hidden") !== "true");
        });
        if (!firstCard) return track.clientWidth * 0.85;
        var styles = window.getComputedStyle(track);
        var gap = parseFloat(styles.columnGap || styles.gap || "0");
        return firstCard.getBoundingClientRect().width + gap;
      }

      function updateControls() {
        var maxScroll = Math.max(0, track.scrollWidth - track.clientWidth - 2);
        previous.disabled = track.scrollLeft <= 2;
        next.disabled = track.scrollLeft >= maxScroll;
      }

      function refreshControls(resetScroll) {
        if (resetScroll) track.scrollLeft = 0;
        var maxScroll = Math.max(0, track.scrollWidth - track.clientWidth - 2);
        if (track.scrollLeft > maxScroll) track.scrollLeft = maxScroll;
        updateControls();
      }

      function move(direction) {
        track.scrollBy({
          left: direction * stepSize(),
          behavior: reduceMotion ? "auto" : "smooth"
        });
      }

      previous.addEventListener("click", function () { move(-1); });
      next.addEventListener("click", function () { move(1); });
      track.addEventListener("keydown", function (event) {
        if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
        if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
      });
      track.addEventListener("scroll", updateControls, { passive: true });
      window.addEventListener("resize", updateControls, { passive: true });
      carousel.refreshControls = refreshControls;
      refreshControls(false);
      carousel.classList.add("is-ready");
    });

    var lightbox = document.getElementById("art-lightbox");
    var lightboxImage = document.getElementById("lightbox-image");
    var lightboxCaption = document.getElementById("lightbox-caption");
    var lightboxTriggers = document.querySelectorAll("[data-lightbox-trigger]");
    var lastTrigger = null;
    if (lightbox && lightboxImage && lightboxCaption && typeof lightbox.showModal === "function") {
      lightbox.addEventListener("click", function (event) {
        if (event.target === lightbox) lightbox.close();
      });
      lightbox.addEventListener("close", function () {
        lightboxImage.removeAttribute("src");
        lightboxImage.alt = "";
        lightboxCaption.textContent = "";
        if (lastTrigger) lastTrigger.focus();
        lastTrigger = null;
      });
      lightboxTriggers.forEach(function (trigger) {
        trigger.addEventListener("click", function (event) {
          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          var image = trigger.querySelector("img");
          if (!image) return;
          event.preventDefault();
          lastTrigger = trigger;
          lightboxImage.src = trigger.href;
          lightboxImage.alt = image.alt || "";
          lightboxCaption.textContent = image.alt || "";
          lightbox.showModal();
        });
      });
    }

    initCatalogueExperience();

    var reveals = document.querySelectorAll(".reveal");
    document.querySelectorAll("[data-carousel-track] > :nth-child(-n+2)").forEach(function (element) {
      element.classList.add("is-visible");
    });
    if ("IntersectionObserver" in window) {
      root.classList.add("reveal-ready");
      var observer = new IntersectionObserver(function (entries, currentObserver) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -5%" });
      reveals.forEach(function (element) {
        if (!element.classList.contains("is-visible")) observer.observe(element);
      });
    } else {
      reveals.forEach(function (element) { element.classList.add("is-visible"); });
    }

    initReferralAttribution();
    initOrderRequestFlow();
  }

  function refreshCatalogueCarousels(resetScroll) {
    document.querySelectorAll("[data-carousel]").forEach(function (carousel) {
      if (typeof carousel.refreshControls === "function") carousel.refreshControls(resetScroll === true);
    });
  }

  function initCatalogueExperience() {
    var tools = document.getElementById("catalogue-filters");
    var typeFilter = document.getElementById("catalogue-type-filter");
    var priceFilter = document.getElementById("catalogue-price-filter");
    var resetButton = document.getElementById("catalogue-filter-reset");
    var emptyReset = document.getElementById("catalogue-empty-reset");
    var status = document.getElementById("catalogue-filter-status");
    var empty = document.getElementById("catalogue-filter-empty");
    if (!tools || !typeFilter || !priceFilter || !resetButton || !emptyReset || !status || !empty) return;

    var cards = Array.prototype.filter.call(document.querySelectorAll(".work-card, .romantic-keepsake-card"), function (card) {
      return !card.closest || !card.closest("#testimonials");
    });
    var sections = [];
    var allVisible = false;

    function sectionFor(card) {
      var section = card.closest ? card.closest("section") : null;
      if (section && sections.indexOf(section) === -1) sections.push(section);
      return section;
    }

    function typeFor(card) {
      var section = sectionFor(card);
      var id = section ? section.id : "";
      if (id === "romantic-keepsakes") return "couple";
      if (id === "diwali") return "diwali";
      if (id === "corporate-resin-gifts") return "corporate";
      if (id === "hamper-rail") return "hampers";
      return "frames";
    }

    function priceFor(card) {
      var value = card.querySelector(".product-pricing dd");
      var numbers = value ? value.textContent.match(/[0-9][0-9,]*/g) : null;
      if (!numbers || !numbers.length) return null;
      numbers = numbers.map(function (number) { return Number(number.replace(/,/g, "")); }).filter(function (number) { return Number.isFinite(number); });
      if (!numbers.length) return null;
      return { min: Math.min.apply(Math, numbers), max: Math.max.apply(Math, numbers) };
    }

    function matchesPrice(card, selected) {
      if (selected === "all") return true;
      var price = priceFor(card);
      if (!price) return false;
      var limit = Number(selected);
      if (!Number.isFinite(limit)) return true;
      if (limit === 2000) return price.min >= 2000;
      return price.max <= limit;
    }

    function setVisibility(card, visible) {
      card.hidden = !visible;
      if (visible) card.removeAttribute("aria-hidden");
      else card.setAttribute("aria-hidden", "true");
    }

    function applyFilters() {
      var selectedType = typeFilter.value || "all";
      var selectedPrice = priceFilter.value || "all";
      var count = 0;
      cards.forEach(function (card) {
        var type = typeFor(card);
        var price = priceFor(card);
        card.setAttribute("data-product-type", type);
        if (price) {
          card.setAttribute("data-price-min", String(price.min));
          card.setAttribute("data-price-max", String(price.max));
        } else {
          card.removeAttribute("data-price-min");
          card.removeAttribute("data-price-max");
        }
        var visible = (allVisible || card.getAttribute("data-featured") === "true") && (selectedType === "all" || selectedType === type) && matchesPrice(card, selectedPrice);
        setVisibility(card, visible);
        if (visible) count += 1;
      });
      sections.forEach(function (section) {
        var hasVisibleCard = cards.some(function (card) { return card.closest && card.closest("section") === section && !card.hidden; });
        section.hidden = !hasVisibleCard;
      });
      empty.hidden = count !== 0;
      var hasFilters = selectedType !== "all" || selectedPrice !== "all";
      status.textContent = count + (count === 1 ? " gift" : " gifts") + " shown." + (hasFilters ? " Filters are applied." : allVisible ? " Browse the full collection." : " Featured picks are shown first.");
      refreshCatalogueCarousels(true);
      document.documentElement.classList.add("catalogue-ready");
    }

    function showAll() {
      allVisible = true;
      typeFilter.value = "all";
      priceFilter.value = "all";
      applyFilters();
    }

    function scrollToHash(href) {
      var id = String(href || "").replace(/^#/, "");
      var target = id ? document.getElementById(id) : null;
      if (target && typeof target.scrollIntoView === "function") target.scrollIntoView({ behavior: "auto", block: "start" });
    }

    document.querySelectorAll("[data-browse-all]").forEach(function (link) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        showAll();
        scrollToHash(link.getAttribute("href") || "#catalogue-filters");
      });
    });
    document.querySelectorAll("[data-category-shortcut]").forEach(function (link) {
      link.addEventListener("click", function (event) {
        var category = link.getAttribute("data-category-shortcut");
        if (!category) return;
        event.preventDefault();
        allVisible = true;
        typeFilter.value = category;
        priceFilter.value = "all";
        applyFilters();
        scrollToHash(link.getAttribute("href"));
      });
    });
    typeFilter.addEventListener("change", function () { allVisible = true; applyFilters(); });
    priceFilter.addEventListener("change", function () { allVisible = true; applyFilters(); });
    resetButton.addEventListener("click", function () {
      allVisible = false;
      typeFilter.value = "all";
      priceFilter.value = "all";
      applyFilters();
    });
    emptyReset.addEventListener("click", showAll);
    window.addEventListener("hashchange", function () {
      var target = document.getElementById(String(window.location.hash || "").replace(/^#/, ""));
      if (!target || (!target.matches || (!target.matches("article") && !target.matches("section")))) return;
      if (target.matches("article") || target.querySelector(".work-card, .romantic-keepsake-card")) {
        showAll();
        scrollToHash(target.id);
      }
    });

    if (window.location && window.location.hash) {
      var initialTarget = document.getElementById(String(window.location.hash).replace(/^#/, ""));
      if (initialTarget && (initialTarget.matches("article") || (initialTarget.matches("section") && initialTarget.querySelector(".work-card, .romantic-keepsake-card")))) showAll();
      else applyFilters();
    } else {
      applyFilters();
    }
  }

  function initOrderRequestFlow() {
    var embed = document.getElementById("order-form-embed");
    var frame = document.getElementById("order-form-frame");
    var status = document.getElementById("order-form-status");
    if (!embed || !frame || !status) return;
    var orderUrl = embed.getAttribute("data-order-form-url") || "";
    var configured = orderUrl && orderUrl.indexOf("REPLACE_WITH_") === -1;
    var PARENT_ORIGIN = "https://saloniresinart.com";
    var requestedMode = embed.getAttribute("data-form-mode");
    var frameState = { loaded: false, nonce: "", siteKey: "", activeCaptcha: null, pinnedSender: null, pinnedOrigin: "", mode: requestedMode === "partner" || requestedMode === "corporate" ? requestedMode : "order" };
    var corporateIntakeReady = embed.getAttribute("data-intake-ready") === "true";

    function requestId() {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      return "request-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
    }

    function channelNonce() {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      if (window.crypto && window.crypto.getRandomValues) {
        var bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        return Array.prototype.map.call(bytes, function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
      }
      return "";
    }

    function invalidateChannel() {
      if (frameState.activeCaptcha) {
        if (frameState.activeCaptcha.timer) window.clearTimeout(frameState.activeCaptcha.timer);
        if (frameState.activeCaptcha.port && frameState.activeCaptcha.port.close) frameState.activeCaptcha.port.close();
      }
      frameState.activeCaptcha = null;
      frameState.nonce = "";
      frameState.siteKey = "";
      frameState.pinnedSender = null;
      frameState.pinnedOrigin = "";
    }

    function postCaptchaResult(request, ok, token) {
      if (frameState.activeCaptcha !== request) return;
      frameState.activeCaptcha = null;
      if (request.timer) window.clearTimeout(request.timer);
      try {
        request.port.postMessage({ type: "saloni-order-captcha-response", nonce: frameState.nonce, attemptId: request.attemptId, ok: ok === true, token: ok ? token : "" });
      } catch (error) {}
      if (request.port.close) request.port.close();
    }

    function executeParentCaptcha(request) {
      function execute() {
        if (frameState.activeCaptcha !== request || !window.grecaptcha || !window.grecaptcha.ready) { postCaptchaResult(request, false, ""); return; }
        try {
          window.grecaptcha.ready(function () {
            if (frameState.activeCaptcha !== request) return;
            try {
              var captchaAction = frameState.mode === "partner" ? "partner_application" : frameState.mode === "corporate" ? "corporate_enquiry" : "order_request";
              var result = window.grecaptcha.execute(frameState.siteKey, { action: captchaAction });
              if (!result || typeof result.then !== "function") { postCaptchaResult(request, false, ""); return; }
              result.then(function (token) {
                postCaptchaResult(request, typeof token === "string" && token.length > 0, token);
              }).catch(function () { postCaptchaResult(request, false, ""); });
            } catch (error) { postCaptchaResult(request, false, ""); }
          });
        } catch (error) { postCaptchaResult(request, false, ""); }
      }
      if (window.grecaptcha && window.grecaptcha.ready) { execute(); return; }
      if (!frameState.siteKey) { postCaptchaResult(request, false, ""); return; }
      var script = document.createElement("script");
      script.src = "https://www.google.com/recaptcha/api.js?render=" + encodeURIComponent(frameState.siteKey);
      script.async = true; script.defer = true;
      script.onload = execute;
      script.onerror = function () { postCaptchaResult(request, false, ""); };
      var parent = document.head || document.body;
      if (!parent || !parent.appendChild) { postCaptchaResult(request, false, ""); return; }
      parent.appendChild(script);
    }

    function scrollToForm() {
      embed.scrollIntoView({ behavior: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }

    function sourceSeed(source) {
      function parts(value, unit) {
        var number = Number(value);
        var total = unit === "ft" ? number * 12 : unit === "in" ? number : NaN;
        if (!Number.isFinite(total) || total <= 0) return null;
        var feet = Math.floor(total / 12);
        var inches = Math.round((total - feet * 12) * 100) / 100;
        return { feet: String(feet), inches: String(inches) };
      }
      var heightParts = parts(source.height, source.heightUnit);
      var widthParts = parts(source.width, source.widthUnit);
      var seed = {
        sourceKind: source.sourceKind || "catalogue", sourceId: source.sourceId || "",
        productName: source.productName || "", quantity: "1", dimensionFormat: "feet-inches",
        heightFeet: heightParts ? heightParts.feet : "", heightInchesPart: heightParts ? heightParts.inches : "", widthFeet: widthParts ? widthParts.feet : "", widthInchesPart: widthParts ? widthParts.inches : "",
        height: source.height || "", heightUnit: source.heightUnit || "",
        width: source.width || "", widthUnit: source.widthUnit || "", designDetails: source.designDetails || "",
        customerName: "", phone: "", email: "", fulfillment: "shipping", shippingAddress: "", city: "", state: "", pin: "", requestedDate: "", referralCode: readReferralCode()
      };
      return seed;
    }

    function readCustomizerDimensions() {
      var frameType = document.getElementById("frame-type");
      var framePreset = document.getElementById("frame-preset");
      var frameUnit = document.getElementById("frame-unit");
      if (!frameType || !framePreset || !frameUnit) return null;
      var type = String(frameType.value || "");
      var presetInches = Number(framePreset.value);
      var unit = String(frameUnit.value || "");
      if (["square", "round", "arch"].indexOf(type) === -1 || !Number.isFinite(presetInches) || presetInches <= 0 || ["in", "ft"].indexOf(unit) === -1) return null;
      var widthInches = presetInches;
      var heightInches = type === "arch" ? presetInches * 4 / 3 : presetInches;
      function format(value) {
        return unit === "ft" ? (value / 12).toFixed(2) : String(value);
      }
      return { height: format(heightInches), width: format(widthInches), heightUnit: unit, widthUnit: unit };
    }

    function submitSeed(seed, shouldScroll) {
      if (!configured) {
        status.innerHTML = frameState.mode === "corporate"
          ? "Corporate gifting enquiries are being prepared. For a current large-order enquiry, call Saloni at <a href=\"tel:8209238541\">8209238541</a> or message <a href=\"https://www.instagram.com/saloniresin_art_studio/\" target=\"_blank\" rel=\"noreferrer\">@saloniresin_art_studio</a>."
          : "The request form is not configured for this preview yet. You can still call Saloni at <a href=\"tel:8209238541\">8209238541</a> or message <a href=\"https://www.instagram.com/saloniresin_art_studio/\" target=\"_blank\" rel=\"noreferrer\">@saloniresin_art_studio</a>.";
        status.hidden = false;
        if (shouldScroll !== false) scrollToForm();
        return;
      }
      invalidateChannel();
      frameState.nonce = channelNonce();
      if (!frameState.nonce) {
        status.textContent = "This browser cannot start a secure request. Please use the latest browser or contact Saloni directly.";
        status.hidden = false;
        return;
      }
      seed.channelNonce = frameState.nonce;
      seed.formMode = frameState.mode;
      frame.hidden = false;
      status.hidden = true;
      // Normal POST action=seed keeps the existing iframe alive while replacing its document.
      var postForm = document.createElement("form");
      postForm.method = "POST";
      postForm.action = orderUrl;
      postForm.target = frame.name;
      postForm.setAttribute("aria-hidden", "true");
      var action = document.createElement("input");
      action.type = "hidden"; action.name = "action"; action.value = "seed";
      var modeField = document.createElement("input");
      modeField.type = "hidden"; modeField.name = "mode"; modeField.value = frameState.mode;
      var seedField = document.createElement("input");
      seedField.type = "hidden"; seedField.name = "seed"; seedField.value = JSON.stringify(seed);
      postForm.appendChild(action); postForm.appendChild(modeField); postForm.appendChild(seedField);
      if (frameState.mode === "partner") {
        var applicationId = document.createElement("input");
        applicationId.type = "hidden"; applicationId.name = "applicationId"; applicationId.value = seed.applicationId || requestId();
        postForm.appendChild(applicationId);
      }
      document.body.appendChild(postForm); postForm.submit(); postForm.remove();
      frameState.loaded = true;
      if (shouldScroll !== false) scrollToForm();
    }

    function chooseSource(source) {
      if (frameState.loaded && !window.confirm("This order form is already loaded. Replace it with the selected item?")) return;
      var seed = sourceSeed(source);
      seed.requestId = requestId();
      submitSeed(seed);
    }

    window.addEventListener("message", function (event) {
      var data = event.data || {};
      if (!frameState.loaded || !frameState.nonce || data.nonce !== frameState.nonce || !event.source || !event.origin || event.origin === "null") return;
      if (data.type === "saloni-order-form-ready") {
        if (!frameState.pinnedSender) {
          frameState.pinnedSender = event.source;
          frameState.pinnedOrigin = event.origin;
        }
        if (event.source !== frameState.pinnedSender || event.origin !== frameState.pinnedOrigin) return;
        if (typeof data.siteKey === "string" && data.siteKey.length > 0 && data.siteKey.length <= 200) frameState.siteKey = data.siteKey;
        return;
      }
      if (event.source !== frameState.pinnedSender || event.origin !== frameState.pinnedOrigin || data.type !== "saloni-order-captcha-request" || typeof data.attemptId !== "string" || !event.ports || !event.ports[0] || frameState.activeCaptcha) return;
      var request = { attemptId: data.attemptId, port: event.ports[0], timer: null };
      frameState.activeCaptcha = request;
      request.timer = window.setTimeout(function () { postCaptchaResult(request, false, ""); }, 30000);
      executeParentCaptcha(request);
    });

    if (frameState.mode === "corporate" && !corporateIntakeReady) {
      status.innerHTML = "Corporate gifting enquiries are being prepared. For a current large-order enquiry, call Saloni at <a href=\"tel:8209238541\">8209238541</a> or message <a href=\"https://www.instagram.com/saloniresin_art_studio/\" target=\"_blank\" rel=\"noreferrer\">@saloniresin_art_studio</a>.";
      status.hidden = false;
      return;
    }
    if (frameState.mode === "partner") {
      submitSeed({ sourceKind: "partner", sourceId: "partner-application", productName: "", applicationId: requestId() }, false);
      return;
    }
    if (frameState.mode === "corporate") {
      submitSeed({ sourceKind: "corporate", sourceId: "corporate-enquiry", productName: "", enquiryId: requestId() }, false);
      return;
    }

    function catalogueSeed(card) {
      var image = card.querySelector("img[src]");
      var title = card.querySelector("figcaption strong") || card.querySelector("figcaption h3");
      if (!image || !title) return null;
      var sourceId = "catalogue:" + image.getAttribute("src").replace(/^assets\//, "");
      var details = Array.prototype.map.call(card.querySelectorAll("figcaption p"), function (node) { return node.textContent.trim(); }).join(" ");
      var cardCopy = (card.textContent || "") + " " + (image.alt || "");
      if (/concept preview|reference design|gifting concept/i.test(cardCopy)) details += (details ? " " : "") + "Illustrative/reference image; final design to confirm with Saloni.";
      var pricingDetails = Array.prototype.map.call(card.querySelectorAll(".product-pricing > div"), function (row) {
        var priceLabel = row.querySelector("dt");
        var priceValue = row.querySelector("dd");
        return priceLabel && priceValue ? priceLabel.textContent.trim() + ": " + priceValue.textContent.trim() : "";
      }).filter(function (detail) { return detail; });
      if (pricingDetails.length) details += (details ? " " : "") + pricingDetails.join(" ");
      return sourceSeed({ sourceKind: "catalogue", sourceId: sourceId, productName: title.textContent.trim(), designDetails: details });
    }

    document.querySelectorAll("[data-carousel] .work-card, .romantic-keepsake-card").forEach(function (card) {
      var seed = catalogueSeed(card);
      var caption = card.querySelector("figcaption");
      if (!seed || !caption || caption.querySelector("[data-order-prefill]")) return;
      var button = document.createElement("button");
      button.type = "button"; button.className = "catalogue-order-button"; button.setAttribute("data-order-prefill", "catalogue");
      button.textContent = "Request this item";
      button.addEventListener("click", function () { chooseSource(seed); });
      caption.appendChild(button);
    });

    var customizerButton = document.querySelector("[data-order-prefill=\"customizer\"]");
    if (customizerButton) {
      customizerButton.addEventListener("click", function () {
        var summary = document.getElementById("customizer-summary");
        var dimensions = readCustomizerDimensions();
        if (!dimensions) {
          var customizerStatus = document.getElementById("share-status");
          if (customizerStatus) {
            customizerStatus.textContent = "We could not read the customizer size. Choose a frame type, preset, and unit, then try again.";
            customizerStatus.setAttribute("tabindex", "-1");
            customizerStatus.focus();
          }
          return;
        }
        chooseSource({
          sourceKind: "customizer", sourceId: "customizer:resin-frame", productName: "Custom resin frame",
          height: dimensions.height, width: dimensions.width, heightUnit: dimensions.heightUnit, widthUnit: dimensions.widthUnit,
          designDetails: summary ? summary.textContent.trim() : "Custom resin frame design from the site customizer."
        });
      });
    }

    document.querySelectorAll('[data-order-prefill="general"]').forEach(function (button) {
      button.addEventListener("click", function (event) {
        if (event && event.preventDefault) event.preventDefault();
        chooseSource({
          sourceKind: "catalogue", sourceId: "catalogue:general-custom-gift", productName: "Custom gift enquiry",
          designDetails: "General custom gift enquiry. Saloni will confirm the occasion, size, materials, quote, and delivery."
        });
      });
    });
  }
  if (document.readyState === "loading" || document.readyState === undefined) document.addEventListener("DOMContentLoaded", initializePage);
  else initializePage();
}());
