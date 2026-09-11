(function () {
  "use strict";

  var textInput = document.getElementById("text-input");
  var makeBtn = document.getElementById("make-pdf-btn");
  var statusEl = document.getElementById("status-message");

  var FONT_NAME = "Pretendard";
  var FONT_SIZE = 14; // pt, body text
  var FOOTER_FONT_SIZE = 9; // pt, page number
  var LINE_HEIGHT_MULTIPLIER = 1.8; // spacing between guide-line slots, relative to font size
  var GUIDE_LINE_GAP_MM = 1; // gap below the text baseline where the rule is drawn
  var GUIDE_LINE_COLOR = [200, 200, 200];
  var GUIDE_LINE_WIDTH_MM = 0.2;
  var FOOTER_TEXT_COLOR = [130, 130, 130];

  // Page-size-dependent defaults. Margins are chosen automatically so the
  // user doesn't have to configure them in this stage.
  var PAGE_FORMATS = {
    a4: { format: "a4", margin: 20 },
    a5: { format: "a5", margin: 15 },
  };

  function mmFromPt(pt) {
    return pt * 0.3528;
  }

  function setStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", Boolean(isError));
  }

  function getSelectedValue(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
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

  function createPdf(text, options) {
    var jsPDF = window.jspdf.jsPDF;
    var pageConfig = PAGE_FORMATS[options.pageSize] || PAGE_FORMATS.a4;
    var lineStyle = options.lineStyle === "plain" ? "plain" : "ruled";

    var doc = new jsPDF({ unit: "mm", format: pageConfig.format });

    doc.setFont(FONT_NAME, "normal");
    doc.setFontSize(FONT_SIZE);

    var margin = pageConfig.margin;
    var pageWidth = doc.internal.pageSize.getWidth();
    var pageHeight = doc.internal.pageSize.getHeight();
    var maxWidth = pageWidth - margin * 2;
    var contentBottom = pageHeight - margin;

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
      if (pageIndex > 0) {
        doc.addPage();
      }

      if (lineStyle === "ruled") {
        doc.setDrawColor(GUIDE_LINE_COLOR[0], GUIDE_LINE_COLOR[1], GUIDE_LINE_COLOR[2]);
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
      doc.setTextColor(FOOTER_TEXT_COLOR[0], FOOTER_TEXT_COLOR[1], FOOTER_TEXT_COLOR[2]);
      var footerY = pageHeight - margin / 2;
      doc.text(String(pageIndex + 1) + " / " + totalPages, pageWidth / 2, footerY, { align: "center" });
    }

    return doc;
  }

  makeBtn.addEventListener("click", function () {
    var text = textInput.value;

    if (!text || !text.trim()) {
      setStatus("먼저 텍스트를 입력해주세요.", true);
      return;
    }

    var pageSize = getSelectedValue("page-size") || "a4";
    var lineStyle = getSelectedValue("line-style") || "ruled";

    try {
      setStatus("PDF를 만드는 중...");
      var doc = createPdf(text, { pageSize: pageSize, lineStyle: lineStyle });
      doc.save("필사메이커.pdf");
      setStatus("PDF가 저장되었습니다.");
    } catch (err) {
      console.error(err);
      setStatus("PDF 생성 중 오류가 발생했습니다: " + err.message, true);
    }
  });
})();
