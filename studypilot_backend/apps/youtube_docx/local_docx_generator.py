import re
from collections import Counter
from urllib.parse import parse_qs, urlparse

from apps.documents.services import clean_extracted_text, clean_safe_string
from apps.study_tools.local_generators import (
    detect_definitions,
    detect_headings,
    extract_keywords,
    generate_mcqs_locally,
    select_important_sentences,
    split_into_paragraphs,
    split_into_sentences,
)


STOPWORDS = {
    "about",
    "after",
    "again",
    "also",
    "because",
    "before",
    "between",
    "could",
    "during",
    "every",
    "from",
    "have",
    "into",
    "more",
    "other",
    "should",
    "that",
    "their",
    "there",
    "these",
    "this",
    "through",
    "where",
    "which",
    "with",
    "would",
}


def extract_youtube_video_id(url):
    value = (url or "").strip()
    if not re.match(r"^https?://", value, re.IGNORECASE):
        value = f"https://{value}"
    parsed = urlparse(value)
    host = parsed.netloc.lower().replace("www.", "")
    video_id = ""
    if host in {"youtube.com", "m.youtube.com", "music.youtube.com"}:
        if parsed.path == "/watch":
            video_id = (parse_qs(parsed.query).get("v") or [""])[0]
        for prefix in ("/shorts/", "/embed/"):
            if parsed.path.startswith(prefix):
                video_id = parsed.path.split("/")[2]
    elif host == "youtu.be":
        video_id = parsed.path.strip("/").split("/")[0]
    video_id = re.sub(r"[^A-Za-z0-9_-]", "", video_id or "")
    return video_id if re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id) else ""


def fetch_video_metadata(url):
    from yt_dlp import YoutubeDL

    with YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True, "noplaylist": True}) as ydl:
        return ydl.extract_info(url, download=False)


def fetch_transcript(video_id):
    from youtube_transcript_api import YouTubeTranscriptApi

    api = YouTubeTranscriptApi()
    transcript_list = api.list(video_id)
    preferred = ["en", "en-US", "en-GB"]
    for finder in (
        lambda: transcript_list.find_manually_created_transcript(preferred),
        lambda: transcript_list.find_generated_transcript(preferred),
        lambda: transcript_list.find_transcript(preferred),
    ):
        try:
            return finder().fetch()
        except Exception:
            continue
    for transcript in transcript_list:
        try:
            return transcript.translate("en").fetch() if transcript.is_translatable else transcript.fetch()
        except Exception:
            continue
    return []


def clean_transcript(transcript):
    if isinstance(transcript, str):
        text = transcript
    else:
        lines = []
        for item in transcript or []:
            text = item.get("text") if isinstance(item, dict) else getattr(item, "text", "")
            if text:
                lines.append(text)
        text = " ".join(lines)
    text = re.sub(r"\[(Music|Applause|Laughter|Noise)[^\]]*\]", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(\w+)(\s+\1\b){2,}", r"\1", text, flags=re.IGNORECASE)
    return clean_extracted_text(text)


def group_transcript_by_time(transcript):
    groups = []
    current = []
    start = 0
    for item in transcript or []:
        if not isinstance(item, dict):
            continue
        if not current:
            start = int(item.get("start") or 0)
        current.append(item.get("text", ""))
        end = int((item.get("start") or 0) + (item.get("duration") or 0))
        if len(" ".join(current)) >= 900:
            groups.append({"start": start, "end": end, "text": clean_transcript(" ".join(current))})
            current = []
    if current:
        groups.append({"start": start, "end": end, "text": clean_transcript(" ".join(current))})
    return groups


def extract_keywords_from_transcript(text, limit=45):
    keywords = extract_keywords(text, limit=limit)
    if keywords:
        return keywords
    words = re.findall(r"\b[A-Za-z][A-Za-z-]{4,}\b", text.lower())
    counts = Counter(word for word in words if word not in STOPWORDS)
    return [word.title() for word, _ in counts.most_common(limit)]


def rank_important_sentences(text, limit=90):
    sentences = select_important_sentences(text, limit=max(limit, 120))
    keywords = {keyword.lower() for keyword in extract_keywords_from_transcript(text, 60)}

    def score(sentence):
        lowered = sentence.lower()
        return sum(2 for keyword in keywords if keyword.lower() in lowered) + min(len(sentence) / 90, 2)

    return sorted(sentences, key=score, reverse=True)[:limit]


def _timestamp(seconds):
    seconds = int(seconds or 0)
    minutes, secs = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes}:{secs:02d}"


def _take(items, count):
    return [item for item in items if item][:count]


def _section_markdown(title, lines, level=2):
    prefix = "#" * level
    content = [f"{prefix} {title}"]
    for line in lines:
        content.append(line)
    return "\n".join(content)


def build_local_study_document_structure(transcript, metadata, options):
    options = options or {}
    text = clean_transcript(transcript)
    sentences = split_into_sentences(text)
    paragraphs = split_into_paragraphs(text)
    keywords = extract_keywords_from_transcript(text, 50)
    important = rank_important_sentences(text, 110)
    definitions = detect_definitions(text)
    headings = detect_headings(text)
    transcript_groups = group_transcript_by_time(transcript if isinstance(transcript, list) else [])
    detail = options.get("detail_level", "comprehensive")
    style = options.get("document_style", "study_guide")
    custom = clean_safe_string(options.get("custom_instruction", ""), max_length=300)

    main_count = {"summary": 18, "comprehensive": 34, "full_study_notes": 55}.get(detail, 34)
    title = metadata.get("title") or "YouTube Lecture"
    channel = metadata.get("channel") or "Unknown channel"
    content = [
        "# Introduction",
        f"This StudyPilot document turns the lecture **{title}** by {channel} into structured study notes. It is created from the available transcript and is not a verbatim copy.",
    ]
    if custom:
        content.append(f"Custom focus: {custom}")

    objectives = _take([f"- Understand {keyword} and its role in the lecture." for keyword in keywords[:8]], 8)
    if not objectives:
        objectives = ["- Identify the main ideas from the lecture.", "- Review the most important explanations and examples."]
    content.append(_section_markdown("Learning Objectives", objectives))

    notes = []
    for index, sentence in enumerate(important[:main_count], 1):
        notes.append(f"{index}. {sentence}")
    content.append(_section_markdown("Main Lecture Notes", notes))

    timestamp_lines = []
    if transcript_groups:
        for index, group in enumerate(transcript_groups[:12], 1):
            label = f"{_timestamp(group['start'])} - {_timestamp(group['end'])}"
            summary = " ".join(split_into_sentences(group["text"])[:3]) or group["text"][:420]
            timestamp_lines.append(f"### Section {index}: {label}")
            timestamp_lines.append(summary)
    else:
        for index, paragraph in enumerate(paragraphs[:10], 1):
            timestamp_lines.append(f"### Lecture Section {index}")
            timestamp_lines.append(paragraph)
    content.append(_section_markdown("Timestamped Sections", timestamp_lines))

    content.append(_section_markdown("Key Concepts", [f"- **{keyword}**" for keyword in keywords[:24]]))

    definition_lines = []
    for item in definitions[:18]:
        if isinstance(item, dict):
            term = item.get("term", "")
            definition = item.get("definition", "")
        else:
            term = item[0] if len(item) > 0 else ""
            definition = item[1] if len(item) > 1 else ""
        if term and definition:
            definition_lines.append(f"- **{term}:** {definition}")
    if not definition_lines:
        for keyword, sentence in zip(keywords[:12], important[:12]):
            definition_lines.append(f"- **{keyword}:** {sentence}")
    content.append(_section_markdown("Definitions", definition_lines))

    takeaways = [f"- {sentence}" for sentence in important[main_count:main_count + 18]]
    content.append(_section_markdown("Important Takeaways", takeaways or [f"- {sentence}" for sentence in important[:12]]))

    summary = " ".join(important[:10])
    content.append(_section_markdown("Summary", [summary or "The lecture explains the key ideas listed in the notes and revision sections."]))

    revision_questions = []
    for keyword in keywords[:12]:
        revision_questions.append(f"{len(revision_questions) + 1}. Explain {keyword} in your own words.")
    content.append(_section_markdown("Revision Questions", revision_questions))

    try:
        mcqs = generate_mcqs_locally(text, 10, "medium")["mcqs"]
    except Exception:
        mcqs = []
    mcq_lines = []
    for index, item in enumerate(mcqs[:10], 1):
        mcq_lines.append(f"{index}. {item['question']}")
        for option in item.get("options", []):
            marker = " (answer)" if option.get("is_correct") else ""
            mcq_lines.append(f"   - {option.get('option_text')}{marker}")
        mcq_lines.append(f"   Explanation: {item.get('explanation', '')}")
    content.append(_section_markdown("MCQs With Answers", mcq_lines))

    short_answer_lines = []
    for index, sentence in enumerate(important[:10], 1):
        keyword = keywords[index - 1] if index - 1 < len(keywords) else "this idea"
        short_answer_lines.append(f"{index}. What does the lecture say about {keyword}?")
        short_answer_lines.append(f"   Suggested answer: {sentence}")
    content.append(_section_markdown("Short Answer Questions", short_answer_lines))

    glossary = [f"- **{keyword}:** Review this term using the lecture notes and examples above." for keyword in keywords[:20]]
    content.append(_section_markdown("Glossary", glossary))

    checklist = [
        "- Review the learning objectives.",
        "- Read the timestamped notes.",
        "- Test yourself with the MCQs.",
        "- Answer the short answer questions without checking the suggested answers first.",
        "- Revisit weak concepts and write a one-page summary.",
    ]
    if style == "exam_revision":
        checklist.insert(0, "- Memorize the definitions and key differences.")
    elif style == "tutorial":
        checklist.insert(0, "- Recreate the steps or examples from the lecture.")
    content.append(_section_markdown("Final Study Checklist", checklist))

    section_count = len(re.findall(r"^#{1,3}\s+", "\n".join(content), flags=re.MULTILINE))
    return {
        "content": "\n\n".join(content),
        "sections_count": section_count,
        "short_video_note": len(text) < 3500,
        "keywords": keywords,
    }


def generate_docx_file(document_structure, metadata, options):
    return document_structure
