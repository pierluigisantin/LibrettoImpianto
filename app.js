
const PDFLib = window["PDFLib"];
const pdfjsLib = window["pdfjs-dist/build/pdf"];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

let originalPdfBytes = null;
let formFieldMap = {};
let currentPage = 1;
let totalPages = 0;
let pdfDocGlobal = null;
let scale = 1.5;

document.getElementById("file-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const arrayBuffer = await file.arrayBuffer();
  const original = new Uint8Array(arrayBuffer);
  originalPdfBytes = original.slice();
  pdfDocGlobal = await pdfjsLib.getDocument({ data: original }).promise;
  totalPages = pdfDocGlobal.numPages;
  currentPage = 1;
  await renderPage(currentPage);
});

document.getElementById("prev-page").addEventListener("click", async () => {
  if (currentPage > 1) {
    currentPage--;
    await renderPage(currentPage);
  }
});
document.getElementById("next-page").addEventListener("click", async () => {
  if (currentPage < totalPages) {
    currentPage++;
    await renderPage(currentPage);
  }
});

async function renderPage(pageNum) {
  const page = await pdfDocGlobal.getPage(pageNum);
  const container = document.getElementById("pdf-container");
  container.innerHTML = "";

  const viewport = page.getViewport({ scale });

  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.width = viewport.width + "px";
  wrapper.style.height = viewport.height + "px";

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.className = "pdf-page";

  const context = canvas.getContext("2d");
  const renderContext = {
    canvasContext: context,
    viewport: viewport,
  };
  await page.render(renderContext).promise;
  wrapper.appendChild(canvas);

  const pdfLibDoc = await PDFLib.PDFDocument.load(originalPdfBytes.slice());
  const form = pdfLibDoc.getForm();
  const fields = form.getFields();
  const fieldMapByName = {};
  fields.forEach(f => fieldMapByName[f.getName()] = f);

  const annotations = await page.getAnnotations();

  annotations.forEach(ann => {
    if (!ann.fieldName || ann.subtype !== "Widget") return;

    const [x1, y1, x2, y2] = ann.rect;
    const [vx1, vy1, vx2, vy2] = viewport.convertToViewportRectangle([x1, y1, x2, y2]);

    const left = Math.min(vx1, vx2);
    const top = Math.min(vy1, vy2);
    const width = Math.abs(vx2 - vx1);
    const height = Math.abs(vy2 - vy1);

    const field = fieldMapByName[ann.fieldName];
    let input;

    if (field instanceof PDFLib.PDFCheckBox) {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = field.isChecked();
    } else {
      input = document.createElement("input");
      input.type = "text";
      input.value = field?.getText?.() ?? "";
    }

    input.className = "field-input";
    input.name = ann.fieldName;
    input.style.position = "absolute";
    input.style.left = left + "px";
    input.style.top = top + "px";
    input.style.width = width + "px";
    input.style.height = height + "px";

    wrapper.appendChild(input);
    formFieldMap[ann.fieldName] = input;
  });

  container.appendChild(wrapper);
}

document.getElementById("save-data").addEventListener("click", () => {
  const data = {};
  for (const name in formFieldMap) {
    const input = formFieldMap[name];
    data[name] = input.type === "checkbox" ? input.checked : input.value;
  }
  localStorage.setItem("pdfFieldData", JSON.stringify(data));
  alert("✅ Dati salvati");
});

document.getElementById("apply-data").addEventListener("click", () => {
  const saved = JSON.parse(localStorage.getItem("pdfFieldData") || "{}");
  for (const name in formFieldMap) {
    const input = formFieldMap[name];
    if (saved[name] !== undefined) {
      if (input.type === "checkbox") {
        input.checked = saved[name];
      } else {
        input.value = saved[name];
      }
    }
  }
  alert("📤 Dati riapplicati");
});

document.getElementById("download-pdf").addEventListener("click", async () => {
  if (!originalPdfBytes) return;

  const pdfDoc = await PDFLib.PDFDocument.load(originalPdfBytes.slice());
  const form = pdfDoc.getForm();

  for (const name in formFieldMap) {
    const input = formFieldMap[name];
    try {
      if (input.type === "checkbox") {
        const field = form.getCheckBox(name);
        input.checked ? field.check() : field.uncheck();
      } else {
        const field = form.getTextField(name);
        field.setText(input.value);
      }
    } catch (e) {
      console.warn("Campo non gestito o non trovato:", name);
    }
  }

  form.flatten();
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "libretto_compilato.pdf";
  a.click();
});
