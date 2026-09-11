(function () {
  "use strict";

  var textInput = document.getElementById("text-input");
  var coverTitleInput = document.getElementById("cover-title-input");
  var makeBtn = document.getElementById("make-pdf-btn");
  var statusEl = document.getElementById("status-message");

  var FONT_NAME = "Pretendard";
  var FONT_SIZE = 14; // pt, body text
  var FOOTER_FONT_SIZE = 9; // pt, page number
  var LINE_HEIGHT_MULTIPLIER = 1.8; // spacing between guide-line slots, relative to font size
  var GUIDE_LINE_GAP_MM = 1; // gap below the text baseline where the rule is drawn
  var GUIDE_LINE_WIDTH_MM = 0.2;

  var COVER_TITLE_FONT_SIZE = 26; // pt
  var COVER_WORDMARK_FONT_SIZE = 10; // pt
  var COVER_FRAME_LINE_WIDTH_MM = 0.6;
  var COVER_DECOR_LINE_WIDTH_MM = 0.4;
  var COVER_DECOR_HALF_WIDTH_MM = 22; // half-length of the decorative lines around the title
  var COVER_DECOR_GAP_MM = 10; // gap between the decorative lines and the title text
  var DEFAULT_COVER_TITLE = "나의 문장들";

  // Each palette gives a strong "accent" color for the cover frame/title/page
  // numbers, and a light "guideline" tint so the ruled lines read as part of
  // the same color story instead of plain gray.
  var PALETTES = {
    sage: { label: "세이지그린", accent: [106, 138, 101], guideline: [211, 224, 206] },
    beige: { label: "웜베이지", accent: [168, 124, 79], guideline: [237, 221, 199] },
    rose: { label: "더스티로즈", accent: [176, 115, 118], guideline: [240, 217, 218] },
    charcoal: { label: "차콜", accent: [74, 74, 74], guideline: [214, 214, 214] },
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

  function wrapTextLines(doc, text, maxWidth) {
    var rawLines = text.split(/\r\n|\r|\n/);
    var lines = [];
    rawLines.forEach(function (rawLine) {
      if (rawLine.length === 0) {
        lines.push("");
        return;
      }
      var wrapped = doc.splitTextToSize(rawLine, maxWidth);
      wrapped.forEach(function (w) {
        lines.push(w);
      });
    });
    return lines;
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
    var jsPDF = window.jspdf.jsPDF;
    var pageConfig = PAGE_FORMATS[options.pageSize] || PAGE_FORMATS.a4;
    var lineStyle = options.lineStyle === "plain" ? "plain" : "ruled";
    var palette = options.palette;
    var coverTitle = options.coverTitle || DEFAULT_COVER_TITLE;

    var doc = new jsPDF({ unit: "mm", format: pageConfig.format });

    var margin = pageConfig.margin;
    var pageWidth = doc.internal.pageSize.getWidth();
    var pageHeight = doc.internal.pageSize.getHeight();
    var maxWidth = pageWidth - margin * 2;
    var contentBottom = pageHeight - margin;

    // Page 1 (already created by `new jsPDF()`) is the cover; page numbers
    // start counting from the first page of the transcription body.
    drawCoverPage(doc, pageWidth, pageHeight, margin, palette, coverTitle);

    doc.setFont(FONT_NAME, "normal");
    doc.setFontSize(FONT_SIZE);
    var lineHeightMm = mmFromPt(FONT_SIZE) * LINE_HEIGHT_MULTIPLIER;

    // Fixed grid of baseline Y positions, reused identically on every page
    // regardless of line style, so pagination doesn't shift between the
    // two line-style options.
    var slots = [];
    var y = margin + lineHeightMm;
    while (y <= contentBottom) {
      slots.push(y);
      y += lineHeightMm;
    }

    var wrappedLines = wrapTextLines(doc, text, maxWidth);
    var totalPages = Math.max(1, Math.ceil(wrappedLines.length / slots.length));

    for (var pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      doc.addPage();

      if (lineStyle === "ruled") {
        doc.setDrawColor(palette.guideline[0], palette.guideline[1], palette.guideline[2]);
        doc.setLineWidth(GUIDE_LINE_WIDTH_MM);
        slots.forEach(function (slotY) {
          doc.line(margin, slotY + GUIDE_LINE_GAP_MM, pageWidth - margin, slotY + GUIDE_LINE_GAP_MM);
        });
      }

      doc.setFont(FONT_NAME, "normal");
      doc.setFontSize(FONT_SIZE);
      doc.setTextColor(0, 0, 0);

      var chunk = wrappedLines.slice(pageIndex * slots.length, (pageIndex + 1) * slots.length);
      chunk.forEach(function (line, idx) {
        if (line.length > 0) {
          doc.text(line, margin, slots[idx]);
        }
      });

      doc.setFont(FONT_NAME, "normal");
      doc.setFontSize(FOOTER_FONT_SIZE);
      doc.setTextColor(palette.accent[0], palette.accent[1], palette.accent[2]);
      var footerY = pageHeight - margin / 2;
      doc.text(String(pageIndex + 1) + " / " + totalPages, pageWidth / 2, footerY, { align: "center" });
    }

    return doc;
  }

  document.querySelectorAll('input[name="palette"]').forEach(function (input) {
    input.addEventListener("change", function () {
      applyPaletteTheme(getSelectedPalette());
    });
  });
  applyPaletteTheme(getSelectedPalette());

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
