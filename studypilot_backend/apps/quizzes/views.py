from django.shortcuts import get_object_or_404
from django.core.exceptions import ImproperlyConfigured
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.documents.services import clean_extracted_text, clean_safe_string
from apps.documents.models import Document
from apps.dashboard.services import record_activity
from apps.ai.services import AIServiceError, generate_pdf_mcqs_with_deepseek, generate_pdf_mixed_quiz_with_deepseek, select_pdf_study_context
from apps.memory.records import slugify_topic
from apps.memory.services import generation_focus, record_quiz_attempt, weakness_briefing
from apps.study_tools.deduplication import deduplicate_questions
from apps.utils import error_response, success_response

from .models import Quiz, QuizOption, QuizQuestion
from .serializers import GenerateMCQSerializer, GenerateQuizSerializer, QuizSerializer, SubmitQuizSerializer


class QuizListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        quizzes = Quiz.objects.filter(user=request.user).prefetch_related("questions__options")
        return success_response("Quizzes fetched", QuizSerializer(quizzes, many=True).data)


class GenerateQuizView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = GenerateQuizSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Quiz generation failed", serializer.errors)

        document = get_object_or_404(Document, pk=serializer.validated_data["document_id"], user=request.user)
        generation_text = document.focused_extracted_text or document.extracted_text
        if not generation_text:
            return error_response("This document has no extracted text.", status_code=status.HTTP_400_BAD_REQUEST)

        source_title = clean_safe_string(
            serializer.validated_data.get("course_title") or document.title or document.original_filename,
            fallback="Uploaded PDF",
            max_length=180,
        )
        question_types = serializer.validated_data.get("question_types") or ["multiple_choice"]
        try:
            requested_count = serializer.validated_data["number_of_questions"]
            context = select_pdf_study_context(generation_text)
            # Stop generating quizzes about a PDF and start generating quizzes
            # about what this student keeps getting wrong in that PDF.
            focus_guidance = generation_focus(weakness_briefing(request.user, source_title))
            generated = generate_pdf_mixed_quiz_with_deepseek(
                context,
                serializer.validated_data["difficulty"],
                requested_count,
                question_types,
                focus_guidance=focus_guidance,
            )
            generated_questions = deduplicate_questions(generated.get("questions", []), limit=requested_count)
            if len(generated_questions) < requested_count:
                retry_context = select_pdf_study_context(generation_text, skip_chunks=10)
                retry_generated = generate_pdf_mixed_quiz_with_deepseek(
                    retry_context,
                    serializer.validated_data["difficulty"],
                    requested_count,
                    question_types,
                    focus_guidance=focus_guidance,
                )
                generated_questions = deduplicate_questions(generated_questions + retry_generated.get("questions", []), limit=requested_count)
        except ImproperlyConfigured as exc:
            return error_response(str(exc), status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except AIServiceError as exc:
            return error_response(str(exc) or "Quiz generation failed.", status_code=status.HTTP_502_BAD_GATEWAY)

        if not generated_questions:
            return error_response("Not enough clean text was found to generate questions.", status_code=status.HTTP_400_BAD_REQUEST)

        quiz = Quiz.objects.create(
            user=request.user,
            document=document,
            course_title=source_title,
            difficulty=serializer.validated_data["difficulty"],
            question_type=",".join(question_types),
            number_of_questions=serializer.validated_data["number_of_questions"],
        )
        for item in generated_questions:
            question = QuizQuestion.objects.create(
                quiz=quiz,
                question=clean_extracted_text(item.get("question", "")),
                correct_answer=clean_safe_string(item.get("correct_answer", ""), max_length=255),
                explanation=clean_extracted_text(item.get("explanation", "")),
                question_type=clean_safe_string(item.get("question_type", "multiple_choice"), fallback="multiple_choice", max_length=40),
                subtopic=slugify_topic(item.get("subtopic", "")),
            )
            QuizOption.objects.bulk_create([
                QuizOption(question=question, option_text=clean_safe_string(option.get("option_text", ""), max_length=240), is_correct=bool(option.get("is_correct")))
                for option in item.get("options", [])
                if clean_safe_string(option.get("option_text", ""), max_length=240)
            ])
        quiz.refresh_from_db()
        record_activity(
            request.user,
            "mixed_quiz_generated",
            "Generated Mixed Quiz",
            f"You generated {quiz.questions.count()} mixed quiz questions from {document.title}.",
            {"document_id": document.id, "quiz_id": quiz.id, "count": quiz.questions.count()},
        )
        message = "Mixed quiz generated successfully"
        if quiz.questions.count() < requested_count:
            message = "StudyPilot generated the strongest unique questions available from this PDF."
        return success_response(message, QuizSerializer(quiz).data, status.HTTP_201_CREATED)


class GenerateMCQView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = GenerateMCQSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("MCQ generation failed", serializer.errors)

        document = get_object_or_404(Document, pk=serializer.validated_data["document_id"], user=request.user)
        generation_text = document.focused_extracted_text or document.extracted_text
        if not generation_text:
            return error_response("This document has no extracted text.", status_code=status.HTTP_400_BAD_REQUEST)

        source_title = clean_safe_string(
            serializer.validated_data.get("course_title") or document.title or document.original_filename,
            fallback="Uploaded PDF",
            max_length=180,
        )
        try:
            requested_count = serializer.validated_data["number_of_questions"]
            context = select_pdf_study_context(generation_text)
            generated = generate_pdf_mcqs_with_deepseek(
                context,
                serializer.validated_data["difficulty"],
                requested_count,
            )
            mcqs = deduplicate_questions(generated.get("mcqs", []), limit=requested_count, require_mcq=True)
            if len(mcqs) < requested_count:
                retry_context = select_pdf_study_context(generation_text, skip_chunks=10)
                retry_generated = generate_pdf_mcqs_with_deepseek(
                    retry_context,
                    serializer.validated_data["difficulty"],
                    requested_count,
                )
                mcqs = deduplicate_questions(mcqs + retry_generated.get("mcqs", []), limit=requested_count, require_mcq=True)
        except ImproperlyConfigured as exc:
            return error_response(str(exc), status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except AIServiceError as exc:
            return error_response(str(exc) or "MCQ generation failed.", status_code=status.HTTP_502_BAD_GATEWAY)

        if not mcqs:
            return error_response("Not enough clean text was found to generate questions.", status_code=status.HTTP_400_BAD_REQUEST)

        quiz = Quiz.objects.create(
            user=request.user,
            document=document,
            course_title=source_title,
            difficulty=serializer.validated_data["difficulty"],
            question_type="multiple_choice",
            number_of_questions=serializer.validated_data["number_of_questions"],
        )
        for item in mcqs:
            question = QuizQuestion.objects.create(
                quiz=quiz,
                question=clean_extracted_text(item.get("question", "")),
                correct_answer=clean_safe_string(item.get("correct_answer", ""), max_length=255),
                explanation=clean_extracted_text(item.get("explanation", "")),
                question_type="multiple_choice",
                subtopic=slugify_topic(item.get("subtopic", "")),
            )
            QuizOption.objects.bulk_create([
                QuizOption(question=question, option_text=clean_safe_string(option.get("option_text", ""), max_length=240), is_correct=bool(option.get("is_correct")))
                for option in item.get("options", [])
                if clean_safe_string(option.get("option_text", ""), max_length=240)
            ])
        quiz.refresh_from_db()
        record_activity(
            request.user,
            "mcq_quiz_generated",
            "Generated MCQ Quiz",
            f"You generated {quiz.questions.count()} MCQs from {document.title}.",
            {"document_id": document.id, "quiz_id": quiz.id, "count": quiz.questions.count()},
        )
        message = "MCQ quiz generated successfully"
        if quiz.questions.count() < requested_count:
            message = "StudyPilot generated the strongest unique questions available from this PDF."
        return success_response(message, QuizSerializer(quiz).data, status.HTTP_201_CREATED)


class QuizDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        quiz = get_object_or_404(Quiz.objects.prefetch_related("questions__options"), pk=pk, user=request.user)
        return success_response("Quiz fetched", QuizSerializer(quiz).data)


class SubmitQuizView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        quiz = get_object_or_404(Quiz.objects.prefetch_related("questions"), pk=pk, user=request.user)
        serializer = SubmitQuizSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Quiz submission failed", serializer.errors)

        answers = serializer.validated_data["answers"]
        total = quiz.questions.count()
        correct = 0
        details = []
        for question in quiz.questions.all():
            selected = answers.get(str(question.id), "")
            is_correct = selected == question.correct_answer
            correct += 1 if is_correct else 0
            details.append({
                "question_id": question.id,
                "question": question.question,
                "subtopic": question.subtopic,
                "selected_answer": selected,
                "correct_answer": question.correct_answer,
                "is_correct": is_correct,
                "explanation": question.explanation,
            })

        # Persist what was answered, not just what was asked. Never raises: a
        # memory outage must not stop a student seeing their score.
        memory = record_quiz_attempt(request.user, quiz, details)
        record_activity(
            request.user,
            "quiz_submitted",
            "Submitted quiz",
            f"You scored {correct} of {total} on {quiz.course_title or 'a quiz'}.",
            {"quiz_id": quiz.id, "score": correct, "total": total, "memories_written": memory.get("written", 0)},
        )

        return success_response("Quiz submitted", {
            "score": correct,
            "total": total,
            "percentage": round((correct / total) * 100, 2) if total else 0,
            "details": details,
            "memory": memory,
        })
