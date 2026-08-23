from django.urls import path

from .views import WeaknessBriefingView

urlpatterns = [
    path("briefing/", WeaknessBriefingView.as_view(), name="memory_briefing"),
]
