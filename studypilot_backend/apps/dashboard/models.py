from django.conf import settings
from django.db import models


class LoginActivity(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="login_activities")
    login_date = models.DateField()
    login_count = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "login_date")
        ordering = ["login_date"]

    def __str__(self):
        return f"{self.user_id} {self.login_date} ({self.login_count})"


class ActivityLog(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="activity_logs")
    activity_type = models.CharField(max_length=80)
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.activity_type}: {self.title}"


class UserSessionActivity(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="session_activities")
    session_date = models.DateField()
    started_at = models.DateTimeField()
    last_seen_at = models.DateTimeField()
    duration_seconds = models.PositiveIntegerField(default=0)
    # Walrus Memory is append-only, so a day may only be written once. Set once
    # the finished day has been rolled up into a SESSION record.
    memory_written = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["session_date"]
        indexes = [models.Index(fields=["user", "session_date"])]

    def __str__(self):
        return f"{self.user_id} {self.session_date} ({self.duration_seconds}s)"
