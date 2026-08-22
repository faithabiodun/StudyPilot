from django.conf import settings
from django.db import models

from apps.documents.models import Document


class Quiz(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="quizzes")
    document = models.ForeignKey(Document, on_delete=models.SET_NULL, null=True, blank=True, related_name="quizzes")
    course_title = models.CharField(max_length=180, blank=True, default="")
    difficulty = models.CharField(max_length=40, default="beginner")
    question_type = models.CharField(max_length=120, default="multiple_choice")
    number_of_questions = models.PositiveIntegerField(default=10)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.course_title or self.document_id or 'PDF'} quiz"


class QuizQuestion(models.Model):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="questions")
    question = models.TextField()
    correct_answer = models.TextField()
    explanation = models.TextField(blank=True)
    question_type = models.CharField(max_length=80, default="multiple_choice")
    # The concept this question tests, as a slug. Mistake memory groups by this,
    # so without it every miss in a course collapses onto a single topic.
    subtopic = models.CharField(max_length=120, blank=True)

    def __str__(self):
        return self.question[:80]


class QuizOption(models.Model):
    question = models.ForeignKey(QuizQuestion, on_delete=models.CASCADE, related_name="options")
    option_text = models.CharField(max_length=255)
    is_correct = models.BooleanField(default=False)

    def __str__(self):
        return self.option_text
