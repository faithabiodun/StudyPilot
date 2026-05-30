from pathlib import Path
import logging
import time

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.dashboard.services import record_activity
from apps.utils import error_response, success_response

from .models import Document
from .serializers import DocumentSerializer, DocumentUploadSerializer
from .services import clean_extracted_text, clean_safe_string, delete_document_file, extract_pdf_text

logger = logging.getLogger(__name__)


def process_document_text(document):
    document.status = Document.Status.PROCESSING
    document.save(update_fields=["status", "updated_at"])
    try:
        logger.info("PDF extraction started document_id=%s", document.id)
        logger.info("PDF temp path created document_id=%s exists=%s", document.id, bool(document.file and document.file.path))
        result = extract_pdf_text(document.file.path)
        cleaned_text = clean_extracted_text(result.get("text", ""))
        focused_text = clean_extracted_text(result.get("focused_text", "")) or cleaned_text
        if not cleaned_text:
            raise ValueError("No readable text was found in this PDF.")
        document.extracted_text = cleaned_text
        document.focused_extracted_text = focused_text
        document.page_count = result["page_count"]
        document.total_page_count = result.get("total_page_count") or result["page_count"]
        document.focused_start_page = result.get("focused_start_page")
        document.focused_end_page = result.get("focused_end_page")
        document.status = Document.Status.PROCESSED
        document._processed_pages = result.get("processed_pages")
        document._extraction_limited = result.get("extraction_limited", False)
        logger.info("PDF extraction completed document_id=%s page_count=%s", document.id, document.page_count)
        delete_document_file(document)
        document.save(update_fields=[
            "file",
            "extracted_text",
            "focused_extracted_text",
            "page_count",
            "total_page_count",
            "focused_start_page",
            "focused_end_page",
            "status",
            "updated_at",
        ])
    except Exception:
        document.extracted_text = ""
        document.focused_extracted_text = ""
        document.status = Document.Status.FAILED
        logger.warning("PDF extraction failed document_id=%s", document.id, exc_info=True)
        delete_document_file(document)
        document.save(update_fields=["file", "extracted_text", "focused_extracted_text", "status", "updated_at"])
        raise
    return document


def format_upload_error(exc):
    message = clean_safe_string(str(exc))
    if not message:
        return "The PDF was uploaded, but readable text could not be extracted."
    if "nul" in message.lower() or "0x00" in message.lower():
        return "The uploaded PDF contained unsupported hidden characters that could not be saved safely."
    return message


def document_upload_payload(document, processing_time_seconds=None):
    extraction_limited = bool(getattr(document, "_extraction_limited", False))
    return {
        "id": document.id,
        "title": document.title,
        "original_filename": document.original_filename,
        "file_size": document.file_size,
        "file_type": document.file_type,
        "page_count": document.page_count,
        "total_page_count": document.total_page_count or document.page_count,
        "focused_start_page": document.focused_start_page,
        "focused_end_page": document.focused_end_page,
        "status": document.status,
        "extracted_text_length": len(document.extracted_text or ""),
        "focused_extracted_text_length": len(document.focused_extracted_text or ""),
        "chunk_count": document.chunks.count(),
        "processing_time_seconds": processing_time_seconds,
        "extraction_limited": extraction_limited,
        "notice": "This PDF is large, so StudyPilot extracted the most useful readable sections for faster study generation." if extraction_limited else "",
        "uploaded_at": document.uploaded_at,
    }


class DocumentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        documents = Document.objects.filter(user=request.user)
        return success_response("Documents fetched", DocumentSerializer(documents, many=True, context={"request": request}).data)


class DocumentUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        started_at = time.perf_counter()
        logger.info("PDF upload received has_file=%s", "file" in request.FILES)
        if "file" in request.FILES:
            upload_debug = request.FILES["file"]
            logger.info("PDF upload file size=%s content_type=%s", upload_debug.size, upload_debug.content_type)

        serializer = DocumentUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Upload failed", serializer.errors)

        for stale_document in Document.objects.filter(user=request.user).exclude(file=""):
            if stale_document.file:
                delete_document_file(stale_document)
                stale_document.save(update_fields=["file", "updated_at"])

        upload = serializer.validated_data["file"]
        extension = Path(upload.name).suffix.lower().replace(".", "")
        original_filename = clean_safe_string(upload.name, fallback="uploaded.pdf", max_length=255)
        title = clean_safe_string(serializer.validated_data.get("title") or Path(upload.name).stem, fallback=Path(original_filename).stem or "Uploaded PDF", max_length=255)
        document = Document.objects.create(
            user=request.user,
            title=title,
            original_filename=original_filename,
            file=upload,
            file_type=extension,
            file_size=upload.size,
        )
        try:
            process_document_text(document)
        except Exception as exc:
            return error_response("PDF text extraction failed", {"file": format_upload_error(exc)})

        elapsed = round(time.perf_counter() - started_at, 2)
        record_activity(
            request.user,
            "pdf_uploaded",
            "Uploaded PDF",
            f"You uploaded {document.original_filename}.",
            {"document_id": document.id, "filename": document.original_filename},
        )
        return success_response("PDF processed successfully", document_upload_payload(document, elapsed), status.HTTP_201_CREATED)


class DocumentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return get_object_or_404(Document, pk=pk, user=request.user)

    def get(self, request, pk):
        return success_response("Document fetched", DocumentSerializer(self.get_object(request, pk), context={"request": request}).data)

    def delete(self, request, pk):
        document = self.get_object(request, pk)
        delete_document_file(document)
        document.delete()
        return success_response("Document deleted")


class ExtractTextView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        document = get_object_or_404(Document, pk=pk, user=request.user)
        try:
            process_document_text(document)
        except Exception as exc:
            return error_response(str(exc) or "Text extraction failed", status_code=status.HTTP_400_BAD_REQUEST)
        return success_response("Text extraction completed", DocumentSerializer(document, context={"request": request}).data)


class CleanupTempDocumentsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        count = 0
        for document in Document.objects.filter(user=request.user).exclude(file=""):
            if document.file:
                delete_document_file(document)
                document.save(update_fields=["file", "updated_at"])
                count += 1
        return success_response("Temporary PDF files cleaned up", {"deleted_files": count})
