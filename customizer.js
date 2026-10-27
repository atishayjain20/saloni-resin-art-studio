(function () {
  "use strict";

  var CANVAS_SIZE = 1200;
  var PAINT_WIDTH = 13 / CANVAS_SIZE;
  var MAX_FILE_SIZE = 10 * 1024 * 1024;
  var HEX_RE = /^#[0-9A-Fa-f]{6}$/;
  var ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
  var ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
  var DEFAULT_COLOURS = {
    filling: "#C7A5CC",
    brush: "#D1A24B",
    paint: "#C96572",
    border: "#D8C9B9",
    text: "#2C2523"
  };
  var PHOTO_DEFAULTS = {
    x: 0.5,
    y: 0.26,
    size: 0.2,
    cropZoom: 1,
    cropX: 0.5,
    cropY: 0.5,
    position: "centre",
    custom: false
  };
  var STONE_RING_SEGMENTS = 24;
  var PIGMENT_PATCHES = [
    { x: 0.06, y: 0.12, width: 0.5, height: 0.24, bend: 0.18, alpha: 0.18 },
    { x: 0.48, y: 0.08, width: 0.42, height: 0.3, bend: -0.24, alpha: 0.14 },
    { x: 0.16, y: 0.34, width: 0.64, height: 0.2, bend: 0.28, alpha: 0.12 },
    { x: 0.58, y: 0.42, width: 0.34, height: 0.34, bend: -0.2, alpha: 0.16 },
    { x: 0.02, y: 0.58, width: 0.46, height: 0.28, bend: -0.18, alpha: 0.15 },
    { x: 0.36, y: 0.66, width: 0.58, height: 0.2, bend: 0.22, alpha: 0.13 },
    { x: 0.08, y: 0.82, width: 0.34, height: 0.14, bend: 0.16, alpha: 0.1 }
  ];

  function clampValue(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function textFont(size) {
    return "500 " + size + "px \"Noto Sans Devanagari\", \"Nirmala UI\", Mangal, Georgia, serif";
  }

  function graphemes(value) {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value), function (part) { return part.segment; });
    }
    return Array.from(value);
  }

  function measuredLine(context, line, size) {
    context.font = textFont(size);
    var measurement = context.measureText(line);
    var width = Number(measurement.width) || 0;
    var left = typeof measurement.actualBoundingBoxLeft === "number" ? measurement.actualBoundingBoxLeft : width / 2;
    var right = typeof measurement.actualBoundingBoxRight === "number" ? measurement.actualBoundingBoxRight : width / 2;
    var ascent = typeof measurement.actualBoundingBoxAscent === "number" ? measurement.actualBoundingBoxAscent : size * 0.78;
    var descent = typeof measurement.actualBoundingBoxDescent === "number" ? measurement.actualBoundingBoxDescent : size * 0.22;
    return { width: Math.max(width, left + right), left: left, right: right, ascent: ascent, descent: descent };
  }

  function wrapTextLines(context, sourceLines, maxWidth, size) {
    var lines = [];
    var oversized = false;
    var appendToken = function (token, current) {
      var tokenMeasurement = measuredLine(context, token, size);
      if (tokenMeasurement.width <= maxWidth) {
        var candidate = current ? current + " " + token : token;
        if (!current || measuredLine(context, candidate, size).width <= maxWidth) return { value: candidate, current: current };
        lines.push(current);
        return { value: token, current: "" };
      }
      if (current) lines.push(current);
      var piece = "";
      graphemes(token).forEach(function (character) {
        var joined = piece + character;
        if (piece && measuredLine(context, joined, size).width > maxWidth) {
          lines.push(piece);
          piece = character;
        } else piece = joined;
        if (measuredLine(context, piece, size).width > maxWidth) {
          lines.push(piece);
          piece = "";
          oversized = true;
        }
      });
      return { value: piece, current: "" };
    };

    sourceLines.forEach(function (sourceLine) {
      if (sourceLine === "") {
        lines.push("");
        return;
      }
      var current = "";
      sourceLine.trim().split(/\s+/).filter(Boolean).forEach(function (token) {
        var result = appendToken(token, current);
        current = result.value;
      });
      if (current) lines.push(current);
    });
    return { lines: lines, oversized: oversized };
  }

  function safeTextRect(inner) {
    return {
      x: inner.x + inner.width * 0.16,
      y: inner.y + inner.height * 0.16,
      width: inner.width * 0.68,
      height: inner.height * 0.68
    };
  }

  function photoRectForLayout(inner, layout) {
    var size = clampValue(Number(layout.size) || PHOTO_DEFAULTS.size, 0.2, 1);
    return {
      x: inner.x + inner.width * layout.x - inner.width * size / 2,
      y: inner.y + inner.height * layout.y - inner.height * size / 2,
      width: inner.width * size,
      height: inner.height * size
    };
  }

  function textLaneCandidates(inner, photoRect, position) {
    var safe = safeTextRect(inner);
    var preferredKinds;
    if (!photoRect) preferredKinds = ["safe"];
    else if (position === "left") preferredKinds = ["right", "below", "above", "left"];
    else if (position === "right") preferredKinds = ["left", "below", "above", "right"];
    else if (position === "custom") preferredKinds = [photoRect.x < inner.x + inner.width / 2 ? "right" : "left", photoRect.y < inner.y + inner.height / 2 ? "below" : "above", "right", "left", "below", "above"];
    else preferredKinds = ["below", "right", "left", "above"];

    if (!photoRect) return { candidates: [{ kind: "safe", rect: safe, overlap: false }], preferredKinds: preferredKinds, safeRect: safe };
    var gapX = inner.width * 0.02;
    var gapY = inner.height * 0.02;
    var safeRight = safe.x + safe.width;
    var safeBottom = safe.y + safe.height;
    var photoRight = photoRect.x + photoRect.width;
    var photoBottom = photoRect.y + photoRect.height;
    var candidates = [
      { kind: "left", rect: { x: safe.x, y: safe.y, width: Math.min(safeRight, photoRect.x - gapX) - safe.x, height: safe.height }, overlap: false },
      { kind: "right", rect: { x: Math.max(safe.x, photoRight + gapX), y: safe.y, width: safeRight - Math.max(safe.x, photoRight + gapX), height: safe.height }, overlap: false },
      { kind: "above", rect: { x: safe.x, y: safe.y, width: safe.width, height: Math.min(safeBottom, photoRect.y - gapY) - safe.y }, overlap: false },
      { kind: "below", rect: { x: safe.x, y: Math.max(safe.y, photoBottom + gapY), width: safe.width, height: safeBottom - Math.max(safe.y, photoBottom + gapY) }, overlap: false }
    ].filter(function (candidate) { return candidate.rect.width > 0 && candidate.rect.height > 0; });
    candidates.push({ kind: "safe", rect: safe, overlap: true });
    return { candidates: candidates, preferredKinds: preferredKinds, safeRect: safe };
  }

  function fitTextBlock(context, sourceLines, candidates, options) {
    var preferredKinds = (options && options.preferredKinds) || [];
    var safeRect = options && options.safeRect;
    var validCandidates = candidates.filter(function (candidate) { return candidate.rect.width > 0 && candidate.rect.height > 0; });
    var clearCandidates = validCandidates.filter(function (candidate) { return !candidate.overlap; });
    var rank = function (candidate) {
      var index = preferredKinds.indexOf(candidate.kind);
      return index === -1 ? preferredKinds.length + 1 : index;
    };
    var compare = function (first, second) {
      return rank(first.candidate) - rank(second.candidate) || (second.candidate.rect.width * second.candidate.rect.height) - (first.candidate.rect.width * first.candidate.rect.height);
    };
    var evaluate = function (candidate, size) {
      var wrapped = wrapTextLines(context, sourceLines, candidate.rect.width, size);
      var lineHeight = size * 1.3;
      var totalHeight = wrapped.lines.length * lineHeight;
      var maxWidth = 0;
      var maxAscent = size * 0.78;
      var maxDescent = size * 0.22;
      wrapped.lines.forEach(function (line) {
        var measured = measuredLine(context, line, size);
        maxWidth = Math.max(maxWidth, measured.width);
        maxAscent = Math.max(maxAscent, measured.ascent);
        maxDescent = Math.max(maxDescent, measured.descent);
      });
      var firstBaseline = candidate.rect.y + (candidate.rect.height - totalHeight) / 2 + lineHeight / 2;
      var bounds = {
        x: candidate.rect.x + candidate.rect.width / 2 - maxWidth / 2,
        y: firstBaseline - maxAscent,
        width: maxWidth,
        height: (wrapped.lines.length - 1) * lineHeight + maxAscent + maxDescent
      };
      var fits = !wrapped.oversized && bounds.width <= candidate.rect.width && bounds.x >= candidate.rect.x && bounds.y >= candidate.rect.y && bounds.y + bounds.height <= candidate.rect.y + candidate.rect.height;
      return { candidate: candidate, lines: wrapped.lines, oversized: wrapped.oversized, fontSize: size, lineHeight: lineHeight, firstBaseline: firstBaseline, bounds: bounds, fits: fits };
    };

    for (var size = 44; size >= 22; size -= 2) {
      var fitting = clearCandidates.map(function (candidate) { return evaluate(candidate, size); }).filter(function (result) { return result.fits; });
      if (fitting.length) {
        fitting.sort(compare);
        var chosen = fitting[0];
        return Object.assign(chosen, { overflow: false, backingVeil: chosen.candidate.overlap });
      }
    }

    var fallbackCandidate = validCandidates.filter(function (candidate) { return candidate.kind === "safe"; })[0] || validCandidates.sort(function (first, second) { return second.rect.width * second.rect.height - first.rect.width * first.rect.height; })[0];
    var fallback = evaluate(fallbackCandidate || { kind: "safe", rect: safeRect || { x: 0, y: 0, width: 0, height: 0 }, overlap: true }, 22);
    return Object.assign(fallback, { overflow: !fallback.fits, backingVeil: Boolean(fallback.candidate.overlap) });
  }

  function nudgePhotoLayout(layout, key, shifted) {
    var deltas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], Left: [-1, 0], Right: [1, 0], Up: [0, -1], Down: [0, 1] };
    if (!deltas[key]) return Object.assign({}, layout);
    var next = Object.assign({}, layout);
    var step = shifted ? 0.1 : 0.02;
    next.x += deltas[key][0] * step;
    next.y += deltas[key][1] * step;
    next.position = "custom";
    next.custom = true;
    return next;
  }

  function pigmentPatchPlan() {
    return PIGMENT_PATCHES.map(function (patch) { return Object.assign({}, patch); });
  }

  function drawFittedText(context, fit, centerX, outline, textColour) {
    context.font = textFont(fit.fontSize);
    context.textAlign = "center";
    context.textBaseline = "middle";
    if (outline) {
      context.strokeStyle = "rgba(255, 250, 244, 0.9)";
      context.lineWidth = Math.max(2, Math.min(3, fit.fontSize * 0.08));
      context.lineJoin = "round";
      fit.lines.forEach(function (line, index) {
        context.strokeText(line, centerX, fit.firstBaseline + index * fit.lineHeight);
      });
    }
    context.fillStyle = textColour || "#2C2523";
    fit.lines.forEach(function (line, index) {
      context.fillText(line, centerX, fit.firstBaseline + index * fit.lineHeight);
    });
  }

  var SHARE_TITLE = "Saloni resin frame design";
  var SHARE_FALLBACK_MESSAGE = "Share unavailable or failed. Use Download preview PNG, then Copy design summary, then open Saloni’s Instagram chat. Attach the downloaded PNG, paste the copied details, then tap Send.";

  function createSharePayload(canvas, summary, FileCtor) {
    if (!canvas || typeof canvas.toDataURL !== "function") throw new Error("Canvas export is unavailable.");
    var dataUrl = canvas.toDataURL("image/png");
    var separator = dataUrl.indexOf(",");
    if (separator === -1 || dataUrl.slice(0, separator).indexOf("image/png") === -1) throw new Error("Canvas did not produce a PNG.");
    var encoded = dataUrl.slice(separator + 1);
    var decode = typeof atob === "function" ? atob : null;
    var binary;
    if (decode) binary = decode(encoded);
    else if (typeof Buffer !== "undefined") binary = Buffer.from(encoded, "base64").toString("binary");
    else throw new Error("Base64 decoding is unavailable.");
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    var Constructor = FileCtor || (typeof File !== "undefined" ? File : null);
    if (typeof Constructor !== "function") throw new Error("File sharing is unavailable.");
    return {
      file: new Constructor([bytes], "saloni-resin-frame-design.png", { type: "image/png" }),
      text: String(summary || ""),
      title: SHARE_TITLE
    };
  }

  function shareDesignFlow(options) {
    options = options || {};
    var state = options.state || {};
    var shareButton = options.shareButton;
    var shareStatus = options.shareStatus;
    var setDisabled = function () {
      if (shareButton) shareButton.disabled = Boolean(state.imageLoading || state.textOverflow || state.shareInProgress);
    };
    var finish = function () {
      state.shareInProgress = false;
      setDisabled();
    };
    var fallback = function () {
      if (shareStatus) shareStatus.textContent = SHARE_FALLBACK_MESSAGE;
      finish();
      return false;
    };

    if (state.imageLoading || state.textOverflow || state.shareInProgress) {
      setDisabled();
      return false;
    }
    state.shareInProgress = true;
    setDisabled();
    if (shareStatus) shareStatus.textContent = "Preparing your design to share…";
    try {
      if (typeof options.render === "function") options.render();
      if (state.imageLoading || state.textOverflow) {
        setDisabled();
        if (shareStatus && state.textOverflow) shareStatus.textContent = "Shorten the message before sharing.";
        finish();
        return false;
      }
      var summary = options.summaryOutput ? options.summaryOutput.textContent : "";
      var payload = createSharePayload(options.canvas, summary, options.FileCtor);
      var navigator = options.navigatorObject || (typeof globalThis !== "undefined" ? globalThis.navigator : null);
      if (!navigator || typeof navigator.canShare !== "function" || typeof navigator.share !== "function") return fallback();
      var canShare = false;
      try {
        canShare = navigator.canShare({ files: [payload.file] });
      } catch (error) {
        canShare = false;
      }
      if (!canShare) return fallback();
      var shareResult = navigator.share({ files: [payload.file], text: payload.text, title: payload.title });
      Promise.resolve(shareResult).then(function () {
        if (shareStatus) shareStatus.textContent = "Share handoff completed. Verify the photo and details before sending.";
        finish();
      }, function (error) {
        if (error && error.name === "AbortError") {
          if (shareStatus) shareStatus.textContent = "Share cancelled.";
          finish();
          return;
        }
        fallback();
      });
      return true;
    } catch (error) {
      return fallback();
    }
  }

  function stoneRingPoint(index, shape, aspectRatio) {
    var step = (index + 0.5) / (STONE_RING_SEGMENTS * 4);
    if (shape === "round") {
      var circleAngle = -Math.PI / 2 + step * Math.PI * 2;
      return { x: 0.5 + 0.47 * Math.cos(circleAngle), y: 0.5 + 0.47 * Math.sin(circleAngle), tangentX: -Math.sin(circleAngle), tangentY: Math.cos(circleAngle), normalX: Math.cos(circleAngle), normalY: Math.sin(circleAngle) };
    }
    if (shape === "arch") {
      var aspect = Number(aspectRatio) > 0 ? Number(aspectRatio) : 1;
      var springY = 0.5 * aspect;
      var capRadiusY = 0.47 * aspect;
      var verticalLength = Math.max(0.1, 1 - springY);
      var archLength = Math.PI * 0.47;
      var totalLength = archLength + verticalLength + 0.94 + verticalLength;
      var distance = step * totalLength;
      if (distance < archLength) {
        var archAngle = Math.PI + distance / 0.47;
        return { x: 0.5 + 0.47 * Math.cos(archAngle), y: springY + capRadiusY * Math.sin(archAngle), tangentX: -Math.sin(archAngle), tangentY: Math.cos(archAngle), normalX: Math.cos(archAngle), normalY: Math.sin(archAngle) };
      }
      distance -= archLength;
      if (distance < verticalLength) return { x: 0.97, y: springY + distance, tangentX: 0, tangentY: 1, normalX: 1, normalY: 0 };
      distance -= verticalLength;
      if (distance < 0.94) return { x: 0.97 - distance, y: 1, tangentX: -1, tangentY: 0, normalX: 0, normalY: 1 };
      return { x: 0.03, y: 1 - (distance - 0.94), tangentX: 0, tangentY: -1, normalX: -1, normalY: 0 };
    }
    var side = Math.floor(index / STONE_RING_SEGMENTS);
    var squareStep = (index % STONE_RING_SEGMENTS + 0.5) / STONE_RING_SEGMENTS;
    var span = 0.94;
    if (side === 0) return { x: 0.03 + span * squareStep, y: 0.03, tangentX: 1, tangentY: 0, normalX: 0, normalY: -1 };
    if (side === 1) return { x: 0.97, y: 0.03 + span * squareStep, tangentX: 0, tangentY: 1, normalX: 1, normalY: 0 };
    if (side === 2) return { x: 0.97 - span * squareStep, y: 0.97, tangentX: -1, tangentY: 0, normalX: 0, normalY: 1 };
    return { x: 0.03, y: 0.97 - span * squareStep, tangentX: 0, tangentY: -1, normalX: -1, normalY: 0 };
  }

  function stoneChipPlan(shape, aspectRatio) {
    var chips = [];
    for (var index = 0; index < STONE_RING_SEGMENTS * 4; index += 1) {
      var point = stoneRingPoint(index, shape || "square", aspectRatio);
      var radius = 9 + [0, 2, 1, 3, 2, 4, 1, 3][index % 8];
      var rotation = (index % 7 - 3) * 0.17;
      var tangentX = point.tangentX * radius * 0.42;
      var tangentY = point.tangentY * radius * 0.42;
      chips.push({ x: point.x, y: point.y, radius: radius, offsetX: tangentX, offsetY: tangentY, normalX: point.normalX, normalY: point.normalY, rotation: rotation, tone: index % 3, alpha: 0.68 });
      chips.push({ x: point.x, y: point.y, radius: radius * (0.68 + (index % 3) * 0.06), offsetX: -tangentX, offsetY: -tangentY, normalX: point.normalX, normalY: point.normalY, rotation: rotation - 0.31, tone: (index + 1) % 3, alpha: 0.74 });
    }
    return chips;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      safeTextRect: safeTextRect,
      textLaneCandidates: textLaneCandidates,
      wrapTextLines: wrapTextLines,
      fitTextBlock: fitTextBlock,
      nudgePhotoLayout: nudgePhotoLayout,
      drawFittedText: drawFittedText,
      pigmentPatchPlan: pigmentPatchPlan,
      stoneChipPlan: stoneChipPlan,
      createSharePayload: createSharePayload,
      shareDesignFlow: shareDesignFlow
    };
  }
  if (typeof document === "undefined") return;

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("customizer-form");
    if (!form) return;

    var frameType = document.getElementById("frame-type");
    var borderStyle = document.getElementById("border-style");
    var framePreset = document.getElementById("frame-preset");
    var frameUnit = document.getElementById("frame-unit");
    var frameTemplate = document.getElementById("frame-template");
    var colourTheme = document.getElementById("colour-theme");
    var frameDimensionLabel = document.getElementById("frame-dimension-label");
    var previewDimensionLabel = document.getElementById("preview-dimension-label");
    var referenceImage = document.getElementById("reference-image");
    var imageStatus = document.getElementById("image-status");
    var imageActions = document.getElementById("image-actions");
    var replaceImage = document.getElementById("replace-image");
    var removeImage = document.getElementById("remove-image");
    var personalText = document.getElementById("personal-text");
    var textStatus = document.getElementById("text-status");
    var imageSize = document.getElementById("image-size");
    var imageSizeValue = document.getElementById("image-size-value");
    var cropZoom = document.getElementById("crop-zoom");
    var cropZoomValue = document.getElementById("crop-zoom-value");
    var cropX = document.getElementById("crop-x");
    var cropXValue = document.getElementById("crop-x-value");
    var cropY = document.getElementById("crop-y");
    var cropYValue = document.getElementById("crop-y-value");
    var positionInputs = Array.prototype.slice.call(form.querySelectorAll('input[name="image-position"]'));
    var paintToggle = document.getElementById("paint-toggle");
    var paintClear = document.getElementById("paint-clear");
    var copySummary = document.getElementById("copy-summary");
    var copyStatus = document.getElementById("copy-status");
    var reset = document.getElementById("customizer-reset");
    var downloadPreview = document.getElementById("download-preview");
    var downloadStatus = document.getElementById("download-status");
    var shareDesign = document.getElementById("share-design");
    var shareStatus = document.getElementById("share-status");
    var sceneCanvas = document.getElementById("scene-canvas");
    var sceneContext = sceneCanvas && sceneCanvas.getContext ? sceneCanvas.getContext("2d") : null;
    var previewStage = document.getElementById("preview-stage");
    var brushCursor = document.getElementById("brush-cursor");
    var summaryOutput = document.getElementById("customizer-summary");
    var colours = {
      filling: colourControl("filling-colour"),
      brush: colourControl("brush-colour"),
      paint: colourControl("paint-colour"),
      border: colourControl("border-colour"),
      text: colourControl("text-colour")
    };
    var state = {
      colors: {
        filling: DEFAULT_COLOURS.filling,
        brush: DEFAULT_COLOURS.brush,
        paint: DEFAULT_COLOURS.paint,
        border: DEFAULT_COLOURS.border,
        text: DEFAULT_COLOURS.text
      },
      image: null,
      imageRequest: 0,
      imageLoading: false,
      photoLayout: clonePhotoDefaults(),
      photoDrag: null,
      textOverflow: false,
      shareInProgress: false,
      strokes: [],
      cursor: { x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 },
      currentStroke: null,
      drawing: false
    };

    form.addEventListener("submit", function (event) {
      event.preventDefault();
    });

    function colourControl(id) {
      return {
        color: document.getElementById(id),
        hex: document.getElementById(id + "-hex"),
        error: document.getElementById(id + "-error")
      };
    }

    function clonePhotoDefaults() {
      return {
        x: PHOTO_DEFAULTS.x,
        y: PHOTO_DEFAULTS.y,
        size: PHOTO_DEFAULTS.size,
        cropZoom: PHOTO_DEFAULTS.cropZoom,
        cropX: PHOTO_DEFAULTS.cropX,
        cropY: PHOTO_DEFAULTS.cropY,
        position: PHOTO_DEFAULTS.position,
        custom: PHOTO_DEFAULTS.custom
      };
    }

    function clamp(value, minimum, maximum) {
      return Math.max(minimum, Math.min(maximum, value));
    }

    function messageValue() {
      return personalText.value.replace(/\r\n?/g, "\n");
    }

    function photoSizeLabel(size) {
      if (size < 0.52) return "Smaller";
      if (size > 0.84) return "Larger";
      return "Default";
    }

    function photoPositionLabel(position) {
      return position === "left" ? "Left" : position === "right" ? "Right" : position === "custom" ? "Custom" : "Centre";
    }

    function resetPhotoLayout() {
      state.photoLayout = clonePhotoDefaults();
      endPhotoDrag();
      updateImageControls();
    }

    function positionPreset(position) {
      state.photoLayout.position = position;
      state.photoLayout.custom = false;
      state.photoLayout.x = position === "left" ? 0.3 : position === "right" ? 0.7 : 0.5;
      state.photoLayout.y = position === "centre" ? 0.26 : 0.5;
      clampPhotoLayout(currentInner());
      updateImageControls();
      setImageStatus("Image position: " + photoPositionLabel(position) + ".");
      renderPreview();
    }

    function photoRect(inner) {
      return photoRectForLayout(inner, state.photoLayout);
    }

    function clampPhotoLayout(inner) {
      if (!inner) return;
      var size = Number(state.photoLayout.size);
      var zoom = Number(state.photoLayout.cropZoom);
      var focalX = Number(state.photoLayout.cropX);
      var focalY = Number(state.photoLayout.cropY);
      var centerX = Number(state.photoLayout.x);
      var centerY = Number(state.photoLayout.y);
      state.photoLayout.size = clamp(isFinite(size) ? size : PHOTO_DEFAULTS.size, 0.2, 1);
      state.photoLayout.cropZoom = clamp(isFinite(zoom) ? zoom : 1, 1, 3);
      state.photoLayout.cropX = clamp(isFinite(focalX) ? focalX : 0.5, 0, 1);
      state.photoLayout.cropY = clamp(isFinite(focalY) ? focalY : 0.5, 0, 1);
      var half = state.photoLayout.size / 2;
      state.photoLayout.x = clamp(isFinite(centerX) ? centerX : 0.5, half, 1 - half);
      state.photoLayout.y = clamp(isFinite(centerY) ? centerY : 0.5, half, 1 - half);
    }

    function updateImageControls() {
      var layout = state.photoLayout;
      if (imageSize) {
        imageSize.value = layout.size.toFixed(2);
        imageSizeValue.textContent = photoSizeLabel(layout.size);
      }
      if (cropZoom) {
        cropZoom.value = layout.cropZoom.toFixed(2);
        cropZoomValue.textContent = layout.cropZoom.toFixed(2) + "×";
      }
      if (cropX) {
        cropX.value = layout.cropX.toFixed(2);
        cropXValue.textContent = layout.cropX < 0.45 ? "Left" : layout.cropX > 0.55 ? "Right" : "Centre";
      }
      if (cropY) {
        cropY.value = layout.cropY.toFixed(2);
        cropYValue.textContent = layout.cropY < 0.45 ? "Top" : layout.cropY > 0.55 ? "Bottom" : "Centre";
      }
      positionInputs.forEach(function (input) {
        input.checked = input.value === layout.position;
      });
    }

    function selectedText(select) {
      return select.options[select.selectedIndex].textContent.trim();
    }

    function selectedDetails() {
      return Array.prototype.slice.call(form.querySelectorAll('input[name="details"]:checked')).map(function (input) {
        return input.value;
      });
    }

    function applyPalette(palette) {
      Object.keys(palette).forEach(function (name) { setColour(name, palette[name]); });
    }

    function applyTemplate(template) {
      var presets = {
        "soft-bloom": { type: "square", border: "scalloped", size: "8", theme: "warm-rose" },
        "golden-memory": { type: "arch", border: "gold", size: "10", theme: "ivory-gold" },
        "minimal-keepsake": { type: "round", border: "stones", size: "6", theme: "ocean-blue" }
      };
      var preset = presets[template] || presets["soft-bloom"];
      frameType.value = preset.type;
      borderStyle.value = preset.border;
      framePreset.value = preset.size;
      if (colourTheme) colourTheme.value = preset.theme;
      applyColourTheme(preset.theme);
      endPhotoDrag();
      renderPreview();
    }

    function applyColourTheme(theme) {
      var palettes = {
        "warm-rose": { filling: "#C7A5CC", brush: "#D1A24B", paint: "#C96572", border: "#D8C9B9", text: "#2C2523" },
        "ocean-blue": { filling: "#B7D4E5", brush: "#4C80A8", paint: "#C96572", border: "#D2D8DD", text: "#203039" },
        "ivory-gold": { filling: "#F1E3C5", brush: "#D1A24B", paint: "#B66A5D", border: "#C7B58D", text: "#2C2523" }
      };
      applyPalette(palettes[theme] || palettes["warm-rose"]);
    }

    function hexToRgb(hex) {
      return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16)
      };
    }

    function rgba(hex, alpha) {
      var rgb = hexToRgb(hex);
      return "rgba(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ", " + alpha + ")";
    }

    function mixHex(first, second, ratio) {
      var a = hexToRgb(first);
      var b = hexToRgb(second);
      var mix = function (value) { return Math.round(value).toString(16).padStart(2, "0"); };
      return "#" + mix(a.r * (1 - ratio) + b.r * ratio) + mix(a.g * (1 - ratio) + b.g * ratio) + mix(a.b * (1 - ratio) + b.b * ratio);
    }

    function setColourError(control, message) {
      control.error.textContent = message || "";
      control.error.hidden = !message;
    }

    function setColour(name, value) {
      var control = colours[name];
      var valid = HEX_RE.test(value);
      if (!valid) {
        setColourError(control, "Use 6 hex digits, for example #C96572.");
        return;
      }
      var normalized = value.toUpperCase();
      state.colors[name] = normalized;
      control.color.value = normalized;
      control.hex.value = normalized;
      setColourError(control, "");
      renderPreview();
    }

    function bindColour(name) {
      var control = colours[name];
      control.color.addEventListener("input", function () {
        setColour(name, control.color.value);
      });
      control.hex.addEventListener("input", function () {
        setColour(name, control.hex.value.trim());
      });
      control.hex.addEventListener("blur", function () {
        if (!HEX_RE.test(control.hex.value.trim())) {
          setColourError(control, "Use 6 hex digits, for example #C96572.");
        }
      });
    }

    function canonicalInches() {
      return Number(framePreset.value);
    }

    function displayMeasure(value) {
      if (frameUnit.value === "ft") return (value / 12).toFixed(2) + " ft";
      return (Math.round(value * 100) / 100).toString() + " in";
    }

    function updateFramePresetLabels() {
      Array.prototype.forEach.call(framePreset.options, function (option) {
        var inches = Number(option.getAttribute("data-inches") || option.value);
        option.textContent = frameUnit.value === "ft"
          ? displayMeasure(inches) + " size (" + inches + " in)"
          : inches + " in size";
      });
    }

    function dimensionLabel() {
      var inches = canonicalInches();
      if (frameType.value === "round") {
        return "Round · diameter " + displayMeasure(inches);
      }
      if (frameType.value === "arch") {
        return "Soft arch · " + displayMeasure(inches) + " × " + displayMeasure(inches * 4 / 3) + " (3:4)";
      }
      return "Square · " + displayMeasure(inches) + " × " + displayMeasure(inches);
    }

    function frameMetrics() {
      var inches = canonicalInches();
      var visualScale = 0.86 + ((inches - 6) / 6) * 0.1;
      var width = (frameType.value === "arch" ? 720 : 850) * visualScale;
      var height = (frameType.value === "arch" ? 960 : 850) * visualScale;
      return {
        shape: frameType.value,
        x: (CANVAS_SIZE - width) / 2,
        y: frameType.value === "arch" ? 92 : (CANVAS_SIZE - height) / 2 - 20,
        width: width,
        height: height,
        innerPad: borderStyle.value === "stones" ? 64 : 54
      };
    }

    function innerMetrics(metrics) {
      return {
        shape: metrics.shape,
        x: metrics.x + metrics.innerPad,
        y: metrics.y + metrics.innerPad,
        width: metrics.width - metrics.innerPad * 2,
        height: metrics.height - metrics.innerPad * 2
      };
    }

    function roundedRectPath(context, x, y, width, height, radius) {
      var r = Math.min(radius, width / 2, height / 2);
      context.beginPath();
      context.moveTo(x + r, y);
      context.lineTo(x + width - r, y);
      context.quadraticCurveTo(x + width, y, x + width, y + r);
      context.lineTo(x + width, y + height - r);
      context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      context.lineTo(x + r, y + height);
      context.quadraticCurveTo(x, y + height, x, y + height - r);
      context.lineTo(x, y + r);
      context.quadraticCurveTo(x, y, x + r, y);
      context.closePath();
    }

    function scallopedPath(context, x, y, width, height) {
      var segments = 12;
      var bump = 15;
      var side = function (start, length, horizontal, reverse) {
        for (var index = 0; index < segments; index += 1) {
          var next = start + length * (index + 1) / segments;
          var middle = start + length * (index + 0.5) / segments;
          if (horizontal) context.quadraticCurveTo(middle, reverse ? y - bump : y + height + bump, next, reverse ? y : y + height);
          else context.quadraticCurveTo(reverse ? x - bump : x + width + bump, middle, reverse ? x : x + width, next);
        }
      };
      context.beginPath();
      context.moveTo(x, y);
      side(x, width, true, true);
      side(y, height, false, false);
      side(x + width, -width, true, false);
      side(y + height, -height, false, true);
      context.closePath();
    }

    function scallopedRoundPath(context, metrics) {
      var centerX = metrics.x + metrics.width / 2;
      var centerY = metrics.y + metrics.height / 2;
      var radiusX = metrics.width / 2;
      var radiusY = metrics.height / 2;
      var segments = 24;
      var bump = 15;
      context.beginPath();
      for (var index = 0; index < segments; index += 1) {
        var start = -Math.PI / 2 + index * Math.PI * 2 / segments;
        var middle = start + Math.PI / segments;
        var end = start + Math.PI * 2 / segments;
        var startX = centerX + radiusX * Math.cos(start);
        var startY = centerY + radiusY * Math.sin(start);
        var middleX = centerX + Math.max(0, radiusX - bump) * Math.cos(middle);
        var middleY = centerY + Math.max(0, radiusY - bump) * Math.sin(middle);
        var endX = centerX + radiusX * Math.cos(end);
        var endY = centerY + radiusY * Math.sin(end);
        if (index === 0) context.moveTo(startX, startY);
        context.quadraticCurveTo(middleX, middleY, endX, endY);
      }
      context.closePath();
    }

    function scallopedArchPath(context, metrics) {
      var radius = metrics.width / 2;
      var centerX = metrics.x + radius;
      var centerY = metrics.y + radius;
      var sideHeight = metrics.height - radius;
      var segments = 10;
      var bump = 15;
      context.beginPath();
      context.moveTo(metrics.x, metrics.y + metrics.height);
      for (var left = 0; left < segments; left += 1) {
        var leftEnd = metrics.y + metrics.height - sideHeight * (left + 1) / segments;
        var leftMiddle = metrics.y + metrics.height - sideHeight * (left + 0.5) / segments;
        context.quadraticCurveTo(metrics.x - bump, leftMiddle, metrics.x, leftEnd);
      }
      for (var top = 0; top < segments; top += 1) {
        var topStart = Math.PI - top * Math.PI / segments;
        var topMiddle = topStart - Math.PI / (segments * 2);
        var topEnd = topStart - Math.PI / segments;
        context.quadraticCurveTo(
          centerX + Math.max(0, radius - bump) * Math.cos(topMiddle),
          centerY - Math.max(0, radius - bump) * Math.sin(topMiddle),
          centerX + radius * Math.cos(topEnd),
          centerY - radius * Math.sin(topEnd)
        );
      }
      for (var right = 0; right < segments; right += 1) {
        var rightEnd = metrics.y + radius + sideHeight * (right + 1) / segments;
        var rightMiddle = metrics.y + radius + sideHeight * (right + 0.5) / segments;
        context.quadraticCurveTo(metrics.x + metrics.width + bump, rightMiddle, metrics.x + metrics.width, rightEnd);
      }
      for (var bottom = 0; bottom < segments; bottom += 1) {
        var bottomEnd = metrics.x + metrics.width - metrics.width * (bottom + 1) / segments;
        var bottomMiddle = metrics.x + metrics.width - metrics.width * (bottom + 0.5) / segments;
        context.quadraticCurveTo(bottomMiddle, metrics.y + metrics.height + bump, bottomEnd, metrics.y + metrics.height);
      }
      context.closePath();
    }

    function traceShape(context, metrics, scalloped) {
      if (scalloped) {
        if (metrics.shape === "round") scallopedRoundPath(context, metrics);
        else if (metrics.shape === "arch") scallopedArchPath(context, metrics);
        else scallopedPath(context, metrics.x, metrics.y, metrics.width, metrics.height);
        return;
      }
      if (metrics.shape === "round") {
        context.beginPath();
        context.ellipse(metrics.x + metrics.width / 2, metrics.y + metrics.height / 2, metrics.width / 2, metrics.height / 2, 0, 0, Math.PI * 2);
        return;
      }
      if (metrics.shape === "arch") {
        var radius = metrics.width / 2;
        context.beginPath();
        context.moveTo(metrics.x, metrics.y + metrics.height);
        context.lineTo(metrics.x, metrics.y + radius);
        context.quadraticCurveTo(metrics.x, metrics.y, metrics.x + radius, metrics.y);
        context.quadraticCurveTo(metrics.x + metrics.width, metrics.y, metrics.x + metrics.width, metrics.y + radius);
        context.lineTo(metrics.x + metrics.width, metrics.y + metrics.height);
        context.closePath();
        return;
      }
      roundedRectPath(context, metrics.x, metrics.y, metrics.width, metrics.height, 34);
    }

    function drawShadow(context, metrics) {
      context.save();
      context.shadowColor = "rgba(65, 40, 32, 0.28)";
      context.shadowBlur = 42;
      context.shadowOffsetY = 26;
      traceShape(context, metrics, borderStyle.value === "scalloped");
      context.fillStyle = "rgba(73, 42, 32, 0.46)";
      context.fill();
      context.restore();
    }

    function drawMarbling(context, surface, base, brush, scalloped) {
      context.save();
      traceShape(context, surface, Boolean(scalloped));
      context.clip();
      // Repeated speck texture is intentionally omitted; pigment patches keep the material quieter.
      context.fillStyle = rgba(mixHex(base, "#fffaf0", 0.16), 0.84);
      context.fillRect(surface.x, surface.y, surface.width, surface.height);
      pigmentPatchPlan().forEach(function (patch, index) {
        var x = surface.x + surface.width * patch.x;
        var y = surface.y + surface.height * patch.y;
        var width = surface.width * patch.width;
        var height = surface.height * patch.height;
        var color = index % 3 === 0 ? brush : index % 3 === 1 ? mixHex(base, "#fffaf0", 0.34) : base;
        context.beginPath();
        context.moveTo(x, y + height * 0.48);
        context.bezierCurveTo(
          x + width * 0.08, y + height * (0.04 + patch.bend),
          x + width * 0.7, y + height * (0.1 - patch.bend),
          x + width, y + height * 0.34
        );
        context.bezierCurveTo(
          x + width * 0.88, y + height * 0.92,
          x + width * 0.3, y + height * (0.72 + patch.bend),
          x, y + height * 0.48
        );
        context.closePath();
        context.fillStyle = rgba(color, patch.alpha);
        context.fill();
      });
      context.restore();
    }

    function drawResinOverlay(context, surface, base, brush, scalloped) {
      context.save();
      traceShape(context, surface, Boolean(scalloped));
      context.clip();
      var tint = context.createLinearGradient(surface.x, surface.y, surface.x + surface.width, surface.y + surface.height);
      tint.addColorStop(0, rgba(mixHex(base, "#FFFFFF", 0.55), 0.11));
      tint.addColorStop(0.52, rgba(mixHex(base, brush, 0.35), 0.035));
      tint.addColorStop(1, rgba(mixHex(base, "#3F2E35", 0.18), 0.1));
      context.fillStyle = tint;
      context.fillRect(surface.x, surface.y, surface.width, surface.height);
      var glossEdge = context.createRadialGradient(surface.x + surface.width / 2, surface.y + surface.height / 2, surface.width * 0.22, surface.x + surface.width / 2, surface.y + surface.height / 2, surface.width * 0.72);
      glossEdge.addColorStop(0, "rgba(255,255,255,0)");
      glossEdge.addColorStop(1, "rgba(76,46,48,0.16)");
      context.fillStyle = glossEdge;
      context.fillRect(surface.x, surface.y, surface.width, surface.height);
      context.restore();
    }

    function drawGlobalResinGlaze(context, inner, base, brush, metrics) {
      drawResinOverlay(context, inner, base, brush, false);
      if (metrics) drawResinOverlay(context, metrics, state.colors.border, state.colors.border, borderStyle.value === "scalloped");
    }

    function drawFrameThickness(context, metrics) {
      var wall = {
        shape: metrics.shape,
        x: metrics.x,
        y: metrics.y + 18,
        width: metrics.width,
        height: metrics.height
      };
      drawMarbling(context, wall, state.colors.border, state.colors.border, borderStyle.value === "scalloped");
      context.save();
      traceShape(context, metrics, borderStyle.value === "scalloped");
      context.strokeStyle = rgba(mixHex(state.colors.border, "#fffaf0", 0.52), 0.38);
      context.lineWidth = 8;
      context.globalAlpha = 0.68;
      context.stroke();
      context.restore();
    }

    function drawCropCover(context, image, rect, zoom, focalX, focalY) {
      var naturalWidth = image.naturalWidth || image.width;
      var naturalHeight = image.naturalHeight || image.height;
      if (!naturalWidth || !naturalHeight) return;
      var baseScale = Math.max(rect.width / naturalWidth, rect.height / naturalHeight);
      var sourceWidth = clamp(rect.width / (baseScale * zoom), 1, naturalWidth);
      var sourceHeight = clamp(rect.height / (baseScale * zoom), 1, naturalHeight);
      var sourceX = (naturalWidth - sourceWidth) * clamp(focalX, 0, 1);
      var sourceY = (naturalHeight - sourceHeight) * clamp(focalY, 0, 1);
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, rect.x, rect.y, rect.width, rect.height);
    }

    function drawStones(context, metrics) {
      var inner = innerMetrics(metrics);
      var palette = [
        mixHex(state.colors.border, "#fffaf0", 0.78),
        mixHex(state.colors.border, "#f1d88c", 0.68),
        mixHex(state.colors.border, "#c17c34", 0.56)
      ];
      stoneChipPlan(metrics.shape, inner.width / inner.height).forEach(function (chip) {
        var centerX = inner.x + inner.width * chip.x;
        var centerY = inner.y + inner.height * chip.y;
        var radius = chip.radius;
        var edgeInset = Math.min(12, radius * 0.62);
        if (metrics.shape === "square") {
          if (chip.y < 0.15) centerY = inner.y - edgeInset;
          if (chip.y > 0.85) centerY = inner.y + inner.height + edgeInset;
          if (chip.x < 0.12) centerX = inner.x - edgeInset;
          if (chip.x > 0.88) centerX = inner.x + inner.width + edgeInset;
        } else {
          centerX += chip.normalX * edgeInset;
          centerY += chip.normalY * edgeInset;
        }
        centerX += chip.offsetX;
        centerY += chip.offsetY;
        context.save();
        context.translate(centerX, centerY);
        context.rotate(chip.rotation);
        context.beginPath();
        context.moveTo(-radius * 0.92, radius * 0.08);
        context.quadraticCurveTo(-radius * 0.58, -radius * 0.78, -radius * 0.12, -radius * 0.92);
        context.lineTo(radius * 0.72, -radius * 0.46);
        context.quadraticCurveTo(radius * 1.02, -radius * 0.02, radius * 0.46, radius * 0.72);
        context.quadraticCurveTo(radius * 0.08, radius * 1.02, -radius * 0.92, radius * 0.08);
        context.closePath();
        context.fillStyle = palette[chip.tone];
        context.globalAlpha = chip.alpha;
        context.fill();
        context.beginPath();
        context.moveTo(-radius * 0.58, radius * 0.04);
        context.lineTo(-radius * 0.1, -radius * 0.58);
        context.lineTo(radius * 0.62, -radius * 0.32);
        context.closePath();
        var facetFill = mixHex(palette[chip.tone], "#fffaf0", 0.35);
        context.fillStyle = facetFill;
        context.globalAlpha = chip.alpha * 0.62;
        context.fill();
        context.restore();
      });
    }

    function drawBotanicalOrnament(context, inner, brush) {
      context.save();
      var metallic = context.createLinearGradient(inner.x, inner.y, inner.x + inner.width, inner.y + inner.height);
      metallic.addColorStop(0, mixHex(brush, state.colors.border, 0.45));
      metallic.addColorStop(0.45, mixHex(state.colors.border, "#9E671F", 0.55));
      metallic.addColorStop(1, mixHex(state.colors.border, "#F5DF9A", 0.62));
      context.strokeStyle = metallic;
      context.lineWidth = 8;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(inner.x + inner.width * 0.14, inner.y + inner.height * 0.28);
      context.bezierCurveTo(inner.x + inner.width * 0.28, inner.y + inner.height * 0.12, inner.x + inner.width * 0.66, inner.y + inner.height * 0.2, inner.x + inner.width * 0.82, inner.y + inner.height * 0.12);
      context.stroke();
      context.beginPath();
      context.moveTo(inner.x + inner.width * 0.82, inner.y + inner.height * 0.12);
      context.bezierCurveTo(inner.x + inner.width * 0.73, inner.y + inner.height * 0.3, inner.x + inner.width * 0.75, inner.y + inner.height * 0.66, inner.x + inner.width * 0.88, inner.y + inner.height * 0.79);
      context.stroke();
      [[0.3, 0.16, -0.5], [0.48, 0.18, 0.6], [0.66, 0.16, -0.55], [0.79, 0.29, 0.72], [0.79, 0.5, -0.7], [0.82, 0.68, 0.6]].forEach(function (leaf) {
        var x = inner.x + inner.width * leaf[0];
        var y = inner.y + inner.height * leaf[1];
        context.save();
        context.translate(x, y);
        context.rotate(leaf[2]);
        context.beginPath();
        context.moveTo(0, 0);
        context.quadraticCurveTo(22, -32, 48, -7);
        context.quadraticCurveTo(22, 15, 0, 0);
        context.fillStyle = metallic;
        context.fill();
        context.restore();
      });
      context.restore();
    }

    function drawPressedFlowers(context, inner) {
      var flowers = [
        [0.26, 0.68, 26, "#d97989"],
        [0.72, 0.36, 22, "#dfb35f"],
        [0.5, 0.78, 19, "#8aa9bf"]
      ];
      context.save();
      flowers.forEach(function (flower, index) {
        var x = inner.x + inner.width * flower[0];
        var y = inner.y + inner.height * flower[1];
        context.strokeStyle = "rgba(74, 105, 77, 0.75)";
        context.lineWidth = 7;
        context.beginPath();
        context.moveTo(x, y + flower[2]);
        context.lineTo(x + (index % 2 ? 42 : -38), y + 88);
        context.stroke();
        [[0.35, 42, index % 2 ? -0.55 : 0.55], [0.7, 68, index % 2 ? 0.5 : -0.5]].forEach(function (leaf) {
          context.save();
          context.translate(x + (index % 2 ? 42 : -38) * leaf[0], y + leaf[1]);
          context.rotate(leaf[2]);
          context.beginPath();
          context.moveTo(0, 0);
          context.quadraticCurveTo(22, -22, 42, -4);
          context.quadraticCurveTo(21, 15, 0, 0);
          context.fillStyle = "rgba(74, 105, 77, 0.7)";
          context.fill();
          context.restore();
        });
        context.save();
        context.translate(x, y);
        for (var petal = 0; petal < 5; petal += 1) {
          context.rotate(Math.PI * 2 / 5);
          context.beginPath();
          context.ellipse(0, -flower[2] * 0.7, flower[2] * 0.42, flower[2], 0, 0, Math.PI * 2);
          context.fillStyle = rgba(flower[3], 0.72);
          context.fill();
        }
        context.beginPath();
        context.arc(0, 0, 7, 0, Math.PI * 2);
        context.fillStyle = "#c98b3a";
        context.fill();
        context.restore();
      });
      context.restore();
    }

    function normalisePoint(point, inner) {
      return {
        x: Math.max(0, Math.min(1, (point.x - inner.x) / inner.width)),
        y: Math.max(0, Math.min(1, (point.y - inner.y) / inner.height))
      };
    }

    function canvasPoint(point, inner) {
      return {
        x: inner.x + point.x * inner.width,
        y: inner.y + point.y * inner.height
      };
    }

    function drawPaintStrokes(context, inner) {
      context.save();
      traceShape(context, inner, false);
      context.clip();
      state.strokes.forEach(function (stroke) {
        if (!stroke.points.length) return;
        var first = canvasPoint(stroke.points[0], inner);
        context.beginPath();
        context.moveTo(first.x, first.y);
        stroke.points.slice(1).forEach(function (point) {
          var mapped = canvasPoint(point, inner);
          context.lineTo(mapped.x, mapped.y);
        });
        context.strokeStyle = stroke.color;
        context.lineWidth = stroke.width * Math.min(inner.width, inner.height);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.stroke();
        if (stroke.points.length === 1) {
          var dot = canvasPoint(stroke.points[0], inner);
          context.beginPath();
          context.fillStyle = stroke.color;
          context.arc(dot.x, dot.y, context.lineWidth / 2, 0, Math.PI * 2);
          context.fill();
        }
      });
      context.restore();
    }

    function textLane(inner) {
      var photo = state.image ? photoRectForLayout(inner, state.photoLayout) : null;
      return textLaneCandidates(inner, photo, state.photoLayout.custom ? "custom" : state.photoLayout.position);
    }

    function drawText(context, inner) {
      var text = messageValue();
      state.textOverflow = false;
      textStatus.textContent = "";
      if (!text) return;
      var sourceLines = text.split("\n");
      var lanes = textLane(inner);
      var fit = fitTextBlock(context, sourceLines, lanes.candidates, { preferredKinds: lanes.preferredKinds, safeRect: lanes.safeRect });
      state.textOverflow = fit.overflow;
      if (fit.overflow) textStatus.textContent = "Text is too long for this frame. Shorten a line or choose a taller frame.";
      context.save();
      traceShape(context, inner, false);
      context.clip();
      drawFittedText(context, fit, fit.candidate.rect.x + fit.candidate.rect.width / 2, fit.backingVeil, state.colors.text);
      context.restore();
    }

    function drawBorder(context, metrics) {
      var scalloped = borderStyle.value === "scalloped";
      context.save();
      traceShape(context, metrics, scalloped);
      if (borderStyle.value === "gold") {
        var gold = context.createLinearGradient(metrics.x, metrics.y, metrics.x + metrics.width, metrics.y + metrics.height);
        gold.addColorStop(0, mixHex(state.colors.border, "#f1d17c", 0.65));
        gold.addColorStop(0.5, mixHex(state.colors.border, "#9e671f", 0.62));
        gold.addColorStop(1, mixHex(state.colors.border, "#f5df9a", 0.7));
        context.strokeStyle = gold;
        context.lineWidth = 12;
      } else {
        context.strokeStyle = rgba(mixHex(state.colors.border, "#fffaf0", 0.52), 0.72);
        context.lineWidth = 9;
      }
      context.stroke();
      context.restore();
      if (borderStyle.value === "stones" || selectedDetails().indexOf("Stones") !== -1) drawStones(context, metrics);
    }

    function renderPreview() {
      if (!sceneContext) return;
      updateFramePresetLabels();
      var metrics = frameMetrics();
      var inner = innerMetrics(metrics);
      clampPhotoLayout(inner);
      updateImageControls();
      sceneContext.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      var background = sceneContext.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      background.addColorStop(0, "#fffaf4");
      background.addColorStop(1, "#ead6cc");
      sceneContext.fillStyle = background;
      sceneContext.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      drawShadow(sceneContext, metrics);
      drawFrameThickness(sceneContext, metrics);
      drawMarbling(sceneContext, metrics, state.colors.border, state.colors.border, borderStyle.value === "scalloped");
      drawMarbling(sceneContext, inner, state.colors.filling, state.colors.brush, false);
      if (state.image && state.image.element.complete) {
        sceneContext.save();
        traceShape(sceneContext, inner, false);
        sceneContext.clip();
        var rect = photoRect(inner);
        sceneContext.shadowColor = "rgba(62, 40, 38, 0.2)";
        sceneContext.shadowBlur = 18;
        sceneContext.shadowOffsetY = 10;
        sceneContext.fillStyle = "rgba(255, 250, 244, 0.35)";
        sceneContext.fillRect(rect.x, rect.y, rect.width, rect.height);
        sceneContext.shadowColor = "transparent";
        drawCropCover(sceneContext, state.image.element, rect, state.photoLayout.cropZoom, state.photoLayout.cropX, state.photoLayout.cropY);
        sceneContext.restore();
      }
      var details = selectedDetails();
      if (details.indexOf("Botanical ornament") !== -1) drawBotanicalOrnament(sceneContext, inner, state.colors.brush);
      if (details.indexOf("Pressed flowers and leaves") !== -1) drawPressedFlowers(sceneContext, inner);
      drawPaintStrokes(sceneContext, inner);
      drawText(sceneContext, inner);
      drawGlobalResinGlaze(sceneContext, inner, state.colors.filling, state.colors.brush, metrics);
      drawBorder(sceneContext, metrics);
      var label = dimensionLabel();
      frameDimensionLabel.textContent = label;
      previewDimensionLabel.textContent = label;
      sceneCanvas.setAttribute("aria-label", "Illustrative preview of " + label + (state.image ? ". Image position: " + photoPositionLabel(state.photoLayout.custom ? "custom" : state.photoLayout.position) : ". No reference image") + (messageValue() ? ". Message text added" : ". No message text"));
      updateSummary();
      updateDownloadState();
      updateShareState();
      updateBrushCursor();
    }

    function updateSummary() {
      var details = selectedDetails();
      summaryOutput.textContent = [
        "Custom resin frame",
        "Frame: " + selectedText(frameType),
        "Border: " + selectedText(borderStyle),
        "Size: " + dimensionLabel(),
        "Filling colour: " + state.colors.filling,
        "Marbling / brush colour: " + state.colors.brush,
        "Paint colour: " + state.colors.paint,
        "Side-border colour: " + state.colors.border,
        "Text colour: " + state.colors.text,
        "Text: " + (messageValue() || "None"),
        "Finishing touches: " + (details.length ? details.join(", ") : "None"),
        "Reference image: " + (state.image ? state.image.name : "None"),
        "Image size: " + (state.image ? photoSizeLabel(state.photoLayout.size) : "None"),
        "Image position: " + (state.image ? photoPositionLabel(state.photoLayout.custom ? "custom" : state.photoLayout.position) : "None"),
        "Freehand paint: " + (state.strokes.length ? "Added locally" : "Not added")
      ].join("\n");
    }

    function updateDownloadState() {
      downloadPreview.disabled = state.imageLoading || state.textOverflow;
      if (state.imageLoading) downloadStatus.textContent = "Preparing preview while the reference image loads…";
      else if (state.textOverflow) downloadStatus.textContent = "Shorten the message before downloading a PNG.";
      else if (/^(Preparing preview while the reference image loads|Shorten the message before downloading)/.test(downloadStatus.textContent)) downloadStatus.textContent = "";
    }

    function updateShareState() {
      if (shareDesign) shareDesign.disabled = state.imageLoading || state.textOverflow || state.shareInProgress;
      if (!shareStatus) return;
      if (state.imageLoading) shareStatus.textContent = "Preparing preview while the reference image loads…";
      else if (state.textOverflow) shareStatus.textContent = "Shorten the message before sharing.";
      else if (/^(Preparing preview while the reference image loads|Shorten the message before sharing)/.test(shareStatus.textContent)) shareStatus.textContent = "";
    }

    function imageExtension(fileName) {
      var parts = fileName.toLowerCase().split(".");
      return parts.length > 1 ? parts.pop() : "";
    }

    function validImage(file) {
      return ALLOWED_TYPES.indexOf((file.type || "").toLowerCase()) !== -1 || ALLOWED_EXTENSIONS.indexOf(imageExtension(file.name)) !== -1;
    }

    function setImageStatus(message) {
      imageStatus.textContent = message;
    }

    function releaseImage(image) {
      if (image && image.url) URL.revokeObjectURL(image.url);
    }

    function handleImage(event) {
      var file = event.target.files && event.target.files[0];
      if (!file) {
        setImageStatus(state.image ? "Reference image unchanged." : "No reference image selected.");
        return;
      }
      if (!validImage(file)) {
        referenceImage.value = "";
        setImageStatus("That file is not supported. Choose a JPEG, PNG, or WebP image.");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        referenceImage.value = "";
        setImageStatus("That image is larger than 10MB. Choose a smaller file.");
        return;
      }
      var request = state.imageRequest + 1;
      state.imageRequest = request;
      state.imageLoading = true;
      imageActions.hidden = false;
      setImageStatus("Loading reference image…");
      updateDownloadState();
      updateShareState();
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        if (request !== state.imageRequest) {
          URL.revokeObjectURL(url);
          return;
        }
        var previous = state.image;
        state.image = { element: image, url: url, name: file.name };
        state.imageLoading = false;
        resetPhotoLayout();
        releaseImage(previous);
        setImageStatus("Reference image ready: " + file.name);
        updateShareState();
        renderPreview();
      };
      image.onerror = function () {
        if (request !== state.imageRequest) {
          URL.revokeObjectURL(url);
          return;
        }
        state.imageLoading = false;
        URL.revokeObjectURL(url);
        referenceImage.value = "";
        setImageStatus("That image could not be loaded. Your previous image is unchanged.");
        updateDownloadState();
        updateShareState();
      };
      image.src = url;
    }

    function removeCurrentImage() {
      state.imageRequest += 1;
      endPhotoDrag();
      releaseImage(state.image);
      state.image = null;
      state.imageLoading = false;
      resetPhotoLayout();
      referenceImage.value = "";
      imageActions.hidden = true;
      setImageStatus("Reference image removed.");
      renderPreview();
    }

    function pointFor(event) {
      var bounds = sceneCanvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(CANVAS_SIZE, (event.clientX - bounds.left) / bounds.width * CANVAS_SIZE)),
        y: Math.max(0, Math.min(CANVAS_SIZE, (event.clientY - bounds.top) / bounds.height * CANVAS_SIZE))
      };
    }

    function updateBrushCursor() {
      brushCursor.style.left = (state.cursor.x / CANVAS_SIZE * 100) + "%";
      brushCursor.style.top = (state.cursor.y / CANVAS_SIZE * 100) + "%";
      previewStage.classList.toggle("paint-mode", paintToggle.checked);
      previewStage.classList.toggle("interactive", paintToggle.checked || Boolean(state.image));
      previewStage.classList.toggle("dragging", Boolean(state.photoDrag));
    }

    function currentInner() {
      return innerMetrics(frameMetrics());
    }

    function endPhotoDrag() {
      if (!state.photoDrag) return;
      state.photoDrag = null;
      updateBrushCursor();
    }

    function beginPhotoDrag(event) {
      if (paintToggle.checked || !state.image || event.button !== 0 || state.photoDrag) return;
      var point = pointFor(event);
      var inner = currentInner();
      var metrics = frameMetrics();
      if (point.x < metrics.x || point.x > metrics.x + metrics.width || point.y < metrics.y || point.y > metrics.y + metrics.height) return;
      event.preventDefault();
      state.photoDrag = {
        pointerId: event.pointerId,
        start: point,
        layout: {
          x: state.photoLayout.x,
          y: state.photoLayout.y
        }
      };
      if (sceneCanvas.setPointerCapture) sceneCanvas.setPointerCapture(event.pointerId);
      updateBrushCursor();
    }

    function movePhotoDrag(event) {
      if (!state.photoDrag || state.photoDrag.pointerId !== event.pointerId) return;
      event.preventDefault();
      var point = pointFor(event);
      var inner = currentInner();
      state.photoLayout.x = state.photoDrag.layout.x + (point.x - state.photoDrag.start.x) / inner.width;
      state.photoLayout.y = state.photoDrag.layout.y + (point.y - state.photoDrag.start.y) / inner.height;
      state.photoLayout.position = "custom";
      state.photoLayout.custom = true;
      clampPhotoLayout(inner);
      renderPreview();
    }

    function finishPhotoDrag(event) {
      if (!state.photoDrag || (event && state.photoDrag.pointerId !== event.pointerId)) return;
      var wasCustom = state.photoLayout.custom;
      endPhotoDrag();
      if (wasCustom) setImageStatus("Custom position.");
      renderPreview();
    }

    function beginPaint(event) {
      if (!paintToggle.checked) return;
      event.preventDefault();
      state.drawing = true;
      state.cursor = pointFor(event);
      state.currentStroke = { color: state.colors.paint, width: PAINT_WIDTH, points: [normalisePoint(state.cursor, currentInner())] };
      state.strokes.push(state.currentStroke);
      if (sceneCanvas.setPointerCapture) sceneCanvas.setPointerCapture(event.pointerId);
      updateBrushCursor();
      renderPreview();
    }

    function drawPaint(event) {
      if (!paintToggle.checked) return;
      state.cursor = pointFor(event);
      updateBrushCursor();
      if (!state.drawing || !state.currentStroke) return;
      event.preventDefault();
      state.currentStroke.points.push(normalisePoint(state.cursor, currentInner()));
      renderPreview();
    }

    function endPaint() {
      state.drawing = false;
      state.currentStroke = null;
      renderPreview();
    }

    function stopPaintMode() {
      paintToggle.checked = false;
      state.drawing = false;
      state.currentStroke = null;
      endPhotoDrag();
      updateBrushCursor();
      renderPreview();
    }

    function startKeyboardDrawing() {
      if (!paintToggle.checked) {
        paintToggle.checked = true;
        updateBrushCursor();
      }
      state.drawing = true;
      state.currentStroke = { color: state.colors.paint, width: PAINT_WIDTH, points: [normalisePoint(state.cursor, currentInner())] };
      state.strokes.push(state.currentStroke);
      renderPreview();
    }

    function toggleKeyboardDrawing() {
      if (state.drawing) {
        state.drawing = false;
        state.currentStroke = null;
        renderPreview();
        return;
      }
      startKeyboardDrawing();
    }

    function appendKeyboardPoint() {
      if (!state.drawing || !state.currentStroke) return;
      state.currentStroke.points.push(normalisePoint(state.cursor, currentInner()));
    }

    function moveCursor(event) {
      var step = 18;
      if (event.key === "ArrowLeft") state.cursor.x = Math.max(0, state.cursor.x - step);
      if (event.key === "ArrowRight") state.cursor.x = Math.min(CANVAS_SIZE, state.cursor.x + step);
      if (event.key === "ArrowUp") state.cursor.y = Math.max(0, state.cursor.y - step);
      if (event.key === "ArrowDown") state.cursor.y = Math.min(CANVAS_SIZE, state.cursor.y + step);
      appendKeyboardPoint();
      updateBrushCursor();
      if (state.drawing) renderPreview();
    }

    function keyboardPaint(event) {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(event.key) !== -1) {
        event.preventDefault();
        moveCursor(event);
      }
      if (event.key === " ") {
        event.preventDefault();
        toggleKeyboardDrawing();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        stopPaintMode();
      }
    }

    function movePhotoWithKeyboard(event) {
      if (!state.image) return false;
      var key = event.key || event.code;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Left", "Right", "Up", "Down"].indexOf(key) === -1) return false;
      event.preventDefault();
      state.photoLayout = nudgePhotoLayout(state.photoLayout, key, event.shiftKey);
      clampPhotoLayout(currentInner());
      setImageStatus("Custom position.");
      renderPreview();
      return true;
    }

    function keyboardInteraction(event) {
      if (paintToggle.checked) {
        keyboardPaint(event);
        return;
      }
      if (movePhotoWithKeyboard(event)) return;
      if (event.key === "Escape") {
        endPhotoDrag();
        renderPreview();
      }
    }

    function fallbackCopy(text) {
      var textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      var copied = false;
      try {
        textArea.focus();
        textArea.select();
        copied = document.execCommand("copy");
      } catch (error) {
        copied = false;
      } finally {
        document.body.removeChild(textArea);
        copySummary.focus();
      }
      return copied;
    }

    function copySummaryText() {
      var text = summaryOutput.textContent;
      var done = function (success) {
        copyStatus.textContent = success ? "Summary copied. Attach your image or a screenshot separately." : "Copy is unavailable here. Select the summary above and copy it manually.";
      };
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(text).then(function () { done(true); }).catch(function () { done(fallbackCopy(text)); });
      } else done(fallbackCopy(text));
    }

    function downloadPng() {
      if (state.imageLoading || state.textOverflow) return;
      downloadPreview.disabled = true;
      downloadStatus.textContent = "Preparing your local PNG…";
      renderPreview();
      sceneCanvas.toBlob(function (blob) {
        if (!blob) {
          downloadStatus.textContent = "The PNG could not be prepared. Try again.";
          updateDownloadState();
          return;
        }
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        var safeShape = frameType.value.replace(/[^a-z0-9-]/gi, "-");
        link.href = url;
        link.download = "saloni-resin-frame-" + safeShape + "-preview.png";
        link.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 0);
        downloadStatus.textContent = "PNG ready. It stays on this device; attach it separately when you contact Saloni.";
        updateDownloadState();
      }, "image/png");
    }

    function shareDesignNow() {
      return shareDesignFlow({
        state: state,
        canvas: sceneCanvas,
        summaryOutput: summaryOutput,
        shareButton: shareDesign,
        shareStatus: shareStatus,
        render: renderPreview,
        navigatorObject: typeof navigator !== "undefined" ? navigator : null
      });
    }

    function resetCustomiser() {
      form.reset();
      state.strokes = [];
      state.cursor = { x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 };
      state.drawing = false;
      state.currentStroke = null;
      endPhotoDrag();
      state.photoLayout = clonePhotoDefaults();
      state.textOverflow = false;
      state.imageRequest += 1;
      releaseImage(state.image);
      state.image = null;
      state.imageLoading = false;
      referenceImage.value = "";
      imageActions.hidden = true;
      setImageStatus("No reference image selected.");
      Object.keys(DEFAULT_COLOURS).forEach(function (name) {
        state.colors[name] = DEFAULT_COLOURS[name];
        colours[name].color.value = DEFAULT_COLOURS[name];
        colours[name].hex.value = DEFAULT_COLOURS[name];
        setColourError(colours[name], "");
      });
      copyStatus.textContent = "";
      downloadStatus.textContent = "";
      shareStatus.textContent = "";
      updateImageControls();
      updateBrushCursor();
      renderPreview();
    }

    Object.keys(colours).forEach(bindColour);
    referenceImage.addEventListener("change", handleImage);
    replaceImage.addEventListener("click", function () {
      referenceImage.value = "";
      referenceImage.click();
    });
    removeImage.addEventListener("click", removeCurrentImage);
    imageSize.addEventListener("input", function () {
      state.photoLayout.size = Number(imageSize.value);
      clampPhotoLayout(currentInner());
      endPhotoDrag();
      renderPreview();
    });
    cropZoom.addEventListener("input", function () {
      state.photoLayout.cropZoom = Number(cropZoom.value);
      renderPreview();
    });
    cropX.addEventListener("input", function () {
      state.photoLayout.cropX = Number(cropX.value);
      renderPreview();
    });
    cropY.addEventListener("input", function () {
      state.photoLayout.cropY = Number(cropY.value);
      renderPreview();
    });
    positionInputs.forEach(function (input) {
      input.addEventListener("change", function () {
        positionPreset(input.value);
      });
    });
    paintToggle.addEventListener("change", function () {
      endPhotoDrag();
      if (!paintToggle.checked) {
        state.drawing = false;
        state.currentStroke = null;
      }
      updateBrushCursor();
      renderPreview();
    });
    paintClear.addEventListener("click", function () {
      state.strokes = [];
      state.currentStroke = null;
      state.drawing = false;
      renderPreview();
    });
    sceneCanvas.addEventListener("pointerdown", function (event) {
      if (paintToggle.checked) beginPaint(event);
      else beginPhotoDrag(event);
    });
    sceneCanvas.addEventListener("pointermove", function (event) {
      if (paintToggle.checked) drawPaint(event);
      else movePhotoDrag(event);
    });
    sceneCanvas.addEventListener("pointerup", function (event) {
      if (paintToggle.checked) endPaint(event);
      else finishPhotoDrag(event);
    });
    sceneCanvas.addEventListener("pointercancel", function (event) {
      if (paintToggle.checked) endPaint(event);
      else finishPhotoDrag(event);
    });
    sceneCanvas.addEventListener("lostpointercapture", function (event) {
      if (!paintToggle.checked) finishPhotoDrag(event);
    });
    sceneCanvas.addEventListener("keydown", keyboardInteraction);
    form.addEventListener("input", function (event) {
      if (event.target.classList.contains("hex-input") || event.target.type === "color") return;
      renderPreview();
    });
    form.addEventListener("change", function (event) {
      if (event.target.classList.contains("hex-input") || event.target.type === "file" || event.target.type === "color") return;
      renderPreview();
    });
    copySummary.addEventListener("click", copySummaryText);
    downloadPreview.addEventListener("click", downloadPng);
    shareDesign.addEventListener("click", shareDesignNow);
    reset.addEventListener("click", resetCustomiser);
    frameTemplate.addEventListener("change", function () { applyTemplate(frameTemplate.value); });
    colourTheme.addEventListener("change", function () { applyColourTheme(colourTheme.value); renderPreview(); });
    frameType.addEventListener("change", endPhotoDrag);
    borderStyle.addEventListener("change", endPhotoDrag);
    framePreset.addEventListener("change", endPhotoDrag);
    window.addEventListener("resize", renderPreview, { passive: true });

    updateBrushCursor();
    renderPreview();
  });
}());
