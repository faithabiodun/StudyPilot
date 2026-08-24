import logging

from django.core.exceptions import ImproperlyConfigured
from django.http import HttpResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.ai.services import AIServiceError, generate_structured_docx_content_with_deepseek
from apps.dashboard.services import record_activity
from apps.memory.services import remember_material
from apps.documents.services import clean_extracted_text, clean_safe_string
from apps.study_tools.deduplication import deduplicate_flashcards, deduplicate_questions
from apps.utils import error_response, success_response

from .docx_builder import build_study_docx, safe_filename
from .serializers import (
    YoutubeDocxSerializer,
    YoutubeFlashcardsSerializer,
    YoutubeMCQSerializer,
    YoutubeQuizSerializer,
)
from .services import youtube_flashcards, youtube_mcqs, youtube_mixed_quiz
from .transcript import TranscriptError, get_transcript_and_metadata

logger = logging.getLogger(__name__)

DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _resolve_transcript(youtube_url):
    """Return (transcript, metadata, source) or raise TranscriptError."""
    return get_transcript_and_metadata(youtube_url)



def _remember_video(user, metadata, tool, extra=""):
    """Record a watched lecture so the advisor can refer back to it."""
    title = metadata.get("title") or "a YouTube video"
    video_id = metadata.get("video_id") or ""
    remember_material(
        user,
        source_type="youtube",
        title=title,
        summary=extra,
        reference=f"https://www.youtube.com/watch?v={video_id}" if video_id else "",
    )

class YoutubeToDocxView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = YoutubeDocxSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("YouTube to DOCX failed", serializer.errors)

        data = serializer.validated_data
        try:
            transcript, metadata, source = _resolve_transcript(data["youtube_url"])
        except TranscriptError as exc:
            return error_response(str(exc), status_code=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception("Unexpected transcript failure")
            return error_response(
                "StudyPilot could not read this video right now. Please try again.",
                status_code=status.HTTP_502_BAD_GATEWAY,
            )

        try:
            content = generate_structured_docx_content_with_deepseek(
                transcript,
                metadata,
                {
                    "detail_level": data["detail_level"],
                    "document_style": data["document_style"],
                    "custom_instruction": data.get("custom_instruction", ""),
                },
            )
        except ImproperlyConfigured as exc:
            return error_response(str(exc), status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except AIServiceError as exc:
            return error_response(
                str(exc) or "StudyPilot could not structure this lecture. Please try again.",
                status_code=status.HTTP_502_BAD_GATEWAY,
            )

        try:
            buffer = build_study_docx(content, metadata, source=source)
        except Exception:
            logger.exception("DOCX build failed")
            return error_response(
                "StudyPilot could not build the document. Please try again.",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        filename = safe_filename(content.get("title") or metadata.get("title"))
        record_activity(
            request.user,
            "youtube_docx_generated",
            "YouTube to DOCX",
            f"You generated a study document from {metadata.get('title') or 'a YouTube video'}.",
            {"video_id": metadata.get("video_id"), "source": source},
        )
        _remember_video(request.user, metadata, "docx", content.get("summary") or "")
        response = HttpResponse(buffer.getvalue(), content_type=DOCX_CONTENT_TYPE)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["X-StudyPilot-Source"] = source
        response["Access-Control-Expose-Headers"] = "Content-Disposition, X-StudyPilot-Source"
        return response


class YoutubeFlashcardsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = YoutubeFlashcardsSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("YouTube flashcards failed", serializer.errors)

        data = serializer.validated_data
        try:
            transcript, metadata, source = _resolve_transcript(data["youtube_url"])
        except TranscriptError as exc:
            return error_response(str(exc), status_code=status.HTTP_400_BAD_REQUEST)

        requested = data["number_of_cards"]
        try:
            generated = youtube_flashcards(transcript, data["difficulty"], requested)
            cards = deduplicate_flashcards(generated.get("flashcards", []), limit=requested)
            if len(cards) < requested:
                retry = youtube_flashcards(transcript, data["difficulty"], requested, skip_chunks=10)
                cards = deduplicate_flashcards(cards + retry.get("flashcards", []), limit=requested)
        except ImproperlyConfigured as exc:
            return error_response(str(exc), status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except AIServiceError as exc:
            return error_response(
                str(exc) or "Flashcard generation failed.", status_code=status.HTTP_502_BAD_GATEWAY
            )

        clean_cards = [
            {
                "question": clean_extracted_text(card.get("question", "")),
                "answer": clean_extracted_text(card.get("answer", "")),
            }
            for card in cards
            if clean_extracted_text(card.get("question", "")) and clean_extracted_text(card.get("answer", ""))
        ]
        if not clean_cards:
            return error_response(
                "StudyPilot could not build flashcards from this video. Try a more detailed lecture.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        record_activity(
            request.user,
            "youtube_flashcards_generated",
            "YouTube Flashcards",
            f"You generated {len(clean_cards)} flashcards from {metadata.get('title') or 'a YouTube video'}.",
            {"video_id": metadata.get("video_id"), "count": len(clean_cards)},
        )
        _remember_video(request.user, metadata, "flashcards", f"{len(clean_cards)} flashcards generated")
        return success_response(
            "Flashcards generated successfully",
            {
                "title": f"{metadata.get('title') or 'YouTube'} Flashcards",
                "source_title": metadata.get("title"),
                "channel": metadata.get("channel"),
                "transcript_source": source,
                "cards": clean_cards,
            },
            status.HTTP_201_CREATED,
        )


def _build_questions_payload(items):
    """deduplicate_questions already returns cleaned, structured question dicts
    (question, correct_answer, explanation, question_type, options), so we pass
    them straight through without dropping any valid question a second time."""
    return list(items or [])


class YoutubeMCQView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = YoutubeMCQSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("YouTube MCQ failed", serializer.errors)

        data = serializer.validated_data
        try:
            transcript, metadata, source = _resolve_transcript(data["youtube_url"])
        except TranscriptError as exc:
            return error_response(str(exc), status_code=status.HTTP_400_BAD_REQUEST)

        requested = data["number_of_questions"]
        try:
            generated = youtube_mcqs(transcript, data["difficulty"], requested)
            mcqs = deduplicate_questions(generated.get("mcqs", []), limit=requested, require_mcq=True)
            if len(mcqs) < requested:
                retry = youtube_mcqs(transcript, data["difficulty"], requested, skip_chunks=10)
                mcqs = deduplicate_questions(mcqs + retry.get("mcqs", []), limit=requested, require_mcq=True)
        except ImproperlyConfigured as exc:
            return error_response(str(exc), status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except AIServiceError as exc:
            return error_response(
                str(exc) or "MCQ generation failed.", status_code=status.HTTP_502_BAD_GATEWAY
            )

        questions = _build_questions_payload(mcqs)
        if not questions:
            return error_response(
                "StudyPilot could not build MCQs from this video. Try a more detailed lecture.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        record_activity(
            request.user,
            "youtube_mcq_generated",
            "YouTube MCQ Quiz",
            f"You generated {len(questions)} MCQs from {metadata.get('title') or 'a YouTube video'}.",
            {"video_id": metadata.get("video_id"), "count": len(questions)},
        )
        _remember_video(request.user, metadata, "mcq", f"{len(questions)} MCQs generated")
        return success_response(
            "MCQ quiz generated successfully",
            {
                "title": f"{metadata.get('title') or 'YouTube'} MCQ Quiz",
                "source_title": metadata.get("title"),
                "channel": metadata.get("channel"),
                "transcript_source": source,
                "questions": questions,
            },
            status.HTTP_201_CREATED,
        )


class YoutubeQuizView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = YoutubeQuizSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("YouTube quiz failed", serializer.errors)

        data = serializer.validated_data
        question_types = data.get("question_types") or ["multiple_choice"]
        try:
            transcript, metadata, source = _resolve_transcript(data["youtube_url"])
        except TranscriptError as exc:
            return error_response(str(exc), status_code=status.HTTP_400_BAD_REQUEST)

        requested = data["number_of_questions"]
        try:
            generated = youtube_mixed_quiz(transcript, data["difficulty"], requested, question_types)
            questions_raw = deduplicate_questions(generated.get("questions", []), limit=requested)
            if len(questions_raw) < requested:
                retry = youtube_mixed_quiz(
                    transcript, data["difficulty"], requested, question_types, skip_chunks=10
                )
                questions_raw = deduplicate_questions(
                    questions_raw + retry.get("questions", []), limit=requested
                )
        except ImproperlyConfigured as exc:
            return error_response(str(exc), status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except AIServiceError as exc:
            return error_response(
                str(exc) or "Quiz generation failed.", status_code=status.HTTP_502_BAD_GATEWAY
            )

        questions = _build_questions_payload(questions_raw)
        if not questions:
            return error_response(
                "StudyPilot could not build a quiz from this video. Try a more detailed lecture.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        record_activity(
            request.user,
            "youtube_quiz_generated",
            "YouTube Mixed Quiz",
            f"You generated {len(questions)} quiz questions from {metadata.get('title') or 'a YouTube video'}.",
            {"video_id": metadata.get("video_id"), "count": len(questions)},
        )
        _remember_video(request.user, metadata, "quiz", f"{len(questions)} mixed questions generated")
        return success_response(
            "Mixed quiz generated successfully",
            {
                "title": f"{metadata.get('title') or 'YouTube'} Mixed Quiz",
                "source_title": metadata.get("title"),
                "channel": metadata.get("channel"),
                "transcript_source": source,
                "questions": questions,
            },
            status.HTTP_201_CREATED,
        )
