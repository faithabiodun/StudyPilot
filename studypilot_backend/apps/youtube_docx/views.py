import importlib.util

from django.conf import settings
from django.http import Http404, HttpResponse
from rest_framework import status
from rest_framework.permissions import AllowAny
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


def package_available(module_name):
    try:
        return importlib.util.find_spec(module_name) is not None
    except Exception:
        return False


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
                return Response(
                    {
                        "success": False,
                        "message": "StudyPilot could not fetch the transcript automatically for this video. You can still generate the DOCX by pasting the transcript below.",
                        "errors": {
                            "youtube_url": "Paste the transcript manually to continue."
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


class YouTubeDocxDiagnosticsView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {
                "success": True,
                "youtube_docx": "running",
                "deepseek_configured": bool(settings.DEEPSEEK_API_KEY),
                "youtube_api_key_configured": bool(settings.YOUTUBE_API_KEY),
                "yt_dlp_available": package_available("yt_dlp"),
                "youtube_transcript_api_available": package_available("youtube_transcript_api"),
                "python_docx_available": package_available("docx"),
                "faster_whisper_available": package_available("faster_whisper"),
                "audio_transcription_enabled": settings.ENABLE_AUDIO_TRANSCRIPTION,
                "whisper_model_size": settings.WHISPER_MODEL_SIZE,
                "audio_temp_dir": str(settings.YOUTUBE_AUDIO_TEMP_DIR),
                "docx_temp_dir": str(settings.YOUTUBE_DOCX_TEMP_DIR),
                "render_safe_metadata": True,
                "note": "yt-dlp may be blocked by YouTube on cloud hosts, so metadata uses oEmbed or YouTube Data API first.",
            }
        )
