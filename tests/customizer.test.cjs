const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const {
  safeTextRect,
  textLaneCandidates,
  wrapTextLines,
  fitTextBlock,
  nudgePhotoLayout,
  drawFittedText,
  pigmentPatchPlan,
  stoneChipPlan,
  createSharePayload,
  shareDesignFlow,
} = require("../customizer.js");

const rendererSource = fs.readFileSync(path.join(__dirname, "..", "customizer.js"), "utf8");

function measuredContext(widthFor) {
  return {
    font: "",
    measureText(value) {
      const width = widthFor(value, this.font);
      return {
        width,
        actualBoundingBoxLeft: width / 2,
        actualBoundingBoxRight: width / 2,
        actualBoundingBoxAscent: 14,
        actualBoundingBoxDescent: 5,
      };
    },
  };
}

class FakeFile {
  constructor(parts, name, options) {
    this.parts = parts;
    this.name = name;
    this.type = options.type;
  }
}

function shareFixture(overrides = {}) {
  const shareButton = { disabled: false };
  const shareStatus = { textContent: "" };
  const summaryOutput = { textContent: "old summary" };
  const calls = { canShare: [], share: [] };
  let resolveShare;
  let rejectShare;
  const pending = new Promise((resolve, reject) => {
    resolveShare = resolve;
    rejectShare = reject;
  });
  const navigatorObject = {
    canShare(payload) {
      calls.canShare.push(payload);
      return overrides.canShareResult === undefined ? true : overrides.canShareResult;
    },
    share(payload) {
      calls.share.push(payload);
      if (overrides.shareResult) return overrides.shareResult;
      return pending;
    },
  };
  const fixture = {
    state: { imageLoading: false, textOverflow: false, shareInProgress: false },
    canvas: {
      width: 1200,
      height: 1200,
      toDataURL(type) {
        assert.equal(type, "image/png");
        return "data:image/png;base64,AAEC";
      },
    },
    summaryOutput,
    shareButton,
    shareStatus,
    navigatorObject,
    FileCtor: FakeFile,
    render() {
      summaryOutput.textContent = "fresh line 1\nfresh line 2";
    },
    calls,
    resolveShare,
    rejectShare,
  };
  return Object.assign(fixture, overrides);
}

function imageFailureBrowserFixture() {
  const elements = new Map();
  let createdImage;
  class Element {
    constructor(id) {
      this.id = id;
      this.value = id === "frame-type" ? "square" : id === "border-style" ? "scalloped" : id === "frame-preset" ? "8" : id === "frame-unit" ? "in" : "0.5";
      this.checked = false;
      this.hidden = false;
      this.disabled = false;
      this.files = [];
      this.textContent = "";
      this.style = {};
      this.classList = { contains: () => false, toggle() {} };
      this.listeners = {};
    }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    dispatch(type, event = { target: this }) { this.listeners[type]?.(event); }
    querySelectorAll() { return []; }
    setAttribute() {}
    getContext() { return null; }
    reset() {}
    focus() {}
  }
  const documentObject = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element(id));
      return elements.get(id);
    },
    addEventListener(type, listener) {
      if (type === "DOMContentLoaded") listener();
    },
  };
  const context = {
    document: documentObject,
    window: { addEventListener() {} },
    URL: { createObjectURL: () => "blob:reference", revokeObjectURL() {} },
    Image: class {
      constructor() { createdImage = this; this.complete = false; }
      set src(value) { this.url = value; }
    },
    module: { exports: {} },
    console,
  };
  vm.runInNewContext(rendererSource, context, { filename: "customizer.js" });
  const referenceImage = elements.get("reference-image");
  const shareDesign = elements.get("share-design");
  const shareStatus = elements.get("share-status");
  referenceImage.files = [{ name: "reference.png", type: "image/png", size: 1024 }];
  referenceImage.dispatch("change");
  return { elements, createdImage, shareDesign, shareStatus };
}

const inner = { x: 100, y: 80, width: 600, height: 760, shape: "arch" };

test("wraps oversized tokens after an existing line and preserves explicit blank lines", () => {
  const context = measuredContext((value) => value.length * 12);
  const wrapped = wrapTextLines(context, ["Short abcdefghij", "", "tail"], 72, 24);

  assert.deepEqual(wrapped.lines, ["Short", "abcdef", "ghij", "", "tail"]);
  assert.equal(wrapped.oversized, false);
});

test("marks an indivisible grapheme wider than the lane instead of dropping it", () => {
  const context = measuredContext((value) => value.length * 20);
  const wrapped = wrapTextLines(context, ["ok", "👩‍🚀"], 10, 24);

  assert.equal(wrapped.oversized, true);
  assert.equal(wrapped.lines.at(-1), "👩‍🚀");
});

test("uses one shape-safe rectangle and keeps every candidate inside it", () => {
  const safe = safeTextRect(inner);
  assert.equal(safe.x, 196);
  assert.ok(Math.abs(safe.y - 201.6) < 1e-9);
  assert.ok(Math.abs(safe.width - 408) < 1e-9);
  assert.ok(Math.abs(safe.height - 516.8) < 1e-9);

  const photo = { x: 340, y: 240, width: 120, height: 160 };
  const lanes = textLaneCandidates(inner, photo, "centre");
  lanes.candidates.forEach(({ rect }) => {
    assert.ok(rect.x >= safe.x);
    assert.ok(rect.y >= safe.y);
    assert.ok(rect.x + rect.width <= safe.x + safe.width);
    assert.ok(rect.y + rect.height <= safe.y + safe.height);
  });
});

test("fits nine short mantra lines in the default below lane with shared draw spacing", () => {
  const safe = safeTextRect({ x: 0, y: 0, width: 603, height: 603, shape: "square" });
  const photo = { x: 241.2, y: 96.48, width: 120.6, height: 120.6 };
  const lanes = textLaneCandidates({ x: 0, y: 0, width: 603, height: 603, shape: "square" }, photo, "centre");
  const context = measuredContext((value) => value.length * 7);
  const lines = ["णमो अरिहंताणं", "णमो सिद्धाणं", "णमो आयरियाणं", "णमो उवज्झायाणं", "णमो लोए सव्वसाहूणं", "एसो पंच णमोक्कारो", "सव्वपावप्पणासणो", "मंगला णं च सव्वेसिं", "पढमं हवइ मंगलं"];
  const fit = fitTextBlock(context, lines, lanes.candidates, { preferredKinds: lanes.preferredKinds, safeRect: safe });

  assert.equal(fit.overflow, false);
  assert.notEqual(fit.candidate.kind, "safe");
  assert.equal(fit.backingVeil, false);
  assert.equal(fit.lineHeight, fit.fontSize * 1.3);
  assert.ok(fit.bounds.x >= safe.x);
  assert.ok(fit.bounds.y >= safe.y);
  assert.ok(fit.bounds.x + fit.bounds.width <= safe.x + safe.width);
  assert.ok(fit.bounds.y + fit.bounds.height <= safe.y + safe.height);
});

test("keyboard nudge returns a visibly different normalized photo position", () => {
  const start = { x: 0.5, y: 0.26, position: "centre", custom: false };
  const moved = nudgePhotoLayout(start, "ArrowLeft", false);

  assert.equal(moved.position, "custom");
  assert.equal(moved.custom, true);
  assert.equal(moved.x, 0.48);
  assert.equal(moved.y, 0.26);
});

test("keeps short text downloadable in the explicit safe fallback", () => {
  const inner = { x: 0, y: 0, width: 603, height: 603, shape: "square" };
  const photo = { x: 0, y: 0, width: 603, height: 603 };
  const safe = safeTextRect(inner);
  const lanes = textLaneCandidates(inner, photo, "centre");
  const context = measuredContext((value) => value.length * 7);
  const fit = fitTextBlock(context, ["Hello"], lanes.candidates, { preferredKinds: lanes.preferredKinds, safeRect: safe });

  assert.equal(fit.candidate.kind, "safe");
  assert.equal(fit.backingVeil, true);
  assert.equal(fit.fits, true);
  assert.equal(fit.overflow, false);
});

test("draws fallback text with a thin ivory outline before the dark fill", () => {
  const calls = [];
  const context = {
    font: "",
    textAlign: "",
    textBaseline: "",
    strokeText(value, x, y) { calls.push(["stroke", value, x, y]); },
    fillText(value, x, y) { calls.push(["fill", value, x, y]); },
  };
  const fit = { lines: ["Hello", "world"], fontSize: 22, firstBaseline: 120, lineHeight: 28.6 };

  drawFittedText(context, fit, 300, true);

  assert.deepEqual(calls.map(([kind]) => kind), ["stroke", "stroke", "fill", "fill"]);
  assert.equal(calls[0][1], calls[2][1]);
  assert.equal(calls[1][3], calls[3][3]);
});

test("keeps cloudy pigment patches and embedded chip plan deterministic", () => {
  const patches = pigmentPatchPlan();
  const chips = stoneChipPlan();
  const roundChips = stoneChipPlan("round");
  const archChips = stoneChipPlan("arch");

  assert.deepEqual(patches, pigmentPatchPlan());
  assert.equal(patches.length, 7);
  assert.ok(new Set(patches.map((patch) => patch.width * patch.height)).size >= 5);
  assert.ok(chips.length >= 120);
  assert.deepEqual(chips, stoneChipPlan());
  assert.ok(chips.every((chip) => chip.radius >= 6 && chip.radius <= 14 && chip.alpha > 0 && chip.alpha < 1));
  const perimeter = chips.filter((chip) => Math.min(chip.x, chip.y, 1 - chip.x, 1 - chip.y) <= 0.12);
  assert.ok(perimeter.length >= 120);
  assert.ok(perimeter.some((chip) => chip.y < 0.1));
  assert.ok(perimeter.some((chip) => chip.x > 0.9));
  assert.ok(perimeter.some((chip) => chip.y > 0.9));
  assert.ok(perimeter.some((chip) => chip.x < 0.1));
  assert.ok(new Set(chips.map((chip) => chip.radius)).size >= 4);
  assert.ok(new Set(chips.map((chip) => chip.rotation)).size >= 6);
  assert.deepEqual(roundChips, stoneChipPlan("round"));
  assert.deepEqual(archChips, stoneChipPlan("arch"));
  assert.ok(roundChips.every((chip) => Math.hypot(chip.x - 0.5, chip.y - 0.5) <= 0.501));
  assert.ok(archChips.every((chip) => chip.y >= 0.49 || Math.hypot(chip.x - 0.5, chip.y - 0.5) <= 0.501));
});

test("removes the old waves, isolated hotspots, panel, and chip outlines", () => {
  assert.doesNotMatch(rendererSource, /MARBLE_LINES/);
  assert.doesNotMatch(rendererSource, /resinHotspotPlan|glossHotspot/);
  assert.doesNotMatch(rendererSource, /roundedRectPath\(context, quietZone/);
  assert.doesNotMatch(rendererSource, /context\.strokeStyle = "rgba\(255, 255, 255, 0\.7\)"/);
  assert.match(rendererSource, /context\.strokeText\(/);
});

test("uses cloudy border material with narrow rim highlights", () => {
  const thickness = rendererSource.match(/function drawFrameThickness[\s\S]*?function drawCropCover/)[0];
  assert.match(thickness, /drawMarbling\(context, wall, state\.colors\.border, state\.colors\.border/);
  assert.match(thickness, /context\.lineWidth = 8/);
  assert.match(rendererSource, /context\.lineWidth = 9/);
});

test("uses Text wording in the generated customizer summary", () => {
  assert.match(rendererSource, /"Text: " \+ \(messageValue\(\) \|\| "None"\)/);
  assert.doesNotMatch(rendererSource, /Message or mantra/);
});

test("builds a native PNG File with the exact multiline summary payload", () => {
  const payload = createSharePayload({
    width: 1200,
    height: 1200,
    toDataURL(type) {
      assert.equal(type, "image/png");
      return "data:image/png;base64,AAEC";
    },
  }, "line one\nline two", FakeFile);

  assert.equal(payload.file.name, "saloni-resin-frame-design.png");
  assert.equal(payload.file.type, "image/png");
  assert.deepEqual(Array.from(payload.file.parts[0]), [0, 1, 2]);
  assert.equal(payload.text, "line one\nline two");
  assert.equal(payload.title, "Saloni resin frame design");
});

test("shares the freshly rendered summary and prevents duplicate clicks", async () => {
  const fixture = shareFixture();
  assert.equal(shareDesignFlow(fixture), true);
  assert.equal(shareDesignFlow(fixture), false);
  assert.equal(fixture.calls.share.length, 1);
  assert.equal(fixture.calls.share[0].text, "fresh line 1\nfresh line 2");
  assert.equal(fixture.calls.share[0].files.length, 1);
  assert.equal(fixture.shareButton.disabled, true);

  fixture.resolveShare();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fixture.state.shareInProgress, false);
  assert.equal(fixture.shareButton.disabled, false);
  assert.match(fixture.shareStatus.textContent, /handoff completed/i);
});

test("blocks sharing while the preview is loading, overflowing, or already sharing", () => {
  for (const key of ["imageLoading", "textOverflow", "shareInProgress"]) {
    const fixture = shareFixture();
    fixture.state[key] = true;
    assert.equal(shareDesignFlow(fixture), false, key);
    assert.equal(fixture.calls.share.length, 0, key);
  }
});

test("rechecks the final preview state before exporting", () => {
  const fixture = shareFixture({
    render() {
      fixture.state.textOverflow = true;
    },
  });
  assert.equal(shareDesignFlow(fixture), false);
  assert.equal(fixture.calls.share.length, 0);
  assert.equal(fixture.shareButton.disabled, true);
  assert.match(fixture.shareStatus.textContent, /Shorten the message/i);
});

test("re-enables Share after a reference image load error", () => {
  const fixture = imageFailureBrowserFixture();
  assert.equal(fixture.shareDesign.disabled, true);
  assert.match(fixture.shareStatus.textContent, /reference image loads/i);

  fixture.createdImage.onerror();

  assert.equal(fixture.shareDesign.disabled, false);
  assert.doesNotMatch(fixture.shareStatus.textContent, /reference image loads/i);
});

test("announces an honest manual fallback when native sharing is unsupported", () => {
  const fixture = shareFixture({ canShareResult: false });
  assert.equal(shareDesignFlow(fixture), false);
  assert.match(fixture.shareStatus.textContent, /download/i);
  assert.match(fixture.shareStatus.textContent, /copy/i);
  assert.match(fixture.shareStatus.textContent, /open.*chat/i);
  assert.equal(fixture.state.shareInProgress, false);
});

test("treats AbortError as cancellation without fallback side effects", async () => {
  const fixture = shareFixture();
  assert.equal(shareDesignFlow(fixture), true);
  const error = new Error("dismissed");
  error.name = "AbortError";
  fixture.rejectShare(error);
  await Promise.resolve();
  await Promise.resolve();
  assert.match(fixture.shareStatus.textContent, /cancelled/i);
  assert.doesNotMatch(fixture.shareStatus.textContent, /download|copy|open/i);
  assert.equal(fixture.state.shareInProgress, false);
});

test("announces fallback for export and native share failures", async () => {
  const exportFailure = shareFixture({
    canvas: { toDataURL() { throw new Error("canvas export failed"); } },
  });
  assert.equal(shareDesignFlow(exportFailure), false);
  assert.match(exportFailure.shareStatus.textContent, /download.*copy.*open.*chat/i);

  const shareFailure = shareFixture();
  assert.equal(shareDesignFlow(shareFailure), true);
  shareFailure.rejectShare(new Error("native share failed"));
  await Promise.resolve();
  await Promise.resolve();
  assert.match(shareFailure.shareStatus.textContent, /download.*copy.*open.*chat/i);
  assert.equal(shareFailure.state.shareInProgress, false);
});
