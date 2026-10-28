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

    var lightbox = document.getElementById("art-lightbox");
    var lightboxImage = document.getElementById("lightbox-image");
    var lightboxCaption = document.getElementById("lightbox-caption");
    var lightboxName = document.getElementById("lightbox-product-name");
    var lightboxPrice = document.getElementById("lightbox-product-price");
    var lightboxSize = document.getElementById("lightbox-product-size");
    var lightboxDescription = document.getElementById("lightbox-image-description");
    var lightboxPrevious = document.getElementById("lightbox-previous");
    var lightboxNext = document.getElementById("lightbox-next");
    var lightboxPosition = document.getElementById("lightbox-position");
    var lightboxRequest = document.getElementById("lightbox-request");
    var lightboxTriggers = document.querySelectorAll("[data-lightbox-trigger]");
    var lastTrigger = null;
    var lightboxItems = [];
    var lightboxIndex = 0;
    var pendingLightboxRequest = null;
    if (lightbox && lightboxImage && lightboxCaption && typeof lightbox.showModal === "function") {
      function focusOrderLocation() {
        var target = document.getElementById("order") || document.getElementById("order-form-embed");
        if (target && typeof target.focus === "function") target.focus({ preventScroll: true });
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
        return { trigger: trigger, card: card, image: image, title: title ? title.textContent.trim() : "", price: price, size: size, description: image ? (image.alt || "") : "" };
      }

      function visibleCollection(trigger) {
        var grid = trigger.closest ? trigger.closest(".catalogue-grid") : null;
        var scope = grid || (trigger.closest ? trigger.closest("section") : null);
        var candidates = scope && scope.querySelectorAll ? scope.querySelectorAll("[data-lightbox-trigger]") : [];
        var items = Array.prototype.filter.call(candidates, function (candidate) {
          var card = candidate.closest ? candidate.closest("article") : null;
          return !card || (!card.hidden && !(card.closest && card.closest("[hidden]")));
        }).map(productDetails);
        return items.length ? items : [productDetails(trigger)];
      }

      function renderLightboxItem() {
        var item = lightboxItems[lightboxIndex] || productDetails(lastTrigger);
        if (!item) return;
        lightboxImage.src = item.trigger.href;
        lightboxImage.alt = item.description || "Artwork preview";
        if (lightboxName) { lightboxName.textContent = item.title; lightboxName.hidden = !item.title; }
        if (lightboxPrice) { lightboxPrice.textContent = item.price || ""; lightboxPrice.hidden = !item.price; }
        if (lightboxSize) { lightboxSize.textContent = item.size || ""; lightboxSize.hidden = !item.size; }
        if (lightboxDescription) lightboxDescription.textContent = item.description || "";
        if (lightboxPosition) lightboxPosition.textContent = item.card ? (lightboxIndex + 1) + " of " + lightboxItems.length + (item.title ? " · " + item.title : "") : "";
        if (lightboxPrevious) { lightboxPrevious.disabled = lightboxIndex <= 0 || lightboxItems.length < 2; lightboxPrevious.setAttribute("aria-disabled", String(lightboxPrevious.disabled)); }
        if (lightboxNext) { lightboxNext.disabled = lightboxIndex >= lightboxItems.length - 1 || lightboxItems.length < 2; lightboxNext.setAttribute("aria-disabled", String(lightboxNext.disabled)); }
        if (lightboxRequest) {
          lightboxRequest.hidden = !item.card || !item.card.querySelector("[data-order-prefill]");
          lightboxRequest.disabled = lightboxRequest.hidden;
        }
      }

      function moveLightboxItem(direction) {
        var nextIndex = Math.min(lightboxItems.length - 1, Math.max(0, lightboxIndex + direction));
        if (nextIndex === lightboxIndex || !lightboxItems.length) return;
        lightboxIndex = nextIndex;
        renderLightboxItem();
      }

      lightbox.addEventListener("click", function (event) {
        if (event.target === lightbox) lightbox.close();
      });
      lightbox.addEventListener("close", function () {
        lightboxImage.removeAttribute("src");
        lightboxImage.alt = "";
        if (lightboxName) lightboxName.textContent = "";
        if (lightboxPrice) { lightboxPrice.textContent = ""; lightboxPrice.hidden = true; }
        if (lightboxSize) { lightboxSize.textContent = ""; lightboxSize.hidden = true; }
        if (lightboxDescription) lightboxDescription.textContent = "";
        if (lightboxRequest) { lightboxRequest.hidden = true; lightboxRequest.disabled = true; }
        if (pendingLightboxRequest) {
          var requestButton = pendingLightboxRequest;
          pendingLightboxRequest = null;
          if (typeof requestButton.click === "function") requestButton.click();
          if (typeof window.setTimeout === "function") window.setTimeout(focusOrderLocation, 0);
          else focusOrderLocation();
        } else if (lastTrigger) lastTrigger.focus();
        lastTrigger = null;
        lightboxItems = [];
        lightboxIndex = 0;
      });
      lightbox.addEventListener("keydown", function (event) {
        if (event.key === "ArrowLeft") { event.preventDefault(); moveLightboxItem(-1); }
        if (event.key === "ArrowRight") { event.preventDefault(); moveLightboxItem(1); }
      });
      if (lightboxPrevious) lightboxPrevious.addEventListener("click", function () { moveLightboxItem(-1); });
      if (lightboxNext) lightboxNext.addEventListener("click", function () { moveLightboxItem(1); });
      if (lightboxRequest) lightboxRequest.addEventListener("click", function () {
        var item = lightboxItems[lightboxIndex];
        var requestButton = item && item.card && item.card.querySelector("[data-order-prefill]");
        if (!requestButton) return;
        pendingLightboxRequest = requestButton;
        lightbox.close();
      });
      lightboxTriggers.forEach(function (trigger) {
        trigger.addEventListener("click", function (event) {
          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          var image = trigger.querySelector("img");
          if (!image) return;
          event.preventDefault();
          lastTrigger = trigger;
          lightboxItems = visibleCollection(trigger);
          lightboxIndex = Math.max(0, lightboxItems.findIndex(function (item) { return item.trigger === trigger; }));
          renderLightboxItem();
          lightbox.showModal();
        });
      });
    }

    initCatalogueExperience();

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

  function initCatalogueExperience() {
    var tools = document.getElementById("catalogue-filters");
    var typeFilter = document.getElementById("catalogue-type-filter");
    var priceFilter = document.getElementById("catalogue-price-filter");
    var resetButton = document.getElementById("catalogue-filter-reset");
    var emptyReset = document.getElementById("catalogue-empty-reset");
    var status = document.getElementById("catalogue-filter-status");
    var empty = document.getElementById("catalogue-filter-empty");
    var results = document.getElementById("catalogue-results");
    if (!tools || !typeFilter || !priceFilter || !resetButton || !emptyReset || !status || !empty || !results) return;
    var resultsHome = results.parentNode;

    var pagePrevious = document.getElementById("catalogue-page-previous");
    var pageNext = document.getElementById("catalogue-page-next");
    var pageStatus = document.getElementById("catalogue-page-status");
    var pagination = document.getElementById("catalogue-pagination");
    var catalogueHeading = document.getElementById("catalogue-filters-title");
    var pageSize = 8;
    var validTypes = ["all", "couple", "diwali", "frames", "premium", "hampers", "corporate"];
    var validBudgets = ["all", "499", "999", "1999", "2000"];

    var cards = Array.prototype.filter.call(document.querySelectorAll(".work-card, .romantic-keepsake-card"), function (card) {
      return !card.closest || !card.closest("#testimonials");
    });
    var sections = [];
    var allVisible = false;
    var page = 1;
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
      if (id === "romantic-keepsakes") return "couple";
      if (id === "diwali") return "diwali";
      if (id === "corporate-resin-gifts") return "corporate";
      if (id === "premium-collection") return "premium";
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

    function catalogueCards() {
      return cards.filter(function (card) {
        var section = sectionFor(card);
        var sectionCards = cardsForSection(section);
        var isInOverview = allVisible || isExpanded(section) || sectionCards.indexOf(card) < previewLimit;
        var type = typeFor(card);
        return isInOverview &&
          ((typeFilter.value || "all") === "all" || (typeFilter.value || "all") === type) &&
          matchesPrice(card, priceFilter.value || "all");
      });
    }

    function setPageStatus(total, pageCount) {
      if (!pageStatus) return;
      pageStatus.textContent = total ? "Page " + page + " of " + pageCount : "No pages";
    }

    function updatePageControls(total, pageCount) {
      if (pagePrevious) {
        pagePrevious.disabled = !allVisible || page <= 1 || total === 0;
        pagePrevious.setAttribute("aria-disabled", String(pagePrevious.disabled));
      }
      if (pageNext) {
        pageNext.disabled = !allVisible || page >= pageCount || total === 0;
        pageNext.setAttribute("aria-disabled", String(pageNext.disabled));
      }
    }

    function applyFilters() {
      var matchingCards = catalogueCards();
      var pageCount = Math.max(1, Math.ceil(matchingCards.length / pageSize));
      if (page > pageCount) page = pageCount;
      var pageStart = matchingCards.length ? (page - 1) * pageSize : 0;
      var pageCards = allVisible ? matchingCards.slice(pageStart, pageStart + pageSize) : matchingCards;
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
        setVisibility(card, pageCards.indexOf(card) !== -1);
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
        disclosure.textContent = canExpand && isExpanded(section) ? "Show less" : section.id === "premium-collection" ? "View all" : "See all";
      });
      var resultsSection = allVisible && pageCards.length ? sectionFor(pageCards[pageCards.length - 1]) : null;
      if (resultsSection && resultsSection.appendChild) resultsSection.appendChild(results);
      else if (resultsHome && resultsHome.appendChild) resultsHome.appendChild(results);
      empty.hidden = matchingCards.length !== 0;
      if (pagination) pagination.hidden = !allVisible;
      var pageEnd = Math.min(pageStart + pageSize, matchingCards.length);
      if (!matchingCards.length) status.textContent = "No gifts match those choices.";
      else if (!allVisible) status.textContent = "Showing " + matchingCards.length + " section previews.";
      else status.textContent = "Showing " + (pageStart + 1) + "–" + pageEnd + " of " + matchingCards.length + " gifts · Page " + page + " of " + pageCount + ".";
      setPageStatus(matchingCards.length, pageCount);
      updatePageControls(matchingCards.length, pageCount);
      document.documentElement.classList.add("catalogue-ready");
      return { total: matchingCards.length, pageCount: pageCount, pageCards: pageCards };
    }

    function currentUrl() {
      var location = window.location || {};
      if (location.href) return location.href;
      return "https://saloniresinart.com" + (location.pathname || "/") + (location.search || "") + (location.hash || "");
    }

    function urlWithState(state, hash) {
      var url = new URL(currentUrl(), "https://saloniresinart.com/");
      var params = url.searchParams;
      ["type", "budget", "page"].forEach(function (key) { params.delete(key); });
      if (state && state.full) {
        params.set("type", state.type || "all");
        params.set("budget", state.budget || "all");
        params.set("page", String(state.page || 1));
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
      var has = ["type", "budget", "page"].some(function (key) { return params.has(key); });
      if (!has) return { full: false };
      var type = params.get("type");
      var budget = params.get("budget");
      var rawPage = params.get("page");
      var safePage = /^\d+$/.test(rawPage || "") ? Number(rawPage) : NaN;
      return {
        full: true,
        type: validTypes.indexOf(type) !== -1 ? type : "all",
        budget: validBudgets.indexOf(budget) !== -1 ? budget : "all",
        page: Number.isSafeInteger(safePage) && safePage > 0 ? safePage : 1
      };
    }

    function setFullState(type, budget, nextPage) {
      allVisible = true;
      expandedSections = [];
      typeFilter.value = validTypes.indexOf(type) !== -1 ? type : "all";
      priceFilter.value = validBudgets.indexOf(budget) !== -1 ? budget : "all";
      page = Number.isSafeInteger(nextPage) && nextPage > 0 ? nextPage : 1;
      return applyFilters();
    }

    function showAll(commit) {
      var state = setFullState("all", "all", 1);
      var firstSection = state && state.pageCards && state.pageCards.length ? sectionFor(state.pageCards[0]) : null;
      if (commit) writeUrl(urlWithState({ full: true, type: "all", budget: "all", page: page }, firstSection ? "#" + firstSection.id : "#catalogue-filters"));
      return state;
    }

    function showFeatured(commit) {
      allVisible = false;
      expandedSections = [];
      typeFilter.value = "all";
      priceFilter.value = "all";
      page = 1;
      applyFilters();
      if (commit) writeUrl(urlWithState({ full: false }, "#catalogue-filters"));
    }

    function scrollToHash(href) {
      var id = String(href || "").replace(/^#/, "");
      var target = id ? document.getElementById(id) : null;
      if (target && !target.hidden && typeof target.scrollIntoView === "function") target.scrollIntoView({ behavior: "auto", block: "start" });
    }

    function focusCatalogueHeading(pageCards) {
      var target = catalogueHeading;
      if (allVisible && pageCards && pageCards.length) {
        var firstSection = sectionFor(pageCards[0]);
        var headingId = firstSection && firstSection.getAttribute ? firstSection.getAttribute("aria-labelledby") : "";
        var sectionHeading = headingId ? document.getElementById(headingId) : null;
        if (sectionHeading) {
          if (sectionHeading.setAttribute) sectionHeading.setAttribute("tabindex", "-1");
          target = sectionHeading;
        }
      }
      if (!target) return;
      if (typeof target.scrollIntoView === "function") target.scrollIntoView({ behavior: "auto", block: "start" });
      if (typeof target.focus === "function") target.focus({ preventScroll: true });
    }

    function selectCategory(category, href, commit) {
      setFullState(category || "all", "all", 1);
      if (commit) writeUrl(urlWithState({ full: true, type: typeFilter.value, budget: priceFilter.value, page: page }, href || "#catalogue-filters"));
      scrollToHash(href || "#catalogue-filters");
    }

    function restoreLegacyHash() {
      var id = String(window.location && window.location.hash || "").replace(/^#/, "");
      var target = id ? document.getElementById(id) : null;
      if (!target) return false;
      if (target.matches && target.matches("article")) {
        var productIndex = cards.indexOf(target);
        if (productIndex === -1) return false;
        setFullState("all", "all", Math.floor(productIndex / pageSize) + 1);
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
        setFullState(state.type, state.budget, state.page);
        var normalized = urlWithState({ full: true, type: typeFilter.value, budget: priceFilter.value, page: page });
        if (!sameUrl(normalized)) writeUrl(normalized, true);
        scrollToHash(window.location && window.location.hash);
        return;
      }
      showFeatured(false);
      restoreLegacyHash();
    }

    function movePage(direction) {
      var matchingCards = catalogueCards();
      var pageCount = Math.max(1, Math.ceil(matchingCards.length / pageSize));
      var nextPage = Math.min(pageCount, Math.max(1, page + direction));
      if (nextPage === page) return;
      page = nextPage;
      var state = applyFilters();
      var firstSection = state && state.pageCards && state.pageCards.length ? sectionFor(state.pageCards[0]) : null;
      writeUrl(urlWithState({ full: true, type: typeFilter.value, budget: priceFilter.value, page: page }, firstSection ? "#" + firstSection.id : "#catalogue-filters"));
      focusCatalogueHeading(state && state.pageCards);
    }

    document.querySelectorAll("[data-browse-filters]").forEach(function (link) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        scrollToHash(link.getAttribute("href") || "#catalogue-filters");
      });
    });
    document.querySelectorAll("[data-browse-all]").forEach(function (link) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        var state = showAll(true);
        focusCatalogueHeading(state && state.pageCards);
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
    function commitFilterChange() {
      allVisible = true;
      expandedSections = [];
      page = 1;
      applyFilters();
      writeUrl(urlWithState({ full: true, type: typeFilter.value, budget: priceFilter.value, page: page }, "#catalogue-filters"));
    }
    typeFilter.addEventListener("change", commitFilterChange);
    priceFilter.addEventListener("change", commitFilterChange);
    resetButton.addEventListener("click", function () { showFeatured(true); });
    emptyReset.addEventListener("click", function () {
      var state = showAll(true);
      focusCatalogueHeading(state && state.pageCards);
    });
    if (pagePrevious) pagePrevious.addEventListener("click", function () { movePage(-1); });
    if (pageNext) pageNext.addEventListener("click", function () { movePage(1); });
    window.addEventListener("hashchange", restoreFromLocation);
    window.addEventListener("popstate", restoreFromLocation);
    restoreFromLocation();
  }
  function initOrderRequestFlow() {
    var embed = document.getElementById("order-form-embed");
    var frame = document.getElementById("order-form-frame");
    var status = document.getElementById("order-form-status");
    var selectedProductSummary = document.getElementById("selected-product-summary");
    var selectedProductImage = document.getElementById("selected-product-image");
    var selectedProductName = document.getElementById("selected-product-name");
    var selectedProductPrice = document.getElementById("selected-product-price");
    var selectedProductSize = document.getElementById("selected-product-size");
    var customizerRequestStatus = document.getElementById("share-status");
    var continueCustomizerButton = document.getElementById("customizer-continue-without-preview");
    if (!embed || !frame || !status) return;
    var orderUrl = embed.getAttribute("data-order-form-url") || "";
    var configured = orderUrl && orderUrl.indexOf("REPLACE_WITH_") === -1;
    var PARENT_ORIGIN = "https://saloniresinart.com";
    var requestedMode = embed.getAttribute("data-form-mode");
    var frameState = { loaded: false, nonce: "", requestId: "", pendingCustomizerRequestId: "", customizerFallback: null, siteKey: "", activeCaptcha: null, previewSnapshot: null, previewTransfers: Object.create(null), pinnedSender: null, pinnedOrigin: "", mode: requestedMode === "partner" || requestedMode === "corporate" ? requestedMode : "order" };
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

    function invalidateChannel() {
      if (frameState.activeCaptcha) {
        if (frameState.activeCaptcha.timer) window.clearTimeout(frameState.activeCaptcha.timer);
        if (frameState.activeCaptcha.port && frameState.activeCaptcha.port.close) frameState.activeCaptcha.port.close();
      }
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
      var seed = {
        sourceKind: source.sourceKind || "catalogue", sourceId: source.sourceId || "",
        productName: source.productName || "", requestStage: "quote", quantity: "1", dimensionFormat: "feet-inches",
        heightFeet: heightParts ? heightParts.feet : "", heightInchesPart: heightParts ? heightParts.inches : "", widthFeet: widthParts ? widthParts.feet : "", widthInchesPart: widthParts ? widthParts.inches : "",
        height: source.height || "", heightUnit: source.heightUnit || "",
        width: source.width || "", widthUnit: source.widthUnit || "", designDetails: source.designDetails || "",
        customerName: "", phone: "", email: "", fulfillment: "shipping", shippingAddress: "", city: "", state: "", pin: "", requestedDate: "", referralCode: readReferralCode()
      };
      return seed;
    }

    function submitSeed(seed, shouldScroll, identity, previewSnapshot, previewExpected) {
      if (!configured) {
        invalidateChannel();
        status.innerHTML = frameState.mode === "corporate"
          ? "Corporate gifting enquiries are being prepared. For a current large-order enquiry, call Saloni at <a href=\"tel:8209238541\">8209238541</a> or message <a href=\"https://www.instagram.com/saloniresin_art_studio/\" target=\"_blank\" rel=\"noreferrer\">@saloniresin_art_studio</a>."
          : "The request form is not configured for this preview yet. You can still call Saloni at <a href=\"tel:8209238541\">8209238541</a> or message <a href=\"https://www.instagram.com/saloniresin_art_studio/\" target=\"_blank\" rel=\"noreferrer\">@saloniresin_art_studio</a>.";
        status.hidden = false;
        if (shouldScroll !== false) scrollToForm();
        return;
      }
      invalidateChannel();
      var requestIdentity = identity || { requestId: seed.requestId || requestId(), nonce: channelNonce() };
      frameState.nonce = requestIdentity.nonce;
      frameState.requestId = seed.requestId || requestIdentity.requestId;
      if (!frameState.nonce) {
        status.textContent = "This browser cannot start a secure request. Please use the latest browser or contact Saloni directly.";
        status.hidden = false;
        return;
      }
      if (!previewIdentityPart(frameState.requestId)) {
        status.textContent = "This browser could not start a secure request. Please try again or contact Saloni directly.";
        status.hidden = false;
        return;
      }
      if (previewExpected !== false && previewSnapshot && usablePreviewSnapshot(previewSnapshot) && previewSnapshot.requestId === frameState.requestId && previewSnapshot.nonce === frameState.nonce && previewSnapshot.mode === frameState.mode) frameState.previewSnapshot = previewSnapshot;
      seed.channelNonce = frameState.nonce;
      seed.formMode = frameState.mode;
      if (String(seed.sourceKind || "").toLowerCase() === "customizer") seed.previewExpected = previewExpected !== false;
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

    function handlePreviewRequest(event, data) {
      if (!data || data.type !== "saloni-preview-request") return;
      if (!frameState.loaded || !frameState.nonce || !frameState.requestId || data.version !== 1 || data.mode !== frameState.mode || data.nonce !== frameState.nonce || data.requestId !== frameState.requestId || !previewIdentityPart(data.nonce) || !previewIdentityPart(data.requestId) || !previewTransferId(data.transferId) || !event || !event.source || !event.ports || event.ports.length !== 1 || !event.origin) return;
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
      if (frameState.loaded && !options.confirmed && !window.confirm("This order form is already loaded. Replace it with the selected item?")) return false;
      var seed = sourceSeed(source);
      seed.requestId = options.requestId || source.requestId || requestId();
      if (options.card) showSelectedProductSummary(options.card);
      else clearSelectedProductSummary();
      submitSeed(seed, true, options.identity, options.previewSnapshot || source.previewSnapshot, options.previewExpected);
      return true;
    }

    window.addEventListener("message", function (event) {
      var data = event.data || {};
      if (data.type === "saloni-preview-request") {
        handlePreviewRequest(event, data);
        return;
      }
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
      if (/concept preview|illustrative preview|reference image|reference design|gifting concept/i.test(cardCopy)) details += (details ? " " : "") + "Illustrative/reference image; final design to confirm with Saloni.";
      var pricingDetails = Array.prototype.map.call(card.querySelectorAll(".product-pricing > div"), function (row) {
        var priceLabel = row.querySelector("dt");
        var priceValue = row.querySelector("dd");
        return priceLabel && priceValue ? priceLabel.textContent.trim() + ": " + priceValue.textContent.trim() : "";
      }).filter(function (detail) { return detail; });
      if (pricingDetails.length) details += (details ? " " : "") + pricingDetails.join(" ");
      return sourceSeed({ sourceKind: "catalogue", sourceId: sourceId, productName: title.textContent.trim(), designDetails: details });
    }

    document.querySelectorAll(".catalogue-grid .work-card, .catalogue-grid .romantic-keepsake-card").forEach(function (card) {
      var seed = catalogueSeed(card);
      var caption = card.querySelector("figcaption");
      if (!seed || !caption || caption.querySelector("[data-order-prefill]")) return;
      var button = document.createElement("button");
      button.type = "button"; button.className = "catalogue-order-button"; button.setAttribute("data-order-prefill", "catalogue");
      button.textContent = "Request this item";
      button.addEventListener("click", function () { chooseSource(seed, { card: card }); });
      caption.appendChild(button);
    });

    function clearCustomizerFallback() {
      frameState.customizerFallback = null;
      if (continueCustomizerButton) continueCustomizerButton.hidden = true;
      if (customizerRequestStatus && /Preview could not be prepared|Automatic preview/.test(customizerRequestStatus.textContent || "")) customizerRequestStatus.textContent = "";
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

    function continueCustomizerWithoutPreview(event) {
      if (event && event.preventDefault) event.preventDefault();
      var fallback = frameState.customizerFallback;
      if (!fallback || !usablePreviewDetails(fallback.summary, fallback.dimensions)) return;
      var identity = { requestId: fallback.requestId, nonce: fallback.nonce };
      clearCustomizerFallback();
      chooseSource({
        sourceKind: "customizer", sourceId: "customizer:resin-frame", productName: "Custom resin frame",
        height: fallback.dimensions.height, width: fallback.dimensions.width, heightUnit: fallback.dimensions.heightUnit, widthUnit: fallback.dimensions.widthUnit,
        designDetails: fallback.summary, requestId: identity.requestId
      }, { identity: identity, requestId: identity.requestId, confirmed: true, previewExpected: false });
    }

    if (continueCustomizerButton) continueCustomizerButton.addEventListener("click", continueCustomizerWithoutPreview);

    function startCustomizerRequest(event) {
      if (event && event.__saloniCustomizerRequestStarted) return;
      if (event) {
        event.__saloniCustomizerRequestStarted = true;
        if (event.preventDefault) event.preventDefault();
      }
      if (frameState.loaded && !window.confirm("This order form is already loaded. Replace it with the selected item?")) return;
      clearSelectedProductSummary();
      clearCustomizerFallback();
      var identity = { requestId: requestId(), nonce: channelNonce() };
      if (!identity.requestId || !identity.nonce || typeof window.saloniCustomizerCapture !== "function") {
        reportCustomizerFailure(null, identity);
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
          return;
        }
        clearCustomizerFallback();
        chooseSource({
          sourceKind: "customizer", sourceId: "customizer:resin-frame", productName: "Custom resin frame",
          height: snapshot.dimensions.height, width: snapshot.dimensions.width, heightUnit: snapshot.dimensions.heightUnit, widthUnit: snapshot.dimensions.widthUnit,
          designDetails: snapshot.summary, previewSnapshot: snapshot, requestId: identity.requestId
        }, { identity: identity, requestId: identity.requestId, previewSnapshot: snapshot, confirmed: true, previewExpected: true });
      };
      var reject = function (error) {
        if (frameState.pendingCustomizerRequestId !== identity.requestId) return;
        frameState.pendingCustomizerRequestId = "";
        reportCustomizerFailure(error, identity);
      };
      if (capture && typeof capture.then === "function") Promise.resolve(capture).then(accept, reject);
      else accept(capture);
    }

    document.addEventListener("click", function (event) {
      var target = event && event.target;
      if (target && target.id === "order-from-customizer") startCustomizerRequest(event);
    }, true);

    var customizerButton = document.querySelector("[data-order-prefill=\"customizer\"]");
    if (customizerButton) {
      customizerButton.addEventListener("click", function (event) {
        if (event && event.__saloniCustomizerRequestStarted) return;
        startCustomizerRequest(event);
      });
    }

    document.querySelectorAll('[data-order-prefill="general"]').forEach(function (button) {
      button.addEventListener("click", function (event) {
        if (event && event.preventDefault) event.preventDefault();
        var isDesignHelp = button.getAttribute("data-design-help") === "true";
        chooseSource({
          sourceKind: "catalogue",
          sourceId: isDesignHelp ? "catalogue:customizer-design-help" : "catalogue:general-custom-gift",
          productName: isDesignHelp ? "Custom resin frame design help" : "Custom gift enquiry",
          designDetails: isDesignHelp
            ? "Design help request from the customizer. Saloni will choose a starting design with you, then confirm the occasion, size, materials, quote, and delivery."
            : "General custom gift enquiry. Saloni will confirm the occasion, size, materials, quote, and delivery."
        });
      });
    });
  }
  if (document.readyState === "loading" || document.readyState === undefined) document.addEventListener("DOMContentLoaded", initializePage);
  else initializePage();
}());
