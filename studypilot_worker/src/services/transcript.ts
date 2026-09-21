// YouTube transcripts with fallbacks. Port of apps/youtube_docx/transcript.py.
//
// Sources, in order:
//   1. YouTube's InnerTube player API (the approach youtube-transcript-api uses)
//   2. Caption tracks embedded in the watch page
//   3. The public timed-text endpoint
//   4. The video description from the Data API, so there is still something
//      grounded to work with
//
// The Worker fetches the caption file and hands it to the browser unparsed:
// parsing and cleaning an hour of captions costs more CPU than the free plan
// allows per request. `getTranscriptAndMetadata` still parses server-side for
// callers that do not prepare the transcript themselves.

import type { Env } from "../env";
import { cleanExtractedText } from "../lib/text";
import { looksLikeCaptions, parseTimedText } from "../lib/timedtext";

const TIMEOUT_MS = 12000;
const LANGUAGES = ["en", "en-US", "en-GB", "en-IN", "en-CA", "en-AU"];
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  // Skips the EU consent interstitial, which would otherwise replace the page.
  Cookie: "CONSENT=YES+1",
};

export class TranscriptError extends Error {}

export interface VideoMetadata {
  title: string;
  channel: string;
  description: string;
  video_id: string;
}

export interface Captions {
  metadata: VideoMetadata;
  source: string;
  /** "timedtext" is an unparsed caption file; "text" is already plain text. */
  format: "timedtext" | "text";
  body: string;
}

const ID = /^[A-Za-z0-9_-]{11}$/;

/** Accept a full URL, a share URL, or a bare 11-character id. */
export function extractVideoId(input: string): string {
  const value = (input || "").trim();
  if (!value) return "";
  if (ID.test(value)) return value;
  if (!value.includes("youtu")) return "";
  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    return "";
  }
  const host = url.hostname.toLowerCase();
  if (host.endsWith("youtu.be")) {
    const candidate = url.pathname.replace(/^\/+/, "").split("/")[0];
    return ID.test(candidate) ? candidate : "";
  }
  if (host.includes("youtube")) {
    const fromQuery = url.searchParams.get("v") || "";
    if (ID.test(fromQuery)) return fromQuery;
    const match = /\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/.exec(url.pathname);
    if (match) return match[1];
  }
  return "";
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  isTranslatable?: boolean;
}

/** Manual English, then auto-generated English, then translated, then anything. */
function orderTracks(tracks: CaptionTrack[]): string[] {
  const english = (t: CaptionTrack) => LANGUAGES.includes(t.languageCode);
  const manual = tracks.filter((t) => english(t) && t.kind !== "asr");
  const auto = tracks.filter((t) => english(t) && t.kind === "asr");
  const ordered = [...manual, ...auto].map((t) => t.baseUrl);
  if (!ordered.length) {
    const translatable = tracks.find((t) => t.isTranslatable);
    if (translatable) ordered.push(`${translatable.baseUrl}&tlang=en`);
    ordered.push(...tracks.map((t) => t.baseUrl));
  }
  // srv3 carries word timings we do not need; the default format is plainer.
  return ordered.map((url) => url.replace("&fmt=srv3", ""));
}

async function firstCaptionFile(urls: string[]): Promise<string> {
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) continue;
      const body = await response.text();
      if (looksLikeCaptions(body)) return body;
    } catch {
      continue;
    }
  }
  return "";
}

async function fromInnertube(videoId: string): Promise<string> {
  try {
    const response = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { ...BROWSER_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } }, videoId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return "";
    const data = (await response.json()) as any;
    if (data?.playabilityStatus?.status === "ERROR") throw new TranscriptError("This video is unavailable, private, or removed.");
    const tracks: CaptionTrack[] = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    return tracks.length ? firstCaptionFile(orderTracks(tracks)) : "";
  } catch (error) {
    if (error instanceof TranscriptError) throw error;
    console.info(`innertube captions failed for ${videoId}: ${error}`);
    return "";
  }
}

async function fromWatchPage(videoId: string): Promise<string> {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return "";
    const html = await response.text();
    const marker = html.indexOf('"captionTracks":');
    if (marker < 0) return "";
    const start = html.indexOf("[", marker);
    // Walk to the matching bracket; the array holds nested objects.
    let depth = 0;
    let end = start;
    for (; end < html.length; end++) {
      if (html[end] === "[") depth++;
      else if (html[end] === "]" && --depth === 0) break;
    }
    return firstCaptionFile(orderTracks(JSON.parse(html.slice(start, end + 1))));
  } catch (error) {
    console.info(`watch page captions failed for ${videoId}: ${error}`);
    return "";
  }
}

function timedTextUrls(videoId: string): string[] {
  const attempts: Record<string, string>[] = [
    { v: videoId, lang: "en" },
    { v: videoId, lang: "en", kind: "asr" },
    { v: videoId, lang: "en-US", kind: "asr" },
  ];
  return attempts.map((params) => `https://www.youtube.com/api/timedtext?${new URLSearchParams(params)}`);
}

export async function fetchVideoMetadata(env: Env, videoId: string): Promise<VideoMetadata> {
  const metadata: VideoMetadata = { title: "", channel: "", description: "", video_id: videoId };
  const key = (env.YOUTUBE_API_KEY || "").trim();
  if (!key || key.toLowerCase().startsWith("your_")) return metadata;
  try {
    const params = new URLSearchParams({ part: "snippet", id: videoId, key });
    const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return metadata;
    const snippet = ((await response.json()) as any)?.items?.[0]?.snippet;
    if (snippet) {
      // Short fields, so cleaning them here costs nothing.
      metadata.title = cleanExtractedText(snippet.title ?? "");
      metadata.channel = cleanExtractedText(snippet.channelTitle ?? "");
      metadata.description = String(snippet.description ?? "");
    }
  } catch (error) {
    console.info(`metadata fetch failed for ${videoId}: ${error}`);
  }
  return metadata;
}

/** The caption file (or description fallback) for a video, unparsed. */
export async function fetchCaptions(env: Env, urlOrId: string): Promise<Captions> {
  const videoId = extractVideoId(urlOrId);
  if (!videoId) throw new TranscriptError("That does not look like a valid YouTube link. Paste a full video URL.");

  const [metadata, innertube] = await Promise.all([fetchVideoMetadata(env, videoId), fromInnertube(videoId)]);
  if (!metadata.title) metadata.title = "YouTube Lecture";
  let body = innertube || (await fromWatchPage(videoId));
  if (body) return { metadata, source: "captions", format: "timedtext", body };
  body = await firstCaptionFile(timedTextUrls(videoId));
  if (body) return { metadata, source: "auto-captions", format: "timedtext", body };
  // Last resort: the description, so the student still gets something.
  if (metadata.description.trim().length >= 200) {
    return { metadata, source: "description", format: "text", body: metadata.description };
  }
  throw new TranscriptError("This video has no usable captions or transcript. Try a lecture-style video that has captions turned on.");
}

/** Server-side parse, for callers that did not prepare the transcript in the browser. */
export async function getTranscriptAndMetadata(env: Env, urlOrId: string) {
  const captions = await fetchCaptions(env, urlOrId);
  const transcript = captions.format === "timedtext" ? parseTimedText(captions.body) : cleanExtractedText(captions.body);
  if (transcript.length < 60) {
    throw new TranscriptError("This video has no usable captions or transcript. Try a lecture-style video that has captions turned on.");
  }
  return { transcript, metadata: captions.metadata, source: captions.source };
}
