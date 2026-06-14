"""Reliable YouTube transcript fetching with multiple fallback sources.

The goal of this module is simple: get usable text out of a YouTube video as
often as possible, and when it genuinely cannot, fail with a clear, friendly
message instead of a 500. It never raises raw third-party exceptions to the
view layer.

Sources are tried in order:
  1. youtube-transcript-api (manual captions, then auto-generated)
  2. YouTube timed-text endpoints (direct, no library)
  3. YouTube Data API video metadata (title/channel/description) as a last
     resort so DOCX/flashcards still have *something* grounded to work with.
"""

import logging
import re
from urllib.parse import parse_qs, urlparse

import requests
from django.conf import settings

from apps.documents.services import clean_extracted_text

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 12
TRANSCRIPT_LANGUAGES = ["en", "en-US", "en-GB", "en-IN", "en-CA", "en-AU"]


class TranscriptError(Exception):
    """Raised when no usable text could be obtained from a video."""


def extract_video_id(url_or_id):
    """Accept a full URL, a share URL, or a bare 11-character video id."""
    value = (url_or_id or "").strip()
    if not value:
        return ""

    # Already a bare id.
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", value):
        return value

    if "youtu" not in value:
        # Could still be an id with surrounding whitespace handled above.
        return ""

    try:
        parsed = urlparse(value if "://" in value else f"https://{value}")
    except ValueError:
        return ""

    host = (parsed.hostname or "").lower()

    if host.endswith("youtu.be"):
        candidate = parsed.path.lstrip("/").split("/")[0]
        return candidate if re.fullmatch(r"[A-Za-z0-9_-]{11}", candidate) else ""

    if "youtube" in host:
        # watch?v=ID
        query_id = parse_qs(parsed.query).get("v", [""])[0]
        if re.fullmatch(r"[A-Za-z0-9_-]{11}", query_id or ""):
            return query_id
        # /embed/ID, /shorts/ID, /live/ID, /v/ID
        match = re.search(r"/(?:embed|shorts|live|v)/([A-Za-z0-9_-]{11})", parsed.path)
        if match:
            return match.group(1)

    return ""


def _from_transcript_api(video_id):
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        from youtube_transcript_api._errors import (
            NoTranscriptFound,
            TranscriptsDisabled,
            VideoUnavailable,
        )
    except Exception:
        logger.info("youtube-transcript-api is not installed; skipping that source.")
        return ""

    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        # Prefer a manually created English transcript, then auto-generated,
        # then anything that can be translated to English, then anything at all.
        ordered = []
        try:
            ordered.append(transcript_list.find_manually_created_transcript(TRANSCRIPT_LANGUAGES))
        except Exception:
            pass
        try:
            ordered.append(transcript_list.find_generated_transcript(TRANSCRIPT_LANGUAGES))
        except Exception:
            pass
        if not ordered:
            for transcript in transcript_list:
                if getattr(transcript, "is_translatable", False):
                    try:
                        ordered.append(transcript.translate("en"))
                        break
                    except Exception:
                        continue
        if not ordered:
            ordered = list(transcript_list)

        for transcript in ordered:
            try:
                segments = transcript.fetch()
            except Exception:
                continue
            text = " ".join(segment.get("text", "") for segment in segments if segment.get("text"))
            cleaned = clean_extracted_text(text)
            if len(cleaned) >= 60:
                return cleaned
    except (TranscriptsDisabled, NoTranscriptFound):
        logger.info("No captions available via transcript api for %s", video_id)
    except VideoUnavailable:
        raise TranscriptError("This video is unavailable, private, or removed.")
    except Exception as exc:
        logger.info("transcript api failed for %s: %s", video_id, exc)
    return ""


def _parse_timedtext_xml(xml_text):
    if not xml_text:
        return ""
    pieces = re.findall(r"<text[^>]*>(.*?)</text>", xml_text, flags=re.DOTALL)
    if not pieces:
        return ""
    import html

    decoded = [html.unescape(re.sub(r"<[^>]+>", "", piece)) for piece in pieces]
    return clean_extracted_text(" ".join(decoded))


def _from_timedtext(video_id):
    """Hit YouTube's public timed-text endpoint directly (no API key)."""
    base = "https://www.youtube.com/api/timedtext"
    attempts = [
        {"v": video_id, "lang": "en"},
        {"v": video_id, "lang": "en", "kind": "asr"},
        {"v": video_id, "lang": "en-US", "kind": "asr"},
    ]
    headers = {"User-Agent": "Mozilla/5.0 (compatible; StudyPilot/1.0)"}
    for params in attempts:
        try:
            response = requests.get(base, params=params, headers=headers, timeout=REQUEST_TIMEOUT)
            if response.status_code == 200 and response.text.strip():
                text = _parse_timedtext_xml(response.text)
                if len(text) >= 60:
                    return text
        except requests.RequestException as exc:
            logger.info("timedtext request failed for %s: %s", video_id, exc)
            continue
    return ""


def fetch_video_metadata(video_id):
    """Best-effort title/channel/description via the YouTube Data API."""
    api_key = (settings.YOUTUBE_API_KEY or "").strip()
    metadata = {"title": "", "channel": "", "description": "", "video_id": video_id}
    if not api_key or api_key.lower().startswith("your_"):
        return metadata
    try:
        response = requests.get(
            "https://www.googleapis.com/youtube/v3/videos",
            params={"part": "snippet", "id": video_id, "key": api_key},
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        items = response.json().get("items", [])
        if items:
            snippet = items[0].get("snippet", {})
            metadata["title"] = clean_extracted_text(snippet.get("title", ""))
            metadata["channel"] = clean_extracted_text(snippet.get("channelTitle", ""))
            metadata["description"] = clean_extracted_text(snippet.get("description", ""))
    except requests.RequestException as exc:
        logger.info("metadata fetch failed for %s: %s", video_id, exc)
    return metadata


def get_transcript_and_metadata(url_or_id):
    """Return (transcript_text, metadata_dict, source_label).

    Raises TranscriptError with a friendly message if nothing usable is found.
    """
    video_id = extract_video_id(url_or_id)
    if not video_id:
        raise TranscriptError("That does not look like a valid YouTube link. Paste a full video URL.")

    metadata = fetch_video_metadata(video_id)

    transcript = _from_transcript_api(video_id)
    source = "captions"
    if not transcript:
        transcript = _from_timedtext(video_id)
        source = "auto-captions"

    if not transcript:
        # Last resort: use the description so we still produce something useful.
        description = metadata.get("description", "")
        if len(clean_extracted_text(description)) >= 200:
            transcript = clean_extracted_text(description)
            source = "description"

    if not transcript or len(transcript) < 60:
        raise TranscriptError(
            "This video has no usable captions or transcript. Try a lecture-style video that has captions turned on."
        )

    if not metadata.get("title"):
        metadata["title"] = "YouTube Lecture"
    return transcript, metadata, source
