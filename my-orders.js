/*
 * "My orders": a short record of the requests this browser has sent, kept in localStorage for 30 days.
 * order-form.js calls window.saloniMyOrders.save(summary) only after the server confirms a request.
 * Nothing personal is stored: no phone, email, address, PIN, images or referral code.
 * "Cancel order" only ASKS Saloni to cancel: it posts the request ID to the same Apps Script URL the order form uses
 * (action=cancel) and, once the server confirms, remembers that as cancelRequestedAt on the stored entry.
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
  var CANCEL_STATUS_TEXT = "Cancellation requested — Saloni will confirm";
  var CANCEL_FAILED_TEXT = "Could not send the request. Please try again or call/WhatsApp Saloni.";
  var CANCEL_TIMEOUT_MS = 25000;
  // The server only accepts request IDs of this shape (Code.gs ORDER_REQUEST_ID_PATTERN); older or odd IDs get no button.
  var CANCELLABLE_ID = /^[A-Za-z0-9_-]{12,80}$/;

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
    var valid = { requestId: entry.requestId, at: at, items: items, fulfillment: entry.fulfillment, notes: notes };
    if (entry.cancelRequestedAt !== undefined) {
      var asked = entry.cancelRequestedAt;
      if (typeof asked !== "number" || asked % 1 !== 0 || asked < at - CLOCK_SKEW_MS || asked > now + CLOCK_SKEW_MS) return null;
      valid.cancelRequestedAt = asked;
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
  // answer; rejects on a network error, a non-JSON answer, or when nothing has answered after CANCEL_TIMEOUT_MS.
  function requestCancellation(requestId) {
    var url = execUrl();
    if (!url || typeof window.fetch !== "function") return Promise.reject(new Error("not configured"));
    var controller = typeof window.AbortController === "function" ? new window.AbortController() : null;
    var timer = typeof window.setTimeout === "function" ? window.setTimeout(function () { if (controller) controller.abort(); }, CANCEL_TIMEOUT_MS) : null;
    function stopTimer() { if (timer !== null && typeof window.clearTimeout === "function") window.clearTimeout(timer); }
    var init = { method: "POST", credentials: "omit", body: JSON.stringify({ requestId: requestId }) };
    if (controller) init.signal = controller.signal;
    try {
      return window.fetch(url + "?action=cancel", init)
        .then(function (response) { return response.json(); })
        .then(function (data) { stopTimer(); return data; }, function (error) { stopTimer(); throw error; });
    } catch (error) {
      stopTimer();
      return Promise.reject(error);
    }
  }

  // --- the dialog ---
  var dialog = document.getElementById("my-orders-dialog");
  var closeButton = document.getElementById("my-orders-close");
  var listElement = document.getElementById("my-orders-list");
  var emptyElement = document.getElementById("my-orders-empty");
  var contactElement = document.getElementById("my-orders-contact");
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
    var status = element("p", "my-order-status", order.cancelRequestedAt ? CANCEL_STATUS_TEXT : STATUS_TEXT);
    card.appendChild(status);
    if (!order.cancelRequestedAt && CANCELLABLE_ID.test(order.requestId) && execUrl() && typeof window.fetch === "function") card.appendChild(cancelControls(order, status));
    return card;
  }
  function plainButton(className, label) {
    var node = element("button", className, label);
    node.setAttribute("type", "button");
    return node;
  }
  function clearChildren(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  // Cancel order -> in-place confirm -> request. The confirm takes the button's place, so the card keeps its height.
  // Focus goes to the confirm's safe choice, then back to the button (Keep order, failure) or the status (success).
  function cancelControls(order, status) {
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
        yes.disabled = true;
        keep.disabled = true;
        group.setAttribute("aria-busy", "true");
        say("Sending your request…", false);
        requestCancellation(order.requestId).then(function (reply) { return Boolean(reply) && reply.ok === true; }, function () { return false; }).then(function (sent) {
          sending = false;
          if (sent) {
            // The server has it. Storage trouble must not turn that into an error: the status still shows.
            markCancelRequested(order.requestId);
            status.textContent = CANCEL_STATUS_TEXT;
            status.setAttribute("tabindex", "-1");
            if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
            focusHere(status);
          } else {
            say(CANCEL_FAILED_TEXT, true);
            showButton(true);
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
    while (listElement.firstChild) listElement.removeChild(listElement.firstChild);
    orders.forEach(function (order) { listElement.appendChild(renderOrder(order)); });
    emptyElement.hidden = orders.length > 0;
    listElement.hidden = !orders.length;
    contactElement.hidden = !orders.length;
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
