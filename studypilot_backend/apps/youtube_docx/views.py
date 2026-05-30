from django.http import Http404, HttpResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.dashboard.services import record_activity
from apps.utils import error_response, success_response

from .services import (
    TRANSCRIPT_UNAVAILABLE_MESSAGE,
    YouTubeDocxError,
    analyze_youtube_video,
    cleanup_old_docx_files,
    generate_youtube_docx,
    get_temp_docx_path,
)


class YouTubeDocxAnalyzeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        youtube_url = (request.data.get("youtube_url") or "").strip()
        if not youtube_url:
            return error_response("Invalid YouTube link.", {"youtube_url": "Paste a YouTube lecture link."}, status.HTTP_400_BAD_REQUEST)
        try:
            data = analyze_youtube_video(youtube_url)
        except YouTubeDocxError as exc:
            return error_response(str(exc), {"youtube_url": str(exc)}, status.HTTP_400_BAD_REQUEST)
        return success_response("Video analyzed successfully", data)


class YouTubeDocxGenerateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        youtube_url = (request.data.get("youtube_url") or "").strip()
        manual_transcript = (request.data.get("manual_transcript") or "").strip()
        document_options = {
            "detail_level": request.data.get("detail_level"),
            "document_style": request.data.get("document_style"),
            "key_frames": request.data.get("key_frames"),
            "custom_instruction": request.data.get("custom_instruction"),
        }
        if not youtube_url:
            return error_response("Invalid YouTube link.", {"youtube_url": "Paste a YouTube lecture link."}, status.HTTP_400_BAD_REQUEST)
        try:
            data = generate_youtube_docx(youtube_url, manual_transcript=manual_transcript, document_options=document_options)
        except YouTubeDocxError as exc:
            if str(exc) in {TRANSCRIPT_UNAVAILABLE_MESSAGE, "Audio transcription failed. Paste transcript manually to continue."}:
                message = str(exc)
                return Response(
                    {
                        "success": False,
                        "message": message,
                        "errors": {
                            "youtube_url": "Transcript could not be fetched automatically. Paste the transcript manually to continue."
                        },
                        "data": {
                            "manual_transcript_required": True,
                        },
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if str(exc) == "DeepSeek API key is not configured.":
                return error_response(
                    "DeepSeek API key is not configured.",
                    {"youtube_url": "StudyPilot could not create the study document because the AI key is not configured."},
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            return error_response(str(exc), {"youtube_url": str(exc)}, status.HTTP_400_BAD_REQUEST)
        record_activity(
            request.user,
            "youtube_docx_generated",
            "Generated YouTube DOCX",
            f"You generated a DOCX from {data.get('title', 'a YouTube lecture')}.",
            {"download_url": data.get("download_url"), "title": data.get("title")},
        )
        return success_response("DOCX generated successfully", data, status.HTTP_201_CREATED)


class YouTubeDocxDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, temp_file_id):
        cleanup_old_docx_files()
        path = get_temp_docx_path(temp_file_id)
        if not path or not path.exists():
            raise Http404("DOCX file was not found or has expired.")

        filename = path.name.split("__", 1)[-1]
        content = path.read_bytes()
        path.unlink(missing_ok=True)
        response = HttpResponse(
            content,
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
