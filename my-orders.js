/*
 * "My orders": a short record of the requests this browser has sent, kept in localStorage for 30 days.
 * order-form.js calls window.saloniMyOrders.save(summary) only after the server confirms a request.
 * Nothing personal is stored: no phone, email, address, PIN, images or referral code.
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
  var STATUS_TEXT = "Request sent — Saloni will contact you to confirm";

  function storage() {
    try { return window.localStorage || null; } catch (error) { return null; }
  }
  function text(value, maxLength, required) {
    if (typeof value !== "string") return null;
    var trimmed = value.trim();
    if (trimmed.length > maxLength || (required && !trimmed)) return null;
    return trimmed;
  }
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
    return { requestId: entry.requestId, at: at, items: items, fulfillment: entry.fulfillment, notes: notes };
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

  function clear() {
    var store = storage();
    if (!store) return;
    try { store.removeItem(STORAGE_KEY); } catch (error) {}
  }

  // --- the dialog ---
  var dialog = document.getElementById("my-orders-dialog");
  var closeButton = document.getElementById("my-orders-close");
  var listElement = document.getElementById("my-orders-list");
  var emptyElement = document.getElementById("my-orders-empty");
  var contactElement = document.getElementById("my-orders-contact");
  var clearArea = document.getElementById("my-orders-clear-area");
  var clearButton = document.getElementById("my-orders-clear");
  var confirmElement = document.getElementById("my-orders-confirm");
  var confirmYes = document.getElementById("my-orders-confirm-yes");
  var confirmNo = document.getElementById("my-orders-confirm-no");
  var opener = null;
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
    card.appendChild(element("p", "my-order-status", STATUS_TEXT));
    return card;
  }
  function render() {
    var orders = read();
    while (listElement.firstChild) listElement.removeChild(listElement.firstChild);
    orders.forEach(function (order) { listElement.appendChild(renderOrder(order)); });
    emptyElement.hidden = orders.length > 0;
    listElement.hidden = !orders.length;
    contactElement.hidden = !orders.length;
    clearArea.hidden = !orders.length;
    confirmElement.hidden = true;
  }
  function focusIfPossible(target) { if (target && typeof target.focus === "function") target.focus({ preventScroll: true }); }
  function open(from) {
    if (!dialog || typeof dialog.showModal !== "function") return false;
    opener = from || null;
    // A step back from the last close is still on its way: open once it has landed.
    if (backPending) { pendingOpener = opener; return true; }
    render();
    pushHistory();
    if (!dialog.open) dialog.showModal();
    focusIfPossible(closeButton);
    return true;
  }
  function openFromLink(link, event) {
    if (!dialog || typeof dialog.showModal !== "function") return;
    if (event && (event.defaultPrevented || (event.button !== undefined && event.button !== 0) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    if (event && event.preventDefault) event.preventDefault();
    open(link);
  }

  if (dialog && listElement && emptyElement && contactElement && clearArea && clearButton && confirmElement && confirmYes && confirmNo) {
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
    clearButton.addEventListener("click", function () {
      confirmElement.hidden = false;
      focusIfPossible(confirmNo);
    });
    confirmNo.addEventListener("click", function () {
      confirmElement.hidden = true;
      focusIfPossible(clearButton);
    });
    confirmYes.addEventListener("click", function () {
      clear();
      render();
      focusIfPossible(closeButton);
    });
  }

  window.saloniMyOrders = { save: save, list: read, clear: clear, open: open };
}());
