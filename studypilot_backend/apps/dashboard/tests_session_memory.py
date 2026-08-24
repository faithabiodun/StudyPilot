from datetime import date, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.dashboard import services
from apps.dashboard.models import UserSessionActivity

User = get_user_model()


class FlushFinishedSessionsTests(TestCase):
    """A finished day must reach Walrus exactly once: the store is append-only,
    so a repeated write would double-count the time studied."""

    def setUp(self):
        self.user = User.objects.create_user(email="flush@test.local", password="x", full_name="Flush")
        self.today = timezone.localdate()
        self.yesterday = self.today - timedelta(days=1)

    def _session(self, on, seconds):
        now = timezone.now()
        return UserSessionActivity.objects.create(
            user=self.user, session_date=on, started_at=now, last_seen_at=now, duration_seconds=seconds
        )

    def test_finished_day_is_written_once_and_only_once(self):
        self._session(self.yesterday, 1800)
        with patch.object(services, "remember_session", return_value={"written": 1}) as write:
            first = services.flush_finished_sessions(self.user, self.today)
            second = services.flush_finished_sessions(self.user, self.today)
        self.assertEqual(first, 1)
        self.assertEqual(second, 0, "a second flush must not write the day again")
        self.assertEqual(write.call_count, 1)
        self.assertEqual(write.call_args.kwargs["minutes"], 30)

    def test_today_is_never_written_while_still_in_progress(self):
        self._session(self.today, 600)
        with patch.object(services, "remember_session", return_value={"written": 1}) as write:
            services.flush_finished_sessions(self.user, self.today)
        write.assert_not_called()

    def test_empty_day_is_marked_without_writing(self):
        self._session(self.yesterday, 10)
        with patch.object(services, "remember_session", return_value={"written": 1}) as write:
            services.flush_finished_sessions(self.user, self.today)
        write.assert_not_called()
        self.assertTrue(UserSessionActivity.objects.get(session_date=self.yesterday).memory_written)

    def test_failed_write_is_retried_next_time(self):
        self._session(self.yesterday, 1800)
        with patch.object(services, "remember_session", return_value={"written": 0, "error": "relayer down"}):
            services.flush_finished_sessions(self.user, self.today)
        self.assertFalse(UserSessionActivity.objects.get(session_date=self.yesterday).memory_written)
        with patch.object(services, "remember_session", return_value={"written": 1}) as write:
            services.flush_finished_sessions(self.user, self.today)
        self.assertEqual(write.call_count, 1)

    def test_heartbeat_still_records_time_when_memory_breaks(self):
        self._session(self.yesterday, 1800)
        boom = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("relayer down"))
        with patch.object(services, "flush_finished_sessions", side_effect=boom):
            session = services.update_user_session(self.user)
        self.assertIsNotNone(session, "a memory outage must not stop study time being recorded")

    def test_multiple_rows_in_one_day_become_a_single_record(self):
        """A gap over 30 minutes opens a new row, but a day is still one day."""
        self._session(self.yesterday, 600)
        self._session(self.yesterday, 900)
        self._session(self.yesterday, 300)
        with patch.object(services, "remember_session", return_value={"written": 1}) as write:
            days = services.flush_finished_sessions(self.user, self.today)
        self.assertEqual(days, 1, "three rows on one day must not write three records")
        self.assertEqual(write.call_count, 1)
        self.assertEqual(write.call_args.kwargs["minutes"], 30, "minutes must be the day's total")
        self.assertEqual(UserSessionActivity.objects.filter(memory_written=False).count(), 0)

    def test_separate_days_write_separate_records(self):
        self._session(self.yesterday, 1200)
        self._session(self.yesterday - timedelta(days=1), 1200)
        with patch.object(services, "remember_session", return_value={"written": 1}) as write:
            days = services.flush_finished_sessions(self.user, self.today)
        self.assertEqual(days, 2)
        self.assertEqual(write.call_count, 2)
