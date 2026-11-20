/*
 * Google Shopping visit source and the optional Google tag.
 *
 * 1. Visit source, no cookie: a visit that arrives with ?source=google-shopping is remembered for the tab
 *    (sessionStorage, with a copy in memory) and sent with the order request as visitSource. Other query
 *    parameters (srsltid, gclid) are ignored, and an unknown value never clears a saved one.
 * 2. Cookie banner: with no stored choice the page shows one banner in the page flow. Only after Accept does the
 *    Google tag container load, and only then may saloniGoogle.purchase report an order request. Decline stores
 *    "denied" and loads nothing. "Cookie settings" buttons (data-cookie-settings) reopen the banner.
 *
 * Every storage and page access sits in try/catch: if one is blocked, the site works as before.
 */
(function () {
  "use strict";

  var SOURCES = ["google-shopping"];
  var SOURCE_KEY = "saloniVisitSource";
  var CONSENT_KEY = "saloniGoogleConsent";
  var GTM_ID = "GTM-TJ2DZTHG";
  var visitSource = "";
  var consentChoice = "";
  var tagLoaded = false;
  var banner = null;
  var acceptButton = null;
  var opener = null;

  // ---- Visit source ----
  function normalizeSource(value) {
    var source = String(value == null ? "" : value).trim().toLowerCase();
    return SOURCES.indexOf(source) >= 0 ? source : "";
  }

  function readSource() {
    try {
      if (window.sessionStorage) return normalizeSource(window.sessionStorage.getItem(SOURCE_KEY)) || visitSource;
    } catch (error) {}
    return visitSource;
  }

  function saveSource(source) {
    visitSource = source;
    try {
      if (window.sessionStorage) window.sessionStorage.setItem(SOURCE_KEY, source);
    } catch (error) {}
  }

  function captureSource() {
    try {
      var source = normalizeSource(new URLSearchParams(window.location.search).get("source"));
      if (source) saveSource(source);
    } catch (error) {}
  }

  captureSource();
  window.saloniVisitSource = { read: function () { return readSource(); } };

  // ---- Consent choice ----
  function readConsent() {
    try {
      var stored = window.localStorage && window.localStorage.getItem(CONSENT_KEY);
      if (stored === "granted" || stored === "denied") return stored;
    } catch (error) {}
    return consentChoice;
  }

  function saveConsent(choice) {
    consentChoice = choice;
    try {
      if (window.localStorage) window.localStorage.setItem(CONSENT_KEY, choice);
    } catch (error) {}
  }

  // ---- Google tag ----
  function setUpGtag() {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
  }

  function consentSignals(state) {
    return { ad_storage: state, ad_user_data: state, analytics_storage: state, ad_personalization: "denied" };
  }

  function loadTag() {
    if (tagLoaded) return;
    try {
      setUpGtag();
      window.gtag("consent", "default", consentSignals("granted"));
      window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
      window.gtag("js", new Date());
      var script = document.createElement("script");
      script.async = true;
      // No integrity (SRI) hash is possible here: Google changes this file without notice, so a fixed hash would break the tag.
      script.src = "https://www.googletagmanager.com/gtm.js?id=" + GTM_ID;
      document.head.appendChild(script);
      tagLoaded = true;
    } catch (error) {}
  }

  function updateConsent(state) {
    try { if (tagLoaded) window.gtag("consent", "update", consentSignals(state)); } catch (error) {}
  }

  function accept() {
    saveConsent("granted");
    if (tagLoaded) updateConsent("granted"); else loadTag();
    hideBanner();
  }

  function decline() {
    saveConsent("denied");
    updateConsent("denied");
    hideBanner();
  }

  // The order request reports only what Merchant Center needs: the request ID, product IDs, prices and quantities.
  function purchase(data) {
    try {
      if (readConsent() !== "granted" || !tagLoaded || !data || typeof data !== "object") return;
      var id = String(data.transaction_id == null ? "" : data.transaction_id).slice(0, 100);
      if (!id) return;
      var items = [];
      var source = Array.isArray(data.items) ? data.items.slice(0, 100) : [];
      for (var index = 0; index < source.length; index += 1) {
        var item = source[index] || {};
        var itemId = String(item.item_id == null ? "" : item.item_id).slice(0, 100);
        if (!itemId) continue;
        var entry = { item_id: itemId };
        var price = Number(item.price);
        if (item.price != null && isFinite(price) && price >= 0) entry.price = price;
        var quantity = Number(item.quantity);
        entry.quantity = Math.floor(quantity) >= 1 && quantity <= 100 ? Math.floor(quantity) : 1;
        items.push(entry);
      }
      var event = { transaction_id: id, currency: "INR" };
      var value = Number(data.value);
      if (isFinite(value) && value > 0) event.value = Math.round(value * 100) / 100;
      event.items = items;
      window.gtag("event", "purchase", event);
    } catch (error) {}
  }

  window.saloniGoogle = { purchase: purchase };

  // ---- Banner ----
  var CSS = [
    ".saloni-cookie-banner{box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;gap:.5rem .75rem;padding:.6rem var(--gutter,1rem);background:var(--paper,#fff);color:var(--ink,#2a0e1f);border-bottom:1px solid var(--line,rgba(42,14,31,.16));font:.9rem/1.35 var(--sans,\"Helvetica Neue\",Helvetica,Arial,sans-serif)}",
    ".saloni-cookie-banner p{flex:1 1 16rem;margin:0}",
    ".saloni-cookie-banner a{color:var(--rose-ink,#8f0d49);text-decoration:underline}",
    ".saloni-cookie-actions{display:flex;gap:.5rem}",
    ".saloni-cookie-button{min-height:44px;min-width:44px;padding:.5rem 1.1rem;border:2px solid var(--rose,#b0125b);border-radius:999px;background:transparent;color:var(--rose-ink,#8f0d49);font:inherit;font-weight:700;cursor:pointer}",
    ".cookie-settings{min-height:44px;padding:.5rem 0;border:0;background:none;color:inherit;font:inherit;text-decoration:underline;cursor:pointer}",
    ".saloni-cookie-button:focus-visible,.cookie-settings:focus-visible,.saloni-cookie-banner a:focus-visible{outline:3px solid var(--rose,#b0125b);outline-offset:2px}"
  ].join("");

  function make(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function buildBanner() {
    var section = make("section", "saloni-cookie-banner");
    section.setAttribute("role", "region");
    section.setAttribute("aria-labelledby", "saloni-cookie-title");
    var line = make("p");
    var title = make("strong", "", "Cookie choice");
    title.setAttribute("id", "saloni-cookie-title");
    line.appendChild(title);
    line.appendChild(make("span", "", ": Accept lets Google measure which listings lead to order requests; your name, phone and address are never sent. "));
    var link = make("a", "", "Privacy details");
    link.setAttribute("href", "/#privacy-details");
    line.appendChild(link);
    var actions = make("div", "saloni-cookie-actions");
    acceptButton = make("button", "saloni-cookie-button", "Accept");
    acceptButton.setAttribute("type", "button");
    acceptButton.addEventListener("click", accept);
    var declineButton = make("button", "saloni-cookie-button", "Decline");
    declineButton.setAttribute("type", "button");
    declineButton.addEventListener("click", decline);
    actions.appendChild(acceptButton);
    actions.appendChild(declineButton);
    section.appendChild(line);
    section.appendChild(actions);
    return section;
  }

  function showBanner(from) {
    try {
      if (from) opener = from;
      if (!banner) {
        banner = buildBanner();
        // In the page flow, never fixed: it must not cover the cart jump button or the customizer actions.
        var skip = document.querySelector(".skip-link");
        if (skip && skip.parentNode) skip.parentNode.insertBefore(banner, skip.nextSibling);
        else document.body.insertBefore(banner, document.body.firstChild);
      }
      if (from && acceptButton && acceptButton.focus) acceptButton.focus();
    } catch (error) {}
  }

  function hideBanner() {
    try {
      if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    } catch (error) {}
    banner = null;
    acceptButton = null;
    var back = opener;
    opener = null;
    try { if (back && back.focus) back.focus(); } catch (error) {}
  }

  function wireOpeners() {
    try {
      var buttons = document.querySelectorAll("[data-cookie-settings]");
      Array.prototype.forEach.call(buttons, function (button) {
        button.removeAttribute("hidden");
        button.addEventListener("click", function () { showBanner(button); });
      });
    } catch (error) {}
  }

  function start() {
    try {
      var style = make("style", "", CSS);
      document.head.appendChild(style);
    } catch (error) {}
    wireOpeners();
    var choice = readConsent();
    if (choice === "granted") loadTag();
    else if (choice !== "denied") showBanner(null);
  }

  try {
    if (document.readyState === "loading" && document.addEventListener) document.addEventListener("DOMContentLoaded", start);
    else start();
  } catch (error) {}
}());
