import { useEffect, useState } from "react";
import { ClipboardList, FileQuestion, FileText, Layers, Lock, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/common/Button";
import DashboardCard from "../../components/common/DashboardCard";
import Select from "../../components/common/Select";
import StagedProgress from "../../components/common/StagedProgress";
import StudyResultPanel from "../../components/common/StudyResultPanel";
import PageHeader from "../../components/layout/PageHeader";
import UploadBox from "../../components/upload/UploadBox";
import { generateFlashcards } from "../../services/flashcardService";
import { fetchDeploymentHealth, MAX_PDF_UPLOAD_MB, uploadMaterial } from "../../services/materialService";
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

// Rough timings for a typical PDF. They only pace the progress display; the
// final phase holds until the real response lands.
const uploadSteps = [
  { label: "Uploading your PDF...", short: "Upload", seconds: 4 },
  { label: "Extracting readable text...", short: "Extract", seconds: 5 },
  { label: "Saving your study material...", short: "Save", seconds: 3 }
];

const generationSteps = [
  { label: "Reading your study material...", short: "Read", seconds: 3 },
  { label: "Asking the AI to build your questions...", short: "Generate", seconds: 14 },
  { label: "Checking and formatting the results...", short: "Polish", seconds: 6 }
];

const countOptions = [10, 20, 30];
const questionTypes = [
  { label: "Multiple choice", value: "multiple_choice" },
  { label: "True or false", value: "true_false" },
  { label: "Short answer", value: "short_answer" },
  { label: "Theory", value: "theory" }
];

function StatusMessage({ message, tone = "blue" }) {
  if (!message) return null;
  const classes = tone === "red" ? "border-red-100 bg-red-50 text-red-700" : "border-blue-100 bg-pilot-soft text-pilot-blue";
  return <p className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${classes}`}>{message}</p>;
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
          {loadingAction === selectedTool && (
            <StagedProgress steps={generationSteps} note="Generation usually takes 10 to 30 seconds." />
          )}
          {!result && <SetupPanel selectedTool={selectedTool} setup={setup} setSetup={setSetup} loadingAction={loadingAction} onGenerate={onGenerate} result={result} />}
          {result && <div className="mt-2"><StudyResultPanel result={result} onClose={onClose} /></div>}
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
  const [uploadLimitMb, setUploadLimitMb] = useState(MAX_PDF_UPLOAD_MB);

  useEffect(() => {
    let mounted = true;
    fetchDeploymentHealth()
      .then((response) => {
        const limit = Number(response?.upload_limit_mb ?? response?.data?.upload_limit_mb);
        if (mounted && limit > 0) setUploadLimitMb(limit);
      })
      .catch(() => {
        if (import.meta.env.DEV) {
          console.log("Deployment upload limit could not be fetched; using frontend default.");
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

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
      const response = await uploadMaterial({ file, title: file.name.replace(/\.[^/.]+$/, ""), maxPdfUploadMb: uploadLimitMb });
      const document = response.data;
      setActiveDocument(document);
      setStatus(`PDF processed successfully. Extracted ${document.extracted_text_length || 0} characters from ${document.page_count || "unknown"} pages in ${document.processing_time_seconds || "a few"} seconds. ${document.notice || ""}`);
    } catch (uploadError) {
      if (uploadError?.status === 401) {
        navigate("/login", { replace: true });
      }
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
        <UploadBox fileName={latestFile || activeDocument?.original_filename} onFile={addFile} uploadLimitMb={uploadLimitMb} />
        {loadingAction === "upload" ? (
          <StagedProgress steps={uploadSteps} note="Larger PDFs take longer to read." />
        ) : (
          <StatusMessage message={status} />
        )}
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
