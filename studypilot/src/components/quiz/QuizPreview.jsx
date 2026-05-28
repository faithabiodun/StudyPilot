export default function QuizPreview({ quiz, selected, onSelect }) {
  if (!quiz) return null;
  return (
    <div className="rounded-[1.75rem] border border-pilot-line bg-white p-6 shadow-soft">
      <p className="text-sm font-black text-pilot-blue">Generated Quiz</p>
      <h3 className="mt-3 text-xl font-black text-pilot-ink">{quiz.question}</h3>
      <div className="mt-5 space-y-3">
        {quiz.options.map((option) => (
          <button
            key={option}
            onClick={() => onSelect(option)}
            className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${
              selected === option ? "border-pilot-blue bg-pilot-soft text-pilot-blue" : "border-pilot-line bg-white text-pilot-muted hover:border-pilot-blue hover:text-pilot-blue"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      {selected && <p className="mt-5 rounded-2xl bg-pilot-sky p-4 text-sm leading-6 text-pilot-muted">Selected: <span className="font-black text-pilot-blue">{selected}</span>. {quiz.explanation}</p>}
    </div>
  );
}
