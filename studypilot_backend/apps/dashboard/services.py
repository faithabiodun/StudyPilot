from django.db.models import F
from django.utils import timezone

from .models import ActivityLog, LoginActivity, UserSessionActivity


def update_user_session(user):
    if not getattr(user, "is_authenticated", False):
        return None
    now = timezone.now()
    today = timezone.localdate(now)
    session = (
        UserSessionActivity.objects.filter(user=user, session_date=today)
        .order_by("-last_seen_at")
        .first()
    )
    if not session or (now - session.last_seen_at).total_seconds() > 30 * 60:
        return UserSessionActivity.objects.create(
            user=user,
            session_date=today,
            started_at=now,
            last_seen_at=now,
            duration_seconds=0,
        )
    delta = max(0, min(int((now - session.last_seen_at).total_seconds()), 5 * 60))
    session.last_seen_at = now
    session.duration_seconds = max(0, session.duration_seconds + delta)
    session.save(update_fields=["last_seen_at", "duration_seconds", "updated_at"])
    return session


def record_activity(user, activity_type, title, description="", metadata=None):
    if not getattr(user, "is_authenticated", False):
        return None
    update_user_session(user)
    return ActivityLog.objects.create(
        user=user,
        activity_type=activity_type,
        title=title,
        description=description,
        metadata=metadata or {},
    )


def record_login(user):
    if not getattr(user, "is_authenticated", False):
        return None
    update_user_session(user)
    today = timezone.localdate()
    activity, created = LoginActivity.objects.get_or_create(
        user=user,
        login_date=today,
        defaults={"login_count": 1},
    )
    if not created:
        LoginActivity.objects.filter(pk=activity.pk).update(login_count=F("login_count") + 1, updated_at=timezone.now())
        activity.refresh_from_db()
    record_activity(user, "logged_in", "Logged in", "You logged in to StudyPilot.")
    return activity
