// Port of apps/documents/services.py text cleaning. Every string that reaches
// the database or a prompt passes through one of these.

// Unicode "Other" categories (control, format, surrogate, private use,
// unassigned), which Python's unicodedata.category(...).startswith("C") drops.
// Newline and tab are "Cc" too, so they are kept explicitly.
const OTHER = /[^\n\t\P{C}]/gu;

export function cleanExtractedText(text: unknown): string {
  if (text === null || text === undefined || text === "") return "";
  let value = String(text);
  value = value.replace(/\x00/g, "").replace(/﻿/g, "");
  value = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  value = value.replace(OTHER, "");
  value = value.replace(/[^\S\n]+/g, " ");
  value = value.replace(/ *\n */g, "\n");
  value = value.replace(/\n{3,}/g, "\n\n");
  return value.trim();
}

/**
 * For long text the browser has already passed through cleanExtractedText.
 * Re-running it on 80,000 characters costs ~6ms, most of the free plan's CPU
 * budget, so the server only removes what Postgres itself rejects (NUL) and
 * enforces the size cap.
 */
export function sanitizeCleanedText(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/\x00/g, "").slice(0, maxLength).trim();
}

export function cleanSafeString(value: unknown, fallback = "", maxLength?: number): string {
  let cleaned = cleanExtractedText(value).replace(/\s+/g, " ").trim();
  if (!cleaned) cleaned = fallback;
  if (maxLength) cleaned = cleaned.slice(0, maxLength).trim();
  return cleaned;
}
