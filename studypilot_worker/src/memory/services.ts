// Walrus Memory integration. A port of apps/memory/services.py.
//
// Memory is strictly optional. If the relayer is slow, down, or unconfigured,
// quiz submission still returns a score: every exported function here swallows
// its own failures and logs them. Nothing in this module may throw into a
// request.
//
// Counts are never stored. Writers append records and readers count what comes
// back, because the underlying API is append-only with no update or delete.

import { MemWal } from "@mysten-incubation/memwal";
import type { Env } from "../env";
import {
  SEVERITY_WEIGHTS,
  buildHit,
  buildMaterial,
  buildMiss,
  buildProgress,
  buildSession,
  checkpointAt,
  daysBetween,
  labelOf,
  minutesOf,
  misconceptionOf,
  parse,
  payloadOf,
  slugifyTopic,
  sourceOf,
  statusOf,
  today,
  type ParsedRecord,
} from "./records";

const BULK_CHUNK = 20; // remember_bulk accepts 1-20 items
const RECALL_LIMIT = 50; // the API default of 10 would make a "top 5" a top-5-of-10
// recall returns its top-k regardless of relevance, so an unrelated question
// still gets k records back. Measured on a live namespace: on-topic hits land at
// 0.35-0.64 cosine distance, unrelated ones at 0.84 and above. 0.70 sits in the
// gap with margin either side. See MystenLabs/MemWal#741.
export const MAX_RECALL_DISTANCE = 0.7;
const RECENCY_HALF_LIFE_DAYS = 30;
const TOP_TOPICS = 5;

// Record kind -> bucket. Explicit because deriving the plural from the kind
// once produced "mastereds" and lost every mastery record.
const BUCKETS: Record<string, "misses" | "hits" | "mastered"> = { MISS: "misses", HIT: "hits", MASTERED: "mastered" };

export function memwalEnabled(env: Env): boolean {
  return env.MEMWAL_ENABLED === "true" && Boolean(env.MEMWAL_ACCOUNT_ID) && Boolean(env.MEMWAL_PRIVATE_KEY);
}

// One client per isolate. Every call passes its namespace explicitly, and
// keeping the client alive lets the SDK reuse its SEAL session key (5 minute
// TTL) and relayer compatibility check across requests instead of rebuilding
// both, with their Sui RPC round trips, on every request.
let cached: { key: string; client: MemWal } | null = null;

function client(env: Env): MemWal {
  const key = `${env.MEMWAL_ACCOUNT_ID}:${env.MEMWAL_PRIVATE_KEY}`;
  if (!cached || cached.key !== key) {
    cached = { key, client: MemWal.create({ key: env.MEMWAL_PRIVATE_KEY!, accountId: env.MEMWAL_ACCOUNT_ID }) };
  }
  return cached.client;
}

function warn(what: string, userId: number, error: unknown) {
  console.warn(`Walrus ${what} failed for user=${userId}: ${errorText(error)}`);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Per-student, per-course namespace. Security-critical: under a server-owned
 * account the namespace string is the only thing separating one student's
 * mistakes from another's, so it must stay pure and user-id prefixed.
 */
export function namespaceFor(userId: number, courseTitle: string): string {
  return `sp-u${userId}-${slugifyTopic(courseTitle) || "general"}`;
}

export const studyNamespaceFor = (userId: number) => `sp-u${userId}-studied`;
export const progressNamespaceFor = (userId: number) => `sp-u${userId}-progress`;

/**
 * Returns [texts, truncated]. Truncated means recall came back full, so the
 * caller is ranking over a sample rather than everything stored.
 *
 * maxDistance is only passed when relevance is the point (the advisor).
 * Counting passes omit it: they want every record, and filtering by relevance
 * to a generic query would undercount misses and drop study days.
 */
async function recallTexts(
  env: Env,
  namespace: string,
  query: string,
  limit = RECALL_LIMIT,
  maxDistance?: number,
): Promise<[string[], boolean]> {
  const result = await client(env).recall({
    query,
    limit,
    namespace,
    ...(maxDistance !== undefined ? { maxDistance } : {}),
  });
  const texts = (result?.results ?? []).map((item) => item.text);
  return [texts, texts.length >= limit];
}

async function rememberAll(env: Env, namespace: string, texts: string[]): Promise<number> {
  let written = 0;
  for (let start = 0; start < texts.length; start += BULK_CHUNK) {
    const chunk = texts.slice(start, start + BULK_CHUNK);
    await client(env).rememberBulkAsync(chunk.map((text) => ({ text, namespace })));
    written += chunk.length;
  }
  return written;
}

/**
 * Slugs with at least one MISS, so we know which correct answers are HITs.
 * Without this, HITs are never written and every failed topic stays weak forever.
 */
async function previouslyMissed(env: Env, namespace: string): Promise<Set<string>> {
  const [texts] = await recallTexts(env, namespace, "past mistakes and misconceptions");
  const missed = new Set<string>();
  for (const text of texts) {
    const record = parse(text);
    if (record && record.kind === "MISS" && record.topic) missed.add(record.topic);
  }
  return missed;
}

export interface AttemptDetail {
  subtopic?: string;
  question?: string;
  selected_answer?: string;
  correct_answer?: string;
  is_correct?: boolean;
}

/** A MISS per wrong answer, a HIT per correct answer on an already-missed topic. Never throws. */
export async function recordQuizAttempt(env: Env, userId: number, courseTitle: string, details: AttemptDetail[], date?: string) {
  const summary = { enabled: false, written: 0, misses: 0, hits: 0, error: "" };
  if (!memwalEnabled(env)) return summary;
  summary.enabled = true;
  try {
    const namespace = namespaceFor(userId, courseTitle);
    const missedBefore = await previouslyMissed(env, namespace);
    const when = date || today();
    const texts: string[] = [];
    for (const detail of details) {
      const topic = slugifyTopic(detail.subtopic || "");
      // No subtopic means nothing to group by; storing it would only add noise.
      if (!topic) continue;
      if (detail.is_correct) {
        if (missedBefore.has(topic)) {
          texts.push(buildHit(namespace, topic, when));
          summary.hits += 1;
        }
        continue;
      }
      const selected = detail.selected_answer || "";
      texts.push(
        buildMiss(
          namespace,
          topic,
          detail.question || "",
          selected || "(no answer)",
          `answered ${selected || "nothing"} instead of ${detail.correct_answer || ""}`,
          detail.correct_answer || "",
          "medium",
          when,
        ),
      );
      summary.misses += 1;
    }
    summary.written = await rememberAll(env, namespace, texts);
  } catch (error) {
    summary.error = errorText(error);
    warn("memory write", userId, error);
  }
  return summary;
}

/** Checkpoint an unfinished quiz, deck, or generation. Never throws. */
export async function saveProgress(env: Env, userId: number, key: string, label: string, payload: unknown, status = "active") {
  if (!memwalEnabled(env)) return { enabled: false, written: 0, error: "" };
  try {
    const namespace = progressNamespaceFor(userId);
    await rememberAll(env, namespace, [buildProgress(namespace, key, label, payload, status)]);
    return { enabled: true, written: 1, error: "" };
  } catch (error) {
    warn("progress write", userId, error);
    return { enabled: true, written: 0, error: errorText(error) };
  }
}

/**
 * Work left unfinished, newest checkpoint per activity. Deliberately unfiltered
 * by distance: this answers "what was I doing", so every checkpoint must be seen.
 */
export async function resumePoints(env: Env, userId: number, limit = RECALL_LIMIT) {
  if (!memwalEnabled(env)) return { enabled: false, items: [], error: "" };
  try {
    const namespace = progressNamespaceFor(userId);
    const [texts] = await recallTexts(env, namespace, "unfinished quiz flashcards in progress", limit);
    const newest = new Map<string, { at: string; text: string; on: string }>();
    for (const text of texts) {
      const record = parse(text);
      if (!record || record.kind !== "PROGRESS" || !record.topic) continue;
      const stamp = checkpointAt(text);
      const current = newest.get(record.topic);
      // On an exact tie "done" wins: offering to resume finished work is worse
      // than missing a resume point.
      const newer = !current || stamp > current.at || (stamp === current.at && statusOf(text) === "done");
      if (newer) newest.set(record.topic, { at: stamp, text, on: record.on });
    }
    const items = [];
    for (const [key, entry] of newest) {
      // A finished activity leaves its "done" record newest, which is how
      // completion is expressed without a delete.
      if (statusOf(entry.text) !== "active") continue;
      items.push({ key, label: labelOf(entry.text), saved_at: entry.at, date: entry.on, payload: payloadOf(entry.text) });
    }
    items.sort((a, b) => (a.saved_at < b.saved_at ? 1 : a.saved_at > b.saved_at ? -1 : 0));
    return { enabled: true, items, error: "" };
  } catch (error) {
    warn("resume lookup", userId, error);
    return { enabled: true, items: [], error: errorText(error) };
  }
}

/** Record that a student studied something. Never throws. */
export async function rememberMaterial(
  env: Env,
  userId: number,
  opts: { sourceType: string; title: string; topic?: string; summary?: string; reference?: string },
) {
  if (!memwalEnabled(env)) return { enabled: false, written: 0, error: "" };
  try {
    const namespace = studyNamespaceFor(userId);
    const text = buildMaterial(
      namespace,
      opts.topic || opts.title,
      opts.sourceType,
      opts.title,
      opts.summary || "",
      opts.reference || "",
    );
    await rememberAll(env, namespace, [text]);
    return { enabled: true, written: 1, error: "" };
  } catch (error) {
    warn("material write", userId, error);
    return { enabled: true, written: 0, error: errorText(error) };
  }
}

/**
 * Roll a finished study day into one SESSION record. Written once per day,
 * after it is over, because writing on every heartbeat would append hundreds of
 * near-identical records to an append-only store.
 */
export async function rememberSession(env: Env, userId: number, date: string, minutes: number) {
  if (!memwalEnabled(env)) return { enabled: false, written: 0, error: "" };
  try {
    const namespace = studyNamespaceFor(userId);
    await rememberAll(env, namespace, [buildSession(namespace, [], 0, 0, 0, minutes, date)]);
    return { enabled: true, written: 1, error: "" };
  } catch (error) {
    warn("session write", userId, error);
    return { enabled: true, written: 0, error: errorText(error) };
  }
}

/** Days studied, recalled from Walrus rather than the local database. */
export async function studyHistory(env: Env, userId: number, limit = RECALL_LIMIT) {
  if (!memwalEnabled(env)) return { enabled: false, days: [], total_minutes: 0, error: "" };
  try {
    const namespace = studyNamespaceFor(userId);
    const [texts] = await recallTexts(env, namespace, "study session minutes", limit);
    const days: { date: string; minutes: number }[] = [];
    for (const text of texts) {
      const record = parse(text);
      if (!record || record.kind !== "SESSION") continue;
      days.push({ date: record.on, minutes: minutesOf(record.text) });
    }
    days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return { enabled: true, days, total_minutes: days.reduce((sum, day) => sum + day.minutes, 0), error: "" };
  } catch (error) {
    warn("study history", userId, error);
    return { enabled: true, days: [], total_minutes: 0, error: errorText(error) };
  }
}

/** What this student has studied that relates to the question. Never throws. */
export async function materialContext(env: Env, userId: number, query: string, limit = RECALL_LIMIT, maxLines = 6) {
  if (!memwalEnabled(env)) return "";
  try {
    const namespace = studyNamespaceFor(userId);
    const [texts] = await recallTexts(env, namespace, query, limit, MAX_RECALL_DISTANCE);
    const lines: string[] = [];
    for (const text of texts) {
      const record = parse(text);
      if (!record || record.kind !== "MATERIAL") continue;
      let title = "";
      let covers = "";
      for (const line of record.text.split(/\r?\n/)) {
        if (line.startsWith("Studied: ")) title = line.slice(9).trim();
        else if (line.startsWith("Covers: ")) covers = line.slice(8).trim();
      }
      if (!title) continue;
      const label = sourceOf(record.text) || "material";
      lines.push(`- ${label} on ${record.on}: ${title}` + (covers ? ` — ${covers}` : ""));
    }
    return lines.slice(0, maxLines).join("\n");
  } catch (error) {
    warn("material recall", userId, error);
    return "";
  }
}

/** Past misconceptions relevant to what the student just asked. Returns "" on failure. */
export async function misconceptionContext(
  env: Env,
  userId: number,
  query: string,
  courseTitles: unknown[],
  perNamespaceLimit = 10,
  maxCourses = 4,
  maxLines = 6,
) {
  if (!memwalEnabled(env)) return "";
  const lines: string[] = [];
  try {
    for (const course of (courseTitles || []).slice(0, maxCourses)) {
      const namespace = namespaceFor(userId, courseLabel(course));
      const [texts] = await recallTexts(env, namespace, query, perNamespaceLimit, MAX_RECALL_DISTANCE);
      const byTopic = new Map<string, ParsedRecord[]>();
      for (const text of texts) {
        const record = parse(text);
        if (record && record.kind === "MISS" && record.topic) {
          byTopic.set(record.topic, [...(byTopic.get(record.topic) ?? []), record]);
        }
      }
      for (const [topic, records] of byTopic) {
        const latest = records.reduce((a, b) => (b.on > a.on ? b : a));
        const belief = misconceptionOf(latest.text);
        lines.push(
          `- ${topic}: missed ${records.length} time(s), most recently ${latest.on}.` +
            (belief ? ` Their stored misconception: ${belief}.` : ""),
        );
      }
    }
  } catch (error) {
    warn("advisor recall", userId, error);
    return "";
  }
  return lines.slice(0, maxLines).join("\n");
}

/**
 * current_courses entries are {"code", "title"} objects. The Django version
 * slugified the whole dict's repr, which produced namespaces like
 * "sp-u17-code-csc301-title-compiler-construction" that nothing ever writes
 * to, because quizzes are namespaced by the course *title*. Reading by title is
 * what lets the advisor actually find past misses.
 */
function courseLabel(course: unknown): string {
  if (course && typeof course === "object") {
    const { title, code } = course as { title?: unknown; code?: unknown };
    return String(title || code || "");
  }
  return String(course ?? "");
}

export interface Briefing {
  enabled: boolean;
  namespace: string;
  weak_topics: WeakTopic[];
  one_more_to_master: WeakTopic[];
  spot_check: { topic: string; expired_on: string }[];
  truncated: boolean;
  unparsed_records: number;
  total_records: number;
  error: string;
}

interface WeakTopic {
  topic: string;
  misses: number;
  last_missed: string;
  severity: string;
  streak: number;
  score: number;
}

/** Briefing -> prompt guidance, roughly 60/30/10. "" when there is no history. */
export function generationFocus(briefing: Briefing | null): string {
  if (!briefing || !briefing.enabled) return "";
  const weak = briefing.weak_topics.map((item) => item.topic);
  const spot = briefing.spot_check.map((item) => item.topic);
  if (!weak.length && !spot.length) return "";
  const lines = ["", "This student has a mistake history with this material. Weight the quiz:"];
  if (weak.length) lines.push(`- About 60 percent of questions should target these previously missed subtopics: ${weak.join(", ")}.`);
  lines.push("- About 30 percent should cover new material from the context.");
  if (spot.length) lines.push(`- About 10 percent should spot check these previously mastered subtopics: ${spot.join(", ")}.`);
  // Without this the model will invent a question about a remembered topic that
  // this particular document never covers.
  lines.push(
    "Only use concepts that actually appear in the provided context. If a listed " +
      "subtopic is absent from the context, skip it rather than inventing content.",
  );
  return lines.join("\n");
}

/** misses x severity x recency, recency halving every 30 days. Python-style round to 2dp. */
export function weaknessScore(misses: number, severity: string, lastMissed: string, onDate: string): number {
  const ageDays = Math.max(daysBetween(lastMissed, onDate), 0);
  const recency = 0.5 ** (ageDays / RECENCY_HALF_LIFE_DAYS);
  return Math.round(misses * (SEVERITY_WEIGHTS[severity] ?? 2) * recency * 100) / 100;
}

/** Rank topics by weakness from stored records. */
export async function weaknessBriefing(env: Env, userId: number, courseTitle: string, limit = RECALL_LIMIT, onDate?: string): Promise<Briefing> {
  const briefing: Briefing = {
    enabled: false,
    namespace: "",
    weak_topics: [],
    one_more_to_master: [],
    spot_check: [],
    truncated: false,
    unparsed_records: 0,
    total_records: 0,
    error: "",
  };
  if (!memwalEnabled(env)) return briefing;
  briefing.enabled = true;
  const now = onDate || today();
  try {
    const namespace = namespaceFor(userId, courseTitle);
    briefing.namespace = namespace;
    const [texts, truncated] = await recallTexts(env, namespace, "weak topics and repeated mistakes", limit);
    briefing.truncated = truncated;
    briefing.total_records = texts.length;

    const byTopic = new Map<string, { misses: ParsedRecord[]; hits: ParsedRecord[]; mastered: ParsedRecord[] }>();
    for (const text of texts) {
      const record = parse(text);
      if (!record) {
        briefing.unparsed_records += 1;
        continue;
      }
      const bucket = BUCKETS[record.kind];
      if (bucket && record.topic) {
        const groups = byTopic.get(record.topic) ?? { misses: [], hits: [], mastered: [] };
        groups[bucket].push(record);
        byTopic.set(record.topic, groups);
      }
    }

    for (const [topic, { misses, hits, mastered }] of byTopic) {
      const lastMiss = misses.length ? misses.map((r) => r.on).reduce((a, b) => (b > a ? b : a)) : null;
      // Mastery is live only if unexpired and no MISS is dated after it, which
      // is how a failed spot check voids it with no delete.
      const liveMastery = mastered.some((m) => m.expires && now <= m.expires && (lastMiss === null || lastMiss <= m.on));
      if (liveMastery) continue;

      const expired = mastered.filter((m) => m.expires && now > m.expires);
      if (expired.length && !misses.length) {
        briefing.spot_check.push({ topic, expired_on: expired.map((m) => m.expires!).reduce((a, b) => (b > a ? b : a)) });
        continue;
      }
      if (!misses.length || lastMiss === null) continue;

      const streak = new Set(hits.filter((h) => h.on > lastMiss).map((h) => h.on));
      // max() by weight keeps the first of equal weights, like Python's max.
      const severity = misses
        .map((m) => m.severity)
        .reduce((best, s) => ((SEVERITY_WEIGHTS[s] ?? 2) > (SEVERITY_WEIGHTS[best] ?? 2) ? s : best));
      const entry: WeakTopic = {
        topic,
        misses: misses.length,
        last_missed: lastMiss,
        severity,
        streak: streak.size,
        score: weaknessScore(misses.length, severity, lastMiss, now),
      };
      if (streak.size >= 2) briefing.one_more_to_master.push(entry);
      briefing.weak_topics.push(entry);
    }
    // Stable sort, like Python's sorted(..., reverse=True) on score.
    briefing.weak_topics.sort((a, b) => b.score - a.score);
    briefing.weak_topics = briefing.weak_topics.slice(0, TOP_TOPICS);
  } catch (error) {
    briefing.error = errorText(error);
    warn("memory briefing", userId, error);
  }
  return briefing;
}
