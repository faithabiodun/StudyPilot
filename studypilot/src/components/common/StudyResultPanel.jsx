import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, RotateCcw, Sparkles, X } from "lucide-react";
import Button from "./Button";

/* ------------------------------------------------------------------ */
/* Deduplication helpers (shared logic, kept local to the component)   */
/* ------------------------------------------------------------------ */

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^\s*(q(?:uestion)?\s*)?\d+[\).:-]\s*/i, "")
    .replace(/^\s*\d+[\).:-]\s*/, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isNearDuplicate(normalized, seen) {
  if (!normalized) return true;
  return seen.some((item) => {
    if (item === normalized) return true;
    const longer = Math.max(item.length, normalized.length) || 1;
    let matches = 0;
    for (let index = 0; index < Math.min(item.length, normalized.length); index += 1) {
      if (item[index] === normalized[index]) matches += 1;
    }
    return matches / longer > 0.9;
  });
}

function dedupeCards(cards = []) {
  const seen = [];
  return cards.filter((card) => {
    const normalized = normalizeText(card?.question);
    if (isNearDuplicate(normalized, seen)) return false;
    seen.push(normalized);
    return true;
  });
}

function dedupeQuestions(questions = []) {
  const seen = [];
  return questions.filter((question) => {
    const normalized = normalizeText(question?.question);
    if (isNearDuplicate(normalized, seen)) return false;
    seen.push(normalized);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Flashcard deck                                                      */
/* ------------------------------------------------------------------ */

function FlashcardDeck({ cards }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState({});

  const total = cards.length;
  const card = cards[index];

  const go = (next) => {
    setFlipped(false);
    setIndex((current) => Math.min(total - 1, Math.max(0, next)));
  };

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "ArrowRight") go(index + 1);
      if (event.key === "ArrowLeft") go(index - 1);
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setFlipped((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, total]);

  if (!card) return null;
  const knownCount = Object.values(known).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-pilot-muted">
        <span>
          Card {index + 1} / {total}
        </span>
        <span className="text-pilot-green">{knownCount} marked known</span>
      </div>

      <div className="flip-scene">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setFlipped((value) => !value)}
          className={`flip-card min-h-[260px] w-full cursor-pointer select-none rounded-[1.75rem] ${flipped ? "is-flipped" : ""}`}
        >
          {/* Front */}
          <div className="flip-face overflow-hidden rounded-[1.75rem] border border-pilot-line bg-gradient-to-br from-white to-pilot-sky p-7 shadow-soft">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-pilot-soft px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-pilot-blue">
              <Sparkles size={13} /> Question
            </span>
            <p className="mt-5 flex-1 text-xl font-black leading-8 text-pilot-ink">{card.question}</p>
            <p className="mt-4 text-sm font-bold text-pilot-muted">Tap card or press Space to flip</p>
          </div>
          {/* Back */}
          <div className="flip-face flip-face-back overflow-hidden rounded-[1.75rem] border border-pilot-blue bg-gradient-to-br from-pilot-blue to-blue-700 p-7 text-white shadow-glow">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white">
              <Check size={13} /> Answer
            </span>
            <p className="mt-5 flex-1 text-lg font-bold leading-8">{card.answer}</p>
            <p className="mt-4 text-sm font-bold text-blue-100">Tap to see the question again</p>
          </div>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {cards.map((item, dotIndex) => (
          <button
            key={item.id || `${item.question}-${dotIndex}`}
            aria-label={`Go to card ${dotIndex + 1}`}
            onClick={() => go(dotIndex)}
            className={`h-2 rounded-full transition-all ${
              dotIndex === index ? "w-6 bg-pilot-blue" : known[dotIndex] ? "w-2 bg-pilot-green" : "w-2 bg-pilot-line"
            }`}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" icon={ChevronLeft} disabled={index === 0} onClick={() => go(index - 1)}>
          Prev
        </Button>
        <Button
          variant={known[index] ? "primary" : "secondary"}
          icon={Check}
          onClick={() => setKnown((current) => ({ ...current, [index]: !current[index] }))}
        >
          {known[index] ? "Known" : "Mark known"}
        </Button>
        <Button variant="secondary" onClick={() => go(index + 1)} disabled={index >= total - 1}>
          Next <ChevronRight size={17} />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Quiz runner with perfected scoring                                  */
/* ------------------------------------------------------------------ */

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

function ScoreRing({ percentage }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const tone = percentage >= 70 ? "#18A66A" : percentage >= 50 ? "#F59E0B" : "#EF4444";
  return (
    <div className="relative grid h-24 w-24 place-items-center">
      <svg className="h-24 w-24 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="#E2E8F0" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <span className="absolute text-xl font-black text-pilot-ink">{percentage}%</span>
    </div>
  );
}

function QuizRunner({ questions, onClose }) {
  const [answers, setAnswers] = useState({});
  const [revealed, setRevealed] = useState({});
  const [shakeKey, setShakeKey] = useState("");

  const keyOf = (question, index) => question.id || `${question.question}-${index}`;

  const entries = useMemo(
    () =>
      questions.map((question, index) => {
        const trueFalse =
          question.question_type === "true_false" && !question.options?.length
            ? [
                { option_text: "True", is_correct: String(question.correct_answer).toLowerCase() === "true" },
                { option_text: "False", is_correct: String(question.correct_answer).toLowerCase() === "false" }
              ]
            : [];
        const options = question.options?.length ? question.options : trueFalse;
        return { question, index, options, objective: options.length > 0, key: keyOf(question, index) };
      }),
    [questions]
  );

  const objectiveEntries = entries.filter((entry) => entry.objective);
  const subjectiveEntries = entries.filter((entry) => !entry.objective);

  const correctCount = objectiveEntries.reduce(
    (total, entry) => total + (answers[entry.key] && answers[entry.key] === entry.question.correct_answer ? 1 : 0),
    0
  );
  const answeredCount = objectiveEntries.filter((entry) => answers[entry.key]).length;
  const objectiveTotal = objectiveEntries.length;
  const revealedSubjective = subjectiveEntries.filter((entry) => revealed[entry.key]).length;
  const complete = objectiveTotal > 0 && answeredCount === objectiveTotal;
  const percentage = objectiveTotal ? Math.round((correctCount / objectiveTotal) * 100) : 0;

  const selectAnswer = (entry, optionText, isCorrect) => {
    if (answers[entry.key]) return;
    if (!isCorrect) {
      setShakeKey(`${entry.key}-${optionText}`);
      window.setTimeout(() => setShakeKey(""), 350);
    }
    setAnswers((current) => ({ ...current, [entry.key]: optionText }));
  };

  const reset = () => {
    setAnswers({});
    setRevealed({});
  };

  const band =
    percentage >= 70
      ? { label: "Great work", tone: "text-pilot-green" }
      : percentage >= 50
        ? { label: "Keep practicing", tone: "text-pilot-amber" }
        : { label: "Review and retry", tone: "text-red-500" };

  return (
    <div className="space-y-4">
      {/* Live progress bar */}
      {objectiveTotal > 0 && (
        <div className="sticky top-0 z-10 rounded-2xl border border-pilot-line bg-white/95 p-3 backdrop-blur">
          <div className="flex items-center justify-between text-xs font-black text-pilot-muted">
            <span>
              {answeredCount} / {objectiveTotal} answered
            </span>
            <span className="text-pilot-green">{correctCount} correct</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-pilot-line">
            <div
              className="h-full rounded-full bg-pilot-blue transition-all"
              style={{ width: `${objectiveTotal ? (answeredCount / objectiveTotal) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {entries.map((entry) => {
        const { question, key, options, objective } = entry;
        const selected = answers[key];
        const isRevealed = revealed[key];
        return (
          <div key={key} className="rounded-2xl border border-pilot-line bg-white p-5 shadow-soft">
            <span className="inline-flex rounded-full bg-pilot-soft px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-pilot-blue">
              {String(question.question_type || "question").replace(/_/g, " ")}
            </span>
            <p className="mt-3 text-base font-black leading-7 text-pilot-ink">{question.question}</p>

            {objective && (
              <div className="mt-4 grid gap-2.5">
                {options.map((option, optionIndex) => {
                  const isSelected = selected === option.option_text;
                  const showCorrect = selected && option.is_correct;
                  const showWrong = selected && isSelected && !option.is_correct;
                  const shaking = shakeKey === `${key}-${option.option_text}`;
                  return (
                    <button
                      key={option.id || option.option_text}
                      disabled={!!selected}
                      onClick={() => selectAnswer(entry, option.option_text, option.is_correct)}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-bold transition disabled:cursor-default ${shaking ? "pilot-shake" : ""} ${
                        showCorrect
                          ? "border-pilot-green bg-green-50 text-pilot-green"
                          : showWrong
                            ? "border-red-300 bg-red-50 text-red-600"
                            : isSelected
                              ? "border-pilot-blue bg-pilot-soft text-pilot-blue"
                              : "border-pilot-line bg-white text-pilot-ink hover:-translate-y-0.5 hover:border-pilot-blue hover:shadow-soft"
                      }`}
                    >
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-black ${
                          showCorrect
                            ? "bg-pilot-green text-white"
                            : showWrong
                              ? "bg-red-500 text-white"
                              : "bg-pilot-soft text-pilot-blue"
                        }`}
                      >
                        {showCorrect ? <Check size={15} /> : showWrong ? <X size={15} /> : OPTION_LETTERS[optionIndex]}
                      </span>
                      <span>{option.option_text}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {!objective && (
              <Button
                variant="secondary"
                className="mt-4"
                onClick={() => setRevealed((current) => ({ ...current, [key]: !current[key] }))}
              >
                {isRevealed ? "Hide suggested answer" : "Reveal suggested answer"}
              </Button>
            )}

            {(selected || isRevealed) && (question.explanation || question.correct_answer) && (
              <div className="pilot-pop mt-3 rounded-xl border border-pilot-line bg-pilot-ice p-3 text-sm leading-6 text-pilot-muted">
                {!objective && question.correct_answer && (
                  <p className="font-bold text-pilot-ink">Suggested answer: {question.correct_answer}</p>
                )}
                {objective && question.correct_answer && (
                  <p className="font-bold text-pilot-green">Correct answer: {question.correct_answer}</p>
                )}
                {question.explanation && <p className="mt-1">{question.explanation}</p>}
              </div>
            )}
          </div>
        );
      })}

      {/* Score summary */}
      {objectiveTotal > 0 && (
        <div className="sticky bottom-0 rounded-2xl border border-pilot-line bg-white/95 p-5 shadow-soft backdrop-blur">
          {complete ? (
            <div className="pilot-pop flex flex-wrap items-center gap-5">
              <ScoreRing percentage={percentage} />
              <div className="flex-1">
                <p className={`text-sm font-black ${band.tone}`}>{band.label}</p>
                <p className="text-2xl font-black text-pilot-ink">
                  {correctCount} / {objectiveTotal} correct
                </p>
                {!!subjectiveEntries.length && (
                  <p className="mt-1 text-xs font-bold text-pilot-muted">
                    {revealedSubjective} / {subjectiveEntries.length} written answers reviewed
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={RotateCcw} onClick={reset}>
                  Retry
                </Button>
                {onClose && <Button onClick={onClose}>Done</Button>}
              </div>
            </div>
          ) : (
            <p className="text-sm font-black text-pilot-ink">
              Answer all {objectiveTotal} questions to see your score.
            </p>
          )}
        </div>
      )}

      {objectiveTotal === 0 && !!subjectiveEntries.length && (
        <div className="sticky bottom-0 rounded-2xl border border-pilot-line bg-white/95 p-4 shadow-soft backdrop-blur">
          <p className="text-sm font-black text-pilot-ink">
            {revealedSubjective} / {subjectiveEntries.length} suggested answers revealed.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" icon={RotateCcw} onClick={() => setRevealed({})}>
              Reset
            </Button>
            {onClose && <Button onClick={onClose}>Done</Button>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Public component                                                    */
/* ------------------------------------------------------------------ */

export default function StudyResultPanel({ result, onClose }) {
  if (!result) return null;
  const payload = result.data || result;
  const cards = dedupeCards(payload.cards || []);
  const questions = dedupeQuestions(payload.questions || []);

  if (cards.length) {
    return <FlashcardDeck cards={cards} />;
  }
  if (questions.length) {
    return <QuizRunner questions={questions} onClose={onClose} />;
  }
  return <p className="text-sm font-bold text-pilot-muted">No study items were generated. Please try again.</p>;
}
