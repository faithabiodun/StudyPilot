from django.urls import path

from .views import StudyHistoryView, WeaknessBriefingView

urlpatterns = [
    path("briefing/", WeaknessBriefingView.as_view(), name="memory_briefing"),
    path("history/", StudyHistoryView.as_view(), name="memory_history"),
]
