from django.shortcuts import get_object_or_404
from django.core.exceptions import ImproperlyConfigured
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.documents.services import clean_extracted_text, clean_safe_string
from apps.documents.models import Document
from apps.dashboard.services import record_activity
from apps.ai.services import AIServiceError, generate_pdf_flashcards_with_deepseek, select_pdf_study_context
from apps.study_tools.deduplication import deduplicate_flashcards
from apps.utils import error_response, success_response

from .models import Flashcard, FlashcardDeck
from .serializers import FlashcardDeckSerializer, GenerateFlashcardsSerializer


class DeckListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        decks = FlashcardDeck.objects.filter(user=request.user).prefetch_related("cards")
        return success_response("Flashcard decks fetched", FlashcardDeckSerializer(decks, many=True).data)

    def post(self, request):
        serializer = FlashcardDeckSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Flashcard deck creation failed", serializer.errors)
        deck = serializer.save(user=request.user)
        return success_response("Flashcard deck created", FlashcardDeckSerializer(deck).data, status.HTTP_201_CREATED)


class DeckDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return get_object_or_404(FlashcardDeck.objects.prefetch_related("cards"), pk=pk, user=request.user)

    def get(self, request, pk):
        return success_response("Flashcard deck fetched", FlashcardDeckSerializer(self.get_object(request, pk)).data)

    def delete(self, request, pk):
        self.get_object(request, pk).delete()
        return success_response("Flashcard deck deleted")


class GenerateFlashcardsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = GenerateFlashcardsSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response("Flashcard generation failed", serializer.errors)

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
            requested_count = serializer.validated_data["number_of_cards"]
            context = select_pdf_study_context(generation_text)
            generated = generate_pdf_flashcards_with_deepseek(
                context,
                serializer.validated_data["difficulty"],
                requested_count,
            )
            cards = deduplicate_flashcards(generated.get("flashcards", []), limit=requested_count)
            if len(cards) < requested_count:
                retry_context = select_pdf_study_context(generation_text, skip_chunks=10)
                retry_generated = generate_pdf_flashcards_with_deepseek(
                    retry_context,
                    serializer.validated_data["difficulty"],
                    requested_count,
                )
                cards = deduplicate_flashcards(cards + retry_generated.get("flashcards", []), limit=requested_count)
        except ImproperlyConfigured as exc:
            return error_response(str(exc), status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except AIServiceError as exc:
            return error_response(str(exc) or "Flashcard generation failed.", status_code=status.HTTP_502_BAD_GATEWAY)

        if not cards:
            return error_response("Not enough clean text was found to generate questions.", status_code=status.HTTP_400_BAD_REQUEST)

        deck = FlashcardDeck.objects.create(
            user=request.user,
            document=document,
            course_title=source_title,
            title=f"{source_title} Flashcards",
            description=f"Generated from {document.title}.",
        )
        Flashcard.objects.bulk_create([
            Flashcard(
                deck=deck,
                question=clean_extracted_text(card.get("question", "")),
                answer=clean_extracted_text(card.get("answer", "")),
            )
            for card in cards
            if clean_extracted_text(card.get("question", "")) and clean_extracted_text(card.get("answer", ""))
        ])
        deck.refresh_from_db()
        record_activity(
            request.user,
            "flashcards_generated",
            "Generated Flashcards",
            f"You generated {deck.cards.count()} flashcards from {document.title}.",
            {"document_id": document.id, "deck_id": deck.id, "count": deck.cards.count()},
        )
        message = "Flashcards generated successfully"
        if deck.cards.count() < requested_count:
            message = "StudyPilot generated the strongest unique questions available from this PDF."
        return success_response(message, FlashcardDeckSerializer(deck).data, status.HTTP_201_CREATED)
