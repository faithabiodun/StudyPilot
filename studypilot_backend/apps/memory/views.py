from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.documents.services import clean_safe_string
from apps.utils import error_response, success_response

from .services import resume_points, save_progress, study_history, weakness_briefing


class StudyHistoryView(APIView):
    """Days studied, read back out of Walrus rather than the local database."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return success_response("Study history", study_history(request.user))


class WeaknessBriefingView(APIView):
    """What this student keeps getting wrong, ranked.

    `truncated` and `unparsed_records` are part of the payload on purpose. The
    first tells the UI the ranking is over a sample rather than everything
    stored, the second turns record format drift into a visible number.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        course = request.query_params.get("course", "")
        return success_response("Weakness briefing", weakness_briefing(request.user, course))


class ResumeView(APIView):
    """Work the student left unfinished, so a closed tab is not lost work."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return success_response("Resume points", resume_points(request.user))


class SaveProgressView(APIView):
    """Checkpoint an in-flight quiz or deck.

    Called as the student answers, so it must stay cheap and must never fail
    the interaction: a checkpoint that cannot be written is not worth an error.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        key = clean_safe_string(request.data.get("key", ""), max_length=120)
        if not key:
            return error_response("A progress key is required.", status_code=status.HTTP_400_BAD_REQUEST)
        label = clean_safe_string(request.data.get("label", ""), fallback="Unfinished activity", max_length=180)
        payload = request.data.get("payload") or {}
        state = "done" if request.data.get("done") else "active"
        if not isinstance(payload, dict):
            return error_response("Progress payload must be an object.", status_code=status.HTTP_400_BAD_REQUEST)
        return success_response("Progress saved", save_progress(request.user, key, label, payload, status=state))
