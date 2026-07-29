import { useEffect, useState } from "react";
import {
  ClipboardList,
  Download,
  FileQuestion,
  FileText,
  Layers,
  Link2,
  Sparkles,
  X,
  Youtube
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/common/Button";
import DashboardCard from "../../components/common/DashboardCard";
import Select from "../../components/common/Select";
import StagedProgress from "../../components/common/StagedProgress";
import StudyResultPanel from "../../components/common/StudyResultPanel";
import PageHeader from "../../components/layout/PageHeader";
import {
  downloadYoutubeDocx,
  generateYoutubeFlashcards,
  generateYoutubeMCQs,
  generateYoutubeQuiz
} from "../../services/youtubeService";

const toolConfig = {
  docx: {
    title: "YouTube to Word (DOCX)",
    setupTitle: "Study Notes Setup",
    submitLabel: "Download Study Notes",
    icon: FileText,
    blurb: "Turn a lecture video into a structured Word study document you can keep.",
    loading: "Building your study notes...",
    success: "Study notes downloaded."
  },
  flashcards: {
    title: "YouTube to Flashcards",
    setupTitle: "Flashcard Setup",
    submitLabel: "Generate Flashcards",
    icon: Layers,
    countLabel: "Number of flashcards",
    blurb: "Convert a video into a deck of flip-through flashcards.",
    loading: "Creating flashcards...",
    success: "Flashcards generated successfully."
  },
  mcq: {
    title: "YouTube to MCQ Quiz",
    setupTitle: "MCQ Quiz Setup",
    submitLabel: "Generate MCQ Quiz",
    icon: FileQuestion,
    countLabel: "Number of questions",
    blurb: "Build a multiple-choice quiz straight from the video.",
    loading: "Building your quiz...",
    success: "MCQ quiz generated successfully."
  },
  quiz: {
    title: "YouTube to Mixed Quiz",
    setupTitle: "Mixed Quiz Setup",
    submitLabel: "Generate Mixed Quiz",
    icon: ClipboardList,
    countLabel: "Number of questions",
    blurb: "Mix multiple choice, true/false, and written questions.",
    loading: "Generating study material...",
    success: "Mixed quiz generated successfully."
  }
};

// YouTube runs have an extra transcript step before the AI work. These pace
// the progress display only; the last phase holds until the response lands.
const transcriptStep = { label: "Fetching the video transcript...", short: "Transcript", seconds: 8 };

const youtubeGenerationSteps = [
  transcriptStep,
  { label: "Asking the AI to build your questions...", short: "Generate", seconds: 16 },
  { label: "Checking and formatting the results...", short: "Polish", seconds: 6 }
];

const youtubeDocxSteps = [
  transcriptStep,
  { label: "Writing your study notes...", short: "Write", seconds: 18 },
  { label: "Building the Word document...", short: "Document", seconds: 8 }
];

const countOptions = [10, 20, 30];
const questionTypes = [
  { label: "Multiple choice", value: "multiple_choice" },
  { label: "True or false", value: "true_false" },
  { label: "Short answer", value: "short_answer" },
  { label: "Theory", value: "theory" }
];
const documentStyles = [
  { label: "Study guide", value: "study_guide" },
  { label: "Lecture notes", value: "lecture_notes" },
  { label: "Summary", value: "summary" }
];
const detailLevels = [
  { label: "Comprehensive", value: "comprehensive" },
  { label: "Concise", value: "concise" },
  { label: "Detailed", value: "detailed" }
];

const YOUTUBE_PATTERN = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)\/.+/i;

function StatusMessage({ message, tone = "blue" }) {
  if (!message) return null;
  const classes =
    tone === "red"
      ? "border-red-100 bg-red-50 text-red-700"
      : tone === "green"
        ? "border-green-100 bg-green-50 text-pilot-green"
        : "border-blue-100 bg-pilot-soft text-pilot-blue";
  return <p className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${classes}`}>{message}</p>;
}

function SetupPanel({ selectedTool, setup, setSetup, loadingAction, onGenerate, result }) {
  if (!selectedTool) return null;
  const config = toolConfig[selectedTool];
  if (result) return null;

  const isDocx = selectedTool === "docx";
  const toggleType = (value) => {
    setSetup((current) => {
      const exists = current.questionTypes.includes(value);
      const next = exists
        ? current.questionTypes.filter((item) => item !== value)
        : [...current.questionTypes, value];
      return { ...current, questionTypes: next.length ? next : ["multiple_choice"] };
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1fr]">
      <div className="rounded-2xl border border-pilot-line bg-pilot-ice p-5">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-pilot-blue shadow-soft">
          <config.icon size={23} />
        </div>
        <h3 className="mt-4 text-lg font-black text-pilot-ink">{config.title}</h3>
        <p className="mt-2 text-sm leading-6 text-pilot-muted">{config.blurb}</p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-black text-pilot-blue shadow-soft">
          <Youtube size={14} /> Works best with lecture videos that have captions
        </p>
      </div>

      <div className="grid gap-4">
        <Select
          label="Difficulty"
          value={setup.difficulty}
          onChange={(event) => setSetup((current) => ({ ...current, difficulty: event.target.value }))}
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </Select>

        {isDocx ? (
          <>
            <Select
              label="Document style"
              value={setup.documentStyle}
              onChange={(event) => setSetup((current) => ({ ...current, documentStyle: event.target.value }))}
            >
              {documentStyles.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </Select>
            <Select
              label="Detail level"
              value={setup.detailLevel}
              onChange={(event) => setSetup((current) => ({ ...current, detailLevel: event.target.value }))}
            >
              {detailLevels.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </Select>
          </>
        ) : (
          <div>
            <p className="mb-2 text-sm font-semibold text-pilot-ink">{config.countLabel}</p>
            <div className="flex flex-wrap gap-2">
              {countOptions.map((item) => (
                <button
                  key={item}
                  onClick={() => setSetup((current) => ({ ...current, count: item }))}
                  className={`rounded-xl border px-4 py-2 text-sm font-black transition ${
                    Number(setup.count) === item
                      ? "border-pilot-blue bg-pilot-blue text-white shadow-glow"
                      : "border-pilot-line bg-white text-pilot-muted hover:border-pilot-blue hover:text-pilot-blue"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}

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
                    className={`rounded-xl border px-4 py-3 text-left text-sm font-black transition ${
                      active
                        ? "border-pilot-blue bg-pilot-soft text-pilot-blue"
                        : "border-pilot-line bg-white text-pilot-muted hover:border-pilot-blue"
                    }`}
                  >
                    {type.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <Button icon={isDocx ? Download : Sparkles} disabled={!!loadingAction} onClick={onGenerate}>
          {loadingAction ? config.loading : config.submitLabel}
        </Button>
      </div>
    </div>
  );
}

function ToolModal({ selectedTool, setup, setSetup, loadingAction, result, error, status, onClose, onGenerate }) {
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
  const isDocx = selectedTool === "docx";

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
              <p className="text-xs font-black uppercase tracking-[0.16em] text-pilot-blue">
                {result ? "Generated Result" : "YouTube Study Tool"}
              </p>
              <h2 className="text-xl font-black text-pilot-ink">{result?.title || config.setupTitle}</h2>
              {!isDocx && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-pilot-soft px-3 py-1 text-xs font-black text-pilot-blue">
                    {Number(setup.count)} {selectedTool === "flashcards" ? "Cards" : "Questions"}
                  </span>
                  <span className="rounded-full bg-pilot-soft px-3 py-1 text-xs font-black capitalize text-pilot-blue">
                    {setup.difficulty} Difficulty
                  </span>
                </div>
              )}
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
          {loadingAction === selectedTool && (
            <StagedProgress
              steps={selectedTool === "docx" ? youtubeDocxSteps : youtubeGenerationSteps}
              note="Longer videos take longer to process."
            />
          )}
          {!result && status && !error && loadingAction !== selectedTool && (
            <StatusMessage message={status} tone="green" />
          )}
          {!result && (
            <SetupPanel
              selectedTool={selectedTool}
              setup={setup}
              setSetup={setSetup}
              loadingAction={loadingAction}
              onGenerate={onGenerate}
              result={result}
            />
          )}
          {result && (
            <div className="mt-2">
              <StudyResultPanel result={result} onClose={onClose} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default function YouTubeStudioPage() {
  const navigate = useNavigate();
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [selectedTool, setSelectedTool] = useState("");
  const [setup, setSetup] = useState({
    difficulty: "medium",
    count: 10,
    documentStyle: "study_guide",
    detailLevel: "comprehensive",
    questionTypes: ["multiple_choice", "true_false", "short_answer", "theory"]
  });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  const [result, setResult] = useState(null);

  const urlValid = YOUTUBE_PATTERN.test(youtubeUrl.trim());

  const selectTool = (tool) => {
    if (!urlValid) {
      setError("Paste a valid YouTube link before choosing a study tool.");
      return;
    }
    setError("");
    setResult(null);
    setStatus("");
    setSelectedTool(tool);
  };

  const closeToolModal = () => {
    if (loadingAction) return;
    setSelectedTool("");
    setResult(null);
    setError("");
  };

  const runGeneration = async () => {
    if (!selectedTool) return;
    if (!urlValid) {
      setError("Paste a valid YouTube link first.");
      return;
    }
    if (!localStorage.getItem("studypilot_access_token")) {
      navigate("/login", { replace: true });
      return;
    }
    const url = youtubeUrl.trim();
    const count = Number(setup.count);
    const config = toolConfig[selectedTool];
    setError("");
    setResult(null);
    setLoadingAction(selectedTool);
    setStatus(config.loading);

    try {
      if (selectedTool === "docx") {
        await downloadYoutubeDocx({
          youtube_url: url,
          difficulty: setup.difficulty,
          document_style: setup.documentStyle,
          detail_level: setup.detailLevel
        });
        setStatus(config.success);
        setSelectedTool("");
        return;
      }

      const basePayload = { youtube_url: url, difficulty: setup.difficulty };
      const response =
        selectedTool === "flashcards"
          ? await generateYoutubeFlashcards({ ...basePayload, number_of_cards: count })
          : selectedTool === "mcq"
            ? await generateYoutubeMCQs({ ...basePayload, number_of_questions: count })
            : await generateYoutubeQuiz({
                ...basePayload,
                number_of_questions: count,
                question_types: setup.questionTypes
              });

      setResult({
        ...(response.data || {}),
        title:
          selectedTool === "flashcards"
            ? "Generated Flashcards"
            : selectedTool === "mcq"
              ? "Generated MCQs"
              : "Generated Mixed Quiz"
      });
      setStatus(config.success);
    } catch (generationError) {
      setError(generationError.message || "StudyPilot could not process this video. Try a lecture video with captions.");
      setStatus("");
    } finally {
      setLoadingAction("");
    }
  };

  return (
    <div>
      <PageHeader
        title="YouTube Converter"
        subtitle="Paste a YouTube lecture link, then turn it into Word study notes, flashcards, or a quiz."
      />

      <DashboardCard>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-pilot-ink">YouTube video link</span>
          <div className="flex items-center gap-2 rounded-2xl border border-pilot-line bg-pilot-ice px-4 py-3 transition focus-within:border-pilot-blue focus-within:ring-4 focus-within:ring-pilot-blue/10">
            <Link2 size={18} className="shrink-0 text-pilot-blue" />
            <input
              type="url"
              inputMode="url"
              value={youtubeUrl}
              onChange={(event) => {
                setYoutubeUrl(event.target.value);
                if (error) setError("");
              }}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full bg-transparent text-sm font-bold text-pilot-ink outline-none placeholder:font-medium placeholder:text-pilot-muted"
            />
            {youtubeUrl && (
              <button
                type="button"
                aria-label="Clear link"
                onClick={() => setYoutubeUrl("")}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-pilot-muted transition hover:bg-white hover:text-pilot-blue"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </label>
        {youtubeUrl && !urlValid && (
          <StatusMessage message="That does not look like a YouTube link. Paste a youtube.com or youtu.be URL." tone="red" />
        )}
        {urlValid && <StatusMessage message="Link looks good. Pick a study tool below." tone="green" />}
        {error && !selectedTool && <StatusMessage message={error} tone="red" />}
        {status && !selectedTool && !error && <StatusMessage message={status} tone="green" />}
      </DashboardCard>

      <DashboardCard title="YouTube Study Conversions" className="mt-6">
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Object.entries(toolConfig).map(([key, tool]) => {
            const active = selectedTool === key;
            return (
              <button
                key={key}
                disabled={!!loadingAction}
                onClick={() => selectTool(key)}
                className={`rounded-[1.5rem] border p-5 text-left transition ${
                  active
                    ? "border-pilot-blue bg-pilot-soft shadow-glow"
                    : urlValid
                      ? "border-pilot-line bg-white hover:-translate-y-1 hover:border-pilot-blue hover:shadow-pilot"
                      : "border-pilot-line bg-white hover:border-pilot-blue"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-pilot-blue shadow-soft">
                  <tool.icon size={23} />
                </div>
                <h3 className="mt-4 font-black text-pilot-ink">{tool.title}</h3>
                <p className="mt-2 text-sm leading-6 text-pilot-muted">{tool.blurb}</p>
              </button>
            );
          })}
        </div>
      </DashboardCard>

      <ToolModal
        selectedTool={selectedTool}
        setup={setup}
        setSetup={setSetup}
        loadingAction={loadingAction}
        result={result}
        status={status}
        error={selectedTool ? error : ""}
        onClose={closeToolModal}
        onGenerate={runGeneration}
      />
    </div>
  );
}
