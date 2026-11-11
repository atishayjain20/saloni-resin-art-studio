/*
 * "My orders": a short record of the requests this browser has sent, kept in localStorage for 30 days.
 * order-form.js calls window.saloniMyOrders.save(summary) only after the server confirms a request.
 * Nothing personal is stored: no phone, email, address, PIN, images or referral code.
 * "Cancel order" only ASKS Saloni to cancel: it posts the request ID to the same Apps Script URL the order form uses
 * (action=cancel) and, once the server confirms, remembers that as cancelRequestedAt on the stored entry.
 * Opening the dialog asks the same URL for the live order status (action=status): the server answers with one fixed code
 * per request ID (read from the Status column Saloni updates by hand), which is stored as status/statusCheckedAt so the
 * last known status still shows when the check fails. The shopper never sees Saloni's own Status wording.
 * When Saloni has confirmed an order and typed an advance amount, the same answer carries advance {amount, payee, name}. It is
 * kept in memory only (never in localStorage), checked again here, and turned into "Pay with" UPI app links plus a copy option.
 */
(function () {
  "use strict";
  var STORAGE_KEY = "saloniMyOrders";
  var VERSION = 1;
  var TTL_MS = 30 * 24 * 60 * 60 * 1000;
  var CLOCK_SKEW_MS = 5 * 60 * 1000;
  var MAX_ORDERS = 50;
  var MAX_RAW_LENGTH = 500000;
  var MAX_ITEMS = 100;
  var MAX_NOTES = 300;
  var REQUEST_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
  var IMAGE_PATH = /^assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.(?:webp|jpe?g|png)$/i;
  var FULFILLMENT_LABELS = { shipping: "Shipping", pickup: "Pickup in Ajmer" };
  // The fixed codes action=status can answer with (Code.gs orderStatusCode_), and what the shopper reads for each.
  var STATUS_LABELS = {
    received: "Request sent — Saloni will contact you to confirm",
    confirmed: "Confirmed by Saloni",
    in_progress: "Being made",
    ready: "Ready to ship",
    dispatched: "Dispatched",
    delivered: "Delivered",
    cancel_requested: "Cancellation requested — Saloni will confirm",
    cancel_declined: "Confirmed — your cancellation request was declined. Contact Saloni if you have questions.",
    cancelled: "Cancelled",
    advance_paid: "Advance received — thank you"
  };
  var PICKUP_LABELS = { ready: "Ready for pickup in Ajmer", delivered: "Picked up" };
  var STATUS_CHECK_GAP_MS = 60 * 1000;
  var STATUS_TIMEOUT_MS = 15000;
  var CANCEL_FAILED_TEXT = "Could not send the request. Please try again or call/WhatsApp Saloni.";
  var CANCEL_TIMEOUT_MS = 25000;
  // The server only accepts request IDs of this shape (Code.gs ORDER_REQUEST_ID_PATTERN); older or odd IDs get no button.
  var CANCELLABLE_ID = /^[A-Za-z0-9_-]{12,80}$/;
  // The UPI ID shape the server accepts too (Code.gs UPI_PAYEE_PATTERN). Anything else gets no Pay button.
  var UPI_PAYEE = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,64}$/;
  var ADVANCE_MIN = 1;
  var ADVANCE_MAX = 200000;
  var DEFAULT_PAYEE_NAME = "Saloni Resin Art Studio";
  // The advance details of the last successful status answer, by request ID. Memory only: a reload asks again.
  var advanceByRequest = {};

  function storage() {
    try { return window.localStorage || null; } catch (error) { return null; }
  }
  function text(value, maxLength, required) {
    if (typeof value !== "string") return null;
    var trimmed = value.trim();
    if (trimmed.length > maxLength || (required && !trimmed)) return null;
    return trimmed;
  }
  function isStatusCode(code) { return typeof code === "string" && Object.prototype.hasOwnProperty.call(STATUS_LABELS, code); }
  function wholeNumber(value, min, max) {
    return typeof value === "number" && value % 1 === 0 && value >= min && value <= max;
  }

  // One stored order, or null when it is not exactly the shape this file writes.
  function validOrder(entry, now) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    var at = entry.at;
    if (typeof at !== "number" || at % 1 !== 0 || at <= now - TTL_MS || at > now + CLOCK_SKEW_MS) return null;
    if (typeof entry.requestId !== "string" || !REQUEST_ID.test(entry.requestId)) return null;
    if (!FULFILLMENT_LABELS.hasOwnProperty(entry.fulfillment)) return null;
    var notes = text(entry.notes, MAX_NOTES, false);
    if (notes === null || !Array.isArray(entry.items) || !entry.items.length || entry.items.length > MAX_ITEMS) return null;
    var items = [];
    for (var index = 0; index < entry.items.length; index += 1) {
      var item = entry.items[index];
      if (!item || typeof item !== "object") return null;
      var name = text(item.name, 160, true);
      var price = text(item.price, 120, false);
      if (name === null || price === null || !wholeNumber(item.quantity, 1, 100)) return null;
      if (typeof item.image !== "string" || (item.image !== "" && !IMAGE_PATH.test(item.image))) return null;
      items.push({ name: name, quantity: item.quantity, price: price, image: item.image });
    }
    var valid = { requestId: entry.requestId, at: at, items: items, fulfillment: entry.fulfillment, notes: notes };
    if (entry.cancelRequestedAt !== undefined) {
      var asked = entry.cancelRequestedAt;
      if (typeof asked !== "number" || asked % 1 !== 0 || asked < at - CLOCK_SKEW_MS || asked > now + CLOCK_SKEW_MS) return null;
      valid.cancelRequestedAt = asked;
    }
    // A last known status is optional and never worth dropping the order for: an unknown code or odd time is just ignored.
    var checked = entry.statusCheckedAt;
    if (isStatusCode(entry.status) && typeof checked === "number" && checked % 1 === 0 && checked >= at - CLOCK_SKEW_MS && checked <= now + CLOCK_SKEW_MS) {
      valid.status = entry.status;
      valid.statusCheckedAt = checked;
    }
    return valid;
  }

  function newestFirst(orders) {
    return orders.map(function (order, index) { return { order: order, index: index }; })
      .sort(function (left, right) { return right.order.at - left.order.at || left.index - right.index; })
      .map(function (wrapped) { return wrapped.order; });
  }

  function write(store, orders) {
    try {
      if (orders.length) store.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, orders: orders }));
      else store.removeItem(STORAGE_KEY);
      return true;
    } catch (error) { return false; }
  }

  // Valid, unexpired orders, newest first. Anything else is dropped and the stored copy is cleaned.
  function read() {
    var store = storage();
    if (!store) return [];
    var raw;
    try { raw = store.getItem(STORAGE_KEY); } catch (error) { return []; }
    if (raw === null || raw === undefined) return [];
    var record = null;
    if (typeof raw === "string" && raw.length <= MAX_RAW_LENGTH) {
      try { record = JSON.parse(raw); } catch (error) { record = null; }
    }
    var now = Date.now();
    var kept = [];
    var stored = record && record.version === VERSION && Array.isArray(record.orders) ? record.orders : [];
    stored.forEach(function (entry) {
      var order = validOrder(entry, now);
      if (order) kept.push(order);
    });
    kept = newestFirst(kept).slice(0, MAX_ORDERS);
    if (!record || record.version !== VERSION || kept.length !== stored.length) write(store, kept);
    return kept;
  }

  // The summary comes from order-form.js; keep only the fields this file is allowed to store.
  function cleanSummary(summary) {
    if (!summary || typeof summary !== "object" || !Array.isArray(summary.items)) return null;
    var items = (summary.items.length <= MAX_ITEMS ? summary.items : []).map(function (item) {
      item = item || {};
      var image = typeof item.image === "string" && IMAGE_PATH.test(item.image) ? item.image : "";
      return { name: text(item.name, 160, true), quantity: item.quantity, price: text(item.price || "", 120, false), image: image };
    });
    var notes = typeof summary.notes === "string" ? summary.notes.trim().slice(0, MAX_NOTES).trim() : "";
    var candidate = { requestId: summary.requestId, at: Date.now(), items: items, fulfillment: summary.fulfillment, notes: notes };
    return validOrder(candidate, Date.now());
  }

  function save(summary) {
    var clean = cleanSummary(summary);
    var store = storage();
    if (!clean || !store) return false;
    var orders = read();
    var duplicate = orders.some(function (order) { return order.requestId === clean.requestId; });
    if (duplicate) return true;
    return write(store, newestFirst([clean].concat(orders)).slice(0, MAX_ORDERS));
  }

  // Remember that the server took the cancellation request for this order. Returns false when nothing could be stored.
  function markCancelRequested(requestId) {
    var store = storage();
    if (!store) return false;
    var changed = false;
    var orders = read();
    orders.forEach(function (order) {
      if (order.requestId === requestId && !order.cancelRequestedAt) { order.cancelRequestedAt = Date.now(); changed = true; }
    });
    return changed ? write(store, orders) : false;
  }

  // The same address the order form posts to; the form's embed element carries it.
  function execUrl() {
    var embed = document.getElementById("order-form-embed");
    var url = embed ? String(embed.getAttribute("data-order-form-url") || "") : "";
    return url && url.indexOf("REPLACE_WITH_") === -1 ? url : "";
  }
  // A text/plain JSON body is a "simple" request (no preflight), like postJson in order-form.js. Resolves with the parsed
  // answer; rejects on a network error, a non-JSON answer, or when nothing has answered after timeoutMs.
  function postAction(action, body, timeoutMs) {
    var url = execUrl();
    if (!url || typeof window.fetch !== "function") return Promise.reject(new Error("not configured"));
    var controller = typeof window.AbortController === "function" ? new window.AbortController() : null;
    var timer = typeof window.setTimeout === "function" ? window.setTimeout(function () { if (controller) controller.abort(); }, timeoutMs) : null;
    function stopTimer() { if (timer !== null && typeof window.clearTimeout === "function") window.clearTimeout(timer); }
    var init = { method: "POST", credentials: "omit", body: JSON.stringify(body) };
    if (controller) init.signal = controller.signal;
    try {
      return window.fetch(url + "?action=" + action, init)
        .then(function (response) { return response.json(); })
        .then(function (data) { stopTimer(); return data; }, function (error) { stopTimer(); throw error; });
    } catch (error) {
      stopTimer();
      return Promise.reject(error);
    }
  }
  function requestCancellation(requestId) { return postAction("cancel", { requestId: requestId }, CANCEL_TIMEOUT_MS); }

  // What the shopper reads for an order. While a cancellation the shopper asked for is open (the server still says sent, confirmed
  // or cancellation requested) it reads as requested. Saloni's "Cancellation declined" and every later status (Being made,
  // Dispatched, Cancelled, ...) show as they are, because that is what really happened.
  function effectiveStatus(order) {
    var code = isStatusCode(order.status) ? order.status : "received";
    if (order.cancelRequestedAt && (code === "received" || code === "confirmed")) return "cancel_requested";
    return code;
  }
  function statusLabel(order) {
    var code = effectiveStatus(order);
    return order.fulfillment === "pickup" && PICKUP_LABELS.hasOwnProperty(code) ? PICKUP_LABELS[code] : STATUS_LABELS[code];
  }
  // Remember the codes the server sent. Unknown ids and unknown codes are ignored.
  function storeStatuses(statuses) {
    if (!statuses || typeof statuses !== "object" || Array.isArray(statuses)) return;
    var now = Date.now();
    var orders = read();
    var changed = false;
    orders.forEach(function (order) {
      if (!Object.prototype.hasOwnProperty.call(statuses, order.requestId) || !isStatusCode(statuses[order.requestId])) return;
      order.status = statuses[order.requestId];
      order.statusCheckedAt = now;
      changed = true;
    });
    var store = storage();
    if (changed && store) write(store, orders);
  }

  // One advance from the server, or null when it is not exactly {amount: whole rupees 1..200000, payee: UPI ID, name: text}.
  function validAdvance(advance, requestId) {
    if (!advance || typeof advance !== "object" || Array.isArray(advance) || !CANCELLABLE_ID.test(requestId)) return null;
    if (!wholeNumber(advance.amount, ADVANCE_MIN, ADVANCE_MAX)) return null;
    if (typeof advance.payee !== "string" || !UPI_PAYEE.test(advance.payee)) return null;
    var name = text(typeof advance.name === "string" ? advance.name.replace(/\s+/g, " ") : "", 60, true) || DEFAULT_PAYEE_NAME;
    return { amount: advance.amount, payee: advance.payee, name: name };
  }
  function storeAdvances(map) {
    var fresh = {};
    if (map && typeof map === "object" && !Array.isArray(map)) {
      Object.keys(map).forEach(function (id) {
        var advance = validAdvance(map[id], id);
        if (advance) fresh[id] = advance;
      });
    }
    advanceByRequest = fresh;
  }
  // The note the bank statement and Saloni's UPI app will show: "Saloni order" and the first 8 characters of the request ID.
  function paymentNote(requestId) { return "Saloni order " + requestId.slice(0, 8); }
  // The same five encoded fields for every app; only the scheme in front changes.
  function upiParams(advance, requestId) {
    return "pa=" + encodeURIComponent(advance.payee) + "&pn=" + encodeURIComponent(advance.name) +
      "&am=" + encodeURIComponent(advance.amount + ".00") + "&cu=INR&tn=" + encodeURIComponent(paymentNote(requestId));
  }
  // iPhone, iPad and iPadOS (which calls itself a Mac but has a touch screen) open Google Pay as gpay://; everything else as tez://
  // (and WhatsApp Pay is hidden there).
  function isIos() {
    var nav = window.navigator;
    if (!nav) return false;
    return /iPhone|iPad|iPod/.test(String(nav.userAgent || "")) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  }
  // Brand marks from the simple-icons package (CC0 1.0, https://github.com/simple-icons/simple-icons), 24x24 paths, drawn inline
  // so no icon is fetched at run time. The colours are the brand colours simple-icons lists.
  var ICON_PATHS = {
    googlepay: "M3.963 7.235A3.963 3.963 0 00.422 9.419a3.963 3.963 0 000 3.559 3.963 3.963 0 003.541 2.184c1.07 0 1.97-.352 2.627-.957.748-.69 1.18-1.71 1.18-2.916a4.722 4.722 0 00-.07-.806H3.964v1.526h2.14a1.835 1.835 0 01-.79 1.205c-.356.241-.814.379-1.35.379-1.034 0-1.911-.697-2.225-1.636a2.375 2.375 0 010-1.517c.314-.94 1.191-1.636 2.225-1.636a2.152 2.152 0 011.52.594l1.132-1.13a3.808 3.808 0 00-2.652-1.033zm6.501.55v6.9h.886V11.89h1.465c.603 0 1.11-.196 1.522-.588a1.911 1.911 0 00.635-1.464 1.92 1.92 0 00-.635-1.456 2.125 2.125 0 00-1.522-.598zm2.427.85a1.156 1.156 0 01.823.365 1.176 1.176 0 010 1.686 1.171 1.171 0 01-.877.357H11.35V8.635h1.487a1.156 1.156 0 01.054 0zm4.124 1.175c-.842 0-1.477.308-1.907.925l.781.491c.288-.417.68-.626 1.175-.626a1.255 1.255 0 01.856.323 1.009 1.009 0 01.366.785v.202c-.34-.193-.774-.289-1.3-.289-.617 0-1.11.145-1.479.434-.37.288-.554.677-.554 1.165a1.476 1.476 0 00.525 1.156c.35.308.785.463 1.305.463.61 0 1.098-.27 1.465-.81h.038v.655h.848v-2.909c0-.61-.19-1.09-.568-1.44-.38-.35-.896-.525-1.551-.525zm2.263.154l1.946 4.422-1.098 2.38h.915L24 9.963h-.965l-1.368 3.391h-.02l-1.406-3.39zm-2.146 2.368c.494 0 .88.11 1.156.33 0 .372-.147.696-.44.973a1.413 1.413 0 01-.997.414 1.081 1.081 0 01-.69-.232.708.708 0 01-.293-.578c0-.257.12-.47.363-.647.24-.173.54-.26.9-.26Z",
    phonepe: "M10.206 9.941h2.949v4.692c-.402.201-.938.268-1.34.268-1.072 0-1.609-.536-1.609-1.743V9.941zm13.47 4.816c-1.523 6.449-7.985 10.442-14.433 8.919C2.794 22.154-1.199 15.691.324 9.243 1.847 2.794 8.309-1.199 14.757.324c6.449 1.523 10.442 7.985 8.919 14.433zm-6.231-5.888a.887.887 0 0 0-.871-.871h-1.609l-3.686-4.222c-.335-.402-.871-.536-1.407-.402l-1.274.401c-.201.067-.268.335-.134.469l4.021 3.82H6.386c-.201 0-.335.134-.335.335v.67c0 .469.402.871.871.871h.938v3.217c0 2.413 1.273 3.82 3.418 3.82.67 0 1.206-.067 1.877-.335v2.145c0 .603.469 1.072 1.072 1.072h.938a.432.432 0 0 0 .402-.402V9.874h1.542c.201 0 .335-.134.335-.335v-.67z",
    paytm: "M15.85 8.167a.204.204 0 0 0-.04.004c-.68.19-.543 1.148-1.781 1.23h-.12a.23.23 0 0 0-.052.005h-.001a.24.24 0 0 0-.184.235v1.09c0 .134.106.241.237.241h.645v4.623c0 .132.104.238.233.238h1.058a.236.236 0 0 0 .233-.238v-4.623h.6c.13 0 .236-.107.236-.241v-1.09a.239.239 0 0 0-.236-.24h-.612V8.386a.218.218 0 0 0-.216-.22zm4.225 1.17c-.398 0-.762.15-1.042.395v-.124a.238.238 0 0 0-.234-.224h-1.07a.24.24 0 0 0-.236.242v5.92a.24.24 0 0 0 .236.242h1.07c.12 0 .217-.091.233-.209v-4.25a.393.393 0 0 1 .371-.408h.196a.41.41 0 0 1 .226.09.405.405 0 0 1 .145.319v4.074l.004.155a.24.24 0 0 0 .237.241h1.07a.239.239 0 0 0 .235-.23l-.001-4.246c0-.14.062-.266.174-.34a.419.419 0 0 1 .196-.068h.198c.23.02.37.2.37.408.005 1.396.004 2.8.004 4.224a.24.24 0 0 0 .237.241h1.07c.13 0 .236-.108.236-.241v-4.543c0-.31-.034-.442-.08-.577a1.601 1.601 0 0 0-1.51-1.09h-.015a1.58 1.58 0 0 0-1.152.5c-.291-.308-.7-.5-1.153-.5zM.232 9.4A.234.234 0 0 0 0 9.636v5.924c0 .132.096.238.216.241h1.09c.13 0 .237-.107.237-.24l.004-1.658H2.57c.857 0 1.453-.605 1.453-1.481v-1.538c0-.877-.596-1.484-1.453-1.484H.232zm9.032 0a.239.239 0 0 0-.237.241v2.47c0 .94.657 1.608 1.579 1.608h.675s.016 0 .037.004a.253.253 0 0 1 .222.253c0 .13-.096.235-.219.251l-.018.004-.303.006H9.739a.239.239 0 0 0-.236.24v1.09a.24.24 0 0 0 .236.242h1.75c.92 0 1.577-.669 1.577-1.608v-4.56a.239.239 0 0 0-.236-.24h-1.07a.239.239 0 0 0-.236.24c-.005.787 0 1.525 0 2.255a.253.253 0 0 1-.25.25h-.449a.253.253 0 0 1-.25-.255c.005-.754-.005-1.5-.005-2.25a.239.239 0 0 0-.236-.24zm-4.004.006a.232.232 0 0 0-.238.226v1.023c0 .132.113.24.252.24h1.413c.112.017.2.1.213.23v.14c-.013.124-.1.214-.207.224h-.7c-.93 0-1.594.63-1.594 1.515v1.269c0 .88.57 1.506 1.495 1.506h1.94c.348 0 .63-.27.63-.6v-4.136c0-1.004-.508-1.637-1.72-1.637zm-3.713 1.572h.678c.139 0 .25.115.25.256v.836a.253.253 0 0 1-.25.256h-.1c-.192.002-.386 0-.578 0zm4.67 1.977h.445c.139 0 .252.108.252.24v.932a.23.23 0 0 1-.014.076.25.25 0 0 1-.238.164h-.445a.247.247 0 0 1-.252-.24v-.933c0-.132.113-.239.252-.239Z",
    whatsapp: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
  };
  function isAndroid() {
    var nav = window.navigator;
    return Boolean(nav) && /Android/.test(String(nav.userAgent || ""));
  }
  // The shopper picks the app: one icon link per app, so no phone silently opens its default UPI handler.
  // WhatsApp Pay has no URL scheme on iPhone, and on Android it is an intent to the UPI scheme for the WhatsApp package,
  // so it is offered on Android only (a desktop or unknown device gets no link that cannot open).
  function payOptions(advance, requestId) {
    var params = upiParams(advance, requestId);
    var options = [
      { icon: "googlepay", color: "#4285F4", aria: "Google Pay", href: (isIos() ? "gpay://upi/pay?" : "tez://upi/pay?") + params },
      { icon: "phonepe", color: "#5F259F", aria: "PhonePe", href: "phonepe://pay?" + params },
      { icon: "paytm", color: "#20336B", aria: "Paytm", href: "paytmmp://pay?" + params }
    ];
    if (isAndroid()) options.push({ icon: "whatsapp", color: "#25D366", aria: "WhatsApp", href: "intent://pay?" + params + "#Intent;scheme=upi;package=com.whatsapp;end" });
    return options;
  }
  // An inline SVG icon that screen readers skip: the link's aria-label names the app.
  function iconSvg(option) {
    var svgNs = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", option.color);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var shape = document.createElementNS(svgNs, "path");
    shape.setAttribute("d", ICON_PATHS[option.icon]);
    svg.appendChild(shape);
    return svg;
  }

  // --- the dialog ---
  var dialog = document.getElementById("my-orders-dialog");
  var closeButton = document.getElementById("my-orders-close");
  var listElement = document.getElementById("my-orders-list");
  var emptyElement = document.getElementById("my-orders-empty");
  var contactElement = document.getElementById("my-orders-contact");
  var opener = null;
  var views = [];
  var lastStatusCheckAt = 0;
  var statusInFlight = false;
  var leaveFocusAlone = false;
  // The same history pattern as the order and lightbox dialogs in script.js: opening adds one history entry, so
  // the phone Back button closes the dialog; closing any other way steps that entry back so none is left behind.
  var historyActive = false;
  var closedByHistory = false;
  var backPending = false;
  var pendingOpener = null;

  function isHistoryState(state) { return Boolean(state && state.saloniMyOrders); }
  function pushHistory() {
    var history = window.history;
    if (!history || typeof history.pushState !== "function") return;
    if (historyActive || isHistoryState(history.state)) { historyActive = true; return; }
    try {
      history.pushState(Object.assign({}, history.state || {}, { saloniMyOrders: true }), "", window.location && window.location.href ? window.location.href : "");
      historyActive = true;
    } catch (error) {}
  }
  function consumeHistory() {
    if (!historyActive) return;
    historyActive = false;
    if (closedByHistory) return;
    var history = window.history;
    if (!history || typeof history.back !== "function" || !isHistoryState(history.state)) return;
    backPending = true;
    try { history.back(); } catch (error) { backPending = false; }
  }
  // Leaving through a link that adds its own history entry: forget ours in place rather than stepping back.
  function dropHistoryEntry() {
    if (!historyActive) return;
    historyActive = false;
    var history = window.history;
    if (!history || typeof history.replaceState !== "function") return;
    try {
      var next = Object.assign({}, history.state || {});
      delete next.saloniMyOrders;
      history.replaceState(next, "", window.location && window.location.href ? window.location.href : "");
    } catch (error) {}
  }

  function element(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function formatTime(at) {
    try {
      return new Date(at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
    } catch (error) { return new Date(at).toISOString().slice(0, 16).replace("T", " "); }
  }
  function renderOrder(order) {
    var card = element("li", "my-order");
    var head = element("div", "my-order-head");
    var time = element("time", "my-order-time", formatTime(order.at));
    try { time.setAttribute("datetime", new Date(order.at).toISOString()); } catch (error) {}
    head.appendChild(time);
    head.appendChild(element("span", "my-order-id", "Request ID: " + order.requestId));
    card.appendChild(head);
    var items = element("ul", "my-order-items");
    order.items.forEach(function (item) {
      var row = element("li", "my-order-item");
      if (item.image) {
        var image = element("img", "my-orders-thumb");
        image.setAttribute("src", item.image);
        image.setAttribute("alt", "");
        image.setAttribute("width", "56");
        image.setAttribute("height", "56");
        image.setAttribute("loading", "lazy");
        row.appendChild(image);
      }
      var copy = element("span", "my-order-item-copy");
      copy.appendChild(element("span", "my-order-item-name", item.name));
      copy.appendChild(element("span", "my-order-item-detail", "Qty " + item.quantity + (item.price ? " · " + item.price : "")));
      row.appendChild(copy);
      items.appendChild(row);
    });
    card.appendChild(items);
    card.appendChild(element("p", "my-order-meta", FULFILLMENT_LABELS[order.fulfillment]));
    if (order.notes) card.appendChild(element("p", "my-order-notes", "Your notes: " + order.notes));
    var view = { order: order, card: card, status: element("p", "my-order-status"), note: element("p", "my-order-note"), advance: element("div", "my-order-advance"), advanceKey: "", cancel: null, sending: false };
    view.note.setAttribute("aria-live", "polite");
    view.note.hidden = true;
    view.advance.hidden = true;
    card.appendChild(view.status);
    card.appendChild(view.note);
    card.appendChild(view.advance);
    views.push(view);
    paint(view);
    return card;
  }
  // The status line (text and colour) and, only while Saloni has not started work, the Cancel order controls.
  function paint(view) {
    var order = view.order;
    var code = effectiveStatus(order);
    view.status.className = "my-order-status is-" + code.replace(/_/g, "-");
    view.status.textContent = statusLabel(order);
    paintAdvance(view);
    if (canCancel(view) && !view.cancel) {
      view.cancel = cancelControls(view);
      view.card.appendChild(view.cancel);
    } else if (!canCancel(view) && view.cancel && !view.sending) {
      // A request that is still out keeps its controls until it settles (then removeControls runs).
      removeControls(view);
    }
  }
  // The advance only shows while the order reads "Confirmed" here too (a cancellation the shopper asked for, or any later status, hides it).
  function advanceFor(view) {
    var order = view.order;
    return effectiveStatus(order) === "confirmed" && Object.prototype.hasOwnProperty.call(advanceByRequest, order.requestId) ? advanceByRequest[order.requestId] : null;
  }
  // Rebuilt only when the amount or UPI ID changes, so a repaint never takes focus away from the Copy button.
  function paintAdvance(view) {
    var advance = advanceFor(view);
    var key = advance ? [advance.amount, advance.payee, advance.name].join("|") : "";
    if (key === view.advanceKey) return;
    view.advanceKey = key;
    var box = view.advance;
    var hadFocus = isInside(box, document.activeElement);
    clearChildren(box);
    box.hidden = !advance;
    if (!advance) {
      if (hadFocus) { view.status.setAttribute("tabindex", "-1"); if (dialog.open) focusIfPossible(view.status, true); }
      return;
    }
    var rupees = "\u20B9" + advance.amount;
    var note = paymentNote(view.order.requestId);
    box.appendChild(element("p", "my-order-advance-amount", "Advance to pay: " + rupees));
    box.appendChild(element("p", "my-order-pay-label", "Pay with"));
    var choice = element("div", "my-order-pay-choice");
    payOptions(advance, view.order.requestId).forEach(function (option) {
      var pay = element("a", "my-order-pay");
      pay.setAttribute("href", option.href);
      pay.setAttribute("aria-label", "Pay " + rupees + " with " + option.aria);
      pay.setAttribute("title", option.aria);
      pay.appendChild(iconSvg(option));
      choice.appendChild(pay);
    });
    box.appendChild(choice);
    var alternative = element("p", "my-order-advance-alt");
    alternative.appendChild(element("span", undefined, "Or pay " + rupees + " to "));
    alternative.appendChild(element("strong", "my-order-upi-id", advance.payee));
    alternative.appendChild(element("span", undefined, " in any UPI app and add \u201C" + note + "\u201D as the note."));
    box.appendChild(alternative);
    var copy = plainButton("button button-line my-order-copy", "Copy UPI ID");
    var feedback = element("p", "my-order-feedback my-order-copy-feedback");
    feedback.setAttribute("aria-live", "polite");
    copy.addEventListener("click", function () {
      copyText(advance.payee).then(function (copied) {
        feedback.className = "my-order-feedback my-order-copy-feedback" + (copied ? "" : " is-error");
        feedback.textContent = copied ? "UPI ID copied." : "Could not copy. Select the UPI ID above instead.";
      });
    });
    box.appendChild(copy);
    box.appendChild(feedback);
    box.appendChild(element("p", "my-order-advance-note", "Saloni will confirm once she receives it."));
  }
  // Resolves true once the text is on the clipboard, false when the browser has no clipboard or refuses.
  function copyText(value) {
    var clipboard = window.navigator && window.navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") return Promise.resolve(false);
    try { return Promise.resolve(clipboard.writeText(value)).then(function () { return true; }, function () { return false; }); } catch (error) { return Promise.resolve(false); }
  }
  function canCancel(view) {
    var order = view.order;
    var code = effectiveStatus(order);
    return Boolean((code === "received" || code === "confirmed") && !order.cancelRequestedAt && CANCELLABLE_ID.test(order.requestId) && execUrl() && typeof window.fetch === "function");
  }
  function showNote(view, message, className) {
    view.note.className = className;
    view.note.textContent = message;
    view.note.hidden = !message;
  }
  function isInside(root, node) {
    for (; node; node = node.parentNode) if (node === root) return true;
    return false;
  }
  // Take the Cancel order controls off the card. Focus that was inside them moves to the status line, not to nowhere.
  function removeControls(view) {
    var wrap = view.cancel;
    view.cancel = null;
    if (!wrap) return;
    var hadFocus = isInside(wrap, document.activeElement);
    if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    if (hadFocus) {
      view.status.setAttribute("tabindex", "-1");
      if (dialog.open) focusIfPossible(view.status, true);
    }
  }
  // The card for this request ID that is on screen now (the dialog may have been rebuilt since a request was sent).
  function liveView(requestId) {
    for (var index = 0; index < views.length; index += 1) if (views[index].order.requestId === requestId) return views[index];
    return null;
  }
  function plainButton(className, label) {
    var node = element("button", className, label);
    node.setAttribute("type", "button");
    return node;
  }
  function clearChildren(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  // Cancel order -> in-place confirm -> request. The confirm takes the button's place, so the card keeps its height.
  // Focus goes to the confirm's safe choice, then back to the button (Keep order, failure) or the status (success).
  function cancelControls(view) {
    var order = view.order;
    var wrap = element("div", "my-order-cancel");
    var feedback = element("p", "my-order-feedback");
    feedback.setAttribute("aria-live", "polite");
    var actions = element("div", "my-order-actions");
    wrap.appendChild(feedback);
    wrap.appendChild(actions);
    var sending = false;
    function say(message, isError) {
      feedback.className = "my-order-feedback" + (isError ? " is-error" : "");
      feedback.textContent = message;
    }
    function focusHere(target) { if (dialog.open) focusIfPossible(target, true); }
    function showButton(moveFocus) {
      clearChildren(actions);
      var cancel = plainButton("button button-line my-order-cancel-button", "Cancel order");
      cancel.addEventListener("click", showConfirm);
      actions.appendChild(cancel);
      if (moveFocus) focusHere(cancel);
    }
    function showConfirm() {
      say("", false);
      clearChildren(actions);
      var group = element("div", "my-order-confirm");
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "Confirm cancellation request");
      group.appendChild(element("p", "my-order-confirm-text", "Ask Saloni to cancel this order?"));
      var yes = plainButton("button button-dark", "Yes, ask to cancel");
      var keep = plainButton("button button-line", "Keep order");
      group.appendChild(yes);
      group.appendChild(keep);
      actions.appendChild(group);
      keep.addEventListener("click", function () { if (!sending) showButton(true); });
      yes.addEventListener("click", function () {
        if (sending) return;
        sending = true;
        view.sending = true;
        yes.disabled = true;
        keep.disabled = true;
        group.setAttribute("aria-busy", "true");
        say("Sending your request…", false);
        requestCancellation(order.requestId).then(function (reply) { return Boolean(reply) && reply.ok === true; }, function () { return false; }).then(function (sent) {
          sending = false;
          view.sending = false;
          var live = liveView(order.requestId) || view;
          if (sent) {
            // The server has it. Storage trouble must not turn that into an error: the status still shows.
            markCancelRequested(order.requestId);
            live.order.cancelRequestedAt = live.order.cancelRequestedAt || Date.now();
            live.status.setAttribute("tabindex", "-1");
            paint(live);
            if (live.cancel === wrap) removeControls(live);
            focusHere(live.status);
          } else if (live === view && canCancel(view)) {
            say(CANCEL_FAILED_TEXT, true);
            showButton(true);
          } else {
            // Saloni's status moved on (or the dialog was rebuilt) while the request was out: say so on the card that is on screen.
            if (live.cancel === wrap) { removeControls(live); live.status.setAttribute("tabindex", "-1"); focusHere(live.status); }
            showNote(live, CANCEL_FAILED_TEXT, "my-order-note is-error");
          }
        });
      });
      focusHere(keep);
    }
    showButton(false);
    return wrap;
  }
  function render() {
    var orders = read();
    views = [];
    while (listElement.firstChild) listElement.removeChild(listElement.firstChild);
    orders.forEach(function (order) { listElement.appendChild(renderOrder(order)); });
    emptyElement.hidden = orders.length > 0;
    listElement.hidden = !orders.length;
    contactElement.hidden = !orders.length;
  }
  // Ask for the live status of every remembered order, at most once a minute. The answer is stored and painted in place (an open
  // cancel confirm stays open); any failure is silent and the last known status stays on screen.
  function refreshStatuses() {
    if (statusInFlight || !execUrl()) return;
    var now = Date.now();
    if (lastStatusCheckAt && now - lastStatusCheckAt < STATUS_CHECK_GAP_MS && now >= lastStatusCheckAt) return;
    var ids = read().map(function (order) { return order.requestId; }).filter(function (id) { return CANCELLABLE_ID.test(id); }).slice(0, MAX_ORDERS);
    if (!ids.length) return;
    statusInFlight = true;
    lastStatusCheckAt = now;
    postAction("status", { requestIds: ids }, STATUS_TIMEOUT_MS).then(function (reply) {
      statusInFlight = false;
      if (!reply || reply.ok !== true || !reply.statuses || typeof reply.statuses !== "object") return;
      storeStatuses(reply.statuses);
      storeAdvances(reply.advance);
      views.forEach(function (view) {
        var code = Object.prototype.hasOwnProperty.call(reply.statuses, view.order.requestId) ? reply.statuses[view.order.requestId] : null;
        if (!isStatusCode(code)) return;
        view.order.status = code;
        view.order.statusCheckedAt = Date.now();
        paint(view);
      });
      // An order the server did not answer for (or one whose advance went away) loses its Pay button too.
      views.forEach(paintAdvance);
    }, function () { statusInFlight = false; });
  }
  // A cancel confirm sits low in a scrolling panel, so its buttons are focused with scrolling on.
  function focusIfPossible(target, scrollIntoView) {
    if (!target || typeof target.focus !== "function") return;
    if (scrollIntoView) target.focus(); else target.focus({ preventScroll: true });
  }
  function open(from) {
    if (!dialog || typeof dialog.showModal !== "function") return false;
    opener = from || null;
    // A step back from the last close is still on its way: open once it has landed.
    if (backPending) { pendingOpener = opener; return true; }
    render();
    pushHistory();
    if (!dialog.open) dialog.showModal();
    focusIfPossible(closeButton);
    refreshStatuses();
    return true;
  }
  function openFromLink(link, event) {
    if (!dialog || typeof dialog.showModal !== "function") return;
    if (event && (event.defaultPrevented || (event.button !== undefined && event.button !== 0) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    if (event && event.preventDefault) event.preventDefault();
    // On a phone the menu closes in this same click. Open after two frames, once the page has laid out without it;
    // opened sooner, the browser applies its scroll adjustment for the menu only after the dialog closes (a jump).
    var raf = window.requestAnimationFrame;
    if (typeof raf !== "function") { open(link); return; }
    raf.call(window, function () { raf.call(window, function () { open(link); }); });
  }

  if (dialog && listElement && emptyElement && contactElement) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-my-orders-open]"), function (link) {
      link.addEventListener("click", function (event) { openFromLink(link, event); });
    });
    dialog.addEventListener("close", function () {
      var skip = leaveFocusAlone;
      var from = opener;
      leaveFocusAlone = false;
      opener = null;
      consumeHistory();
      closedByHistory = false;
      if (skip) return;
      // On a phone the menu closes when My orders is tapped, so the link is hidden: fall back to the menu button.
      var visible = from && typeof from.getClientRects === "function" && from.getClientRects().length > 0;
      focusIfPossible(visible ? from : document.getElementById("nav-toggle"));
    });
    // Tapping the backdrop closes it; the panel fills the rest of the dialog.
    dialog.addEventListener("click", function (event) { if (event && event.target === dialog) dialog.close(); });
    // Capture on the link itself, so the dialog is closed before the catalogue takes focus.
    Array.prototype.forEach.call(dialog.querySelectorAll("[data-browse-all]"), function (link) {
      link.addEventListener("click", function () { leaveFocusAlone = true; dropHistoryEntry(); dialog.close(); }, true);
    });
    if (window.addEventListener) window.addEventListener("popstate", function (event) {
      if (backPending) {
        backPending = false;
        var from = pendingOpener;
        pendingOpener = null;
        if (from) open(from);
        return;
      }
      if (historyActive && !isHistoryState(event && event.state)) {
        closedByHistory = true;
        if (dialog.open) dialog.close();
        return;
      }
      if (!historyActive && !dialog.open && isHistoryState(event && event.state)) {
        try { window.history.back(); } catch (error) {}
      }
    });
  }

  window.saloniMyOrders = { save: save, list: read, open: open };
}());
