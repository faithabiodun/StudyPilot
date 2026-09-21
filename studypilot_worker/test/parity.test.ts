// Parity with the Django backend. Every expected value in python-vectors.json
// was produced by running the original Python code (see the generator in the
// commit that added this file), so a pass means the port behaves identically.

import { describe, expect, it } from "vitest";
import vectors from "./python-vectors.json";
import { selectStudyContext } from "../src/lib/context";
import { deduplicateFlashcards, deduplicateQuestions, normalizeQuestionText, sequenceRatio } from "../src/lib/dedup";
import { cleanExtractedText, cleanSafeString } from "../src/lib/text";
import {
  buildHit,
  buildMastered,
  buildMaterial,
  buildMiss,
  buildProgress,
  buildSession,
  misconceptionOf,
  parse,
  slugifyTopic,
} from "../src/memory/records";
import { verifyPersonalMessage } from "../src/auth/sui";
import { decode } from "../src/auth/jwt";

describe("text cleaning", () => {
  it("matches clean_extracted_text and clean_safe_string", () => {
    expect(cleanExtractedText(vectors.clean.input)).toBe(vectors.clean.extracted);
    expect(cleanSafeString(vectors.clean.input, "", 30)).toBe(vectors.clean.safe);
  });
});

describe("study context selection", () => {
  it("picks the same chunks as select_pdf_study_context", () => {
    expect(selectStudyContext(vectors.context.text, 20000)).toBe(vectors.context.first);
  });

  it("picks the same retry chunks (skip_chunks=10)", () => {
    expect(selectStudyContext(vectors.context.text, 20000, 10)).toBe(vectors.context.retry);
  });
});

describe("deduplication", () => {
  it("SequenceMatcher.ratio matches difflib, including autojunk", () => {
    for (const [a, b, ratio] of vectors.ratios as [string, string, number][]) {
      expect(sequenceRatio(a, b)).toBeCloseTo(ratio, 12);
    }
  });

  it("normalizes question text the same way", () => {
    for (const [input, normalized] of vectors.normalized as [string, string][]) {
      expect(normalizeQuestionText(input)).toBe(normalized);
    }
  });

  it("dedupes mixed and MCQ-only quizzes identically", () => {
    const strip = (items: object[]) => items.map((item) => JSON.parse(JSON.stringify(item)));
    const pyShape = (items: Record<string, unknown>[]) =>
      items.map((item) => ({ ...item, options: item.options ?? [] }));
    expect(strip(deduplicateQuestions(vectors.questions.input))).toEqual(pyShape(vectors.questions.mixed as never));
    expect(strip(deduplicateQuestions(vectors.questions.input, undefined, true))).toEqual(pyShape(vectors.questions.mcq as never));
  });

  it("dedupes flashcards identically", () => {
    expect(
      deduplicateFlashcards([
        { question: "What is 2NF?", answer: "x" },
        { question: "What is 2NF", answer: "y" },
        { question: "", answer: "z" },
      ]),
    ).toEqual(vectors.flashcards);
  });
});

describe("memory records", () => {
  it("slugifies topics the same way", () => {
    for (const [input, slug] of vectors.slugs as [string, string][]) expect(slugifyTopic(input)).toBe(slug);
  });

  it("writes byte-identical records", () => {
    const r = vectors.records;
    expect(buildMiss("sp-u1-pharm", "Beta Blockers", "Q?", "Propranolol", "answered Propranolol instead of Atenolol", "Atenolol", "high", "2026-08-23")).toBe(r.miss);
    expect(buildHit("sp-u1-pharm", "beta-blockers", "2026-08-24")).toBe(r.hit);
    expect(buildMastered("sp-u1-pharm", "beta-blockers", ["2026-08-20", "2026-08-22"], "2026-08-24")).toBe(r.mastered);
    expect(buildMaterial("sp-u1-studied", "Compilers", "youtube", "Lexers explained", "tokens", "https://youtu.be/x", "2026-08-01")).toBe(r.material);
    expect(buildSession("sp-u1-studied", [], 0, 0, 0, 42, "2026-08-02")).toBe(r.session);
    expect(
      buildProgress("sp-u1-progress", "pdf-quiz-9", "Quiz é", { answers: { "1": "Café" }, index: 3 }, "active", "2026-08-03T10:11:12.345678+00:00", "2026-08-03"),
    ).toBe(r.progress);
  });

  it("parses every record kind the same way", () => {
    for (const [kind, text] of Object.entries(vectors.records)) {
      const parsed = parse(text);
      const expected = (vectors.parsed as Record<string, unknown>)[kind];
      expect(parsed && { kind: parsed.kind, namespace: parsed.namespace, topic: parsed.topic, on: parsed.on, severity: parsed.severity, expires: parsed.expires }).toEqual(expected);
    }
  });

  it("quotes the misconception verbatim", () => {
    expect(misconceptionOf(vectors.records.miss)).toBe(vectors.misconception);
  });
});

describe("auth compatibility", () => {
  it("verifies a Sui wallet signature produced the way the Python verifier expects", async () => {
    const { message, signature, address } = vectors.sui;
    expect(await verifyPersonalMessage(message, signature, address)).toBe(address);
  });

  it("rejects the same signature paired with another address", async () => {
    const { message, signature } = vectors.sui;
    await expect(verifyPersonalMessage(message, signature, "0x" + "1".repeat(64))).rejects.toThrow(/does not match/);
  });

  it("accepts a token issued by SimpleJWT (PyJWT) with the same secret", async () => {
    const payload = await decode(vectors.jwt.token, vectors.jwt.secret, "access");
    expect(payload.user_id).toBe("17");
  });

  it("rejects a SimpleJWT token signed with a different secret", async () => {
    await expect(decode(vectors.jwt.token, "other-secret", "access")).rejects.toThrow();
  });
});
