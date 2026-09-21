// Read a PDF in the browser. This mirrors extract_pdf_text from the Django
// backend (same page and character caps, same "focus" range) so documents come
// out the same as before; it moved here because the Cloudflare Worker has
// neither PyMuPDF nor the CPU budget to parse a 50-page PDF.

import { cleanExtractedText } from "@shared/text";
import { selectStudyContext } from "@shared/context";

export const MAX_PDF_PAGES = 50;
export const MAX_EXTRACTED_TEXT_CHARS = 80000;
export const MAX_CONTEXT_CHARS = 20000;

export class PdfReadError extends Error {}

/** The middle-to-late pages, where lecture PDFs usually carry the substance. */
export function calculateFocusRange(totalPages) {
  if (!totalPages || totalPages <= 0) return [0, 0];
  let start = Math.floor(totalPages * 0.4);
  let end = Math.floor(totalPages * 0.8);
  start = Math.max(0, Math.min(start, totalPages - 1));
  end = Math.max(start + 1, Math.min(end, totalPages));
  if (totalPages <= 3) {
    start = 0;
    end = totalPages;
  }
  return [start, end];
}

let pdfjsPromise;

// pdf.js is large, so it only loads when someone actually picks a PDF.
function loadPdfjs() {
  // The legacy build carries the polyfills for the newest JavaScript pdf.js
  // uses (Uint8Array.toHex and friends), so it also works on the older phone
  // browsers a lot of students are on.
  pdfjsPromise ??= Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")
  ]).then(([pdfjs, worker]) => {
    // Left alone if something already set it (tests point it at the file on
    // disk, since the bundler URL below only resolves in a browser).
    if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsPromise;
}

async function pageText(pdf, index) {
  const page = await pdf.getPage(index + 1);
  const content = await page.getTextContent();
  // hasEOL marks the end of a visual line, which is where PyMuPDF put "\n".
  return content.items.map((item) => (item.str || "") + (item.hasEOL ? "\n" : "")).join("");
}

/**
 * Returns the same fields the Django upload produced, plus the two study
 * contexts the Worker uses for generation.
 */
export async function readPdf(file) {
  const pdfjs = await loadPdfjs();
  let pdf;
  let loadingTask;
  try {
    loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    pdf = await loadingTask.promise;
  } catch (error) {
    if (error?.name === "PasswordException") {
      throw new PdfReadError("This PDF is password protected. Remove the password and upload it again.");
    }
    console.warn("PDF read failed:", error);
    throw new PdfReadError("StudyPilot could not read this PDF. Please try another readable PDF.", { cause: error });
  }

  try {
    const pageCount = pdf.numPages;
    const [focusStart, focusEnd] = calculateFocusRange(pageCount);
    const parts = [];
    let limited = false;
    let total = 0;
    for (let index = 0; index < pageCount; index += 1) {
      if (index >= MAX_PDF_PAGES) {
        limited = true;
        break;
      }
      const text = await pageText(pdf, index);
      parts.push(text);
      total += text.length;
      if (total >= MAX_EXTRACTED_TEXT_CHARS) {
        limited = true;
        break;
      }
    }

    const focusedParts = [];
    const actualFocusEnd = Math.min(focusEnd, focusStart + MAX_PDF_PAGES, pageCount);
    if (actualFocusEnd < focusEnd) limited = true;
    for (let index = focusStart; index < actualFocusEnd; index += 1) {
      // Reuse pages already read above instead of reading them again.
      focusedParts.push(index < parts.length ? parts[index] : await pageText(pdf, index));
    }

    let text = cleanExtractedText(parts.join("\n"));
    let focused = cleanExtractedText(focusedParts.join("\n"));
    if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
      text = text.slice(0, MAX_EXTRACTED_TEXT_CHARS).trim();
      limited = true;
    }
    if (focused.length > MAX_EXTRACTED_TEXT_CHARS) focused = focused.slice(0, MAX_EXTRACTED_TEXT_CHARS).trim();
    if (focused.length < 400) focused = text;
    if (!text) throw new PdfReadError("StudyPilot could not extract readable text from this PDF.");

    // Generation reads the focused text first, exactly as the Django views did.
    const source = focused || text;
    return {
      text,
      focused_text: focused,
      page_count: pageCount,
      total_page_count: pageCount,
      focused_start_page: focusStart,
      focused_end_page: actualFocusEnd,
      processed_pages: parts.length,
      extraction_limited: limited,
      study_context: selectStudyContext(source, MAX_CONTEXT_CHARS),
      study_context_retry: selectStudyContext(source, MAX_CONTEXT_CHARS, 10)
    };
  } finally {
    // The loading task owns the worker; destroying it frees the worker too.
    await loadingTask.destroy();
  }
}
