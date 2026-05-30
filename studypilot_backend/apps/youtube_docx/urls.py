from django.urls import path

from .views import YouTubeDocxAnalyzeView, YouTubeDocxDiagnosticsView, YouTubeDocxDownloadView, YouTubeDocxGenerateView

urlpatterns = [
    path("analyze/", YouTubeDocxAnalyzeView.as_view(), name="youtube_docx_analyze"),
    path("generate/", YouTubeDocxGenerateView.as_view(), name="youtube_docx_generate"),
    path("download/<str:temp_file_id>/", YouTubeDocxDownloadView.as_view(), name="youtube_docx_download"),
    path("diagnostics/", YouTubeDocxDiagnosticsView.as_view(), name="youtube_docx_diagnostics"),
]
