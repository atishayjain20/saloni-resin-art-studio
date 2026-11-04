const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

// Returns the body of the LAST top-level `@media (min-width: 1024px) {` block.
function desktopBlock() {
  const start = css.lastIndexOf("@media (min-width: 1024px) {");
  assert.ok(start >= 0, "expected a @media (min-width: 1024px) block");
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  assert.fail("unterminated desktop media block");
}

function rule(block, selector) {
  const line = block.split("\n").find((l) => l.trim().startsWith(`${selector} {`));
  assert.ok(line, `expected a desktop rule for ${selector}`);
  return line;
}

test("desktop layout lives in the last block of the stylesheet", () => {
  const block = desktopBlock();
  assert.equal(css.trimEnd().endsWith(block), true, "the desktop block must be last in styles.css");
});

test("desktop widens the homepage shell only", () => {
  const block = desktopBlock();
  assert.match(rule(block, "body:has(#catalogue-selection)"), /--max:\s*1320px/);
});

test("desktop cart panel is constrained to the content width and keeps [hidden]", () => {
  const block = desktopBlock();
  const panel = rule(block, "#catalogue-selection");
  assert.match(panel, /width:\s*min\(calc\(100% - \(var\(--gutter\) \* 2\)\), var\(--max\)\)/);
  assert.match(panel, /margin:\s*1rem auto 0/);
  assert.doesNotMatch(panel, /display\s*:/, "must not override [hidden]");
});

test("desktop order columns align to the top", () => {
  const block = desktopBlock();
  assert.match(rule(block, "#order"), /align-items:\s*start/);
  assert.match(rule(block, "#order-inline-fallback"), /align-self:\s*start/);
});

test("desktop hero banner caps the narrow Diwali photos and never uses an #hero selector", () => {
  const block = desktopBlock();
  assert.match(block, /\.hero-slide-narrow \.hero-slide-photos\s*\{[^}]*max-width:\s*\d+rem/);
  assert.doesNotMatch(block, /\.hero(?![-\w])|#hero|hero-actions|hero-collage/);
  // the mobile hero test forbids "#hero" anywhere after the reduced-motion media query
});

test("desktop footer and cart bar spacing are scoped to the homepage", () => {
  const block = desktopBlock();
  assert.match(block, /body:has\(#catalogue-selection\) #footer \.footer-inner \{/);
  assert.match(block, /body:has\(#catalogue-cart-jump:not\(\[hidden\]\)\) #footer \{ padding-bottom: 7rem; \}/);
});
