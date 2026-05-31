import json
import re

from django.conf import settings

from apps.ai.services import AIServiceError, generate_json_with_deepseek, generate_text_with_deepseek


class AIGenerationError(Exception):
    pass


def limit_study_text(text, limit=None):
    limit = limit or settings.MAX_DEEPSEEK_CONTEXT_CHARS
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    return cleaned[:limit]


def parse_json_response(text):
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise AIGenerationError("Could not parse AI response.")


def difficulty_guidance(difficulty):
    guidance = {
        "easy": "Focus on definitions, simple recall, and basic understanding.",
        "medium": "Focus on explanation, relationships, examples, and application.",
        "hard": "Focus on deeper reasoning, comparison, analysis, and exam-style questions.",
    }
    return guidance.get((difficulty or "").lower(), guidance["medium"])


def create_study_embedding(text):
    return []


def generate_text_with_ai(prompt, system_prompt=None, max_output_tokens=2200):
    try:
        return generate_text_with_deepseek(prompt, system_prompt=system_prompt, max_output_tokens=max_output_tokens)
    except AIServiceError as exc:
        raise AIGenerationError(str(exc)) from exc


def generate_flashcards_with_ai(context, difficulty, number_of_cards, source_title="the uploaded PDF"):
    text = limit_study_text(context)
    prompt = f"""
Generate academic flashcards only from the retrieved PDF context below.
Do not invent unrelated facts.

Source document: {source_title}
Difficulty: {difficulty}
Difficulty behavior: {difficulty_guidance(difficulty)}
Number of flashcards: {number_of_cards}

Expected JSON:
{{"flashcards":[{{"question":"string","answer":"string"}}]}}

Retrieved PDF context:
{text}
"""
    try:
        return generate_json_with_deepseek(prompt, system_prompt="Return only strict JSON for StudyPilot flashcards.", max_output_tokens=5000)
    except AIServiceError as exc:
        raise AIGenerationError(str(exc)) from exc


def generate_mixed_quiz_with_ai(context, difficulty, number_of_questions, question_types, source_title="the uploaded PDF"):
    text = limit_study_text(context)
    prompt = f"""
Generate a mixed academic quiz only from the retrieved PDF context below.
Do not invent unrelated facts.

Source document: {source_title}
Difficulty: {difficulty}
Difficulty behavior: {difficulty_guidance(difficulty)}
Question types: {", ".join(question_types)}
Number of questions: {number_of_questions}

Expected JSON:
{{"questions":[{{"question_type":"multiple_choice","question":"string","options":[{{"option_text":"string","is_correct":true}},{{"option_text":"string","is_correct":false}},{{"option_text":"string","is_correct":false}},{{"option_text":"string","is_correct":false}}],"correct_answer":"string","explanation":"string"}},{{"question_type":"short_answer","question":"string","correct_answer":"string","explanation":"string"}},{{"question_type":"theory","question":"string","correct_answer":"string","explanation":"string"}},{{"question_type":"true_false","question":"string","correct_answer":"True or False","explanation":"string"}}]}}

Retrieved PDF context:
{text}
"""
    try:
        return generate_json_with_deepseek(prompt, system_prompt="Return only strict JSON for StudyPilot mixed quizzes.", max_output_tokens=7000)
    except AIServiceError as exc:
        raise AIGenerationError(str(exc)) from exc


def generate_mcq_quiz_with_ai(context, difficulty, number_of_questions, show_explanations=True, source_title="the uploaded PDF"):
    text = limit_study_text(context)
    prompt = f"""
Generate multiple choice questions only from the retrieved PDF context below.
Do not invent unrelated facts.

Source document: {source_title}
Difficulty: {difficulty}
Difficulty behavior: {difficulty_guidance(difficulty)}
Number of MCQs: {number_of_questions}
Show explanations: {show_explanations}

Expected JSON:
{{"mcqs":[{{"question":"string","options":[{{"option_text":"string","is_correct":true}},{{"option_text":"string","is_correct":false}},{{"option_text":"string","is_correct":false}},{{"option_text":"string","is_correct":false}}],"correct_answer":"string","explanation":"string"}}]}}

Retrieved PDF context:
{text}
"""
    try:
        return generate_json_with_deepseek(prompt, system_prompt="Return only strict JSON for StudyPilot MCQ quizzes.", max_output_tokens=7000)
    except AIServiceError as exc:
        raise AIGenerationError(str(exc)) from exc
