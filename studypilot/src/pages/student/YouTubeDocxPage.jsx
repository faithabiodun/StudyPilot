import {
  AlertCircle,
  CheckCircle,
  Clock3,
  Download,
  FileText,
  Loader2,
  PlayCircle,
  ScrollText,
  Sparkles,
  Youtube
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import PageHeader from "../../components/layout/PageHeader";
import { analyzeYoutubeVideo, downloadYoutubeDocx, generateYoutubeDocx } from "../../services/youtubeDocxService";

const loadingSteps = [
  "Fetching video details...",
  "Checking captions...",
  "Trying subtitles...",
  "Trying automatic captions...",
  "No captions found. Transcribing audio...",
  "Creating study document...",
  "Formatting DOCX...",
  "Preparing download..."
];

const detailLevels = [
  { value: "summary", title: "Summary", text: "500 to 1000 words, key points" },
  { value: "comprehensive", title: "Comprehensive", text: "1500 to 3000 words, in depth" },
  { value: "full_study_notes", title: "Full Study Notes", text: "Long structured notes for revision" }
];

const documentStyles = [
  { value: "study_guide", title: "Study Guide", text: "Best for students" },
  { value: "tutorial", title: "Tutorial", text: "Step by step explanations" },
  { value: "lecture_notes", title: "Lecture Notes", text: "Clean academic notes" },
  { value: "exam_revision", title: "Exam Revision", text: "Questions, answers, checklist, and key concepts" }
];

function isLikelyYoutubeUrl(value) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test((value || "").trim());
}

function OptionCard({ active, title, text, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${
        active ? "border-pilot-blue bg-pilot-soft shadow-soft" : "border-pilot-line bg-white hover:border-pilot-blue"
      }`}
    >
      <span className="block text-sm font-black text-pilot-ink">{title}</span>
      <span className="mt-1 block text-xs font-bold leading-5 text-pilot-muted">{text}</span>
    </button>
  );
}

export default function YouTubeDocxPage() {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [video, setVideo] = useState(null);
  const [detailLevel, setDetailLevel] = useState("comprehensive");
  const [documentStyle, setDocumentStyle] = useState("study_guide");
  const [keyFrames, setKeyFrames] = useState(5);
  const [customInstruction, setCustomInstruction] = useState("");
  const [manualTranscript, setManualTranscript] = useState("");
  const [showManualTranscript, setShowManualTranscript] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loadingIndex, setLoadingIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const activeLoadingMessage = useMemo(() => loadingSteps[Math.min(loadingIndex, loadingSteps.length - 1)], [loadingIndex]);

  useEffect(() => {
    if (!generating) return undefined;
    setLoadingIndex(0);
    const timer = window.setInterval(() => {
      setLoadingIndex((current) => Math.min(current + 1, loadingSteps.length - 1));
    }, 2200);
    return () => window.clearInterval(timer);
  }, [generating]);

  const analyze = async (event) => {
    event.preventDefault();
    const trimmed = youtubeUrl.trim();
    if (!isLikelyYoutubeUrl(trimmed)) {
      setError("Invalid YouTube link.");
      setVideo(null);
      return;
    }
    setError("");
    setResult(null);
    setAnalyzing(true);
    try {
      const response = await analyzeYoutubeVideo(trimmed);
      setVideo(response.data);
      setShowManualTranscript(false);
    } catch (requestError) {
      setVideo(null);
      setError(requestError.message || "Could not fetch video details.");
      if (requestError.payload?.manual_transcript_allowed || requestError.payload?.data?.manual_transcript_required) {
        setShowManualTranscript(true);
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const generate = async (useManualOnly = false) => {
    const trimmed = youtubeUrl.trim();
    if (!isLikelyYoutubeUrl(trimmed)) {
      setError("Invalid YouTube link.");
      return;
    }
    if (useManualOnly && manualTranscript.trim().length < 120) {
      setError("Paste a readable transcript before generating from pasted transcript.");
      return;
    }

    setError("");
    setResult(null);
    setGenerating(true);
    try {
      const response = await generateYoutubeDocx({
        youtube_url: trimmed,
        detail_level: detailLevel,
        document_style: documentStyle,
        key_frames: keyFrames,
        custom_instruction: customInstruction.trim(),
        manual_transcript: manualTranscript.trim()
      });
      setResult(response.data);
      setShowManualTranscript(false);
    } catch (requestError) {
      const manualRequired = Boolean(requestError.payload?.manual_transcript_allowed || requestError.payload?.data?.manual_transcript_required);
      const message = manualRequired
        ? "StudyPilot could not fetch this transcript automatically. Paste the transcript below and generate your DOCX."
        : requestError.message || "Could not generate DOCX.";
      setError(message);
      if (
        manualRequired ||
        message.toLowerCase().includes("transcript") ||
        message.toLowerCase().includes("captions")
      ) {
        setShowManualTranscript(true);
      }
    } finally {
      setGenerating(false);
    }
  };

  const download = async () => {
    if (!result?.download_url) return;
    setDownloading(true);
    setError("");
    try {
      await downloadYoutubeDocx(result.download_url);
    } catch (downloadError) {
      setError(downloadError.message || "Could not download DOCX.");
    } finally {
      setDownloading(false);
    }
  };

  const openVideo = () => {
    if (video?.youtube_url) window.open(video.youtube_url, "_blank", "noopener,noreferrer");
  };

  return (
    <div>
      <PageHeader title="YouTube to DOCX" subtitle="Turn any YouTube lecture into a structured downloadable study document." />

      <section className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-[2rem] border border-pilot-line bg-white p-6 text-center shadow-soft md:p-10">
          <div className="absolute inset-0 bg-[linear-gradient(#dbeafe_1px,transparent_1px),linear-gradient(90deg,#dbeafe_1px,transparent_1px)] bg-[size:34px_34px] opacity-40" />
          <div className="relative z-10 mx-auto max-w-3xl">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-red-100 bg-white text-[#FF0000] shadow-soft">
              <Youtube size={32} />
            </div>
            <h3 className="mt-5 text-3xl font-black tracking-tight text-pilot-ink md:text-4xl">Convert YouTube lectures into study-ready DOCX notes</h3>
            <p className="mt-3 text-sm leading-6 text-pilot-muted md:text-base">
              Paste a lecture link, preview the video, choose your document style, and StudyPilot will turn the transcript into a clean study document.
            </p>

            <form onSubmit={analyze} className="mt-7 flex flex-col gap-3 rounded-[1.5rem] border border-pilot-line bg-white/95 p-3 shadow-soft backdrop-blur md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <Input
                  aria-label="YouTube lecture link"
                  placeholder="Paste a YouTube lecture link..."
                  value={youtubeUrl}
                  onChange={(event) => setYoutubeUrl(event.target.value)}
                  disabled={analyzing || generating}
                  className="border-0 bg-transparent focus:ring-0"
                />
              </div>
              <Button type="submit" icon={analyzing ? Loader2 : PlayCircle} disabled={analyzing || generating} className="w-full shrink-0 md:w-auto">
                {analyzing ? "Analyzing..." : "Analyze Video"}
              </Button>
            </form>
          </div>
        </div>

        {error && (
          <div className="mt-6 flex gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {video && (
          <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <article className="overflow-hidden rounded-[2rem] border border-pilot-line bg-white shadow-soft">
              <div className="aspect-video bg-pilot-soft">
                {video.thumbnail ? (
                  <img src={video.thumbnail} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-pilot-blue">
                    <Youtube size={48} />
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-pilot-blue">
                  <CheckCircle size={16} />
                  {video.has_transcript ? "Transcript detected" : "Manual transcript may be needed"}
                </div>
                <h3 className="mt-3 text-xl font-black leading-7 text-pilot-ink">{video.title}</h3>
                <div className="mt-3 grid gap-2 text-sm font-bold text-pilot-muted">
                  <p>Channel: {video.channel}</p>
                  <p className="flex items-center gap-2"><Clock3 size={16} /> Duration: {video.duration}</p>
                  <p className="break-all text-xs">{video.youtube_url}</p>
                </div>
                <Button variant="secondary" icon={Youtube} onClick={openVideo} className="mt-5">
                  Watch on YouTube
                </Button>
              </div>
            </article>

            <div className="rounded-[2rem] border border-pilot-line bg-white p-6 shadow-soft">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-pilot-soft text-pilot-blue">
                  <ScrollText size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-pilot-ink">Document options</h3>
                  <p className="mt-1 text-sm leading-6 text-pilot-muted">Shape the study document before StudyPilot builds the DOCX.</p>
                </div>
              </div>

              <div className="mt-6">
                <p className="mb-3 text-sm font-black text-pilot-ink">Detail Level</p>
                <div className="grid gap-3 md:grid-cols-3">
                  {detailLevels.map((item) => (
                    <OptionCard key={item.value} active={detailLevel === item.value} title={item.title} text={item.text} onClick={() => setDetailLevel(item.value)} />
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <p className="mb-3 text-sm font-black text-pilot-ink">Document Style</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {documentStyles.map((item) => (
                    <OptionCard key={item.value} active={documentStyle === item.value} title={item.title} text={item.text} onClick={() => setDocumentStyle(item.value)} />
                  ))}
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-pilot-line bg-pilot-ice p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black text-pilot-ink">Key Frames</p>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-pilot-blue">{keyFrames}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="12"
                  value={keyFrames}
                  onChange={(event) => setKeyFrames(Number(event.target.value))}
                  className="mt-4 w-full accent-pilot-blue"
                />
                <p className="mt-2 text-xs font-bold text-pilot-muted">If key frames are unavailable, StudyPilot uses the thumbnail and timestamped section markers instead.</p>
              </div>

              <label className="mt-6 block">
                <span className="mb-2 block text-sm font-black text-pilot-ink">Custom Instruction</span>
                <textarea
                  placeholder="Example: Focus on definitions, examples, formulas, and exam questions."
                  maxLength={300}
                  value={customInstruction}
                  onChange={(event) => setCustomInstruction(event.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-xl border border-pilot-line bg-white px-4 py-3 text-sm leading-6 text-pilot-ink outline-none transition placeholder:text-pilot-muted/70 focus:border-pilot-blue focus:ring-4 focus:ring-pilot-blue/10"
                />
                <span className="mt-1 block text-right text-xs font-bold text-pilot-muted">{customInstruction.length}/300</span>
              </label>

              <div className="mt-6 rounded-2xl border border-pilot-line bg-pilot-ice p-4">
                <button
                  type="button"
                  onClick={() => setShowManualTranscript((current) => !current)}
                  className="flex w-full items-center justify-between text-left text-sm font-black text-pilot-ink transition hover:text-pilot-blue"
                >
                  <span>Transcript could not be fetched automatically? Paste transcript manually.</span>
                  <span className="text-xs text-pilot-blue">{showManualTranscript ? "Hide" : "Add transcript"}</span>
                </button>
                {showManualTranscript && (
                  <label className="mt-4 block">
                    <span className="mb-1 block text-sm font-semibold text-pilot-ink">Transcript could not be fetched automatically.</span>
                    <span className="mb-2 block text-xs font-bold text-pilot-muted">Paste the transcript below to continue.</span>
                    <textarea
                      placeholder="Paste YouTube transcript here..."
                      value={manualTranscript}
                      onChange={(event) => setManualTranscript(event.target.value)}
                      disabled={generating}
                      rows={8}
                      className="w-full resize-y rounded-xl border border-pilot-line bg-white px-4 py-3 text-sm leading-6 text-pilot-ink outline-none transition placeholder:text-pilot-muted/70 focus:border-pilot-blue focus:ring-4 focus:ring-pilot-blue/10"
                    />
                    <Button type="button" variant="secondary" icon={FileText} onClick={() => generate(true)} disabled={generating} className="mt-3">
                      Generate DOCX from Transcript
                    </Button>
                  </label>
                )}
              </div>

              <Button type="button" icon={Sparkles} onClick={() => generate(false)} disabled={generating} className="mt-6 w-full">
                {generating ? "Generating DOCX..." : "Generate DOCX"}
              </Button>
            </div>
          </div>
        )}

        {generating && (
          <div className="mt-6 rounded-2xl border border-blue-100 bg-pilot-soft p-5">
            <div className="flex items-center gap-3 text-sm font-black text-pilot-blue">
              <Loader2 className="animate-spin" size={18} />
              {activeLoadingMessage}
            </div>
            {loadingIndex >= 4 && !manualTranscript.trim() && (
              <p className="mt-3 text-xs font-bold leading-5 text-pilot-muted">
                This video has no readable captions, so StudyPilot is transcribing the audio. This may take a few minutes.
              </p>
            )}
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full bg-pilot-blue transition-all" style={{ width: `${((loadingIndex + 1) / loadingSteps.length) * 100}%` }} />
            </div>
          </div>
        )}

        {result && (
          <div className="mt-6 rounded-[2rem] border border-green-100 bg-green-50 p-6 shadow-soft">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <CheckCircle className="text-green-600" size={25} />
                <div>
                  <h4 className="text-lg font-black text-green-900">Your StudyPilot DOCX is ready.</h4>
                  <p className="mt-1 text-sm font-semibold text-green-700">{result.title}</p>
                  <p className="mt-1 text-xs font-bold text-green-700">
                    Estimated pages: {result.estimated_pages || 30} | Sections: {result.sections_count || 12}
                  </p>
                  {result.short_video_note && (
                    <p className="mt-2 text-xs font-bold text-green-700">
                      This video is short, so StudyPilot created the most complete study document possible without adding filler.
                    </p>
                  )}
                </div>
              </div>
              <Button icon={Download} onClick={download} disabled={downloading}>
                {downloading ? "Downloading..." : "Download DOCX"}
              </Button>
            </div>
          </div>
        )}

      </section>
    </div>
  );
}
