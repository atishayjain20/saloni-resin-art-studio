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
  });
}());
