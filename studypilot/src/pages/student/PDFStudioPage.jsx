import { useEffect, useState } from "react";
import { ClipboardList, FileQuestion, FileText, Layers, Lock, RotateCcw, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/common/Button";
import DashboardCard from "../../components/common/DashboardCard";
import Select from "../../components/common/Select";
import PageHeader from "../../components/layout/PageHeader";
import UploadBox from "../../components/upload/UploadBox";
import { generateFlashcards } from "../../services/flashcardService";
import { uploadMaterial } from "../../services/materialService";
import { generateMCQs, generateQuiz } from "../../services/quizService";

const toolConfig = {
  flashcards: {
    title: "Generate Flashcards",
    setupTitle: "Flashcard Setup",
    submitLabel: "Generate Flashcards",
    icon: Layers,
    countLabel: "Number of flashcards",
    loading: "Creating flashcards...",
    success: "Flashcards generated successfully."
  },
  mcq: {
    title: "Generate MCQ Quiz",
    setupTitle: "MCQ Quiz Setup",
    submitLabel: "Generate MCQ Quiz",
    icon: FileQuestion,
    countLabel: "Number of questions",
    loading: "Building your quiz...",
    success: "MCQ quiz generated successfully."
  },
  quiz: {
    title: "Generate Mixed Quiz",
    setupTitle: "Mixed Quiz Setup",
    submitLabel: "Generate Mixed Quiz",
    icon: ClipboardList,
    countLabel: "Number of questions",
    loading: "Generating study material...",
    success: "Mixed quiz generated successfully."
  }
};

const countOptions = [10, 20, 30];
const questionTypes = [
  { label: "Multiple choice", value: "multiple_choice" },
  { label: "True or false", value: "true_false" },
  { label: "Short answer", value: "short_answer" },
  { label: "Theory", value: "theory" }
];

function normalizeQuestionText(value) {
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

function dedupeOptions(options = []) {
  const seen = new Set();
  const unique = [];
  options.forEach((option) => {
    const text = option?.option_text || "";
    const normalized = normalizeQuestionText(text);
    if (!text || seen.has(normalized)) return;
    unique.push(option);
    seen.add(normalized);
  });
  return unique;
}

function dedupeCards(cards = []) {
  const seen = [];
  return cards.filter((card) => {
    const normalized = normalizeQuestionText(card?.question);
    if (isNearDuplicate(normalized, seen)) return false;
    seen.push(normalized);
    return true;
  });
}

function dedupeQuestions(questions = []) {
  const seen = [];
  return questions.filter((question) => {
    const normalized = normalizeQuestionText(question?.question);
    if (isNearDuplicate(normalized, seen)) return false;
    question.options = dedupeOptions(question.options || []);
    seen.push(normalized);
    return true;
  });
}

function StatusMessage({ message, tone = "blue" }) {
  if (!message) return null;
  const classes = tone === "red" ? "border-red-100 bg-red-50 text-red-700" : "border-blue-100 bg-pilot-soft text-pilot-blue";
  return <p className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${classes}`}>{message}</p>;
}

function ModalResultPanel({ result, onClose }) {
  const [flipped, setFlipped] = useState(false);
  const [answers, setAnswers] = useState({});
  const [revealed, setRevealed] = useState({});
  const [cardIndex, setCardIndex] = useState(0);
  useEffect(() => {
    setFlipped(false);
    setAnswers({});
    setRevealed({});
    setCardIndex(0);
  }, [result]);
  if (!result) return null;
  const payload = result.data || result;
  const cards = dedupeCards(payload.cards || []);
  const questions = dedupeQuestions(payload.questions || []);
  const activeCard = cards[cardIndex] || null;
  const questionKey = (question, index) => question.id || `${question.question}-${index}`;
  const objectiveEntries = questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => {
    const hasOptions = question.options?.length || question.question_type === "true_false";
    return Boolean(hasOptions);
  });
  const correctCount = objectiveEntries.reduce((total, { question, index }) => {
    const key = questionKey(question, index);
    return total + (answers[key] && answers[key] === question.correct_answer ? 1 : 0);
  }, 0);
  const answeredObjective = objectiveEntries.reduce((total, { question, index }) => {
    const key = questionKey(question, index);
    return total + (answers[key] ? 1 : 0);
  }, 0);
  const objectiveTotal = objectiveEntries.length;
  const quizComplete = objectiveTotal > 0 && answeredObjective === objectiveTotal;
  const subjectiveTotal = questions.length - objectiveTotal;
  const revealedSubjective = questions.reduce((total, question, index) => {
    const hasOptions = question.options?.length || question.question_type === "true_false";
    return total + (!hasOptions && revealed[`reveal-${questionKey(question, index)}`] ? 1 : 0);
  }, 0);

  return (
    <div className="mt-5 space-y-4">
        {activeCard && (() => {
          const key = activeCard.id || `${activeCard.question}-${cardIndex}`;
          return (
            <div key={key}>
              <button
                onClick={() => setFlipped((current) => !current)}
                className="min-h-[190px] w-full rounded-2xl border border-pilot-line bg-pilot-ice p-5 text-left transition hover:-translate-y-0.5 hover:border-pilot-blue hover:shadow-soft"
              >
                <p className="text-xs font-black uppercase tracking-[0.14em] text-pilot-blue">{flipped ? "Answer" : "Question"} {cardIndex + 1} of {cards.length}</p>
                <p className="mt-3 text-base font-black leading-7 text-pilot-ink">{flipped ? activeCard.answer : activeCard.question}</p>
                <p className="mt-4 text-sm font-bold text-pilot-muted">Click card to {flipped ? "show question" : "reveal answer"}</p>
              </button>
              <div className="mt-3 flex justify-between gap-3">
                <Button variant="secondary" disabled={cardIndex === 0} onClick={() => { setFlipped(false); setCardIndex((index) => Math.max(0, index - 1)); }}>Previous</Button>
                <Button variant="secondary" disabled={cardIndex >= cards.length - 1} onClick={() => { setFlipped(false); setCardIndex((index) => Math.min(cards.length - 1, index + 1)); }}>Next</Button>
              </div>
            </div>
          );
        })()}
        {questions.map((question, index) => {
          const key = questionKey(question, index);
          const selected = answers[key];
          const correct = question.correct_answer;
          const trueFalseOptions = question.question_type === "true_false" && !question.options?.length
            ? [{ option_text: "True", is_correct: correct?.toLowerCase() === "true" }, { option_text: "False", is_correct: correct?.toLowerCase() === "false" }]
            : [];
          const options = question.options?.length ? question.options : trueFalseOptions;
          const revealKey = `reveal-${key}`;
          return (
            <div key={key} className="rounded-2xl border border-pilot-line bg-pilot-ice p-4">
              <p className="inline-flex rounded-full bg-pilot-soft px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-pilot-blue">{question.question_type}</p>
              <p className="mt-3 font-black leading-7 text-pilot-ink">{question.question}</p>
              {!!options.length && (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {options.map((option) => {
                    const isSelected = selected === option.option_text;
                    const showCorrect = selected && option.is_correct;
                    const showWrong = selected && isSelected && !option.is_correct;
                    return (
                      <button
                        key={option.id || option.option_text}
                        disabled={!!selected}
                        onClick={() => {
                          if (selected) return;
                          setAnswers((current) => ({ ...current, [key]: option.option_text }));
                        }}
                        className={`rounded-xl border px-3 py-2 text-left text-sm font-bold transition ${
                          showCorrect
                            ? "border-green-200 bg-green-50 text-green-700"
                            : showWrong
                              ? "border-red-200 bg-red-50 text-red-700"
                            : isSelected
                              ? "border-pilot-blue bg-pilot-soft text-pilot-blue"
                              : "border-pilot-line bg-white text-pilot-muted hover:border-pilot-blue"
                        } disabled:cursor-default`}
                      >
                        {option.option_text}
                      </button>
                    );
                  })}
                </div>
              )}
              {!!options.length && selected && correct && <p className="mt-3 text-sm font-bold text-green-700">Correct answer: {correct}</p>}
              {!options.length && (
                <Button variant="secondary" className="mt-3" onClick={() => setRevealed((current) => ({ ...current, [revealKey]: !current[revealKey] }))}>
                  {revealed[revealKey] ? "Hide suggested answer" : "Reveal suggested answer"}
                </Button>
              )}
              {(selected || revealed[revealKey]) && (question.explanation || correct) && (
                <p className="mt-3 text-sm leading-6 text-pilot-muted">{!options.length && correct ? `Suggested answer: ${correct}. ` : ""}{question.explanation}</p>
              )}
            </div>
          );
        })}
        {!!objectiveTotal && (
          <div className="sticky bottom-0 rounded-2xl border border-blue-100 bg-white/95 p-4 shadow-soft backdrop-blur">
            {quizComplete ? (
              <>
                <p className="text-sm font-black text-pilot-ink">Final score: {correctCount} / {objectiveTotal}</p>
                {!!subjectiveTotal && <p className="mt-1 text-xs font-bold text-pilot-muted">Suggested answers revealed for {revealedSubjective} of {subjectiveTotal} short answer/theory questions.</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    icon={RotateCcw}
                    onClick={() => {
                      setAnswers({});
                      setRevealed({});
                    }}
                  >
                    Retry Quiz
                  </Button>
                  <Button onClick={onClose}>Close</Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-black text-pilot-ink">Answered {answeredObjective} of {objectiveTotal} objective questions.</p>
                <p className="mt-1 text-xs font-bold text-pilot-muted">Final score appears after every objective question is answered.</p>
              </>
            )}
          </div>
        )}
        {!objectiveTotal && !!subjectiveTotal && (
          <div className="sticky bottom-0 rounded-2xl border border-blue-100 bg-white/95 p-4 shadow-soft backdrop-blur">
            <p className="text-sm font-black text-pilot-ink">Completed {revealedSubjective} of {subjectiveTotal} suggested answers.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" icon={RotateCcw} onClick={() => setRevealed({})}>Reset</Button>
              <Button onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </div>
  );
}

function SetupPanel({ selectedTool, setup, setSetup, loadingAction, onGenerate, result }) {
  if (!selectedTool) return null;
  const config = toolConfig[selectedTool];
  const countValue = countOptions.includes(Number(setup.count)) ? Number(setup.count) : "custom";
  const toggleType = (value) => {
    setSetup((current) => {
      const exists = current.questionTypes.includes(value);
      const next = exists ? current.questionTypes.filter((item) => item !== value) : [...current.questionTypes, value];
      return { ...current, questionTypes: next.length ? next : ["multiple_choice"] };
    });
  };

  return (
      <div className={`grid gap-5 ${result ? "" : "lg:grid-cols-[0.8fr_1fr]"}`}>
        {!result && (
        <div className="rounded-2xl border border-pilot-line bg-pilot-ice p-5">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-pilot-blue shadow-soft">
            <config.icon size={23} />
          </div>
          <h3 className="mt-4 text-lg font-black text-pilot-ink">{config.title}</h3>
          <p className="mt-2 text-sm leading-6 text-pilot-muted">
            Choose your setup and StudyPilot will create study material from your extracted PDF text.
          </p>
        </div>
        )}
        {!result && (
        <div className="grid gap-4">
          <Select label="Difficulty" value={setup.difficulty} onChange={(event) => setSetup((current) => ({ ...current, difficulty: event.target.value }))}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>

          <div>
            <p className="mb-2 text-sm font-semibold text-pilot-ink">{config.countLabel}</p>
            <div className="flex flex-wrap gap-2">
              {countOptions.map((item) => (
                <button
                  key={item}
                  onClick={() => setSetup((current) => ({ ...current, count: item }))}
                  className={`rounded-xl border px-4 py-2 text-sm font-black transition ${countValue === item ? "border-pilot-blue bg-pilot-blue text-white shadow-glow" : "border-pilot-line bg-white text-pilot-muted hover:border-pilot-blue hover:text-pilot-blue"}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {selectedTool === "quiz" && (
            <div>
              <p className="mb-2 text-sm font-semibold text-pilot-ink">Question types</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {questionTypes.map((type) => {
                  const active = setup.questionTypes.includes(type.value);
                  return (
                    <button
                      key={type.value}
                      onClick={() => toggleType(type.value)}
                      className={`rounded-xl border px-4 py-3 text-left text-sm font-black transition ${active ? "border-pilot-blue bg-pilot-soft text-pilot-blue" : "border-pilot-line bg-white text-pilot-muted hover:border-pilot-blue"}`}
                    >
                      {type.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <Button icon={Sparkles} disabled={!!loadingAction} onClick={onGenerate}>
            {loadingAction ? config.loading : config.submitLabel}
          </Button>
        </div>
        )}
      </div>
  );
}

function ToolModal({ selectedTool, setup, setSetup, loadingAction, result, error, onClose, onGenerate }) {
  const config = selectedTool ? toolConfig[selectedTool] : null;

  useEffect(() => {
    if (!selectedTool) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !loadingAction) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedTool, loadingAction, onClose]);

  if (!selectedTool || !config) return null;
  const Icon = config.icon;
  const count = Number(setup.count);

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loadingAction) onClose();
      }}
    >
      <section className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[1.75rem] border border-white/60 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.25)]">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-pilot-line bg-white/95 p-5 backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-pilot-soft text-pilot-blue">
              <Icon size={23} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-pilot-blue">{result ? "Generated Result" : "Study Tool"}</p>
              <h2 className="text-xl font-black text-pilot-ink">{result?.title || config.setupTitle}</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-pilot-soft px-3 py-1 text-xs font-black text-pilot-blue">{count} {selectedTool === "flashcards" ? "Cards" : "Questions"}</span>
                <span className="rounded-full bg-pilot-soft px-3 py-1 text-xs font-black capitalize text-pilot-blue">{setup.difficulty} Difficulty</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close generator"
            onClick={onClose}
            disabled={!!loadingAction}
            className="grid h-10 w-10 place-items-center rounded-full border border-pilot-line bg-white text-pilot-muted transition hover:border-pilot-blue hover:text-pilot-blue disabled:opacity-60"
          >
            <X size={18} />
          </button>
        </header>
        <div className="max-h-[calc(90vh-110px)] overflow-y-auto p-5">
          {error && <StatusMessage message={error} tone="red" />}
          {loadingAction === selectedTool && <StatusMessage message={config.loading} />}
          {!result && <SetupPanel selectedTool={selectedTool} setup={setup} setSetup={setSetup} loadingAction={loadingAction} onGenerate={onGenerate} result={result} />}
          {result && <ModalResultPanel result={result} onClose={onClose} />}
        </div>
      </section>
    </div>
  );
}

export default function PDFStudioPage() {
  const navigate = useNavigate();
  const [activeDocument, setActiveDocument] = useState(null);
  const [latestFile, setLatestFile] = useState("");
  const [selectedTool, setSelectedTool] = useState("");
  const [setup, setSetup] = useState({
    difficulty: "medium",
    count: 10,
    questionTypes: ["multiple_choice", "true_false", "short_answer", "theory"]
  });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  const [result, setResult] = useState(null);

  const addFile = async (file) => {
    if (!file) return;
    if (!localStorage.getItem("studypilot_access_token")) {
      navigate("/login", { replace: true });
      return;
    }
    setError("");
    setResult(null);
    setSelectedTool("");
    setLatestFile(file.name);
    setLoadingAction("upload");
    setStatus("Extracting readable text from your PDF...");
    try {
      const response = await uploadMaterial({ file, title: file.name.replace(/\.[^/.]+$/, "") });
      const document = response.data;
      setActiveDocument(document);
      setStatus(`PDF processed successfully. Extracted ${document.extracted_text_length || 0} characters from ${document.page_count || "unknown"} pages in ${document.processing_time_seconds || "a few"} seconds. ${document.notice || ""}`);
    } catch (uploadError) {
      setError(uploadError.message || "Invalid PDF or no readable text was found in this PDF.");
      setStatus("");
    } finally {
      setLoadingAction("");
    }
  };

  const selectTool = (tool) => {
    if (!activeDocument?.id) {
      setError("Upload and process a PDF before generating study tools.");
      return;
    }
    setError("");
    setResult(null);
    setSelectedTool(tool);
  };

  const closeToolModal = () => {
    if (loadingAction && loadingAction !== "upload") return;
    setSelectedTool("");
    setResult(null);
    setError("");
  };

  const runGeneration = async () => {
    if (!activeDocument?.id || !selectedTool) return;
    const count = Number(setup.count);
    if (!countOptions.includes(count)) {
      setError("Choose 10, 20, or 30.");
      return;
    }
    setError("");
    setResult(null);
    setLoadingAction(selectedTool);
    setStatus(toolConfig[selectedTool].loading);
    try {
      const basePayload = {
        document_id: activeDocument.id,
        difficulty: setup.difficulty,
      };
      const response = selectedTool === "flashcards"
        ? await generateFlashcards({ ...basePayload, number_of_cards: count })
        : selectedTool === "mcq"
          ? await generateMCQs({ ...basePayload, number_of_questions: count, show_explanations: true })
          : await generateQuiz({ ...basePayload, number_of_questions: count, question_types: setup.questionTypes });
      setResult({ ...(response.data || {}), title: selectedTool === "flashcards" ? "Generated Flashcards" : selectedTool === "mcq" ? "Generated MCQs" : "Generated Mixed Quiz" });
      setStatus(toolConfig[selectedTool].success);
    } catch (generationError) {
      setError(generationError.message || "Not enough clean text was found to generate questions.");
      setStatus("");
    } finally {
      setLoadingAction("");
    }
  };

  return (
    <div>
      <PageHeader title="PDF Study Converter" subtitle="Upload one readable PDF, extract its text, delete the file, then generate study tools from the saved content." />
      <DashboardCard>
        <UploadBox fileName={latestFile || activeDocument?.original_filename} onFile={addFile} />
        <StatusMessage message={loadingAction === "upload" ? "Extracting readable text from your PDF..." : status} />
        <StatusMessage message={error} tone="red" />
      </DashboardCard>

      <DashboardCard title="PDF Study Conversions" className="mt-6">
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {Object.entries(toolConfig).map(([key, tool]) => {
            const unlocked = Boolean(activeDocument?.id);
            const active = selectedTool === key;
            return (
              <button
                key={key}
                disabled={!unlocked || !!loadingAction}
                onClick={() => selectTool(key)}
                className={`rounded-[1.5rem] border p-5 text-left transition ${
                  active
                    ? "border-pilot-blue bg-pilot-soft shadow-glow"
                    : unlocked
                      ? "border-pilot-line bg-white hover:-translate-y-1 hover:border-pilot-blue hover:shadow-pilot"
                      : "cursor-not-allowed border-pilot-line bg-pilot-ice opacity-75"
                }`}
              >
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-pilot-blue shadow-soft">
                  {unlocked ? <tool.icon size={23} /> : <Lock size={23} />}
                </div>
                <h3 className="mt-4 font-black text-pilot-ink">{tool.title}</h3>
                <p className="mt-2 text-sm leading-6 text-pilot-muted">{unlocked ? "Open setup, then StudyPilot prepares the best PDF sections." : "Upload a PDF first to unlock this tool."}</p>
              </button>
            );
          })}
        </div>
      </DashboardCard>

      {activeDocument && (
        <DashboardCard title="Processed Document" className="mt-6">
          <div className="mt-5 rounded-2xl border border-pilot-line bg-pilot-ice p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-pilot-blue shadow-soft">
                <FileText size={23} />
              </div>
              <div>
                <h3 className="font-black text-pilot-ink">{activeDocument.title}</h3>
                <p className="mt-1 text-sm text-pilot-muted">{activeDocument.original_filename}</p>
                <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-pilot-blue">
                  Extracted text available | {activeDocument.page_count || "Unknown"} pages | {activeDocument.extracted_text_length || 0} characters | {(activeDocument.file_size / 1024).toFixed(1)} KB
                </p>
                {activeDocument.focused_start_page !== undefined && activeDocument.focused_start_page !== null && (
                  <p className="mt-2 text-xs font-bold text-pilot-muted">
                    Generation focus: pages {(activeDocument.focused_start_page || 0) + 1} to {activeDocument.focused_end_page || activeDocument.page_count || "end"} | {activeDocument.focused_extracted_text_length || activeDocument.extracted_text_length || 0} focused characters
                  </p>
                )}
              </div>
            </div>
            <p className="mt-4 line-clamp-4 text-sm leading-6 text-pilot-muted">{activeDocument.extracted_text}</p>
          </div>
        </DashboardCard>
      )}

      <ToolModal
        selectedTool={selectedTool}
        setup={setup}
        setSetup={setSetup}
        loadingAction={loadingAction}
        result={result}
        error={selectedTool ? error : ""}
        onClose={closeToolModal}
        onGenerate={runGeneration}
      />
    </div>
  );
}
