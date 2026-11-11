const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
// The lightbox harnesses run only the lightbox block, so they also need the shared AI-photo helpers.
const aiPhotoHelpers = script.slice(script.indexOf("  function aiImageNames("), script.indexOf('  document.documentElement.classList.add("js");'));
const customizer = fs.readFileSync(path.join(root, "customizer.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const icons = fs.readFileSync(path.join(root, "assets/category-icons.svg"), "utf8");

function section(id) {
  const match = html.match(new RegExp(`<section[^>]+id=["']${id}["'][\\s\\S]*?<\\/section>`));
  assert.ok(match, `expected #${id}`);
  return match[0];
}

const bannerSlides = [
  { label: "Premium", name: "Premium gifts", shortcut: "premium", href: "#premium-collection", images: ["premium-midnight-blue-tiered-set.jpeg", "premium-turquoise-tray-coasters.jpeg", "premium-smoky-bronze-tray.jpeg"] },
  { label: "Couple", name: "Couple gifts", shortcut: "couple", href: "#romantic-keepsakes", images: ["romantic-heart-trinket-tray.webp", "romantic-initial-desk-stand.webp", "romantic-us-keychain-pair.webp"] },
  { label: "Marriage", name: "Marriage gifts", shortcut: "marriage", href: "#marriage-gifts", images: ["marriage-ring-platter.webp", "marriage-varmala-frame.webp", "marriage-couple-nameplate.webp"] },
  { label: "Corporate", name: "Corporate gifts", shortcut: "corporate", href: "#corporate-resin-gifts", images: ["corporate-desk-nameplate-concept.webp", "corporate-logo-coaster-set-concept.webp", "corporate-recognition-award-concept.webp"] },
  { label: "Diwali", name: "Diwali gifts", shortcut: "diwali", href: "#diwali", images: ["diwali-shubh-labh-welcome-pair.jpg", "diwali-lotus-blue-festive-set.jpeg", "diwali-ocean-bloom-pooja-platter.jpg"] },
];

function bannerSlideHtml() {
  return Array.from(section("hero").matchAll(/<article class="hero-slide[^"]*"[\s\S]*?<\/article>/g), (match) => match[0]);
}

test("homepage first screen is a five-slide hero banner ordered Premium, Couple, Marriage, Corporate, Diwali", () => {
  const hero = section("hero");
  assert.match(hero, /^<section class="hero-banner shell" id="hero" aria-labelledby="hero-title" aria-roledescription="carousel">/);
  assert.match(hero, /<h1 id="hero-title" class="sr-only">Handmade resin gifts from Ajmer<\/h1>/);
  assert.doesNotMatch(html, /Made for the moment|hero-collage|hero-note|hero-actions|hero-catalogue-action/);
  assert.doesNotMatch(hero, /data-lightbox|reveal|Explore gifts|data-browse-all/);
  assert.match(hero, /<div class="hero-banner-track" data-banner-track>/);
  const slides = bannerSlideHtml();
  assert.equal(slides.length, 5);
  slides.forEach((slide, index) => {
    const expected = bannerSlides[index];
    assert.match(slide, new RegExp(`role="group" aria-roledescription="slide" aria-label="${index + 1} of 5: ${expected.label}"`));
    assert.doesNotMatch(slide, /<h2|class="eyebrow"|hero-slide-copy/);
    assert.equal((slide.match(/<a\b/g) || []).length, 1);
    assert.match(slide, new RegExp(`<a class="button button-dark hero-slide-cta" href="${expected.href}" data-category-shortcut="${expected.shortcut}" aria-label="Shop now: ${expected.name}">Shop now</a>`));
    assert.deepEqual(Array.from(slide.matchAll(/<img\b[^>]*src="assets\/([^"]+)"/g), (match) => match[1]), expected.images);
  });
  assert.deepEqual(Array.from(hero.matchAll(/data-category-shortcut="([^"]+)"/g), (match) => match[1]), ["premium", "couple", "marriage", "corporate", "diwali"]);
  assert.match(hero, /<a href="#customizer" data-customizer-open>Or design a custom frame<\/a>/);
  assert.doesNotMatch(hero, /class="instagram-mark"|Request a custom gift|hero-floral-bouquet\.jpg/);
  const footer = html.match(/<footer class="site-footer"[\s\S]*?<\/footer>/)?.[0] || "";
  assert.match(footer, /<a class="instagram-mark" href="https:\/\/www\.instagram\.com\/saloniresin_art_studio\/" target="_blank" rel="noreferrer">Follow the studio <strong>@saloniresin_art_studio<\/strong><\/a>/);
  assert.doesNotMatch(footer, />Instagram<\/a>/);
  assert.doesNotMatch(html, /Some catalogue images are illustrative or reference ideas\. Saloni confirms availability, materials, final design, quote, and delivery\./);
});

test("hero banner images exist, carry alt and size, and only slide 1 loads eagerly", () => {
  const slides = bannerSlideHtml();
  assert.equal(slides.length, 5);
  slides.forEach((slide, slideIndex) => {
    const images = Array.from(slide.matchAll(/<img\b[^>]*>/g), (match) => match[0]);
    assert.equal(images.length, 3);
    images.forEach((image, imageIndex) => {
      const src = image.match(/\bsrc="(assets\/[^"]+)"/)?.[1];
      assert.ok(src && fs.existsSync(path.join(root, src)), `${src} must exist`);
      assert.match(image, /\balt="[^"]{9,}"/);
      assert.match(image, /\bwidth="\d+"/);
      assert.match(image, /\bheight="\d+"/);
      if (/corporate-|romantic-|marriage-/.test(src)) assert.match(image, /alt="Illustrative preview: /);
      if (slideIndex === 0) {
        assert.doesNotMatch(image, /loading="lazy"/);
        assert.equal(/fetchpriority="high"/.test(image), imageIndex === 0);
      } else {
        assert.match(image, /loading="lazy" decoding="async"/);
        assert.doesNotMatch(image, /fetchpriority/);
      }
    });
  });
});

test("hero banner controls are previous, five dots, then next, hidden without JavaScript", () => {
  const hero = section("hero");
  const controls = hero.match(/<div class="hero-banner-controls">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.ok(hero.indexOf("hero-banner-controls") > hero.lastIndexOf("</article>"), "controls follow the track");
  assert.ok(hero.indexOf("data-customizer-open") > hero.indexOf("data-banner-next"), "custom-frame link sits below the controls");
  assert.match(controls, /data-banner-prev[^>]*aria-label="Previous slide"/);
  assert.match(controls, /data-banner-next[^>]*aria-label="Next slide"/);
  assert.deepEqual(Array.from(controls.matchAll(/data-banner-dot[^>]*aria-label="(Show slide \d)"/g), (match) => match[1]), ["Show slide 1", "Show slide 2", "Show slide 3", "Show slide 4", "Show slide 5"]);
  assert.equal((controls.match(/aria-current="true"/g) || []).length, 1);
  assert.ok(controls.indexOf("data-banner-prev") < controls.indexOf("data-banner-dot") && controls.lastIndexOf("data-banner-dot") < controls.indexOf("data-banner-next"));
  assert.match(css, /html:not\(\.js\) \.hero-banner-controls\s*\{[^}]*display:\s*none/);
});

test("initHeroBanner scrolls by slide without timers and honours reduced motion", () => {
  const start = script.indexOf("  function initHeroBanner(");
  assert.ok(start >= 0, "expected initHeroBanner");
  const body = script.slice(start, script.indexOf("\n  }\n", start) + 5);
  assert.doesNotMatch(body, /setInterval|setTimeout/);
  assert.match(body, /prefers-reduced-motion: reduce/);
  assert.match(body, /requestAnimationFrame/);
  assert.match(script, /initHeroBanner\(\);/);

  const listeners = {};
  const scrolls = [];
  const track = {
    scrollLeft: 0,
    scrollTo(options) { scrolls.push(options); track.scrollLeft = options.left; track.listeners.scroll(); },
    listeners,
    addEventListener(type, listener) { listeners[type] = listener; },
  };
  const slides = [0, 300, 600, 900].map((offsetLeft) => ({ offsetLeft }));
  track.querySelectorAll = (selector) => (selector === ".hero-slide" ? slides : []);
  const button = () => ({ disabled: false, attrs: {}, listeners: {}, addEventListener(type, listener) { this.listeners[type] = listener; }, setAttribute(name, value) { this.attrs[name] = value; }, removeAttribute(name) { delete this.attrs[name]; } });
  const prev = button();
  const next = button();
  const dots = [button(), button(), button(), button()];
  const documentObject = {
    querySelector(selector) { return { "[data-banner-track]": track, "[data-banner-prev]": prev, "[data-banner-next]": next }[selector] || null; },
    querySelectorAll(selector) { return selector === "[data-banner-dot]" ? dots : []; },
  };
  let reduced = false;
  const windowObject = { matchMedia: () => ({ matches: reduced }), requestAnimationFrame: (callback) => callback() };
  const context = { document: documentObject, window: windowObject, Math };
  vm.createContext(context);
  vm.runInContext(`(function () {\n${body}\ninitHeroBanner();\n})();`, context);
  assert.equal(prev.disabled, true);
  assert.equal(next.disabled, false);
  assert.equal(dots[0].attrs["aria-current"], "true");
  next.listeners.click();
  assert.deepEqual(JSON.parse(JSON.stringify(scrolls.pop())), { left: 300, behavior: "smooth" });
  assert.equal(dots[1].attrs["aria-current"], "true");
  assert.equal(dots[0].attrs["aria-current"], undefined);
  assert.equal(prev.disabled, false);
  reduced = true;
  dots[3].listeners.click();
  assert.deepEqual(JSON.parse(JSON.stringify(scrolls.pop())), { left: 900, behavior: "auto" });
  assert.equal(next.disabled, true);
  prev.listeners.click();
  assert.deepEqual(JSON.parse(JSON.stringify(scrolls.pop())), { left: 600, behavior: "auto" });
  assert.equal(next.disabled, false);
});

function rootToken(name) {
  return css.match(new RegExp(`:root\\s*\\{[^}]*--${name}:\\s*([^;]+);`))?.[1].trim();
}

function luminance(hex) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const [r, g, b] = channels.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

test("jewel festive palette tokens and primary button colours", () => {
  assert.equal(rootToken("ivory"), "#fff6e9");
  assert.equal(rootToken("paper"), "#ffffff");
  assert.equal(rootToken("ink"), "#2a0e1f");
  assert.equal(rootToken("rose"), "#b0125b");
  assert.equal(rootToken("cocoa"), "#b0125b");
  assert.equal(rootToken("marigold"), "#f2a007");
  assert.equal(rootToken("leaf"), "#0e7c7b");
  assert.match(css, /\.button-dark\s*\{[^}]*background:\s*var\(--rose\)[^}]*color:\s*#fff/);
  assert.match(css, /\.button-dark:hover, \.button-dark:focus-visible\s*\{[^}]*background:\s*var\(--rose-ink\)/);
  assert.match(css, /\.catalogue-order-button\s*\{[^}]*background:\s*var\(--rose\)[^}]*color:\s*#fff/);
  assert.match(css, /\.premium-collection-section \.catalogue-order-button\s*\{[^}]*background:\s*transparent/);
  assert.match(css, /\.catalogue-cart-jump \.button-dark\s*\{[^}]*background:\s*var\(--rose\)[^}]*color:\s*#fff/);
  assert.match(css, /\.hero-banner-dot\[aria-current="true"\]::before\s*\{[^}]*background:\s*var\(--leaf\)/);
  assert.match(css, /\.hero-banner-custom a\s*\{[^}]*color:\s*#0c7372/, "a slightly darker teal stays readable on the pink page");
  assert.match(css, /product-pricing > div:first-child dd\s*\{[^}]*background:\s*var\(--marigold\)[^}]*color:\s*var\(--ink\)/);
});

test("jewel festive palette keeps WCAG AA contrast for text and primary buttons", () => {
  const [ivory, paper, ink, muted] = ["ivory", "paper", "ink", "muted"].map(rootToken);
  const [rose, roseInk, marigold, leaf] = ["rose", "rose-ink", "marigold", "leaf"].map(rootToken);
  const atLeast = (foreground, background, ratio, label) => assert.ok(contrast(foreground, background) >= ratio, `${label}: ${contrast(foreground, background).toFixed(2)}`);
  atLeast(ink, ivory, 4.5, "body on cream");
  atLeast(ink, paper, 4.5, "body on white");
  atLeast(muted, ivory, 4.5, "muted on cream");
  atLeast(muted, paper, 4.5, "muted on white");
  atLeast("#ffffff", rose, 4.5, "button text on magenta");
  atLeast("#ffffff", roseInk, 4.5, "button hover text");
  atLeast(rose, ivory, 4.5, "magenta text on cream");
  atLeast(roseInk, ivory, 4.5, "dark magenta text on cream");
  atLeast(ink, marigold, 4.5, "price text on saffron fill");
  atLeast(leaf, ivory, 4.5, "teal link on cream");
  atLeast(leaf, paper, 4.5, "teal link on white");
});

test("focus rings on plum surfaces use cream so they keep 3:1 contrast", () => {
  const rule = css.match(/\.catalogue-cart-jump :focus-visible,[^{]*\{([^}]*)\}/);
  assert.ok(rule, "expected a dark-surface focus rule");
  assert.match(css.match(/\.catalogue-cart-jump :focus-visible,([^{]*)\{/)[1], /\.order-section \.order-panel :focus-visible[\s\S]*\.customizer-summary-card :focus-visible[\s\S]*\.premium-collection-section :focus-visible/);
  assert.match(rule[1], /outline-color:\s*var\(--ivory\)/);
  assert.ok(contrast(rootToken("ivory"), rootToken("ink")) >= 3, "cream ring on plum");
  assert.ok(contrast(rootToken("rose"), rootToken("ink")) < 3, "the default magenta ring is too faint on plum");
  assert.match(css, /\.premium-collection-section \.catalogue-order-button:focus-visible\s*\{[^}]*border-color:\s*var\(--premium-gold\)/);
});

test("leftover beige colours use the new cream and the phone bar matches the pink header", () => {
  assert.doesNotMatch(css, /#ead6cc|rgba\(247, 240, 231, \.97\)/);
  assert.match(css, /\.customizer-mobile-actions \{[^}]*background:\s*rgba\(255, 246, 233, \.97\)/);
  ["index.html", "partners/index.html", "corporate-gifting/index.html", "resin-photo-frames/index.html", "namokar-mantra-frames/index.html", "reviews/index.html"].forEach((page) => {
    const source = fs.readFileSync(path.join(root, page), "utf8");
    assert.match(source, /<meta name="theme-color" content="#fbd3e5">/, page);
  });
});

test("homepage cache-busts the updated stylesheet, scripts, and customizer", () => {
  assert.match(html, /<link rel="stylesheet" href="styles\.css\?v=20261168">/);
  assert.match(html, /<script class="site-script" src="script\.js\?v=20261168" defer><\/script>/);
  assert.match(html, /<script class="customizer-script" src="customizer\.js\?v=20261168" defer><\/script>/);
  assert.match(html, /<script class="my-orders-script" src="my-orders\.js\?v=20261168" defer><\/script>/);
});

test("every page uses the one shared cache version for its stylesheet and scripts, and the review page loads the shared form script", () => {
  for (const page of ["index.html", "partners/index.html", "corporate-gifting/index.html", "resin-photo-frames/index.html", "namokar-mantra-frames/index.html", "reviews/index.html"]) {
    const source = fs.readFileSync(path.join(root, page), "utf8");
    const versions = [...source.matchAll(/(?:styles\.css|script\.js|customizer\.js|order-form\.js|my-orders\.js|public-forms\.js)\?v=(\d+)/g)].map((match) => match[1]);
    assert.ok(versions.length >= 2, page);
    assert.deepEqual([...new Set(versions)], ["20261168"], page);
  }
  assert.match(fs.readFileSync(path.join(root, "reviews/index.html"), "utf8"), /public-forms\.js\?v=20261168/);
});

test("category tab bar sits in the sticky header after the header row with BESTSELLERS current", () => {
  const header = html.match(/<header class="site-header">([\s\S]*?)<\/header>/)?.[1] || "";
  const nav = header.match(/<nav class="category-tabs" aria-label="Gift categories"><div class="category-tabs-list">([\s\S]*?)<\/div><\/nav>/);
  assert.ok(nav, "category tab nav must live inside .site-header");
  assert.match(header, /<\/nav>\n    <\/div>\n    <nav class="category-tabs"/, "tabs follow the header-inner block");
  const tabs = Array.from(nav[1].matchAll(/<a class="category-tab"([^>]*)>([^<]*)<\/a>/g), (match) => ({ attrs: match[1], label: match[2].trim() }));
  assert.deepEqual(tabs.map((tab) => tab.label), ["Bestsellers", "Premium", "Marriage", "Couple", "Corporate", "Diwali", "All"]);
  const expected = [
    ["#catalogue-filters", "bestsellers"],
    ["#premium-collection", "premium"],
    ["#marriage-gifts", "marriage"],
    ["#romantic-keepsakes", "couple"],
    ["#corporate-resin-gifts", "corporate"],
    ["#diwali", "diwali"],
    ["#catalogue-filters", "all"],
  ];
  tabs.forEach((tab, index) => {
    assert.match(tab.attrs, new RegExp('href="' + expected[index][0] + '"'));
    assert.match(tab.attrs, new RegExp('data-category-tab="' + expected[index][1] + '"'));
    assert.equal(/aria-current="true"/.test(tab.attrs), index === 0);
    assert.equal(/data-browse-all/.test(tab.attrs), index === 6);
    assert.equal(/data-category-shortcut="/.test(tab.attrs), index !== 6);
    assert.doesNotMatch(tab.attrs, /frames/);
    assert.ok(html.includes('id="' + expected[index][0].slice(1) + '"'), expected[index][0] + " target exists");
  });
});

test("category tabs are 44px, scroll sideways quietly, and mark the current tab as a folder tab", () => {
  const list = css.match(/\.category-tabs-list\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(list, /display:\s*flex/);
  assert.match(list, /overflow-x:\s*auto/);
  assert.match(list, /scrollbar-width:\s*none/);
  assert.match(list, /overscroll-behavior-x:\s*contain/);
  assert.match(list, /box-shadow:\s*inset 0 -1px 0 var\(--cocoa\)/);
  assert.match(css, /\.category-tabs-list::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
  const tab = css.match(/\.category-tab\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(tab, /min-height:\s*44px/);
  assert.match(tab, /border-radius:\s*0?\.6rem 0?\.6rem 0 0/);
  assert.match(tab, /text-transform:\s*uppercase/);
  const current = css.match(/\.category-tab\[aria-current="true"\]\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(current, /background:\s*var\(--page\)/);
  assert.match(current, /border-color:\s*var\(--cocoa\)/);
  assert.match(css, /\.category-tab:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--rose\)/);
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced.slice(0, reduced.indexOf("\n}\n")), /\.category-tab\s*\{\s*transition:\s*none;\s*\}/);
});

test("sticky header is fully opaque blush pink and keeps the tabs close under the icon row", () => {
  const header = css.match(/\.site-header\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(header, /background:\s*#fbd3e5/);
  assert.match(css, /\.nav-toggle\s*\{[^}]*background:\s*var\(--paper\)/, "menu button matches the white icon buttons on the pink header");
  assert.doesNotMatch(header, /rgba\(/);
  assert.match(css, /\.site-header:has\(\.category-tabs\) \.header-inner\s*\{[^}]*min-height:\s*0/);
  assert.doesNotMatch(css, /\.site-header \.header-inner\s*\{/, "pages without tabs keep their original header row");
});

test("sticky offset includes the category tab bar and the 1024px block stays last", () => {
  assert.match(css, /--category-tabs-height:\s*2\.75rem/);
  assert.match(css, /--sticky-offset:\s*6rem;/);
  assert.match(css, /:root \{ --sticky-offset: 7\.5rem; \}/);
  assert.match(css, /:root:has\(\.category-tabs\) \{ --sticky-offset: calc\(4\.75rem \+ var\(--category-tabs-height\)\); \}/);
  assert.match(css, /:root:has\(\.category-tabs\) \{ --sticky-offset: calc\(5\.5rem \+ var\(--category-tabs-height\)\); \}/);
  assert.match(css, /\.customizer-preview-panel \{ position: sticky; top: calc\(var\(--sticky-offset\) \+ 1rem\); \}/);
  const last = css.lastIndexOf("@media (");
  assert.equal(css.slice(last, last + "@media (min-width: 1024px)".length), "@media (min-width: 1024px)");
  assert.ok(css.indexOf(".category-tabs-list") < last);
});

test("mobile footer links, Instagram and trust-strip links are at least 44px tall", () => {
  const mobileCss = css.slice(css.indexOf("@media (max-width: 620px)"), css.indexOf("@media (prefers-reduced-motion: reduce)"));
  const tapRule = mobileCss.match(/\.footer-links a, \.site-footer \.instagram-mark, \.site-footer \.hero-trust-strip a\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(tapRule, /display:\s*inline-flex/);
  assert.match(tapRule, /align-items:\s*center/);
  assert.match(tapRule, /min-height:\s*44px/);
  assert.match(mobileCss, /\.site-footer \.wordmark-footer\s*\{[^}]*min-height:\s*44px/);
  assert.match(mobileCss, /\.footer-links\s*\{[^}]*gap:\s*0 1rem/);
});

test("header cart button sits in the catalogue controls and keeps the header on one row on phones", () => {
  const controls = html.match(/<div class="catalogue-control-bar"[\s\S]*?<\/div>/)?.[0] || "";
  const button = controls.match(/<button[^>]*id="catalogue-header-cart"[^>]*>/)?.[0] || "";
  assert.match(button, /\bhidden\b/);
  assert.match(button, /aria-controls="catalogue-selection"/);
  assert.match(button, /aria-label="View cart"/);
  assert.match(controls, /id="catalogue-header-cart-count"[^>]*aria-hidden="true"/);
  assert.match(css, /\.catalogue-header-cart-count\s*\{[^}]*position:\s*absolute/);
  const mobileCss = css.slice(css.indexOf("@media (max-width: 620px)"), css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(mobileCss, /\.header-inner\s*\{[^}]*column-gap:\s*\.5rem/);
  assert.match(css, /@media \(max-width: 620px\)\s*\{[^@]*?\.catalogue-control-bar\s*\{[^}]*gap:\s*\.25rem/);
  assert.match(css, /@media \(max-width: 370px\)\s*\{[^}]*\.site-header \.wordmark-subtitle\s*\{[^}]*letter-spacing:\s*\.08em/);
});

test("hero banner CSS snaps full-bleed photo slides with a bottom-centre Shop now button", () => {
  const mobileStart = css.indexOf("@media (max-width: 620px)");
  const reducedMotionStart = css.indexOf("@media (prefers-reduced-motion: reduce)");
  const mobileCss = css.slice(mobileStart, reducedMotionStart);
  const desktopCopyRule = css.match(/^h1\s*\{([^}]*)\}/m)?.[1] || "";
  const mobileNavRule = mobileCss.match(/\.nav-toggle\s*\{([^}]*)\}/)?.[1] || "";
  const trackRule = css.match(/\.hero-banner-track\s*\{([^}]*)\}/)?.[1] || "";
  const slideRule = css.match(/\.hero-slide\s*\{([^}]*)\}/)?.[1] || "";
  const photosRule = css.match(/\.hero-slide-photos\s*\{([^}]*)\}/)?.[1] || "";
  const ctaRule = css.match(/\.hero-slide-cta\s*\{([^}]*)\}/)?.[1] || "";
  const imageRule = css.match(/\.hero-slide-photos img\s*\{([^}]*)\}/)?.[1] || "";
  const arrowRule = css.match(/\.hero-banner-arrow,\s*\.hero-banner-dot\s*\{([^}]*)\}/)?.[1] || "";
  const wideCss = css.slice(css.indexOf("@media (min-width: 621px)"), css.indexOf("@media (max-width: 840px)"));

  assert.match(desktopCopyRule, /font-size:\s*clamp\(3\.4rem, 7\.1vw, 6\.6rem\)/);
  assert.match(desktopCopyRule, /line-height:\s*0\.97/);
  assert.match(mobileNavRule, /width:\s*44px/);
  assert.match(mobileNavRule, /height:\s*44px/);
  assert.match(mobileNavRule, /min-height:\s*44px/);
  assert.match(trackRule, /display:\s*flex/);
  assert.match(trackRule, /overflow-x:\s*auto/);
  assert.match(trackRule, /scroll-snap-type:\s*x mandatory/);
  assert.match(trackRule, /scrollbar-width:\s*none/);
  assert.match(css, /\.hero-banner-track::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
  assert.match(slideRule, /flex:\s*0 0 100%/);
  assert.match(slideRule, /scroll-snap-align:\s*start/);
  assert.match(photosRule, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(slideRule, /position:\s*relative/);
  assert.doesNotMatch(slideRule, /padding\s*:/);
  assert.match(slideRule, /aspect-ratio:\s*16\s*\/\s*9/);
  assert.doesNotMatch(slideRule, /50svh/, "owner preferred the earlier banner size");
  assert.match(photosRule, /height:\s*100%/);
  assert.match(ctaRule, /position:\s*absolute/);
  assert.match(ctaRule, /bottom:\s*[^;]+;/);
  assert.match(ctaRule, /left:\s*0/);
  assert.match(ctaRule, /right:\s*0/);
  assert.match(ctaRule, /margin-inline:\s*auto/);
  assert.match(ctaRule, /width:\s*max-content/);
  assert.match(ctaRule, /min-height:\s*44px/);
  assert.match(ctaRule, /box-shadow:/);
  assert.doesNotMatch(css, /\.hero-slide(?:-copy|-narrow)\b|\.hero-slide \.eyebrow|\.hero-slide h2|\.hero-banner-title|\.hero-slide:nth-child/);
  assert.match(imageRule, /object-fit:\s*cover/);
  assert.match(wideCss, /\.hero-slide\s*\{[^}]*aspect-ratio:\s*21\s*\/\s*9/);
  assert.doesNotMatch(wideCss, /grid-template-columns:\s*minmax\(0,\s*0?\.8fr\)/);
  assert.match(arrowRule, /width:\s*44px/);
  assert.match(arrowRule, /height:\s*44px/);
  assert.match(css, /\.hero-banner-arrow:focus-visible, \.hero-banner-dot:focus-visible\s*\{[^}]*outline:\s*3px solid/);
  assert.match(css, /\.hero-banner-custom a\s*\{[^}]*min-height:\s*44px/);
  assert.doesNotMatch(css, /\.hero(?:-copy|-actions|-collage|-image|-note|-catalogue-action)\b/);
  assert.doesNotMatch(css, /(?:^|[\s,}])\.hero\s*[{,]/m);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x:\s*hidden/);
  assert.doesNotMatch(css, /#hero\b/);
  assert.doesNotMatch(css, /\.carousel(?:-track)?\s*\{/);
  const lastMedia = css.lastIndexOf("\n@media ");
  assert.match(css.slice(lastMedia), /^\n@media \(min-width: 1024px\) \{/);
});

test("browse gifts keeps the first product row clear of the sticky header", () => {
  assert.match(css, /\.catalogue-status-region, \.catalogue-grid, \.festive-banner/);
  assert.match(css, /\.catalogue-grid, \.festive-banner[^}]*scroll-margin-top:\s*var\(--sticky-offset\)/);
});

test("customer confidence strip sits above the order conversation", () => {
  const order = html.match(/<section class="order-section shell" id="order"[\s\S]*?<\/section>/)?.[0] || "";
  const confidenceStart = order.indexOf('<details class="customer-confidence-strip"');
  const conversationStart = order.indexOf('<details class="order-copy');
  const confidence = order.slice(confidenceStart, conversationStart);
  assert.ok(confidenceStart >= 0, "expected the confidence content inside the order section");
  assert.ok(confidenceStart < conversationStart, "confidence content should precede the conversation copy");
  assert.ok(html.indexOf('class="customer-confidence-strip"') > html.indexOf('id="order"'));
  assert.match(confidence, /<h2[^>]*>What happens next<\/h2>/);
  assert.match(confidence, /repl(?:y|ies) within 5–6 working hours/);
  assert.match(confidence, /4–5 days after design and advance confirmation/);
  assert.match(confidence, /Shipping is across India/);
  assert.match(confidence, /shipping charge is extra and depends on location/);
  assert.match(confidence, /protective packaging/);
  assert.match(confidence, /Advance amount and payment terms are confirmed with the final design and quote/);
  assert.match(confidence, /urgent date/);
  assert.match(confidence, /photos, packaging, and an unboxing video/);
  assert.match(css, /\.customer-confidence-strip\s*\{/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.customer-confidence-strip/);
});

test("order layout keeps the confidence copy left and the form right, then stacks on mobile", () => {
  const order = html.match(/<section class="order-section shell" id="order"[\s\S]*?<\/section>/)?.[0] || "";
  const leftPlacement = css.match(/\.order-left-column\s*\{([^}]*)\}/)?.[1] || "";
  const formPlacement = css.match(/\.order-section > \.order-panel\s*\{([^}]*)\}/)?.[1] || "";
  const mobileLeftRule = css.match(/@media \(max-width: 620px\) \{[\s\S]*?\.order-left-column\s*\{([^}]*)\}/)?.[1] || "";
  const mobileOrderRule = css.match(/@media \(max-width: 620px\) \{[\s\S]*?\.order-section\s*\{([^}]*)\}/)?.[1] || "";

  assert.match(order, /<div class="order-left-column">[\s\S]*class="customer-confidence-strip"[\s\S]*class="order-copy/);
  assert.match(leftPlacement, /grid-column:\s*1/);
  assert.match(leftPlacement, /gap:\s*2rem/);
  assert.match(leftPlacement, /align-self:\s*start/);
  assert.match(formPlacement, /grid-column:\s*2/);
  assert.match(formPlacement, /align-self:\s*start/);
  assert.doesNotMatch(formPlacement, /grid-row/);
  assert.match(mobileLeftRule, /display:\s*block/);
  assert.match(mobileOrderRule, /display:\s*block/);
});

test("catalogue enhancement has accessible filters, preview mode, and a no-result reset", () => {
  const siteHeader = html.match(/<header class="site-header">[\s\S]*?<\/header>/)?.[0] || "";
  assert.match(html, /id="catalogue-filters"/);
  assert.match(html, /id="catalogue-type-filter"/);
  assert.match(html, /id="catalogue-price-filter"/);
  assert.match(html, /id="catalogue-filter-reset"/);
  assert.match(html, /id="catalogue-filter-empty"/);
  assert.match(html, /data-catalogue-disclosure/);
  assert.match(html, /Clear filters and browse all gifts/);
  assert.match(html, /Clear filters/);
  assert.match(siteHeader, /id="catalogue-header-controls"/);
  assert.match(siteHeader, /id="catalogue-search-toggle"/);
  assert.match(siteHeader, /id="catalogue-filter-toggle"/);
  assert.match(siteHeader, /aria-controls="catalogue-search-panel"/);
  assert.match(siteHeader, /aria-controls="catalogue-filter-panel"/);
  assert.doesNotMatch(html, /catalogue-pagination|catalogue-page-(?:previous|next|status)/);
  assert.match(script, /initCatalogueExperience/);
});

test("catalogue result status stays minimal while controls live in the site header", () => {
  const headerEnd = html.indexOf('</header>');
  const fieldsStart = html.indexOf('class="catalogue-filter-fields"');
  const statusRegion = html.match(/<div class="catalogue-status-region shell"[\s\S]*?<\/div>/)?.[0] || "";
  assert.match(statusRegion, /id="catalogue-filter-status"/);
  assert.doesNotMatch(statusRegion, /Find a gift that fits the moment|catalogue-search|catalogue-type-filter|catalogue-price-filter|catalogue-browse-all|See all 89 gifts/);
  assert.match(html, /id="catalogue-filters" aria-label="Gift catalogue results" tabindex="-1"/);
  assert.ok(fieldsStart > 0 && fieldsStart < headerEnd, "filter controls should remain inside the site header");
  assert.match(css, /\.catalogue-ready \.catalogue-results\s*\{[^}]*display:\s*grid/);
  assert.doesNotMatch(css, /\.catalogue-results-header|\.catalogue-browse-all/);
});

test("full browse keeps one global status beside compact controls", () => {
  const statusRegion = html.match(/<div class="catalogue-status-region shell"[\s\S]*?<\/div>/)?.[0] || "";
  assert.match(statusRegion, /id="catalogue-filter-status"/);
  assert.doesNotMatch(html, /Find a gift that fits the moment|id="catalogue-filters-title"|catalogue-browse-all|See all 89 gifts/);
  const siteHeader = html.match(/<header class="site-header">[\s\S]*?<\/header>/)?.[0] || "";
  assert.match(siteHeader, /id="catalogue-search-toggle"[\s\S]*id="catalogue-filter-toggle"/);
  assert.doesNotMatch(statusRegion, /catalogue-pagination|catalogue-page-(?:previous|next|status)/);
  assert.match(script, /focusCatalogueRegion\(\)/);
  assert.match(script, /catalogue-filters/);
  assert.doesNotMatch(css, /\.catalogue-full \.rail-heading > div > p:not\(\.eyebrow\):not\(\.catalogue-note\)/);
});

test("premium catalogue results keep readable text on the dark section", () => {
  const resultsRule = css.match(/\.premium-collection-section \.catalogue-results \.catalogue-filter-status\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(resultsRule, /color:\s*#fbf5e9/);
});

test("studio and corporate catalogue sections use distinct soft panels", () => {
  const corporateRule = css.match(/\.corporate-resin-gifts-section\s*\{([^}]*)\}/)?.[1] || "";
  const studioRule = css.match(/\.studio-art-section\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(corporateRule, /border:\s*1px solid rgba\(14, 124, 123, 0\.32\)/);
  assert.match(corporateRule, /border-radius:\s*1\.5rem/);
  assert.match(corporateRule, /margin-block:\s*1rem/);
  assert.match(corporateRule, /background:\s*#d3efec/);
  assert.match(corporateRule, /padding-inline:\s*clamp\(1rem, 4vw, 3\.5rem\)/);
  assert.match(studioRule, /border:\s*1px solid rgba\(138, 106, 168, 0\.3\)/);
  assert.match(studioRule, /border-radius:\s*1\.5rem/);
  assert.match(studioRule, /margin-block:\s*1rem/);
  assert.match(studioRule, /background:\s*#eddcf3/);
  assert.match(studioRule, /padding-inline:\s*clamp\(1rem, 4vw, 3\.5rem\)/);
  const mobileCss = css.slice(css.indexOf("@media (max-width: 620px)"));
  assert.match(mobileCss, /\.corporate-resin-gifts-section, \.studio-art-section\s*\{[^}]*margin-block:\s*0\.75rem[^}]*border-radius:\s*1\.1rem/);
});

test("Diwali collection uses the compact vertical spacing of Couple gifts", () => {
  const diwaliRule = css.match(/\.diwali-section\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(diwaliRule, /padding:\s*clamp\(1\.25rem, 3\.5vw, 3rem\)\s+clamp\(1rem, 4vw, 3\.5rem\)/);
  assert.match(diwaliRule, /border:\s*1px solid rgba\(242, 160, 7, 0\.45\)/);
  assert.match(diwaliRule, /border-radius:\s*1\.5rem/);
  assert.match(diwaliRule, /margin-block:\s*1rem/);
  assert.match(css, /\.romantic-keepsakes\s*\{[^}]*padding:\s*clamp\(1\.25rem, 3\.5vw, 3rem\)/);
  const mobileCss = css.slice(css.indexOf("@media (max-width: 620px)"));
  assert.match(mobileCss, /\.diwali-section\s*\{[^}]*margin-block:\s*0\.75rem[^}]*padding-block:\s*1\.2rem[^}]*border-radius:\s*1\.1rem/);
  assert.ok(mobileCss.lastIndexOf(".diwali-section") > mobileCss.indexOf(".work-section, .work-section-warm"), "Diwali mobile padding must follow the shared work-section rule");
});

test("catalogue work sections use compact shared vertical spacing", () => {
  const workRule = css.match(/\.work-section\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(workRule, /padding-block:\s*clamp\(1\.25rem, 3\.5vw, 3rem\)/);
  const mobileCss = css.slice(css.indexOf("@media (max-width: 620px)"));
  assert.match(css, /\.customizer-section\s*\{[^}]*padding-block:\s*clamp\(1\.25rem, 3\.5vw, 3rem\)/);
  assert.match(mobileCss, /\.customizer-section, \.work-section, \.work-section-warm\s*\{\s*padding-block:\s*1\.2rem/);
  assert.match(css, /\.romantic-keepsakes\s*\{[^}]*margin-block:\s*1rem/);
  assert.match(mobileCss, /\.romantic-keepsakes\s*\{[^}]*margin-block:\s*0\.75rem/);
  assert.match(css, /\.premium-collection-section\s*\{[\s\S]*padding-inline:\s*clamp\(1rem, 4vw, 3\.5rem\)/);
});

test("catalogue sections use four-card responsive grids with independent disclosures", () => {
  [
    ["diwali", "diwali-grid"],
    ["romantic-keepsakes", "romantic-keepsakes-grid"],
    ["corporate-resin-gifts", "corporate-resin-gifts-grid"],
    ["studio-art", "studio-art-grid"],
  ].forEach(([sectionId, gridId]) => {
    const sectionMarkup = section(sectionId);
    assert.match(sectionMarkup, new RegExp(`class="catalogue-grid"[^>]*id="${gridId}"`));
    assert.match(sectionMarkup, new RegExp(`data-catalogue-disclosure[^>]*aria-controls="${gridId}"`));
    assert.match(sectionMarkup, /aria-expanded="false"/);
    assert.doesNotMatch(sectionMarkup, /data-carousel|data-carousel-prev|data-carousel-next|tabindex="0"/);
    assert.doesNotMatch(sectionMarkup, /swipe|use the arrows|carousel/i);
  });
  assert.match(css, /\.catalogue-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.catalogue-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
  assert.doesNotMatch(script, /track\.addEventListener\("keydown"/);
});

test("mobile catalogue cards keep full copy in source while reserving aligned title, pricing, and action slots", () => {
  const mobileStart = css.indexOf("@media (max-width: 620px)");
  const reducedMotionStart = css.indexOf("@media (prefers-reduced-motion: reduce)");
  const mobileCss = css.slice(mobileStart, reducedMotionStart);
  assert.match(mobileCss, /\.catalogue-grid\s*>\s*:\s*is\(/);
  assert.match(mobileCss, /display:\s*flex/);
  assert.match(mobileCss, /-webkit-line-clamp:\s*2/);
  assert.match(mobileCss, /grid-template-rows:\s*repeat\(2/);
  assert.match(mobileCss, /\.catalogue-order-button\s*\{[^}]*min-height:/);
  assert.match(script, /figcaption p/);
  assert.match(script, /imageAlt/);
  assert.match(section("romantic-keepsakes"), /id="romantic-trinket"/);
  assert.match(section("romantic-keepsakes"), /id="romantic-initial"/);
});

test("catalogue cards keep only essentials while popups retain full details", () => {
  assert.match(css, /html\.js \.catalogue-grid > :is\(\.work-card, \.romantic-keepsake-card\) > figure > figcaption > :is\(span, p\)\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.catalogue-grid > :is\(\.work-card, \.romantic-keepsake-card\)\s*\{[^}]*grid-row:\s*span 5/);
  const subgrid = css.slice(css.indexOf("@supports (grid-template-rows: subgrid)"));
  assert.match(subgrid, /html\.js \.catalogue-grid/);
  assert.doesNotMatch(subgrid, /\n\s+\.catalogue-grid\s*(?:\{|>)/);
  assert.match(css, /figcaption > :is\(strong, h3\)[^{]*\{[^}]*grid-row:\s*1/);
  assert.match(css, /figcaption > \.product-pricing[^{]*\{[^}]*grid-row:\s*2 \/ 4/);
  assert.match(css, /figcaption > \.catalogue-order-button[^{]*\{[^}]*grid-row:\s*4/);
  assert.match(script, /querySelectorAll\("figcaption p"\)/);
  assert.match(script, /lightboxDescription\) lightboxDescription\.textContent = item\.description/);
  const card = section("diwali").match(/<article\b[^>]*class="[^"]*work-card[^"]*"[\s\S]*?<\/article>/)?.[0] || "";
  assert.match(card, /<figcaption[\s\S]*<p>/);
});

test("catalogue cards expose shared semantic row tracks through native subgrid", () => {
  assert.match(css, /@supports\s*\(grid-template-rows:\s*subgrid\)/);
  assert.match(css, /\.catalogue-grid > :is\(\.work-card, \.romantic-keepsake-card\)[^{]*\{[^}]*grid-row:\s*span 5;[^}]*grid-template-rows:\s*subgrid/);
  assert.match(css, /\.catalogue-grid > :is\(\.work-card, \.romantic-keepsake-card\) > figure[^{]*\{[^}]*grid-row:\s*1 \/ -1;[^}]*grid-template-rows:\s*subgrid/);
  assert.match(css, /\.catalogue-grid > :is\(\.work-card, \.romantic-keepsake-card\) > figure > figcaption[^{]*\{[^}]*grid-row:\s*2 \/ -1;[^}]*grid-template-rows:\s*subgrid/);
  assert.match(css, /figcaption > :is\(strong, h3\)[^{]*\{[^}]*grid-row:\s*1/);
  assert.match(css, /figcaption > \.product-pricing[^{]*\{[^}]*grid-row:\s*2 \/ 4;[^}]*grid-template-rows:\s*subgrid/);
  assert.match(css, /product-pricing > div:first-child[^{]*\{[^}]*grid-row:\s*1/);
  assert.match(css, /product-pricing > div:nth-child\(2\)[^{]*\{[^}]*grid-row:\s*2/);
  assert.match(css, /figcaption > \.catalogue-order-button[^{]*\{[^}]*grid-row:\s*4/);
  assert.match(css, /product-pricing[^{]*\{[^}]*margin-top:\s*0/);
});

test("catalogue section disclosures sit below their grids", () => {
  [
    ["diwali", "diwali-grid"],
    ["romantic-keepsakes", "romantic-keepsakes-grid"],
    ["corporate-resin-gifts", "corporate-resin-gifts-grid"],
    ["studio-art", "studio-art-grid"],
    ["premium-collection", "premium-collection-grid"],
  ].forEach(([sectionId, gridId]) => {
    const sectionMarkup = section(sectionId);
    assert.equal((sectionMarkup.match(/data-catalogue-disclosure/g) || []).length, 1);
    assert.match(
      sectionMarkup,
      new RegExp(`<div class="catalogue-grid"[^>]*id="${gridId}"[\\s\\S]*?</div>\\s*<button[^>]*data-catalogue-disclosure[^>]*aria-controls="${gridId}"`),
      `${sectionId} disclosure should follow its grid`,
    );
  });
});

test("the row of category tiles under the hero is removed completely", () => {
  assert.doesNotMatch(html, /class="category-shortcuts/);
  assert.doesNotMatch(html, /aria-label="Browse gift categories"/);
  assert.doesNotMatch(css, /\.category-shortcuts/);
});

test("menu and footer links use accessible local icons", () => {
  const nav = html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  assert.match(nav, /data-browse-all>Gifts <svg class="category-icon" aria-hidden="true" focusable="false">[\s\S]*#gift/);
  assert.match(nav, /data-customizer-open>Design a frame <svg class="category-icon" aria-hidden="true" focusable="false">[\s\S]*#frame/);
  assert.match(nav, /Corporate orders <svg class="category-icon" aria-hidden="true" focusable="false">[\s\S]*#gift[\s\S]*<\/svg> <span aria-hidden="true">↗<\/span>/);
  assert.match(nav, /href="partners\/">Partner Circle <svg class="category-icon" aria-hidden="true" focusable="false">[\s\S]*#heart[\s\S]*<\/svg> <span aria-hidden="true">↗<\/span>/);
  assert.match(nav, /<a href="#my-orders-dialog" data-my-orders-open>My orders <svg class="category-icon" aria-hidden="true" focusable="false">[\s\S]*#gem[\s\S]*<\/svg><\/a>/);
  const footer = html.match(/<div class="footer-links">[\s\S]*?<\/div>/)?.[0] || "";
  assert.match(footer, /data-category-shortcut="frames">Resin art <svg class="category-icon" aria-hidden="true" focusable="false">[\s\S]*#frame/);
  assert.match(footer, /href="resin-photo-frames\/">Photo frames <svg class="category-icon" aria-hidden="true" focusable="false">[\s\S]*#frame/);
  assert.match(footer, /href="namokar-mantra-frames\/">Namokar frames <svg class="category-icon" aria-hidden="true" focusable="false">[\s\S]*#frame/);
  assert.match(footer, /href="corporate-gifting\/">Corporate gifting <svg class="category-icon" aria-hidden="true" focusable="false">[\s\S]*#gift/);
  assert.match(css, /\.category-icon\s*\{[^}]*width:\s*1\.25rem[^}]*height:\s*1\.25rem[^}]*color:\s*var\(--cocoa\)/);
  assert.match(css, /\.site-nav \.category-icon, \.footer-links \.category-icon\s*\{[^}]*width:\s*1rem[^}]*height:\s*1rem/);
  assert.match(icons, /ISC License[\s\S]*Copyright \(c\) 2026 Lucide Icons and Contributors[\s\S]*Permission to use, copy, modify, and\/or distribute[\s\S]*THE SOFTWARE IS PROVIDED "AS IS"/);
  assert.match(icons, /The MIT License \(MIT\)[\s\S]*Copyright \(c\) 2013-present Cole Bemis[\s\S]*Permission is hereby granted, free of charge[\s\S]*THE SOFTWARE IS PROVIDED "AS IS"/);
});

test("small-screen layout keeps long labels inside the viewport without masking overflow", () => {
  const firstMobileStart = css.indexOf("@media (max-width: 620px)");
  const catalogueMobileStart = css.indexOf("@media (max-width: 620px)", firstMobileStart + 1);
  const customizerMobileStart = css.indexOf("@media (max-width: 620px)", catalogueMobileStart + 1);
  const nextMedia = (start) => {
    const end = css.indexOf("\n@media", start + 1);
    return css.slice(start, end === -1 ? undefined : end);
  };
  const baseMobileCss = nextMedia(firstMobileStart);
  const catalogueMobileCss = nextMedia(catalogueMobileStart);
  const customizerMobileCss = nextMedia(customizerMobileStart);
  const filterRule = catalogueMobileCss.match(/\.catalogue-filter-fields\s*\{([^}]*)\}/)?.[1] || "";
  const selectRule = catalogueMobileCss.match(/\.catalogue-filter-fields select\s*\{([^}]*)\}/)?.[1] || "";
  const mobilePreviewRule = customizerMobileCss.match(/\.customizer-preview-panel\s*\{([^}]*)\}/)?.[1] || "";
  const railRule = baseMobileCss.match(/\.rail-heading\s*\{([^}]*)\}/)?.[1] || "";
  const railHeadingRule = baseMobileCss.match(/\.rail-heading h2\s*\{([^}]*)\}/)?.[1] || "";
  const mainHeadingRule = baseMobileCss.match(/main h2\s*\{([^}]*)\}/)?.[1] || "";
  const orderStatusRule = css.match(/\.order-form-status\s*\{([^}]*)\}/)?.[1] || "";
  const orderStatusMarkup = html.match(/<div class="order-form-status"[\s\S]*?<\/div>/)?.[0] || "";
  const mainMarkup = html.match(/<main[\s\S]*?<\/main>/)?.[0] || "";

  assert.match(orderStatusRule, /overflow-wrap:\s*anywhere/);
  assert.match(orderStatusMarkup, /role="status"/);
  assert.match(orderStatusMarkup, /aria-live="polite"/);
  assert.match(orderStatusMarkup, /href="https:\/\/www\.instagram\.com\/saloniresin_art_studio\//);
  assert.match(filterRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(selectRule, /min-width:\s*0/);
  assert.match(selectRule, /min-height:\s*3rem/);
  assert.match(selectRule, /padding:\s*\.72rem\s+\.75rem/);
  assert.match(selectRule, /font-size:\s*1rem/);
  assert.match(mobilePreviewRule, /align-self:\s*stretch/);
  assert.match(railRule, /flex-direction:\s*column/);
  assert.match(railRule, /align-items:\s*flex-start/);
  assert.match(railHeadingRule, /max-width:\s*100%/);
  assert.doesNotMatch(railHeadingRule, /overflow-wrap:\s*anywhere/);
  assert.match(mainHeadingRule, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(baseMobileCss, /\[data-carousel\]\s+h2\s*\{/);
  assert.match(mainMarkup, /id="order-title"/);
  assert.match(mainMarkup, /id="studio-art-title"/);
  assert.match(mainMarkup, /id="customizer-title"/);
  assert.match(html, /<section[^>]*id="romantic-keepsakes"[^>]*aria-labelledby="romantic-keepsakes-title"/);
  assert.match(html, /<section[^>]*class="[^"]*\bwork-section\b[^"]*"[^>]*aria-labelledby="[^"]+"/);
  assert.match(css, /\.catalogue-grid\s*\{[^}]*display:\s*grid/);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x:\s*hidden/);
});

test("each priced gift shows a crossed-out regular price 25% above today's price, which stays the price paid", () => {
  const cards = html.match(/<dl class="product-pricing"[\s\S]*?<\/dl>/g) || [];
  assert.equal(cards.length, 97);
  const rupees = (text) => (text.match(/[0-9][0-9,]*/g) || []).map((n) => Number(n.replace(/,/g, "")));
  const format = (n) => "₹" + n.toLocaleString("en-IN");
  let withRegular = 0;
  cards.forEach((card) => {
    assert.match(card, /^<dl class="product-pricing"[^>]*><div><dt>(?:Price|From)<\/dt>/, "today's price stays the first row, so filters and the cart read it");
    const price = card.match(/<dt>(?:Price|From)<\/dt><dd>([^<]*)<\/dd>/)[1];
    const regular = card.match(/<dt>(?:Price|From)<\/dt><dd>[^<]*<\/dd><dd class="product-regular-price"><span class="sr-only">Regular price <\/span><s>([^<]*)<\/s> <span>20% off<\/span><\/dd><\/div>/);
    if (!/₹/.test(price)) {
      assert.equal(regular, null, price + " has no regular price");
      return;
    }
    assert.ok(regular, "regular price for " + price);
    assert.equal(regular[1], price.replace(/₹([0-9][0-9,]*)/g, (m, n) => format(Math.round(Number(n.replace(/,/g, "")) * 1.25))));
    assert.equal((card.match(/<dt>/g) || []).length <= 2, true, "no extra row, so the phone price grid keeps its two rows");
    withRegular += 1;
  });
  assert.equal(withRegular, 89);
  assert.match(html, /<dt>Price<\/dt><dd>₹249<\/dd><dd class="product-regular-price"><span class="sr-only">Regular price <\/span><s>₹311<\/s> <span>20% off<\/span><\/dd>/);
  assert.match(css, /figcaption \.product-pricing > div > dd\.product-regular-price\s*\{[^}]*grid-column:\s*1 \/ -1/);
  assert.doesNotMatch(html, /<dt>Estimated from<\/dt>/);
  assert.doesNotMatch(section("diwali"), /Diwali prices ₹249–₹1,799/);
});

test("catalogue prices use lining tabular numerals", () => {
  const priceRule = css.match(/^:is\(\.work-card, \.romantic-keepsake-card\) figcaption \.product-pricing\s*>\s*div:first-child dd\s*\{([^}]*)\}/m)?.[1] || "";
  assert.match(priceRule, /font-family:\s*var\(--sans\)/);
  assert.match(priceRule, /font-variant-numeric:\s*lining-nums tabular-nums/);
});

test("narrow catalogue cards give ranged prices room beside the PRICE label", () => {
  const mobileStart = css.indexOf("@media (max-width: 620px)");
  const reducedMotionStart = css.indexOf("@media (prefers-reduced-motion: reduce)", mobileStart);
  const mobileCss = css.slice(mobileStart, reducedMotionStart);
  assert.match(mobileCss, /\.catalogue-grid > :is\(\.work-card, \.romantic-keepsake-card\) figcaption \.product-pricing > div:first-child\s*\{[^}]*grid-template-columns:\s*max-content minmax\(0, 1fr\)/);
  assert.match(section("diwali"), /<dt>Price<\/dt><dd>₹250–₹400<\/dd>/);
});

test("festive banner is absent while Diwali remains in the collection", () => {
  assert.doesNotMatch(html, /class="[^"]*festive-banner/);
  assert.doesNotMatch(html, /<a href="#diwali"(?: data-category-shortcut="diwali")?>Browse Diwali designs/);
  assert.doesNotMatch(html, /<section[^>]+id="diwali"[\s\S]*Diwali prices/);
  assert.doesNotMatch(html, /<dialog[^>]+festive-offers|special discounts/);
  assert.doesNotMatch(script, /initFestiveOffers|aria-controls="festive-offers"/);
});

test("resin-only catalogue removes hamper products and keeps both ₹2,000 budget choices", () => {
  ["diwali-festive-hamper", "romantic-hamper-title", "corporate-festive-hamper", "birthday-hamper", "car-theme-hamper", "holi-hamper", "hamper-rail"].forEach((id) => {
    assert.doesNotMatch(html, new RegExp(`(?:id|aria-labelledby)="${id}"`));
  });
  assert.doesNotMatch(html, /concept-tray-hamper\.webp|festive-welcome-hamper|customised-hampers\//);
  assert.doesNotMatch(html, /data-category-shortcut="hampers"|value="hampers"/);
  assert.match(html, /<option value="1999">Up to ₹2,000<\/option>/);
  assert.match(html, /<option value="2000">₹2,000 and above<\/option>/);
});

test("customizer presents a keyboard-matched basics, preview, advanced, and save/share flow", () => {
  const customizerSection = section("customizer");
  const order = [
    "preview-stage", "frame-template", "colour-theme", "reference-image", "personal-text", "frame-preset",
    "order-from-customizer", "customizer-advanced",
    "customizer-save-share"
  ];
  const positions = order.map((id) => customizerSection.indexOf(`id="${id}"`));
  positions.forEach((position, index) => assert.ok(position >= 0, `expected ${order[index]}`));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));

  [
    "frame-template", "colour-theme", "personal-text", "reference-image", "frame-preset", "frame-type",
    "border-style", "frame-unit", "image-layout-controls", "paint-toggle", "image-size", "crop-zoom",
    "copy-summary", "download-preview", "share-design", "order-from-customizer", "customizer-design-help", "customizer-continue-without-preview"
  ].forEach((id) => {
    assert.equal((customizerSection.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, `${id} appears once`);
  });

  assert.match(customizerSection, /<label for="frame-template">Starting design/);
  assert.match(customizerSection, /<label for="colour-theme">Colour palette/);
  assert.match(customizerSection, /Start here\. You can change any detail later\./);
  assert.match(customizerSection, /<summary>Advanced options<\/summary>[\s\S]*For precise colours, image placement, crop, finishing details, and paint\./);
  assert.match(customizerSection, /<summary>Save or share this preview<\/summary>[\s\S]*id="download-preview"[\s\S]*id="share-design"/);
  assert.equal((customizerSection.match(/id="share-status"/g) || []).length, 1);
  const shareStatusPosition = customizerSection.indexOf('id="share-status"');
  const saveSharePosition = customizerSection.indexOf('id="customizer-save-share"');
  assert.ok(shareStatusPosition >= 0 && shareStatusPosition < saveSharePosition, "request status stays visible before the closed save/share disclosure");
  assert.match(customizerSection, /Sends this preview, your choices and size with your request\./);
  assert.match(customizerSection, /Preview your frame here; Saloni confirms final size, materials, and quote\./);
  const previewPosition = customizerSection.indexOf('class="customizer-preview-panel"');
  const basicsPosition = customizerSection.indexOf('class="customizer-basics-flow"');
  assert.ok(previewPosition >= 0 && previewPosition < basicsPosition, "preview precedes the basic controls in the form");
  const disclosureEnd = customizerSection.lastIndexOf("</details>");
  const designHelpPosition = customizerSection.indexOf('id="customizer-design-help"');
  assert.equal((customizerSection.match(/id="customizer-design-help"/g) || []).length, 1);
  assert.ok(designHelpPosition > disclosureEnd, "design help stays outside the closed designer disclosure");
  assert.doesNotMatch(customizerSection.match(/<details[^>]*id="customizer-advanced"[^>]*>/)?.[0] || "", /\bopen\b/);
  assert.doesNotMatch(customizerSection.match(/<details[^>]*id="customizer-save-share"[^>]*>/)?.[0] || "", /\bopen\b/);
  assert.match(customizerSection, /Let Saloni design it for me/);
  assert.match(customizerSection, /Request this design/);
  const mobileActions = html.match(/<div class="customizer-mobile-actions"[\s\S]*?<\/div>/)?.[0] || "";
  const customizerStart = html.indexOf('<section class="customizer-section');
  const customizerEnd = html.indexOf("</section>", customizerStart);
  const mobileActionsPosition = html.indexOf('id="customizer-mobile-actions"');
  assert.ok(mobileActionsPosition > customizerEnd, "mobile actions sit outside the transformed customizer section");
  assert.ok(mobileActionsPosition < html.indexOf('<section class="order-section shell"', customizerEnd), "mobile actions stay before the order section");
  assert.match(mobileActions, /id="customizer-mobile-actions"[^>]*hidden[^>]*role="group"[^>]*aria-label="Custom design actions"/);
  assert.match(mobileActions, /<button[^>]+id="customizer-mobile-request"[^>]+data-customizer-request="true"[^>]*>Request this design<\/button>/);
  assert.match(mobileActions, /<button[^>]+id="customizer-mobile-help"[^>]+data-order-prefill="general"[^>]+data-design-help="true"[^>]*>Let Saloni finish it<\/button>/);
  assert.match(customizerSection, /<button[^>]+id="customizer-continue-without-preview"[^>]+hidden/);
  assert.doesNotMatch(customizerSection, /Start an order from this design/);
  assert.match(customizer, /data-template|template/);

  assert.match(css, /\.customizer-preview-panel\s*\{[^}]*position:\s*static/);
  assert.match(css, /\.customizer-preview-panel\s*\{[^}]*grid-row:\s*1\s*\/\s*span\s*5/);
  assert.match(css, /@media \(min-width: 841px\) and \(min-height: 720px\)[\s\S]*?\.customizer-preview-panel\s*\{[^}]*position:\s*sticky/);
  assert.match(css, /@media \(min-width: 841px\) and \(max-height: 719px\)[\s\S]*?\.customizer-preview-panel\s*\{[^}]*position:\s*static/);
  assert.match(css, /\.customizer-disclosure-row\s*\{[^}]*display:\s*block/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.customizer-layout\s*\{[^}]*display:\s*block/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.customizer-form\s*\{[^}]*display:\s*block/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.customizer-preview-panel\s*\{[^}]*position:\s*sticky/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.customizer-preview \.preview-stage\s*\{[^}]*width:\s*min\(100%, 20dvh, 13rem\)/);
  assert.match(css, /\.customizer-mobile-actions\s*\{[^}]*display:\s*none/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.customizer-mobile-actions\s*\{[^}]*position:\s*fixed[^}]*bottom:\s*0/);
  assert.match(css, /\.customizer-mobile-actions[^}]*padding:[^}]*env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.customizer-section:has\(\+ \.customizer-mobile-actions:not\(\[hidden\]\)\)[^}]*padding-bottom:[^}]*env\(safe-area-inset-bottom\)/);
  assert.match(css, /body:has\(#customizer-mobile-actions:not\(\[hidden\]\)\)[^}]*padding-bottom:[^}]*env\(safe-area-inset-bottom\)/);
  assert.match(css, /html:has\(#customizer-mobile-actions:not\(\[hidden\]\)\)[^}]*scroll-padding-bottom:[^}]*env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.customizer-form :is\(input, select, textarea, button, a, summary\)\s*\{[^}]*scroll-margin-block-end:/);
  assert.match(css, /\.customizer-form :is\(input, select, textarea, button, a, summary\)\s*\{[^}]*scroll-margin-block-start/);
  assert.match(css, /\.customizer-form:has\(input\[type="text"\]:focus, input\[type="number"\]:focus, textarea:focus, button:focus, a:focus, summary:focus\)/);
  assert.match(css, /@media \(max-width: 840px\) and \(max-height: 620px\)[\s\S]*?\.customizer-preview-panel\s*\{[^}]*position:\s*static/);
  assert.match(css, /@media \(max-width: 840px\)[\s\S]*?\.customizer-preview-panel\s*\{[^}]*grid-row:\s*auto/);
  const customizerCss = css.slice(css.indexOf(".customizer-layout"), css.indexOf(".order-section"));
  assert.doesNotMatch(customizerCss, /(?:^|[;}])\s*order\s*:/);
  assert.match(customizer, /function markCustomerChange\(\)/);
  assert.match(customizer, /function syncMobileActions\(\)/);
  assert.match(customizer, /shouldShowMobileCustomizerActions\(/);
  assert.match(customizer, /new IntersectionObserver\(/);
  assert.match(customizer, /mobileActionObserver\.observe\(customizerRequestButton\)/);
  assert.match(customizer, /mobileActionObserver\.observe\(customizerDesignHelp\)/);
  assert.match(customizer, /customizerDisclosure\.addEventListener\("toggle"/);
  assert.doesNotMatch(customizer, /MutationObserver/);
  assert.match(customizer, /customizer-mobile-request/);
});

test("customizer starts compact and opens from the frame-design nav or hash", () => {
  const customizerSection = section("customizer");
  const nav = html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  const disclosureStart = customizerSection.indexOf('<details class="customizer-disclosure" id="customizer-disclosure">');
  const disclosureEnd = customizerSection.indexOf("</details>\n    </section>", disclosureStart);
  const disclosure = customizerSection.slice(disclosureStart, disclosureEnd === -1 ? undefined : disclosureEnd);

  assert.match(nav, /<a href="#customizer"[^>]*>Design a frame/);
  assert.match(disclosure, /<summary>Design a frame<\/summary>/);
  assert.doesNotMatch(disclosure.match(/<details[^>]+id="customizer-disclosure"[^>]*>/)?.[0] || "", /\bopen\b/);
  assert.ok(disclosure.indexOf('class="customizer-layout"') >= 0, "existing editor stays in the disclosure");
  assert.doesNotMatch(disclosure, /customizer-handoff|Take the summary to the studio|Call Saloni/);
  assert.match(customizerSection, /Choose colours, add a photo or message, and preview your custom frame\./);
  assert.match(css, /\.customizer-disclosure\s*>\s*summary/);
  assert.match(css, /\.customizer-heading h2\s*\{[^}]*max-width:\s*18ch[^}]*font-size:\s*clamp\(2rem, 4\.5vw, 3\.5rem\)/);
  assert.match(script, /customizerDisclosure\.open\s*=\s*true/);
  assert.match(script, /hashchange/);
});

test("customizer removes the redundant handoff while preserving direct request and save/share controls", () => {
  const customizerSection = section("customizer");
  assert.match(customizerSection, /id="order-from-customizer"[^>]*data-order-prefill="customizer"[^>]*>Request this design/);
  assert.match(customizerSection, /<summary>Save or share this preview<\/summary>[\s\S]*id="download-preview"[\s\S]*id="copy-summary"[\s\S]*id="share-design"/);
  assert.doesNotMatch(customizerSection, /customizer-handoff|Take the summary to the studio|Call Saloni/);
  assert.doesNotMatch(customizerSection, /href="tel:(?:\+91)?8209238541"|href="https:\/\/www\.instagram\.com\/saloniresin_art_studio\//);
});

test("homepage order panel lives in one accessible native modal with an inline fallback", () => {
  const dialog = html.match(/<dialog class="order-dialog" id="order-dialog"[\s\S]*?<\/dialog>/)?.[0] || "";
  assert.match(dialog, /aria-labelledby="order-dialog-title"/);
  assert.match(dialog, /id="order-form-embed"/);
  assert.match(dialog, /<form id="order-form" novalidate hidden>/);
  assert.doesNotMatch(dialog, /<iframe/);
  assert.match(dialog, /<h2 class="order-dialog-title" id="order-dialog-title">Send an order request<\/h2>/);
  const order = html.match(/<section class="order-section shell" id="order"[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(order, /id="order-inline-fallback"/);
  assert.match(order, /data-order-prefill="general"/);
  assert.match(order, /id="order-continue-request"[^>]*>Continue your request<\/button>/);
});

test("the order modal has no loader, spinner or iframe: the form is in the page and opens at once", () => {
  assert.doesNotMatch(html, /order-form-spinner|<iframe/);
  assert.doesNotMatch(css, /order-form-spin|order-form-panel iframe/);
  assert.doesNotMatch(script, /saloni-order-form-ready|startOrderFormLoading|finishOrderFormLoading|clearOrderLoadingTimer|nextFrame|loadingTimedOut|aria-busy/);
  assert.match(script, /requestHistoryConsumed && orderDialog/);
});

test("request CTA vocabulary is consistent and supports general enquiries", () => {
  assert.doesNotMatch(section("hero"), /Request a custom gift/);
  assert.doesNotMatch(html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)?.[0] || "", /nav-cta/);
  assert.match(html, /<a href="#order" data-order-prefill="general">Contact Saloni<\/a>/);
  const orderStatus = html.match(/<div class="order-form-status"[\s\S]*?<\/div>/)?.[0] || "";
  assert.match(orderStatus, /<button class="button button-line order-general-request" type="button" data-order-prefill="general">Request a custom gift<\/button>/);
  assert.match(css, /\.order-form-status \.order-general-request\s*\{[^}]*background:\s*transparent[^}]*border-color:\s*#f0ddd4[^}]*color:\s*#f0ddd4/);
  assert.match(script, /button\.textContent = "Add to cart"/);
  assert.match(script, /data-order-prefill="general"/);
  assert.match(script, /illustrative preview\|reference image/);
});

test("footer trust strip and primary navigation use the approved customer vocabulary", () => {
  const nav = html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  ["Gifts", "Design a frame", "Corporate orders", "Partner Circle", "My orders"].forEach((label) => {
    assert.match(nav, new RegExp(`>${label}(?:\\s|<)`));
  });
  ["Bestsellers", "Marriage gifts", "Couple keepsakes", "Resin frames"].forEach((label) => assert.doesNotMatch(nav, new RegExp(`>${label}(?:\\s|<)`)));
  assert.doesNotMatch(nav, />Order\s*<\/a>/);
  assert.equal((nav.match(/<a\b/g) || []).length, 5);
  const hero = section("hero");
  const footer = html.match(/<footer class="site-footer"[\s\S]*?<\/footer>/)?.[0] || "";
  const trustStrip = footer.match(/<ul class="hero-trust-strip"[\s\S]*?<\/ul>/)?.[0] || "";
  assert.doesNotMatch(hero, /class="hero-trust-strip"/);
  assert.ok(trustStrip, "expected the studio facts at the end of the page footer");
  assert.ok(footer.indexOf('class="hero-trust-strip"') > footer.indexOf('class="footer-inner"'), "expected the studio facts after the footer links");
  assert.match(trustStrip, /aria-label="Studio facts"/);
  assert.match(trustStrip, /<a href="#order" data-order-prefill="general">Contact Saloni<\/a>/);
  ["Ajmer studio", "Shipping across India", "Handmade to order"].forEach((fact) => assert.match(trustStrip, new RegExp(fact)));
  assert.doesNotMatch(html, /<a href="#diwali" data-category-shortcut="diwali">Diwali/);
  assert.doesNotMatch(html, /<a href="#diwali" data-category-shortcut="diwali">Browse Diwali designs/);
  assert.match(html, /<div class="footer-links">[\s\S]*<a href="#studio-art" data-category-shortcut="frames">Resin art <svg class="category-icon" aria-hidden="true" focusable="false">[\s\S]*#frame[\s\S]*<\/a>/);
  assert.doesNotMatch(html, /data-category-shortcut="hampers"|href="#hamper-rail"/);
  assert.match(html, /href="partners\/">Partner Circle<\/a>/);
});

test("lightbox keeps product details and request action without catalogue navigation", () => {
  const dialog = html.match(/<dialog class="lightbox-dialog"[\s\S]*?<\/dialog>/)?.[0] || "";
  const figure = dialog.match(/<figure class="lightbox-figure"[^>]*>[\s\S]*?<\/figure>/)?.[0] || "";
  const summary = dialog.match(/<div class="lightbox-order-summary">[\s\S]*?<\/div>/)?.[0] || "";
  assert.doesNotMatch(dialog, /lightbox-(?:previous|next|position)/);
  assert.match(summary, /id="lightbox-product-name"/);
  assert.match(summary, /id="lightbox-product-price"/);
  assert.match(summary, /id="lightbox-request"[^>]*>Add to cart<\/button>/);
  assert.doesNotMatch(figure, /id="lightbox-product-name"|id="lightbox-product-price"/);
  assert.match(figure, /tabindex="0"/);
  assert.match(figure, /aria-label="Scrollable artwork details"/);
  assert.match(figure, /id="lightbox-product-size"/);
  assert.match(figure, /id="lightbox-image-description"/);
  assert.doesNotMatch(script, /lightbox-(?:previous|next|position)/);
  assert.match(script, /pendingLightboxRequest[\s\S]*requestButton\.click\(\)[\s\S]*focusOrderLocation/);
  assert.match(script, /selected \? "Remove from cart" : "Add to cart"/);
  assert.match(script, /getAttribute\("data-order-prefill"\) === "quote"[\s\S]*"Ask for a quote"[\s\S]*"Ask for a quote for "/);
  assert.match(script, /selected \? " from cart" : " to cart"/);
  assert.match(html, /id="order"[^>]*tabindex="-1"/);
  assert.match(script, /data-lightbox-trigger/);
});

test("lightbox keeps the request action fixed below an independently scrolling figure", () => {
  const dialog = html.match(/<dialog class="lightbox-dialog"[\s\S]*?<\/dialog>/)?.[0] || "";
  const mobileCss = css.match(/@media \(max-width: 620px\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(css, /\.lightbox-panel\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*overflow:\s*hidden/);
  assert.match(css, /\.lightbox-figure\s*\{[^}]*flex:\s*1 1 auto[^}]*min-height:\s*0[^}]*overflow:\s*auto/);
  assert.match(css, /\.lightbox-request\s*\{[^}]*width:\s*100%[^}]*align-self:\s*stretch[^}]*justify-content:\s*center/);
  assert.match(mobileCss, /\.lightbox-request\s*\{[^}]*justify-content:\s*center/);
  assert.match(css, /@media \(max-width: 620px\),\s*\(max-height: 620px\) and \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 620px\),\s*\(max-height: 620px\) and \(max-width: 900px\) \{[\s\S]*?\.lightbox-panel\s*\{[^}]*height:\s*calc\(100dvh - 1rem\)[^}]*max-height:\s*calc\(100dvh - 1rem\)/);
  assert.match(dialog, /<figure class="lightbox-figure" tabindex="0" aria-label="Scrollable artwork details">/);
});

test("lightbox request focuses the order location after native close", () => {
  const start = script.indexOf("    var lightbox = document.getElementById(\"art-lightbox\")");
  const end = script.indexOf("\n\n    initCatalogueExperience();", start);
  assert.ok(start >= 0 && end > start);
  const makeElement = (extra = {}) => Object.assign({
      hidden: false,
      attributes: {},
      listeners: {},
      addEventListener(type, listener) { this.listeners[type] = listener; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      removeAttribute(name) { delete this.attributes[name]; },
      focus() { this.focused = true; },
    }, extra);
  const order = makeElement();
  const requestButton = makeElement({ clicked: 0, click() { this.clicked += 1; } });
  const title = { textContent: "Sample gift" };
  const image = { alt: "Sample gift photo" };
  const card = makeElement({
    querySelector(selector) {
      if (selector === "figcaption strong") return title;
      if (selector === "[data-order-prefill]") return requestButton;
      return null;
    },
  });
  const trigger = makeElement({
    href: "assets/sample-gift.jpg",
    querySelector(selector) { return selector === "img" ? image : null; },
    closest(selector) { return selector === "article" ? card : null; },
  });
  const lightbox = makeElement({
    showModal() { this.open = true; },
    close() { this.open = false; this.listeners.close(); },
  });
  const imageTarget = makeElement();
  const docElements = {
    "art-lightbox": lightbox,
    "lightbox-image": imageTarget,
    "lightbox-caption": makeElement(),
    "lightbox-product-name": makeElement(),
    "lightbox-product-price": makeElement(),
    "lightbox-product-size": makeElement(),
    "lightbox-image-description": makeElement(),
    "lightbox-request": makeElement(),
    order,
  };
  const documentObject = {
    getElementById(id) { return docElements[id] || null; },
    querySelectorAll(selector) { return selector === "[data-lightbox-trigger]" ? [trigger] : []; },
  };
  const windowObject = { setTimeout(callback) { callback(); } };
  vm.runInNewContext(`(function () { ${aiPhotoHelpers}${script.slice(start, end)} })();`, { document: documentObject, window: windowObject });
  trigger.listeners.click({ defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault() {} });
  docElements["lightbox-request"].listeners.click();
  assert.equal(requestButton.clicked, 1);
  assert.equal(order.focused, true);
  assert.equal(trigger.focused, undefined);
});

function galleryHarness({ colours, paragraphs, href = "assets/sample-gift.jpg?v=3", withGalleryElements = true, heroTarget = false, cardPhotos = false, withRequest = true, sample = null, feed = undefined, rateResponse = { ok: true, rating: 4 }, stored = null, captcha = true, rateReject = false, homeReviews = false, existingScript = null, observer = false, savedFeed = null, deferFeed = false } = {}) {
  const start = script.indexOf("    var lightbox = document.getElementById(\"art-lightbox\")");
  const end = script.indexOf("\n\n    initCatalogueExperience();", start);
  const makeElement = (extra = {}) => Object.assign({
    hidden: false,
    textContent: "",
    attributes: {},
    listeners: {},
    prevented: 0,
    addEventListener(type, listener) { this.listeners[type] = listener; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    focus() { this.focused = true; },
  }, extra);
  const requestButton = makeElement({ clicked: 0, click() { this.clicked += 1; }, attributes: { "data-order-prefill": "sample" } });
  const paras = (paragraphs || ["Rich colour and golden flecks", "one holder · tealight not included · shown palette or custom colours"]).map((textContent) => ({ textContent }));
  const card = makeElement({
    attributes: sample ? { "data-sample-review": sample } : {},
    querySelector(selector) {
      if (selector === "figcaption strong") return { textContent: "Sample gift" };
      if (selector === "[data-order-prefill]") return withRequest ? requestButton : null;
      return null;
    },
    querySelectorAll(selector) { return selector === "figcaption p" ? paras : []; },
  });
  const attributes = colours === undefined ? {} : { "data-ai-images": colours };
  const children = (element) => Object.assign(element, {
    children: [],
    appendChild(child) { if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1); child.parentNode = this; this.children.push(child); return child; },
    insertBefore(child, ref) { child.parentNode = this; this.children.splice(this.children.indexOf(ref), 0, child); return child; },
  });
  const cardImage = cardPhotos ? makeElement({ alt: "Sample gift photo" }) : null;
  const trigger = makeElement({
    href,
    attributes,
    querySelector(selector) {
      if (selector === ".card-photos") return (this.children || []).find((child) => child.className === "card-photos") || null;
      return selector === "img" ? (cardImage || { alt: "Sample gift photo" }) : null;
    },
    closest(selector) { return selector === "article" ? card : null; },
  });
  if (cardImage) children(trigger).appendChild(cardImage);
  const heroTrigger = makeElement({
    href: "assets/hero-copy.webp",
    attributes: { "data-lightbox-target": "sample-card" },
    querySelector(selector) { return selector === "img" ? { alt: "Hero copy" } : null; },
    closest() { return null; },
  });
  const targetCard = makeElement({ querySelector(selector) { return selector === "[data-lightbox-trigger]" ? trigger : null; } });
  const lightbox = makeElement({
    showModal() { this.open = true; },
    close() { this.open = false; this.listeners.close(); },
  });
  const srcAssignments = [];
  const imageTarget = makeElement();
  Object.defineProperty(imageTarget, "src", { get() { return this._src; }, set(value) { this._src = value; srcAssignments.push(value); } });
  const gallery = withGalleryElements ? {
    "lightbox-stage": makeElement(),
    "lightbox-photo-prev": makeElement({ hidden: true }),
    "lightbox-photo-next": makeElement({ hidden: true }),
    "lightbox-photo-label": makeElement({ hidden: true }),
    "lightbox-included": makeElement({ hidden: true }),
  } : {};
  const docElements = Object.assign({
    "art-lightbox": lightbox,
    "lightbox-image": imageTarget,
    "lightbox-caption": makeElement(),
    "lightbox-product-name": makeElement(),
    "lightbox-product-price": makeElement(),
    "lightbox-product-size": makeElement(),
    "lightbox-image-description": makeElement(),
    "lightbox-request": makeElement(),
    "sample-card": targetCard,
    order: makeElement(),
  }, gallery);
  const reviewsMode = sample !== null || feed !== undefined;
  const fetchCalls = [];
  const feedReads = [];
  if (reviewsMode) {
    const list = children(makeElement());
    Object.defineProperty(list, "firstChild", { get() { return this.children[0] || null; } });
    list.removeChild = function (child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; return child; };
    docElements["lightbox-reviews"] = makeElement({ hidden: true });
    docElements["lightbox-reviews-title"] = makeElement({ textContent: "Reviews" });
    docElements["lightbox-rating-summary"] = children(makeElement({ hidden: true }));
    Object.defineProperty(docElements["lightbox-rating-summary"], "firstChild", { get() { return this.children[0] || null; } });
    docElements["lightbox-rating-summary"].removeChild = function (child) { this.children.splice(this.children.indexOf(child), 1); return child; };
    docElements["lightbox-rate"] = makeElement({ hidden: true, attributes: { "data-captcha-site-key": "site-key" } });
    const rateButtons = [1, 2, 3, 4, 5].map((value) => makeElement({ disabled: false, attributes: { "data-rate": String(value) } }));
    docElements["lightbox-rate"].querySelectorAll = (selector) => (selector === "[data-rate]" ? rateButtons : []);
    docElements["lightbox-rate-status"] = makeElement();
    docElements["lightbox-tell-more"] = makeElement({ attributes: { href: "reviews/#write" } });
    docElements["lightbox-review-list"] = list;
    if (feed !== undefined) docElements["order-form-embed"] = makeElement({ attributes: { "data-order-form-url": "https://script.google.test/exec" } });
  }
  if (homeReviews) {
    const homeList = children(makeElement());
    Object.defineProperty(homeList, "firstChild", { get() { return this.children[0] || null; } });
    homeList.removeChild = function (child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; return child; };
    docElements["reviews-list"] = homeList;
    docElements["reviews-status"] = makeElement({ textContent: "Loading reviews…" });
    docElements["reviews-summary"] = makeElement({ hidden: true });
    docElements["customer-reviews"] = makeElement();
  }
  const headScripts = [];
  const documentObject = {
    getElementById(id) { return docElements[id] || null; },
    querySelectorAll(selector) { return selector === "[data-lightbox-trigger]" ? (heroTarget ? [heroTrigger] : [trigger]) : []; },
    querySelector(selector) { return existingScript && selector.indexOf("recaptcha/api.js") !== -1 ? existingScript : null; },
    head: { appendChild(node) { headScripts.push(node); node.parentNode = this; return node; }, removeChild(node) { headScripts.splice(headScripts.indexOf(node), 1); node.parentNode = null; return node; } },
  };
  if (cardPhotos || reviewsMode) documentObject.createElement = (tagName) => children(makeElement({ tagName }));
  const windowObject = { setTimeout(callback) { callback(); } };
  if (feed !== undefined) {
    windowObject.setTimeout = () => 1;
    windowObject.clearTimeout = () => {};
    windowObject.fetch = (url, init) => {
      fetchCalls.push({ url, init });
      if (init && init.method === "POST") return rateReject ? Promise.reject(new Error("network")) : Promise.resolve({ json: () => Promise.resolve(rateResponse) });
      if (deferFeed) return new Promise((resolve, reject) => feedReads.push({ resolve: (data) => resolve({ json: () => Promise.resolve(data === undefined ? feed : data) }), reject: () => reject(new Error("network")) }));
      return feed === "fail" ? Promise.reject(new Error("network")) : Promise.resolve({ json: () => Promise.resolve(feed) });
    };
  }
  const observers = [];
  if (observer) windowObject.IntersectionObserver = class { constructor(callback, init) { this.callback = callback; this.init = init; this.targets = []; observers.push(this); } observe(target) { this.targets.push(target); } disconnect() { this.disconnected = true; } };
  const storage = new Map(stored ? [["saloni-product-ratings", JSON.stringify(stored)]] : []);
  if (savedFeed) storage.set("saloni-reviews-feed", JSON.stringify({ v: 1, url: "https://script.google.test/exec", savedAt: Date.now() - 60000, data: savedFeed }));
  if (reviewsMode) {
    windowObject.localStorage = { getItem: (key) => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => storage.set(key, String(value)) };
    let uuid = 0;
    windowObject.crypto = { randomUUID: () => "rating-0000-1111-222" + (uuid += 1) };
    if (captcha) windowObject.grecaptcha = { ready: (callback) => callback(), execute: (key, options) => { fetchCalls.push({ captcha: key, action: options.action }); return Promise.resolve("captcha-token"); } };
  }
  vm.runInNewContext(`(function () { ${aiPhotoHelpers}${script.slice(start, end)} })();`, { document: documentObject, window: windowObject, IntersectionObserver: windowObject.IntersectionObserver });
  const click = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault() {} };
  const open = () => (heroTarget ? heroTrigger : trigger).listeners.click(click);
  const press = (key) => { const event = { key, prevented: 0, preventDefault() { this.prevented += 1; } }; lightbox.listeners.keydown(event); return event; };
  const swipe = (dx, dy) => {
    docElements["lightbox-stage"].listeners.pointerdown({ clientX: 200, clientY: 100 });
    docElements["lightbox-stage"].listeners.pointerup({ clientX: 200 + dx, clientY: 100 + dy });
  };
  return { docElements, imageTarget, lightbox, requestButton, srcAssignments, open, press, swipe, trigger, cardImage, fetchCalls, feedReads, storage, windowObject, headScripts, observers };
}

const textOf = (node) => (node.children && node.children.length ? node.children.map(textOf).join(" ") : String(node.textContent || ""));
const settleAll = async () => { for (let index = 0; index < 6; index += 1) await new Promise((resolve) => setImmediate(resolve)); };

test("the product popup shows the card's labelled sample review and nothing else when there is no feed", () => {
  const h = galleryHarness({ sample: "The golden flecks catch the candle light beautifully." });
  h.open();
  const region = h.docElements["lightbox-reviews"];
  const items = h.docElements["lightbox-review-list"].children;
  assert.equal(region.hidden, false);
  assert.equal(items.length, 1);
  assert.equal(items[0].className, "review-card sample-review");
  assert.equal(items[0].children[0].className, "sample-badge");
  assert.equal(items[0].children[0].textContent, "From the studio");
  assert.equal(h.docElements["lightbox-reviews-title"].textContent, "What we love about it");
  assert.equal(items[0].children[1].className, "review-comment");
  assert.equal(items[0].children[1].textContent, "The golden flecks catch the candle light beautifully.");
  assert.equal(h.fetchCalls.length, 0);
});

test("the product popup still offers the rating stars when the card has no sample and there are no reviews", () => {
  const h = galleryHarness({ sample: "" });
  h.open();
  assert.equal(h.docElements["lightbox-reviews"].hidden, false);
  assert.equal(h.docElements["lightbox-review-list"].children.length, 0);
  assert.equal(h.docElements["lightbox-rate"].hidden, false);
  assert.equal(h.docElements["lightbox-rating-summary"].hidden, true);
  assert.equal(h.docElements["lightbox-reviews-title"].textContent, "Reviews");
});

const emptyFeed = { ok: true, intake: "open", summary: { count: 0, average: 0 }, reviews: [], ratings: {} };
const rateStar = (h, value) => h.docElements["lightbox-rate"].querySelectorAll("[data-rate]")[value - 1].listeners.click({ preventDefault() {} });

test("the product popup offers Tell us more for this product, and the stars are buttons, not links", () => {
  const h = galleryHarness({ sample: "A lovely sample line for this piece." });
  h.open();
  const buttons = h.docElements["lightbox-rate"].querySelectorAll("[data-rate]");
  assert.ok(buttons.every((button) => button.attributes.href === undefined && button.disabled === false));
  assert.equal(h.docElements["lightbox-tell-more"].attributes.href, "reviews/?product=catalogue%3Asample-gift.jpg#write");
});

const pressedOf = (h) => h.docElements["lightbox-rate"].querySelectorAll("[data-rate]").map((button) => button.attributes["aria-pressed"]);
const disabledOf = (h) => h.docElements["lightbox-rate"].querySelectorAll("[data-rate]").map((button) => button.disabled);

test("tapping a star shows the stars and the thanks at once, then saves the rating in the background with a captcha token", async () => {
  const h = galleryHarness({ sample: "A lovely sample line for this piece.", feed: emptyFeed });
  h.open();
  await settleAll();
  rateStar(h, 4);
  // Before the server answers: stars pressed and locked, the thanks shown, never "Saving your rating…".
  assert.equal(h.docElements["lightbox-rate-status"].textContent, "Thanks! You rated this 4 out of 5 stars.");
  assert.deepEqual(pressedOf(h), ["true", "true", "true", "true", "false"]);
  assert.deepEqual(disabledOf(h), [true, true, true, true, true]);
  assert.equal(h.docElements["lightbox-tell-more"].attributes.href, "reviews/?product=catalogue%3Asample-gift.jpg&rating=4#write");
  assert.equal(h.storage.has("saloni-product-ratings"), false, "nothing is remembered until the server confirms");
  await settleAll();
  const captchaCall = h.fetchCalls.find((call) => call.captcha);
  assert.deepEqual(captchaCall, { captcha: "site-key", action: "product_rating" });
  const post = h.fetchCalls.find((call) => call.init && call.init.method === "POST");
  assert.equal(post.url, "https://script.google.test/exec");
  assert.equal(post.init.credentials, "omit");
  assert.equal(post.init.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(post.init.body, "action=rate&productId=catalogue%3Asample-gift.jpg&rating=4&ratingId=rating-0000-1111-2221&captchaToken=captcha-token");
  assert.equal(h.docElements["lightbox-rate-status"].focused, true);
  assert.equal(h.docElements["lightbox-rate-status"].textContent, "Thanks! You rated this 4 out of 5 stars.");
  assert.deepEqual(disabledOf(h), [true, true, true, true, true]);
  assert.deepEqual(pressedOf(h), ["true", "true", "true", "true", "false"]);
  assert.equal(h.docElements["lightbox-tell-more"].attributes.href, "reviews/?product=catalogue%3Asample-gift.jpg&rating=4#write");
  assert.deepEqual(JSON.parse(h.storage.get("saloni-product-ratings")), { "catalogue:sample-gift.jpg": 4 });
  assert.equal(textOf(h.docElements["lightbox-rating-summary"]), "★★★★☆ 4.0 out of 5 · 1 rating");
});

test("the reCAPTCHA script is loaded when an unrated product's stars appear, without running it", async () => {
  const h = galleryHarness({ sample: "A lovely sample line for this piece.", feed: emptyFeed, captcha: false });
  h.open();
  assert.equal(h.headScripts.length, 1);
  assert.equal(h.headScripts[0].src, "https://www.google.com/recaptcha/api.js?render=site-key");
  assert.equal(h.fetchCalls.filter((call) => call.captcha).length, 0, "warming does not execute reCAPTCHA");
  h.lightbox.close();
  h.open();
  assert.equal(h.headScripts.length, 1, "opening the popup again does not add a second script");
  const rated = galleryHarness({ sample: "A lovely sample line for this piece.", feed: emptyFeed, captcha: false, stored: { "catalogue:sample-gift.jpg": 5 } });
  rated.open();
  assert.equal(rated.headScripts.length, 0, "an already rated product does not need reCAPTCHA");
  const loaded = galleryHarness({ sample: "A lovely sample line for this piece.", feed: emptyFeed });
  loaded.open();
  assert.equal(loaded.headScripts.length, 0, "no second script when reCAPTCHA is already on the page");
});

test("a tap while the warmed reCAPTCHA script is still loading waits for it, then saves", async () => {
  const h = galleryHarness({ sample: "A lovely sample line for this piece.", feed: emptyFeed, captcha: false });
  h.open();
  await settleAll();
  rateStar(h, 5);
  await settleAll();
  assert.equal(h.headScripts.length, 1, "the warmed script is reused");
  assert.equal(h.fetchCalls.filter((call) => call.init && call.init.method === "POST").length, 0, "nothing is sent before reCAPTCHA loads");
  assert.deepEqual(pressedOf(h), ["true", "true", "true", "true", "true"]);
  h.windowObject.grecaptcha = { ready: (callback) => callback(), execute: (key, options) => { h.fetchCalls.push({ captcha: key, action: options.action }); return Promise.resolve("late-token"); } };
  h.headScripts[0].listeners.load();
  await settleAll();
  const post = h.fetchCalls.find((call) => call.init && call.init.method === "POST");
  assert.match(post.init.body, /rating=5&ratingId=rating-0000-1111-2221&captchaToken=late-token$/);
  assert.deepEqual(JSON.parse(h.storage.get("saloni-product-ratings")), { "catalogue:sample-gift.jpg": 5 });
});

test("a reCAPTCHA script that is already on the page is reused: run at once if ready, else wait for its load event", async () => {
  const tag = () => ({ listeners: {}, addEventListener(type, listener) { this.listeners[type] = listener; }, src: "https://www.google.com/recaptcha/api.js?render=site-key" });
  const ready = galleryHarness({ sample: "A lovely sample line for this piece.", feed: emptyFeed, captcha: false, existingScript: tag() });
  ready.windowObject.grecaptcha = { ready: (callback) => callback(), execute: () => Promise.resolve("ready-token") };
  ready.open();
  await settleAll();
  rateStar(ready, 2);
  await settleAll();
  assert.equal(ready.headScripts.length, 0, "no second script tag");
  assert.match(ready.fetchCalls.find((call) => call.init && call.init.method === "POST").init.body, /captchaToken=ready-token$/);
  const existing = tag();
  const waiting = galleryHarness({ sample: "A lovely sample line for this piece.", feed: emptyFeed, captcha: false, existingScript: existing });
  waiting.open();
  await settleAll();
  rateStar(waiting, 2);
  await settleAll();
  assert.equal(waiting.headScripts.length, 0, "the page's own tag is reused");
  assert.equal(waiting.fetchCalls.filter((call) => call.init && call.init.method === "POST").length, 0, "nothing is sent before the tag loads");
  waiting.windowObject.grecaptcha = { ready: (callback) => callback(), execute: () => Promise.resolve("loaded-token") };
  existing.listeners.load();
  await settleAll();
  assert.match(waiting.fetchCalls.find((call) => call.init && call.init.method === "POST").init.body, /captchaToken=loaded-token$/);
  assert.doesNotMatch(script.slice(script.indexOf("function loadRatingCaptcha"), script.indexOf("function withRatingCaptcha")), /poll|setTimeout/, "no polling loop");
});

test("a reCAPTCHA script that cannot load undoes the stars and says the rating was not saved", async () => {
  const h = galleryHarness({ sample: "A lovely sample line for this piece.", feed: emptyFeed, captcha: false });
  h.open();
  await settleAll();
  rateStar(h, 3);
  assert.deepEqual(pressedOf(h), ["true", "true", "true", "false", "false"]);
  h.headScripts[0].listeners.error();
  await settleAll();
  assert.equal(h.docElements["lightbox-rate-status"].textContent, "Your rating could not be saved. Please try again.");
  assert.deepEqual(pressedOf(h), ["false", "false", "false", "false", "false"]);
  assert.deepEqual(disabledOf(h), [false, false, false, false, false]);
  assert.equal(h.headScripts.length, 0, "the failed script is removed so the next tap can try again");
  rateStar(h, 3);
  assert.equal(h.headScripts.length, 1, "a new tap loads the script again");
});

test("a product already rated in this browser shows the saved rating and cannot be rated again", async () => {
  const h = galleryHarness({ sample: "A lovely sample line for this piece.", feed: emptyFeed, stored: { "catalogue:sample-gift.jpg": 5 } });
  h.open();
  await settleAll();
  assert.equal(h.docElements["lightbox-rate-status"].textContent, "You rated this 5 out of 5 stars. Thank you!");
  const buttons = h.docElements["lightbox-rate"].querySelectorAll("[data-rate]");
  assert.ok(buttons.every((button) => button.disabled));
  rateStar(h, 2);
  await settleAll();
  assert.equal(h.fetchCalls.filter((call) => call.init && call.init.method === "POST").length, 0);
  assert.equal(h.docElements["lightbox-tell-more"].attributes.href, "reviews/?product=catalogue%3Asample-gift.jpg&rating=5#write");
});

test("a rating that cannot be saved undoes the stars, explains why and lets the shopper try again", async () => {
  const failed = galleryHarness({ sample: "A lovely sample line for this piece.", feed: emptyFeed, rateResponse: { ok: false, error: "captcha" } });
  failed.open();
  await settleAll();
  rateStar(failed, 3);
  assert.deepEqual(pressedOf(failed), ["true", "true", "true", "false", "false"], "the stars show as given while the request is out");
  await settleAll();
  assert.equal(failed.docElements["lightbox-rate-status"].textContent, "Your rating could not be saved. Please try again.");
  assert.deepEqual(pressedOf(failed), ["false", "false", "false", "false", "false"]);
  assert.deepEqual(disabledOf(failed), [false, false, false, false, false]);
  assert.equal(failed.docElements["lightbox-tell-more"].attributes.href, "reviews/?product=catalogue%3Asample-gift.jpg#write");
  assert.equal(failed.storage.has("saloni-product-ratings"), false);
  assert.equal(textOf(failed.docElements["lightbox-rating-summary"]), "", "a failed rating does not change the average");
  const paused = galleryHarness({ sample: "A lovely sample line for this piece.", feed: emptyFeed, rateResponse: { ok: false, error: "paused" } });
  paused.open();
  await settleAll();
  rateStar(paused, 3);
  await settleAll();
  assert.equal(paused.docElements["lightbox-rate-status"].textContent, "Ratings are paused right now. Please try again later.");
  assert.deepEqual(disabledOf(paused), [false, false, false, false, false]);
  const capped = galleryHarness({ sample: "A lovely sample line for this piece.", feed: emptyFeed, rateResponse: { ok: false, error: "cap" } });
  capped.open();
  await settleAll();
  rateStar(capped, 3);
  await settleAll();
  assert.equal(capped.docElements["lightbox-rate-status"].textContent, "We have had a lot of ratings today. Please try again tomorrow.");
  assert.deepEqual(pressedOf(capped), ["false", "false", "false", "false", "false"]);
});

test("the product popup shows the average star rating from real reviews of that product only", async () => {
  const review = (productId, rating, firstName) => ({ id: "r-" + firstName, rating, productId, productName: "Sample gift", firstName, city: "", comment: "Nice.", date: "2026-11-08", photos: [] });
  const feed = { ok: true, intake: "open", summary: { count: 3, average: 3.7 }, reviews: [review("catalogue:sample-gift.jpg", 5, "Asha"), review("catalogue:sample-gift.jpg", 4, "Meera"), review("catalogue:other-gift.jpg", 1, "Ravi")] };
  const h = galleryHarness({ sample: "A lovely sample line for this piece.", feed });
  h.open();
  assert.equal(h.docElements["lightbox-rating-summary"].hidden, true);
  await settleAll();
  const summary = h.docElements["lightbox-rating-summary"];
  assert.equal(summary.hidden, false);
  assert.equal(textOf(summary), "★★★★★ 4.5 out of 5 · 2 ratings");
  assert.equal(summary.children[0].attributes["aria-hidden"], "true");
});

test("the product popup shows no rating line for a piece nobody has rated", async () => {
  const h = galleryHarness({ sample: "A lovely sample line for this piece.", feed: { ok: true, intake: "open", summary: { count: 0, average: 0 }, reviews: [], ratings: { "catalogue:other-gift.jpg": [5, 1] } } });
  h.open();
  assert.equal(h.docElements["lightbox-rating-summary"].hidden, true, "nothing shows while the feed is loading");
  await settleAll();
  assert.equal(h.docElements["lightbox-rating-summary"].hidden, true);
  assert.equal(textOf(h.docElements["lightbox-rating-summary"]), "");
});

test("the product popup shows no rating line when the feed could not be read", async () => {
  const h = galleryHarness({ sample: "A lovely sample line for this piece.", feed: "fail" });
  h.open();
  await settleAll();
  assert.equal(h.docElements["lightbox-rating-summary"].hidden, true);
  assert.equal(textOf(h.docElements["lightbox-rating-summary"]), "");
});

test("a retry after a network failure reuses the same rating ID so the server counts it once", async () => {
  const h = galleryHarness({ sample: "A lovely sample line for this piece.", feed: emptyFeed, rateReject: true });
  h.open();
  await settleAll();
  rateStar(h, 5);
  await settleAll();
  rateStar(h, 5);
  await settleAll();
  rateStar(h, 3);
  await settleAll();
  const ids = h.fetchCalls.filter((call) => call.init && call.init.method === "POST").map((call) => /ratingId=([^&]+)/.exec(call.init.body)[1]);
  assert.equal(ids.length, 3);
  assert.equal(ids[0], ids[1]);
  assert.notEqual(ids[2], ids[0]);
});

test("the popup average uses the feed's per-product rating totals, which include quick ratings", async () => {
  const feed = { ok: true, intake: "open", summary: { count: 1, average: 5 }, reviews: [{ id: "r-a", rating: 5, productId: "catalogue:sample-gift.jpg", productName: "Sample gift", firstName: "Asha", city: "", comment: "Nice.", date: "2026-11-08", photos: [] }], ratings: { "catalogue:sample-gift.jpg": [12, 3], "catalogue:other-gift.jpg": [1, 1] } };
  const h = galleryHarness({ sample: "A lovely sample line for this piece.", feed });
  h.open();
  await settleAll();
  assert.equal(textOf(h.docElements["lightbox-rating-summary"]), "★★★★☆ 4.0 out of 5 · 3 ratings");
});

test("the popup rating line shows the saved feed at once, keeps the shopper's own rating when the fresh feed arrives, and fresh data wins", async () => {
  const productId = "catalogue:sample-gift.jpg";
  const review = (firstName, rating) => ({ id: "r-" + firstName, rating, productId, productName: "Sample gift", firstName, city: "", comment: firstName + " loved it.", date: "2026-11-08", photos: [] });
  const saved = { ok: true, intake: "open", summary: { count: 1, average: 5 }, reviews: [review("Asha", 5)], ratings: { [productId]: [10, 2] } };
  const fresh = { ok: true, intake: "open", summary: { count: 2, average: 4.5 }, reviews: [review("Asha", 5), review("Meera", 4)], ratings: { [productId]: [20, 4] } };
  const h = galleryHarness({ sample: "A lovely sample line for this piece.", feed: fresh, savedFeed: saved, deferFeed: true });
  h.open();
  assert.equal(textOf(h.docElements["lightbox-rating-summary"]), "★★★★★ 5.0 out of 5 · 2 ratings", "the saved copy shows before the network answers");
  assert.match(textOf(h.docElements["lightbox-review-list"]), /Asha/);
  assert.equal(h.feedReads.length, 1, "the fresh read still starts");
  rateStar(h, 4);
  await settleAll();
  assert.equal(textOf(h.docElements["lightbox-rating-summary"]), "★★★★★ 4.7 out of 5 · 3 ratings", "the shopper's rating is added at once");
  assert.equal(h.fetchCalls.filter((call) => call.init && call.init.method === "POST").length, 1);
  h.feedReads[0].resolve();
  await settleAll();
  assert.equal(h.feedReads.length, 1, "one background read, no loop");
  assert.match(textOf(h.docElements["lightbox-review-list"]), /Meera/, "the fresh review list replaces the saved one");
  assert.equal(textOf(h.docElements["lightbox-rating-summary"]), "★★★★★ 4.8 out of 5 · 5 ratings", "fresh totals plus the shopper's own rating, not lost");
  assert.deepEqual(JSON.parse(h.storage.get("saloni-product-ratings")), { [productId]: 4 });
  assert.equal(JSON.parse(h.storage.get("saloni-reviews-feed")).data.ratings[productId][0], 20, "the saved copy is the fresh feed, without the optimistic rating");
});

test("a failed refresh leaves the popup showing the saved feed, and a popup opened during the refresh also gets the fresh feed", async () => {
  const productId = "catalogue:sample-gift.jpg";
  const saved = { ok: true, intake: "open", summary: { count: 0, average: 0 }, reviews: [], ratings: { [productId]: [8, 2] } };
  const fresh = { ok: true, intake: "open", summary: { count: 0, average: 0 }, reviews: [], ratings: { [productId]: [15, 3] } };
  const failing = galleryHarness({ sample: "A lovely sample line for this piece.", feed: fresh, savedFeed: saved, deferFeed: true });
  failing.open();
  failing.feedReads[0].reject();
  await settleAll();
  assert.equal(textOf(failing.docElements["lightbox-rating-summary"]), "★★★★☆ 4.0 out of 5 · 2 ratings");
  const h = galleryHarness({ sample: "A lovely sample line for this piece.", feed: fresh, savedFeed: saved, deferFeed: true, homeReviews: true, observer: true });
  h.observers.find((item) => item.targets.includes(h.docElements["customer-reviews"])).callback([{ isIntersecting: true }]);
  assert.equal(h.docElements["reviews-list"].children.length, 0);
  assert.equal(h.docElements["reviews-status"].hidden, false, "no reviews yet: the saved copy has none");
  h.open();
  assert.equal(textOf(h.docElements["lightbox-rating-summary"]), "★★★★☆ 4.0 out of 5 · 2 ratings");
  assert.equal(h.feedReads.length, 1, "the popup joins the read already in flight");
  h.feedReads[0].resolve();
  await settleAll();
  assert.equal(textOf(h.docElements["lightbox-rating-summary"]), "★★★★★ 5.0 out of 5 · 3 ratings", "an open popup re-renders with the fresh feed");
});

test("the product popup adds real reviews for that product only, above the sample, and fetches the feed once", async () => {
  const review = (productId, firstName) => ({ id: "r-" + firstName, rating: 5, productId, productName: "Sample gift", firstName, city: "", comment: firstName + " loved it.", date: "2026-11-08", photos: [] });
  const feed = { ok: true, intake: "open", summary: { count: 2, average: 5 }, reviews: [review("catalogue:sample-gift.jpg", "Asha"), review("catalogue:other-gift.jpg", "Ravi")] };
  const h = galleryHarness({ sample: "A lovely sample line for this piece.", feed });
  h.open();
  await settleAll();
  const items = h.docElements["lightbox-review-list"].children;
  assert.equal(h.fetchCalls.length, 1);
  assert.equal(h.fetchCalls[0].url, "https://script.google.test/exec?action=reviews");
  assert.deepEqual(items.map((item) => item.className), ["review-card", "review-card sample-review"]);
  assert.equal(h.docElements["lightbox-reviews-title"].textContent, "Reviews");
  assert.match(textOf(items[0]), /Asha/);
  assert.doesNotMatch(textOf(h.docElements["lightbox-review-list"]), /Ravi/);
  h.lightbox.close();
  h.open();
  await settleAll();
  assert.equal(h.fetchCalls.length, 1);
  assert.equal(h.docElements["lightbox-review-list"].children.length, 2);
});

test("the home reviews and the product popup share one read of the feed", async () => {
  const review = (productId, firstName) => ({ id: "r-" + firstName, rating: 5, productId, productName: "Sample gift", firstName, city: "", comment: firstName + " loved it.", date: "2026-11-08", photos: [] });
  const feed = { ok: true, intake: "open", summary: { count: 2, average: 5 }, reviews: [review("catalogue:sample-gift.jpg", "Asha"), review("catalogue:other-gift.jpg", "Ravi")] };
  const h = galleryHarness({ sample: "A lovely sample line for this piece.", feed, homeReviews: true, observer: true });
  const observer = h.observers.find((item) => item.targets.includes(h.docElements["customer-reviews"]));
  assert.ok(observer, "the home section waits to come near the screen");
  assert.equal(h.fetchCalls.length, 0);
  h.open();
  assert.equal(h.fetchCalls.length, 1, "the popup starts the read");
  h.open();
  observer.callback([{ isIntersecting: true }]);
  await settleAll();
  assert.equal(h.fetchCalls.length, 1, "the home section joins the read in flight");
  assert.equal(h.docElements["reviews-list"].children.length, 2);
  assert.match(textOf(h.docElements["lightbox-review-list"]), /Asha/);
  assert.equal(h.docElements["reviews-status"].hidden, true);
  h.lightbox.close();
  h.open();
  await settleAll();
  assert.equal(h.fetchCalls.length, 1, "later renders reuse the data");
});

test("the home reviews reuse a feed the popup already read, and show the calm message when it failed", async () => {
  const feed = { ok: true, intake: "open", summary: { count: 1, average: 5 }, reviews: [{ id: "r-a", rating: 5, productId: "studio", productName: "", firstName: "Asha", city: "", comment: "Nice.", date: "2026-11-08", photos: [] }] };
  const h = galleryHarness({ sample: "A lovely sample line for this piece.", feed, homeReviews: true, observer: true });
  h.open();
  await settleAll();
  h.observers.find((item) => item.targets.includes(h.docElements["customer-reviews"])).callback([{ isIntersecting: true }]);
  assert.equal(h.fetchCalls.length, 1);
  assert.equal(h.docElements["reviews-list"].children.length, 1);
  const failing = galleryHarness({ sample: "A lovely sample line for this piece.", feed: "fail", homeReviews: true });
  failing.open();
  await settleAll();
  assert.equal(failing.fetchCalls.length, 1, "no observer: the home section loads at once, and shares the read");
  assert.equal(failing.docElements["reviews-status"].textContent, "Reviews could not be loaded right now. Please try again later.");
  assert.equal(failing.docElements["reviews-status"].hidden, false);
  assert.equal(failing.docElements["reviews-summary"].hidden, true);
  assert.deepEqual(failing.docElements["lightbox-review-list"].children.map((item) => item.className), ["review-card sample-review"], "the popup treats a failed feed as empty");
});

test("a failing review feed still leaves the sample in the product popup", async () => {
  const h = galleryHarness({ sample: "A lovely sample line for this piece.", feed: "fail" });
  h.open();
  await settleAll();
  assert.equal(h.docElements["lightbox-reviews"].hidden, false);
  assert.deepEqual(h.docElements["lightbox-review-list"].children.map((item) => item.className), ["review-card sample-review"]);
});

test("lightbox gallery steps through the card photo and its extra images", () => {
  const h = galleryHarness({ colours: "teal styled" });
  assert.deepEqual(h.srcAssignments, []);
  h.open();
  assert.equal(h.imageTarget.src, "assets/sample-gift.jpg?v=3");
  assert.equal(h.docElements["lightbox-photo-prev"].hidden, false);
  assert.equal(h.docElements["lightbox-photo-next"].hidden, false);
  assert.equal(h.docElements["lightbox-photo-label"].hidden, false);
  assert.match(h.docElements["lightbox-photo-label"].textContent, /1 of 3 · As shown/);
  assert.deepEqual(h.srcAssignments, ["assets/sample-gift.jpg?v=3"], "no variant URL until it is shown");
  h.docElements["lightbox-photo-next"].listeners.click();
  assert.equal(h.imageTarget.src, "assets/ai-images/sample-gift--teal.webp");
  assert.match(h.imageTarget.alt, /^Teal colour idea\. Sample gift photo/);
  assert.match(h.docElements["lightbox-photo-label"].textContent, /2 of 3 · Colour idea: Teal/);
  assert.match(h.docElements["lightbox-photo-label"].textContent, /\nUse the button below on this photo to choose "Teal"\.$/);
  assert.doesNotMatch(h.docElements["lightbox-photo-label"].textContent, /AI concept|handmade and will vary/);
  h.docElements["lightbox-photo-next"].listeners.click();
  h.docElements["lightbox-photo-next"].listeners.click();
  assert.equal(h.imageTarget.src, "assets/sample-gift.jpg?v=3", "next wraps to the card photo");
  h.docElements["lightbox-photo-prev"].listeners.click();
  assert.equal(h.imageTarget.src, "assets/ai-images/sample-gift--styled.webp", "prev wraps to the styled scene");
  assert.match(h.imageTarget.alt, /^Styled scene\. Sample gift photo/);
  assert.match(h.docElements["lightbox-photo-label"].textContent, /^3 of 3 · Styled scene$/);
});

test("card image box scrolls through the extra photos and opens the lightbox at the one shown", () => {
  const h = galleryHarness({ colours: "teal styled", cardPhotos: true });
  const strip = h.trigger.children[0];
  assert.equal(strip.className, "card-photos", "the card photo moves into a scroll strip");
  const [first, teal, styled] = strip.children;
  const dots = h.trigger.children[1];
  assert.equal(first, h.cardImage, "the real photo stays first");
  assert.equal(teal.tagName, "img");
  assert.equal(styled.tagName, "img");
  assert.equal(teal.src, undefined, "extra photos load nothing before the shopper scrolls");
  assert.equal(styled.alt, "");
  assert.equal(strip.children.length, 3);
  assert.equal(dots.className, "card-photo-dots", "the dots sit over the photo and do not scroll away");
  assert.equal(dots.attributes["aria-hidden"], "true");
  assert.equal(dots.children.length, 3);
  assert.equal(dots.children[0].className, "is-active");
  strip.clientWidth = 300;
  strip.scrollLeft = 300;
  strip.listeners.scroll();
  assert.equal(teal.src, "assets/ai-images/sample-gift--teal.webp");
  assert.equal(styled.src, "assets/ai-images/sample-gift--styled.webp");
  assert.equal(dots.children[0].className, "");
  assert.equal(dots.children[1].className, "is-active");
  h.open();
  assert.equal(h.imageTarget.src, "assets/ai-images/sample-gift--teal.webp", "the lightbox opens on the photo the card shows");
  assert.match(h.docElements["lightbox-photo-label"].textContent, /^2 of 3 · Colour idea: Teal/);
});

test("card photo strip remembers the colour on show for the Add to cart button", () => {
  const h = galleryHarness({ colours: "teal styled", cardPhotos: true });
  const strip = h.trigger.children[0];
  strip.clientWidth = 300;
  strip.scrollLeft = 300;
  strip.listeners.scroll();
  assert.equal(h.trigger.__saloniPhotoName, "teal");
  strip.scrollLeft = 600;
  strip.listeners.scroll();
  assert.equal(h.trigger.__saloniPhotoName, "styled");
  strip.scrollLeft = 0;
  strip.listeners.scroll();
  assert.equal(h.trigger.__saloniPhotoName, "", "the real photo carries no colour");
});

test("lightbox request button hands the photo on show to the card's order button", () => {
  const h = galleryHarness({ colours: "teal styled" });
  const choose = () => { h.docElements["lightbox-request"].listeners.click(); const name = h.requestButton.__saloniChosenPhoto; h.requestButton.__saloniChosenPhoto = undefined; return name; };
  h.open();
  assert.equal(choose(), "", "the real photo carries no colour");
  h.open();
  h.docElements["lightbox-photo-next"].listeners.click();
  assert.equal(choose(), "teal");
  assert.equal(h.requestButton.clicked, 2, "the card's own button still receives the click");
  h.open();
  h.docElements["lightbox-photo-prev"].listeners.click();
  assert.equal(choose(), "styled");
});

test("lightbox hint points at the request button, and falls back to order notes without one", () => {
  const withButton = galleryHarness({ colours: "teal", cardPhotos: true });
  const strip = withButton.trigger.children[0];
  strip.clientWidth = 300;
  strip.scrollLeft = 300;
  strip.listeners.scroll();
  withButton.open();
  assert.equal(withButton.docElements["lightbox-request"].hidden, false);
  assert.match(withButton.docElements["lightbox-photo-label"].textContent, /\nUse the button below on this photo to choose "Teal"\.$/, "right on the first open too");
  const without = galleryHarness({ colours: "teal", withRequest: false });
  without.open();
  without.docElements["lightbox-photo-next"].listeners.click();
  assert.equal(without.docElements["lightbox-request"].hidden, true);
  assert.match(without.docElements["lightbox-photo-label"].textContent, /\nMention "Teal" in your order notes\.$/);
});

test("lightbox hint tells a shopper to remove the item first when it is already in the cart", () => {
  const inCart = galleryHarness({ colours: "teal" });
  inCart.requestButton.setAttribute("aria-pressed", "true");
  inCart.open();
  inCart.docElements["lightbox-photo-next"].listeners.click();
  assert.equal(inCart.docElements["lightbox-request"].textContent, "Remove from cart");
  assert.match(inCart.docElements["lightbox-photo-label"].textContent, /\nRemove it from the cart first to choose "Teal" instead\.$/);
  const notInCart = galleryHarness({ colours: "teal" });
  notInCart.open();
  notInCart.docElements["lightbox-photo-next"].listeners.click();
  assert.match(notInCart.docElements["lightbox-photo-label"].textContent, /\nUse the button below on this photo to choose "Teal"\.$/);
  const quote = galleryHarness({ colours: "teal" });
  quote.requestButton.setAttribute("data-order-prefill", "quote");
  quote.open();
  quote.docElements["lightbox-photo-next"].listeners.click();
  assert.equal(quote.docElements["lightbox-request"].textContent, "Ask for a quote");
  assert.match(quote.docElements["lightbox-photo-label"].textContent, /\nUse the button below on this photo to choose "Teal"\.$/);
});

test("card image box stays a single photo without valid AI images", () => {
  [undefined, "", "Teal ../x styled.webp"].forEach((colours) => {
    const h = galleryHarness({ colours, cardPhotos: true });
    assert.deepEqual(h.trigger.children, [h.cardImage]);
    h.open();
    assert.equal(h.imageTarget.src, "assets/sample-gift.jpg?v=3");
  });
});

test("lightbox gallery stays single-photo without valid AI images", () => {
  [undefined, "", "Teal ../x styled.webp"].forEach((colours) => {
    const h = galleryHarness({ colours });
    h.open();
    assert.equal(h.docElements["lightbox-photo-prev"].hidden, true);
    assert.equal(h.docElements["lightbox-photo-next"].hidden, true);
    assert.equal(h.docElements["lightbox-photo-label"].hidden, true);
    const event = h.press("ArrowRight");
    assert.equal(event.prevented, 0);
    assert.equal(h.imageTarget.src, "assets/sample-gift.jpg?v=3");
  });
});

test("lightbox gallery follows arrow keys and swipes without hijacking vertical scroll", () => {
  const h = galleryHarness({ colours: "teal styled" });
  h.open();
  assert.equal(h.press("ArrowRight").prevented, 1);
  assert.equal(h.imageTarget.src, "assets/ai-images/sample-gift--teal.webp");
  assert.equal(h.press("ArrowLeft").prevented, 1);
  assert.equal(h.imageTarget.src, "assets/sample-gift.jpg?v=3");
  assert.equal(h.press("Enter").prevented, 0);
  h.swipe(-80, 5);
  assert.equal(h.imageTarget.src, "assets/ai-images/sample-gift--teal.webp", "left swipe shows the next photo");
  h.swipe(80, 5);
  assert.equal(h.imageTarget.src, "assets/sample-gift.jpg?v=3", "right swipe shows the previous photo");
  h.swipe(-30, 0);
  assert.equal(h.imageTarget.src, "assets/sample-gift.jpg?v=3", "short drag is ignored");
  h.swipe(-60, 70);
  assert.equal(h.imageTarget.src, "assets/sample-gift.jpg?v=3", "vertical scroll is ignored");
});

test("lightbox request button keeps acting on the product from any colour photo", () => {
  const h = galleryHarness({ colours: "teal styled" });
  h.open();
  h.docElements["lightbox-photo-next"].listeners.click();
  h.docElements["lightbox-photo-next"].listeners.click();
  assert.equal(h.docElements["lightbox-request"].textContent, "Add to cart");
  h.docElements["lightbox-request"].listeners.click();
  assert.equal(h.requestButton.clicked, 1);
  assert.equal(h.docElements.order.focused, true);
});

test("lightbox shows What's included from the card note and keeps the rest as description", () => {
  const h = galleryHarness({ colours: "teal" });
  h.open();
  assert.equal(h.docElements["lightbox-image-description"].textContent, "Rich colour and golden flecks");
  assert.equal(h.docElements["lightbox-included"].hidden, false);
  assert.equal(h.docElements["lightbox-included"].textContent, "What's included: one holder · tealight not included · shown palette or custom colours");
  const plain = galleryHarness({ paragraphs: ["Just a description"] });
  plain.open();
  assert.equal(plain.docElements["lightbox-image-description"].textContent, "Just a description");
  assert.equal(plain.docElements["lightbox-included"].hidden, true);
  assert.equal(plain.docElements["lightbox-included"].textContent, "");
});

test("lightbox gallery resets on close and reopens at the card photo", () => {
  const h = galleryHarness({ colours: "teal styled" });
  h.open();
  h.docElements["lightbox-photo-next"].listeners.click();
  h.lightbox.close();
  assert.equal(h.docElements["lightbox-photo-label"].textContent, "");
  assert.equal(h.docElements["lightbox-photo-label"].hidden, true);
  assert.equal(h.docElements["lightbox-included"].textContent, "");
  assert.equal(h.docElements["lightbox-photo-prev"].hidden, true);
  assert.equal(h.press("ArrowRight").prevented, 0);
  h.open();
  assert.equal(h.imageTarget.src, "assets/sample-gift.jpg?v=3");
  assert.match(h.docElements["lightbox-photo-label"].textContent, /1 of 3 · As shown/);
});

test("lightbox ignores a late close event that arrives after it reopened", () => {
  const h = galleryHarness({ colours: "teal styled" });
  h.open();
  h.docElements["lightbox-photo-next"].listeners.click();
  // Chrome can deliver a stale close event after the dialog is already open again.
  h.lightbox.listeners.close();
  assert.equal(h.lightbox.open, true);
  assert.equal(h.imageTarget.src, "assets/ai-images/sample-gift--teal.webp");
  assert.match(h.docElements["lightbox-photo-label"].textContent, /2 of 3 · Colour idea: Teal/);
});

test("hero lightbox trigger uses the AI images of its target card and names multi-word colours", () => {
  const h = galleryHarness({ colours: "royal-blue", heroTarget: true });
  h.open();
  h.docElements["lightbox-photo-next"].listeners.click();
  assert.equal(h.imageTarget.src, "assets/ai-images/sample-gift--royal-blue.webp");
  assert.match(h.docElements["lightbox-photo-label"].textContent, /2 of 2 · Colour idea: Royal blue\n[^\n]*Use the button below on this photo to choose "Royal blue"\./);
});

test("lightbox gallery drops an AI image that fails to load and shows the card photo", () => {
  const h = galleryHarness({ colours: "teal styled" });
  h.open();
  h.docElements["lightbox-photo-next"].listeners.click();
  h.imageTarget.listeners.error();
  assert.equal(h.imageTarget.src, "assets/sample-gift.jpg?v=3");
  assert.match(h.docElements["lightbox-photo-label"].textContent, /1 of 2 · As shown/);
  h.docElements["lightbox-photo-next"].listeners.click();
  assert.equal(h.imageTarget.src, "assets/ai-images/sample-gift--styled.webp");
  h.imageTarget.listeners.error();
  assert.equal(h.docElements["lightbox-photo-next"].hidden, true, "no variants left means a single photo");
  h.imageTarget.listeners.error();
  assert.equal(h.imageTarget.src, "assets/sample-gift.jpg?v=3", "an error on the card photo changes nothing");
});

test("lightbox ignores arrow keys with a modifier and survives a drag that ends on the backdrop", () => {
  const h = galleryHarness({ colours: "teal styled" });
  h.open();
  ["altKey", "metaKey", "ctrlKey", "shiftKey"].forEach((modifier) => {
    const event = { key: "ArrowLeft", prevented: 0, preventDefault() { this.prevented += 1; } };
    event[modifier] = true;
    h.lightbox.listeners.keydown(event);
    assert.equal(event.prevented, 0, `${modifier}+ArrowLeft must stay with the browser`);
    assert.equal(h.imageTarget.src, "assets/sample-gift.jpg?v=3");
  });
  assert.equal(h.press("ArrowRight").prevented, 1);
  // A press that starts on the panel and ends on the backdrop fires click on the dialog.
  h.lightbox.listeners.pointerdown({ target: { id: "lightbox-stage" } });
  h.lightbox.listeners.click({ target: h.lightbox });
  assert.equal(h.lightbox.open, true, "a drag that ends on the backdrop keeps the lightbox open");
  h.lightbox.listeners.click({ target: h.lightbox });
  assert.equal(h.lightbox.open, false, "a plain backdrop click still closes it");
  h.open();
  h.lightbox.listeners.pointerdown({ target: h.lightbox });
  h.lightbox.listeners.click({ target: h.lightbox });
  assert.equal(h.lightbox.open, false, "a press that starts on the backdrop closes it");
});

test("lightbox gallery works when the dialog has no gallery elements", () => {
  const h = galleryHarness({ colours: "teal", withGalleryElements: false });
  h.open();
  assert.equal(h.imageTarget.src, "assets/sample-gift.jpg?v=3");
  assert.doesNotThrow(() => h.press("ArrowRight"));
});

test("lightbox gallery markup, care tips and styles meet the touch and scroll contract", () => {
  const dialog = html.match(/<dialog class="lightbox-dialog"[\s\S]*?<\/dialog>/)?.[0] || "";
  const figure = dialog.match(/<figure class="lightbox-figure"[^>]*>[\s\S]*?<\/figure>/)?.[0] || "";
  const summary = dialog.match(/<div class="lightbox-order-summary">[\s\S]*?<\/div>/)?.[0] || "";
  assert.match(figure, /<div class="lightbox-stage" id="lightbox-stage">[\s\S]*id="lightbox-image"[\s\S]*id="lightbox-photo-prev"[\s\S]*id="lightbox-photo-next"/);
  assert.match(figure, /<button type="button" class="lightbox-photo-nav lightbox-photo-prev" id="lightbox-photo-prev" aria-label="Previous image" hidden>/);
  assert.match(figure, /<button type="button" class="lightbox-photo-nav lightbox-photo-next" id="lightbox-photo-next" aria-label="Next image" hidden>/);
  assert.match(figure, /id="lightbox-photo-label"[^>]*aria-live="polite"[^>]*hidden/);
  assert.match(figure, /id="lightbox-included"[^>]*hidden/);
  const care = figure.match(/<details class="lightbox-care">[\s\S]*?<\/details>/)?.[0] || "";
  assert.match(care, /<summary>Resin care tips<\/summary>/);
  assert.equal((care.match(/<li>/g) || []).length, 4);
  assert.doesNotMatch(summary, /lightbox-care|lightbox-photo/);
  assert.doesNotMatch(dialog, /lightbox-(?:previous|next|position)/);
  assert.match(css, /\.lightbox-stage\s*\{[^}]*touch-action:\s*pan-y/);
  assert.match(css, /\.lightbox-photo-nav\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/);
  assert.match(css, /\.lightbox-care summary\s*\{[^}]*min-height:\s*44px/);
  assert.doesNotMatch(html, /(?:colour-options|ai-images)\//, "the homepage must not fetch AI images");
  assert.doesNotMatch(html, /data-colour-options/, "recolour previews are retired");
});

test("lightbox keeps the whole photo and its colour label on screen on desktop and closes the phone gap", () => {
  const desktop = css.match(/@media \(min-width: 621px\) and \(min-height: 621px\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(desktop, "expected a desktop lightbox media query");
  assert.match(desktop, /dialog\.lightbox-dialog,\s*\.lightbox-panel\s*\{[^}]*max-height:\s*calc\(100dvh - 2rem\)/);
  assert.match(desktop, /\.lightbox-image\s*\{[^}]*max-height:\s*min\(50vh, 460px\)/);
  assert.match(css, /\.lightbox-image\s*\{[^}]*object-fit:\s*contain/);
  const phone = css.match(/@media \(max-width: 620px\),\s*\(max-height: 620px\) and \(max-width: 900px\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(phone, /\.lightbox-panel\s*\{[^}]*justify-content:\s*center/);
  assert.match(phone, /\.lightbox-figure\s*\{[^}]*flex-grow:\s*0/);
  assert.match(phone, /\.lightbox-image\s*\{[^}]*max-height:\s*min\(55dvh, calc\(100dvh - 11rem\)\)/, "tall photos must leave room for the colour label on phones");
  assert.match(css, /\.lightbox-photo-label\s*\{[^}]*min-height:\s*2\.6em/);
  assert.match(phone, /\.lightbox-photo-label\s*\{[^}]*min-height:\s*3\.9em/);
});

test("catalogue card body opens its existing preview while native link focus stays independent", () => {
  const start = script.indexOf("    var lightbox = document.getElementById(\"art-lightbox\")");
  const end = script.indexOf("\n\n    initCatalogueExperience();", start);
  const makeElement = (extra = {}) => Object.assign({
    hidden: false,
    attributes: {},
    listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    getAttribute(name) { return this.attributes[name] || ""; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    focus() { this.focused = true; },
  }, extra);
  const title = { textContent: "Sample gift" };
  const paragraph = { textContent: "A sample gift description." };
  const included = { textContent: "one keepsake · display props not included" };
  const image = { alt: "Sample gift photo" };
  const orderButton = makeElement({ closest(selector) { return selector.indexOf("button") !== -1 ? this : null; } });
  const priceRow = makeElement({ querySelector(selector) {
    if (selector === "dt") return { textContent: "Price" };
    if (selector === "dd") return { textContent: "₹349" };
    return null;
  } });
  const card = makeElement({ querySelector(selector) {
    if (selector === "figcaption strong") return title;
    if (selector === "[data-order-prefill]") return orderButton;
    return null;
  }, querySelectorAll(selector) {
    if (selector === ".product-pricing > div") return [priceRow];
    if (selector === "figcaption p") return [paragraph, included];
    return [];
  } });
  const grid = makeElement({ querySelectorAll() { return [trigger]; } });
  const trigger = makeElement({ href: "assets/sample-gift.jpg", querySelector(selector) { return selector === "img" ? image : null; }, closest(selector) {
    if (selector === "article") return card;
    if (selector === ".catalogue-grid") return grid;
    return null;
  } });
  const lightbox = makeElement({ showModal() { this.open = true; }, close() { this.open = false; this.listeners.close(); } });
  const imageTarget = makeElement();
  const docElements = {
    "art-lightbox": lightbox,
    "lightbox-image": imageTarget,
    "lightbox-caption": makeElement(),
    "lightbox-product-name": makeElement(),
    "lightbox-product-price": makeElement(),
    "lightbox-product-size": makeElement(),
    "lightbox-image-description": makeElement(),
    "lightbox-included": makeElement(),
    "lightbox-request": makeElement(),
  };
  const documentObject = {
    getElementById(id) { return docElements[id] || null; },
    querySelectorAll(selector) { return selector === "[data-lightbox-trigger]" ? [trigger] : []; },
  };
  vm.runInNewContext(`(function () { ${aiPhotoHelpers}${script.slice(start, end)} })();`, { document: documentObject, window: {} });
  assert.equal(card.getAttribute("tabindex"), "");
  assert.equal(typeof card.listeners.click, "function");
  assert.equal(card.listeners.keydown, undefined);
  const bodyTarget = makeElement();
  card.listeners.click({ target: bodyTarget, defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault() {} });
  assert.equal(lightbox.open, true);
  assert.equal(docElements["lightbox-product-name"].textContent, "Sample gift");
  assert.equal(docElements["lightbox-image-description"].textContent, "A sample gift description.");
  assert.match(docElements["lightbox-included"].textContent, /^What's included: one keepsake · display props not included/);
  lightbox.close();
  assert.equal(trigger.focused, true);
  const orderEvent = { target: orderButton, defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault() { this.defaultPrevented = true; } };
  card.listeners.click(orderEvent);
  assert.equal(lightbox.open, false);
  assert.equal(orderEvent.defaultPrevented, false);
  assert.match(css, /\.catalogue-ready \.catalogue-grid[^\{]*\{[^}]*cursor:\s*pointer/);
});

test("hero lightbox targets the hidden canonical card and restores focus to the hero opener", () => {
  const start = script.indexOf("    var lightbox = document.getElementById(\"art-lightbox\")");
  const end = script.indexOf("\n\n    initCatalogueExperience();", start);
  const makeElement = (extra = {}) => Object.assign({
    hidden: false,
    attributes: {},
    listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    getAttribute(name) { return this.attributes[name] || ""; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    focus() { this.focused = true; },
  }, extra);
  const heroImage = makeElement({ alt: "Coquette heart trinket tray in soft resin" });
  const canonicalImage = makeElement({ alt: "Illustrative preview: Coquette heart trinket tray in soft resin" });
  const priceRow = makeElement({ querySelector(selector) {
    if (selector === "dt") return { textContent: "From" };
    if (selector === "dd") return { textContent: "₹349" };
    return null;
  } });
  const sizeRow = makeElement({ querySelector(selector) {
    if (selector === "dt") return { textContent: "Size" };
    if (selector === "dd") return { textContent: "4 in" };
    return null;
  } });
  const orderButton = makeElement();
  const title = { textContent: "Tiny tray, big feelings" };
  const paragraph = { textContent: "A soft place for rings, earbuds, and the little things you share." };
  const canonicalTrigger = makeElement({ href: "assets/romantic-heart-trinket-tray.webp", querySelector(selector) { return selector === "img" ? canonicalImage : null; } });
  const canonicalCard = makeElement({ hidden: true, querySelector(selector) {
    if (selector === "[data-lightbox-trigger]") return canonicalTrigger;
    if (selector === "figcaption strong") return title;
    if (selector === "[data-order-prefill]") return orderButton;
    return null;
  }, querySelectorAll(selector) {
    if (selector === ".product-pricing > div") return [priceRow, sizeRow];
    if (selector === "figcaption p") return [paragraph];
    return [];
  } });
  canonicalTrigger.closest = (selector) => selector === "article" ? canonicalCard : null;
  const heroTrigger = makeElement({ href: "assets/romantic-heart-trinket-tray.webp", attributes: { "data-lightbox-target": "romantic-trinket" }, querySelector(selector) { return selector === "img" ? heroImage : null; } });
  const lightbox = makeElement({ showModal() { this.open = true; }, close() { this.open = false; this.listeners.close(); } });
  const imageTarget = makeElement();
  const docElements = {
    "art-lightbox": lightbox,
    "lightbox-image": imageTarget,
    "lightbox-caption": makeElement(),
    "lightbox-product-name": makeElement(),
    "lightbox-product-price": makeElement(),
    "lightbox-product-size": makeElement(),
    "lightbox-image-description": makeElement(),
    "lightbox-request": makeElement(),
    "romantic-trinket": canonicalCard,
  };
  const documentObject = {
    getElementById(id) { return docElements[id] || null; },
    querySelectorAll(selector) { return selector === "[data-lightbox-trigger]" ? [heroTrigger] : []; },
  };
  vm.runInNewContext(`(function () { ${aiPhotoHelpers}${script.slice(start, end)} })();`, { document: documentObject, window: {} });
  heroTrigger.listeners.click({ defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault() {} });
  assert.equal(imageTarget.src, "assets/romantic-heart-trinket-tray.webp");
  assert.equal(docElements["lightbox-product-name"].textContent, "Tiny tray, big feelings");
  assert.equal(docElements["lightbox-product-price"].textContent, "From: ₹349");
  assert.equal(docElements["lightbox-product-size"].textContent, "Size: 4 in");
  assert.match(docElements["lightbox-image-description"].textContent, /A soft place for rings/);
  lightbox.close();
  assert.equal(heroTrigger.focused, true);
});

test("lightbox owns one history entry and consumes it on browser back or native close", () => {
  const start = script.indexOf("    var lightbox = document.getElementById(\"art-lightbox\")");
  const end = script.indexOf("\n\n    initCatalogueExperience();", start);
  assert.ok(start >= 0 && end > start);
  let activeElement;
  const makeElement = (extra = {}) => Object.assign({
    hidden: false,
    attributes: {},
    listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    getAttribute(name) { return this.attributes[name] || ""; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    focus(options) { this.focused = true; this.focusOptions = options; activeElement = this; },
  }, extra);
  const history = {
    state: { catalogue: true },
    pushes: [],
    backs: 0,
    forwards: 0,
    pendingBack: [],
    pendingForward: null,
    pushState(state, _title, url) { this.state = state; this.pushes.push({ state, url }); },
    back() {
      this.backs += 1;
      this.pendingBack.push({ state: { catalogue: true } });
    },
    flushBack() {
      assert.ok(this.pendingBack.length > 0);
      this.state = this.pendingBack.shift().state;
      if (windowObject.listeners.popstate) windowObject.listeners.popstate({ state: this.state, stopImmediatePropagation() {} });
      activeElement = documentObject.body;
    },
    forward() {
      this.forwards += 1;
      this.pendingForward = { state: { saloniLightbox: true } };
    },
    flushForward() {
      this.state = this.pendingForward.state;
      this.pendingForward = null;
      if (windowObject.listeners.popstate) windowObject.listeners.popstate({ state: this.state, stopImmediatePropagation() {} });
    },
  };
  const image = makeElement({ alt: "Sample gift photo" });
  const title = { textContent: "Sample gift" };
  const order = makeElement({ scrolls: 0, scrollIntoView(options) { this.scrolls += 1; this.scrollOptions = options; } });
  const requestButton = makeElement({ clicked: 0, click() { this.clicked += 1; } });
  const card = makeElement({ querySelector(selector) {
    if (selector === "figcaption strong") return title;
    if (selector === "[data-order-prefill]") return requestButton;
    return null;
  } });
  const grid = makeElement();
  const trigger = makeElement({
    href: "assets/sample-gift.jpg",
    querySelector(selector) { return selector === "img" ? image : null; },
    closest(selector) {
      if (selector === "article") return card;
      if (selector === ".catalogue-grid") return grid;
      return null;
    },
  });
  grid.querySelectorAll = () => [trigger];
  const lightbox = makeElement({
    showModal() { this.open = true; },
    close() { this.open = false; this.listeners.close(); },
  });
  const docElements = {
    "art-lightbox": lightbox,
    "lightbox-image": makeElement(),
    "lightbox-caption": makeElement(),
    "lightbox-product-name": makeElement(),
    "lightbox-product-price": makeElement(),
    "lightbox-product-size": makeElement(),
    "lightbox-image-description": makeElement(),
    "lightbox-request": makeElement(),
    order,
  };
  const windowObject = {
    history,
    location: { href: "https://example.test/?type=couple#catalogue-filters" },
    listeners: {},
    timers: [],
    addEventListener(type, listener) { this.listeners[type] = listener; },
    setTimeout(callback) { this.timers.push(callback); },
    flushTimers() { while (this.timers.length) this.timers.shift()(); },
  };
  const documentObject = {
    body: makeElement(),
    get activeElement() { return activeElement; },
    getElementById(id) { return docElements[id] || null; },
    querySelectorAll(selector) { return selector === "[data-lightbox-trigger]" ? [trigger] : []; },
  };
  activeElement = documentObject.body;
  vm.runInNewContext(`(function () { ${aiPhotoHelpers}${script.slice(start, end)} })();`, { document: documentObject, window: windowObject });

  const click = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault() {} };
  trigger.listeners.click(click);
  assert.equal(lightbox.open, true);
  assert.equal(history.pushes.length, 1);
  assert.equal(history.pushes[0].state.saloniLightbox, true);
  trigger.listeners.click(click);
  assert.equal(history.pushes.length, 1);

  history.state = { catalogue: true };
  windowObject.listeners.popstate({ state: history.state, stopImmediatePropagation() {} });
  assert.equal(lightbox.open, false);
  assert.equal(trigger.focused, true);
  assert.equal(history.backs, 0);

  trigger.listeners.click(click);
  assert.equal(history.pushes.length, 2);
  lightbox.close();
  assert.equal(history.backs, 1);
  assert.equal(history.pendingBack.length, 1);
  trigger.listeners.click(click);
  assert.equal(history.pushes.length, 2);
  history.flushBack();
  assert.equal(lightbox.open, true);
  assert.equal(history.pushes.length, 3);
  assert.equal(history.state.saloniLightbox, true);
  lightbox.close();
  assert.equal(history.backs, 2);
  history.flushBack();
  assert.equal(lightbox.open, false);
  assert.equal(history.state.saloniLightbox, undefined);
  trigger.focused = false;
  trigger.listeners.click(click);
  lightbox.close();
  assert.equal(history.backs, 3);
  history.flushBack();
  assert.equal(documentObject.activeElement, documentObject.body);
  assert.equal(trigger.focused, false);
  windowObject.flushTimers();
  assert.equal(documentObject.activeElement, trigger);
  assert.equal(trigger.focusOptions.preventScroll, true);

  trigger.focused = false;
  trigger.listeners.click(click);
  lightbox.close();
  trigger.listeners.click(click);
  assert.equal(lightbox.open, true);
  activeElement = documentObject.body;
  windowObject.flushTimers();
  assert.equal(documentObject.activeElement, documentObject.body);
  assert.equal(trigger.focused, false);
  lightbox.close();
  history.flushBack();
  windowObject.flushTimers();
  assert.equal(documentObject.activeElement, trigger);

  trigger.focused = false;
  trigger.listeners.click(click);
  lightbox.close();
  trigger.listeners.click(click);
  docElements["lightbox-request"].listeners.click();
  assert.equal(requestButton.clicked, 1);
  history.flushBack();
  trigger.listeners.click(click);
  activeElement = documentObject.body;
  windowObject.flushTimers();
  assert.equal(lightbox.open, true);
  assert.equal(order.scrolls, 0);
  assert.equal(documentObject.activeElement, documentObject.body);
  lightbox.close();
  history.flushBack();
  windowObject.flushTimers();
  assert.equal(documentObject.activeElement, trigger);

  trigger.focused = false;
  trigger.listeners.click(click);
  lightbox.close();
  trigger.listeners.click(click);
  docElements["lightbox-request"].listeners.click();
  assert.equal(requestButton.clicked, 2);
  assert.equal(history.backs, 7);
  history.flushBack();
  windowObject.flushTimers();
  assert.equal(order.scrolls, 1);
  assert.equal(order.scrollOptions.behavior, "auto");
  assert.equal(order.scrollOptions.block, "start");
  assert.equal(documentObject.activeElement, order);
  history.forward();
  history.flushForward();
  assert.equal(history.pendingBack.length, 1);
  history.flushBack();
  windowObject.flushTimers();
  assert.equal(trigger.focused, false);
  assert.equal(history.forwards, 1);
  assert.equal(history.state.saloniLightbox, undefined);
  let normalBackStopped = false;
  windowObject.listeners.popstate({ state: history.state, stopImmediatePropagation() { normalBackStopped = true; } });
  assert.equal(normalBackStopped, false);
});

test("hero lightbox request consumes history and restores the visible opener after order close", () => {
  const start = script.indexOf("    var lightbox = document.getElementById(\"art-lightbox\")");
  const end = script.indexOf("\n\n    initCatalogueExperience();", start);
  const makeElement = (extra = {}) => Object.assign({
    hidden: false,
    attributes: {},
    listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    getAttribute(name) { return this.attributes[name] || ""; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
  }, extra);
  const history = {
    state: { catalogue: true },
    backs: 0,
    pendingBack: [],
    pushState(state) { this.state = state; },
    back() { this.backs += 1; this.pendingBack.push({ state: { catalogue: true } }); },
    flushBack() {
      this.state = this.pendingBack.shift().state;
      windowObject.listeners.popstate({ state: this.state, stopImmediatePropagation() {} });
    },
  };
  const orderDialog = makeElement({ open: false });
  const requestButton = makeElement({ clicked: 0, opener: null, click() {
    this.clicked += 1;
    this.opener = this.__saloniOrderDialogOpener;
    orderDialog.opener = this.opener;
    orderDialog.open = true;
    history.pushState({ saloniOrderDialog: true });
  } });
  const canonicalCard = makeElement({ querySelector(selector) {
    if (selector === "figcaption strong") return { textContent: "Sample gift" };
    if (selector === "[data-order-prefill]") return requestButton;
    if (selector === "[data-lightbox-trigger]") return canonicalTrigger;
    return null;
  } });
  const canonicalTrigger = makeElement({
    href: "assets/sample-gift.jpg",
    querySelector(selector) { return selector === "img" ? { alt: "Sample gift photo" } : null; },
    closest(selector) { return selector === "article" ? canonicalCard : null; },
  });
  const heroTrigger = makeElement({
    attributes: { "data-lightbox-target": "canonical-gift" },
    focused: false,
    focus(options) { this.focused = true; this.focusOptions = options; },
    querySelector(selector) { return selector === "img" ? { alt: "Sample gift photo" } : null; },
    closest() { return null; },
  });
  const lightbox = makeElement({ showModal() { this.open = true; }, close() { this.open = false; this.listeners.close(); } });
  const docElements = {
    "art-lightbox": lightbox,
    "lightbox-image": makeElement(),
    "lightbox-caption": makeElement(),
    "lightbox-product-name": makeElement(),
    "lightbox-product-price": makeElement(),
    "lightbox-product-size": makeElement(),
    "lightbox-image-description": makeElement(),
    "lightbox-request": makeElement(),
    "order-dialog": orderDialog,
    "canonical-gift": canonicalCard,
  };
  const windowObject = {
    history,
    location: { href: "https://example.test/" },
    listeners: {},
    timers: [],
    addEventListener(type, listener) { this.listeners[type] = listener; },
    setTimeout(callback) { this.timers.push(callback); },
    flushTimers() { while (this.timers.length) this.timers.shift()(); },
  };
  const documentObject = {
    getElementById(id) { return docElements[id] || null; },
    querySelectorAll(selector) { return selector === "[data-lightbox-trigger]" ? [heroTrigger] : []; },
  };
  vm.runInNewContext(`(function () { ${aiPhotoHelpers}${script.slice(start, end)} })();`, { document: documentObject, window: windowObject });
  const click = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault() {} };
  heroTrigger.listeners.click(click);
  docElements["lightbox-request"].listeners.click();
  assert.equal(lightbox.open, false);
  assert.equal(orderDialog.open, false);
  assert.equal(history.backs, 1);
  history.flushBack();
  windowObject.flushTimers();
  assert.equal(requestButton.clicked, 1);
  assert.equal(requestButton.opener, heroTrigger);
  assert.equal(orderDialog.open, true);
  assert.equal(history.state.saloniOrderDialog, true);
  assert.equal(history.backs, 1);
  orderDialog.close = function () {
    this.open = false;
    if (this.opener && this.opener.focus) this.opener.focus({ preventScroll: true });
  };
  orderDialog.close();
  assert.equal(heroTrigger.focused, true);
  assert.deepEqual(heroTrigger.focusOptions, { preventScroll: true });
});

test("privacy details keep the full retention and correction wording below both forms", () => {
  const order = html.match(/<section[^>]+class="order-section shell"[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(order, /class="order-privacy-note"[^>]*>Your information is used only to handle your request\./);
  assert.match(order, /<details[^>]+id="privacy-details"[\s\S]*?90 days[\s\S]*?correction or deletion/);
  const form = fs.readFileSync(path.join(root, "apps-script", "Form.html"), "utf8");
  assert.match(form, /<details[^>]+id="privacy-details"[\s\S]*?90 days[\s\S]*?correction or deletion/);
});

test("order section keeps compact row and bottom spacing without changing its column gap", () => {
  const orderRule = css.match(/(?:^|\n)\.order-section\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(orderRule, /column-gap:\s*clamp\(2rem,\s*8vw,\s*8rem\)/);
  assert.match(orderRule, /row-gap:\s*2rem/);
  assert.match(orderRule, /padding-block:\s*clamp\(1\.25rem,\s*3\.5vw,\s*3rem\)\s+clamp\(2rem,\s*5vw,\s*4rem\)/);
  assert.doesNotMatch(orderRule, /(?:^|[; ])gap:\s*clamp/);
  const pricingNoteRule = css.match(/\.order-size-pricing-note\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(pricingNoteRule, /margin:\s*0/);
  const mobileOrderRule = css.match(/@media \(max-width: 620px\) \{[\s\S]*?\.order-section\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(mobileOrderRule, /padding-block:\s*1\.2rem 3rem/);
});

test("sticky header offset and contained lightbox request remain reachable", () => {
  assert.match(css, /scroll-padding-top:\s*var\(--sticky-offset\)/);
  assert.match(css, /scroll-margin-top:\s*var\(--sticky-offset\)/);
  assert.match(css, /\.lightbox-panel[\s\S]*overflow:\s*auto/);
  assert.match(css, /\.lightbox-image\s*\{[^}]*background:\s*var\(--ivory\)/);
  assert.match(css, /\.lightbox-request\s*\{[^}]*width:\s*100%/);
});

test("before-you-order buying-help section is removed from the homepage", () => {
  assert.doesNotMatch(html, /<section[^>]+id="testimonials"[\s\S]*?<\/section>/);
  assert.doesNotMatch(html, /Before you order|Know what your gift will include\.|Ask Saloni about a gift/);
});

test("all 97 catalogue cards keep price first and show only known size rows", () => {
  const expectedRows = [
    ["Size", "8 in"],
    ["Size", "8 × 12 in"],
    ["Size", "10 × 12 in"],
    ["Size", "4 in"],
    ["Size", "8 × 10 in"],
    ["Size", "10 in"],
    ["Size", "7 in"],
    ["Size", "12 in"],
    ["Size", "1 in"],
    ["Size", "6 in"],
    ["Size", "1.5–2 in"],
    ["Size", "5–6 in"],
    ["Size", "3 in"],
    null,
    ["Size", "4 in"],
    null,
    null,
    null,
    ["Size", "8–10 in"],
    ["Size", "16–18 in"],
    null,
    ["Size", "1.5–2 in"],
    ["Size", "5–6 in"],
    ["Size", "4 in"],
    ["Size", "6 in"],
    ["Size", "3 in"],
    ["Size", "2 in"],
    null,
    null,
    ["Size", "6–8 in"],
    null,
    null,
    null,
    ["Size", "4 in"],
    null,
    null,
    null,
    null,
    null,
    null,
    ["Size", "20×22 in"],
    null,
    null,
    ["Size", "20×22 in"],
    null,
    null,
    ["Size", "8–10 in"],
    null,
    ["Size", "20×22 in"],
    null,
    ["Size", "3 in"],
    null,
    ["Size", "3 in"],
    ["Size", "20×22 in"],
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    ["Size", "4 in"],
    ["Size", "4–6 in"],
    ["Size", "4–6 in"],
    ["Size", "6 in"],
    ["Size", "6 in"],
    ["Size", "4 in"],
    ["Size", "4 in"],
    ["Size", "6–8 in"],
    ["Size", "4–5 in"],
    ["Size", "4–5 in"],
    ["Size", "4 in"],
    ["Size", "6 in"],
    ["Size", "4 in — component size to confirm"],
    ["Size", "3 in"],
    ["Size", "3 in"],
    ["Size", "6 in"],
    ["Size", "2–3 in"],
    ["Size", "3–4 in"],
    ["Size", "3–4 in"],
    ["Size", "4–5 in"],
    ["Size", "2 in"],
    ["Size", "3–4 in"],
    ["Size", "3–4 in"],
  ];
  const cards = html.match(/<article\b[^>]*class="[^"]*(?:work-card|romantic-keepsake-card)[^"]*"[\s\S]*?<\/article>/g) || [];
  assert.equal(cards.length, 97);
  assert.equal(expectedRows.length, 97);
  cards.forEach((card, index) => {
    const pricing = card.match(/<dl class="product-pricing"[\s\S]*?<\/dl>/)?.[0] || "";
    const rows = [...pricing.matchAll(/<div><dt>([^<]+)<\/dt><dd>([^<]+)<\/dd>(?:<dd class="product-regular-price">.*?<\/dd>)?<\/div>/g)].map((match) => match.slice(1));
    assert.equal(pricing.match(/aria-label="([^"]+)"/)?.[1], "Catalogue price and size");
    assert.ok(rows.length === 1 || rows.length === 2, `card ${index + 1} has price and optional size rows`);
    assert.match(rows[0][0], /^(?:Price|From)$/);
    assert.match(rows[0][1], /^(?:₹|Starting at ₹|Price on request)/);
    if (expectedRows[index]) {
      assert.equal(rows.length, 2, `card ${index + 1} has its known size row`);
      assert.deepEqual(rows[1], expectedRows[index], `card ${index + 1} size row`);
      assert.match(rows[1][1], /\d.*in/);
    } else {
      assert.equal(rows.length, 1, `card ${index + 1} omits an unknown size row`);
    }
    assert.doesNotMatch(pricing, /<dt>Suggested size<\/dt>|confirm with Saloni|Custom size in inches/);
  });
  assert.match(css, /product-pricing[^}]*div:first-child dd/);
  assert.match(css, /product-pricing[^}]*div:not\(:first-child\) dd/);
});

test("order section omits the removed size-pricing note", () => {
  const order = section("order");
  assert.doesNotMatch(order, /order-size-pricing-note/);
  assert.doesNotMatch(order, /Where a size is listed|Prices may change with size/);
});

test("uses known size wording and omits unknown catalogue sizes", () => {
  const cardFor = (title) => {
    const marker = `<strong>${title}</strong>`;
    const titleIndex = html.indexOf(marker);
    if (titleIndex < 0) return "";
    const start = html.lastIndexOf("<article", titleIndex);
    const end = html.indexOf("</article>", titleIndex);
    return start < 0 || end < 0 ? "" : html.slice(start, end + "</article>".length);
  };
  const rowsFor = (title) => [...(cardFor(title).match(/<div><dt>([^<]+)<\/dt><dd>([^<]+)<\/dd>(?:<dd class="product-regular-price">.*?<\/dd>)?<\/div>/g) || [])].map((row) => row.match(/<dt>([^<]+)<\/dt><dd>([^<]+)<\/dd>/).slice(1));
  assert.deepEqual(rowsFor("Shubh Labh Welcome Pair").slice(1), [["Size", "4–6 in"]]);
  assert.equal(cardFor("Festive Welcome Hamper"), "");
  assert.deepEqual(rowsFor("Ivory Mandala Holder").slice(1), [["Size", "3 in"]]);
  assert.deepEqual(rowsFor("Pearl Rangoli Accent").slice(1), [["Size", "3–4 in"]]);
  assert.deepEqual(rowsFor("Rose Petal Offering Plate").slice(1), [["Size", "4–5 in"]]);
});

test("studio edit section is removed before the order conversation", () => {
  assert.doesNotMatch(html, /<section[^>]+id="offerings"[\s\S]*?<\/section>/);
  assert.doesNotMatch(html, /The studio edit|A little more personal than a gift|Custom resin frames &amp; art|Explore resin photo frames|Join the Partner Circle/);
  assert.match(html, /<section class="order-section shell" id="order"/);
});

test("WhatsApp order buttons use WhatsApp green and show the WhatsApp logo", () => {
  ["catalogue-selection-whatsapp", "catalogue-cart-whatsapp"].forEach((id) => {
    const link = html.match(new RegExp(`<a[^>]+id="${id}"[\\s\\S]*?<\\/a>`));
    assert.ok(link, `expected #${id}`);
    assert.match(link[0], /class="[^"]*\bbutton-whatsapp\b/);
    assert.match(link[0], /<svg[^>]+class="whatsapp-icon"[^>]+aria-hidden="true"/);
    assert.match(link[0].replace(/<[^>]+>/g, ""), /Order on WhatsApp/);
  });
  assert.match(css, /\.button-whatsapp\s*\{[^}]*background:\s*#25d366/i);
  assert.match(html, /id="catalogue-cart-whatsapp"[^>]+aria-label="Order on WhatsApp"/);
  assert.doesNotMatch(css, /\.catalogue-cart-whatsapp\s*\{[^}]*background:\s*var\(--ivory\)/);
});

test("mobile cart bar keeps View cart, Order now and WhatsApp on one line with the count on View cart", () => {
  assert.match(script, /catalogueCartView\.setAttribute\("data-count", String\(count\)\)/);
  const mobile = css.slice(css.indexOf("@media (max-width: 620px)"));
  assert.match(mobile, /\.catalogue-cart-jump\s*\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(mobile, /\.catalogue-cart-count\s*\{[^}]*clip:\s*rect\(0, 0, 0, 0\)/);
  assert.match(mobile, /\.catalogue-cart-view\[data-count\]::after\s*\{[^}]*content:\s*attr\(data-count\)/);
  assert.doesNotMatch(mobile, /\.catalogue-cart-jump\s*\{[^}]*flex-wrap:\s*wrap/);
});

test("What happens next and Start a conversation are dropdowns that start closed on phones and open on wider screens", () => {
  assert.match(html, /<details class="customer-confidence-strip" id="customer-confidence" open>\s*<summary><h2 id="customer-confidence-title">What happens next<\/h2><\/summary>/);
  assert.match(css, /\.customer-confidence-strip > summary\s*\{[^}]*list-style:\s*none/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.customer-confidence-strip > summary\s*\{[^}]*pointer-events:\s*auto/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.customer-confidence-strip > summary::after/);
  assert.match(html, /<details class="order-copy reveal" id="order-conversation" open><summary><span class="eyebrow">Start a conversation<\/span><h2 id="order-title">Tell us the moment\. We’ll talk through the piece\.<\/h2><\/summary>/);
  const conversation = html.match(/<details class="order-copy[\s\S]*?<\/details><\/div><\/details>/)?.[0] || "";
  assert.match(conversation, /How do I order\?/);
  assert.doesNotMatch(conversation, /Prefer to talk first\?/, "the contact buttons stay outside the dropdown");
  assert.match(css, /\n\.order-copy > summary, \.customer-confidence-strip > summary\s*\{[^}]*pointer-events:\s*none/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.order-copy > summary, \.customer-confidence-strip > summary\s*\{[^}]*pointer-events:\s*auto/);
  const start = script.indexOf("  function initPhoneDropdowns()");
  assert.ok(start > 0, "expected initPhoneDropdowns");
  const source = script.slice(start, script.indexOf("\n  }\n", start) + 4);
  const run = (phone) => {
    const listeners = [];
    const details = { "customer-confidence": { open: true }, "order-conversation": { open: true } };
    const query = { matches: phone, addEventListener(type, listener) { listeners.push(listener); } };
    const context = {
      document: { getElementById: (id) => details[id] || null },
      window: { matchMedia: (media) => { assert.equal(media, "(max-width: 620px)"); return query; } },
    };
    vm.createContext(context);
    vm.runInContext(`${source}\ninitPhoneDropdowns();`, context);
    return { details, query, listeners };
  };
  const openStates = (result) => Object.values(result.details).map((details) => details.open);
  assert.deepEqual(openStates(run(true)), [false, false]);
  const wide = run(false);
  assert.deepEqual(openStates(wide), [true, true]);
  wide.query.matches = true;
  wide.listeners.forEach((listener) => listener());
  assert.deepEqual(openStates(wide), [false, false]);
});

test("phone header uses a smaller wordmark and 38px icon buttons placed after the base button rules", () => {
  const blocks = Array.from(css.matchAll(/@media \(max-width: 620px\) \{([\s\S]*?)\n\}/g), (match) => ({ body: match[1], index: match.index }));
  const phone = blocks.find((block) => /\.catalogue-header-tools \.catalogue-control-toggle, \.nav-toggle\s*\{/.test(block.body));
  assert.ok(phone, "expected the phone header rules in a 620px block");
  assert.ok(phone.index > css.indexOf(".catalogue-header-tools .catalogue-control-toggle {"), "phone rules must come after the base button rule");
  const buttons = phone.body.match(/\.catalogue-header-tools \.catalogue-control-toggle, \.nav-toggle\s*\{([^}]*)\}/)[1];
  ["width", "min-width", "height", "min-height"].forEach((property) => assert.match(buttons, new RegExp(`(?:^|;|\\s)${property}:\\s*38px`)));
  assert.match(phone.body, /\.site-header \.catalogue-control-icon\s*\{[^}]*width:\s*1rem[^}]*height:\s*1rem/);
  assert.match(phone.body, /\.site-header \.wordmark-name\s*\{[^}]*font-size:\s*1\.2rem/);
  assert.match(phone.body, /\.site-header \.wordmark-subtitle\s*\{[^}]*font-size:\s*0?\.6rem/);
});

test("the page background is a very pale blush token used for the body and the current tab", () => {
  assert.match(css, /:root\s*\{[^}]*--page:\s*#ffeaf2/);
  const link = css.match(/\.hero-banner-custom a\s*\{([^}]*)\}/)[1].match(/color:\s*(#[0-9a-f]{6})/i);
  assert.ok(link, "the custom-frame link on the page sets its own readable teal");
  ["#6a4a5b", "#b0125b", link[1]].forEach((colour) => assert.ok(contrast(colour, "#ffeaf2") >= 4.5, colour + " on the page"));
  assert.match(css, /\nbody\s*\{[^}]*background:\s*var\(--page\)/);
});

test("on 8 and 9 November the Diwali hero slide moves first and shows the offer", () => {
  const diwaliSlide = bannerSlideHtml()[4];
  assert.match(diwaliSlide, /id="hero-diwali-slide"/);
  const offer = diwaliSlide.match(/<p class="hero-slide-offer" hidden>([\s\S]*?)<\/p>/);
  assert.ok(offer, "the offer label starts hidden");
  assert.match(offer[1], /Buy 2, get 1 free/);
  assert.match(offer[1], /free shipping/);
  assert.doesNotMatch(css.match(/\.hero-slide-offer\s*\{[^}]*\}/)[0], /display:/, "keeps the hidden attribute working");
  assert.ok(script.indexOf("    initDiwaliGreeting();") < script.indexOf("    initHeroBanner();"), "slides are in order before the carousel reads them");
  const start = script.indexOf("  function initDiwaliGreeting(");
  const source = script.slice(start, script.indexOf("\n  }\n", start) + 4);
  const run = (iso) => {
    const label = (text) => ({ text, getAttribute() { return this.text; }, setAttribute(_name, value) { this.text = value; } });
    const slides = [label("1 of 5: Premium"), label("2 of 5: Couple"), label("3 of 5: Marriage"), label("4 of 5: Corporate"), label("5 of 5: Diwali")];
    const offerLabel = { hidden: true };
    const slide = slides[4];
    const leadImage = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
    slide.querySelector = (sel) => (sel === ".hero-slide-offer" ? offerLabel : sel === "img" ? leadImage : null);
    const track = {
      scrollLeft: 360,
      get firstChild() { return slides[0]; },
      insertBefore(node, before) { slides.splice(slides.indexOf(node), 1); slides.splice(slides.indexOf(before), 0, node); },
      querySelectorAll: (sel) => (sel === ".hero-slide" ? slides.slice() : []),
    };
    slide.parentNode = track;
    const context = {
      window: { localStorage: { getItem: () => "1", setItem() {} } },
      document: { getElementById: (id) => (id === "hero-diwali-slide" ? slide : null), querySelector: () => null },
      Date,
    };
    vm.createContext(context);
    vm.runInContext(`${source}\ninitDiwaliGreeting(${Date.parse(iso)});`, context);
    return { labels: slides.map((item) => item.text), offerLabel, track, leadImage };
  };
  const during = run("2026-11-08T09:00:00Z");
  assert.deepEqual(during.labels, ["1 of 5: Diwali", "2 of 5: Premium", "3 of 5: Couple", "4 of 5: Marriage", "5 of 5: Corporate"]);
  assert.equal(during.offerLabel.hidden, false);
  assert.equal(during.track.scrollLeft, 0, "the carousel starts on the Diwali slide");
  assert.deepEqual(during.leadImage.attributes, { loading: "eager", fetchpriority: "high" }, "the first photo shoppers see loads first, not lazily");
  const after = run("2026-11-09T18:31:00Z");
  assert.deepEqual(after.labels, ["1 of 5: Premium", "2 of 5: Couple", "3 of 5: Marriage", "4 of 5: Corporate", "5 of 5: Diwali"], "back to normal from 10 Nov");
  assert.equal(after.offerLabel.hidden, true);
  assert.deepEqual(after.leadImage.attributes, {}, "outside the offer the Diwali slide stays lazy");
});

test("the Diwali wish and offer replace the Dhanteras pop-up and show only on 8 and 9 November 2026 (India time)", () => {
  assert.doesNotMatch(html + css + script, /dhanteras/i, "the Dhanteras pop-up is gone");
  const markup = html.match(/<dialog class="diwali-greeting" id="diwali-greeting" aria-labelledby="diwali-greeting-title">[\s\S]*?<\/dialog>/)?.[0] || "";
  assert.ok(markup, "the wish is a closed dialog, so it never shows without the date check");
  assert.match(markup, /<form method="dialog"[^>]*>\s*<button class="lightbox-close" type="submit" aria-label="Close Diwali wish">/);
  assert.match(markup, /<h2 id="diwali-greeting-title">[\s\S]*शुभ दीपावली[\s\S]*Happy Diwali[\s\S]*<\/h2>/);
  assert.match(markup, /Buy 2, get 1 free/);
  assert.match(markup, /free shipping/);
  assert.match(markup, /8 and 9 November only/);
  assert.match(markup, /lowest-priced gift is free/);
  assert.match(markup, /<a class="button button-dark" href="#diwali" data-category-shortcut="diwali">Shop Diwali gifts<\/a>/);
  const bar = html.match(/<p class="diwali-offer-bar" id="diwali-offer-bar" hidden>[\s\S]*?<\/p>/)?.[0] || "";
  assert.ok(bar, "the offer strip starts hidden");
  assert.match(bar, /Buy 2, get 1 free/);
  assert.match(bar, /free shipping/);
  assert.match(css, /\.diwali-greeting::before,\s*\.diwali-greeting::after\s*\{[^}]*background:\s*url\("data:image\/svg\+xml/, "the marigold garland stays");
  assert.match(css, /dialog\.diwali-greeting::backdrop\s*\{/);
  assert.doesNotMatch(css.match(/\.diwali-greeting\s*\{[^}]*\}/)[0], /position:|display:/, "keeps the dialog's own centring and hiding");
  assert.doesNotMatch(css.match(/\.diwali-offer-bar\s*\{[^}]*\}/)[0], /display:/, "keeps the hidden attribute working");
  const start = script.indexOf("  function initDiwaliGreeting(");
  assert.ok(start > 0, "expected initDiwaliGreeting");
  const source = script.slice(start, script.indexOf("\n  }\n", start) + 4);
  const run = (iso, { seen = false, otherOpen = false } = {}) => {
    const listeners = {};
    const stored = {};
    if (seen) stored["saloni-diwali-2026"] = "1";
    const offerBar = { hidden: true };
    const greeting = {
      open: false,
      showModal() { this.open = true; },
      getBoundingClientRect: () => ({ left: 20, right: 370, top: 270, bottom: 570 }),
      closest: () => null,
      close() { this.open = false; (listeners.close || []).forEach((fn) => fn()); },
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }
    };
    const context = {
      window: { localStorage: { getItem: (k) => stored[k] || null, setItem: (k, v) => { stored[k] = v; } } },
      document: {
        getElementById: (id) => (id === "diwali-greeting" ? greeting : id === "diwali-offer-bar" ? offerBar : null),
        querySelector: (sel) => (sel === "dialog[open]" && otherOpen ? {} : null)
      },
      Date
    };
    vm.createContext(context);
    vm.runInContext(`${source}\ninitDiwaliGreeting(${Date.parse(iso)});`, context);
    return { greeting, listeners, stored, offerBar };
  };
  const before = run("2026-11-07T18:29:00Z");
  assert.equal(before.greeting.open, false, "23:59 on 7 Nov in India");
  assert.equal(before.offerBar.hidden, true, "no offer before Diwali");
  const first = run("2026-11-07T18:31:00Z");
  assert.equal(first.greeting.open, true, "00:01 on 8 Nov in India");
  assert.equal(first.offerBar.hidden, false, "the offer strip shows on Diwali");
  assert.equal(run("2026-11-09T18:29:00Z").greeting.open, true, "23:59 on 9 Nov in India");
  const after = run("2026-11-09T18:31:00Z");
  assert.equal(after.greeting.open, false, "00:01 on 10 Nov in India");
  assert.equal(after.offerBar.hidden, true, "the offer ends after 9 Nov");
  const seen = run("2026-11-08T09:00:00Z", { seen: true });
  assert.equal(seen.greeting.open, false, "does not come back once seen");
  assert.equal(seen.offerBar.hidden, false, "the offer strip stays for returning visitors");
  assert.equal(run("2026-11-08T09:00:00Z", { otherOpen: true }).greeting.open, false, "never covers a photo or order window that is already open");
  const shown = run("2026-11-08T09:00:00Z");
  assert.equal(shown.stored["saloni-diwali-2026"], "1", "remembered as soon as it is shown");
  const shopLink = { closest: (sel) => (sel === "[data-category-shortcut]" ? shopLink : null) };
  shown.listeners.click.forEach((fn) => fn({ target: shopLink }));
  assert.equal(shown.greeting.open, false, "Shop Diwali gifts closes the pop-up");
  const again = run("2026-11-08T09:00:00Z");
  again.listeners.click.forEach((fn) => fn({ target: again.greeting, clientX: 200, clientY: 300 }));
  assert.equal(again.greeting.open, true, "a tap on blank space inside the card keeps it open");
  again.listeners.click.forEach((fn) => fn({ target: again.greeting, clientX: 200, clientY: 700 }));
  assert.equal(again.greeting.open, false, "a tap outside the card closes it");
});
