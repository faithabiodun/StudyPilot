import re
import string
from difflib import SequenceMatcher

from apps.documents.services import clean_extracted_text, clean_safe_string


def normalize_question_text(question):
    text = clean_extracted_text(question or "").lower()
    text = re.sub(r"^\s*(?:q(?:uestion)?\s*)?\d+[\).:\-]\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^\s*\d+[\).:\-]\s*", "", text)
    text = text.translate(str.maketrans("", "", string.punctuation))
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _is_near_duplicate(normalized, existing):
    if not normalized:
        return True
    return any(normalized == item or SequenceMatcher(None, normalized, item).ratio() >= 0.9 for item in existing)


def deduplicate_flashcards(flashcards, limit=None):
    unique = []
    seen = []
    for card in flashcards or []:
        question = clean_extracted_text(card.get("question", ""))
        answer = clean_extracted_text(card.get("answer", ""))
        normalized = normalize_question_text(question)
        if not question or not answer or _is_near_duplicate(normalized, seen):
            continue
        unique.append({"question": question, "answer": answer})
        seen.append(normalized)
        if limit and len(unique) >= limit:
            break
    return unique


def _dedupe_options(options, correct_answer=""):
    seen = set()
    correct_norm = normalize_question_text(correct_answer)
    correct_option = None
    distractors = []

    for option in options or []:
        option_text = clean_safe_string(option.get("option_text", ""), max_length=240)
        option_norm = normalize_question_text(option_text)
        if not option_text or option_norm in seen:
            continue
        is_correct = bool(option.get("is_correct")) or (correct_norm and option_norm == correct_norm)
        if is_correct and correct_option is None:
            correct_option = {"option_text": option_text, "is_correct": True}
        else:
            distractors.append({"option_text": option_text, "is_correct": False})
        seen.add(option_norm)

    if correct_option is None and correct_answer:
        correct_text = clean_safe_string(correct_answer, max_length=240)
        correct_norm = normalize_question_text(correct_text)
        if correct_text:
            correct_option = {"option_text": correct_text, "is_correct": True}
            distractors = [option for option in distractors if normalize_question_text(option["option_text"]) != correct_norm]

    if correct_option is None or len(distractors) < 3:
        return []

    return [correct_option, *distractors[:3]]


def _clean_question(item, require_mcq=False):
    question = clean_extracted_text(item.get("question", ""))
    correct_answer = clean_safe_string(item.get("correct_answer", ""), max_length=255)
    explanation = clean_extracted_text(item.get("explanation", ""))
    question_type = clean_safe_string(item.get("question_type", "multiple_choice"), fallback="multiple_choice", max_length=40)
    if not question or not correct_answer:
        return None
    cleaned = {
        "question_type": question_type,
        "question": question,
        "correct_answer": correct_answer,
        "explanation": explanation,
    }
    if require_mcq or question_type == "multiple_choice":
        options = _dedupe_options(item.get("options", []), correct_answer=correct_answer)
        if len(options) != 4 or sum(1 for option in options if option["is_correct"]) != 1:
            return None
        cleaned["options"] = options
        cleaned["question_type"] = "multiple_choice"
    elif question_type == "true_false":
        answer = "True" if str(correct_answer).lower().startswith("t") else "False"
        cleaned["correct_answer"] = answer
        cleaned["options"] = [
            {"option_text": "True", "is_correct": answer == "True"},
            {"option_text": "False", "is_correct": answer == "False"},
        ]
    else:
        cleaned["options"] = []
    return cleaned


def deduplicate_questions(questions, limit=None, require_mcq=False):
    unique = []
    seen = []
    for item in questions or []:
        cleaned = _clean_question(item, require_mcq=require_mcq)
        if not cleaned:
            continue
        normalized = normalize_question_text(cleaned["question"])
        if _is_near_duplicate(normalized, seen):
            continue
        unique.append(cleaned)
        seen.append(normalized)
        if limit and len(unique) >= limit:
            break
    return unique
