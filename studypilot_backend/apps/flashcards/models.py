from django.conf import settings
from django.db import models

from apps.documents.models import Document


class FlashcardDeck(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="flashcard_decks")
    document = models.ForeignKey(Document, on_delete=models.SET_NULL, null=True, blank=True, related_name="flashcard_decks")
    course_title = models.CharField(max_length=180, blank=True, default="")
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class Flashcard(models.Model):
    deck = models.ForeignKey(FlashcardDeck, on_delete=models.CASCADE, related_name="cards")
    question = models.TextField()
    answer = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.question[:80]
