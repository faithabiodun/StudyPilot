// Port of apps/youtube_docx/views.py.
//
// The DOCX endpoint now returns the structured study content as JSON and the
// browser assembles the Word file. Building it here would blow the free plan's
// CPU budget; building it client-side costs nothing and produces the same file.

import { Hono } from "hono";
import { Validator, countChoice, difficultyChoice, failure, readJson, str, success } from "../http";
import { requireUser, type AppEnv } from "../auth/users";
import { generateDocxContent, generateFlashcards, generateMcqs, generateMixedQuiz } from "../lib/ai";
import { deduplicateFlashcards, deduplicateQuestions } from "../lib/dedup";
import { cleanExtractedText, cleanSafeString } from "../lib/text";
import { rememberMaterial } from "../memory/services";
import { recordActivity } from "../services/activity";
import { aiFailure, generateWithRetry, textContexts } from "../services/generation";
import { intVar } from "../env";
import { TranscriptError, extractVideoId, fetchCaptions, getTranscriptAndMetadata, type VideoMetadata } from "../services/transcript";
import { QUESTION_TYPES } from "./quizzes";

function youtubeUrl(v: Validator, value: unknown): string {
  const url = str(value).trim();
  if (value === undefined) v.add("youtube_url", "This field is required.");
  else if (!url) v.add("youtube_url", "Paste a YouTube link.");
  else if (url.length > 500) v.add("youtube_url", "Ensure this field has no more than 500 characters.");
  else if (!url.toLowerCase().includes("youtu") && url.length !== 11) v.add("youtube_url", "Enter a valid YouTube video link.");
  return url;
}

function choice(v: Validator, field: string, value: unknown, options: string[], fallback: string): string {
  if (value === undefined) return fallback;
  const text = str(value);
  if (!options.includes(text)) v.add(field, `"${text}" is not a valid choice.`);
  return text;
}

async function remember(c: { env: AppEnv["Bindings"] }, userId: number, metadata: VideoMetadata, extra: string) {
  await rememberMaterial(c.env, userId, {
    sourceType: "youtube",
    title: metadata.title || "a YouTube video",
    summary: extra,
    reference: metadata.video_id ? `https://www.youtube.com/watch?v=${metadata.video_id}` : "",
  });
}

function transcriptFailure(error: unknown): Response {
  if (error instanceof TranscriptError) return failure(error.message, {}, 400);
  console.warn(`Unexpected transcript failure: ${error}`);
  return failure("StudyPilot could not read this video right now. Please try again.", {}, 502);
}

interface Prepared {
  metadata: VideoMetadata;
  source: string;
  transcript?: string;
  context?: string;
  retryContext?: string;
}

/**
 * The browser normally fetches the captions through /youtube/transcript/,
 * parses them and picks the study context itself, then sends the result as
 * `prepared`, which keeps this request inside the free plan's CPU budget.
 * Without it, the Worker does the whole job itself as the Django view did.
 */
function preparedFrom(body: Record<string, unknown>, url: string, maxChars: number): Prepared | null {
  const prepared = body.prepared as Record<string, unknown> | undefined;
  if (!prepared || typeof prepared !== "object") return null;
  const transcript = str(prepared.transcript).replace(/\x00/g, "");
  const context = str(prepared.context).replace(/\x00/g, "").slice(0, maxChars);
  if (!transcript && !context) return null;
  return {
    metadata: {
      title: cleanSafeString(prepared.title, "YouTube Lecture", 300),
      channel: cleanSafeString(prepared.channel, "", 300),
      description: "",
      video_id: extractVideoId(str(prepared.video_id)) || extractVideoId(url),
    },
    source: cleanSafeString(prepared.source, "captions", 40),
    transcript: transcript || undefined,
    context: context || undefined,
    retryContext: str(prepared.retry_context).replace(/\x00/g, "").slice(0, maxChars) || undefined,
  };
}

async function resolveContexts(c: { env: AppEnv["Bindings"] }, body: Record<string, unknown>, url: string) {
  const maxChars = intVar(c.env.MAX_DEEPSEEK_CONTEXT_CHARS, 20000);
  const prepared = preparedFrom(body, url, maxChars);
  if (prepared?.context) {
    const first = prepared.context;
    const retry = prepared.retryContext || first;
    return { metadata: prepared.metadata, source: prepared.source, contexts: { first: () => first, retry: () => retry } };
  }
  const { transcript, metadata, source } = await getTranscriptAndMetadata(c.env, url);
  return { metadata, source, contexts: textContexts(c.env, transcript) };
}

/** safe_filename from docx_builder.py. */
function safeFilename(title: string): string {
  const base = cleanExtractedText(title).trim() || "studypilot-notes";
  const kept = Array.from(base).filter((ch) => /[\p{L}\p{N} _-]/u.test(ch)).join("").trim();
  return `${kept.replace(/ /g, "-").toLowerCase().slice(0, 60) || "studypilot-notes"}.docx`;
}

const youtube = new Hono<AppEnv>({ strict: false });
youtube.use("*", requireUser);

/**
 * Step one of the browser-side flow: the caption file, unparsed, plus the
 * video's metadata. YouTube does not allow the browser to fetch these itself.
 */
youtube.post("/transcript", async (c) => {
  const body = await readJson(c.req.raw);
  const v = new Validator();
  const url = youtubeUrl(v, body.youtube_url);
  if (!v.ok) return failure("YouTube transcript failed", v.errors);
  try {
    const captions = await fetchCaptions(c.env, url);
    return success("Transcript fetched", {
      video_id: captions.metadata.video_id,
      title: captions.metadata.title,
      channel: captions.metadata.channel,
      source: captions.source,
      format: captions.format,
      body: captions.body,
    });
  } catch (error) {
    return transcriptFailure(error);
  }
});

youtube.post("/docx", async (c) => {
  const user = c.get("user");
  const body = await readJson(c.req.raw);
  const v = new Validator();
  const url = youtubeUrl(v, body.youtube_url);
  difficultyChoice(v, body.difficulty);
  const detail = choice(v, "detail_level", body.detail_level, ["concise", "comprehensive", "detailed"], "comprehensive");
  const style = choice(v, "document_style", body.document_style, ["study_guide", "lecture_notes", "summary"], "study_guide");
  const custom = str(body.custom_instruction);
  if (custom.length > 500) v.add("custom_instruction", "Ensure this field has no more than 500 characters.");
  if (!v.ok) return failure("YouTube to DOCX failed", v.errors);

  let transcript: string;
  let metadata: VideoMetadata;
  let source: string;
  let alreadyClean = false;
  const prepared = preparedFrom(body, url, 200000);
  try {
    if (prepared?.transcript) {
      ({ transcript, metadata, source } = { transcript: prepared.transcript, metadata: prepared.metadata, source: prepared.source });
      alreadyClean = true;
    } else {
      ({ transcript, metadata, source } = await getTranscriptAndMetadata(c.env, url));
    }
  } catch (error) {
    return transcriptFailure(error);
  }

  let content: Record<string, unknown>;
  try {
    content = await generateDocxContent(
      c.env,
      transcript,
      metadata,
      { detail_level: detail, document_style: style, custom_instruction: custom },
      alreadyClean,
    );
  } catch (error) {
    return aiFailure(error, "StudyPilot could not structure this lecture. Please try again.");
  }

  await recordActivity(c.env, c.get("sql"), user.id, "youtube_docx_generated", "YouTube to DOCX",
    `You generated a study document from ${metadata.title || "a YouTube video"}.`, { video_id: metadata.video_id, source });
  await remember(c, user.id, metadata, str(content.summary));
  return success("Study document generated", {
    content,
    metadata: { title: metadata.title, channel: metadata.channel, video_id: metadata.video_id },
    source,
    filename: safeFilename(str(content.title) || metadata.title),
  });
});

youtube.post("/flashcards", async (c) => {
  const user = c.get("user");
  const body = await readJson(c.req.raw);
  const v = new Validator();
  const url = youtubeUrl(v, body.youtube_url);
  const difficulty = difficultyChoice(v, body.difficulty);
  const requested = countChoice(v, "number_of_cards", body.number_of_cards);
  if (!v.ok) return failure("YouTube flashcards failed", v.errors);

  let resolved;
  try {
    resolved = await resolveContexts(c, body, url);
  } catch (error) {
    return transcriptFailure(error);
  }
  const { metadata, source, contexts } = resolved;

  let cards;
  try {
    cards = await generateWithRetry(
      contexts,
      requested,
      (context) => generateFlashcards(c.env, context, difficulty, requested),
      (items, limit) => deduplicateFlashcards(items, limit),
      "flashcards",
    );
  } catch (error) {
    return aiFailure(error, "Flashcard generation failed.");
  }
  const clean = cards
    .map((card) => ({ question: cleanExtractedText(card.question), answer: cleanExtractedText(card.answer) }))
    .filter((card) => card.question && card.answer);
  if (!clean.length) return failure("StudyPilot could not build flashcards from this video. Try a more detailed lecture.", {}, 400);

  await recordActivity(c.env, c.get("sql"), user.id, "youtube_flashcards_generated", "YouTube Flashcards",
    `You generated ${clean.length} flashcards from ${metadata.title || "a YouTube video"}.`, { video_id: metadata.video_id, count: clean.length });
  await remember(c, user.id, metadata, `${clean.length} flashcards generated`);
  return success(
    "Flashcards generated successfully",
    { title: `${metadata.title || "YouTube"} Flashcards`, source_title: metadata.title, channel: metadata.channel, transcript_source: source, cards: clean },
    201,
  );
});

youtube.post("/mcq", async (c) => {
  const user = c.get("user");
  const body = await readJson(c.req.raw);
  const v = new Validator();
  const url = youtubeUrl(v, body.youtube_url);
  const difficulty = difficultyChoice(v, body.difficulty);
  const requested = countChoice(v, "number_of_questions", body.number_of_questions);
  if (!v.ok) return failure("YouTube MCQ failed", v.errors);

  let resolved;
  try {
    resolved = await resolveContexts(c, body, url);
  } catch (error) {
    return transcriptFailure(error);
  }
  const { metadata, source, contexts } = resolved;

  let questions;
  try {
    questions = await generateWithRetry(
      contexts,
      requested,
      (context) => generateMcqs(c.env, context, difficulty, requested),
      (items, limit) => deduplicateQuestions(items, limit, true),
      "mcqs",
    );
  } catch (error) {
    return aiFailure(error, "MCQ generation failed.");
  }
  if (!questions.length) return failure("StudyPilot could not build MCQs from this video. Try a more detailed lecture.", {}, 400);

  await recordActivity(c.env, c.get("sql"), user.id, "youtube_mcq_generated", "YouTube MCQ Quiz",
    `You generated ${questions.length} MCQs from ${metadata.title || "a YouTube video"}.`, { video_id: metadata.video_id, count: questions.length });
  await remember(c, user.id, metadata, `${questions.length} MCQs generated`);
  return success(
    "MCQ quiz generated successfully",
    { title: `${metadata.title || "YouTube"} MCQ Quiz`, source_title: metadata.title, channel: metadata.channel, transcript_source: source, questions },
    201,
  );
});

youtube.post("/quiz", async (c) => {
  const user = c.get("user");
  const body = await readJson(c.req.raw);
  const v = new Validator();
  const url = youtubeUrl(v, body.youtube_url);
  const difficulty = difficultyChoice(v, body.difficulty);
  const requested = countChoice(v, "number_of_questions", body.number_of_questions);
  let questionTypes = ["multiple_choice"];
  if (body.question_types !== undefined) {
    questionTypes = Array.isArray(body.question_types)
      ? (body.question_types.filter((t) => typeof t === "string" && QUESTION_TYPES.includes(t)) as string[])
      : [];
    if (!questionTypes.length) v.add("question_types", "Choose at least one supported question type.");
  }
  if (!v.ok) return failure("YouTube quiz failed", v.errors);

  let resolved;
  try {
    resolved = await resolveContexts(c, body, url);
  } catch (error) {
    return transcriptFailure(error);
  }
  const { metadata, source, contexts } = resolved;

  let questions;
  try {
    questions = await generateWithRetry(
      contexts,
      requested,
      (context) => generateMixedQuiz(c.env, context, difficulty, requested, questionTypes),
      (items, limit) => deduplicateQuestions(items, limit),
      "questions",
    );
  } catch (error) {
    return aiFailure(error, "Quiz generation failed.");
  }
  if (!questions.length) return failure("StudyPilot could not build a quiz from this video. Try a more detailed lecture.", {}, 400);

  await recordActivity(c.env, c.get("sql"), user.id, "youtube_quiz_generated", "YouTube Mixed Quiz",
    `You generated ${questions.length} quiz questions from ${metadata.title || "a YouTube video"}.`, { video_id: metadata.video_id, count: questions.length });
  await remember(c, user.id, metadata, `${questions.length} mixed questions generated`);
  return success(
    "Mixed quiz generated successfully",
    { title: `${metadata.title || "YouTube"} Mixed Quiz`, source_title: metadata.title, channel: metadata.channel, transcript_source: source, questions },
    201,
  );
});

export default youtube;
