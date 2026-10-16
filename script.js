(function () {
  "use strict";

  document.documentElement.classList.add("js");

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.documentElement;
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    document.querySelectorAll("[data-carousel]").forEach(function (carousel) {
      var track = carousel.querySelector("[data-carousel-track]");
      var previous = carousel.querySelector("[data-carousel-prev]");
      var next = carousel.querySelector("[data-carousel-next]");
      if (!track || !previous || !next) return;

      function stepSize() {
        var firstCard = track.firstElementChild;
        if (!firstCard) return track.clientWidth * 0.85;
        var styles = window.getComputedStyle(track);
        var gap = parseFloat(styles.columnGap || styles.gap || "0");
        return firstCard.getBoundingClientRect().width + gap;
      }

      function updateControls() {
        var maxScroll = track.scrollWidth - track.clientWidth - 2;
        previous.disabled = track.scrollLeft <= 2;
        next.disabled = track.scrollLeft >= maxScroll;
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
      updateControls();
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

    var reveals = document.querySelectorAll(".reveal");
    if ("IntersectionObserver" in window) {
      root.classList.add("reveal-ready");
      var observer = new IntersectionObserver(function (entries, currentObserver) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -5%" });
      reveals.forEach(function (element) { observer.observe(element); });
    } else {
      reveals.forEach(function (element) { element.classList.add("is-visible"); });
    }

    initOrderRequestFlow();
  });

  function initOrderRequestFlow() {
    var embed = document.getElementById("order-form-embed");
    var frame = document.getElementById("order-form-frame");
    var status = document.getElementById("order-form-status");
    if (!embed || !frame || !status) return;
    var orderUrl = embed.getAttribute("data-order-form-url") || "";
    var configured = orderUrl && orderUrl.indexOf("REPLACE_WITH_") === -1;
    var frameState = { loaded: false };

    function requestId() {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      return "request-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
    }

    function scrollToForm() {
      embed.scrollIntoView({ behavior: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }

    function sourceSeed(source) {
      var seed = {
        sourceKind: source.sourceKind || "catalogue", sourceId: source.sourceId || "",
        productName: source.productName || "", quantity: "1", height: source.height || "", heightUnit: source.heightUnit || "in",
        width: source.width || "", widthUnit: source.widthUnit || "in", designDetails: source.designDetails || "",
        customerName: "", phone: "", email: "", fulfillment: "shipping", shippingAddress: "", city: "", state: "", pin: "", requestedDate: ""
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

    function submitSeed(seed) {
      if (!configured) {
        status.innerHTML = "The request form is not configured for this preview yet. You can still call Saloni at <a href=\"tel:8209238541\">8209238541</a> or message <a href=\"https://www.instagram.com/saloniresin_art_studio/\" target=\"_blank\" rel=\"noreferrer\">@saloniresin_art_studio</a>.";
        status.hidden = false;
        scrollToForm();
        return;
      }
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
      var seedField = document.createElement("input");
      seedField.type = "hidden"; seedField.name = "seed"; seedField.value = JSON.stringify(seed);
      postForm.appendChild(action); postForm.appendChild(seedField); document.body.appendChild(postForm); postForm.submit(); postForm.remove();
      frameState.loaded = true;
      scrollToForm();
    }

    function chooseSource(source) {
      if (frameState.loaded && !window.confirm("This order form is already loaded. Replace it with the selected item?")) return;
      var seed = sourceSeed(source);
      seed.requestId = requestId();
      submitSeed(seed);
    }

    function catalogueSeed(card) {
      var image = card.querySelector("img[src]");
      var title = card.querySelector("figcaption strong");
      if (!image || !title) return null;
      var sourceId = "catalogue:" + image.getAttribute("src").replace(/^assets\//, "");
      var details = Array.prototype.map.call(card.querySelectorAll("figcaption p"), function (node) { return node.textContent.trim(); }).join(" ");
      return sourceSeed({ sourceKind: "catalogue", sourceId: sourceId, productName: title.textContent.trim(), designDetails: details });
    }

    document.querySelectorAll("[data-carousel] .work-card").forEach(function (card) {
      var seed = catalogueSeed(card);
      var caption = card.querySelector("figcaption");
      if (!seed || !caption || caption.querySelector("[data-order-prefill]")) return;
      var button = document.createElement("button");
      button.type = "button"; button.className = "catalogue-order-button"; button.setAttribute("data-order-prefill", "catalogue");
      button.textContent = "Start an order";
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
  }
}());
