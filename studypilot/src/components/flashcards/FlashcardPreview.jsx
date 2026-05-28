import { RotateCcw } from "lucide-react";
import Button from "../common/Button";

export default function FlashcardPreview({ card, flipped, onFlip, onClose }) {
  if (!card) return null;
  return (
    <div className="rounded-[1.75rem] border border-pilot-line bg-white p-6 shadow-pilot">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-black text-pilot-blue">Studying {card.deck}</p>
          <h3 className="mt-1 text-2xl font-black text-pilot-ink">{flipped ? "Answer" : "Question"}</h3>
        </div>
        {onClose && <Button variant="secondary" onClick={onClose}>Close</Button>}
      </div>
      <button onClick={onFlip} className="mt-6 min-h-56 w-full rounded-[1.5rem] border border-pilot-line bg-pilot-sky p-8 text-center transition hover:border-pilot-blue">
        <p className="text-xl font-black leading-8 text-pilot-ink">{flipped ? card.answer : card.question}</p>
        <p className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-pilot-blue"><RotateCcw size={16} /> Click to flip</p>
      </button>
    </div>
  );
}
