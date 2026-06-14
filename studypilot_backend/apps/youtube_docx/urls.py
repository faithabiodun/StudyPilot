from django.urls import path

from .views import (
    YoutubeFlashcardsView,
    YoutubeMCQView,
    YoutubeQuizView,
    YoutubeToDocxView,
)

urlpatterns = [
    path("docx/", YoutubeToDocxView.as_view(), name="youtube_docx"),
    path("flashcards/", YoutubeFlashcardsView.as_view(), name="youtube_flashcards"),
    path("mcq/", YoutubeMCQView.as_view(), name="youtube_mcq"),
    path("quiz/", YoutubeQuizView.as_view(), name="youtube_quiz"),
]
