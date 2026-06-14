"""Glue between YouTube transcripts and StudyPilot's existing AI generators.

Transcripts are treated as study context, then run through the same DeepSeek
flashcard / MCQ / mixed-quiz generators already used for PDFs, so YouTube
output is identical in shape and quality to PDF output.
"""

from apps.ai.services import (
    generate_pdf_flashcards_with_deepseek,
    generate_pdf_mcqs_with_deepseek,
    generate_pdf_mixed_quiz_with_deepseek,
    select_pdf_study_context,
)


def transcript_context(transcript, skip_chunks=0):
    return select_pdf_study_context(transcript, skip_chunks=skip_chunks)


def youtube_flashcards(transcript, difficulty, number_of_cards, skip_chunks=0):
    context = transcript_context(transcript, skip_chunks=skip_chunks)
    return generate_pdf_flashcards_with_deepseek(context, difficulty, number_of_cards)


def youtube_mcqs(transcript, difficulty, number_of_questions, skip_chunks=0):
    context = transcript_context(transcript, skip_chunks=skip_chunks)
    return generate_pdf_mcqs_with_deepseek(context, difficulty, number_of_questions)


def youtube_mixed_quiz(transcript, difficulty, number_of_questions, question_types, skip_chunks=0):
    context = transcript_context(transcript, skip_chunks=skip_chunks)
    return generate_pdf_mixed_quiz_with_deepseek(context, difficulty, number_of_questions, question_types)
