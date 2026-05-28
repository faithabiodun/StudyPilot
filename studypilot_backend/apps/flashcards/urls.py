from django.urls import path

from .views import DeckDetailView, DeckListCreateView, GenerateFlashcardsView

urlpatterns = [
    path("decks/", DeckListCreateView.as_view(), name="flashcard_decks"),
    path("decks/<int:pk>/", DeckDetailView.as_view(), name="flashcard_deck_detail"),
    path("generate/", GenerateFlashcardsView.as_view(), name="generate_flashcards"),
]
