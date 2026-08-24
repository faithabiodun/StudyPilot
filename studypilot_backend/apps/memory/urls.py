from django.urls import path

from .views import ResumeView, SaveProgressView, StudyHistoryView, WeaknessBriefingView

urlpatterns = [
    path("briefing/", WeaknessBriefingView.as_view(), name="memory_briefing"),
    path("history/", StudyHistoryView.as_view(), name="memory_history"),
    path("resume/", ResumeView.as_view(), name="memory_resume"),
    path("progress/", SaveProgressView.as_view(), name="memory_progress"),
]
