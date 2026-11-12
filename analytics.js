/*
 * Visitor counts with GoatCounter (https://www.goatcounter.com): no cookies, no storage, no banner.
 * This file is the one place that holds the site code, the count file and its integrity hash.
 *
 *  - Page views: once the page has loaded, it adds GoatCounter's own count script (async, so it never delays the first
 *    paint, the load event or the order flow). GoatCounter reads the referrer and any utm_ values from the page address.
 *  - Events: window.saloniTrack("order-sent") sends one event. Before the count script has arrived, up to 10 events wait
 *    in memory and go out when it loads. If it never loads (blocked, offline, wrong hash), they are simply never sent.
 *    A localhost or file address is skipped by GoatCounter on purpose.
 *  - Privacy: an event name is a short lowercase word list such as "product-rose-tray". Anything else, such as a
 *    name, phone, address, note, ID, amount or UPI detail, is dropped here and never sent.
 *
 * To update GoatCounter: take the new versioned file and its hash from https://www.goatcounter.com/help/countjs-versions
 * (check the hash against the file with: curl -s <file> | openssl dgst -sha384 -binary | openssl base64 -A).
 */
(function () {
  "use strict";

  var CODE = "saloniresinart";
  var COUNT_FILE = "https://gc.zgo.at/count.v5.js";
  var INTEGRITY = "sha384-atnOLvQb9t+jTSipvd75X2yginT4PjVbqDdlJAmxMm+wYElFmeR6EmLP5bYeoRVQ";
  var SAFE_EVENT = /^[a-z][a-z0-9-]{0,79}$/;
  // Six or more digits in a row look like a phone number, pin code or ID.
  var LOOKS_LIKE_NUMBER = /[0-9]{6}/;
  // Events that happen before the count script has arrived (a shared product link opens its popup at once) wait here, in memory only.
  var waiting = [];
  var MAX_WAITING = 10;

  function ready() {
    var counter = window.goatcounter;
    return Boolean(counter && typeof counter.count === "function");
  }
  function send(event) {
    window.goatcounter.count({ path: event[0], title: event[1], event: true });
  }

  window.saloniTrack = function (path, title) {
    try {
      if (typeof path !== "string" || !SAFE_EVENT.test(path) || LOOKS_LIKE_NUMBER.test(path)) return;
      var event = [path, typeof title === "string" && title ? title : path];
      if (ready()) send(event);
      else if (waiting.length < MAX_WAITING) waiting.push(event);
    } catch (error) {}
  };

  // The count script is added once the page has loaded, so it can never hold up the load event that the page's own
  // scripts wait for, let alone the first paint. It is async and checked against the integrity hash.
  function addCountScript() {
    try {
      var tag = document.createElement("script");
      tag.async = true;
      tag.src = COUNT_FILE;
      tag.integrity = INTEGRITY;
      tag.crossOrigin = "anonymous";
      tag.setAttribute("data-goatcounter", "https://" + CODE + ".goatcounter.com/count");
      tag.onload = function () {
        try { if (ready()) waiting.splice(0).forEach(send); } catch (error) {}
      };
      document.head.appendChild(tag);
    } catch (error) {}
  }

  try {
    if (document.readyState === "complete") addCountScript();
    else window.addEventListener("load", addCountScript);
  } catch (error) {}
})();
