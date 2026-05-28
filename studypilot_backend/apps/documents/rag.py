import logging
import math
import re
from collections import Counter

from django.conf import settings

from .models import DocumentChunk
from .services import clean_extracted_text

logger = logging.getLogger(__name__)

CHUNK_SIZE = 1200
CHUNK_OVERLAP = 150


def chunk_text(text, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    cleaned = clean_extracted_text(text)
    if not cleaned:
        return []

    chunks = []
    start = 0
    while start < len(cleaned):
        end = min(start + chunk_size, len(cleaned))
        chunk = cleaned[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end == len(cleaned):
            break
        start = max(end - overlap, start + 1)
    return chunks


def _embedding_values(response):
    embeddings = getattr(response, "embeddings", None)
    if embeddings:
        first = embeddings[0]
        return list(getattr(first, "values", None) or first.get("values", []))
    embedding = getattr(response, "embedding", None)
    if embedding:
        return list(getattr(embedding, "values", None) or embedding.get("values", []))
    if isinstance(response, dict):
        items = response.get("embeddings") or []
        if items:
            return list(items[0].get("values", []))
    return []


def generate_embedding(text):
    return []


def create_document_chunks(document):
    DocumentChunk.objects.filter(document=document).delete()
    chunks = chunk_text(document.extracted_text)
    if not chunks:
        return 0

    objects = []
    for index, chunk in enumerate(chunks):
        objects.append(
            DocumentChunk(
                user=document.user,
                document=document,
                chunk_text=chunk,
                chunk_index=index,
                embedding=generate_embedding(chunk) or None,
            )
        )
    DocumentChunk.objects.bulk_create(objects, batch_size=100)
    return len(objects)


def cosine_similarity(left, right):
    if not left or not right or len(left) != len(right):
        return 0
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if not left_norm or not right_norm:
        return 0
    return dot / (left_norm * right_norm)


def tokenize(text):
    return [token for token in re.findall(r"[a-zA-Z0-9]{3,}", (text or "").lower())]


def keyword_score(query, text):
    query_terms = Counter(tokenize(query))
    text_terms = Counter(tokenize(text))
    if not query_terms or not text_terms:
        return 0
    return sum(min(count, text_terms.get(term, 0)) for term, count in query_terms.items())


def retrieve_relevant_chunks(document, query, limit=8):
    if False:
        chunks = list(DocumentChunk.objects.filter(document=document))
        if not chunks and document.extracted_text:
            create_document_chunks(document)
            chunks = list(DocumentChunk.objects.filter(document=document))
        chunk_rows = [(chunk.chunk_index, chunk.chunk_text, chunk.embedding) for chunk in chunks]
        query_embedding = generate_embedding(query)
    else:
        chunk_rows = [(index, text, None) for index, text in enumerate(chunk_text(document.extracted_text))]
        query_embedding = []

    if not chunk_rows:
        return clean_extracted_text(document.extracted_text)[: settings.MAX_DEEPSEEK_CONTEXT_CHARS]

    scored = []
    for chunk_index, chunk_body, embedding in chunk_rows:
        if query_embedding and embedding:
            score = cosine_similarity(query_embedding, embedding)
        else:
            score = keyword_score(query, chunk_body)
        scored.append((score, chunk_index, chunk_body))

    scored.sort(key=lambda item: (item[0], -item[1]), reverse=True)
    top_chunks = [text for _, _, text in scored[:limit]]
    return "\n\n--- PDF CONTEXT CHUNK ---\n\n".join(top_chunks)[: settings.MAX_DEEPSEEK_CONTEXT_CHARS]
