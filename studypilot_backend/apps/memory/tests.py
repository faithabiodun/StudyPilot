from datetime import date, timedelta

from django.test import SimpleTestCase

from .records import (
    MASTERY_DAYS,
    build_hit,
    build_mastered,
    build_miss,
    build_pattern,
    build_session,
    parse,
    slugify_topic,
)

ON = date(2026, 8, 22)


class SlugifyTopicTests(SimpleTestCase):
    def test_phrasings_of_one_topic_collapse_to_one_slug(self):
        """Slug drift is the failure mode that silently breaks miss counting."""
        phrasings = [
            "Beta-Blocker Selectivity",
            "beta blocker selectivity",
            "  Beta   Blocker   Selectivity  ",
            "BETA-BLOCKER-SELECTIVITY",
        ]
        self.assertEqual({slugify_topic(p) for p in phrasings}, {"beta-blocker-selectivity"})

    def test_accents_and_symbols_are_normalised(self):
        # Non-ascii is dropped and the resulting leading separator is trimmed,
        # so a beta symbol cannot produce a slug starting with a hyphen.
        self.assertEqual(slugify_topic("β-blocker choice"), "blocker-choice")
        self.assertEqual(slugify_topic("Prüfung / Topic!"), "prufung-topic")

    def test_empty_input_gives_empty_slug(self):
        for value in ("", None, "   ", "---"):
            self.assertEqual(slugify_topic(value), "")


class MissRoundTripTests(SimpleTestCase):
    def test_miss_round_trips_through_parse(self):
        text = build_miss(
            namespace="pharmacology",
            topic="Beta Blocker Selectivity",
            question="Which beta blocker is cardioselective?",
            answered="propranolol",
            misconception="thought every beta blocker acts the same",
            correct="atenolol is beta-1 selective",
            severity="high",
            on=ON,
        )
        record = parse(text)
        self.assertEqual(record.kind, "MISS")
        self.assertEqual(record.namespace, "pharmacology")
        self.assertEqual(record.topic, "beta-blocker-selectivity")
        self.assertEqual(record.on, ON)
        self.assertEqual(record.severity, "high")
        self.assertIn("My misconception:", record.text)

    def test_severity_defaults_to_medium_when_not_given(self):
        record = parse(build_miss("pharmacology", "x", "q", "a", "m", "c", on=ON))
        self.assertEqual(record.severity, "medium")

    def test_unknown_severity_falls_back_to_medium(self):
        record = parse(build_miss("pharmacology", "x", "q", "a", "m", "c", severity="urgent", on=ON))
        self.assertEqual(record.severity, "medium")


class OtherRecordKindTests(SimpleTestCase):
    def test_hit_round_trips(self):
        record = parse(build_hit("pharmacology", "beta-blocker-selectivity", on=ON))
        self.assertEqual(record.kind, "HIT")
        self.assertEqual(record.topic, "beta-blocker-selectivity")

    def test_mastered_carries_expiry_thirty_days_out(self):
        record = parse(build_mastered("pharmacology", "topic", [ON], on=ON))
        self.assertEqual(record.kind, "MASTERED")
        self.assertEqual(record.expires, ON + timedelta(days=MASTERY_DAYS))

    def test_pattern_is_written_to_exam_intel(self):
        record = parse(build_pattern("Misses Negative Questions", "Missed 4 EXCEPT items", ["pcl301"], on=ON))
        self.assertEqual(record.kind, "PATTERN")
        self.assertEqual(record.namespace, "exam-intel")

    def test_session_has_no_topic_and_keeps_its_date(self):
        """SESSION omits the topic field, so the date must not slide into it."""
        record = parse(build_session("pharmacology", ["a-topic", "b-topic"], drilled=10, new_misses=2, hits=3, on=ON))
        self.assertEqual(record.kind, "SESSION")
        self.assertEqual(record.topic, "")
        self.assertEqual(record.on, ON)


class HeaderlessTextTests(SimpleTestCase):
    def test_headerless_text_returns_none(self):
        """memwal_analyze writes prose. Callers count these, they do not guess."""
        for text in [
            "I keep getting beta blockers wrong",
            "",
            None,
            "   ",
            "NOTAKIND | pharmacology | topic | 2026-08-22",
            "MISS | pharmacology | topic | not-a-date",
            "MISS pharmacology topic 2026-08-22",
        ]:
            self.assertIsNone(parse(text), f"expected None for {text!r}")


class NamespaceIsolationTests(SimpleTestCase):
    def test_same_topic_in_two_namespaces_stays_separate(self):
        a = parse(build_miss("sp-u1-pharmacology", "shared-topic", "q", "a", "m", "c", on=ON))
        b = parse(build_miss("sp-u2-pharmacology", "shared-topic", "q", "a", "m", "c", on=ON))
        self.assertEqual(a.topic, b.topic)
        self.assertNotEqual(a.namespace, b.namespace)


# --- Step 2: service layer, exercised against MemWalMockSync (no credentials) ---

from datetime import timedelta  # noqa: E402
from unittest.mock import patch  # noqa: E402

from memwal import MemWalMockSync, RememberBulkItem  # noqa: E402

from . import services  # noqa: E402


class _StubUser:
    def __init__(self, user_id):
        self.id = user_id


def _seeded_client(namespace, texts):
    client = MemWalMockSync.create(namespace=namespace)
    if texts:
        client.remember_bulk_async([RememberBulkItem(text=t, namespace=namespace) for t in texts])
    return client


class NamespaceForTests(SimpleTestCase):
    def test_namespaces_never_collide_across_users(self):
        a = services.namespace_for(_StubUser(1), "Pharmacology")
        b = services.namespace_for(_StubUser(2), "Pharmacology")
        self.assertEqual(a, "sp-u1-pharmacology")
        self.assertNotEqual(a, b)

    def test_course_phrasings_give_one_namespace(self):
        user = _StubUser(7)
        variants = {services.namespace_for(user, c) for c in ["Pharmacology", "pharmacology", "  PHARMACOLOGY  "]}
        self.assertEqual(variants, {"sp-u7-pharmacology"})

    def test_missing_course_falls_back_to_general(self):
        self.assertEqual(services.namespace_for(_StubUser(3), ""), "sp-u3-general")


class BriefingTests(SimpleTestCase):
    def setUp(self):
        self.user = _StubUser(1)
        self.ns = "sp-u1-pharmacology"
        self.today = date(2026, 8, 22)

    def _brief(self, texts):
        with patch.object(services, "memwal_enabled", return_value=True), \
             patch.object(services, "_client", return_value=_seeded_client(self.ns, texts)):
            return services.weakness_briefing(self.user, "Pharmacology", on=self.today)

    def test_three_phrasings_of_one_topic_count_as_three_misses(self):
        texts = [
            build_miss(self.ns, "Beta-Blocker Selectivity", "q1", "a", "m", "c", on=date(2026, 8, 1)),
            build_miss(self.ns, "beta blocker selectivity", "q2", "a", "m", "c", on=date(2026, 8, 10)),
            build_miss(self.ns, "BETA-BLOCKER-SELECTIVITY", "q3", "a", "m", "c", on=date(2026, 8, 20)),
        ]
        topics = self._brief(texts)["weak_topics"]
        self.assertEqual(len(topics), 1)
        self.assertEqual(topics[0]["topic"], "beta-blocker-selectivity")
        self.assertEqual(topics[0]["misses"], 3)

    def test_stale_miss_scores_far_below_a_live_one(self):
        texts = [
            build_miss(self.ns, "old-topic", "q", "a", "m", "c", severity="high", on=self.today - timedelta(days=150)),
            build_miss(self.ns, "live-topic", "q", "a", "m", "c", severity="high", on=self.today),
        ]
        scores = {t["topic"]: t["score"] for t in self._brief(texts)["weak_topics"]}
        self.assertGreater(scores["live-topic"], scores["old-topic"] * 10)

    def test_two_hit_streak_surfaces_as_one_more_to_master(self):
        texts = [
            build_miss(self.ns, "streaky", "q", "a", "m", "c", on=date(2026, 8, 1)),
            build_hit(self.ns, "streaky", on=date(2026, 8, 10)),
            build_hit(self.ns, "streaky", on=date(2026, 8, 15)),
        ]
        names = [t["topic"] for t in self._brief(texts)["one_more_to_master"]]
        self.assertEqual(names, ["streaky"])

    def test_live_mastery_stays_out_of_the_briefing(self):
        texts = [
            build_miss(self.ns, "done-topic", "q", "a", "m", "c", on=date(2026, 8, 1)),
            build_mastered(self.ns, "done-topic", [date(2026, 8, 1)], on=date(2026, 8, 10)),
        ]
        brief = self._brief(texts)
        self.assertEqual(brief["weak_topics"], [])
        self.assertEqual(brief["spot_check"], [])

    def test_expired_mastery_surfaces_for_spot_check(self):
        texts = [build_mastered(self.ns, "rusty", [date(2026, 1, 1)], on=date(2026, 6, 1))]
        self.assertEqual([s["topic"] for s in self._brief(texts)["spot_check"]], ["rusty"])

    def test_miss_after_mastery_voids_it_without_a_delete(self):
        """Append-only: a failed spot check must beat an existing MASTERED record."""
        texts = [
            build_mastered(self.ns, "regressed", [date(2026, 8, 1)], on=date(2026, 8, 5)),
            build_miss(self.ns, "regressed", "q", "a", "m", "c", on=date(2026, 8, 20)),
        ]
        self.assertEqual([t["topic"] for t in self._brief(texts)["weak_topics"]], ["regressed"])

    def test_headerless_memories_are_counted_not_dropped(self):
        texts = [
            build_miss(self.ns, "real-topic", "q", "a", "m", "c", on=self.today),
            "I always mix up beta blockers, analyze wrote this in its own words",
        ]
        brief = self._brief(texts)
        self.assertEqual(brief["unparsed_records"], 1)
        self.assertEqual(len(brief["weak_topics"]), 1)


class DisabledMemoryTests(SimpleTestCase):
    def test_briefing_is_inert_when_disabled(self):
        with patch.object(services, "memwal_enabled", return_value=False):
            brief = services.weakness_briefing(_StubUser(1), "Pharmacology")
        self.assertFalse(brief["enabled"])
        self.assertEqual(brief["weak_topics"], [])

    def test_recording_is_inert_when_disabled(self):
        with patch.object(services, "memwal_enabled", return_value=False):
            summary = services.record_quiz_attempt(_StubUser(1), None, [{"subtopic": "x", "is_correct": False}])
        self.assertFalse(summary["enabled"])
        self.assertEqual(summary["written"], 0)

    def test_relayer_failure_never_raises_into_the_request(self):
        """Grading must still succeed when memory is down."""
        boom = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("relayer unreachable"))
        with patch.object(services, "memwal_enabled", return_value=True), \
             patch.object(services, "_client", side_effect=boom):
            summary = services.record_quiz_attempt(_StubUser(1), None, [{"subtopic": "x", "is_correct": False}])
            brief = services.weakness_briefing(_StubUser(1), "Pharmacology")
        self.assertIn("relayer unreachable", summary["error"])
        self.assertIn("relayer unreachable", brief["error"])


# --- Steps 5 and 6: prompt weighting and advisor recall ---

from .records import misconception_of  # noqa: E402


class MisconceptionExtractionTests(SimpleTestCase):
    def test_misconception_is_returned_verbatim(self):
        text = build_miss(
            "ns", "topic", "q", "propranolol",
            "thought every beta blocker acts the same", "atenolol is beta-1 selective", on=ON,
        )
        self.assertEqual(misconception_of(text), "thought every beta blocker acts the same")

    def test_missing_misconception_gives_empty_string(self):
        self.assertEqual(misconception_of("HIT | ns | topic | 2026-08-22"), "")
        self.assertEqual(misconception_of(""), "")


class GenerationFocusTests(SimpleTestCase):
    def test_no_history_produces_no_guidance(self):
        """A first quiz must be generated exactly as it was before memory existed."""
        self.assertEqual(services.generation_focus({"enabled": True, "weak_topics": [], "spot_check": []}), "")
        self.assertEqual(services.generation_focus({"enabled": False}), "")
        self.assertEqual(services.generation_focus(None), "")

    def test_weak_topics_drive_the_sixty_percent(self):
        guidance = services.generation_focus({
            "enabled": True,
            "weak_topics": [{"topic": "beta-blocker-selectivity"}, {"topic": "ace-inhibitors"}],
            "spot_check": [{"topic": "diuretics"}],
        })
        self.assertIn("60 percent", guidance)
        self.assertIn("beta-blocker-selectivity", guidance)
        self.assertIn("ace-inhibitors", guidance)
        self.assertIn("30 percent", guidance)
        self.assertIn("10 percent", guidance)
        self.assertIn("diuretics", guidance)

    def test_guidance_forbids_inventing_absent_topics(self):
        guidance = services.generation_focus({
            "enabled": True, "weak_topics": [{"topic": "x"}], "spot_check": [],
        })
        self.assertIn("skip it rather than inventing", guidance)


class MisconceptionContextTests(SimpleTestCase):
    def setUp(self):
        self.user = _StubUser(1)
        self.ns = "sp-u1-pharmacology"

    def test_context_names_topic_count_and_stored_belief(self):
        texts = [
            build_miss(self.ns, "beta-blocker-selectivity", "q1", "propranolol",
                       "thought every beta blocker acts the same", "atenolol is selective",
                       on=date(2026, 8, 1)),
            build_miss(self.ns, "beta-blocker-selectivity", "q2", "propranolol",
                       "still assuming they are interchangeable", "atenolol is selective",
                       on=date(2026, 8, 20)),
        ]
        with patch.object(services, "memwal_enabled", return_value=True), \
             patch.object(services, "_client", return_value=_seeded_client(self.ns, texts)):
            out = services.misconception_context(self.user, "explain beta blockers", ["Pharmacology"])
        self.assertIn("beta-blocker-selectivity", out)
        self.assertIn("missed 2 time(s)", out)
        self.assertIn("2026-08-20", out)
        self.assertIn("still assuming they are interchangeable", out)

    def test_disabled_memory_gives_empty_context(self):
        with patch.object(services, "memwal_enabled", return_value=False):
            self.assertEqual(services.misconception_context(self.user, "q", ["Pharmacology"]), "")

    def test_failure_degrades_to_empty_not_an_exception(self):
        boom = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("relayer down"))
        with patch.object(services, "memwal_enabled", return_value=True), \
             patch.object(services, "_client", side_effect=boom):
            self.assertEqual(services.misconception_context(self.user, "q", ["Pharmacology"]), "")


# --- Study material memory: a separate plane from mistakes ---

from .records import build_material, source_of  # noqa: E402


class MaterialRecordTests(SimpleTestCase):
    def test_material_round_trips(self):
        text = build_material(
            "sp-u1-studied", "Beta Blockers", "youtube",
            "Cardio Pharm Lecture 3", "beta blocker selectivity and asthma risk",
            reference="https://www.youtube.com/watch?v=abc123", on=ON,
        )
        record = parse(text)
        self.assertEqual(record.kind, "MATERIAL")
        self.assertEqual(record.topic, "beta-blockers")
        self.assertEqual(source_of(text), "youtube")
        self.assertIn("Cardio Pharm Lecture 3", record.text)
        self.assertIn("youtube.com/watch?v=abc123", record.text)

    def test_source_missing_gives_empty_string(self):
        self.assertEqual(source_of("MISS | ns | topic | 2026-08-22 | sev:high"), "")


class MaterialNamespaceTests(SimpleTestCase):
    def test_study_namespace_is_separate_from_course_namespaces(self):
        """Materials must not land where the weakness briefing ranks."""
        user = _StubUser(1)
        self.assertEqual(services.study_namespace_for(user), "sp-u1-studied")
        self.assertNotEqual(services.study_namespace_for(user), services.namespace_for(user, "Pharmacology"))

    def test_study_namespace_is_per_user(self):
        self.assertNotEqual(services.study_namespace_for(_StubUser(1)), services.study_namespace_for(_StubUser(2)))


class MaterialContextTests(SimpleTestCase):
    def setUp(self):
        self.user = _StubUser(1)
        self.ns = "sp-u1-studied"

    def test_context_lists_videos_the_student_converted(self):
        texts = [
            build_material(self.ns, "beta-blockers", "youtube", "Cardio Pharm Lecture 3",
                           "beta blocker selectivity", on=date(2026, 8, 20)),
            build_material(self.ns, "diuretics", "pdf", "Renal Notes.pdf",
                           "loop diuretics", on=date(2026, 8, 21)),
        ]
        with patch.object(services, "memwal_enabled", return_value=True), \
             patch.object(services, "_client", return_value=_seeded_client(self.ns, texts)):
            out = services.material_context(self.user, "explain beta blockers")
        self.assertIn("Cardio Pharm Lecture 3", out)
        self.assertIn("youtube", out)
        self.assertIn("2026-08-20", out)

    def test_briefing_ignores_material_records(self):
        """A MATERIAL record must never be counted as a weakness."""
        texts = [build_material(self.ns, "beta-blockers", "youtube", "Lecture 3", "", on=date(2026, 8, 20))]
        with patch.object(services, "memwal_enabled", return_value=True), \
             patch.object(services, "_client", return_value=_seeded_client(self.ns, texts)):
            brief = services.weakness_briefing(self.user, "Pharmacology", on=date(2026, 8, 22))
        self.assertEqual(brief["weak_topics"], [])
        self.assertEqual(brief["unparsed_records"], 0)

    def test_disabled_and_failure_both_degrade_to_empty(self):
        with patch.object(services, "memwal_enabled", return_value=False):
            self.assertEqual(services.material_context(self.user, "q"), "")
        boom = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("relayer down"))
        with patch.object(services, "memwal_enabled", return_value=True), \
             patch.object(services, "_client", side_effect=boom):
            self.assertEqual(services.material_context(self.user, "q"), "")
            self.assertEqual(services.remember_material(self.user, "pdf", "T")["written"], 0)


# --- Study days: one SESSION record per finished day ---

from .records import build_session as _build_session, minutes_of  # noqa: E402


class SessionMinutesTests(SimpleTestCase):
    def test_session_carries_minutes_and_still_has_no_topic(self):
        text = _build_session("sp-u1-studied", ["beta-blockers"], drilled=10, new_misses=2, hits=3, minutes=47, on=ON)
        record = parse(text)
        self.assertEqual(record.kind, "SESSION")
        self.assertEqual(record.topic, "")
        self.assertEqual(record.on, ON)
        self.assertEqual(minutes_of(text), 47)

    def test_minutes_absent_reads_as_zero(self):
        self.assertEqual(minutes_of("SESSION | ns | 2026-08-22 | drilled:1 new_misses:0 hits:0"), 0)


class StudyHistoryTests(SimpleTestCase):
    def setUp(self):
        self.user = _StubUser(1)
        self.ns = "sp-u1-studied"

    def test_history_totals_minutes_across_days(self):
        texts = [
            _build_session(self.ns, [], 0, 0, 0, minutes=30, on=date(2026, 8, 20)),
            _build_session(self.ns, [], 0, 0, 0, minutes=45, on=date(2026, 8, 21)),
            _build_session(self.ns, [], 0, 0, 0, minutes=25, on=date(2026, 8, 22)),
        ]
        with patch.object(services, "memwal_enabled", return_value=True), \
             patch.object(services, "_client", return_value=_seeded_client(self.ns, texts)):
            history = services.study_history(self.user)
        self.assertEqual(history["total_minutes"], 100)
        self.assertEqual([d["date"] for d in history["days"]], ["2026-08-20", "2026-08-21", "2026-08-22"])

    def test_material_records_are_not_counted_as_study_days(self):
        texts = [
            build_material(self.ns, "topic", "pdf", "Notes.pdf", "", on=date(2026, 8, 20)),
            _build_session(self.ns, [], 0, 0, 0, minutes=15, on=date(2026, 8, 21)),
        ]
        with patch.object(services, "memwal_enabled", return_value=True), \
             patch.object(services, "_client", return_value=_seeded_client(self.ns, texts)):
            history = services.study_history(self.user)
        self.assertEqual(len(history["days"]), 1)
        self.assertEqual(history["total_minutes"], 15)

    def test_disabled_and_failure_degrade_safely(self):
        with patch.object(services, "memwal_enabled", return_value=False):
            self.assertEqual(services.study_history(self.user)["days"], [])
        boom = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("relayer down"))
        with patch.object(services, "memwal_enabled", return_value=True), \
             patch.object(services, "_client", side_effect=boom):
            self.assertEqual(services.study_history(self.user)["days"], [])
            self.assertEqual(services.remember_session(self.user, ON, 30)["written"], 0)


# --- MystenLabs/MemWal#741: recall always returns top-k regardless of relevance ---

class RecallDistanceTests(SimpleTestCase):
    """max_distance must be sent where relevance matters, and withheld where we
    are counting. Filtering a counting pass would undercount misses."""

    def setUp(self):
        self.user = _StubUser(1)

    def _spy(self):
        calls = []

        class SpyClient:
            def recall(self, query, **kwargs):
                calls.append(kwargs)
                class R:
                    results = []
                return R()

        return SpyClient(), calls

    def test_advisor_recalls_filter_by_relevance(self):
        client, calls = self._spy()
        with patch.object(services, "memwal_enabled", return_value=True), \
             patch.object(services, "_client", return_value=client):
            services.misconception_context(self.user, "beta blockers", ["Pharmacology"])
            services.material_context(self.user, "beta blockers")
        self.assertTrue(calls, "expected recall to be called")
        for kwargs in calls:
            self.assertEqual(kwargs.get("max_distance"), services.MAX_RECALL_DISTANCE)

    def test_counting_recalls_do_not_filter(self):
        client, calls = self._spy()
        with patch.object(services, "memwal_enabled", return_value=True), \
             patch.object(services, "_client", return_value=client):
            services.weakness_briefing(self.user, "Pharmacology")
            services.study_history(self.user)
        self.assertTrue(calls, "expected recall to be called")
        for kwargs in calls:
            self.assertNotIn("max_distance", kwargs, "counting passes must see every record")

    def test_threshold_sits_between_measured_on_topic_and_unrelated(self):
        """Measured live: on-topic 0.35-0.64, unrelated 0.84+."""
        self.assertGreater(services.MAX_RECALL_DISTANCE, 0.64)
        self.assertLess(services.MAX_RECALL_DISTANCE, 0.84)
