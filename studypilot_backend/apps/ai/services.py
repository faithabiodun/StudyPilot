import json
import logging
import re
from collections import Counter

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from openai import OpenAI

from apps.documents.services import clean_extracted_text
from apps.study_tools.local_generators import detect_definitions, detect_headings, extract_keywords, select_important_sentences

logger = logging.getLogger(__name__)


class AIServiceError(Exception):
    pass


def get_deepseek_client():
    api_key = (settings.DEEPSEEK_API_KEY or "").strip()
    if not api_key or api_key == "your_deepseek_api_key_here":
        raise ImproperlyConfigured("DeepSeek API key is not configured.")
    return OpenAI(api_key=api_key, base_url=settings.DEEPSEEK_BASE_URL, timeout=settings.DEEPSEEK_TIMEOUT_SECONDS)


def _response_text(response):
    message = response.choices[0].message
    content = getattr(message, "content", "") or ""
    if isinstance(content, list):
        return clean_extracted_text(" ".join(str(item.get("text", item)) for item in content))
    return clean_extracted_text(content)


def generate_text_with_deepseek(prompt, system_prompt=None, temperature=0.4, max_output_tokens=2200):
    client = get_deepseek_client()
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})
    try:
        response = client.chat.completions.create(
            model=settings.DEEPSEEK_MODEL,
            messages=messages,
            temperature=temperature,
            max_tokens=max_output_tokens,
        )
    except ImproperlyConfigured:
        raise
    except Exception as exc:
        logger.warning("DeepSeek generation failed: %s", exc)
        raise AIServiceError("DeepSeek failed to generate a response.") from exc
    text = _response_text(response)
    if not text:
        raise AIServiceError("DeepSeek returned an empty response.")
    return text


def _parse_json_payload(text):
    cleaned = clean_extracted_text(text)
    cleaned = re.sub(r"^```(?:json)?", "", cleaned.strip(), flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"(\{.*\}|\[.*\])", cleaned, flags=re.DOTALL)
        if not match:
            raise AIServiceError("Could not parse AI JSON response.")
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError as exc:
            raise AIServiceError("Could not parse AI JSON response.") from exc


def generate_json_with_deepseek(prompt, system_prompt=None, temperature=0.3, max_output_tokens=2200):
    json_system_prompt = (
        f"{system_prompt or ''}\nReturn valid JSON only. Do not include markdown fences, commentary, or prose outside JSON."
    ).strip()
    client = get_deepseek_client()
    messages = [
        {"role": "system", "content": json_system_prompt},
        {"role": "user", "content": prompt},
    ]
    try:
        response = client.chat.completions.create(
            model=settings.DEEPSEEK_MODEL,
            messages=messages,
            temperature=temperature,
            max_tokens=max_output_tokens,
            response_format={"type": "json_object"},
        )
    except TypeError:
        text = generate_text_with_deepseek(prompt, system_prompt=json_system_prompt, temperature=temperature, max_output_tokens=max_output_tokens)
        return _parse_json_payload(text)
    except ImproperlyConfigured:
        raise
    except Exception as exc:
        if "response_format" in str(exc).lower():
            text = generate_text_with_deepseek(prompt, system_prompt=json_system_prompt, temperature=temperature, max_output_tokens=max_output_tokens)
            return _parse_json_payload(text)
        logger.warning("DeepSeek JSON generation failed: %s", exc)
        raise AIServiceError("DeepSeek failed to generate a JSON response.") from exc
    return _parse_json_payload(_response_text(response))


def _chunk_text(text, chunk_size=1400, overlap=180):
    cleaned = clean_extracted_text(text)
    chunks = []
    start = 0
    while start < len(cleaned):
        end = min(start + chunk_size, len(cleaned))
        chunk = cleaned[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end == len(cleaned):
            break
        start = max(start + 1, end - overlap)
    return chunks


def _score_chunk(chunk, keywords):
    lowered = chunk.lower()
    keyword_score = sum(3 for keyword in keywords if keyword.lower() in lowered)
    definition_score = len(detect_definitions(chunk)) * 6
    heading_score = len(detect_headings(chunk)) * 4
    comparison_score = len(re.findall(r"\b(difference|compare|contrast|whereas|however|advantages?|disadvantages?)\b", lowered)) * 4
    process_score = len(re.findall(r"\b(process|steps?|phase|stages?|procedure|algorithm|method)\b", lowered)) * 3
    example_score = len(re.findall(r"\b(example|for instance|such as|case)\b", lowered)) * 2
    repeated_terms = Counter(re.findall(r"\b[A-Za-z][A-Za-z-]{5,}\b", lowered))
    repetition_score = sum(1 for _, count in repeated_terms.items() if count >= 2)
    return keyword_score + definition_score + heading_score + comparison_score + process_score + example_score + repetition_score


def select_pdf_study_context(extracted_text, max_chars=None, skip_chunks=0):
    max_chars = max_chars or settings.MAX_DEEPSEEK_CONTEXT_CHARS
    cleaned = clean_extracted_text(extracted_text)
    if not cleaned:
        return ""
    keywords = extract_keywords(cleaned, limit=45)
    chunks = _chunk_text(cleaned)
    if not chunks:
        return cleaned[:max_chars]
    scored = sorted(((_score_chunk(chunk, keywords), index, chunk) for index, chunk in enumerate(chunks)), key=lambda item: (item[0], -item[1]), reverse=True)
    selected = []
    used = set()
    for _, index, chunk in scored[max(0, skip_chunks): max(0, skip_chunks) + 10]:
        if index in used:
            continue
        selected.append(chunk)
        used.add(index)
        if len("\n\n".join(selected)) >= max_chars:
            break
    if len("\n\n".join(selected)) < min(2500, len(cleaned)):
        important = select_important_sentences(cleaned, limit=40)
        selected.append("\n".join(important))
    return clean_extracted_text("\n\n--- STUDY CONTEXT ---\n\n".join(selected))[:max_chars]


def _difficulty_guidance(difficulty):
    return {
        "easy": "Focus on definitions, direct recall, and basic concepts.",
        "medium": "Focus on explanation, comparison, relationships, and examples.",
        "hard": "Focus on application, reasoning, analysis, and exam-style questions.",
    }.get((difficulty or "").lower(), "Focus on explanation, comparison, relationships, and examples.")


def generate_pdf_flashcards_with_deepseek(context, difficulty, number_of_cards):
    prompt = f"""
Use the selected PDF context to create smart academic flashcards.
Focus on definitions, key concepts, processes, comparisons, examples, and exam-worthy recall.
Do not copy random sentences. Do not create duplicate cards. Do not invent facts outside the PDF context.

Difficulty: {difficulty}
Guidance: {_difficulty_guidance(difficulty)}
Number of flashcards: {number_of_cards}

Return JSON exactly like:
{{"flashcards":[{{"question":"string","answer":"string"}}]}}

Selected PDF context:
{context}
"""
    return generate_json_with_deepseek(prompt, system_prompt="You generate high-quality academic flashcards from PDF study context.", temperature=0.25, max_output_tokens=6000)


def generate_pdf_mcqs_with_deepseek(context, difficulty, number_of_questions):
    prompt = f"""
Use the selected PDF context to create a smart academic MCQ quiz.
Each question must test a meaningful concept, process, comparison, definition, or example from the PDF.
Each question needs exactly four options, one correct answer, three believable distractors, and a clear explanation.
Avoid obvious distractors, duplicates, vague wording, and random copied sentences.

Difficulty: {difficulty}
Guidance: {_difficulty_guidance(difficulty)}
Number of MCQs: {number_of_questions}

Return JSON exactly like:
{{"mcqs":[{{"question":"string","options":[{{"option_text":"string","is_correct":true}},{{"option_text":"string","is_correct":false}},{{"option_text":"string","is_correct":false}},{{"option_text":"string","is_correct":false}}],"correct_answer":"string","explanation":"string"}}]}}

Selected PDF context:
{context}
"""
    return generate_json_with_deepseek(prompt, system_prompt="You generate high-quality academic MCQs from PDF study context.", temperature=0.25, max_output_tokens=8000)


def generate_pdf_mixed_quiz_with_deepseek(context, difficulty, number_of_questions, question_types):
    prompt = f"""
Use the selected PDF context to create a smart mixed academic quiz.
Use only these question types where requested: {", ".join(question_types)}.
Multiple choice questions need four options, one correct answer, believable distractors, and explanations.
True/false questions must be precise and grounded in the PDF.
Short answer and theory questions should test understanding, comparison, processes, and exam-style reasoning.
Avoid vague questions such as "What is discussed in this section?" Do not copy random sentences.

Difficulty: {difficulty}
Guidance: {_difficulty_guidance(difficulty)}
Number of questions: {number_of_questions}

Return JSON exactly like:
{{"questions":[{{"question_type":"multiple_choice","question":"string","options":[{{"option_text":"string","is_correct":true}},{{"option_text":"string","is_correct":false}},{{"option_text":"string","is_correct":false}},{{"option_text":"string","is_correct":false}}],"correct_answer":"string","explanation":"string"}},{{"question_type":"true_false","question":"string","correct_answer":"True","explanation":"string"}},{{"question_type":"short_answer","question":"string","correct_answer":"string","explanation":"string"}},{{"question_type":"theory","question":"string","correct_answer":"string","explanation":"string"}}]}}

Selected PDF context:
{context}
"""
    return generate_json_with_deepseek(prompt, system_prompt="You generate high-quality mixed academic quizzes from PDF study context.", temperature=0.25, max_output_tokens=9000)


def generate_youtube_docx_content_with_deepseek(transcript, video_metadata, document_options=None):
    document_options = document_options or {}
    text = clean_extracted_text(transcript)[:30000]
    prompt = f"""
Create a polished academic study document from this YouTube lecture transcript.
Use only the transcript and metadata. Do not invent unrelated facts. Do not copy the transcript word for word.
Transform it into intelligent study notes with clear explanations.

Video title: {video_metadata.get("title") or "YouTube Lecture"}
Channel: {video_metadata.get("channel") or "Unknown channel"}
Detail level: {document_options.get("detail_level", "comprehensive")}
Document style: {document_options.get("document_style", "study_guide")}
Custom instruction: {document_options.get("custom_instruction") or "None"}

Required sections:
# Introduction
# Learning Objectives
# Main Study Notes
## Chapter-style sections
# Timestamped Sections
# Key Concepts
# Definitions
# Examples
# Important Takeaways
# Summary
# Revision Questions
# MCQs with Answers
# Short Answer Questions
# Glossary
# Final Study Checklist

Use markdown headings, bullets, numbered lists, and tables where useful.

Transcript:
{text}
"""
    return generate_text_with_deepseek(
        prompt,
        system_prompt="You create structured academic StudyPilot DOCX content from lecture transcripts.",
        temperature=0.35,
        max_output_tokens=12000,
    )


__all__ = [
    "AIServiceError",
    "get_deepseek_client",
    "generate_text_with_deepseek",
    "generate_json_with_deepseek",
    "select_pdf_study_context",
    "generate_pdf_flashcards_with_deepseek",
    "generate_pdf_mcqs_with_deepseek",
    "generate_pdf_mixed_quiz_with_deepseek",
    "generate_youtube_docx_content_with_deepseek",
]
