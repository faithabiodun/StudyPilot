import { apiRequest } from "./api";

export function generateFlashcards(payload) {
  return apiRequest("/flashcards/generate/", { method: "POST", body: JSON.stringify(payload) });
}

export function fetchFlashcardDecks() {
  return apiRequest("/flashcards/decks/");
}
