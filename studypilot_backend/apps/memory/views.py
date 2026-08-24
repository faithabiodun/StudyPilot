from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.utils import success_response

from .services import study_history, weakness_briefing


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
