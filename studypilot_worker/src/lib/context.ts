// Picking the most study-worthy slices of a long text for the model. Port of
// select_pdf_study_context (apps/ai/services.py) and the heuristics it uses from
// apps/study_tools/local_generators.py.
//
// This module has no Worker dependencies on purpose: the frontend imports it too,
// so a PDF's contexts are computed in the browser at upload time and the Worker
// does not spend its CPU budget re-scanning 80,000 characters on every request.

import { cleanExtractedText } from "./text";

const STOPWORDS = new Set([
  "about", "above", "after", "again", "against", "also", "because", "before", "between", "could", "during",
  "from", "have", "into", "more", "most", "other", "over", "such", "than", "that", "their", "there", "these",
  "this", "those", "through", "under", "using", "when", "where", "which", "while", "with", "within", "would",
  "the", "and", "for", "are", "was", "were", "has", "had", "can", "may", "not", "you", "your", "its", "they",
]);

function cleanText(text: string): string {
  return (text || "")
    .replace(/\x00/g, " ")
    .replace(/﻿/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitIntoSentences(text: string): string[] {
  const parts = cleanText(text).split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
  const sentences: string[] = [];
  for (const item of parts) {
    const sentence = item.replace(/\s+/g, " ").trim();
    const words = sentence ? sentence.split(" ").length : 0;
    if (words >= 8 && words <= 42 && !/^(figure|table|chapter)\s+\d+/i.test(sentence)) sentences.push(sentence);
  }
  return [...new Set(sentences)];
}

/** Most frequent non-stopword terms, in their first-seen casing. */
export function extractKeywords(text: string, limit = 50): string[] {
  const words = cleanText(text).match(/\b[A-Za-z][A-Za-z0-9-]{3,}\b/g) ?? [];
  const counts = new Map<string, number>();
  const titleCase = new Map<string, string>();
  for (const word of words) {
    const key = word.toLowerCase();
    if (STOPWORDS.has(key)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!titleCase.has(key)) titleCase.set(key, word.replace(/^-+|-+$/g, ""));
  }
  // Counter.most_common: by count, ties in first-seen order (Map keeps insertion order).
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => titleCase.get(word)!)
    .filter(Boolean);
}

function isTitle(line: string): boolean {
  // Python's str.istitle(): cased words start upper, the rest lower, and at
  // least one cased character exists.
  let cased = false;
  let previousCased = false;
  for (const ch of line) {
    const upper = ch !== ch.toLowerCase();
    const lower = ch !== ch.toUpperCase();
    if (upper) {
      if (previousCased) return false;
      previousCased = true;
      cased = true;
    } else if (lower) {
      if (!previousCased) return false;
      previousCased = true;
      cased = true;
    } else {
      previousCased = false;
    }
  }
  return cased;
}

function isUpper(line: string): boolean {
  return line !== line.toLowerCase() && line === line.toUpperCase();
}

export function detectHeadings(text: string): string[] {
  const headings: string[] = [];
  for (const raw of cleanText(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length < 4 || line.length > 90) continue;
    if (line.split(/\s+/).length > 10) continue;
    if (/^(\d+(\.\d+)*|chapter\s+\d+|unit\s+\d+)\b/i.test(line) || isTitle(line) || isUpper(line)) {
      headings.push(line.replace(/^\d+(\.\d+)*\s*/, "").replace(/^[ :-]+|[ :-]+$/g, ""));
    }
  }
  return [...new Set(headings.filter(Boolean))];
}

const DEFINITION_PATTERNS = [
  /^(?<term>[A-Z][A-Za-z0-9 -]{2,60})\s+is\s+(?<definition>.+)$/,
  /^(?<term>[A-Z][A-Za-z0-9 -]{2,60})\s+refers to\s+(?<definition>.+)$/,
  /^(?<term>[A-Z][A-Za-z0-9 -]{2,60})\s+means\s+(?<definition>.+)$/,
  /^(?<term>[A-Z][A-Za-z0-9 -]{2,60})\s+can be defined as\s+(?<definition>.+)$/,
];

export function detectDefinitions(text: string): { term: string; definition: string; sentence: string }[] {
  const definitions = [];
  for (const sentence of splitIntoSentences(text)) {
    for (const pattern of DEFINITION_PATTERNS) {
      const match = pattern.exec(sentence);
      if (match?.groups) {
        const term = match.groups.term.replace(/^[ ,:]+|[ ,:]+$/g, "");
        const definition = match.groups.definition.trim();
        if (!STOPWORDS.has(term.toLowerCase()) && definition.split(/\s+/).length >= 5) {
          definitions.push({ term, definition, sentence });
        }
        break;
      }
    }
  }
  return definitions;
}

export function selectImportantSentences(text: string, limit = 100): string[] {
  const sentences = splitIntoSentences(text);
  const keywords = extractKeywords(text, 80).map((k) => k.toLowerCase());
  const markers = ["important", "therefore", "because", "process", "method", "model", "system", "example", "main", "key"];
  const score = (sentence: string) => {
    const lower = sentence.toLowerCase();
    const hits = keywords.filter((k) => lower.includes(k)).length;
    const signals = markers.filter((m) => lower.includes(m)).length;
    const words = sentence.split(/\s+/).length;
    return hits + signals + (words >= 14 && words <= 30 ? 1 : 0);
  };
  // sorted(..., reverse=True) is stable for equal scores.
  return sentences
    .map((sentence, index) => ({ sentence, index, score: score(sentence) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.sentence);
}

export function chunkText(text: string, chunkSize = 1400, overlap = 180, alreadyClean = false): string[] {
  const cleaned = alreadyClean ? text : cleanExtractedText(text);
  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    const chunk = cleaned.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === cleaned.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

const COMPARISON = /\b(difference|compare|contrast|whereas|however|advantages?|disadvantages?)\b/g;
const PROCESS = /\b(process|steps?|phase|stages?|procedure|algorithm|method)\b/g;
const EXAMPLE = /\b(example|for instance|such as|case)\b/g;

function count(re: RegExp, text: string): number {
  return text.match(re)?.length ?? 0;
}

function scoreChunk(chunk: string, keywords: string[]): number {
  const lowered = chunk.toLowerCase();
  const keywordScore = keywords.filter((k) => lowered.includes(k.toLowerCase())).length * 3;
  const definitionScore = detectDefinitions(chunk).length * 6;
  const headingScore = detectHeadings(chunk).length * 4;
  const repeated = new Map<string, number>();
  for (const term of lowered.match(/\b[A-Za-z][A-Za-z-]{5,}\b/g) ?? []) repeated.set(term, (repeated.get(term) ?? 0) + 1);
  const repetitionScore = [...repeated.values()].filter((n) => n >= 2).length;
  return (
    keywordScore +
    definitionScore +
    headingScore +
    count(COMPARISON, lowered) * 4 +
    count(PROCESS, lowered) * 3 +
    count(EXAMPLE, lowered) * 2 +
    repetitionScore
  );
}

/**
 * The ten best-scoring chunks (after skipping `skipChunks`, which the retry pass
 * uses to reach different material), capped at maxChars.
 */
export function selectStudyContext(extractedText: string, maxChars = 20000, skipChunks = 0): string {
  const cleaned = cleanExtractedText(extractedText);
  if (!cleaned) return "";
  const keywords = extractKeywords(cleaned, 45);
  const chunks = chunkText(cleaned);
  if (!chunks.length) return cleaned.slice(0, maxChars);
  // sorted by (score, -index) descending: best score first, earlier chunk first on ties.
  const scored = chunks
    .map((chunk, index) => ({ chunk, index, score: scoreChunk(chunk, keywords) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const skip = Math.max(0, skipChunks);
  const selected: string[] = [];
  const used = new Set<number>();
  for (const { index, chunk } of scored.slice(skip, skip + 10)) {
    if (used.has(index)) continue;
    selected.push(chunk);
    used.add(index);
    if (selected.join("\n\n").length >= maxChars) break;
  }
  if (selected.join("\n\n").length < Math.min(2500, cleaned.length)) {
    selected.push(selectImportantSentences(cleaned, 40).join("\n"));
  }
  return cleanExtractedText(selected.join("\n\n--- STUDY CONTEXT ---\n\n")).slice(0, maxChars);
}
