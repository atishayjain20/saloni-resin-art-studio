(function () {
  "use strict";

  var MAX_FILE_SIZE = 10 * 1024 * 1024;
  var ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
  var ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
  var FILLING_COLOURS = {
    lilac: "#c7a5cc",
    ocean: "#8aa9bf",
    peach: "#e5a18e",
    ivory: "#e5d2b7"
  };
  var BRUSH_COLOURS = {
    gold: "#d1a24b",
    rose: "#c96572",
    cocoa: "#7a4b36",
    ink: "#2c2523"
  };

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("customizer-form");
    if (!form) return;

    var frameType = document.getElementById("frame-type");
    var borderStyle = document.getElementById("border-style");
    var frameSize = document.getElementById("frame-size");
    var fillingColour = document.getElementById("filling-colour");
    var brushColour = document.getElementById("brush-colour");
    var personalText = document.getElementById("personal-text");
    var referenceImage = document.getElementById("reference-image");
    var imageStatus = document.getElementById("image-status");
    var imageActions = document.getElementById("image-actions");
    var replaceImage = document.getElementById("replace-image");
    var removeImage = document.getElementById("remove-image");
    var paintToggle = document.getElementById("paint-toggle");
    var paintTools = document.getElementById("paint-tools");
    var paintColour = document.getElementById("paint-colour");
    var paintClear = document.getElementById("paint-clear");
    var copySummary = document.getElementById("copy-summary");
    var copyStatus = document.getElementById("copy-status");
    var reset = document.getElementById("customizer-reset");
    var previewFrame = document.getElementById("preview-frame");
    var previewBorder = document.getElementById("preview-border");
    var previewArt = document.getElementById("preview-art");
    var previewFilling = document.getElementById("preview-filling");
    var previewText = document.getElementById("preview-personal-text");
    var previewDetails = document.getElementById("preview-detail-list");
    var previewImage = document.getElementById("reference-preview");
    var summaryOutput = document.getElementById("customizer-summary");
    var canvas = document.getElementById("paint-canvas");
    var state = { imageUrl: "", imageName: "", paintHasMarks: false };
    var context = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    var canvasScale = 1;
    var drawing = false;

    form.addEventListener("submit", function (event) {
      event.preventDefault();
    });

    function selectedText(select) {
      return select.options[select.selectedIndex].textContent.trim();
    }

    function selectedDetails() {
      return Array.prototype.slice.call(form.querySelectorAll('input[name="details"]:checked')).map(function (input) {
        return input.value;
      });
    }

    function imageLabel() {
      return state.imageName || "None";
    }

    function summaryText() {
      var details = selectedDetails();
      return [
        "Custom resin frame",
        "Frame: " + selectedText(frameType),
        "Border: " + selectedText(borderStyle),
        "Size: " + selectedText(frameSize),
        "Filling colour: " + selectedText(fillingColour),
        "Brush colour: " + selectedText(brushColour),
        "Personal text: " + (personalText.value.trim() || "None"),
        "Finishing touches: " + (details.length ? details.join(", ") : "None"),
        "Reference image: " + imageLabel(),
        "Freehand paint: " + (paintToggle.checked && state.paintHasMarks ? "Added locally" : "Not added")
      ].join("\n");
    }

    function updateSummary() {
      summaryOutput.textContent = summaryText();
    }

    function updatePreview() {
      previewFrame.dataset.shape = frameType.value;
      previewFrame.dataset.size = frameSize.value;
      previewBorder.dataset.border = borderStyle.value;
      previewFilling.style.setProperty("--preview-fill", FILLING_COLOURS[fillingColour.value]);
      previewFilling.style.setProperty("--preview-brush", BRUSH_COLOURS[brushColour.value]);
      previewText.textContent = personalText.value.trim() || "Your words here";
      var details = selectedDetails();
      previewDetails.textContent = details.length ? details.join(" · ") : "Choose a finishing touch";
      if (paintToggle.checked) canvasSize();
      updateSummary();
    }

    function setImageStatus(message) {
      imageStatus.textContent = message;
    }

    function releaseImageUrl() {
      if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
      state.imageUrl = "";
    }

    function clearImage(message) {
      releaseImageUrl();
      state.imageName = "";
      referenceImage.value = "";
      previewImage.removeAttribute("src");
      previewImage.alt = "";
      previewImage.hidden = true;
      imageActions.hidden = true;
      setImageStatus(message || "No reference image selected.");
      updateSummary();
    }

    function extensionFor(fileName) {
      var pieces = fileName.toLowerCase().split(".");
      return pieces.length > 1 ? pieces.pop() : "";
    }

    function isAllowedImage(file) {
      return ALLOWED_TYPES.indexOf(file.type.toLowerCase()) !== -1 || ALLOWED_EXTENSIONS.indexOf(extensionFor(file.name)) !== -1;
    }

    function handleImage(event) {
      var file = event.target.files && event.target.files[0];
      if (!file) {
        clearImage("No reference image selected.");
        return;
      }
      if (!isAllowedImage(file)) {
        clearImage("That file is not supported. Choose a JPEG, PNG, or WebP image.");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        clearImage("That image is larger than 10MB. Choose a smaller file.");
        return;
      }

      releaseImageUrl();
      state.imageName = file.name;
      state.imageUrl = URL.createObjectURL(file);
      imageActions.hidden = false;
      setImageStatus("Loading reference image…");
      previewImage.onload = function () {
        setImageStatus("Reference image ready: " + file.name);
        updateSummary();
      };
      previewImage.onerror = function () {
        clearImage("That image could not be loaded. Choose another file.");
      };
      previewImage.alt = "Local reference preview: " + file.name;
      previewImage.hidden = false;
      previewImage.src = state.imageUrl;
      updateSummary();
    }

    function canvasSize() {
      if (!context || !paintToggle.checked) return;
      var bounds = previewArt.getBoundingClientRect();
      canvasScale = Math.max(1, window.devicePixelRatio || 1);
      var nextWidth = Math.max(1, Math.round(bounds.width * canvasScale));
      var nextHeight = Math.max(1, Math.round(bounds.height * canvasScale));
      var needsResize = canvas.width !== nextWidth || canvas.height !== nextHeight;
      var snapshot = null;
      if (needsResize && state.paintHasMarks) {
        snapshot = document.createElement("canvas");
        snapshot.width = canvas.width;
        snapshot.height = canvas.height;
        var snapshotContext = snapshot.getContext("2d");
        if (snapshotContext) snapshotContext.drawImage(canvas, 0, 0);
      }
      if (needsResize) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }
      context.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 4;
      context.strokeStyle = paintColour.value;
      if (snapshot) {
        context.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, nextWidth / canvasScale, nextHeight / canvasScale);
      }
    }

    function clearPaint() {
      if (context) {
        context.clearRect(0, 0, canvas.width / canvasScale, canvas.height / canvasScale);
      }
      state.paintHasMarks = false;
      updateSummary();
    }

    function pointFor(event) {
      var bounds = canvas.getBoundingClientRect();
      return {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top
      };
    }

    function beginPaint(event) {
      if (!paintToggle.checked || !context) return;
      event.preventDefault();
      drawing = true;
      canvas.setPointerCapture(event.pointerId);
      var point = pointFor(event);
      context.strokeStyle = paintColour.value;
      context.beginPath();
      context.moveTo(point.x, point.y);
    }

    function drawPaint(event) {
      if (!drawing || !context) return;
      event.preventDefault();
      var point = pointFor(event);
      context.lineTo(point.x, point.y);
      context.stroke();
      state.paintHasMarks = true;
    }

    function endPaint() {
      drawing = false;
      updateSummary();
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

    function copiedMessage(success) {
      copyStatus.textContent = success
        ? "Summary copied. Attach your image or a screenshot separately."
        : "Copy is unavailable here. Select the summary above and copy it manually.";
    }

    function copySummaryText() {
      var text = summaryText();
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(text).then(function () {
          copiedMessage(true);
        }).catch(function () {
          copiedMessage(fallbackCopy(text));
        });
        return;
      }
      copiedMessage(fallbackCopy(text));
    }

    function togglePaint() {
      var enabled = paintToggle.checked;
      paintTools.hidden = !enabled;
      canvas.hidden = !enabled;
      canvas.setAttribute("aria-hidden", enabled ? "false" : "true");
      drawing = false;
      if (enabled) canvasSize();
      updateSummary();
    }

    referenceImage.addEventListener("change", handleImage);
    replaceImage.addEventListener("click", function () {
      referenceImage.value = "";
      referenceImage.click();
    });
    removeImage.addEventListener("click", function () {
      clearImage("Reference image removed.");
    });
    paintToggle.addEventListener("change", togglePaint);
    paintClear.addEventListener("click", clearPaint);
    canvas.addEventListener("pointerdown", beginPaint);
    canvas.addEventListener("pointermove", drawPaint);
    canvas.addEventListener("pointerup", endPaint);
    canvas.addEventListener("pointercancel", endPaint);
    form.addEventListener("input", updatePreview);
    form.addEventListener("change", updatePreview);
    copySummary.addEventListener("click", copySummaryText);
    reset.addEventListener("click", function () {
      form.reset();
      clearImage("No reference image selected.");
      paintTools.hidden = true;
      canvas.hidden = true;
      canvas.setAttribute("aria-hidden", "true");
      clearPaint();
      copyStatus.textContent = "";
      updatePreview();
    });
    window.addEventListener("resize", function () {
      if (paintToggle.checked) canvasSize();
    }, { passive: true });

    clearImage("No reference image selected.");
    canvas.setAttribute("aria-hidden", "true");
    updatePreview();
  });
}());
