from django.conf import settings
from django.db import models


class SavedResource(models.Model):
    class ResourceType(models.TextChoices):
        YOUTUBE = "youtube", "YouTube"
        TEXTBOOK = "textbook", "Textbook"
        PDF = "pdf", "PDF"
        ARTICLE = "article", "Article"
        LINK = "link", "Link"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_resources")
    title = models.CharField(max_length=220)
    resource_type = models.CharField(max_length=20, choices=ResourceType.choices)
    description = models.TextField(blank=True)
    url = models.URLField(blank=True)
    course_title = models.CharField(max_length=180, blank=True)
    source_name = models.CharField(max_length=120, blank=True)
    author_or_channel = models.CharField(max_length=220, blank=True)
    published_date = models.CharField(max_length=80, blank=True)
    thumbnail = models.URLField(blank=True)
    is_saved = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title
