"""Record format for Exam Mistake Memory.

Walrus Memory is append-only: there is no update or delete. So nothing here
stores a counter. Every event is a new record, and counts are derived by
recalling records and counting them.

The record text *is* the schema. A pipe-delimited header carries the fields we
need to rank on, and the prose underneath exists so semantic recall can find it.
A record without a valid header cannot be parsed later, which is why `parse`
returns None for those rather than guessing: callers count the failures instead
of silently dropping them.

Pure functions only. No I/O, no Django, no network, so this is unit-testable
without credentials or a relayer.
"""
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, timedelta

VALID_KINDS = ("MISS", "HIT", "MASTERED", "PATTERN", "SESSION", "MATERIAL")
SEVERITY_WEIGHTS = {"high": 3, "medium": 2, "low": 1}
DEFAULT_SEVERITY = "medium"
MASTERY_DAYS = 30

# SESSION records carry no topic, so the topic group is optional. The negative
# lookahead stops an absent topic from letting the date slide into the topic
# slot, which would otherwise make every SESSION record parse with topic set to
# a date and no date at all.
_HEADER = re.compile(
    r"^(?P<kind>MISS|HIT|MASTERED|PATTERN|SESSION|MATERIAL)\s*\|\s*"
    r"(?P<namespace>[^|]+?)\s*\|\s*"
    r"(?:(?P<topic>(?!\d{4}-\d{2}-\d{2}\s*(?:\||$))[^|]+?)\s*\|\s*)?"
    r"(?P<date>\d{4}-\d{2}-\d{2})"
    r"(?P<rest>\s*\|.*)?$"
)

_SEVERITY = re.compile(r"sev:\s*(high|medium|low)", re.IGNORECASE)
_EXPIRES = re.compile(r"expires:\s*(\d{4}-\d{2}-\d{2})")
_MISCONCEPTION = re.compile(r"My misconception:\s*(.+?)(?:\n|$)", re.IGNORECASE | re.DOTALL)
_SOURCE = re.compile(r"source:\s*([a-z0-9_]+)", re.IGNORECASE)


@dataclass(frozen=True)
class ParsedRecord:
    kind: str
    namespace: str
    topic: str
    on: date
    severity: str
    expires: date
    text: str


def slugify_topic(value):
    """Stable join key across every record type.

    Drift here is the one failure mode that quietly destroys the whole record:
    "beta blocker selectivity" and "Beta-Blocker Selectivity" must collapse to
    the same slug or their misses will never be counted together.
    """
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", str(value))
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")[:120]


def _on(on):
    return (on or date.today()).isoformat()


def _severity(severity):
    value = (severity or DEFAULT_SEVERITY).lower()
    return value if value in SEVERITY_WEIGHTS else DEFAULT_SEVERITY


def build_miss(namespace, topic, question, answered, misconception, correct, severity=DEFAULT_SEVERITY, on=None):
    return (
        f"MISS | {namespace} | {slugify_topic(topic)} | {_on(on)} | sev:{_severity(severity)}\n"
        f"Q: {question}\n"
        f"I answered: {answered}. My misconception: {misconception}.\n"
        f"Correct: {correct}"
    )


def build_hit(namespace, topic, on=None):
    return (
        f"HIT | {namespace} | {slugify_topic(topic)} | {_on(on)}\n"
        f"Answered correctly on a previously missed topic."
    )


def build_mastered(namespace, topic, correct_dates, on=None):
    when = on or date.today()
    expires = when + timedelta(days=MASTERY_DAYS)
    dates = ", ".join(d.isoformat() if hasattr(d, "isoformat") else str(d) for d in correct_dates)
    return (
        f"MASTERED | {namespace} | {slugify_topic(topic)} | {when.isoformat()} | expires:{expires.isoformat()}\n"
        f"Correct on {dates}. Spot-check again after the expiry date."
    )


def build_material(namespace, topic, source_type, title, summary, reference="", on=None):
    """What the student actually studied, as opposed to what they got wrong.

    Kept in its own namespace so it never dilutes the mistake recall the
    weakness briefing ranks over.
    """
    lines = [
        f"MATERIAL | {namespace} | {slugify_topic(topic)} | {_on(on)} | source:{source_type}",
        f"Studied: {title}",
    ]
    if summary:
        lines.append(f"Covers: {summary}")
    if reference:
        lines.append(f"Reference: {reference}")
    return "\n".join(lines)


def source_of(text):
    """The source tag from a MATERIAL header, for example pdf or youtube."""
    match = _SOURCE.search(str(text or ""))
    return match.group(1).strip() if match else ""


def build_pattern(pattern_name, body, subjects, on=None):
    tags = ",".join(subjects or [])
    return (
        f"PATTERN | exam-intel | {slugify_topic(pattern_name)} | {_on(on)} | subjects:{tags}\n"
        f"{body}"
    )


def build_session(namespace, topics, drilled, new_misses, hits, on=None):
    slugs = ", ".join(slugify_topic(topic) for topic in topics if slugify_topic(topic))
    return (
        f"SESSION | {namespace} | {_on(on)} | drilled:{drilled} new_misses:{new_misses} hits:{hits}\n"
        f"Topics: {slugs}"
    )


def misconception_of(text):
    """Pull the stored misconception out of a MISS record, verbatim.

    Quoting it back unchanged is the point: paraphrasing it into something
    softer loses the exact wrong model the student had.
    """
    match = _MISCONCEPTION.search(str(text or ""))
    return match.group(1).strip().rstrip(".") if match else ""


def parse(text):
    """Parse one stored record, or None if it carries no valid header.

    `memwal_analyze` writes in its own words and will land here headerless.
    Returning None rather than a best guess keeps unparseable memories countable,
    so formatting drift shows up as a number instead of a briefing that quietly
    degrades.
    """
    if not text:
        return None
    lines = str(text).strip().splitlines()
    if not lines:
        return None
    header = _HEADER.match(lines[0].strip())
    if not header:
        return None

    try:
        on = date.fromisoformat(header.group("date"))
    except ValueError:
        return None

    rest = header.group("rest") or ""
    severity_match = _SEVERITY.search(rest)
    expires_match = _EXPIRES.search(rest)
    try:
        expires = date.fromisoformat(expires_match.group(1)) if expires_match else None
    except ValueError:
        expires = None

    return ParsedRecord(
        kind=header.group("kind"),
        namespace=(header.group("namespace") or "").strip(),
        topic=slugify_topic(header.group("topic")),
        on=on,
        severity=severity_match.group(1).lower() if severity_match else DEFAULT_SEVERITY,
        expires=expires,
        text=str(text),
    )
