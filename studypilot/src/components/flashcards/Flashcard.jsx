import FlashcardPreview from "./FlashcardPreview";

export default function Flashcard({ card, flipped, onFlip }) {
  return <FlashcardPreview card={card} flipped={flipped} onFlip={onFlip} />;
}
