(function () {
  "use strict";

  var textInput = document.getElementById("text-input");
  var makeBtn = document.getElementById("make-pdf-btn");
  var statusEl = document.getElementById("status-message");

  function setStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", Boolean(isError));
  }

  function createPdf(text) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "mm", format: "a4" });

    doc.setFont("Pretendard", "normal");
    doc.setFontSize(14);

    var marginX = 20;
    var marginTop = 20;
    var marginBottom = 20;
    var pageWidth = doc.internal.pageSize.getWidth();
    var pageHeight = doc.internal.pageSize.getHeight();
    var maxWidth = pageWidth - marginX * 2;
    var lineHeight = 8;

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

    var y = marginTop;
    lines.forEach(function (line) {
      if (y > pageHeight - marginBottom) {
        doc.addPage();
        y = marginTop;
      }
      doc.text(line, marginX, y);
      y += lineHeight;
    });

    return doc;
  }

  makeBtn.addEventListener("click", function () {
    var text = textInput.value;

    if (!text || !text.trim()) {
      setStatus("먼저 텍스트를 입력해주세요.", true);
      return;
    }

    try {
      setStatus("PDF를 만드는 중...");
      var doc = createPdf(text);
      doc.save("필사메이커.pdf");
      setStatus("PDF가 저장되었습니다.");
    } catch (err) {
      console.error(err);
      setStatus("PDF 생성 중 오류가 발생했습니다: " + err.message, true);
    }
  });
})();
