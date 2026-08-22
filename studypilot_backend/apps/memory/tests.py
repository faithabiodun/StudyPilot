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
