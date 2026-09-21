// Record format for Exam Mistake Memory. A port of apps/memory/records.py that
// writes byte-identical records, so memory written by the Django backend and by
// this Worker is one history, not two.
//
// Walrus Memory is append-only: there is no update or delete. So nothing here
// stores a counter. Every event is a new record, and counts are derived by
// recalling records and counting them.
//
// The record text *is* the schema. A pipe-delimited header carries the fields
// we rank on, and the prose underneath exists so semantic recall can find it.
// Pure functions only: no I/O, so this is testable without credentials.

export const SEVERITY_WEIGHTS: Record<string, number> = { high: 3, medium: 2, low: 1 };
export const DEFAULT_SEVERITY = "medium";
export const MASTERY_DAYS = 30;

// SESSION records carry no topic, so the topic group is optional. The negative
// lookahead stops an absent topic from letting the date slide into the topic
// slot, which would otherwise parse every SESSION with topic set to a date.
const HEADER =
  /^(?<kind>MISS|HIT|MASTERED|PATTERN|SESSION|MATERIAL|PROGRESS)\s*\|\s*(?<namespace>[^|]+?)\s*\|\s*(?:(?<topic>(?!\d{4}-\d{2}-\d{2}\s*(?:\||$))[^|]+?)\s*\|\s*)?(?<date>\d{4}-\d{2}-\d{2})(?<rest>\s*\|.*)?$/;

const SEVERITY = /sev:\s*(high|medium|low)/i;
const EXPIRES = /expires:\s*(\d{4}-\d{2}-\d{2})/;
const MISCONCEPTION = /My misconception:\s*([\s\S]+?)(?:\n|$)/i;
const SOURCE = /source:\s*([a-z0-9_]+)/i;
const MINUTES = /minutes:\s*(\d+)/i;
const STATUS = /status:\s*(active|done)/i;
const AT = /at:\s*(\S+)/;

export interface ParsedRecord {
  kind: string;
  namespace: string;
  topic: string;
  on: string; // YYYY-MM-DD
  severity: string;
  expires: string | null;
  text: string;
}

/** Today's date in UTC, matching Django's TIME_ZONE = "UTC". */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function validDate(value: string): boolean {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Stable join key across every record type. "beta blocker selectivity" and
 * "Beta-Blocker Selectivity" must collapse to the same slug or their misses
 * will never be counted together.
 */
export function slugifyTopic(value: unknown): string {
  if (!value) return "";
  // NFKD then drop non-ASCII, like Python's encode("ascii", "ignore").
  const ascii = String(value).normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase();
  return ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}

function on(date?: string): string {
  return date || today();
}

function severityOf(severity?: string): string {
  const value = (severity || DEFAULT_SEVERITY).toLowerCase();
  return value in SEVERITY_WEIGHTS ? value : DEFAULT_SEVERITY;
}

export function buildMiss(
  namespace: string,
  topic: string,
  question: string,
  answered: string,
  misconception: string,
  correct: string,
  severity = DEFAULT_SEVERITY,
  date?: string,
): string {
  return (
    `MISS | ${namespace} | ${slugifyTopic(topic)} | ${on(date)} | sev:${severityOf(severity)}\n` +
    `Q: ${question}\n` +
    `I answered: ${answered}. My misconception: ${misconception}.\n` +
    `Correct: ${correct}`
  );
}

export function buildHit(namespace: string, topic: string, date?: string): string {
  return `HIT | ${namespace} | ${slugifyTopic(topic)} | ${on(date)}\nAnswered correctly on a previously missed topic.`;
}

export function buildMastered(namespace: string, topic: string, correctDates: string[], date?: string): string {
  const when = on(date);
  const expires = addDays(when, MASTERY_DAYS);
  return (
    `MASTERED | ${namespace} | ${slugifyTopic(topic)} | ${when} | expires:${expires}\n` +
    `Correct on ${correctDates.join(", ")}. Spot-check again after the expiry date.`
  );
}

/**
 * What the student actually studied, as opposed to what they got wrong. Kept in
 * its own namespace so it never dilutes the mistake recall.
 */
export function buildMaterial(
  namespace: string,
  topic: string,
  sourceType: string,
  title: string,
  summary: string,
  reference = "",
  date?: string,
): string {
  const lines = [`MATERIAL | ${namespace} | ${slugifyTopic(topic)} | ${on(date)} | source:${sourceType}`, `Studied: ${title}`];
  if (summary) lines.push(`Covers: ${summary}`);
  if (reference) lines.push(`Reference: ${reference}`);
  return lines.join("\n");
}

export function sourceOf(text: unknown): string {
  const match = SOURCE.exec(String(text ?? ""));
  return match ? match[1].trim() : "";
}

export function buildSession(
  namespace: string,
  topics: string[],
  drilled: number,
  newMisses: number,
  hits: number,
  minutes = 0,
  date?: string,
): string {
  const slugs = topics.map(slugifyTopic).filter(Boolean).join(", ");
  return (
    `SESSION | ${namespace} | ${on(date)} | drilled:${drilled} new_misses:${newMisses} hits:${hits} minutes:${minutes}\n` +
    `Topics: ${slugs}`
  );
}

export function minutesOf(text: unknown): number {
  const match = MINUTES.exec(String(text ?? ""));
  return match ? Number.parseInt(match[1], 10) : 0;
}

/** The stored misconception, verbatim. Paraphrasing it loses the exact wrong model. */
export function misconceptionOf(text: unknown): string {
  const match = MISCONCEPTION.exec(String(text ?? ""));
  return match ? match[1].trim().replace(/\.+$/, "") : "";
}

/**
 * Parse one stored record, or null if it has no valid header. Returning null
 * rather than a best guess keeps unparseable memories countable, so format
 * drift shows up as a number instead of a quietly degrading briefing.
 */
export function parse(text: unknown): ParsedRecord | null {
  if (!text) return null;
  const lines = String(text).trim().split(/\r?\n/);
  if (!lines.length || !lines[0]) return null;
  const header = HEADER.exec(lines[0].trim());
  if (!header?.groups) return null;
  const date = header.groups.date;
  if (!validDate(date)) return null;

  const rest = header.groups.rest || "";
  const severity = SEVERITY.exec(rest);
  const expiresMatch = EXPIRES.exec(rest);
  const expires = expiresMatch && validDate(expiresMatch[1]) ? expiresMatch[1] : null;

  return {
    kind: header.groups.kind,
    namespace: (header.groups.namespace || "").trim(),
    topic: slugifyTopic(header.groups.topic),
    on: date,
    severity: severity ? severity[1].toLowerCase() : DEFAULT_SEVERITY,
    expires,
    text: String(text),
  };
}

/** Python's datetime.isoformat(timespec="microseconds") for a UTC instant. */
export function microsecondStamp(when = new Date(), extraMicros = 0): string {
  const iso = when.toISOString(); // 2026-09-19T10:11:12.345Z
  const micros = String(when.getUTCMilliseconds() * 1000 + extraMicros).padStart(6, "0");
  return `${iso.slice(0, 19)}.${micros}+00:00`;
}

// Workers freeze the clock during a request, so two checkpoints written in one
// request would get the same stamp. A per-isolate counter keeps them ordered.
let lastStamp = "";
let bump = 0;

function nextStamp(): string {
  const base = microsecondStamp(new Date());
  if (base.slice(0, 23) === lastStamp.slice(0, 23)) {
    bump = Math.min(bump + 1, 999);
  } else {
    bump = 0;
  }
  lastStamp = microsecondStamp(new Date(), bump);
  return lastStamp;
}

/**
 * Unfinished work, so it can be picked up on another day or device. The store
 * has no update, so finishing appends a `status:done` record. `at:` carries a
 * microsecond timestamp because several checkpoints of one activity land on
 * the same date and the date alone cannot say which is current.
 */
export function buildProgress(
  namespace: string,
  activityKey: string,
  label: string,
  payload: unknown,
  status = "active",
  at?: string,
  date?: string,
): string {
  const stamp = at || nextStamp();
  return (
    `PROGRESS | ${namespace} | ${slugifyTopic(activityKey)} | ${on(date)} | status:${status} at:${stamp}\n` +
    `Label: ${label}\n` +
    `Payload: ${asciiJson(payload)}`
  );
}

/** json.dumps(..., separators=(",", ":")) with Python's default ensure_ascii. */
export function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(/[-￿]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function statusOf(text: unknown): string {
  const match = STATUS.exec(String(text ?? ""));
  return match ? match[1].toLowerCase() : "";
}

export function checkpointAt(text: unknown): string {
  const match = AT.exec(String(text ?? ""));
  return match ? match[1] : "";
}

export function payloadOf(text: unknown): unknown {
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (line.startsWith("Payload: ")) {
      try {
        return JSON.parse(line.slice("Payload: ".length));
      } catch {
        return {};
      }
    }
  }
  return {};
}

export function labelOf(text: unknown): string {
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (line.startsWith("Label: ")) return line.slice("Label: ".length).trim();
  }
  return "";
}
