from pathlib import Path
import re
import logging
import unicodedata

from django.conf import settings
import pdfplumber

logger = logging.getLogger(__name__)


class PDFTextExtractionError(Exception):
    pass


def clean_extracted_text(text):
    if not text:
        return ""

    text = str(text)
    text = text.replace("\x00", "")
    text = text.replace("\u0000", "")
    text = text.replace("\ufeff", "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    cleaned_chars = []
    for char in text:
        if char in ("\n", "\t"):
            cleaned_chars.append(char)
            continue
        if unicodedata.category(char).startswith("C"):
            continue
        cleaned_chars.append(char)

    cleaned = "".join(cleaned_chars)
    cleaned = re.sub(r"[^\S\n]+", " ", cleaned)
    cleaned = re.sub(r" *\n *", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def clean_safe_string(value, fallback="", max_length=None):
    cleaned = clean_extracted_text(value)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        cleaned = fallback
    if max_length:
        cleaned = cleaned[:max_length].strip()
    return cleaned


def calculate_focus_range(total_pages):
    if not total_pages or total_pages <= 0:
        return 0, 0
    start_page = int(total_pages * 0.4)
    end_page = int(total_pages * 0.8)
    start_page = max(0, min(start_page, total_pages - 1))
    end_page = max(start_page + 1, min(end_page, total_pages))
    if total_pages <= 3:
        start_page = 0
        end_page = total_pages
    return start_page, end_page


def extract_pdf_text(file_path):
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError("Document file not found")

    fitz_error = None
    page_count = None
    processed_pages = 0
    extraction_limited = False
    max_pages = settings.MAX_PDF_PAGES
    max_chars = settings.MAX_EXTRACTED_TEXT_CHARS
    try:
        import fitz

        text_parts = []
        with fitz.open(path) as document:
            page_count = document.page_count
            focus_start, focus_end = calculate_focus_range(page_count)
            for index, page in enumerate(document):
                if index >= max_pages:
                    extraction_limited = True
                    break
                page_text = page.get_text()
                text_parts.append(page_text)
                processed_pages += 1
                if sum(len(part) for part in text_parts) >= max_chars:
                    extraction_limited = True
                    break
            focused_parts = []
            actual_focus_end = min(focus_end, focus_start + max_pages, page_count)
            if actual_focus_end < focus_end:
                extraction_limited = True
            for index in range(focus_start, actual_focus_end):
                # Reuse pages already extracted above instead of re-reading them.
                if index < len(text_parts):
                    focused_parts.append(text_parts[index])
                else:
                    focused_parts.append(document[index].get_text())
        text = clean_extracted_text("\n".join(text_parts))
        focused_text = clean_extracted_text("\n".join(focused_parts))
        if len(text) > max_chars:
            text = text[:max_chars].strip()
            extraction_limited = True
        if len(focused_text) > max_chars:
            focused_text = focused_text[:max_chars].strip()
        if len(focused_text) < 400:
            focused_text = text
        if len(text) >= 40:
            return {
                "text": text,
                "focused_text": focused_text,
                "page_count": page_count,
                "total_page_count": page_count,
                "focused_start_page": focus_start,
                "focused_end_page": actual_focus_end,
                "processed_pages": processed_pages,
                "extraction_limited": extraction_limited,
            }
    except Exception as exc:
        fitz_error = exc

    text_parts = []
    processed_pages = 0
    extraction_limited = False
    try:
        with pdfplumber.open(path) as pdf:
            page_count = page_count or len(pdf.pages)
            focus_start, focus_end = calculate_focus_range(page_count)
            for index, page in enumerate(pdf.pages):
                if index >= max_pages:
                    extraction_limited = True
                    break
                page_text = page.extract_text() or ""
                text_parts.append(page_text)
                processed_pages += 1
                if sum(len(part) for part in text_parts) >= max_chars:
                    extraction_limited = True
                    break
            focused_parts = []
            actual_focus_end = min(focus_end, focus_start + max_pages, page_count)
            if actual_focus_end < focus_end:
                extraction_limited = True
            for index in range(focus_start, actual_focus_end):
                # Reuse pages already extracted above instead of re-reading them.
                if index < len(text_parts):
                    focused_parts.append(text_parts[index])
                else:
                    focused_parts.append(pdf.pages[index].extract_text() or "")
        text = clean_extracted_text("\n".join(text_parts))
        focused_text = clean_extracted_text("\n".join(focused_parts))
        if len(text) > max_chars:
            text = text[:max_chars].strip()
            extraction_limited = True
        if len(focused_text) > max_chars:
            focused_text = focused_text[:max_chars].strip()
        if len(focused_text) < 400:
            focused_text = text
        if not text:
            raise PDFTextExtractionError("No readable text was found in this PDF.")
        return {
            "text": text,
            "focused_text": focused_text,
            "page_count": page_count,
            "total_page_count": page_count,
            "focused_start_page": focus_start,
            "focused_end_page": actual_focus_end,
            "processed_pages": processed_pages,
            "extraction_limited": extraction_limited,
        }
    except Exception:
        if fitz_error:
            logger.warning("PyMuPDF extraction failed before pdfplumber fallback also failed: %s", fitz_error)
            raise fitz_error
        raise


def delete_document_file(document):
    if document.file:
        storage = document.file.storage
        name = document.file.name
        if name and storage.exists(name):
            storage.delete(name)
            logger.info("Temporary uploaded PDF deleted: %s", name)
        document.file = None
