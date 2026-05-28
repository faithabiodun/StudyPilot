import QuizPreview from "./QuizPreview";

export default function QuizQuestion({ quiz, selected, onSelect }) {
  return <QuizPreview quiz={quiz} selected={selected} onSelect={onSelect} />;
}
