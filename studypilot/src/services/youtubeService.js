import { apiRequest } from "./api";
import { cleanExtractedText } from "@shared/text";
import { selectStudyContext } from "@shared/context";
import { parseTimedText } from "@shared/timedtext";
import { buildStudyDocx } from "../lib/studyDocx";

const GENERATION_TIMEOUT_MS = 180000;
const MAX_CONTEXT_CHARS = 20000;
const NO_CAPTIONS = "This video has no usable captions or transcript. Try a lecture-style video that has captions turned on.";

function friendlyError(error) {
  if (error?.name === "AbortError") {
    return "This video took too long to process. Try a shorter lecture video.";
  }
  if (error?.status === 401) {
    return "Your session expired. Please login again.";
  }
  if (error?.status === 400) {
    return error?.message || "StudyPilot could not read this video. Try a lecture video with captions.";
  }
  if (error?.status >= 500) {
    return "StudyPilot could not process this video right now. Please try again.";
  }
  if (error?.message === "Failed to fetch" || error instanceof TypeError) {
    return "Could not reach StudyPilot backend. Please check your connection.";
  }
  return error?.message || "Something went wrong. Please try again.";
}

function withTimeout(run) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  return run(controller.signal)
    .catch((error) => {
      throw new Error(friendlyError(error));
    })
    .finally(() => window.clearTimeout(timeout));
}

/**
 * Step one for every YouTube tool: the server fetches the caption file (the
 * browser is not allowed to), and the browser turns it into clean text here.
 * Parsing an hour of captions is too much CPU for the free Cloudflare plan's
 * per-request budget, so it happens on the student's device instead.
 */
async function prepareTranscript(youtubeUrl, signal) {
  const response = await apiRequest("/youtube/transcript/", {
    method: "POST",
    body: JSON.stringify({ youtube_url: youtubeUrl }),
    signal
  });
  const data = response?.data || {};
  const transcript = data.format === "timedtext" ? parseTimedText(data.body || "") : cleanExtractedText(data.body || "");
  if (transcript.length < 60) {
    const error = new Error(NO_CAPTIONS);
    error.status = 400;
    throw error;
  }
  return {
    transcript,
    title: data.title,
    channel: data.channel,
    video_id: data.video_id,
    source: data.source
  };
}

/** The two study contexts the generators use, picked with the server's own code. */
function withContexts(prepared) {
  const { transcript, ...meta } = prepared;
  return {
    ...meta,
    context: selectStudyContext(transcript, MAX_CONTEXT_CHARS),
    retry_context: selectStudyContext(transcript, MAX_CONTEXT_CHARS, 10)
  };
}

function generate(path, payload) {
  return withTimeout(async (signal) => {
    const prepared = withContexts(await prepareTranscript(payload.youtube_url, signal));
    return apiRequest(path, { method: "POST", body: JSON.stringify({ ...payload, prepared }), signal });
  });
}

export function generateYoutubeFlashcards(payload) {
  return generate("/youtube/flashcards/", payload);
}

export function generateYoutubeMCQs(payload) {
  return generate("/youtube/mcq/", payload);
}

export function generateYoutubeQuiz(payload) {
  return generate("/youtube/quiz/", payload);
}

/**
 * The server structures the lecture into study content; the Word file is
 * assembled here from that content and downloaded directly.
 */
export function downloadYoutubeDocx(payload) {
  return withTimeout(async (signal) => {
    const prepared = await prepareTranscript(payload.youtube_url, signal);
    const response = await apiRequest("/youtube/docx/", {
      method: "POST",
      body: JSON.stringify({ ...payload, prepared }),
      signal
    });
    const { content, metadata, source, filename } = response?.data || {};
    const blob = await buildStudyDocx(content, metadata, source);

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "studypilot-notes.docx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return { filename: link.download };
  });
}
