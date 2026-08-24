"""Walrus Memory integration for exam mistake memory.

Memory is strictly optional. If the relayer is slow, down, or unconfigured, quiz
submission still returns a score: every public function here swallows its own
failures and logs them. Nothing in this module may raise into a request.

Counts are never stored. `record_quiz_attempt` appends records and
`weakness_briefing` counts what comes back, because the underlying API is
append-only with no update or delete.
"""
import logging
from collections import defaultdict
from datetime import date

from django.conf import settings

from .records import (
    SEVERITY_WEIGHTS,
    build_hit,
    build_material,
    build_miss,
    build_progress,
    build_session,
    checkpoint_at,
    label_of,
    minutes_of,
    misconception_of,
    parse,
    payload_of,
    slugify_topic,
    source_of,
    status_of,
)

logger = logging.getLogger(__name__)

BULK_CHUNK = 20          # remember_bulk accepts 1-20 items
RECALL_LIMIT = 50        # the API default of 10 would make a "top 5" a top-5-of-10
# recall returns its top-k regardless of relevance, so an unrelated question
# still gets k records back. Measured on a live namespace: on-topic hits land
# at 0.35-0.64 cosine distance, unrelated ones at 0.84 and above. 0.70 sits in
# the gap with margin either side. See MystenLabs/MemWal#741.
MAX_RECALL_DISTANCE = 0.70
RECENCY_HALF_LIFE_DAYS = 30
TOP_TOPICS = 5

# Record kind -> the bucket it groups into. Explicit because deriving the plural
# from the kind silently produced "mastereds" and lost every mastery record.
_BUCKETS = {"MISS": "misses", "HIT": "hits", "MASTERED": "mastered"}


def memwal_enabled():
    return bool(
        getattr(settings, "MEMWAL_ENABLED", False)
        and getattr(settings, "MEMWAL_ACCOUNT_ID", "")
        and getattr(settings, "MEMWAL_PRIVATE_KEY", "")
    )


def _client(namespace):
    """Build a client for one namespace.

    Imported lazily so the app boots when the memwal package is absent. Tests
    monkeypatch this to return MemWalMockSync, which needs no credentials.
    """
    from memwal import MemWalSync

    return MemWalSync.create(
        key=settings.MEMWAL_PRIVATE_KEY,
        account_id=settings.MEMWAL_ACCOUNT_ID,
        namespace=namespace,
        env=settings.MEMWAL_ENV,
    )


def namespace_for(user, course_title):
    """Per-student, per-course namespace.

    Security-critical. Under a server-owned account the namespace string is the
    only thing separating one student's mistakes from another's, so this must
    stay pure, deterministic and user-id prefixed.
    """
    course = slugify_topic(course_title) or "general"
    return f"sp-u{user.id}-{course}"


def _chunks(items, size=BULK_CHUNK):
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _recall_texts(client, namespace, query, limit=RECALL_LIMIT, max_distance=None):
    """Return (texts, truncated). Truncated means recall came back full, so the
    caller is ranking over a sample rather than everything stored.

    `max_distance` is only passed when relevance is what we are after. recall
    always returns its top-k, so without it an unrelated question still gets k
    records back, and the advisor would cheerfully cite them. Measured against a
    real namespace: on-topic hits sit at 0.35-0.64, unrelated ones at 0.84+.

    Counting passes (the briefing, study history) deliberately omit it: they
    want every record in the namespace, and filtering by relevance to a generic
    query would undercount misses and drop study days.
    """
    kwargs = {"limit": limit, "namespace": namespace}
    if max_distance is not None:
        kwargs["max_distance"] = max_distance
    result = client.recall(query, **kwargs)
    texts = [item.text for item in getattr(result, "results", []) or []]
    return texts, len(texts) >= limit


def _previously_missed(client, namespace):
    """Slugs with at least one MISS, so we know which correct answers are HITs.

    Without this, HIT records are never written, streaks are uncomputable, and
    every topic a student ever failed stays weak forever.
    """
    texts, _ = _recall_texts(client, namespace, "past mistakes and misconceptions")
    missed = set()
    for text in texts:
        record = parse(text)
        if record and record.kind == "MISS" and record.topic:
            missed.add(record.topic)
    return missed


def record_quiz_attempt(user, quiz, details, on=None):
    """Append a MISS per wrong answer and a HIT per correct answer on a topic
    already missed. Returns a summary dict; never raises."""
    summary = {"enabled": False, "written": 0, "misses": 0, "hits": 0, "error": ""}
    if not memwal_enabled():
        return summary
    summary["enabled"] = True

    try:
        from memwal import RememberBulkItem

        namespace = namespace_for(user, getattr(quiz, "course_title", ""))
        client = _client(namespace)
        missed_before = _previously_missed(client, namespace)
        when = on or date.today()

        items = []
        for detail in details:
            topic = slugify_topic(detail.get("subtopic") or "")
            if not topic:
                # No subtopic means nothing to group by, so storing it would only
                # add noise to recall.
                continue
            if detail.get("is_correct"):
                if topic in missed_before:
                    items.append(RememberBulkItem(text=build_hit(namespace, topic, on=when), namespace=namespace))
                    summary["hits"] += 1
                continue
            items.append(
                RememberBulkItem(
                    text=build_miss(
                        namespace=namespace,
                        topic=topic,
                        question=detail.get("question", ""),
                        answered=detail.get("selected_answer", "") or "(no answer)",
                        misconception=f"answered {detail.get('selected_answer', '') or 'nothing'} instead of {detail.get('correct_answer', '')}",
                        correct=detail.get("correct_answer", ""),
                        severity="medium",
                        on=when,
                    ),
                    namespace=namespace,
                )
            )
            summary["misses"] += 1

        for chunk in _chunks(items):
            client.remember_bulk_async(chunk)
            summary["written"] += len(chunk)
    except Exception as exc:  # memory must never break grading
        summary["error"] = str(exc)
        logger.warning("Walrus memory write failed for user=%s: %s", getattr(user, "id", None), exc, exc_info=True)

    return summary


def study_namespace_for(user):
    """One namespace per student for everything they have studied.

    Deliberately separate from the per-course mistake namespaces: the weakness
    briefing ranks over what it recalls, so mixing uploads and videos in there
    would bury the misses under material the student never got wrong.
    """
    return f"sp-u{user.id}-studied"


def progress_namespace_for(user):
    """Unfinished work, kept apart from mistakes and materials.

    Checkpoints are noisy by nature (one per answer), so they must not sit
    where the briefing counts misses or the advisor looks for study material.
    """
    return f"sp-u{user.id}-progress"


def save_progress(user, activity_key, label, payload, status="active"):
    """Checkpoint an unfinished quiz, deck, or generation. Never raises.

    Append-only, so finishing writes a `status:done` record rather than
    removing the active one; `resume_points` takes the newest per activity.
    """
    if not memwal_enabled():
        return {"enabled": False, "written": 0, "error": ""}
    try:
        from memwal import RememberBulkItem

        namespace = progress_namespace_for(user)
        text = build_progress(
            namespace=namespace,
            activity_key=activity_key,
            label=label,
            payload=payload,
            status=status,
        )
        _client(namespace).remember_bulk_async([RememberBulkItem(text=text, namespace=namespace)])
        return {"enabled": True, "written": 1, "error": ""}
    except Exception as exc:
        logger.warning("Walrus progress write failed for user=%s: %s", getattr(user, "id", None), exc, exc_info=True)
        return {"enabled": True, "written": 0, "error": str(exc)}


def resume_points(user, limit=RECALL_LIMIT):
    """Work this student left unfinished, newest checkpoint per activity.

    Deliberately unfiltered by distance: this answers "what was I doing", not
    "what is relevant to this question", so every checkpoint must be seen.
    """
    empty = {"enabled": False, "items": [], "error": ""}
    if not memwal_enabled():
        return empty
    try:
        namespace = progress_namespace_for(user)
        texts, _ = _recall_texts(_client(namespace), namespace, "unfinished quiz flashcards in progress", limit=limit)

        newest = {}
        for text in texts:
            record = parse(text)
            if not record or record.kind != "PROGRESS" or not record.topic:
                continue
            stamp = checkpoint_at(text)
            current = newest.get(record.topic)
            # On an exact tie, "done" wins. Offering to resume something already
            # finished is worse than missing a resume point.
            newer = not current or stamp > current["at"] or (
                stamp == current["at"] and status_of(text) == "done"
            )
            if newer:
                newest[record.topic] = {"at": stamp, "text": text, "on": record.on}

        items = []
        for key, entry in newest.items():
            # A finished activity leaves its "done" record as the newest one,
            # which is how completion is expressed without a delete.
            if status_of(entry["text"]) != "active":
                continue
            items.append({
                "key": key,
                "label": label_of(entry["text"]),
                "saved_at": entry["at"],
                "date": entry["on"].isoformat(),
                "payload": payload_of(entry["text"]),
            })
        items.sort(key=lambda item: item["saved_at"], reverse=True)
        return {"enabled": True, "items": items, "error": ""}
    except Exception as exc:
        logger.warning("Walrus resume lookup failed for user=%s: %s", getattr(user, "id", None), exc, exc_info=True)
        return {"enabled": True, "items": [], "error": str(exc)}


def remember_material(user, source_type, title, topic="", summary="", reference=""):
    """Record that a student studied something. Never raises.

    Called from PDF upload, the YouTube tools, and deck generation, so the
    advisor can later say what the student has actually been working through.
    """
    if not memwal_enabled():
        return {"enabled": False, "written": 0, "error": ""}
    try:
        from memwal import RememberBulkItem

        namespace = study_namespace_for(user)
        text = build_material(
            namespace=namespace,
            topic=topic or title,
            source_type=source_type,
            title=title,
            summary=summary,
            reference=reference,
        )
        _client(namespace).remember_bulk_async([RememberBulkItem(text=text, namespace=namespace)])
        return {"enabled": True, "written": 1, "error": ""}
    except Exception as exc:
        logger.warning("Walrus material write failed for user=%s: %s", getattr(user, "id", None), exc, exc_info=True)
        return {"enabled": True, "written": 0, "error": str(exc)}


def remember_session(user, on, minutes, topics=None, drilled=0, new_misses=0, hits=0):
    """Roll a finished study day into one SESSION record. Never raises.

    Written once per day, after the day is over, because the store is
    append-only: writing on every heartbeat would append hundreds of
    near-identical records and make the day impossible to count.
    """
    if not memwal_enabled():
        return {"enabled": False, "written": 0, "error": ""}
    try:
        from memwal import RememberBulkItem

        namespace = study_namespace_for(user)
        text = build_session(
            namespace=namespace,
            topics=topics or [],
            drilled=drilled,
            new_misses=new_misses,
            hits=hits,
            minutes=minutes,
            on=on,
        )
        _client(namespace).remember_bulk_async([RememberBulkItem(text=text, namespace=namespace)])
        return {"enabled": True, "written": 1, "error": ""}
    except Exception as exc:
        logger.warning("Walrus session write failed for user=%s: %s", getattr(user, "id", None), exc, exc_info=True)
        return {"enabled": True, "written": 0, "error": str(exc)}


def study_history(user, limit=RECALL_LIMIT):
    """Days studied, recalled from memory rather than the local database.

    This is the part that survives the database: the record of how much a
    student actually showed up lives on Walrus.
    """
    if not memwal_enabled():
        return {"enabled": False, "days": [], "total_minutes": 0, "error": ""}
    try:
        namespace = study_namespace_for(user)
        texts, _ = _recall_texts(_client(namespace), namespace, "study session minutes", limit=limit)
        days = []
        for text in texts:
            record = parse(text)
            if not record or record.kind != "SESSION":
                continue
            days.append({"date": record.on.isoformat(), "minutes": minutes_of(record.text)})
        days.sort(key=lambda item: item["date"])
        return {
            "enabled": True,
            "days": days,
            "total_minutes": sum(day["minutes"] for day in days),
            "error": "",
        }
    except Exception as exc:
        logger.warning("Walrus study history failed for user=%s: %s", getattr(user, "id", None), exc, exc_info=True)
        return {"enabled": True, "days": [], "total_minutes": 0, "error": str(exc)}


def material_context(user, query, limit=RECALL_LIMIT, max_lines=6):
    """What this student has studied that relates to the question. Never raises."""
    if not memwal_enabled():
        return ""
    try:
        namespace = study_namespace_for(user)
        texts, _ = _recall_texts(_client(namespace), namespace, query, limit=limit, max_distance=MAX_RECALL_DISTANCE)
        lines = []
        for text in texts:
            record = parse(text)
            if not record or record.kind != "MATERIAL":
                continue
            title = ""
            covers = ""
            for line in str(record.text).splitlines():
                if line.startswith("Studied: "):
                    title = line[len("Studied: "):].strip()
                elif line.startswith("Covers: "):
                    covers = line[len("Covers: "):].strip()
            if not title:
                continue
            label = source_of(record.text) or "material"
            lines.append(f"- {label} on {record.on.isoformat()}: {title}" + (f" — {covers}" if covers else ""))
        return "\n".join(lines[:max_lines])
    except Exception as exc:
        logger.warning("Walrus material recall failed for user=%s: %s", getattr(user, "id", None), exc, exc_info=True)
        return ""


def misconception_context(user, query, course_titles, per_namespace_limit=10, max_courses=4, max_lines=6):
    """Past misconceptions relevant to what the student just asked.

    This is what makes StudyPilot and a Claude Code session on the same
    namespace behave like one assistant rather than two. Returns "" on any
    failure so the advisor still answers.
    """
    if not memwal_enabled():
        return ""
    lines = []
    try:
        for course in (course_titles or [])[:max_courses]:
            namespace = namespace_for(user, course)
            texts, _ = _recall_texts(_client(namespace), namespace, query, limit=per_namespace_limit, max_distance=MAX_RECALL_DISTANCE)
            by_topic = defaultdict(list)
            for text in texts:
                record = parse(text)
                if record and record.kind == "MISS" and record.topic:
                    by_topic[record.topic].append(record)
            for topic, records in by_topic.items():
                last = max(r.on for r in records)
                belief = misconception_of(max(records, key=lambda r: r.on).text)
                lines.append(
                    f"- {topic}: missed {len(records)} time(s), most recently {last.isoformat()}."
                    + (f" Their stored misconception: {belief}." if belief else "")
                )
    except Exception as exc:
        logger.warning("Walrus memory advisor recall failed for user=%s: %s", getattr(user, "id", None), exc, exc_info=True)
        return ""
    return "\n".join(lines[:max_lines])


def generation_focus(briefing):
    """Turn a briefing into prompt guidance, roughly 60/30/10.

    Returns "" when there is no history, so a first quiz is generated exactly as
    it was before memory existed.
    """
    if not briefing or not briefing.get("enabled"):
        return ""
    weak = [item["topic"] for item in briefing.get("weak_topics", [])]
    spot = [item["topic"] for item in briefing.get("spot_check", [])]
    if not weak and not spot:
        return ""

    lines = ["", "This student has a mistake history with this material. Weight the quiz:"]
    if weak:
        lines.append(f"- About 60 percent of questions should target these previously missed subtopics: {', '.join(weak)}.")
    lines.append("- About 30 percent should cover new material from the context.")
    if spot:
        lines.append(f"- About 10 percent should spot check these previously mastered subtopics: {', '.join(spot)}.")
    # Without this the model will happily invent a question about a remembered
    # topic that this particular document never covers.
    lines.append(
        "Only use concepts that actually appear in the provided context. If a listed "
        "subtopic is absent from the context, skip it rather than inventing content."
    )
    return "\n".join(lines)


def _weakness_score(misses, severity, last_missed, today):
    """misses x severity x recency, recency halving every 30 days."""
    age_days = max((today - last_missed).days, 0)
    recency = 0.5 ** (age_days / RECENCY_HALF_LIFE_DAYS)
    return round(misses * SEVERITY_WEIGHTS.get(severity, 2) * recency, 2)


def weakness_briefing(user, course_title, limit=RECALL_LIMIT, on=None):
    """Rank topics by weakness from stored records.

    `truncated` and `unparsed_records` are returned rather than hidden: the first
    says the ranking is over a sample, the second turns formatting drift into a
    number instead of a briefing that quietly degrades.
    """
    briefing = {
        "enabled": False,
        "namespace": "",
        "weak_topics": [],
        "one_more_to_master": [],
        "spot_check": [],
        "truncated": False,
        "unparsed_records": 0,
        "total_records": 0,
        "error": "",
    }
    if not memwal_enabled():
        return briefing

    briefing["enabled"] = True
    today = on or date.today()
    try:
        namespace = namespace_for(user, course_title)
        briefing["namespace"] = namespace
        client = _client(namespace)
        texts, truncated = _recall_texts(client, namespace, "weak topics and repeated mistakes", limit=limit)
        briefing["truncated"] = truncated
        briefing["total_records"] = len(texts)

        by_topic = defaultdict(lambda: {"misses": [], "hits": [], "mastered": []})
        for text in texts:
            record = parse(text)
            if not record:
                briefing["unparsed_records"] += 1
                continue
            bucket = _BUCKETS.get(record.kind)
            if bucket and record.topic:
                by_topic[record.topic][bucket].append(record)

        for topic, groups in by_topic.items():
            misses, hits, mastered = groups["misses"], groups["hits"], groups["mastered"]
            last_miss = max((r.on for r in misses), default=None)

            # Mastery is live only if it has not expired and no MISS is dated
            # after it, which is how a failed spot check voids it with no delete.
            live_mastery = any(
                m.expires and today <= m.expires and (last_miss is None or last_miss <= m.on)
                for m in mastered
            )
            if live_mastery:
                continue

            expired = [m for m in mastered if m.expires and today > m.expires]
            if expired and not misses:
                briefing["spot_check"].append({"topic": topic, "expired_on": max(m.expires for m in expired).isoformat()})
                continue

            if not misses:
                continue

            streak = sorted({h.on for h in hits if h.on > last_miss})
            severity = max((m.severity for m in misses), key=lambda s: SEVERITY_WEIGHTS.get(s, 2))
            entry = {
                "topic": topic,
                "misses": len(misses),
                "last_missed": last_miss.isoformat(),
                "severity": severity,
                "streak": len(streak),
                "score": _weakness_score(len(misses), severity, last_miss, today),
            }
            if len(streak) >= 2:
                briefing["one_more_to_master"].append(entry)
            briefing["weak_topics"].append(entry)

        briefing["weak_topics"].sort(key=lambda item: item["score"], reverse=True)
        briefing["weak_topics"] = briefing["weak_topics"][:TOP_TOPICS]
    except Exception as exc:
        briefing["error"] = str(exc)
        logger.warning("Walrus memory briefing failed for user=%s: %s", getattr(user, "id", None), exc, exc_info=True)

    return briefing
