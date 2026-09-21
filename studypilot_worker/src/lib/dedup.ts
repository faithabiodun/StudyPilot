// Port of apps/study_tools/deduplication.py, including difflib.SequenceMatcher's
// ratio(), so "is this question a near duplicate" gives the same answer here as
// it did in Python.

import { cleanExtractedText, cleanSafeString } from "./text";

const PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g;

export function normalizeQuestionText(question: string): string {
  let text = cleanExtractedText(question || "").toLowerCase();
  text = text.replace(/^\s*(?:q(?:uestion)?\s*)?\d+[).:\-]\s*/i, "");
  text = text.replace(/^\s*\d+[).:\-]\s*/, "");
  text = text.replace(PUNCTUATION, "");
  return text.replace(/\s+/g, " ").trim();
}

/**
 * difflib.SequenceMatcher(None, a, b).ratio(), including its "autojunk"
 * heuristic, which treats characters making up more than 1% of a 200+ char b as
 * junk. Questions are usually shorter, but long ones must score the same too.
 */
export function sequenceRatio(a: string, b: string): number {
  const total = a.length + b.length;
  if (!total) return 1;

  const b2j = new Map<string, number[]>();
  for (let i = 0; i < b.length; i++) {
    const list = b2j.get(b[i]);
    if (list) list.push(i);
    else b2j.set(b[i], [i]);
  }
  if (b.length >= 200) {
    const popular = Math.floor(b.length / 100) + 1;
    for (const [ch, indices] of b2j) if (indices.length > popular) b2j.delete(ch);
  }

  const findLongestMatch = (alo: number, ahi: number, blo: number, bhi: number): [number, number, number] => {
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    let j2len = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const next = new Map<number, number>();
      for (const j of b2j.get(a[i]) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        next.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
      j2len = next;
    }
    // Extend over equal characters on each side. With isjunk=None difflib's
    // "not isbjunk" test is always true, so this is what pulls autojunked
    // (popular) characters back into a match.
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
      besti--;
      bestj--;
      bestsize++;
    }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) {
      bestsize++;
    }
    return [besti, bestj, bestsize];
  };

  let matches = 0;
  const queue: [number, number, number, number][] = [[0, a.length, 0, b.length]];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    const [i, j, k] = findLongestMatch(alo, ahi, blo, bhi);
    if (k) {
      matches += k;
      if (alo < i && blo < j) queue.push([alo, i, blo, j]);
      if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
    }
  }
  return (2 * matches) / total;
}

/** Upper bound on ratio() from character counts alone (difflib's quick_ratio). */
function quickRatio(a: string, b: string): number {
  const avail = new Map<string, number>();
  for (const ch of b) avail.set(ch, (avail.get(ch) ?? 0) + 1);
  let matches = 0;
  for (const ch of a) {
    const n = avail.get(ch) ?? 0;
    if (n > 0) matches++;
    avail.set(ch, n - 1);
  }
  const total = a.length + b.length;
  return total ? (2 * matches) / total : 1;
}

function isNearDuplicate(normalized: string, existing: string[]): boolean {
  if (!normalized) return true;
  return existing.some(
    (item) =>
      normalized === item ||
      // quick_ratio bounds ratio from above, so skipping below 0.9 changes no
      // answer and avoids the expensive comparison for most pairs.
      (quickRatio(normalized, item) >= 0.9 && sequenceRatio(normalized, item) >= 0.9),
  );
}

export interface Card {
  question: string;
  answer: string;
}

export function deduplicateFlashcards(flashcards: unknown, limit?: number): Card[] {
  const unique: Card[] = [];
  const seen: string[] = [];
  for (const card of Array.isArray(flashcards) ? flashcards : []) {
    const question = cleanExtractedText((card as Record<string, unknown>)?.question ?? "");
    const answer = cleanExtractedText((card as Record<string, unknown>)?.answer ?? "");
    const normalized = normalizeQuestionText(question);
    if (!question || !answer || isNearDuplicate(normalized, seen)) continue;
    unique.push({ question, answer });
    seen.push(normalized);
    if (limit && unique.length >= limit) break;
  }
  return unique;
}

export interface Option {
  option_text: string;
  is_correct: boolean;
}

export interface Question {
  question_type: string;
  question: string;
  correct_answer: string;
  explanation: string;
  subtopic: string;
  options: Option[];
}

function dedupeOptions(options: unknown, correctAnswer = ""): Option[] {
  const seen = new Set<string>();
  let correctNorm = normalizeQuestionText(correctAnswer);
  let correct: Option | null = null;
  let distractors: Option[] = [];
  for (const option of Array.isArray(options) ? options : []) {
    const text = cleanSafeString((option as Record<string, unknown>)?.option_text ?? "", "", 240);
    const norm = normalizeQuestionText(text);
    if (!text || seen.has(norm)) continue;
    const isCorrect = Boolean((option as Record<string, unknown>)?.is_correct) || (Boolean(correctNorm) && norm === correctNorm);
    if (isCorrect && correct === null) correct = { option_text: text, is_correct: true };
    else distractors.push({ option_text: text, is_correct: false });
    seen.add(norm);
  }
  if (correct === null && correctAnswer) {
    const correctText = cleanSafeString(correctAnswer, "", 240);
    correctNorm = normalizeQuestionText(correctText);
    if (correctText) {
      correct = { option_text: correctText, is_correct: true };
      distractors = distractors.filter((o) => normalizeQuestionText(o.option_text) !== correctNorm);
    }
  }
  if (correct === null || distractors.length < 3) return [];
  return [correct, ...distractors.slice(0, 3)];
}

function cleanQuestion(item: Record<string, unknown>, requireMcq: boolean): Question | null {
  const question = cleanExtractedText(item?.question ?? "");
  const correctAnswer = cleanSafeString(item?.correct_answer ?? "", "", 255);
  const explanation = cleanExtractedText(item?.explanation ?? "");
  const questionType = cleanSafeString(item?.question_type ?? "multiple_choice", "multiple_choice", 40);
  if (!question || !correctAnswer) return null;
  const cleaned: Question = {
    question_type: questionType,
    question,
    correct_answer: correctAnswer,
    explanation,
    // Mistake memory groups by this; dropping it silently disabled per-concept
    // tracking for every generated question once before.
    subtopic: cleanSafeString(item?.subtopic ?? "", "", 120),
    options: [],
  };
  if (requireMcq || questionType === "multiple_choice") {
    const options = dedupeOptions(item?.options, correctAnswer);
    if (options.length !== 4 || options.filter((o) => o.is_correct).length !== 1) return null;
    cleaned.options = options;
    cleaned.question_type = "multiple_choice";
  } else if (questionType === "true_false") {
    const answer = correctAnswer.toLowerCase().startsWith("t") ? "True" : "False";
    cleaned.correct_answer = answer;
    cleaned.options = [
      { option_text: "True", is_correct: answer === "True" },
      { option_text: "False", is_correct: answer === "False" },
    ];
  }
  return cleaned;
}

export function deduplicateQuestions(questions: unknown, limit?: number, requireMcq = false): Question[] {
  const unique: Question[] = [];
  const seen: string[] = [];
  for (const item of Array.isArray(questions) ? questions : []) {
    const cleaned = cleanQuestion((item ?? {}) as Record<string, unknown>, requireMcq);
    if (!cleaned) continue;
    const normalized = normalizeQuestionText(cleaned.question);
    if (isNearDuplicate(normalized, seen)) continue;
    unique.push(cleaned);
    seen.push(normalized);
    if (limit && unique.length >= limit) break;
  }
  return unique;
}
