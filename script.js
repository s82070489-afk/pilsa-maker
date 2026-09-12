(function () {
  "use strict";

  var textInput = document.getElementById("text-input");
  var coverTitleInput = document.getElementById("cover-title-input");
  var makeBtn = document.getElementById("make-pdf-btn");
  var statusEl = document.getElementById("status-message");
  var sidebarToggle = document.getElementById("sidebar-toggle");
  var sidebarSettings = document.getElementById("sidebar-settings");

  var coverSheetEl = document.getElementById("preview-cover");
  var coverFrameEl = document.getElementById("cover-frame");
  var coverTitleEl = document.getElementById("cover-title-preview");
  var coverWordmarkEl = coverSheetEl.querySelector(".cover-wordmark");
  var coverDecorTopEl = coverSheetEl.querySelector(".cover-decor-top");
  var coverDecorBottomEl = coverSheetEl.querySelector(".cover-decor-bottom");

  var bodySheetEl = document.getElementById("preview-body");
  var bodyContentEl = document.getElementById("body-content");
  var bodyFooterEl = document.getElementById("body-footer-preview");

  var FONT_NAME = "Pretendard";
  var FONT_SIZE = 14; // pt, reference size used to size the handwriting row
  var ORIGINAL_FONT_SIZE = 10; // pt, the printed original-text line above each blank row
  var FOOTER_FONT_SIZE = 9; // pt, page number
  var LINE_HEIGHT_MULTIPLIER = 1.8; // handwriting-row height, relative to FONT_SIZE
  var GAP_TEXT_TO_RULE_MM = 4; // gap from the original text's baseline down to the blank rule
  var PAIR_GAP_MM = 4; // gap after the blank rule before the next pair's original text
  var PAIR_TOP_OFFSET_MM = 5; // breathing room between the top margin and the first pair
  var GUIDE_LINE_WIDTH_MM = 0.2;

  var COVER_TITLE_FONT_SIZE = 26; // pt
  var COVER_WORDMARK_FONT_SIZE = 10; // pt
  var COVER_FRAME_LINE_WIDTH_MM = 0.6;
  var COVER_DECOR_LINE_WIDTH_MM = 0.4;
  var COVER_DECOR_HALF_WIDTH_MM = 22; // half-length of the decorative lines around the title
  var COVER_DECOR_GAP_MM = 10; // gap between the decorative lines and the title text
  var DEFAULT_COVER_TITLE = "나의 문장들";

  // Each palette gives a strong "accent" color for the cover frame/title/page
  // numbers, a mid-tone "original" color for the printed reference line the
  // user copies from, and a light "guideline" tint for the blank rule below
  // it -- so the whole page reads as one color story instead of plain gray.
  var PALETTES = {
    sage: { label: "세이지그린", accent: [106, 138, 101], original: [159, 181, 154], guideline: [211, 224, 206] },
    beige: { label: "웜베이지", accent: [168, 124, 79], original: [203, 173, 139], guideline: [237, 221, 199] },
    rose: { label: "더스티로즈", accent: [176, 115, 118], original: [208, 166, 168], guideline: [240, 217, 218] },
    charcoal: { label: "차콜", accent: [74, 74, 74], original: [144, 144, 144], guideline: [214, 214, 214] },
  };

  // Page-size-dependent defaults. Margins are chosen automatically so the
  // user doesn't have to configure them in this stage.
  var PAGE_FORMATS = {
    a4: { format: "a4", margin: 20 },
    a5: { format: "a5", margin: 15 },
  };

  function mmFromPt(pt) {
    return pt * 0.3528;
  }

  function rgbToCss(rgb) {
    return "rgb(" + rgb[0] + ", " + rgb[1] + ", " + rgb[2] + ")";
  }

  function rgbToHex(rgb) {
    return (
      "#" +
      rgb
        .map(function (c) {
          return c.toString(16).padStart(2, "0");
        })
        .join("")
    );
  }

  function setStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", Boolean(isError));
  }

  function getSelectedValue(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }

  function getSelectedPalette() {
    var id = getSelectedValue("palette") || "sage";
    return PALETTES[id] || PALETTES.sage;
  }

  function applyPaletteTheme(palette) {
    var root = document.documentElement.style;
    root.setProperty("--accent", rgbToHex(palette.accent));
    root.setProperty("--accent-soft", rgbToHex(palette.guideline));
  }

  function splitIntoSentences(text) {
    var paragraphs = text.split(/\r\n|\r|\n/);
    var sentences = [];
    paragraphs.forEach(function (paragraph) {
      // Break after each '.', '!' or '?' so every sentence becomes its own
      // transcription line, on top of the line breaks already in the input.
      var parts = paragraph.split(/(?<=[.!?])\s*/);
      parts.forEach(function (part) {
        var trimmed = part.trim();
        if (trimmed.length > 0) {
          sentences.push(trimmed);
        }
      });
    });
    return sentences;
  }

  function buildOriginalLines(doc, text, maxWidth) {
    var sentences = splitIntoSentences(text);
    var lines = [];
    sentences.forEach(function (sentence) {
      var wrapped = doc.splitTextToSize(sentence, maxWidth);
      wrapped.forEach(function (w) {
        lines.push(w);
      });
    });
    return lines;
  }

  // Pure layout/measurement step shared by the real PDF export and the
  // on-screen live preview, so both always agree on page size, margins,
  // and where every line of text and every blank rule actually falls.
  function computeLayout(text, options) {
    var jsPDF = window.jspdf.jsPDF;
    var pageConfig = PAGE_FORMATS[options.pageSize] || PAGE_FORMATS.a4;

    var doc = new jsPDF({ unit: "mm", format: pageConfig.format });

    var margin = pageConfig.margin;
    var pageWidth = doc.internal.pageSize.getWidth();
    var pageHeight = doc.internal.pageSize.getHeight();
    var maxWidth = pageWidth - margin * 2;
    var contentBottom = pageHeight - margin;

    doc.setFont(FONT_NAME, "normal");
    doc.setFontSize(ORIGINAL_FONT_SIZE);

    var handwritingRowMm = mmFromPt(FONT_SIZE) * LINE_HEIGHT_MULTIPLIER;
    var pairPitchMm = GAP_TEXT_TO_RULE_MM + handwritingRowMm + PAIR_GAP_MM;

    // Fixed grid of [original-text baseline, blank-rule Y] pairs, reused
    // identically on every page regardless of line style, so pagination
    // doesn't shift between the two line-style options.
    var pairSlots = [];
    var pairIndex = 0;
    while (true) {
      var textY = margin + PAIR_TOP_OFFSET_MM + pairIndex * pairPitchMm;
      var ruleY = textY + GAP_TEXT_TO_RULE_MM;
      if (ruleY > contentBottom) {
        break;
      }
      pairSlots.push({ textY: textY, ruleY: ruleY });
      pairIndex++;
    }

    var originalLines = buildOriginalLines(doc, text, maxWidth);
    var totalPages = Math.max(1, Math.ceil(originalLines.length / pairSlots.length));

    return {
      doc: doc,
      margin: margin,
      pageWidth: pageWidth,
      pageHeight: pageHeight,
      pairSlots: pairSlots,
      originalLines: originalLines,
      totalPages: totalPages,
    };
  }

  function drawCoverPage(doc, pageWidth, pageHeight, margin, palette, title) {
    var accent = palette.accent;

    doc.setDrawColor(accent[0], accent[1], accent[2]);
    doc.setLineWidth(COVER_FRAME_LINE_WIDTH_MM);
    doc.rect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2);

    var centerX = pageWidth / 2;
    var centerY = pageHeight / 2;

    doc.setLineWidth(COVER_DECOR_LINE_WIDTH_MM);
    doc.line(centerX - COVER_DECOR_HALF_WIDTH_MM, centerY - COVER_DECOR_GAP_MM, centerX + COVER_DECOR_HALF_WIDTH_MM, centerY - COVER_DECOR_GAP_MM);
    doc.line(centerX - COVER_DECOR_HALF_WIDTH_MM, centerY + COVER_DECOR_GAP_MM, centerX + COVER_DECOR_HALF_WIDTH_MM, centerY + COVER_DECOR_GAP_MM);

    doc.setFont(FONT_NAME, "normal");
    doc.setFontSize(COVER_TITLE_FONT_SIZE);
    doc.setTextColor(accent[0], accent[1], accent[2]);
    doc.text(title, centerX, centerY, { align: "center", baseline: "middle" });

    doc.setFontSize(COVER_WORDMARK_FONT_SIZE);
    doc.text("필사메이커", centerX, pageHeight - margin - 8, { align: "center" });
  }

  function createPdf(text, options) {
    var lineStyle = options.lineStyle === "plain" ? "plain" : "ruled";
    var palette = options.palette;
    var coverTitle = options.coverTitle || DEFAULT_COVER_TITLE;

    var layout = computeLayout(text, options);
    var doc = layout.doc;
    var margin = layout.margin;
    var pageWidth = layout.pageWidth;
    var pageHeight = layout.pageHeight;
    var pairSlots = layout.pairSlots;
    var originalLines = layout.originalLines;
    var totalPages = layout.totalPages;

    // Page 1 (already created by `new jsPDF()`) is the cover; page numbers
    // start counting from the first page of the transcription body.
    drawCoverPage(doc, pageWidth, pageHeight, margin, palette, coverTitle);

    for (var pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      doc.addPage();

      var chunk = originalLines.slice(pageIndex * pairSlots.length, (pageIndex + 1) * pairSlots.length);

      doc.setFont(FONT_NAME, "normal");
      doc.setFontSize(ORIGINAL_FONT_SIZE);
      doc.setTextColor(palette.original[0], palette.original[1], palette.original[2]);
      chunk.forEach(function (line, idx) {
        doc.text(line, margin, pairSlots[idx].textY);
      });

      if (lineStyle === "ruled") {
        doc.setDrawColor(palette.guideline[0], palette.guideline[1], palette.guideline[2]);
        doc.setLineWidth(GUIDE_LINE_WIDTH_MM);
        pairSlots.forEach(function (slot) {
          doc.line(margin, slot.ruleY, pageWidth - margin, slot.ruleY);
        });
      }

      doc.setFont(FONT_NAME, "normal");
      doc.setFontSize(FOOTER_FONT_SIZE);
      doc.setTextColor(palette.accent[0], palette.accent[1], palette.accent[2]);
      var footerY = pageHeight - margin / 2;
      doc.text(String(pageIndex + 1) + " / " + totalPages, pageWidth / 2, footerY, { align: "center" });
    }

    return doc;
  }

  // ---------- live on-screen preview (plain HTML/CSS, mirrors computeLayout) ----------

  function pxPerMm(sheetEl, pageWidthMm) {
    var renderedWidth = sheetEl.getBoundingClientRect().width;
    return renderedWidth > 0 ? renderedWidth / pageWidthMm : 0;
  }

  function renderCoverPreview(layout, palette, title) {
    var pageWidth = layout.pageWidth;
    var pageHeight = layout.pageHeight;
    var margin = layout.margin;

    coverSheetEl.style.aspectRatio = pageWidth + " / " + pageHeight;
    var scale = pxPerMm(coverSheetEl, pageWidth);
    var accentCss = rgbToCss(palette.accent);

    coverFrameEl.style.top = (margin / pageHeight) * 100 + "%";
    coverFrameEl.style.bottom = (margin / pageHeight) * 100 + "%";
    coverFrameEl.style.left = (margin / pageWidth) * 100 + "%";
    coverFrameEl.style.right = (margin / pageWidth) * 100 + "%";
    coverFrameEl.style.borderStyle = "solid";
    coverFrameEl.style.borderColor = accentCss;
    coverFrameEl.style.borderWidth = Math.max(1, COVER_FRAME_LINE_WIDTH_MM * scale) + "px";

    var centerYPct = 50;
    var decorTopPct = ((pageHeight / 2 - COVER_DECOR_GAP_MM) / pageHeight) * 100;
    var decorBottomPct = ((pageHeight / 2 + COVER_DECOR_GAP_MM) / pageHeight) * 100;
    var decorWidthPct = ((COVER_DECOR_HALF_WIDTH_MM * 2) / pageWidth) * 100;
    var decorBorderPx = Math.max(1, COVER_DECOR_LINE_WIDTH_MM * scale);

    [coverDecorTopEl, coverDecorBottomEl].forEach(function (el, i) {
      el.style.top = (i === 0 ? decorTopPct : decorBottomPct) + "%";
      el.style.left = "50%";
      el.style.width = decorWidthPct + "%";
      el.style.transform = "translateX(-50%)";
      el.style.borderTop = decorBorderPx + "px solid " + accentCss;
    });

    coverTitleEl.textContent = title;
    coverTitleEl.style.top = centerYPct + "%";
    coverTitleEl.style.left = "50%";
    coverTitleEl.style.transform = "translate(-50%, -50%)";
    coverTitleEl.style.color = accentCss;
    coverTitleEl.style.fontSize = mmFromPt(COVER_TITLE_FONT_SIZE) * scale + "px";

    var wordmarkTopPct = ((pageHeight - margin - 8) / pageHeight) * 100;
    coverWordmarkEl.style.top = wordmarkTopPct + "%";
    coverWordmarkEl.style.left = "50%";
    coverWordmarkEl.style.transform = "translate(-50%, -50%)";
    coverWordmarkEl.style.color = accentCss;
    coverWordmarkEl.style.fontSize = mmFromPt(COVER_WORDMARK_FONT_SIZE) * scale + "px";
  }

  function renderBodyPreview(layout, palette, lineStyle) {
    var pageWidth = layout.pageWidth;
    var pageHeight = layout.pageHeight;
    var margin = layout.margin;
    var pairSlots = layout.pairSlots;
    var originalLines = layout.originalLines;

    bodySheetEl.style.aspectRatio = pageWidth + " / " + pageHeight;
    var scale = pxPerMm(bodySheetEl, pageWidth);

    bodyContentEl.style.left = (margin / pageWidth) * 100 + "%";
    bodyContentEl.style.right = (margin / pageWidth) * 100 + "%";
    bodyContentEl.innerHTML = "";

    var firstPageLines = originalLines.slice(0, pairSlots.length);
    var originalFontPx = mmFromPt(ORIGINAL_FONT_SIZE) * scale;
    var ruleBorderPx = Math.max(1, GUIDE_LINE_WIDTH_MM * scale);
    var ruleCss = lineStyle === "ruled" ? rgbToCss(palette.guideline) : "transparent";
    var textCss = rgbToCss(palette.original);

    var fragment = document.createDocumentFragment();
    pairSlots.forEach(function (slot, idx) {
      var line = firstPageLines[idx] || "";
      if (line) {
        var textEl = document.createElement("div");
        textEl.className = "pair-text";
        textEl.textContent = line;
        textEl.style.top = (slot.textY / pageHeight) * 100 + "%";
        textEl.style.fontSize = originalFontPx + "px";
        textEl.style.color = textCss;
        fragment.appendChild(textEl);
      }

      var ruleEl = document.createElement("div");
      ruleEl.className = "pair-rule";
      ruleEl.style.top = (slot.ruleY / pageHeight) * 100 + "%";
      ruleEl.style.borderBottomWidth = ruleBorderPx + "px";
      ruleEl.style.borderBottomColor = ruleCss;
      fragment.appendChild(ruleEl);
    });
    bodyContentEl.appendChild(fragment);

    var footerY = pageHeight - margin / 2;
    bodyFooterEl.textContent = "1 / " + layout.totalPages;
    bodyFooterEl.style.top = (footerY / pageHeight) * 100 + "%";
    bodyFooterEl.style.transform = "translateY(-50%)";
    bodyFooterEl.style.fontSize = mmFromPt(FOOTER_FONT_SIZE) * scale + "px";
    bodyFooterEl.style.color = rgbToCss(palette.accent);
  }

  function updatePreview() {
    var pageSize = getSelectedValue("page-size") || "a4";
    var lineStyle = getSelectedValue("line-style") || "ruled";
    var palette = getSelectedPalette();
    var coverTitle = (coverTitleInput.value || "").trim() || DEFAULT_COVER_TITLE;
    var text = textInput.value || "";

    var layout = computeLayout(text, { pageSize: pageSize });
    renderCoverPreview(layout, palette, coverTitle);
    renderBodyPreview(layout, palette, lineStyle);
  }

  var previewUpdateTimer = null;
  function schedulePreviewUpdate() {
    clearTimeout(previewUpdateTimer);
    previewUpdateTimer = setTimeout(updatePreview, 120);
  }

  document.querySelectorAll('input[name="palette"]').forEach(function (input) {
    input.addEventListener("change", function () {
      applyPaletteTheme(getSelectedPalette());
      updatePreview();
    });
  });
  document.querySelectorAll('input[name="page-size"], input[name="line-style"]').forEach(function (input) {
    input.addEventListener("change", updatePreview);
  });
  coverTitleInput.addEventListener("input", schedulePreviewUpdate);
  textInput.addEventListener("input", schedulePreviewUpdate);
  window.addEventListener("resize", schedulePreviewUpdate);

  sidebarToggle.addEventListener("click", function () {
    var expanded = sidebarSettings.classList.toggle("expanded");
    sidebarToggle.setAttribute("aria-expanded", String(expanded));
  });

  applyPaletteTheme(getSelectedPalette());
  updatePreview();

  makeBtn.addEventListener("click", function () {
    var text = textInput.value;

    if (!text || !text.trim()) {
      setStatus("먼저 텍스트를 입력해주세요.", true);
      return;
    }

    var pageSize = getSelectedValue("page-size") || "a4";
    var lineStyle = getSelectedValue("line-style") || "ruled";
    var palette = getSelectedPalette();
    var coverTitle = (coverTitleInput.value || "").trim() || DEFAULT_COVER_TITLE;

    try {
      setStatus("PDF를 만드는 중...");
      var doc = createPdf(text, { pageSize: pageSize, lineStyle: lineStyle, palette: palette, coverTitle: coverTitle });
      doc.save("필사메이커.pdf");
      setStatus("PDF가 저장되었습니다.");
    } catch (err) {
      console.error(err);
      setStatus("PDF 생성 중 오류가 발생했습니다: " + err.message, true);
    }
  });
})();
