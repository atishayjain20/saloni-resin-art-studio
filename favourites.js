/*
 * "My favourites": pieces a shopper has hearted, kept in localStorage on this device only (no account, no server).
 * The record is {"version":1,"slugs":[...]}, newest first, with no expiry. A slug is the product's data-product-slug,
 * which stays the same when a card moves. A slug with no card on this page is left out of the list and the count,
 * and is dropped the next time the list is saved. Where storage is blocked the list lasts for the visit only.
 * Each home-page card gets a heart button after its photo link; the header button, the menu link, the My favourites
 * dialog (the My orders dialog's look) and the heart in the product popup all read the same list.
 * Nothing here is sent to analytics. This script is loaded on the home page only; it runs after script.js,
 * so the cards' "Add to cart" buttons already exist.
 */
(function () {
  "use strict";
  var STORAGE_KEY = "saloniFavourites";
  var VERSION = 1;
  var MAX_SLUGS = 200;
  var MAX_RAW_LENGTH = 10000;
  var SLUG = /^[a-z0-9-]{1,80}$/;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var HEART_PATH = "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z";
  var CART_FULL_TEXT = "Your cart is full. Remove an item first.";

  var pieces = {};
  var slugs = [];

  function storage() {
    try { return window.localStorage || null; } catch (error) { return null; }
  }
  function load() {
    var store = storage();
    if (!store) return [];
    var record = null;
    try {
      var raw = store.getItem(STORAGE_KEY);
      if (raw === null || raw === undefined) return [];
      if (typeof raw === "string" && raw.length <= MAX_RAW_LENGTH) record = JSON.parse(raw);
    } catch (error) { record = null; }
    if (!record || record.version !== VERSION || !Array.isArray(record.slugs)) {
      try { store.removeItem(STORAGE_KEY); } catch (error) {}
      return [];
    }
    var seen = {};
    return record.slugs.filter(function (slug) {
      if (typeof slug !== "string" || !SLUG.test(slug) || seen[slug]) return false;
      seen[slug] = true;
      return true;
    }).slice(0, MAX_SLUGS).filter(function (slug) { return Boolean(pieces[slug]); });
  }
  function save() {
    var store = storage();
    if (!store) return;
    try {
      if (slugs.length) store.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, slugs: slugs }));
      else store.removeItem(STORAGE_KEY);
    } catch (error) {}
  }
  function isSaved(slug) { return slugs.indexOf(slug) !== -1; }
  function setSaved(slug, saved) {
    if (!pieces[slug] || isSaved(slug) === saved) return;
    slugs = saved ? [slug].concat(slugs).slice(0, MAX_SLUGS) : slugs.filter(function (item) { return item !== slug; });
    save();
    refresh();
  }

  function element(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function heartIcon() {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "favourite-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", HEART_PATH);
    svg.appendChild(path);
    return svg;
  }
  function paintHeart(heart, slug) {
    var saved = isSaved(slug);
    heart.setAttribute("aria-pressed", saved ? "true" : "false");
    heart.setAttribute("aria-label", (saved ? "Remove " : "Save ") + pieces[slug].name + (saved ? " from favourites" : " to favourites"));
  }

  // --- the cards ---
  function textOf(node) { return node && node.textContent ? String(node.textContent).trim() : ""; }
  Array.prototype.forEach.call(document.querySelectorAll(".catalogue-grid [data-lightbox-trigger][data-product-slug]"), function (trigger) {
    var slug = trigger.getAttribute("data-product-slug");
    var card = typeof trigger.closest === "function" ? trigger.closest("article") : null;
    var name = card ? textOf(card.querySelector("figcaption strong, figcaption h3")) : "";
    if (!slug || !SLUG.test(slug) || pieces[slug] || !card || !name || !trigger.parentNode) return;
    var heart = element("button", "favourite-toggle");
    heart.setAttribute("type", "button");
    heart.appendChild(heartIcon());
    trigger.parentNode.insertBefore(heart, trigger.nextSibling);
    pieces[slug] = {
      slug: slug, name: name, trigger: trigger, heart: heart,
      thumb: trigger.getAttribute("data-thumb") || "",
      price: textOf(card.querySelector(".product-pricing dd")),
      sizes: textOf(card.querySelector(".product-size-count")),
      cart: card.querySelector('[data-order-prefill="catalogue"]')
    };
    heart.addEventListener("click", function () { setSaved(slug, !isSaved(slug)); });
  });
  slugs = load();

  // --- header, menu, popup ---
  var header = document.getElementById("favourites-header");
  var headerCount = document.getElementById("favourites-header-count");
  var menuCount = document.getElementById("favourites-menu-count");
  var popupHeart = document.getElementById("lightbox-favourite");
  var popup = document.getElementById("art-lightbox");
  var dialog = document.getElementById("favourites-dialog");
  var closeButton = document.getElementById("favourites-close");
  var listElement = document.getElementById("favourites-list");
  var emptyElement = document.getElementById("favourites-empty");
  var statusElement = document.getElementById("favourites-status");
  var headerCart = document.getElementById("catalogue-header-cart");

  function popupSlug() {
    var slug = popup && typeof popup.getAttribute === "function" ? popup.getAttribute("data-product-slug") : "";
    return slug && pieces[slug] ? slug : "";
  }
  function refresh() {
    var count = slugs.length;
    Object.keys(pieces).forEach(function (slug) { paintHeart(pieces[slug].heart, slug); });
    if (header) {
      header.hidden = count === 0;
      header.setAttribute("aria-label", count ? "My favourites, " + count + (count === 1 ? " item" : " items") : "My favourites");
    }
    if (headerCount) headerCount.textContent = count ? String(count) : "";
    if (menuCount) menuCount.textContent = count ? "(" + count + ")" : "";
    if (popupHeart) {
      var shown = popupSlug();
      popupHeart.hidden = !shown;
      if (shown) paintHeart(popupHeart, shown);
    }
  }
  if (popupHeart) {
    popupHeart.appendChild(heartIcon());
    popupHeart.addEventListener("click", function () {
      var shown = popupSlug();
      if (shown) setSaved(shown, !isSaved(shown));
    });
    if (popup && typeof window.MutationObserver === "function") {
      try { new window.MutationObserver(refresh).observe(popup, { attributes: true, attributeFilter: ["data-product-slug"] }); } catch (error) {}
    }
  }
  refresh();

  // --- the dialog ---
  var opener = null;
  var leaveFocusAlone = false;
  // The same history pattern as My orders: opening adds one history entry, so the phone Back button closes the dialog;
  // closing any other way steps that entry back so none is left behind.
  var historyActive = false;
  var closedByHistory = false;
  var backPending = false;
  var pendingOpener = null;

  function isHistoryState(state) { return Boolean(state && state.saloniFavourites); }
  function pushHistory() {
    var history = window.history;
    if (!history || typeof history.pushState !== "function") return;
    if (historyActive || isHistoryState(history.state)) { historyActive = true; return; }
    try {
      history.pushState(Object.assign({}, history.state || {}, { saloniFavourites: true }), "", window.location && window.location.href ? window.location.href : "");
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
  // Leaving to something that adds its own history entry: forget ours in place rather than stepping back.
  function dropHistoryEntry() {
    if (!historyActive) return;
    historyActive = false;
    var history = window.history;
    if (!history || typeof history.replaceState !== "function") return;
    try {
      var next = Object.assign({}, history.state || {});
      delete next.saloniFavourites;
      history.replaceState(next, "", window.location && window.location.href ? window.location.href : "");
    } catch (error) {}
  }
  function focusIfPossible(target) {
    if (target && typeof target.focus === "function") target.focus({ preventScroll: true });
  }
  // Closes the dialog for a click that goes somewhere else on the page, which then keeps the focus.
  function leave() {
    leaveFocusAlone = true;
    dropHistoryEntry();
    dialog.close();
  }

  function inCart(piece) { return piece.cart.getAttribute("aria-pressed") === "true"; }
  function paintCartButton(piece, add) {
    var added = inCart(piece);
    add.textContent = added ? "View cart" : "Add to cart";
    add.setAttribute("aria-label", added ? "View cart" : "Add " + piece.name + " to cart");
  }
  function renderRow(piece) {
    var item = element("li", "my-order favourite-item");
    var openButton = element("button", "favourite-open");
    openButton.setAttribute("type", "button");
    openButton.setAttribute("aria-label", "Open " + piece.name);
    if (piece.thumb) {
      var image = element("img", "my-orders-thumb");
      image.setAttribute("src", piece.thumb);
      image.setAttribute("alt", "");
      image.setAttribute("width", "56");
      image.setAttribute("height", "56");
      image.setAttribute("loading", "lazy");
      openButton.appendChild(image);
    }
    var copy = element("span", "my-order-item-copy");
    copy.appendChild(element("span", "my-order-item-name", piece.name));
    var detail = [piece.price, piece.sizes].filter(Boolean).join(" · ");
    if (detail) copy.appendChild(element("span", "my-order-item-detail", detail));
    openButton.appendChild(copy);
    openButton.addEventListener("click", function () {
      leave();
      piece.trigger.click();
    });
    item.appendChild(openButton);
    var actions = element("div", "favourite-actions");
    var note = element("p", "my-order-note", CART_FULL_TEXT);
    note.hidden = true;
    note.setAttribute("role", "status");
    if (piece.cart) {
      var add = element("button", "button button-dark");
      add.setAttribute("type", "button");
      paintCartButton(piece, add);
      add.addEventListener("click", function () {
        // A press on the card's cart button also removes, so a piece already in the cart is never pressed.
        if (inCart(piece)) {
          leave();
          if (headerCart) headerCart.click();
          return;
        }
        piece.cart.click();
        paintCartButton(piece, add);
        note.hidden = inCart(piece);
      });
      actions.appendChild(add);
    }
    var remove = element("button", "button button-line", "Remove");
    remove.setAttribute("type", "button");
    remove.setAttribute("aria-label", "Remove " + piece.name + " from favourites");
    remove.addEventListener("click", function () { removeRow(piece); });
    actions.appendChild(remove);
    item.appendChild(actions);
    item.appendChild(note);
    return item;
  }
  function render() {
    while (listElement.firstChild) listElement.removeChild(listElement.firstChild);
    slugs.forEach(function (slug) { listElement.appendChild(renderRow(pieces[slug])); });
    emptyElement.hidden = slugs.length > 0;
    listElement.hidden = slugs.length === 0;
  }
  function removeRow(piece) {
    var index = slugs.indexOf(piece.slug);
    setSaved(piece.slug, false);
    render();
    if (statusElement) statusElement.textContent = "Removed " + piece.name + " from favourites.";
    var rows = listElement.children;
    var target = rows[index] || rows[index - 1];
    if (target) focusIfPossible(target.children[0]);
    else focusIfPossible(typeof dialog.querySelector === "function" ? dialog.querySelector("[data-browse-all]") : null);
  }
  function open(from) {
    if (!dialog || typeof dialog.showModal !== "function") return;
    opener = from || null;
    // A step back from the last close is still on its way: open once it has landed.
    if (backPending) { pendingOpener = opener; return; }
    if (statusElement) statusElement.textContent = "";
    render();
    pushHistory();
    if (!dialog.open) dialog.showModal();
    focusIfPossible(closeButton);
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

  if (dialog && closeButton && listElement && emptyElement) {
    if (header) header.addEventListener("click", function () { open(header); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-favourites-open]"), function (link) {
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
      // On a phone the menu closes when My favourites is tapped, so the link is hidden: fall back to the menu button.
      var visible = from && typeof from.getClientRects === "function" && from.getClientRects().length > 0;
      focusIfPossible(visible ? from : document.getElementById("nav-toggle"));
    });
    // Tapping the backdrop closes it; the panel fills the rest of the dialog.
    dialog.addEventListener("click", function (event) { if (event && event.target === dialog) dialog.close(); });
    // Capture on the link itself, so the dialog is closed before the catalogue takes focus.
    Array.prototype.forEach.call(dialog.querySelectorAll("[data-browse-all]"), function (link) {
      link.addEventListener("click", leave, true);
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
}());
