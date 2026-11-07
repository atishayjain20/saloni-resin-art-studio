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

  // The colour ideas a card declares in data-ai-images, minus anything that is not a plain lowercase name.
  function aiImageNames(trigger) {
    var list = trigger && typeof trigger.getAttribute === "function" ? (trigger.getAttribute("data-ai-images") || "") : "";
    return list.split(/\s+/).filter(function (name) { return /^[a-z]+(?:-[a-z]+)*$/.test(name); });
  }

  // One AI photo of the design at href: "styled" is the styled scene, any other name a colour idea.
  function aiPhoto(href, name) {
    var stem = String(href || "").split(/[?#]/)[0].split("/").pop().replace(/\.[^.]*$/, "");
    var styled = name === "styled";
    var colour = styled ? "" : name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, " ");
    return { name: name, src: "assets/ai-images/" + stem + "--" + name + ".webp", colour: colour, label: styled ? "Styled scene" : "Colour idea: " + colour };
  }

  document.documentElement.classList.add("js");

  function initializePage() {
    var root = document.documentElement;
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
      document.addEventListener("click", function (event) {
        if (navToggle.getAttribute("aria-expanded") !== "true") return;
        if (navToggle.contains(event.target) || siteNav.contains(event.target)) return;
        setNavOpen(false);
      });
    }

    var customizer = document.getElementById("customizer");
    var customizerDisclosure = document.getElementById("customizer-disclosure");
    if (customizer && customizerDisclosure) {
      function openCustomizer(shouldScroll, focusSummary) {
        customizerDisclosure.open = true;
        if (shouldScroll && typeof customizer.scrollIntoView === "function") customizer.scrollIntoView({ behavior: "instant", block: "start" });
        var summary = customizerDisclosure.querySelector("summary");
        if (focusSummary && summary && typeof summary.focus === "function") summary.focus({ preventScroll: true });
      }
      document.querySelectorAll('a[href="#customizer"]').forEach(function (link) {
        link.addEventListener("click", function (event) {
          if (!event || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          if (window.history && window.history.pushState) window.history.pushState({}, "", "#customizer");
          else if (window.location) window.location.hash = "#customizer";
          openCustomizer(true, true);
        });
      });
      if (window.location && window.location.hash === "#customizer") openCustomizer(false);
      window.addEventListener("hashchange", function () {
        if (window.location && window.location.hash === "#customizer") openCustomizer(true);
      });
    }

    var lightbox = document.getElementById("art-lightbox");
    var lightboxImage = document.getElementById("lightbox-image");
    var lightboxCaption = document.getElementById("lightbox-caption");
    var lightboxName = document.getElementById("lightbox-product-name");
    var lightboxPrice = document.getElementById("lightbox-product-price");
    var lightboxSize = document.getElementById("lightbox-product-size");
    var lightboxDescription = document.getElementById("lightbox-image-description");
    var lightboxRequest = document.getElementById("lightbox-request");
    var lightboxStage = document.getElementById("lightbox-stage");
    var photoPrev = document.getElementById("lightbox-photo-prev");
    var photoNext = document.getElementById("lightbox-photo-next");
    var photoLabel = document.getElementById("lightbox-photo-label");
    var lightboxIncluded = document.getElementById("lightbox-included");
    var lightboxTriggers = document.querySelectorAll("[data-lightbox-trigger]");
    var lastTrigger = null;
    var lightboxItems = [];
    var lightboxIndex = 0;
    var lightboxPhotos = [];
    var lightboxPhotoIndex = 0;
    var swipeStart = null;
    var pendingLightboxRequest = null;
    var lightboxHistoryActive = false;
    var lightboxCloseFromHistory = false;
    var suppressNextLightboxPopstate = false;
    var pendingLightboxFocus = null;
    var lightboxFocusToken = 0;
    if (lightbox && lightboxImage && lightboxCaption && typeof lightbox.showModal === "function") {
      function focusOrderLocation() {
        var target = document.getElementById("order") || document.getElementById("order-form-embed");
        if (!target) return;
        if (typeof target.scrollIntoView === "function") target.scrollIntoView({ behavior: "auto", block: "start" });
        if (typeof target.focus === "function") target.focus({ preventScroll: true });
      }

      function isLightboxHistoryState(state) {
        return Boolean(state && state.saloniLightbox);
      }

      function focusLightboxTrigger(trigger) {
        if (trigger && typeof trigger.focus === "function") trigger.focus({ preventScroll: true });
      }

      function invalidateLightboxFocus() {
        lightboxFocusToken += 1;
        pendingLightboxFocus = null;
      }

      function pushLightboxHistory() {
        var history = window.history;
        if (!history || typeof history.pushState !== "function") return;
        if (suppressNextLightboxPopstate || lightboxHistoryActive || isLightboxHistoryState(history.state)) {
          lightboxHistoryActive = true;
          return;
        }
        try {
          var state = Object.assign({}, history.state || {}, { saloniLightbox: true });
          history.pushState(state, "", window.location && window.location.href ? window.location.href : "");
          lightboxHistoryActive = true;
        } catch (error) {}
      }

      function stepBackFromLightboxHistory() {
        var history = window.history;
        if (!history || typeof history.back !== "function") return false;
        suppressNextLightboxPopstate = true;
        try { history.back(); return true; } catch (error) { suppressNextLightboxPopstate = false; return false; }
      }

      function consumeLightboxHistory() {
        if (!lightboxHistoryActive) return false;
        lightboxHistoryActive = false;
        if (suppressNextLightboxPopstate) return true;
        var history = window.history;
        if (!history || typeof history.back !== "function" || !isLightboxHistoryState(history.state)) return false;
        return stepBackFromLightboxHistory();
      }

      function productDetails(trigger) {
        var card = trigger.closest ? trigger.closest("article") : null;
        var image = trigger.querySelector("img");
        var title = card && (card.querySelector("figcaption strong") || card.querySelector("figcaption h3"));
        var price = null;
        var size = null;
        if (card) Array.prototype.forEach.call(card.querySelectorAll(".product-pricing > div"), function (row) {
          var label = row.querySelector("dt");
          var value = row.querySelector("dd");
          if (!label || !value) return;
          var labelText = label.textContent.trim();
          var valueText = value.textContent.trim();
          if (!valueText) return;
          if (!price && /^(?:price|from)$/i.test(labelText)) price = labelText + ": " + valueText;
          if (!size && /^size$/i.test(labelText) && !/suggested size|confirm with saloni|custom size in inches|component size to confirm/i.test(valueText)) size = "Size: " + valueText;
        });
        var imageAlt = image ? (image.alt || "") : "";
        var paragraphs = card ? Array.prototype.map.call(card.querySelectorAll("figcaption p"), function (paragraph) { return paragraph.textContent.trim(); }).filter(function (paragraph) { return paragraph; }) : [];
        var includedAt = -1;
        paragraphs.some(function (paragraph, index) { if (paragraph.indexOf(" · ") !== -1) { includedAt = index; return true; } return false; });
        var included = includedAt === -1 ? "" : paragraphs[includedAt];
        var description = paragraphs.filter(function (paragraph, index) { return index !== includedAt; }).join(" ");
        var aiImages = aiImageNames(trigger);
        if (!description) description = imageAlt;
        else if (imageAlt && /illustrative preview|reference image|reference design/i.test(imageAlt) && description.indexOf(imageAlt) === -1) description += " " + imageAlt;
        return { trigger: trigger, card: card, image: image, imageAlt: imageAlt, title: title ? title.textContent.trim() : "", price: price, size: size, description: description, included: included, aiImages: aiImages };
      }

      function photosFor(item) {
        var photos = [{ name: "", src: item.trigger.href, alt: item.imageAlt || item.description || "Artwork preview", label: "As shown" }];
        item.aiImages.forEach(function (name) {
          var photo = aiPhoto(item.trigger.href, name);
          photo.alt = (name === "styled" ? "Styled scene. " : photo.colour + " colour idea. ") + (item.imageAlt || item.description || "");
          photos.push(photo);
        });
        return photos;
      }

      function renderPhoto() {
        var photo = lightboxPhotos[lightboxPhotoIndex];
        if (!photo) return;
        lightboxImage.src = photo.src;
        lightboxImage.alt = photo.alt;
        var several = lightboxPhotos.length > 1;
        if (photoPrev) photoPrev.hidden = !several;
        if (photoNext) photoNext.hidden = !several;
        if (photoLabel) {
          photoLabel.hidden = !several;
          photoLabel.textContent = several ? (lightboxPhotoIndex + 1) + " of " + lightboxPhotos.length + " · " + photo.label + (lightboxPhotoIndex && photo.colour ? (lightboxRequest && !lightboxRequest.hidden ? (lightboxRequest.textContent === "Remove from cart" ? "\nRemove it from the cart first to choose \"" + photo.colour + "\" instead." : "\nUse the button below on this photo to choose \"" + photo.colour + "\".") : "\nMention \"" + photo.colour + "\" in your order notes.") : "") : "";
        }
      }

      function stepPhoto(delta) {
        var count = lightboxPhotos.length;
        if (count < 2) return;
        lightboxPhotoIndex = (lightboxPhotoIndex + delta + count) % count;
        renderPhoto();
      }

      function clearPhotos() {
        lightboxPhotos = [];
        lightboxPhotoIndex = 0;
        swipeStart = null;
        if (photoPrev) photoPrev.hidden = true;
        if (photoNext) photoNext.hidden = true;
        if (photoLabel) { photoLabel.textContent = ""; photoLabel.hidden = true; }
        if (lightboxIncluded) { lightboxIncluded.textContent = ""; lightboxIncluded.hidden = true; }
      }

      function renderLightboxItem(photoIndex) {
        var item = lightboxItems[lightboxIndex] || productDetails(lastTrigger);
        if (!item) return;
        lightboxPhotos = photosFor(item);
        lightboxPhotoIndex = photoIndex > 0 && photoIndex < lightboxPhotos.length ? photoIndex : 0;
        if (lightboxIncluded) { lightboxIncluded.textContent = item.included ? "What's included: " + item.included : ""; lightboxIncluded.hidden = !item.included; }
        if (lightboxName) { lightboxName.textContent = item.title; lightboxName.hidden = !item.title; }
        if (lightboxPrice) { lightboxPrice.textContent = item.price || ""; lightboxPrice.hidden = !item.price; }
        if (lightboxSize) { lightboxSize.textContent = item.size || ""; lightboxSize.hidden = !item.size; }
        if (lightboxDescription) lightboxDescription.textContent = item.description || "";
        if (lightboxRequest) {
          var itemRequestButton = item.card && item.card.querySelector ? item.card.querySelector("[data-order-prefill]") : null;
          lightboxRequest.hidden = !itemRequestButton;
          lightboxRequest.disabled = lightboxRequest.hidden;
          if (!lightboxRequest.hidden) {
            var isQuote = typeof itemRequestButton.getAttribute === "function" && itemRequestButton.getAttribute("data-order-prefill") === "quote";
            var selected = typeof itemRequestButton.getAttribute === "function" && itemRequestButton.getAttribute("aria-pressed") === "true";
            if (isQuote) {
              lightboxRequest.textContent = "Ask for a quote";
              lightboxRequest.setAttribute("aria-label", "Ask for a quote for " + (item.title || "item"));
            } else {
              lightboxRequest.textContent = selected ? "Remove from cart" : "Add to cart";
              lightboxRequest.setAttribute("aria-label", (selected ? "Remove " : "Add ") + (item.title || "item") + (selected ? " from cart" : " to cart"));
            }
          }
        }
        // After the request button is set, so the photo hint knows whether it is there.
        renderPhoto();
      }

      var pressStartedInside = false;
      lightbox.addEventListener("pointerdown", function (event) { pressStartedInside = event.target !== lightbox; });
      lightbox.addEventListener("click", function (event) {
        var dragEndedOnBackdrop = pressStartedInside;
        pressStartedInside = false;
        if (event.target === lightbox && !dragEndedOnBackdrop) lightbox.close();
      });
      if (photoPrev) photoPrev.addEventListener("click", function () { stepPhoto(-1); });
      if (photoNext) photoNext.addEventListener("click", function () { stepPhoto(1); });
      lightbox.addEventListener("keydown", function (event) {
        if (lightboxPhotos.length < 2 || !event || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
        event.preventDefault();
        stepPhoto(event.key === "ArrowRight" ? 1 : -1);
      });
      if (lightboxStage) {
        lightboxStage.addEventListener("pointerdown", function (event) { swipeStart = { x: event.clientX, y: event.clientY }; });
        lightboxStage.addEventListener("pointercancel", function () { swipeStart = null; });
        lightboxStage.addEventListener("pointerup", function (event) {
          var start = swipeStart;
          swipeStart = null;
          if (!start || lightboxPhotos.length < 2) return;
          var dx = event.clientX - start.x;
          var dy = event.clientY - start.y;
          if (Math.abs(dx) >= 40 && Math.abs(dx) > 1.5 * Math.abs(dy)) stepPhoto(dx < 0 ? 1 : -1);
        });
      }
      if (typeof lightboxImage.addEventListener === "function") lightboxImage.addEventListener("error", function () {
        if (!lightbox.open || lightboxPhotoIndex === 0) return;
        lightboxPhotos.splice(lightboxPhotoIndex, 1);
        lightboxPhotoIndex = 0;
        renderPhoto();
      });
      lightbox.addEventListener("close", function () {
        if (lightbox.open) return;
        var restoreTrigger = lastTrigger;
        var closeFromHistory = lightboxCloseFromHistory;
        lightboxCloseFromHistory = false;
        lightboxImage.removeAttribute("src");
        lightboxImage.alt = "";
        if (lightboxName) lightboxName.textContent = "";
        if (lightboxPrice) { lightboxPrice.textContent = ""; lightboxPrice.hidden = true; }
        if (lightboxSize) { lightboxSize.textContent = ""; lightboxSize.hidden = true; }
        if (lightboxDescription) lightboxDescription.textContent = "";
        if (lightboxRequest) { lightboxRequest.hidden = true; lightboxRequest.disabled = true; }
        clearPhotos();
        if (pendingLightboxRequest) {
          invalidateLightboxFocus();
          var requestButton = pendingLightboxRequest;
          pendingLightboxRequest = null;
          // Consume the preview history entry before the order dialog creates its own.
          var requestHistoryConsumed = closeFromHistory ? false : consumeLightboxHistory();
          var orderDialog = document.getElementById("order-dialog");
          var requestFocusToken = ++lightboxFocusToken;
          if (requestHistoryConsumed && orderDialog) {
            pendingLightboxFocus = { request: requestButton, opener: restoreTrigger, token: requestFocusToken };
          } else {
            requestButton.__saloniOrderDialogOpener = restoreTrigger || requestButton;
            if (typeof requestButton.click === "function") requestButton.click();
            if (!orderDialog || !orderDialog.open) {
              if (requestFocusToken === lightboxFocusToken) {
                if (typeof window.setTimeout === "function") window.setTimeout(function () {
                  if (requestFocusToken === lightboxFocusToken && !lightbox.open) focusOrderLocation();
                }, 0);
                else focusOrderLocation();
              }
            }
          }
        } else if (closeFromHistory) {
          invalidateLightboxFocus();
          focusLightboxTrigger(restoreTrigger);
        } else {
          var focusToken = ++lightboxFocusToken;
          pendingLightboxFocus = { trigger: restoreTrigger, token: focusToken };
          if (!consumeLightboxHistory()) {
            pendingLightboxFocus = null;
            if (focusToken === lightboxFocusToken) focusLightboxTrigger(restoreTrigger);
          }
        }
        lastTrigger = null;
        lightboxItems = [];
        lightboxIndex = 0;
      });
      if (window.addEventListener) window.addEventListener("popstate", function (event) {
        if (suppressNextLightboxPopstate) {
          suppressNextLightboxPopstate = false;
          if (event && typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
          var pendingFocus = pendingLightboxFocus;
          pendingLightboxFocus = null;
          if (pendingFocus && pendingFocus.token === lightboxFocusToken && !lightbox.open) {
            var pendingFocusToken = pendingFocus.token;
            var restorePendingFocus = function () {
              if (pendingFocusToken !== lightboxFocusToken || lightbox.open) return;
              if (pendingFocus.request && typeof pendingFocus.request.click === "function") {
                pendingFocus.request.__saloniOrderDialogOpener = pendingFocus.opener || pendingFocus.request;
                pendingFocus.request.click();
              }
              else if (pendingFocus.trigger) focusLightboxTrigger(pendingFocus.trigger);
              else if (pendingFocus.focus) pendingFocus.focus();
            };
            if (typeof window.setTimeout === "function") window.setTimeout(restorePendingFocus, 0);
            else restorePendingFocus();
          }
          if (lightbox.open && !isLightboxHistoryState(event && event.state)) {
            lightboxHistoryActive = false;
            pushLightboxHistory();
          }
          return;
        }
        if (!lightboxHistoryActive && !lightbox.open && isLightboxHistoryState(event && event.state)) {
          invalidateLightboxFocus();
          if (event && typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
          stepBackFromLightboxHistory();
          return;
        }
        if (!lightboxHistoryActive || isLightboxHistoryState(event && event.state)) return;
        lightboxHistoryActive = false;
        if (!lightbox.open) return;
        lightboxCloseFromHistory = true;
        if (event && typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
        lightbox.close();
      });
      if (lightboxRequest) lightboxRequest.addEventListener("click", function () {
        var item = lightboxItems[lightboxIndex];
        var requestButton = item && item.card && item.card.querySelector("[data-order-prefill]");
        if (!requestButton) return;
        invalidateLightboxFocus();
        pendingLightboxRequest = requestButton;
        // The order button reads this once, so the cart gets the photo on show.
        requestButton.__saloniChosenPhoto = (lightboxPhotos[lightboxPhotoIndex] || {}).name || "";
        lightbox.close();
      });
      function cardPhotoIndex(trigger) {
        var strip = trigger.querySelector(".card-photos");
        return strip && strip.clientWidth ? Math.round(strip.scrollLeft / strip.clientWidth) : 0;
      }

      function addCardPhotos(trigger) {
        var image = trigger.querySelector("img");
        if (!image || !image.parentNode) return;
        var photos = photosFor(productDetails(trigger));
        if (photos.length < 2) return;
        var strip = document.createElement("span");
        strip.className = "card-photos";
        image.parentNode.insertBefore(strip, image);
        strip.appendChild(image);
        var extras = photos.slice(1).map(function (photo) {
          var extra = document.createElement("img");
          extra.alt = "";
          extra.decoding = "async";
          extra.setAttribute("data-src", photo.src);
          strip.appendChild(extra);
          return extra;
        });
        var dots = document.createElement("span");
        dots.className = "card-photo-dots";
        dots.setAttribute("aria-hidden", "true");
        photos.forEach(function (photo, index) { dots.appendChild(document.createElement("span")).className = index ? "" : "is-active"; });
        trigger.appendChild(dots);
        function loadExtras() {
          extras.forEach(function (extra) { if (!extra.src) extra.src = extra.getAttribute("data-src"); });
        }
        strip.addEventListener("pointerdown", loadExtras, { passive: true });
        strip.addEventListener("scroll", function () {
          loadExtras();
          var index = cardPhotoIndex(trigger);
          trigger.__saloniPhotoName = (photos[index] || {}).name || "";
          Array.prototype.forEach.call(dots.children, function (dot, dotIndex) { dot.className = dotIndex === index ? "is-active" : ""; });
        }, { passive: true });
      }

      function openLightbox(trigger, restoreTarget) {
        invalidateLightboxFocus();
        lastTrigger = restoreTarget || trigger;
        var targetId = typeof trigger.getAttribute === "function" ? trigger.getAttribute("data-lightbox-target") : "";
        var targetCard = targetId && document.getElementById ? document.getElementById(targetId) : null;
        var targetTrigger = targetCard && targetCard.querySelector ? targetCard.querySelector("[data-lightbox-trigger]") : null;
        lightboxItems = [productDetails(targetTrigger || trigger)];
        lightboxIndex = 0;
        renderLightboxItem(cardPhotoIndex(targetTrigger || trigger));
        pushLightboxHistory();
        if (!lightbox.open) lightbox.showModal();
      }
      lightboxTriggers.forEach(function (trigger) {
        addCardPhotos(trigger);
        var card = trigger.closest ? trigger.closest("article") : null;
        if (card && card.addEventListener) {
          card.addEventListener("click", function (event) {
            var target = event && event.target;
            if (!event || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (target && target.closest && target.closest("a,button,input,select,textarea,summary,[role='button'],[role='link'],[contenteditable='true']"))) return;
            openLightbox(trigger, trigger);
          });
        }
        trigger.addEventListener("click", function (event) {
          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          var image = trigger.querySelector("img");
          if (!image) return;
          event.preventDefault();
          openLightbox(trigger, trigger);
        });
      });
    }

    initCatalogueExperience();
    initDiwaliGreeting();
    initHeroBanner();
    initPhoneDropdowns();

    var reveals = document.querySelectorAll(".reveal");
    document.querySelectorAll(".catalogue-grid > :nth-child(-n+4)").forEach(function (element) {
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

  // "What happens next" and "Start a conversation" start closed on phones and open on wider screens.
  function initPhoneDropdowns() {
    if (!window.matchMedia) return;
    var dropdowns = ["customer-confidence", "order-conversation"].map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (!dropdowns.length) return;
    var phone = window.matchMedia("(max-width: 620px)");
    function sync() { dropdowns.forEach(function (details) { details.open = !phone.matches; }); }
    sync();
    if (phone.addEventListener) phone.addEventListener("change", sync);
  }

  // On 8 and 9 November 2026, India time (UTC+5:30), the Diwali offer strip and hero slide show and the Diwali wish opens once per visitor.
  function initDiwaliGreeting(now) {
    var time = typeof now === "number" ? now : Date.now();
    if (!(time >= Date.UTC(2026, 10, 7, 18, 30) && time < Date.UTC(2026, 10, 9, 18, 30))) return;
    var offerBar = document.getElementById("diwali-offer-bar");
    if (offerBar) offerBar.hidden = false;
    // The Diwali hero slide moves first and shows the offer; slide labels are renumbered to match.
    var slide = document.getElementById("hero-diwali-slide");
    if (slide && slide.parentNode) {
      var offerLabel = slide.querySelector(".hero-slide-offer");
      if (offerLabel) offerLabel.hidden = false;
      slide.parentNode.insertBefore(slide, slide.parentNode.firstChild);
      // The browser keeps the old first slide in view after the move, so start the carousel at Diwali.
      slide.parentNode.scrollLeft = 0;
      Array.prototype.forEach.call(slide.parentNode.querySelectorAll(".hero-slide"), function (item, index) {
        item.setAttribute("aria-label", item.getAttribute("aria-label").replace(/^\d+ of/, (index + 1) + " of"));
      });
    }
    var greeting = document.getElementById("diwali-greeting");
    if (!greeting || typeof greeting.showModal !== "function") return;
    if (document.querySelector("dialog[open]")) return;
    var key = "saloni-diwali-2026";
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch (error) {}
    // Capture runs before the shop link's own handler, so the catalogue can take focus once the pop-up is closed.
    greeting.addEventListener("click", function (event) {
      var box = greeting.getBoundingClientRect();
      var outside = event.target === greeting && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom);
      if (outside || event.target.closest("[data-category-shortcut]")) greeting.close();
    }, true);
    greeting.showModal();
  }

  function initHeroBanner() {
    var track = document.querySelector("[data-banner-track]");
    if (!track || typeof track.scrollTo !== "function") return;
    var slides = track.querySelectorAll(".hero-slide");
    var dots = document.querySelectorAll("[data-banner-dot]");
    var prev = document.querySelector("[data-banner-prev]");
    var next = document.querySelector("[data-banner-next]");
    var pending = false;
    var active = 0;
    if (!slides.length) return;

    function goTo(index) {
      var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var slide = slides[Math.max(0, Math.min(slides.length - 1, index))];
      track.scrollTo({ left: slide.offsetLeft, behavior: reduced ? "auto" : "smooth" });
    }

    function sync() {
      var nearest = 0;
      var distance = Infinity;
      pending = false;
      for (var index = 0; index < slides.length; index += 1) {
        var gap = Math.abs(slides[index].offsetLeft - track.scrollLeft);
        if (gap < distance) { distance = gap; nearest = index; }
      }
      active = nearest;
      for (var dot = 0; dot < dots.length; dot += 1) {
        if (dot === active) dots[dot].setAttribute("aria-current", "true");
        else dots[dot].removeAttribute("aria-current");
      }
      if (prev) prev.disabled = active === 0;
      if (next) next.disabled = active === slides.length - 1;
    }

    track.addEventListener("scroll", function () {
      if (pending) return;
      pending = true;
      if (window.requestAnimationFrame) window.requestAnimationFrame(sync);
      else sync();
    });
    if (prev) prev.addEventListener("click", function () { goTo(active - 1); });
    if (next) next.addEventListener("click", function () { goTo(active + 1); });
    Array.prototype.forEach.call(dots, function (dot, index) {
      dot.addEventListener("click", function () { goTo(index); });
    });
    sync();
  }

  function initCatalogueExperience() {
    var tools = document.getElementById("catalogue-filters");
    var searchFilter = document.getElementById("catalogue-search");
    var typeFilter = document.getElementById("catalogue-type-filter");
    var priceFilter = document.getElementById("catalogue-price-filter");
    var applyButton = document.getElementById("catalogue-filter-apply");
    var resetButton = document.getElementById("catalogue-filter-reset");
    var emptyReset = document.getElementById("catalogue-empty-reset");
    var status = document.getElementById("catalogue-filter-status");
    var empty = document.getElementById("catalogue-filter-empty");
    var results = document.getElementById("catalogue-results");
    if (!tools || !searchFilter || !typeFilter || !priceFilter || !applyButton || !resetButton || !emptyReset || !status || !empty || !results) return;
    var categoryTabs = document.querySelectorAll("[data-category-tab]");
    var searchForm = document.getElementById("catalogue-search-form");
    var searchToggle = document.getElementById("catalogue-search-toggle");
    var filterToggle = document.getElementById("catalogue-filter-toggle");
    var searchPanel = document.getElementById("catalogue-search-panel");
    var filterPanel = document.getElementById("catalogue-filter-panel");
    var catalogueRegion = tools;
    var validTypes = ["all", "bestsellers", "marriage", "couple", "diwali", "frames", "premium", "corporate"];
    var validBudgets = ["all", "499", "999", "1999", "2000"];
    var typeLabels = { all: "All gifts", marriage: "Marriage gifts", couple: "Couple gifts", diwali: "Diwali gifts", frames: "Frames", premium: "Premium designs", corporate: "Corporate gifts" };
    var searchMaxLength = 100;
    var appliedType = "bestsellers";
    var appliedBudget = "all";

    var cards = Array.prototype.filter.call(document.querySelectorAll(".work-card, .romantic-keepsake-card"), function (card) {
      return !card.closest || !card.closest("#testimonials");
    });
    var sections = [];
    var allVisible = false;
    var previewLimit = 4;
    var expandedSections = [];

    function sectionFor(card) {
      var section = card.closest ? card.closest("section") : null;
      if (section && sections.indexOf(section) === -1) sections.push(section);
      return section;
    }

    cards.forEach(sectionFor);

    function cardsForSection(section) {
      return cards.filter(function (card) { return card.closest && card.closest("section") === section; });
    }

    function isExpanded(section) {
      return expandedSections.indexOf(section) !== -1;
    }

    function typeFor(card) {
      var section = sectionFor(card);
      var id = section ? section.id : "";
      if (id === "marriage-gifts") return "marriage";
      if (id === "romantic-keepsakes") return "couple";
      if (id === "diwali") return "diwali";
      if (id === "corporate-resin-gifts") return "corporate";
      if (id === "premium-collection") return "premium";
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
      if (limit === 1999) limit = 2000;
      return price.max <= limit;
    }

    function normalizeSearch(value) {
      return String(value || "").trim().replace(/\s+/g, " ").slice(0, searchMaxLength);
    }

    function titleFor(card) {
      var title = card.querySelector("figcaption strong") || card.querySelector("figcaption h3");
      return title ? title.textContent : "";
    }

    // Letters to add, drop, change or swap (two side by side) to turn one word into the other.
    function typoDistance(a, b) {
      var rows = [];
      for (var i = 0; i <= a.length; i += 1) {
        rows[i] = [i];
        for (var j = 1; j <= b.length; j += 1) {
          if (i === 0) { rows[i][j] = j; continue; }
          var cost = a[i - 1] === b[j - 1] ? 0 : 1;
          rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
        }
      }
      return rows[a.length][b.length];
    }

    function closeWordMatch(word, words) {
      if (word.length < 4) return false;
      var allowed = word.length >= 7 ? 2 : 1;
      return words.some(function (candidate) {
        return Math.abs(candidate.length - word.length) <= allowed && typoDistance(word, candidate) <= allowed;
      });
    }

    function matchesSearch(card, closeMatch) {
      var query = normalizeSearch(searchFilter.value).toLowerCase();
      if (!query) return true;
      var type = typeFor(card);
      var searchable = [titleFor(card), type, typeLabels[type] || "", card.getAttribute("data-product-kind") || "", card.getAttribute("data-search-keywords") || ""].join(" ").toLowerCase();
      if (searchable.indexOf(query) !== -1) return true;
      if (!closeMatch) return false;
      var words = searchable.split(/[^a-z0-9]+/);
      return query.split(" ").every(function (word) {
        return searchable.indexOf(word) !== -1 || closeWordMatch(word, words);
      });
    }

    function setVisibility(card, visible) {
      card.hidden = !visible;
      if (visible) card.removeAttribute("aria-hidden");
      else card.setAttribute("aria-hidden", "true");
    }

    var showingCloseMatches = false;

    // Exact matches first; when a search finds nothing, fall back to close spellings.
    function catalogueCards() {
      var exact = filterCatalogueCards(false);
      showingCloseMatches = false;
      if (exact.length || !normalizeSearch(searchFilter.value)) return exact;
      var close = filterCatalogueCards(true);
      showingCloseMatches = close.length > 0;
      return close;
    }

    function filterCatalogueCards(closeMatch) {
      return cards.filter(function (card) {
        var section = sectionFor(card);
        var sectionCards = cardsForSection(section);
        var isBestseller = sectionCards.indexOf(card) < previewLimit;
        var isInOverview = allVisible || isExpanded(section) || isBestseller;
        var type = typeFor(card);
        return isInOverview &&
          (appliedType === "all" || appliedType === type || (appliedType === "bestsellers" && (isBestseller || isExpanded(section)))) &&
          matchesPrice(card, appliedBudget) &&
          matchesSearch(card, closeMatch);
      });
    }

    function toggleClass(element, name, enabled) {
      if (element && element.classList && typeof element.classList.toggle === "function") element.classList.toggle(name, enabled);
    }

    function sectionHeading(section) {
      var headingId = section && section.getAttribute ? section.getAttribute("aria-labelledby") : "";
      return headingId && document.getElementById ? document.getElementById(headingId) : null;
    }

    function updateCataloguePresentation() {
      toggleClass(tools, "catalogue-full", allVisible);
      sections.forEach(function (section) {
        var fullSection = allVisible && !section.hidden;
        toggleClass(section, "catalogue-full", fullSection);
        var heading = sectionHeading(section);
        if (!heading) return;
        if (fullSection) {
          if (!heading.getAttribute("data-catalogue-original")) heading.setAttribute("data-catalogue-original", heading.textContent);
          var firstCard = cardsForSection(section)[0];
          heading.textContent = typeLabels[typeFor(firstCard)] || "Gifts";
        } else {
          var original = heading.getAttribute("data-catalogue-original");
          if (original) heading.textContent = original;
          heading.removeAttribute("data-catalogue-original");
        }
      });
    }

    // In Bestsellers and All, the type of the section under the sticky header; "" above the first section.
    function typeOnScreen() {
      if (appliedType !== "bestsellers" && appliedType !== "all") return "";
      var header = document.querySelector ? document.querySelector(".site-header") : null;
      var line = (header ? header.getBoundingClientRect().bottom : 0) + 8;
      var found = "";
      sections.forEach(function (section) {
        if (section.hidden || typeof section.getBoundingClientRect !== "function") return;
        var box = section.getBoundingClientRect();
        if (box.top <= line && box.bottom > line) found = typeFor(cardsForSection(section)[0]);
      });
      return found;
    }

    var currentTab = null;

    function syncCategoryTabs() {
      if (!categoryTabs || typeof categoryTabs.forEach !== "function") return;
      var onScreen = typeOnScreen();
      var hasTab = Array.prototype.some.call(categoryTabs, function (tab) { return tab.getAttribute("data-category-tab") === onScreen; });
      var current = hasTab ? onScreen : appliedType;
      categoryTabs.forEach(function (tab) {
        if (tab.getAttribute("data-category-tab") !== current) {
          if (typeof tab.removeAttribute === "function") tab.removeAttribute("aria-current");
          return;
        }
        tab.setAttribute("aria-current", "true");
        // Bring a newly marked tab into view in the sideways-scrolling tab bar.
        var list = tab.parentNode;
        if (tab !== currentTab && list && typeof list.scrollTo === "function") list.scrollTo({ left: tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2, behavior: "smooth" });
        currentTab = tab;
      });
    }

    window.addEventListener("scroll", syncCategoryTabs, { passive: true });

    function applyFilters() {
      var matchingCards = catalogueCards();
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
        setVisibility(card, matchingCards.indexOf(card) !== -1);
      });
      sections.forEach(function (section) {
        var sectionCards = cardsForSection(section);
        var hasVisibleCard = sectionCards.some(function (card) { return !card.hidden; });
        section.hidden = !hasVisibleCard;
        var disclosure = section.querySelector && section.querySelector("[data-catalogue-disclosure]");
        if (!disclosure) return;
        var canExpand = !allVisible && sectionCards.length > previewLimit;
        disclosure.hidden = !canExpand;
        disclosure.setAttribute("aria-expanded", String(canExpand && isExpanded(section)));
        disclosure.textContent = canExpand && isExpanded(section) ? "Show less" : "View all";
      });
      updateCataloguePresentation();
      syncCategoryTabs();
      empty.hidden = matchingCards.length !== 0;
      status.textContent = !matchingCards.length ? "No gifts match those choices." : showingCloseMatches ? "Showing close matches for “" + normalizeSearch(searchFilter.value) + "”." : "";
      document.documentElement.classList.add("catalogue-ready");
      return { total: matchingCards.length, cards: matchingCards };
    }

    function currentUrl() {
      var location = window.location || {};
      if (location.href) return location.href;
      return "https://saloniresinart.com" + (location.pathname || "/") + (location.search || "") + (location.hash || "");
    }

    function urlWithState(state, hash) {
      var url = new URL(currentUrl(), "https://saloniresinart.com/");
      var params = url.searchParams;
      ["type", "budget", "page", "q", "view"].forEach(function (key) { params.delete(key); });
      if (state && state.preview) {
        params.set("view", "preview");
        params.set("type", state.type || "all");
        params.set("budget", state.budget || "all");
      } else if (state && state.full) {
        params.set("type", state.type || "all");
        params.set("budget", state.budget || "all");
        var query = normalizeSearch(state.q);
        if (query) params.set("q", query);
      }
      url.search = params.toString();
      if (hash !== undefined) url.hash = hash ? (String(hash).charAt(0) === "#" ? String(hash) : "#" + hash) : "";
      return url.pathname + (url.search ? url.search : "") + (url.hash ? url.hash : "");
    }

    function sameUrl(next) {
      var current = new URL(currentUrl(), "https://saloniresinart.com/");
      var expected = new URL(next, current.href);
      return current.pathname === expected.pathname && current.search === expected.search && current.hash === expected.hash;
    }

    function writeUrl(next, replace) {
      if (sameUrl(next)) return false;
      try {
        if (window.history && (replace ? window.history.replaceState : window.history.pushState)) {
          window.history[replace ? "replaceState" : "pushState"]({}, "", next);
          return true;
        }
        if (window.location) window.location.href = next;
      } catch (error) {}
      return false;
    }

    function readLocationState() {
      var params = new URLSearchParams((window.location && window.location.search) || "");
      var query = normalizeSearch(params.get("q"));
      var preview = params.get("view") === "preview";
      var has = preview || ["type", "budget", "page"].some(function (key) { return params.has(key); }) || Boolean(query);
      if (!has) return { full: false, hasQuery: params.has("q") };
      var type = params.get("type");
      var budget = params.get("budget");
      if (preview) {
        return { full: false, preview: true, type: validTypes.indexOf(type) !== -1 ? type : "all", budget: validBudgets.indexOf(budget) !== -1 ? budget : "all" };
      }
      return { full: true, type: validTypes.indexOf(type) !== -1 ? type : "all", budget: validBudgets.indexOf(budget) !== -1 ? budget : "all", q: query };
    }

    function setFullState(type, budget, query) {
      allVisible = true;
      expandedSections = [];
      searchFilter.value = normalizeSearch(query);
      // A search always looks through every gift, also when it comes from a saved link.
      appliedType = searchFilter.value ? "all" : validTypes.indexOf(type) !== -1 ? type : "all";
      appliedBudget = validBudgets.indexOf(budget) !== -1 ? budget : "all";
      typeFilter.value = appliedType;
      priceFilter.value = appliedBudget;
      return applyFilters();
    }

    function showAll(commit) {
      var state = setFullState("all", "all", "");
      closeControls();
      if (commit) writeUrl(urlWithState({ full: true, type: "all", budget: "all", q: "" }, "#catalogue-filters"));
      return state;
    }

    function showFeatured(commit, type, budget) {
      allVisible = false;
      expandedSections = [];
      appliedType = validTypes.indexOf(type) !== -1 ? type : "bestsellers";
      appliedBudget = validBudgets.indexOf(budget) !== -1 ? budget : "all";
      typeFilter.value = appliedType;
      priceFilter.value = appliedBudget;
      searchFilter.value = "";
      applyFilters();
      closeControls();
      if (commit) writeUrl(urlWithState({ preview: true, type: appliedType, budget: appliedBudget }, "#catalogue-filters"));
    }

    function scrollToHash(href) {
      var id = String(href || "").replace(/^#/, "");
      var target = id ? document.getElementById(id) : null;
      if (target && !target.hidden && typeof target.scrollIntoView === "function") target.scrollIntoView({ behavior: "auto", block: "start" });
    }

    function focusCatalogueRegion() {
      var target = catalogueRegion;
      if (!target) return;
      if (typeof target.scrollIntoView === "function") target.scrollIntoView({ behavior: "auto", block: "start" });
      if (typeof target.focus === "function") target.focus({ preventScroll: true });
    }

    function selectCategory(category, href, commit) {
      if (category === "bestsellers") {
        showFeatured(commit, category, "all");
        scrollToHash(href || "#catalogue-filters");
        return;
      }
      setFullState(category || "all", "all", "");
      closeControls();
      if (commit) writeUrl(urlWithState({ full: true, type: appliedType, budget: appliedBudget }, href || "#catalogue-filters"));
      scrollToHash(href || "#catalogue-filters");
    }

    function restoreLegacyHash() {
      var id = String(window.location && window.location.hash || "").replace(/^#/, "");
      var target = id ? document.getElementById(id) : null;
      if (!target) return false;
      if (target.matches && target.matches("article")) {
        setFullState("all", "all", "");
        scrollToHash("#" + id);
        return true;
      }
      var sectionCards = target.querySelector && target.querySelector(".work-card, .romantic-keepsake-card");
      if (sectionCards) {
        selectCategory(typeFor(sectionCards), "#" + id, false);
        return true;
      }
      if (id === "catalogue-filters") scrollToHash("#catalogue-filters");
      return false;
    }

    function restoreFromLocation() {
      var state = readLocationState();
      if (state.full) {
        setFullState(state.type, state.budget, state.q);
        var normalized = urlWithState({ full: true, type: appliedType, budget: appliedBudget, q: searchFilter.value }, window.location && window.location.hash);
        if (!sameUrl(normalized)) writeUrl(normalized, true);
        closeControls();
        scrollToHash(window.location && window.location.hash);
        if ((window.location && window.location.hash) === "#catalogue-filters") focusCatalogueRegion();
        return;
      }
      if (state.preview) {
        showFeatured(false, state.type, state.budget);
        var previewUrl = urlWithState({ preview: true, type: appliedType, budget: appliedBudget }, window.location && window.location.hash);
        if (!sameUrl(previewUrl)) writeUrl(previewUrl, true);
        scrollToHash(window.location && window.location.hash);
        return;
      }
      if (state.hasQuery) {
        var cleaned = urlWithState({ preview: true, type: "bestsellers", budget: "all" }, window.location && window.location.hash);
        if (!sameUrl(cleaned)) writeUrl(cleaned, true);
      }
      showFeatured(false);
      restoreLegacyHash();
    }

    function closeControls(returnFocus) {
      if (searchPanel) searchPanel.hidden = true;
      if (filterPanel) filterPanel.hidden = true;
      if (searchToggle) searchToggle.setAttribute("aria-expanded", "false");
      if (filterToggle) filterToggle.setAttribute("aria-expanded", "false");
      if (returnFocus && typeof returnFocus.focus === "function") returnFocus.focus({ preventScroll: true });
    }

    function openControl(kind) {
      var button = kind === "search" ? searchToggle : filterToggle;
      var panel = kind === "search" ? searchPanel : filterPanel;
      if (!button || !panel) return;
      var wasOpen = button.getAttribute("aria-expanded") === "true";
      closeControls();
      if (wasOpen) return;
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
      var target = kind === "search" ? searchFilter : typeFilter;
      if (target && typeof target.focus === "function") target.focus({ preventScroll: true });
    }

    function commitFilterChange() {
      allVisible = true;
      expandedSections = [];
      appliedType = typeFilter.value || "all";
      appliedBudget = priceFilter.value || "all";
      applyFilters();
      closeControls(filterToggle);
      writeUrl(urlWithState({ full: true, type: appliedType, budget: appliedBudget, q: searchFilter.value }, "#catalogue-filters"));
    }

    function commitSearchInput(event) {
      if (event && event.isComposing) return;
      var query = normalizeSearch(searchFilter.value);
      allVisible = Boolean(query);
      expandedSections = [];
      // Search always looks through every gift; clearing the search returns to Bestsellers.
      if (query) appliedType = "all";
      else if (appliedType === "all") appliedType = "bestsellers";
      typeFilter.value = appliedType;
      applyFilters();
      var state = { full: allVisible, type: appliedType, budget: appliedBudget, q: query };
      if (!allVisible && (appliedType !== "all" || appliedBudget !== "all")) state = { preview: true, type: appliedType, budget: appliedBudget };
      writeUrl(urlWithState(state, "#catalogue-filters"), true);
      if (!query) closeControls();
    }

    document.querySelectorAll("[data-browse-filters]").forEach(function (link) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        var firstVisibleGrid = null;
        for (var index = 0; index < sections.length; index += 1) {
          if (sections[index].hidden || !sections[index].querySelector) continue;
          firstVisibleGrid = sections[index].querySelector(".catalogue-grid");
          if (firstVisibleGrid) break;
        }
        if (firstVisibleGrid && typeof firstVisibleGrid.scrollIntoView === "function") {
          firstVisibleGrid.scrollIntoView({ behavior: "auto", block: "start" });
          return;
        }
        scrollToHash(link.getAttribute("href") || "#catalogue-filters");
      });
    });
    document.querySelectorAll("[data-browse-all]").forEach(function (link) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        showAll(true);
        focusCatalogueRegion();
      });
    });
    document.querySelectorAll("[data-category-shortcut]").forEach(function (link) {
      link.addEventListener("click", function (event) {
        var category = link.getAttribute("data-category-shortcut");
        if (!category) return;
        event.preventDefault();
        selectCategory(category, link.getAttribute("href"), true);
      });
    });
    sections.forEach(function (section) {
      var disclosure = section.querySelector && section.querySelector("[data-catalogue-disclosure]");
      if (!disclosure) return;
      disclosure.addEventListener("click", function () {
        if (allVisible) return;
        var expandedIndex = expandedSections.indexOf(section);
        if (expandedIndex === -1) expandedSections.push(section);
        else expandedSections.splice(expandedIndex, 1);
        applyFilters();
      });
    });
    if (searchToggle) searchToggle.addEventListener("click", function () { openControl("search"); });
    if (filterToggle) filterToggle.addEventListener("click", function () { openControl("filter"); });
    if (searchForm) searchForm.addEventListener("submit", function (event) {
      event.preventDefault();
      commitSearchInput(event);
      closeControls();
      focusCatalogueRegion();
    });
    applyButton.addEventListener("click", commitFilterChange);
    searchFilter.addEventListener("input", commitSearchInput);
    searchFilter.addEventListener("compositionend", commitSearchInput);
    resetButton.addEventListener("click", function () { showFeatured(true); });
    emptyReset.addEventListener("click", function () {
      showAll(true);
      focusCatalogueRegion();
    });
    if (typeof document.addEventListener === "function") document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (searchToggle && searchToggle.getAttribute("aria-expanded") === "true") closeControls(searchToggle);
      else if (filterToggle && filterToggle.getAttribute("aria-expanded") === "true") {
        typeFilter.value = appliedType;
        priceFilter.value = appliedBudget;
        closeControls(filterToggle);
      }
    });
    if (typeof document.addEventListener === "function") document.addEventListener("click", function (event) {
      var searchOpen = searchToggle && searchToggle.getAttribute("aria-expanded") === "true";
      var filterOpen = filterToggle && filterToggle.getAttribute("aria-expanded") === "true";
      if (!searchOpen && !filterOpen) return;
      var button = searchOpen ? searchToggle : filterToggle;
      var panel = searchOpen ? searchPanel : filterPanel;
      if (button.contains(event.target) || (panel && panel.contains(event.target))) return;
      if (filterOpen) {
        typeFilter.value = appliedType;
        priceFilter.value = appliedBudget;
      }
      closeControls();
    });
    window.addEventListener("hashchange", restoreFromLocation);
    window.addEventListener("popstate", restoreFromLocation);
    restoreFromLocation();
  }

  function initOrderRequestFlow() {
    var embed = document.getElementById("order-form-embed");
    var frame = document.getElementById("order-form-frame");
    var status = document.getElementById("order-form-status");
    var continueOrderButton = document.getElementById("order-continue-request");
    var orderDialog = document.getElementById("order-dialog");
    var orderDialogClose = document.getElementById("order-dialog-close");
    var selectedProductSummary = document.getElementById("selected-product-summary");
    var selectedProductImage = document.getElementById("selected-product-image");
    var selectedProductName = document.getElementById("selected-product-name");
    var selectedProductPrice = document.getElementById("selected-product-price");
    var selectedProductSize = document.getElementById("selected-product-size");
    var catalogueSelection = document.getElementById("catalogue-selection");
    var catalogueSelectionPreviews = document.getElementById("catalogue-selection-previews");
    var catalogueSelectionItems = document.getElementById("catalogue-selection-items");
    var catalogueSelectionTotal = document.getElementById("catalogue-selection-total");
    var catalogueWhatsappLinks = ["catalogue-selection-whatsapp", "catalogue-cart-whatsapp"].map(function (id) { return document.getElementById(id); }).filter(Boolean);
    var catalogueSelectionSummary = document.getElementById("catalogue-selection-summary");
    var catalogueSelectionStatus = document.getElementById("catalogue-selection-status");
    var catalogueRequestSelected = document.getElementById("catalogue-request-selected");
    var catalogueCartJump = document.getElementById("catalogue-cart-jump");
    var catalogueCartCount = document.getElementById("catalogue-cart-count");
    var catalogueCartView = document.getElementById("catalogue-cart-view");
    var headerCart = document.getElementById("catalogue-header-cart");
    var headerCartCount = document.getElementById("catalogue-header-cart-count");
    var catalogueCartOrder = document.getElementById("catalogue-cart-order");
    var customizerRequestStatus = document.getElementById("share-status");
    var continueCustomizerButton = document.getElementById("customizer-continue-without-preview");
    if (!embed || !frame || !status) return;
    var orderUrl = embed.getAttribute("data-order-form-url") || "";
    var configured = orderUrl && orderUrl.indexOf("REPLACE_WITH_") === -1;
    var PARENT_ORIGIN = "https://saloniresinart.com";
    var requestedMode = embed.getAttribute("data-form-mode");
    var frameState = { loaded: false, nonce: "", requestId: "", pendingCustomizerRequestId: "", customizerFallback: null, siteKey: "", activeCaptcha: null, previewSnapshot: null, previewTransfers: Object.create(null), pinnedSender: null, pinnedOrigin: "", loadingTimer: null, loading: false, frameSequence: 0, customizerHandoff: false, catalogueSeedKey: "", sourceKind: "", mode: requestedMode === "partner" || requestedMode === "corporate" || requestedMode === "review" ? requestedMode : "order" };
    var corporateIntakeReady = embed.getAttribute("data-intake-ready") === "true";
    var orderDialogEnabled = Boolean(orderDialog && typeof orderDialog.showModal === "function");
    var orderDialogHistoryActive = false;
    var orderDialogHistoryBackPending = false;
    var orderDialogCloseFromHistory = false;
    var orderDialogCustomizerHandoff = false;
    var orderDialogOpener = null;
    var pendingOrderDialogOpener = null;
    var pendingMobileCustomizerOpener = null;
    var ORDER_FORM_LOADING_TIMEOUT = 12000;
    var ORDER_FORM_LOAD_SETTLE_TIMEOUT = 2500;

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

    function previewOrigin(origin) {
      if (typeof origin !== "string" || !origin) return "";
      if (typeof URL === "undefined") return "";
      try {
        var parsed = new URL(origin);
        if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash || !/^n-[a-z0-9-]+-script\.googleusercontent\.com$/i.test(parsed.hostname)) return "";
        return parsed.origin === origin || parsed.origin + ":443" === origin ? parsed.origin : "";
      } catch (error) {
        return "";
      }
    }

    function previewIdentityPart(value) {
      return typeof value === "string" && value.length > 0 && value.length <= 200;
    }

    function previewTransferId(value) {
      return typeof value === "string" && value.length > 0 && value.length <= 120 && /^[A-Za-z0-9._:-]+$/.test(value);
    }

    function usablePreviewDetails(summary, dimensions) {
      var validDimension = function (value, unit) {
        var number = Number(value);
        var inches = unit === "ft" ? number * 12 : number;
        return (unit === "in" || unit === "ft") && Number.isFinite(inches) && inches > 0 && inches <= 60;
      };
      return Boolean(typeof summary === "string" && summary.trim() && summary.length <= 2000 && dimensions && typeof dimensions === "object" && validDimension(dimensions.height, dimensions.heightUnit) && validDimension(dimensions.width, dimensions.widthUnit));
    }

    function usablePreviewSnapshot(snapshot) {
      var dimensions = snapshot && snapshot.dimensions;
      return Boolean(snapshot && usablePreviewDetails(snapshot.summary, dimensions) && snapshot.blob && typeof snapshot.blob.size === "number" && snapshot.blob.size > 0 && snapshot.blob.size <= 5 * 1024 * 1024 && typeof snapshot.blob.type === "string" && snapshot.blob.type.toLowerCase() === "image/png");
    }

    function clearOrderLoadingTimer() {
      if (frameState.loadingTimer && window.clearTimeout) window.clearTimeout(frameState.loadingTimer);
      frameState.loadingTimer = null;
    }

    function loadingStatusMarkup(copy) {
      return '<span class="order-form-spinner" aria-hidden="true"></span><span>' + copy + '</span>';
    }

    function startOrderFormLoading(identity) {
      clearOrderLoadingTimer();
      frameState.loading = true;
      frameState.loadingNonce = identity.nonce;
      frameState.loadingRequestId = identity.requestId;
      status.innerHTML = loadingStatusMarkup("Preparing the request form…");
      status.hidden = false;
      status.setAttribute("aria-busy", "true");
      var loadingNonce = identity.nonce;
      var loadingRequestId = identity.requestId;
      frameState.loadingTimer = window.setTimeout(function () {
        if (!frameState.loading || frameState.loadingNonce !== loadingNonce || frameState.loadingRequestId !== loadingRequestId || frameState.nonce !== loadingNonce || frameState.requestId !== loadingRequestId) return;
        frameState.loading = false;
        frameState.loadingTimer = null;
        status.innerHTML = "The request form is taking longer than expected. You can still call Saloni at <a href=\"tel:+918209238541\">8209238541</a> or message <a href=\"https://www.instagram.com/saloniresin_art_studio/\" target=\"_blank\" rel=\"noreferrer\">@saloniresin_art_studio</a>.";
        status.hidden = false;
        status.removeAttribute("aria-busy");
      }, ORDER_FORM_LOADING_TIMEOUT);
    }

    function finishOrderFormLoading() {
      clearOrderLoadingTimer();
      frameState.loading = false;
      frameState.loadingNonce = "";
      frameState.loadingRequestId = "";
      status.hidden = true;
      status.removeAttribute("aria-busy");
    }

    function replaceOrderFormFrame(identity) {
      var previousFrame = frame;
      var nextFrame = previousFrame.cloneNode ? previousFrame.cloneNode(false) : document.createElement("iframe");
      nextFrame.id = previousFrame.id || "order-form-frame";
      if (previousFrame.getAttribute && nextFrame.setAttribute) {
        ["title", "loading"].forEach(function (attribute) {
          var value = previousFrame.getAttribute(attribute);
          if (value) nextFrame.setAttribute(attribute, value);
        });
      }
      nextFrame.name = "saloni-order-form-frame-" + (++frameState.frameSequence);
      nextFrame.hidden = true;
      if (previousFrame.parentNode && previousFrame.parentNode.replaceChild) previousFrame.parentNode.replaceChild(nextFrame, previousFrame);
      frame = nextFrame;
      // A visible load only ends presentation loading; it does not establish a trusted message sender.
      nextFrame.addEventListener("load", function () {
        if (frame !== nextFrame || !frameState.loaded || frameState.nonce !== identity.nonce || frameState.requestId !== identity.requestId) return;
        nextFrame.hidden = false;
        if (!frameState.loading || frameState.loadingNonce !== identity.nonce || frameState.loadingRequestId !== identity.requestId) return;
        // Keep the loader until the form reports ready; if it never does, stop after a short settle time.
        clearOrderLoadingTimer();
        frameState.loadingTimer = window.setTimeout(function () {
          if (!frameState.loading || frameState.loadingNonce !== identity.nonce || frameState.loadingRequestId !== identity.requestId) return;
          finishOrderFormLoading();
        }, ORDER_FORM_LOAD_SETTLE_TIMEOUT);
      });
      return nextFrame;
    }

    function isOrderDialogHistoryState(state) {
      return Boolean(state && state.saloniOrderDialog);
    }

    function pushOrderDialogHistory() {
      var history = window.history;
      if (!history || typeof history.pushState !== "function") return;
      if (orderDialogHistoryActive || isOrderDialogHistoryState(history.state)) {
        orderDialogHistoryActive = true;
        return;
      }
      try {
        history.pushState(Object.assign({}, history.state || {}, { saloniOrderDialog: true }), window.location && window.location.href ? window.location.href : "");
        orderDialogHistoryActive = true;
      } catch (error) {}
    }

    function consumeOrderDialogHistory() {
      if (!orderDialogHistoryActive) return false;
      orderDialogHistoryActive = false;
      if (orderDialogCloseFromHistory) return true;
      var history = window.history;
      if (!history || typeof history.back !== "function" || !isOrderDialogHistoryState(history.state)) return false;
      orderDialogHistoryBackPending = true;
      try { history.back(); return true; } catch (error) { orderDialogHistoryBackPending = false; return false; }
    }

    function restoreOrderDialogFocus() {
      var opener = orderDialogOpener;
      orderDialogOpener = null;
      if (opener && typeof opener.focus === "function") opener.focus({ preventScroll: true });
    }

    function openOrderDialog(opener, openWhileHistoryPending) {
      if (!orderDialogEnabled) return false;
      orderDialogOpener = opener || (document.activeElement && document.activeElement.focus ? document.activeElement : null);
      orderDialogCustomizerHandoff = frameState.customizerHandoff;
      if (orderDialogHistoryBackPending) {
        pendingOrderDialogOpener = orderDialogOpener;
        if (openWhileHistoryPending) {
          if (!orderDialog.open) orderDialog.showModal();
          if (orderDialogClose && typeof orderDialogClose.focus === "function") orderDialogClose.focus({ preventScroll: true });
        }
        return true;
      }
      pushOrderDialogHistory();
      if (!orderDialog.open) orderDialog.showModal();
      if (orderDialogClose && typeof orderDialogClose.focus === "function") orderDialogClose.focus({ preventScroll: true });
      return true;
    }

    function resumeOrderDialog(opener) {
      return frameState.loaded && openOrderDialog(opener);
    }

    function closeOrderDialog() {
      if (!orderDialogEnabled || !orderDialog.open) return;
      orderDialogCloseFromHistory = false;
      orderDialog.close();
    }

    if (continueOrderButton) continueOrderButton.addEventListener("click", function (event) {
      if (event && event.preventDefault) event.preventDefault();
      resumeOrderDialog(continueOrderButton);
    });

    function invalidateChannel() {
      clearOrderLoadingTimer();
      status.removeAttribute("aria-busy");
      if (frameState.activeCaptcha) {
        if (frameState.activeCaptcha.timer) window.clearTimeout(frameState.activeCaptcha.timer);
        if (frameState.activeCaptcha.port && frameState.activeCaptcha.port.close) frameState.activeCaptcha.port.close();
      }
      frameState.loading = false;
      frameState.loadingNonce = "";
      frameState.loadingRequestId = "";
      frameState.activeCaptcha = null;
      frameState.nonce = "";
      frameState.requestId = "";
      frameState.pendingCustomizerRequestId = "";
      frameState.customizerFallback = null;
      frameState.siteKey = "";
      frameState.previewSnapshot = null;
      frameState.previewTransfers = Object.create(null);
      frameState.pinnedSender = null;
      frameState.pinnedOrigin = "";
      frameState.customizerHandoff = false;
      frameState.catalogueSeedKey = "";
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
              var captchaAction = frameState.mode === "partner" ? "partner_application" : frameState.mode === "corporate" ? "corporate_enquiry" : frameState.mode === "review" ? "review_submission" : "order_request";
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

    if (orderDialogEnabled) {
      orderDialog.addEventListener("close", function () {
        var wasCustomizerRequest = orderDialogCustomizerHandoff;
        consumeOrderDialogHistory();
        pendingOrderDialogOpener = null;
        orderDialogCloseFromHistory = false;
        orderDialogCustomizerHandoff = false;
        if (wasCustomizerRequest) notifyCustomizerRequestOutcome("cancelled");
        if (!frameState.catalogueSeedKey) {
          frameState.sourceKind = "";
          frameState.customizerHandoff = false;
        }
        restoreOrderDialogFocus();
      });
      orderDialog.addEventListener("click", function (event) {
        if (event && event.target === orderDialog) closeOrderDialog();
      });
      window.addEventListener("popstate", function (event) {
        if (orderDialogHistoryBackPending) {
          orderDialogHistoryBackPending = false;
          var opener = pendingOrderDialogOpener;
          pendingOrderDialogOpener = null;
          if (opener) {
            if (orderDialog.open) {
              pushOrderDialogHistory();
              if (orderDialogClose && typeof orderDialogClose.focus === "function") orderDialogClose.focus({ preventScroll: true });
            } else openOrderDialog(opener);
          }
          return;
        }
        if (orderDialogHistoryActive && !isOrderDialogHistoryState(event && event.state)) {
          orderDialogCloseFromHistory = true;
          if (orderDialog.open) orderDialog.close();
          return;
        }
        if (!orderDialogHistoryActive && !orderDialog.open && isOrderDialogHistoryState(event && event.state)) {
          try { window.history.back(); } catch (error) {}
        }
      });
    }

    function scrollToForm() {
      embed.scrollIntoView({ behavior: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }

    function clearSelectedProductSummary() {
      if (!selectedProductSummary) return;
      selectedProductSummary.hidden = true;
      if (selectedProductImage) {
        selectedProductImage.removeAttribute("src");
        selectedProductImage.setAttribute("alt", "Selected product photo");
      }
      if (selectedProductName) selectedProductName.textContent = "";
      [selectedProductPrice, selectedProductSize].forEach(function (element) {
        if (!element) return;
        element.textContent = "";
        element.hidden = true;
      });
    }

    function showSelectedProductSummary(card) {
      if (!selectedProductSummary || !selectedProductImage || !selectedProductName || !card) return;
      var image = card.querySelector("img[src]");
      var title = card.querySelector("figcaption strong") || card.querySelector("figcaption h3");
      if (!image || !title) return;
      var price = null;
      var size = null;
      Array.prototype.forEach.call(card.querySelectorAll(".product-pricing > div"), function (row) {
        var label = row.querySelector("dt");
        var value = row.querySelector("dd");
        if (!label || !value) return;
        var labelText = label.textContent.trim();
        var valueText = value.textContent.trim();
        if (!valueText) return;
        if (!price && /^(?:price|from)$/i.test(labelText)) price = labelText + ": " + valueText;
        if (!size && /^size$/i.test(labelText) && !/suggested size|confirm with saloni|custom size in inches|component size to confirm/i.test(valueText)) size = "Size: " + valueText;
      });
      selectedProductImage.setAttribute("src", image.getAttribute("src"));
      selectedProductImage.setAttribute("alt", (title.textContent.trim() || "Selected item") + " product photo");
      selectedProductName.textContent = title.textContent.trim();
      selectedProductPrice.textContent = price || "";
      selectedProductPrice.hidden = !price;
      selectedProductSize.textContent = size || "";
      selectedProductSize.hidden = !size;
      selectedProductSummary.hidden = false;
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
      var repeatProfile = frameState.mode === "order" ? readRepeatProfile() : null;
      var seed = {
        sourceKind: source.sourceKind || "catalogue", sourceId: source.sourceId || "",
        productName: source.productName || "", requestStage: "quote", quantity: source.quantity || "1", dimensionFormat: "feet-inches",
        heightFeet: heightParts ? heightParts.feet : "", heightInchesPart: heightParts ? heightParts.inches : "", widthFeet: widthParts ? widthParts.feet : "", widthInchesPart: widthParts ? widthParts.inches : "",
        height: source.height || "", heightUnit: source.heightUnit || "",
        width: source.width || "", widthUnit: source.widthUnit || "", designDetails: source.designDetails || "",
        customerName: repeatProfile ? repeatProfile.customerName : "", phone: repeatProfile ? repeatProfile.phone : "", email: "", fulfillment: repeatProfile ? repeatProfile.fulfillment : "shipping", shippingAddress: repeatProfile ? repeatProfile.shippingAddress : "", city: repeatProfile ? repeatProfile.city : "", state: repeatProfile ? repeatProfile.state : "", pin: repeatProfile ? repeatProfile.pin : "", requestedDate: "", referralCode: readReferralCode()
      };
      if (Array.isArray(source.bundleItems)) {
        seed.bundleItems = source.bundleItems.map(function (item) {
          return {
            sourceId: String(item && item.sourceId || "").slice(0, 160),
            productName: String(item && item.productName || "").slice(0, 160),
            price: String(item && item.price || "").slice(0, 120),
            size: String(item && item.size || "").slice(0, 120),
            quantity: Number.isInteger(Number(item && item.quantity)) ? Number(item.quantity) : 1
          };
        });
      }
      return seed;
    }

    function submitSeed(seed, shouldScroll, identity, previewSnapshot, previewExpected, opener, customizerHandoff, openDialog) {
      if (!configured) {
        invalidateChannel();
        status.innerHTML = frameState.mode === "corporate"
          ? "Corporate gifting enquiries are being prepared. For a current large-order enquiry, call Saloni at <a href=\"tel:+918209238541\">8209238541</a> or message <a href=\"https://www.instagram.com/saloniresin_art_studio/\" target=\"_blank\" rel=\"noreferrer\">@saloniresin_art_studio</a>."
          : "The request form is not configured for this preview yet. You can still call Saloni at <a href=\"tel:+918209238541\">8209238541</a> or message <a href=\"https://www.instagram.com/saloniresin_art_studio/\" target=\"_blank\" rel=\"noreferrer\">@saloniresin_art_studio</a>.";
        status.hidden = false;
        status.removeAttribute("aria-busy");
        return false;
      }
      invalidateChannel();
      frameState.sourceKind = String(seed.sourceKind || "");
      frameState.customizerHandoff = customizerHandoff === true || frameState.sourceKind.toLowerCase() === "customizer";
      var requestIdentity = identity || { requestId: seed.requestId || requestId(), nonce: channelNonce() };
      frameState.nonce = requestIdentity.nonce;
      frameState.requestId = seed.requestId || requestIdentity.requestId;
      if (!frameState.nonce) {
        status.textContent = "This browser cannot start a secure request. Please use the latest browser or contact Saloni directly.";
        status.hidden = false;
        return false;
      }
      if (!previewIdentityPart(frameState.requestId)) {
        status.textContent = "This browser could not start a secure request. Please try again or contact Saloni directly.";
        status.hidden = false;
        return false;
      }
      if (previewExpected !== false && previewSnapshot && usablePreviewSnapshot(previewSnapshot) && previewSnapshot.requestId === frameState.requestId && previewSnapshot.nonce === frameState.nonce && previewSnapshot.mode === frameState.mode) frameState.previewSnapshot = previewSnapshot;
      seed.channelNonce = frameState.nonce;
      seed.formMode = frameState.mode;
      if (String(seed.sourceKind || "").toLowerCase() === "customizer") seed.previewExpected = previewExpected !== false;
      var frameIdentity = { nonce: frameState.nonce, requestId: frameState.requestId };
      var requestFrame = replaceOrderFormFrame(frameIdentity);
      if (orderDialogEnabled) startOrderFormLoading(frameIdentity);
      else status.hidden = true;
      // POST action=seed targets the fresh iframe for this request.
      var postForm = document.createElement("form");
      postForm.method = "POST";
      postForm.action = orderUrl;
      postForm.target = requestFrame.name;
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
      if (continueOrderButton && openDialog !== false) continueOrderButton.hidden = false;
      if (orderDialogEnabled && openDialog !== false) openOrderDialog(opener, true);
      else if (shouldScroll !== false && openDialog !== false) scrollToForm();
      return true;
    }

    function clearPreparedCatalogueRequest() {
      if (orderDialogEnabled && orderDialog.open) {
        frameState.catalogueSeedKey = "";
        return;
      }
      if (frameState.sourceKind !== "catalogue") {
        frameState.catalogueSeedKey = "";
        return;
      }
      invalidateChannel();
      frameState.loaded = false;
      frameState.sourceKind = "";
      frame.hidden = true;
      if (continueOrderButton) continueOrderButton.hidden = true;
      clearSelectedProductSummary();
    }

    function previewResponse(request, ok, reason, blob) {
      var response = {
        type: "saloni-preview-response", version: 1, nonce: request.nonce, requestId: request.requestId,
        mode: request.mode, transferId: request.transferId, ok: ok === true
      };
      if (ok === true) response.blob = blob;
      else response.error = reason || "unavailable";
      try { request.port.postMessage(response); } catch (error) {}
      try { if (request.port.close) request.port.close(); } catch (error) {}
    }

    function isCurrentFormSource(source) {
      if (!source) return false;
      if (source === frame.contentWindow || source === frameState.pinnedSender) return true;
      var current = source;
      for (var depth = 0; depth < 8; depth += 1) {
        var parent;
        try { parent = current.parent; } catch (error) { return false; }
        if (!parent || parent === current) return false;
        if (parent === frame.contentWindow) return true;
        current = parent;
      }
      return false;
    }

    function handlePreviewRequest(event, data) {
      if (!data || data.type !== "saloni-preview-request") return;
      if (!frameState.loaded || !frameState.nonce || !frameState.requestId || data.version !== 1 || data.mode !== frameState.mode || data.nonce !== frameState.nonce || data.requestId !== frameState.requestId || !previewIdentityPart(data.nonce) || !previewIdentityPart(data.requestId) || !previewTransferId(data.transferId) || !event || !isCurrentFormSource(event.source) || !event.ports || event.ports.length !== 1 || !event.origin) return;
      var origin = previewOrigin(event.origin);
      if (!origin || (frameState.pinnedOrigin && origin !== frameState.pinnedOrigin) || (frameState.pinnedSender && event.source !== frameState.pinnedSender)) return;
      var port = event.ports[0];
      if (!port || typeof port.postMessage !== "function") return;
      if (frameState.previewTransfers[data.transferId]) return;
      frameState.previewTransfers[data.transferId] = true;
      if (!frameState.previewSnapshot || frameState.previewSnapshot.requestId !== data.requestId || frameState.previewSnapshot.nonce !== data.nonce || frameState.previewSnapshot.mode !== data.mode) {
        if (!frameState.pinnedOrigin) frameState.pinnedOrigin = origin;
        if (!frameState.pinnedSender) frameState.pinnedSender = event.source;
        previewResponse({ port: port, nonce: data.nonce, requestId: data.requestId, mode: data.mode, transferId: data.transferId }, false, "unavailable");
        return;
      }
      if (!usablePreviewSnapshot(frameState.previewSnapshot)) {
        if (!frameState.pinnedOrigin) frameState.pinnedOrigin = origin;
        if (!frameState.pinnedSender) frameState.pinnedSender = event.source;
        previewResponse({ port: port, nonce: data.nonce, requestId: data.requestId, mode: data.mode, transferId: data.transferId }, false, "invalid-preview");
        return;
      }
      if (!frameState.pinnedOrigin) frameState.pinnedOrigin = origin;
      if (!frameState.pinnedSender) frameState.pinnedSender = event.source;
      previewResponse({ port: port, nonce: data.nonce, requestId: data.requestId, mode: data.mode, transferId: data.transferId }, true, "", frameState.previewSnapshot.blob);
    }

    function chooseSource(source, options) {
      options = options || {};
      var seed = sourceSeed(source);
      seed.requestId = options.requestId || source.requestId || requestId();
      if (options.card) showSelectedProductSummary(options.card);
      else clearSelectedProductSummary();
      return submitSeed(seed, options.openDialog === false ? false : true, options.identity, options.previewSnapshot || source.previewSnapshot, options.previewExpected, options.opener, options.customizerHandoff, options.openDialog);
    }

    window.addEventListener("message", function (event) {
      var data = event.data || {};
      if (data.type === "saloni-preview-request") {
        handlePreviewRequest(event, data);
        return;
      }
      if (!frameState.loaded || !frameState.nonce || data.nonce !== frameState.nonce || !event.source || !event.origin || event.origin === "null") return;
      var messageOrigin = previewOrigin(event.origin);
      if (!messageOrigin) return;
      if (data.type === "saloni-order-save-repeat-profile") {
        if (data.version !== REPEAT_PROFILE_VERSION || !isCurrentFormSource(event.source) || event.source !== frameState.pinnedSender || messageOrigin !== frameState.pinnedOrigin) return;
        saveRepeatProfile(data.profile);
        return;
      }
      if (data.type === "saloni-order-form-ready") {
        // Apps Script may deliver the form message from a nested child WindowProxy.
        if (!isCurrentFormSource(event.source)) return;
        if (!frameState.pinnedSender) {
          frameState.pinnedSender = event.source;
          frameState.pinnedOrigin = messageOrigin;
        }
        if (event.source !== frameState.pinnedSender || messageOrigin !== frameState.pinnedOrigin) return;
        if (typeof data.siteKey === "string" && data.siteKey.length > 0 && data.siteKey.length <= 200) frameState.siteKey = data.siteKey;
        finishOrderFormLoading();
        return;
      }
      if (data.type === "saloni-review-submitted") {
        if (frameState.mode !== "review" || !isCurrentFormSource(event.source) || event.source !== frameState.pinnedSender || messageOrigin !== frameState.pinnedOrigin) return;
        loadReviewPage(false);
        return;
      }
      if (!isCurrentFormSource(event.source) || event.source !== frameState.pinnedSender || messageOrigin !== frameState.pinnedOrigin || data.type !== "saloni-order-captcha-request" || typeof data.attemptId !== "string" || !event.ports || !event.ports[0] || frameState.activeCaptcha) return;
      var request = { attemptId: data.attemptId, port: event.ports[0], timer: null };
      frameState.activeCaptcha = request;
      request.timer = window.setTimeout(function () { postCaptchaResult(request, false, ""); }, 30000);
      executeParentCaptcha(request);
    });

    var REVIEWS_UNAVAILABLE = "Reviews could not be loaded right now. Please try again later.";
    var REVIEW_CONTACT = "<a href=\"https://www.instagram.com/saloniresin_art_studio/\" target=\"_blank\" rel=\"noreferrer\">@saloniresin_art_studio</a> or call <a href=\"tel:+918209238541\">8209238541</a>";
    var REVIEW_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // Public reads use a plain GET with no custom headers, so the browser sends no preflight request.
    function fetchPublicReviews(done) {
      var finished = false;
      var timer = null;
      function finish(data) {
        if (finished) return;
        finished = true;
        if (timer) window.clearTimeout(timer);
        done(data);
      }
      if (!configured || typeof window.fetch !== "function") { finish(null); return; }
      timer = window.setTimeout(function () { finish(null); }, 15000);
      try {
        window.fetch(orderUrl + "?action=reviews", { credentials: "omit", cache: "no-store" })
          .then(function (response) { return response.json(); })
          .then(function (data) { finish(data && data.ok === true && data.summary && Array.isArray(data.reviews) ? data : null); })
          .catch(function () { finish(null); });
      } catch (error) { finish(null); }
    }

    function formatReviewDate(value) {
      var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
      var month = match ? Number(match[2]) : 0;
      return month >= 1 && month <= 12 ? Number(match[3]) + " " + REVIEW_MONTHS[month - 1] + " " + match[1] : "";
    }

    function reviewText(value, maxLength) {
      return typeof value === "string" ? value.slice(0, maxLength) : "";
    }

    function reviewSpan(className, text) {
      var span = document.createElement("span");
      span.className = className;
      span.textContent = text;
      return span;
    }

    function reviewPhoto(id, number, label) {
      if (typeof id !== "string" || !/^[A-Za-z0-9_-]{20,100}$/.test(id)) return null;
      var link = document.createElement("a");
      link.href = "https://lh3.googleusercontent.com/d/" + id + "=w1600";
      link.target = "_blank";
      link.rel = "noreferrer";
      var image = document.createElement("img");
      image.setAttribute("loading", "lazy");
      image.setAttribute("decoding", "async");
      image.setAttribute("referrerpolicy", "no-referrer");
      image.setAttribute("alt", "Customer photo " + number + " for " + label);
      var failures = 0;
      image.addEventListener("error", function () {
        failures += 1;
        if (failures === 1) {
          image.src = "https://drive.google.com/thumbnail?id=" + id + "&sz=w800";
          link.href = "https://drive.google.com/thumbnail?id=" + id + "&sz=w1600";
        } else if (link.remove) link.remove();
      });
      image.src = "https://lh3.googleusercontent.com/d/" + id + "=w800";
      link.appendChild(image);
      return link;
    }

    // Review text is untrusted: every value reaches the page through textContent, never markup.
    function reviewCard(item) {
      if (!item || typeof item !== "object") return null;
      var rating = item.rating;
      var name = reviewText(item.firstName, 40);
      if (typeof rating !== "number" || Math.floor(rating) !== rating || rating < 1 || rating > 5 || !name) return null;
      var city = reviewText(item.city, 60);
      var productName = reviewText(item.productName, 120);
      var card = document.createElement("li");
      card.className = "review-card";
      var head = document.createElement("div");
      head.className = "review-head";
      var stars = reviewSpan("review-stars", "\u2605\u2605\u2605\u2605\u2605".slice(0, rating) + "\u2606\u2606\u2606\u2606\u2606".slice(0, 5 - rating));
      stars.setAttribute("aria-hidden", "true");
      head.appendChild(stars);
      head.appendChild(reviewSpan("sr-only", "Rated " + rating + " out of 5"));
      head.appendChild(reviewSpan("review-date", formatReviewDate(item.date)));
      var meta = document.createElement("p");
      meta.className = "review-meta";
      meta.appendChild(reviewSpan("review-author", city ? name + ", " + city : name));
      meta.appendChild(reviewSpan("review-product", productName || "Studio review"));
      var comment = document.createElement("p");
      comment.className = "review-comment";
      comment.textContent = reviewText(item.comment, 2000);
      card.appendChild(head);
      card.appendChild(meta);
      card.appendChild(comment);
      var photoRow = document.createElement("div");
      photoRow.className = "review-photos";
      var photoIds = Array.isArray(item.photos) ? item.photos.slice(0, 3) : [];
      var shown = 0;
      photoIds.forEach(function (id) {
        var photo = reviewPhoto(id, shown + 1, productName || "the studio");
        if (!photo) return;
        shown += 1;
        photoRow.appendChild(photo);
      });
      if (shown) card.appendChild(photoRow);
      return card;
    }

    function renderReviews(data) {
      var list = document.getElementById("reviews-list");
      var summary = document.getElementById("reviews-summary");
      var statusLine = document.getElementById("reviews-status");
      if (!list || !statusLine) return;
      while (list.firstChild) list.removeChild(list.firstChild);
      var shown = 0;
      data.reviews.forEach(function (item) {
        var card = reviewCard(item);
        if (!card) return;
        list.appendChild(card);
        shown += 1;
      });
      var count = Number(data.summary.count);
      var average = Number(data.summary.average);
      if (summary) {
        summary.hidden = !(shown && isFinite(count) && count > 0 && isFinite(average));
        if (!summary.hidden) summary.textContent = average.toFixed(1) + " out of 5 \u00b7 " + count + (count === 1 ? " review" : " reviews");
      }
      statusLine.textContent = shown ? "" : "No reviews yet. Be the first to share yours.";
      statusLine.hidden = Boolean(shown);
    }

    // The form is loaded only after the backend answers JSON with intake "open"; anything else stays calm.
    function loadReviewPage(firstLoad) {
      fetchPublicReviews(function (data) {
        var statusLine = document.getElementById("reviews-status");
        if (!data) {
          if (!firstLoad) return;
          if (statusLine) { statusLine.textContent = REVIEWS_UNAVAILABLE; statusLine.hidden = false; }
          var summary = document.getElementById("reviews-summary");
          if (summary) summary.hidden = true;
          status.innerHTML = "You can still message " + REVIEW_CONTACT + " to share your review.";
          status.hidden = false;
          return;
        }
        renderReviews(data);
        if (!firstLoad) return;
        if (data.intake === "open") {
          submitSeed({ sourceKind: "review", sourceId: "review", productName: "", reviewId: requestId() }, false);
          return;
        }
        status.innerHTML = "New reviews are paused right now. You can message " + REVIEW_CONTACT + ".";
        status.hidden = false;
      });
    }

    if (frameState.mode === "review") {
      loadReviewPage(true);
      return;
    }
    if (frameState.mode === "corporate" && !corporateIntakeReady) {
      status.innerHTML = "Corporate gifting enquiries are being prepared. For a current large-order enquiry, call Saloni at <a href=\"tel:+918209238541\">8209238541</a> or message <a href=\"https://www.instagram.com/saloniresin_art_studio/\" target=\"_blank\" rel=\"noreferrer\">@saloniresin_art_studio</a>.";
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

    var selectedCatalogueItems = [];
    var catalogueButtons = [];
    var CATALOGUE_CART_STORAGE_KEY = "saloniCatalogueCart";
    var REPEAT_PROFILE_STORAGE_KEY = "saloniRepeatProfile";
    var REPEAT_PROFILE_VERSION = 1;
    var REPEAT_PROFILE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
    var catalogueCartExpiresAt = 0;

    function catalogueCartStorage() {
      try { return window.localStorage || null; } catch (error) { return null; }
    }

    function repeatProfileText(value, maxLength, required) {
      if (value === undefined && !required) return "";
      if (typeof value !== "string") return null;
      var text = value.trim();
      if (text.length > maxLength || (required && !text)) return null;
      return text;
    }

    function normalizeRepeatProfile(profile) {
      if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
      var customerName = repeatProfileText(profile.customerName, 120, true);
      var phone = repeatProfileText(profile.phone, 40, true);
      var fulfillment = repeatProfileText(profile.fulfillment, 20, true);
      var shippingAddress = repeatProfileText(profile.shippingAddress, 300, false);
      var city = repeatProfileText(profile.city, 100, false);
      var state = repeatProfileText(profile.state, 100, false);
      var pin = repeatProfileText(profile.pin, 6, true);
      if (!customerName || !phone || !/\d/.test(phone) || (phone.match(/\d/g) || []).length < 7 || ["shipping", "pickup"].indexOf(fulfillment) === -1 || shippingAddress === null || city === null || state === null || !pin || !/^\d{6}$/.test(pin)) return null;
      return {
        customerName: customerName, phone: phone, fulfillment: fulfillment,
        shippingAddress: fulfillment === "shipping" ? shippingAddress : "",
        city: fulfillment === "shipping" ? city : "", state: fulfillment === "shipping" ? state : "", pin: pin
      };
    }

    function readRepeatProfile() {
      var storage = catalogueCartStorage();
      if (!storage) return null;
      var raw;
      try { raw = storage.getItem(REPEAT_PROFILE_STORAGE_KEY); } catch (error) { return null; }
      if (!raw || raw.length > 5000) {
        try { storage.removeItem(REPEAT_PROFILE_STORAGE_KEY); } catch (error) {}
        return null;
      }
      var record;
      try { record = JSON.parse(raw); } catch (error) { record = null; }
      var expiresAt = Number(record && record.expiresAt);
      var now = Date.now();
      var profile = record && record.version === REPEAT_PROFILE_VERSION ? normalizeRepeatProfile(record.profile) : null;
      if (!profile || !Number.isInteger(expiresAt) || expiresAt <= now || expiresAt > now + REPEAT_PROFILE_TTL_MS) {
        try { storage.removeItem(REPEAT_PROFILE_STORAGE_KEY); } catch (error) {}
        return null;
      }
      return profile;
    }

    function saveRepeatProfile(profile) {
      var normalized = normalizeRepeatProfile(profile);
      if (!normalized) return false;
      var storage = catalogueCartStorage();
      if (!storage) return false;
      try {
        storage.setItem(REPEAT_PROFILE_STORAGE_KEY, JSON.stringify({ version: REPEAT_PROFILE_VERSION, expiresAt: Date.now() + REPEAT_PROFILE_TTL_MS, profile: normalized }));
        return true;
      } catch (error) { return false; }
    }

    function persistCatalogueSelection() {
      var storage = catalogueCartStorage();
      if (!storage) return;
      try {
        if (!selectedCatalogueItems.length) {
          catalogueCartExpiresAt = 0;
          storage.removeItem(CATALOGUE_CART_STORAGE_KEY);
          return;
        }
        if (!Number.isInteger(catalogueCartExpiresAt) || catalogueCartExpiresAt <= Date.now()) catalogueCartExpiresAt = Date.now() + REPEAT_PROFILE_TTL_MS;
        storage.setItem(CATALOGUE_CART_STORAGE_KEY, JSON.stringify({
          version: 1,
          expiresAt: catalogueCartExpiresAt,
          items: selectedCatalogueItems.map(function (item) {
            var saved = { sourceId: item.sourceId, quantity: bundleQuantity(item) };
            if (item.photo) saved.photo = item.photo;
            return saved;
          })
        }));
      } catch (error) {}
    }

    function readPersistedCatalogueSelection() {
      var storage = catalogueCartStorage();
      if (!storage) return [];
      var raw;
      try { raw = storage.getItem(CATALOGUE_CART_STORAGE_KEY); } catch (error) { return []; }
      if (!raw || raw.length > 10000) {
        try { storage.removeItem(CATALOGUE_CART_STORAGE_KEY); } catch (error) {}
        return [];
      }
      var parsed;
      try { parsed = JSON.parse(raw); } catch (error) {
        try { storage.removeItem(CATALOGUE_CART_STORAGE_KEY); } catch (removeError) {}
        return [];
      }
      var expiresAt = Number(parsed && parsed.expiresAt);
      var now = Date.now();
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items) || !Number.isInteger(expiresAt) || expiresAt <= now || expiresAt > now + REPEAT_PROFILE_TTL_MS) {
        try { storage.removeItem(CATALOGUE_CART_STORAGE_KEY); } catch (error) {}
        return [];
      }
      catalogueCartExpiresAt = expiresAt;
      return parsed.items;
    }

    function markCatalogueSelectionChanged() { catalogueCartExpiresAt = Date.now() + REPEAT_PROFILE_TTL_MS; }

    function setCatalogueSelectionStatus(message) {
      if (!catalogueSelectionStatus) return;
      catalogueSelectionStatus.textContent = message || "";
      catalogueSelectionStatus.hidden = !message;
    }

    function renderCatalogueSelectionPreviews() {
      if (!catalogueSelectionPreviews) return;
      while (catalogueSelectionPreviews.firstChild) catalogueSelectionPreviews.removeChild(catalogueSelectionPreviews.firstChild);
      selectedCatalogueItems.slice(0, 3).forEach(function (item) {
        if (!item.imageSrc) return;
        var image = document.createElement("img");
        image.setAttribute("src", item.imageSrc);
        image.setAttribute("alt", "");
        image.setAttribute("loading", "lazy");
        image.setAttribute("decoding", "async");
        catalogueSelectionPreviews.appendChild(image);
      });
      if (selectedCatalogueItems.length > 3) {
        var excess = document.createElement("span");
        excess.textContent = "+" + (selectedCatalogueItems.length - 3);
        excess.setAttribute("aria-hidden", "true");
        catalogueSelectionPreviews.appendChild(excess);
      }
    }

    function bundleQuantity(item) {
      var quantity = Number(item && item.quantity);
      return Number.isInteger(quantity) && quantity >= 1 && quantity <= 100 ? quantity : 1;
    }

    function bundleTotal(items) {
      return items.reduce(function (total, item) { return total + bundleQuantity(item); }, 0);
    }

    function cataloguePriceFrom(price) {
      var text = String(price || "");
      var match = text.match(/₹\s*([\d,]+(?:\.\d+)?)/);
      var amount = match ? Number(match[1].replace(/,/g, "")) : NaN;
      return isFinite(amount) ? { amount: amount, isRange: text.indexOf("–") !== -1 } : null;
    }

    function formatRupees(amount) {
      return "₹" + amount.toLocaleString("en-IN");
    }

    function catalogueLinePriceText(item) {
      var parsed = cataloguePriceFrom(item.price);
      if (!parsed) return "Price on request";
      var from = parsed.isRange ? "from " : "";
      var quantity = bundleQuantity(item);
      return from + formatRupees(parsed.amount) + " × " + quantity + " = " + from + formatRupees(parsed.amount * quantity);
    }

    function catalogueEstimatedTotalText(items) {
      var sum = 0;
      var priced = 0;
      var anyRange = false;
      var units = [];
      items.forEach(function (item) {
        var parsed = cataloguePriceFrom(item.price);
        if (!parsed) return;
        priced += 1;
        sum += parsed.amount * bundleQuantity(item);
        for (var unit = 0; unit < bundleQuantity(item); unit += 1) units.push(parsed.amount);
        if (parsed.isRange) anyRange = true;
      });
      if (!items.length) return "";
      if (!priced) return "Estimated total: price on request";
      var rest = priced < items.length ? " (plus price-on-request items)" : "";
      var offerBar = document.getElementById("diwali-offer-bar");
      if (!offerBar || offerBar.hidden) return "Estimated total: " + (anyRange ? "from " : "") + formatRupees(sum) + " + shipping" + rest;
      // Diwali buy 2, get 1 free: one gift free for every three, and the free ones are the lowest-priced.
      var free = units.sort(function (a, b) { return a - b; }).slice(0, Math.floor(units.length / 3)).reduce(function (total, amount) { return total + amount; }, 0);
      return "Estimated total: " + (anyRange ? "from " : "") + formatRupees(sum - free) + " + free shipping (Diwali offer: " + (free ? formatRupees(free) + " off, buy 2 get 1 free)" : "buy 2, get 1 free)") + rest;
    }

    function catalogueWhatsappHref(items) {
      var base = "https://wa.me/918209238541";
      if (!items.length) return base;
      var lines = items.map(function (item) {
        var parsed = cataloguePriceFrom(item.price);
        var quantity = bundleQuantity(item);
        var price = parsed ? (parsed.isRange ? "from " : "") + formatRupees(parsed.amount) + " × " + quantity : "Price on request × " + quantity;
        return "- " + [item.productName, item.size, price].filter(Boolean).join(" \u00b7 ");
      });
      var message = "Hi Saloni Resin Art Studio, I would like to order:\n" + lines.join("\n") + "\n" + catalogueEstimatedTotalText(items);
      return base + "?text=" + encodeURIComponent(message);
    }

    function renderCatalogueSelectionItems() {
      if (!catalogueSelectionItems) return;
      while (catalogueSelectionItems.firstChild) catalogueSelectionItems.removeChild(catalogueSelectionItems.firstChild);
      selectedCatalogueItems.forEach(function (item) {
        var line = document.createElement("div");
        line.className = "catalogue-selection-item";
        line.setAttribute("data-product-name", item.productName);
        var name = document.createElement("span");
        name.className = "catalogue-selection-item-name";
        name.textContent = item.productName;
        var label = document.createElement("label");
        var inputId = "catalogue-quantity-" + item.sourceId.replace(/[^A-Za-z0-9_-]/g, "-");
        label.setAttribute("for", inputId);
        label.textContent = "Quantity";
        var input = document.createElement("input");
        input.id = inputId;
        input.type = "number";
        input.min = "1";
        input.max = "100";
        input.step = "1";
        input.inputMode = "numeric";
        input.value = String(bundleQuantity(item));
        input.setAttribute("aria-label", "Quantity for " + item.productName);
        input.addEventListener("change", function () {
          var requested = String(input.value || "").trim();
          var nextQuantity = /^\d+$/.test(requested) ? Number(requested) : NaN;
          var previous = bundleQuantity(item);
          if (!Number.isInteger(nextQuantity) || nextQuantity < 1 || nextQuantity > 100) {
            input.value = String(previous);
            setCatalogueSelectionStatus("Each quantity must be a whole number from 1 to 100.");
            return;
          }
          item.quantity = nextQuantity;
          if (bundleTotal(selectedCatalogueItems) > 100) {
            item.quantity = previous;
            input.value = String(previous);
            setCatalogueSelectionStatus("The total selected quantity must be from 1 to 100.");
            return;
          }
          if (bundleDetails(selectedCatalogueItems).length > 2000) {
            item.quantity = previous;
            input.value = String(previous);
            setCatalogueSelectionStatus("Those quantities make the selected list too long. Lower a quantity before continuing.");
            return;
          }
          setCatalogueSelectionStatus("");
          markCatalogueSelectionChanged();
          updateCatalogueSelection();
          prepareCatalogueSelection();
        });
        var linePrice = document.createElement("span");
        linePrice.className = "catalogue-selection-item-price";
        linePrice.textContent = catalogueLinePriceText(item);
        var removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "catalogue-selection-item-remove";
        removeButton.textContent = "×";
        removeButton.setAttribute("aria-label", "Remove " + item.productName + " from cart");
        removeButton.addEventListener("click", function () {
          var index = selectedCatalogueItems.indexOf(item);
          if (index === -1) return;
          selectedCatalogueItems.splice(index, 1);
          setCatalogueSelectionStatus("");
          markCatalogueSelectionChanged();
          updateCatalogueSelection();
          if (selectedCatalogueItems.length) prepareCatalogueSelection();
          else clearPreparedCatalogueRequest();
        });
        label.appendChild(input);
        line.appendChild(name);
        line.appendChild(label);
        line.appendChild(removeButton);
        line.appendChild(linePrice);
        catalogueSelectionItems.appendChild(line);
      });
    }

    function updateCatalogueSelection() {
      var count = selectedCatalogueItems.length;
      persistCatalogueSelection();
      if (catalogueSelection) catalogueSelection.hidden = count === 0;
      if (catalogueRequestSelected) catalogueRequestSelected.disabled = count === 0;
      renderCatalogueSelectionPreviews();
      renderCatalogueSelectionItems();
      if (catalogueSelectionTotal) catalogueSelectionTotal.textContent = catalogueEstimatedTotalText(selectedCatalogueItems);
      var whatsappHref = catalogueWhatsappHref(selectedCatalogueItems);
      catalogueWhatsappLinks.forEach(function (link) { link.setAttribute("href", whatsappHref); });
      if (catalogueCartJump) {
        catalogueCartJump.hidden = count === 0;
      }
      if (catalogueCartCount) catalogueCartCount.textContent = count ? count + " selected" : "";
      if (catalogueCartView) catalogueCartView.setAttribute("data-count", String(count));
      if (headerCart) {
        headerCart.hidden = count === 0;
        headerCart.setAttribute("aria-label", count ? "View cart, " + count + (count === 1 ? " item" : " items") : "View cart");
      }
      if (headerCartCount) headerCartCount.textContent = count ? String(count) : "";
      if (catalogueCartOrder) catalogueCartOrder.disabled = count === 0;
      if (catalogueSelectionSummary) {
        if (!count) catalogueSelectionSummary.textContent = "No gifts selected.";
        else {
          var titles = selectedCatalogueItems.map(function (item) { return item.productName; });
          catalogueSelectionSummary.textContent = count + (count === 1 ? " item selected: " : " items selected: ") + titles.join(", ");
        }
      }
      catalogueButtons.forEach(function (button) {
        var selected = selectedCatalogueItems.some(function (item) { return item.sourceId === button.__saloniCatalogueSourceId; });
        button.textContent = selected ? "Remove from cart" : "Add to cart";
        button.setAttribute("aria-pressed", String(selected));
        button.setAttribute("aria-label", (selected ? "Remove " : "Add ") + (button.__saloniCatalogueTitle || "item") + (selected ? " from cart" : " to cart"));
      });
    }

    function resetCatalogueSelection() {
      selectedCatalogueItems = [];
      clearPreparedCatalogueRequest();
      setCatalogueSelectionStatus("");
      updateCatalogueSelection();
    }

    function sortedBundleItems(items) {
      return items.slice().sort(function (left, right) { return left.sourceId.localeCompare(right.sourceId); });
    }

    function bundleProductName(items) {
      var sorted = sortedBundleItems(items);
      return sorted[0].productName + (sorted.length > 1 ? " + " + (sorted.length - 1) + " more" : "");
    }

    function bundleDetails(items) {
      return sortedBundleItems(items).map(function (item) {
        return [item.productName, item.size, item.price, "Qty " + bundleQuantity(item)].filter(Boolean).join(" \u00b7 ");
      }).join("\n");
    }

    function catalogueSelectionKey(items) {
      return sortedBundleItems(items).map(function (item) { return item.sourceId + ":" + bundleQuantity(item) + (item.photo ? ":" + item.photo : ""); }).join("|");
    }

    function prepareCatalogueSelection() {
      if (!configured || !selectedCatalogueItems.length) return false;
      var items = selectedCatalogueItems.slice();
      var key = catalogueSelectionKey(items);
      if (frameState.loaded && frameState.sourceKind === "catalogue" && frameState.catalogueSeedKey === key) return true;
      var prepared = chooseSource({
        sourceKind: "catalogue", sourceId: "catalogue:multi-item", productName: bundleProductName(items),
        quantity: String(bundleTotal(items)), designDetails: bundleDetails(items), bundleItems: items
      }, { openDialog: false });
      if (prepared) frameState.catalogueSeedKey = key;
      return prepared;
    }

    function openCatalogueSelectionRequest(items, opener) {
      var requestOpener = opener || catalogueRequestSelected;
      var key = catalogueSelectionKey(items);
      if (frameState.loaded && frameState.sourceKind === "catalogue" && frameState.catalogueSeedKey === key) {
        if (continueOrderButton) continueOrderButton.hidden = false;
        if (orderDialogEnabled) openOrderDialog(requestOpener, true);
        else scrollToForm();
        return true;
      }
      return chooseSource({
        sourceKind: "catalogue", sourceId: "catalogue:multi-item", productName: bundleProductName(items),
        quantity: String(bundleTotal(items)), designDetails: bundleDetails(items), bundleItems: items
      }, { opener: requestOpener });
    }

    function toggleCatalogueSelection(seed) {
      var existingIndex = selectedCatalogueItems.findIndex(function (item) { return item.sourceId === seed.sourceId; });
      if (existingIndex !== -1) {
        selectedCatalogueItems.splice(existingIndex, 1);
        setCatalogueSelectionStatus("");
        markCatalogueSelectionChanged();
        updateCatalogueSelection();
        if (selectedCatalogueItems.length) prepareCatalogueSelection();
        else clearPreparedCatalogueRequest();
        return;
      }
      var nextItems = selectedCatalogueItems.concat([seed]);
      if (bundleTotal(nextItems) > 100 || bundleDetails(nextItems).length > 2000) {
        setCatalogueSelectionStatus("That item cannot be added because the selected list is full. Remove an item before adding another.");
        return;
      }
      selectedCatalogueItems = nextItems;
      setCatalogueSelectionStatus("");
      markCatalogueSelectionChanged();
      updateCatalogueSelection();
      prepareCatalogueSelection();
    }

    function catalogueSeed(card) {
      var image = card.querySelector("img[src]");
      var title = card.querySelector("figcaption strong") || card.querySelector("figcaption h3");
      if (!image || !title) return null;
      var sourceId = "catalogue:" + image.getAttribute("src").replace(/^assets\//, "");
      var details = Array.prototype.map.call(card.querySelectorAll("figcaption p"), function (node) { return node.textContent.trim(); }).join(" ");
      var cardCopy = (card.textContent || "") + " " + (image.alt || "");
      if (/concept preview|illustrative preview|reference image|reference design|gifting concept/i.test(cardCopy)) details += (details ? " " : "") + "Illustrative/reference image; final design to confirm with Saloni.";
      var pricingDetails = Array.prototype.map.call(card.querySelectorAll(".product-pricing > div"), function (row) {
        var priceLabel = row.querySelector("dt");
        var priceValue = row.querySelector("dd");
        return priceLabel && priceValue ? priceLabel.textContent.trim() + ": " + priceValue.textContent.trim() : "";
      }).filter(function (detail) { return detail; });
      if (pricingDetails.length) details += (details ? " " : "") + pricingDetails.join(" ");
      var price = pricingDetails.map(function (detail) { return /^(?:price|from):\s*/i.test(detail) ? detail.replace(/^(?:price|from):\s*/i, "") : ""; }).filter(Boolean)[0] || "";
      var size = pricingDetails.map(function (detail) { return /^size:\s*/i.test(detail) ? detail.replace(/^size:\s*/i, "") : ""; }).filter(Boolean)[0] || "";
      return Object.assign(sourceSeed({ sourceKind: "catalogue", sourceId: sourceId, productName: title.textContent.trim(), designDetails: details }), { price: price, size: size, imageSrc: image.getAttribute("src"), aiImages: aiImageNames(card.querySelector("[data-lightbox-trigger]")) });
    }

    // A colour idea only counts when the card offers it; "styled" shows the same design, so it stays as shown.
    function offeredPhotoName(seed, name) {
      return typeof name === "string" && name !== "styled" && seed.aiImages.indexOf(name) !== -1 ? name : "";
    }

    // The photo the shopper had on show: the lightbox hands it over once, else the card's photo strip.
    function chosenPhotoName(button, card, seed) {
      var name = button.__saloniChosenPhoto;
      button.__saloniChosenPhoto = null;
      if (typeof name !== "string") {
        var trigger = card.querySelector("[data-lightbox-trigger]");
        name = trigger ? trigger.__saloniPhotoName : "";
      }
      return offeredPhotoName(seed, name);
    }

    // The seed for the chosen colour photo: its name, thumbnail and photo on the order line. Empty means as shown.
    function withPhoto(seed, name) {
      if (!name) return Object.assign({}, seed, { photo: "" });
      var photo = aiPhoto(seed.imageSrc, name);
      return Object.assign({}, seed, { photo: name, productName: seed.productName + " (colour: " + photo.colour + ")", imageSrc: photo.src });
    }

    var quoteCards = Array.prototype.slice.call(document.querySelectorAll("#premium-collection .work-card"));
    document.querySelectorAll(".catalogue-grid .work-card, .catalogue-grid .romantic-keepsake-card").forEach(function (card) {
      var seed = catalogueSeed(card);
      var caption = card.querySelector("figcaption");
      if (!seed || !caption || caption.querySelector("[data-order-prefill]")) return;
      var button = document.createElement("button");
      if (quoteCards.indexOf(card) !== -1) {
        button.type = "button"; button.className = "catalogue-order-button"; button.setAttribute("data-order-prefill", "quote");
        button.textContent = "Ask for a quote";
        button.setAttribute("aria-label", "Ask for a quote for " + seed.productName);
        button.addEventListener("click", function () {
          chooseSource(Object.assign({}, withPhoto(seed, chosenPhotoName(button, card, seed)), { quantity: "1" }), { opener: button, card: card });
        });
        caption.appendChild(button);
        return;
      }
      button.type = "button"; button.className = "catalogue-order-button"; button.setAttribute("data-order-prefill", "catalogue");
      button.__saloniCatalogueSourceId = seed.sourceId;
      button.__saloniCatalogueTitle = seed.productName;
      button.__saloniCatalogueSeed = seed;
      catalogueButtons.push(button);
      button.textContent = "Add to cart";
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-label", "Add " + seed.productName + " to cart");
      button.addEventListener("click", function () {
        toggleCatalogueSelection(withPhoto(seed, chosenPhotoName(button, card, seed)));
      });
      caption.appendChild(button);
    });

    function restoreCatalogueSelection() {
      var seedsBySourceId = Object.create(null);
      catalogueButtons.forEach(function (button) { seedsBySourceId[button.__saloniCatalogueSourceId] = button.__saloniCatalogueSeed; });
      var restored = [];
      var seen = Object.create(null);
      readPersistedCatalogueSelection().forEach(function (entry) {
        if (!entry || typeof entry.sourceId !== "string" || seen[entry.sourceId] || !seedsBySourceId[entry.sourceId]) return;
        var quantity = Number(entry.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return;
        var item = Object.assign(withPhoto(seedsBySourceId[entry.sourceId], offeredPhotoName(seedsBySourceId[entry.sourceId], entry.photo)), { quantity: quantity });
        var candidate = restored.concat([item]);
        if (bundleTotal(candidate) > 100 || bundleDetails(candidate).length > 2000) return;
        seen[entry.sourceId] = true;
        restored.push(item);
      });
      selectedCatalogueItems = restored;
      updateCatalogueSelection();
    }

    restoreCatalogueSelection();

    function requestSelectedCatalogueItems(opener) {
      if (!selectedCatalogueItems.length) return;
      var items = selectedCatalogueItems.slice();
      if (bundleTotal(items) > 100) {
        setCatalogueSelectionStatus("The total selected quantity must be from 1 to 100.");
        return;
      }
      if (bundleDetails(items).length > 2000) {
        setCatalogueSelectionStatus("The selected list is too long. Lower a quantity before continuing.");
        return;
      }
      openCatalogueSelectionRequest(items, opener || catalogueRequestSelected);
    }

    if (catalogueRequestSelected) catalogueRequestSelected.addEventListener("click", function () {
      requestSelectedCatalogueItems(catalogueRequestSelected);
    });
    if (catalogueCartOrder) catalogueCartOrder.addEventListener("click", function () {
      requestSelectedCatalogueItems(catalogueCartOrder);
    });

    function viewCatalogueCart() {
      if (!catalogueSelection || catalogueSelection.hidden) return;
      catalogueSelection.scrollIntoView({ behavior: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      catalogueSelection.focus({ preventScroll: true });
    }
    if (catalogueCartView) catalogueCartView.addEventListener("click", viewCatalogueCart);
    if (headerCart) headerCart.addEventListener("click", viewCatalogueCart);

    function clearCustomizerFallback() {
      frameState.customizerFallback = null;
      if (continueCustomizerButton) continueCustomizerButton.hidden = true;
      if (customizerRequestStatus && /Preview could not be prepared|Automatic preview/.test(customizerRequestStatus.textContent || "")) customizerRequestStatus.textContent = "";
    }

    function notifyCustomizerRequestOutcome(outcome) {
      if (window && typeof window.saloniCustomizerRequestOutcome === "function") window.saloniCustomizerRequestOutcome(outcome);
    }

    function reportCustomizerFailure(error, identity) {
      var fallback = error && error.previewFallback;
      frameState.customizerFallback = fallback && identity && fallback.requestId === identity.requestId && fallback.nonce === identity.nonce && fallback.mode === frameState.mode && usablePreviewDetails(fallback.summary, fallback.dimensions) ? fallback : null;
      if (customizerRequestStatus) {
        customizerRequestStatus.textContent = frameState.customizerFallback
          ? "Preview could not be prepared. Request this design again, or choose Continue without preview."
          : "Automatic preview is unavailable. Request this design again, or use Let Saloni design it for me.";
      } else {
        status.textContent = frameState.customizerFallback
          ? "Preview could not be prepared. Request this design again, or choose Continue without preview."
          : "Automatic preview is unavailable. Request this design again, or use Let Saloni design it for me.";
        status.hidden = false;
      }
      if (continueCustomizerButton) continueCustomizerButton.hidden = !frameState.customizerFallback;
    }

    function visibleCustomizerRequestControl(fallback) {
      var controls = [document.getElementById("order-from-customizer"), document.getElementById("customizer-mobile-request")];
      for (var index = 0; index < controls.length; index += 1) {
        if (controls[index] && !controls[index].hidden && typeof controls[index].focus === "function") return controls[index];
      }
      return fallback;
    }

    function continueCustomizerWithoutPreview(event) {
      if (event && event.preventDefault) event.preventDefault();
      var fallback = frameState.customizerFallback;
      if (!fallback || !usablePreviewDetails(fallback.summary, fallback.dimensions)) return;
      var identity = { requestId: fallback.requestId, nonce: fallback.nonce };
      var opener = visibleCustomizerRequestControl(continueCustomizerButton);
      clearCustomizerFallback();
      var handedOff = chooseSource({
        sourceKind: "customizer", sourceId: "customizer:resin-frame", productName: "Custom resin frame",
        height: fallback.dimensions.height, width: fallback.dimensions.width, heightUnit: fallback.dimensions.heightUnit, widthUnit: fallback.dimensions.widthUnit,
        designDetails: fallback.summary, requestId: identity.requestId
      }, { identity: identity, requestId: identity.requestId, previewExpected: false, opener: opener, customizerHandoff: true });
      notifyCustomizerRequestOutcome(handedOff ? "success" : "failure");
    }

    if (continueCustomizerButton) continueCustomizerButton.addEventListener("click", continueCustomizerWithoutPreview);

    function startCustomizerRequest(event, opener) {
      if (event && event.__saloniCustomizerRequestStarted) return;
      if (event) {
        event.__saloniCustomizerRequestStarted = true;
        if (event.preventDefault) event.preventDefault();
      }
      var requestOpener = opener || (event && event.target) || null;
      resetCatalogueSelection();
      clearSelectedProductSummary();
      clearCustomizerFallback();
      var identity = { requestId: requestId(), nonce: channelNonce() };
      if (!identity.requestId || !identity.nonce || typeof window.saloniCustomizerCapture !== "function") {
        reportCustomizerFailure(null, identity);
        notifyCustomizerRequestOutcome("failure");
        return;
      }
      frameState.pendingCustomizerRequestId = identity.requestId;
      var capture;
      try {
        capture = window.saloniCustomizerCapture({ requestId: identity.requestId, nonce: identity.nonce, mode: frameState.mode });
      } catch (error) {
        capture = Promise.reject(error);
      }
      var accept = function (snapshot) {
        if (frameState.pendingCustomizerRequestId !== identity.requestId) return;
        frameState.pendingCustomizerRequestId = "";
        if (!snapshot || snapshot.requestId !== identity.requestId || snapshot.nonce !== identity.nonce || snapshot.mode !== frameState.mode || !usablePreviewSnapshot(snapshot)) {
          reportCustomizerFailure(null);
          notifyCustomizerRequestOutcome("failure");
          return;
        }
        clearCustomizerFallback();
        var handedOff = chooseSource({
          sourceKind: "customizer", sourceId: "customizer:resin-frame", productName: "Custom resin frame",
          height: snapshot.dimensions.height, width: snapshot.dimensions.width, heightUnit: snapshot.dimensions.heightUnit, widthUnit: snapshot.dimensions.widthUnit,
          designDetails: snapshot.summary, previewSnapshot: snapshot, requestId: identity.requestId
        }, { identity: identity, requestId: identity.requestId, previewSnapshot: snapshot, previewExpected: true, opener: requestOpener, customizerHandoff: true });
        notifyCustomizerRequestOutcome(handedOff ? "success" : "failure");
      };
      var reject = function (error) {
        if (frameState.pendingCustomizerRequestId !== identity.requestId) return;
        frameState.pendingCustomizerRequestId = "";
        reportCustomizerFailure(error, identity);
        notifyCustomizerRequestOutcome("failure");
      };
      if (capture && typeof capture.then === "function") Promise.resolve(capture).then(accept, reject);
      else accept(capture);
    }

    document.addEventListener("click", function (event) {
      var target = event && event.target;
      if (target && target.id === "customizer-mobile-request") {
        pendingMobileCustomizerOpener = target;
        return;
      }
      if (target && target.id === "order-from-customizer") {
        var opener = pendingMobileCustomizerOpener || target;
        pendingMobileCustomizerOpener = null;
        startCustomizerRequest(event, opener);
      }
    }, true);

    var customizerButton = document.querySelector("[data-order-prefill=\"customizer\"]");
    if (customizerButton) {
      customizerButton.addEventListener("click", function (event) {
        if (event && event.__saloniCustomizerRequestStarted) return;
        startCustomizerRequest(event, event && event.target ? event.target : customizerButton);
      });
    }

    document.querySelectorAll('[data-order-prefill="general"]').forEach(function (button) {
      button.addEventListener("click", function (event) {
        if (event && event.preventDefault) event.preventDefault();
        resetCatalogueSelection();
        var isDesignHelp = button.getAttribute("data-design-help") === "true";
        var handedOff = chooseSource({
          sourceKind: "catalogue",
          sourceId: isDesignHelp ? "catalogue:customizer-design-help" : "catalogue:general-custom-gift",
          productName: isDesignHelp ? "Custom resin frame design help" : "Custom gift enquiry",
          designDetails: isDesignHelp
            ? "Design help request from the customizer. Saloni will choose a starting design with you, then confirm the occasion, size, materials, quote, and delivery."
            : "General custom gift enquiry. Saloni will confirm the occasion, size, materials, quote, and delivery."
        }, { opener: button, customizerHandoff: isDesignHelp });
        if (isDesignHelp) notifyCustomizerRequestOutcome(handedOff ? "success" : "cancelled");
      });
    });
  }
  if (document.readyState === "loading" || document.readyState === undefined) document.addEventListener("DOMContentLoaded", initializePage);
  else initializePage();
}());
