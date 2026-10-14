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
    paint: "#C96572"
  };
  var STONE_POINTS = [
    [0.18, 0.08], [0.34, 0.07], [0.52, 0.09], [0.7, 0.08],
    [0.93, 0.24], [0.94, 0.46], [0.92, 0.7], [0.78, 0.93],
    [0.58, 0.94], [0.37, 0.93], [0.16, 0.92], [0.07, 0.68],
    [0.06, 0.44], [0.08, 0.23]
  ];
  var MARBLE_LINES = [0.18, 0.32, 0.49, 0.64, 0.78];

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("customizer-form");
    if (!form) return;

    var frameType = document.getElementById("frame-type");
    var borderStyle = document.getElementById("border-style");
    var framePreset = document.getElementById("frame-preset");
    var frameUnit = document.getElementById("frame-unit");
    var frameDimensionLabel = document.getElementById("frame-dimension-label");
    var previewDimensionLabel = document.getElementById("preview-dimension-label");
    var referenceImage = document.getElementById("reference-image");
    var imageStatus = document.getElementById("image-status");
    var imageActions = document.getElementById("image-actions");
    var replaceImage = document.getElementById("replace-image");
    var removeImage = document.getElementById("remove-image");
    var personalText = document.getElementById("personal-text");
    var paintToggle = document.getElementById("paint-toggle");
    var paintClear = document.getElementById("paint-clear");
    var copySummary = document.getElementById("copy-summary");
    var copyStatus = document.getElementById("copy-status");
    var reset = document.getElementById("customizer-reset");
    var downloadPreview = document.getElementById("download-preview");
    var downloadStatus = document.getElementById("download-status");
    var sceneCanvas = document.getElementById("scene-canvas");
    var sceneContext = sceneCanvas && sceneCanvas.getContext ? sceneCanvas.getContext("2d") : null;
    var previewStage = document.getElementById("preview-stage");
    var brushCursor = document.getElementById("brush-cursor");
    var summaryOutput = document.getElementById("customizer-summary");
    var colours = {
      filling: colourControl("filling-colour"),
      brush: colourControl("brush-colour"),
      paint: colourControl("paint-colour")
    };
    var state = {
      colors: {
        filling: DEFAULT_COLOURS.filling,
        brush: DEFAULT_COLOURS.brush,
        paint: DEFAULT_COLOURS.paint
      },
      image: null,
      imageRequest: 0,
      imageLoading: false,
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

    function selectedText(select) {
      return select.options[select.selectedIndex].textContent.trim();
    }

    function selectedDetails() {
      return Array.prototype.slice.call(form.querySelectorAll('input[name="details"]:checked')).map(function (input) {
        return input.value;
      });
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

    function drawSpeckles(context, inner, brush) {
      for (var index = 0; index < 34; index += 1) {
        var x = inner.x + inner.width * ((index * 37) % 100) / 100;
        var y = inner.y + inner.height * ((index * 61) % 100) / 100;
        context.beginPath();
        context.fillStyle = index % 3 ? rgba(brush, 0.12) : "rgba(255, 255, 255, 0.2)";
        context.arc(x, y, 2 + (index % 3), 0, Math.PI * 2);
        context.fill();
      }
    }

    function drawMarbling(context, inner, base, brush) {
      context.save();
      traceShape(context, inner, false);
      context.clip();
      var gradient = context.createLinearGradient(inner.x, inner.y, inner.x + inner.width, inner.y + inner.height);
      gradient.addColorStop(0, rgba(mixHex(base, "#FFFFFF", 0.25), 0.86));
      gradient.addColorStop(0.5, rgba(base, 0.82));
      gradient.addColorStop(1, rgba(mixHex(base, "#5A3D4B", 0.15), 0.9));
      context.fillStyle = gradient;
      context.fillRect(inner.x, inner.y, inner.width, inner.height);
      MARBLE_LINES.forEach(function (position, index) {
        context.beginPath();
        context.moveTo(inner.x - 45, inner.y + inner.height * position);
        context.bezierCurveTo(inner.x + inner.width * 0.2, inner.y + inner.height * (position - 0.08), inner.x + inner.width * 0.66, inner.y + inner.height * (position + 0.1), inner.x + inner.width + 45, inner.y + inner.height * (position - 0.035));
        context.strokeStyle = index % 2 ? rgba(brush, 0.19) : "rgba(255, 250, 244, 0.23)";
        context.lineWidth = 8 + (index % 2) * 5;
        context.stroke();
      });
      drawSpeckles(context, inner, brush);
      var gloss = context.createLinearGradient(inner.x, inner.y, inner.x + inner.width, inner.y + inner.height);
      gloss.addColorStop(0, "rgba(255, 255, 255, 0.32)");
      gloss.addColorStop(0.38, "rgba(255, 255, 255, 0.02)");
      gloss.addColorStop(1, "rgba(255, 255, 255, 0.2)");
      context.fillStyle = gloss;
      context.fillRect(inner.x, inner.y, inner.width, inner.height);
      context.restore();
    }

    function drawResinOverlay(context, inner, base, brush) {
      context.save();
      traceShape(context, inner, false);
      context.clip();
      var tint = context.createLinearGradient(inner.x, inner.y, inner.x + inner.width, inner.y + inner.height);
      tint.addColorStop(0, rgba(mixHex(base, "#FFFFFF", 0.55), 0.12));
      tint.addColorStop(1, rgba(mixHex(base, brush, 0.35), 0.08));
      context.fillStyle = tint;
      context.fillRect(inner.x, inner.y, inner.width, inner.height);
      MARBLE_LINES.slice(0, 3).forEach(function (position, index) {
        context.beginPath();
        context.moveTo(inner.x - 30, inner.y + inner.height * position);
        context.bezierCurveTo(inner.x + inner.width * 0.24, inner.y + inner.height * (position - 0.05), inner.x + inner.width * 0.62, inner.y + inner.height * (position + 0.07), inner.x + inner.width + 30, inner.y + inner.height * (position - 0.02));
        context.strokeStyle = index % 2 ? rgba(brush, 0.14) : rgba(base, 0.1);
        context.lineWidth = 5;
        context.stroke();
      });
      var gloss = context.createLinearGradient(inner.x, inner.y, inner.x + inner.width, inner.y + inner.height);
      gloss.addColorStop(0, "rgba(255, 255, 255, 0.18)");
      gloss.addColorStop(0.42, "rgba(255, 255, 255, 0.015)");
      gloss.addColorStop(1, "rgba(255, 255, 255, 0.12)");
      context.fillStyle = gloss;
      context.fillRect(inner.x, inner.y, inner.width, inner.height);
      context.restore();
    }

    function drawCropCover(context, image, x, y, width, height) {
      var naturalWidth = image.naturalWidth || image.width;
      var naturalHeight = image.naturalHeight || image.height;
      if (!naturalWidth || !naturalHeight) return;
      var scale = Math.max(width / naturalWidth, height / naturalHeight);
      var drawWidth = naturalWidth * scale;
      var drawHeight = naturalHeight * scale;
      context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
    }

    function drawStones(context, metrics) {
      var inner = innerMetrics(metrics);
      STONE_POINTS.forEach(function (point, index) {
        var centerX = inner.x + inner.width * point[0];
        var centerY = inner.y + inner.height * point[1];
        if (point[1] < 0.15) centerY = inner.y - 12;
        if (point[1] > 0.85) centerY = inner.y + inner.height + 12;
        if (point[0] < 0.12) centerX = inner.x - 12;
        if (point[0] > 0.88) centerX = inner.x + inner.width + 12;
        var radius = 15 + index % 3 * 4;
        context.save();
        context.translate(centerX, centerY);
        context.rotate((index % 2 ? 1 : -1) * 0.18);
        context.beginPath();
        context.moveTo(-radius, 2);
        context.lineTo(-radius * 0.25, -radius);
        context.lineTo(radius, -radius * 0.35);
        context.lineTo(radius * 0.55, radius);
        context.closePath();
        var facet = index % 3;
        context.fillStyle = facet === 0 ? "#f1d5bd" : facet === 1 ? "#bdc6ce" : "#d3a8bd";
        context.fill();
        context.strokeStyle = "rgba(255, 255, 255, 0.7)";
        context.lineWidth = 3;
        context.stroke();
        context.restore();
      });
    }

    function drawBotanicalOrnament(context, inner, brush) {
      context.save();
      var metallic = context.createLinearGradient(inner.x, inner.y, inner.x + inner.width, inner.y + inner.height);
      metallic.addColorStop(0, mixHex(brush, "#F4D27E", 0.72));
      metallic.addColorStop(0.45, "#9E671F");
      metallic.addColorStop(1, "#F5DF9A");
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

    function drawText(context, inner) {
      var text = personalText.value.trim() || "Your words here";
      context.save();
      context.fillStyle = rgba("#2C2523", text === "Your words here" ? 0.58 : 0.88);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = "500 44px Georgia, serif";
      var maxWidth = inner.width * 0.72;
      if (context.measureText(text).width > maxWidth) context.font = "500 34px Georgia, serif";
      context.fillText(text, inner.x + inner.width / 2, inner.y + inner.height * 0.54, maxWidth);
      context.restore();
    }

    function drawBorder(context, metrics) {
      var scalloped = borderStyle.value === "scalloped";
      context.save();
      traceShape(context, metrics, scalloped);
      if (borderStyle.value === "gold") {
        var gold = context.createLinearGradient(metrics.x, metrics.y, metrics.x + metrics.width, metrics.y + metrics.height);
        gold.addColorStop(0, "#f1d17c");
        gold.addColorStop(0.5, "#9e671f");
        gold.addColorStop(1, "#f5df9a");
        context.strokeStyle = gold;
        context.lineWidth = 24;
      } else {
        context.strokeStyle = borderStyle.value === "stones" ? "rgba(255, 250, 244, 0.86)" : "rgba(255, 250, 244, 0.7)";
        context.lineWidth = 18;
      }
      context.stroke();
      context.restore();
      if (borderStyle.value === "stones" || selectedDetails().indexOf("Stones") !== -1) drawStones(context, metrics);
    }

    function drawIllustrativeLabel(context) {
      context.save();
      context.fillStyle = "rgba(255, 250, 244, 0.82)";
      context.fillRect(36, 1135, 1128, 34);
      context.fillStyle = "#6F625D";
      context.font = "600 16px Helvetica Neue, Arial, sans-serif";
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillText("Illustrative preview · " + dimensionLabel() + " · Saloni confirms final size", 52, 1152);
      context.restore();
    }

    function renderPreview() {
      if (!sceneContext) return;
      updateFramePresetLabels();
      var metrics = frameMetrics();
      var inner = innerMetrics(metrics);
      sceneContext.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      var background = sceneContext.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      background.addColorStop(0, "#fffaf4");
      background.addColorStop(1, "#ead6cc");
      sceneContext.fillStyle = background;
      sceneContext.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      drawShadow(sceneContext, metrics);
      sceneContext.save();
      traceShape(sceneContext, metrics, borderStyle.value === "scalloped");
      sceneContext.fillStyle = "rgba(255, 250, 244, 0.32)";
      sceneContext.fill();
      sceneContext.restore();
      drawMarbling(sceneContext, inner, state.colors.filling, state.colors.brush);
      if (state.image && state.image.element.complete) {
        sceneContext.save();
        traceShape(sceneContext, inner, false);
        sceneContext.clip();
        drawCropCover(sceneContext, state.image.element, inner.x, inner.y, inner.width, inner.height);
        sceneContext.restore();
        drawResinOverlay(sceneContext, inner, state.colors.filling, state.colors.brush);
      }
      var details = selectedDetails();
      if (details.indexOf("Botanical ornament") !== -1) drawBotanicalOrnament(sceneContext, inner, state.colors.brush);
      if (details.indexOf("Pressed flowers and leaves") !== -1) drawPressedFlowers(sceneContext, inner);
      drawPaintStrokes(sceneContext, inner);
      drawText(sceneContext, inner);
      drawBorder(sceneContext, metrics);
      drawIllustrativeLabel(sceneContext);
      var label = dimensionLabel();
      frameDimensionLabel.textContent = label;
      previewDimensionLabel.textContent = label;
      sceneCanvas.setAttribute("aria-label", "Illustrative preview of " + label);
      updateSummary();
      updateDownloadState();
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
        "Personal text: " + (personalText.value.trim() || "None"),
        "Finishing touches: " + (details.length ? details.join(", ") : "None"),
        "Reference image: " + (state.image ? state.image.name : "None"),
        "Freehand paint: " + (state.strokes.length ? "Added locally" : "Not added")
      ].join("\n");
    }

    function updateDownloadState() {
      downloadPreview.disabled = state.imageLoading;
      if (state.imageLoading) downloadStatus.textContent = "Preparing preview while the reference image loads…";
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
        releaseImage(previous);
        setImageStatus("Reference image ready: " + file.name);
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
      };
      image.src = url;
    }

    function removeCurrentImage() {
      state.imageRequest += 1;
      releaseImage(state.image);
      state.image = null;
      state.imageLoading = false;
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
    }

    function currentInner() {
      return innerMetrics(frameMetrics());
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
      if (state.imageLoading) return;
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

    function resetCustomiser() {
      form.reset();
      state.strokes = [];
      state.cursor = { x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 };
      state.drawing = false;
      state.currentStroke = null;
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
    paintToggle.addEventListener("change", function () {
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
    sceneCanvas.addEventListener("pointerdown", beginPaint);
    sceneCanvas.addEventListener("pointermove", drawPaint);
    sceneCanvas.addEventListener("pointerup", endPaint);
    sceneCanvas.addEventListener("pointercancel", endPaint);
    sceneCanvas.addEventListener("keydown", keyboardPaint);
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
    reset.addEventListener("click", resetCustomiser);
    window.addEventListener("resize", renderPreview, { passive: true });

    updateBrushCursor();
    renderPreview();
  });
}());
