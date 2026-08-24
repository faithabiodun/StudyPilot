import logging
from collections import defaultdict

from django.db.models import F
from django.utils import timezone

from apps.memory.services import remember_session

from .models import ActivityLog, LoginActivity, UserSessionActivity

logger = logging.getLogger(__name__)


def flush_finished_sessions(user, today):
    """Write any day before today into memory, exactly once.

    Called from the heartbeat, so a finished day is rolled up the next time the
    student appears. Guarded by memory_written because the store is append-only
    and a second write would double-count the day.
    """
    pending = list(
        UserSessionActivity.objects.filter(user=user, memory_written=False, session_date__lt=today)
    )
    if not pending:
        return 0

    # A day can span several rows, because a gap of more than 30 minutes starts
    # a new one. Sum them first so a day is one record with its real total,
    # rather than three records each holding a fraction of it.
    by_day = defaultdict(list)
    for session in pending:
        by_day[session.session_date].append(session)

    days_written = 0
    settled = []
    for day, sessions in sorted(by_day.items()):
        minutes = round(sum(item.duration_seconds for item in sessions) / 60)
        if minutes < 1:
            # Nothing worth remembering, but settle it so we stop re-checking.
            settled.extend(item.pk for item in sessions)
            continue
        if remember_session(user, on=day, minutes=minutes).get("written"):
            settled.extend(item.pk for item in sessions)
            days_written += 1
    if settled:
        UserSessionActivity.objects.filter(pk__in=settled).update(memory_written=True)
    return days_written


def update_user_session(user):
    if not getattr(user, "is_authenticated", False):
        return None
    now = timezone.now()
    today = timezone.localdate(now)
    # Roll up completed days before touching today's row. Memory is optional, so
    # a failure here must not stop the heartbeat recording study time locally.
    try:
        flush_finished_sessions(user, today)
    except Exception:
        logger.warning("Session memory flush failed for user=%s", getattr(user, "id", None), exc_info=True)
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
