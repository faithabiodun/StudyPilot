import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 10


def configured_key(value):
    value = (value or "").strip()
    return bool(value and not value.lower().startswith("your_"))


def clean_description(value, limit=260):
    text = " ".join((value or "").replace("\n", " ").split())
    if len(text) <= limit:
        return text
    return f"{text[: limit - 1].rstrip()}..."


def normalize_type(resource_type):
    value = (resource_type or "all").lower()
    aliases = {
        "all": "all",
        "youtube": "youtube",
        "textbook": "textbooks",
        "textbooks": "textbooks",
        "book": "textbooks",
        "books": "textbooks",
        "article": "articles",
        "articles": "articles",
    }
    return aliases.get(value, "all")


def search_youtube_resources(query, limit=4):
    if not configured_key(settings.YOUTUBE_API_KEY):
        return []
    try:
        response = requests.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={
                "part": "snippet",
                "q": f"{query} tutorial lecture course explanation",
                "type": "video",
                "maxResults": min(limit, 10),
                "key": settings.YOUTUBE_API_KEY,
                "safeSearch": "moderate",
            },
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        items = response.json().get("items", [])
        results = []
        for item in items:
            snippet = item.get("snippet") or {}
            video_id = (item.get("id") or {}).get("videoId")
            if not video_id:
                continue
            thumbnails = snippet.get("thumbnails") or {}
            thumb = (thumbnails.get("medium") or thumbnails.get("default") or {}).get("url", "")
            results.append(
                {
                    "title": snippet.get("title", "YouTube tutorial"),
                    "description": clean_description(snippet.get("description")),
                    "url": f"https://www.youtube.com/watch?v={video_id}",
                    "resource_type": "youtube",
                    "source_name": "YouTube",
                    "author_or_channel": snippet.get("channelTitle", ""),
                    "published_date": snippet.get("publishedAt", "")[:10],
                    "thumbnail": thumb,
                }
            )
        return results[:limit]
    except Exception:
        logger.warning("YouTube resource search failed", exc_info=True)
        return []


def search_book_resources(query, limit=3):
    try:
        params = {
            "q": query,
            "maxResults": min(limit, 10),
            "printType": "books",
        }
        if configured_key(settings.GOOGLE_BOOKS_API_KEY):
            params["key"] = settings.GOOGLE_BOOKS_API_KEY
        response = requests.get("https://www.googleapis.com/books/v1/volumes", params=params, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        items = response.json().get("items", [])
        results = []
        for item in items:
            info = item.get("volumeInfo") or {}
            image_links = info.get("imageLinks") or {}
            authors = info.get("authors") or []
            published = info.get("publishedDate", "")
            results.append(
                {
                    "title": info.get("title", "Book recommendation"),
                    "description": clean_description(info.get("description")),
                    "url": info.get("infoLink") or item.get("selfLink", ""),
                    "resource_type": "textbook",
                    "source_name": "Google Books",
                    "author_or_channel": ", ".join(authors[:3]),
                    "published_date": published[:10],
                    "thumbnail": image_links.get("thumbnail") or image_links.get("smallThumbnail") or "",
                }
            )
        return [item for item in results if item["url"]][:limit]
    except Exception:
        logger.warning("Google Books resource search failed", exc_info=True)
        return []


def _openalex_authorships(authorships):
    names = []
    for author in authorships or []:
        name = (author.get("author") or {}).get("display_name")
        if name:
            names.append(name)
    return ", ".join(names[:3])


def _openalex_url(item):
    primary = item.get("primary_location") or {}
    source_url = primary.get("landing_page_url") or primary.get("pdf_url")
    return source_url or item.get("doi") or item.get("id", "")


def search_article_resources(query, limit=3):
    try:
        params = {
            "search": query,
            "per-page": min(limit, 10),
            "filter": "type:article",
        }
        if settings.OPENALEX_EMAIL:
            params["mailto"] = settings.OPENALEX_EMAIL
        response = requests.get("https://api.openalex.org/works", params=params, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        items = response.json().get("results", [])
        results = []
        for item in items:
            abstract = item.get("abstract") or item.get("abstract_inverted_index")
            description = ""
            if isinstance(abstract, str):
                description = abstract
            elif isinstance(abstract, dict):
                words = sorted(((positions[0], word) for word, positions in abstract.items() if positions), key=lambda pair: pair[0])
                description = " ".join(word for _, word in words[:45])
            results.append(
                {
                    "title": item.get("display_name", "Academic article"),
                    "description": clean_description(description or "Academic article related to your search topic."),
                    "url": _openalex_url(item),
                    "resource_type": "article",
                    "source_name": "OpenAlex",
                    "author_or_channel": _openalex_authorships(item.get("authorships")),
                    "published_date": str(item.get("publication_year") or ""),
                    "thumbnail": "",
                }
            )
        return [item for item in results if item["url"]][:limit]
    except Exception:
        logger.warning("OpenAlex resource search failed", exc_info=True)
        return []


def search_crossref_article_resources(query, limit=5):
    try:
        response = requests.get(
            "https://api.crossref.org/works",
            params={"query": query, "rows": min(limit, 10), "select": "title,author,published-print,published-online,URL,container-title,abstract"},
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        items = (response.json().get("message") or {}).get("items", [])
        results = []
        for item in items:
            title = (item.get("title") or ["Academic article"])[0]
            authors = []
            for author in item.get("author") or []:
                name = " ".join(part for part in [author.get("given"), author.get("family")] if part)
                if name:
                    authors.append(name)
            date_parts = (item.get("published-print") or item.get("published-online") or {}).get("date-parts") or []
            year = str(date_parts[0][0]) if date_parts and date_parts[0] else ""
            source_title = (item.get("container-title") or ["Crossref"])[0]
            url = item.get("URL") or ""
            if not url:
                continue
            results.append(
                {
                    "title": title,
                    "description": clean_description(item.get("abstract") or f"Academic article indexed by {source_title}."),
                    "url": url,
                    "resource_type": "article",
                    "source_name": "Crossref",
                    "author_or_channel": ", ".join(authors[:3]),
                    "published_date": year,
                    "thumbnail": "",
                }
            )
        return results[:limit]
    except Exception:
        logger.warning("Crossref resource search failed", exc_info=True)
        return []


def get_combined_recommendations(query, resource_type="all"):
    query = (query or "").strip()
    if not query:
        query = "computer science study resources"
    normalized = normalize_type(resource_type)

    if normalized == "youtube":
        results = search_youtube_resources(query, 10)
    elif normalized == "textbooks":
        results = search_book_resources(query, 10)
    elif normalized == "articles":
        results = search_article_resources(query, 10)
        if len(results) < 5:
            seen_urls = {item.get("url") for item in results}
            for item in search_crossref_article_resources(query, 10):
                if item.get("url") not in seen_urls:
                    results.append(item)
                    seen_urls.add(item.get("url"))
                if len(results) >= 10:
                    break
    else:
        results = [
            *search_youtube_resources(query, 4),
            *search_book_resources(query, 3),
            *search_article_resources(query, 3),
        ]

    return {
        "query": query,
        "type": normalized,
        "count": min(len(results), 10),
        "results": results[:10],
    }
