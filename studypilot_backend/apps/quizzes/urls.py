from django.urls import path

from .views import GenerateMCQView, GenerateQuizView, QuizDetailView, QuizListView, SubmitQuizView

urlpatterns = [
    path("", QuizListView.as_view(), name="quizzes"),
    path("generate/", GenerateQuizView.as_view(), name="generate_quiz"),
    path("generate-mcq/", GenerateMCQView.as_view(), name="generate_mcq"),
    path("<int:pk>/", QuizDetailView.as_view(), name="quiz_detail"),
    path("<int:pk>/submit/", SubmitQuizView.as_view(), name="submit_quiz"),
]
