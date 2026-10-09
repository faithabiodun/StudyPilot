// Memory service behaviour against an in-memory stand-in for the MemWal client,
// mirroring the Django tests that used MemWalMockSync.

import { beforeEach, describe, expect, it, vi } from "vitest";

const store: { text: string; namespace: string }[] = [];
const failures = { recall: false, write: false };
const recalls: Record<string, unknown>[] = [];

vi.mock("@mysten-incubation/memwal", () => ({
  MemWal: {
    create: () => ({
      async rememberBulkAsync(items: { text: string; namespace: string }[]) {
        if (failures.write) throw new Error("write unavailable");
        store.push(...items);
        return { job_ids: items.map((_, i) => `job-${i}`) };
      },
      async recall(options: { namespace: string; limit: number; sort?: string; maxDistance?: number }) {
        recalls.push(options);
        const { namespace, limit } = options;
        if (failures.recall) throw new Error("relayer down");
        const results = store.filter((m) => m.namespace === namespace).slice(0, limit);
        return { results: results.map((m) => ({ text: m.text, distance: 0.4, blob_id: "b" })), total: results.length };
      },
    }),
  },
}));

const {
  generationFocus,
  namespaceFor,
  recordQuizAttempt,
  resumePoints,
  saveProgress,
  studyHistory,
  weaknessBriefing,
  weaknessScore,
  rememberMaterial,
  recentStudyMemories,
  materialContext,
  rememberConversation,
  conversationContext,
} = await import("../src/memory/services");
const { buildMastered, buildMiss, buildProgress, buildSession } = await import("../src/memory/records");

const env = { MEMWAL_ENABLED: "true", MEMWAL_ACCOUNT_ID: "0xabc", MEMWAL_PRIVATE_KEY: "00".repeat(32) } as never;
const disabled = { MEMWAL_ENABLED: "false", MEMWAL_ACCOUNT_ID: "", MEMWAL_PRIVATE_KEY: "" } as never;

beforeEach(() => {
  store.length = 0;
  failures.recall = false;
  failures.write = false;
  recalls.length = 0;
});

describe("study content and chatbot memory", () => {
  it("persists actual generated flashcards in bounded chunks and reports queued indexing", async () => {
    const content = "Question: What is 2NF? Answer: Remove partial dependencies.\n".repeat(180);
    const result = await rememberMaterial(env, 1, { sourceType: "flashcards", title: "Database systems", content, reference: "document:7" });
    expect(result).toMatchObject({ enabled: true, written: 0, queued: Math.ceil(content.length / 3500) });
    expect(store.every((item) => item.namespace === "sp-u1-studied")).toBe(true);
    expect(store[0].text).toContain("at:");
    expect(store.map((item) => item.text.split(/\nContent part \d+:\n/)[1]).join("")).toBe(content);
    expect(await materialContext(env, 1, "What was on my 2NF flashcards?")).toContain("Remove partial dependencies");
  });

  it("recalls recent material with recency ordering and collapses content chunks", async () => {
    await rememberMaterial(env, 1, { sourceType: "pdf", title: "Lecture one", content: "a".repeat(8000), reference: "document:7" });
    await rememberMaterial(env, 2, { sourceType: "search", title: "Other student's search" });
    const recent = await recentStudyMemories(env, 1);
    expect(recent.items).toHaveLength(1);
    expect(recent.items[0]).toMatchObject({ title: "Lecture one", source: "pdf", reference: "document:7" });
    expect(recalls.at(-1)).toMatchObject({ namespace: "sp-u1-studied", sort: "recent" });
  });

  it("keeps past chats separate and recalls only the same student's conversations", async () => {
    await rememberConversation(env, 1, "Explain 2NF", "Remove partial dependencies.");
    await rememberConversation(env, 2, "My private question", "Other answer");
    expect(await conversationContext(env, 1, "Continue explaining 2NF")).toContain("Remove partial dependencies");
    expect(await conversationContext(env, 1, "Continue explaining 2NF")).not.toContain("Other answer");
    expect((await recentStudyMemories(env, 1)).items).toEqual([]);
  });

  it("reports memory outages without breaking capture or recall", async () => {
    failures.write = true;
    expect(await rememberMaterial(env, 1, { sourceType: "pdf", title: "Lecture" })).toMatchObject({ written: 0, error: "write unavailable" });
    failures.recall = true;
    expect(await recentStudyMemories(env, 1)).toMatchObject({ enabled: true, items: [], error: "relayer down" });
    expect(await materialContext(env, 1, "PDF")).toBe("");
    expect(await conversationContext(env, 1, "Chat")).toBe("");
  });

  it("does not claim persistence when memory is disabled", async () => {
    expect(await rememberMaterial(disabled, 1, { sourceType: "pdf", title: "Lecture" })).toMatchObject({ enabled: false, written: 0 });
    expect((await recentStudyMemories(disabled, 1)).items).toEqual([]);
    expect(store).toEqual([]);
  });
});

describe("namespaces", () => {
  it("prefixes every namespace with the user id", () => {
    expect(namespaceFor(17, "Pharmacology 101")).toBe("sp-u17-pharmacology-101");
    expect(namespaceFor(17, "")).toBe("sp-u17-general");
  });
});

describe("recordQuizAttempt", () => {
  it("writes a MISS per wrong answer and skips answers without a subtopic", async () => {
    const summary = await recordQuizAttempt(env, 1, "Pharm", [
      { subtopic: "beta-blockers", question: "Q1", selected_answer: "A", correct_answer: "B", is_correct: false },
      { subtopic: "", question: "Q2", selected_answer: "A", correct_answer: "B", is_correct: false },
      { subtopic: "ace-inhibitors", question: "Q3", selected_answer: "B", correct_answer: "B", is_correct: true },
    ]);
    expect(summary).toMatchObject({ enabled: true, written: 1, misses: 1, hits: 0 });
    expect(store[0].text).toMatch(/^MISS \| sp-u1-pharm \| beta-blockers \|/);
  });

  it("writes a HIT only for a correct answer on a topic missed before", async () => {
    await recordQuizAttempt(env, 1, "Pharm", [{ subtopic: "beta-blockers", is_correct: false, selected_answer: "A", correct_answer: "B" }]);
    const summary = await recordQuizAttempt(env, 1, "Pharm", [
      { subtopic: "beta-blockers", is_correct: true },
      { subtopic: "never-missed", is_correct: true },
    ]);
    expect(summary).toMatchObject({ hits: 1, misses: 0, written: 1 });
    expect(store.at(-1)!.text).toMatch(/^HIT \| sp-u1-pharm \| beta-blockers/);
  });

  it("never throws when the relayer fails, so grading still works", async () => {
    failures.recall = true;
    const summary = await recordQuizAttempt(env, 1, "Pharm", [{ subtopic: "x", is_correct: false }]);
    expect(summary.error).toBe("relayer down");
  });

  it("is a no-op when memory is disabled", async () => {
    expect(await recordQuizAttempt(disabled, 1, "Pharm", [{ subtopic: "x", is_correct: false }])).toMatchObject({ enabled: false, written: 0 });
  });
});

describe("weaknessBriefing", () => {
  const ns = "sp-u1-pharm";
  const miss = (topic: string, on: string, sev = "medium") => ({ namespace: ns, text: buildMiss(ns, topic, "Q", "A", "m", "B", sev, on) });

  it("ranks by misses x severity x recency and reports unparsed records", async () => {
    store.push(miss("old-topic", "2026-06-01"), miss("old-topic", "2026-06-02"), miss("fresh", "2026-09-18", "high"));
    store.push({ namespace: ns, text: "free text from memwal_analyze" });
    const briefing = await weaknessBriefing(env, 1, "Pharm", 50, "2026-09-19");
    expect(briefing.weak_topics.map((t) => t.topic)).toEqual(["fresh", "old-topic"]);
    expect(briefing.unparsed_records).toBe(1);
    expect(briefing.total_records).toBe(4);
  });

  it("hides topics with live mastery and surfaces expired mastery for a spot check", async () => {
    store.push({ namespace: ns, text: buildMastered(ns, "mastered-now", ["2026-09-01"], "2026-09-10") });
    store.push({ namespace: ns, text: buildMastered(ns, "mastered-long-ago", ["2026-06-01"], "2026-06-10") });
    const briefing = await weaknessBriefing(env, 1, "Pharm", 50, "2026-09-19");
    expect(briefing.weak_topics).toEqual([]);
    expect(briefing.spot_check).toEqual([{ topic: "mastered-long-ago", expired_on: "2026-07-10" }]);
  });

  it("voids mastery when a MISS is dated after it", async () => {
    store.push({ namespace: ns, text: buildMastered(ns, "slipped", ["2026-09-01"], "2026-09-05") }, miss("slipped", "2026-09-10"));
    const briefing = await weaknessBriefing(env, 1, "Pharm", 50, "2026-09-19");
    expect(briefing.weak_topics.map((t) => t.topic)).toEqual(["slipped"]);
  });

  it("feeds generation 60/30/10 guidance only when there is history", async () => {
    expect(generationFocus(await weaknessBriefing(env, 1, "Empty"))).toBe("");
    store.push(miss("normal-forms", "2026-09-18"));
    expect(generationFocus(await weaknessBriefing(env, 1, "Pharm"))).toContain("previously missed subtopics: normal-forms");
  });

  it("halves the score every 30 days", () => {
    expect(weaknessScore(2, "medium", "2026-09-19", "2026-09-19")).toBe(4);
    expect(weaknessScore(2, "medium", "2026-08-20", "2026-09-19")).toBe(2);
  });
});

describe("progress and history", () => {
  it("resumes the newest active checkpoint and hides finished work", async () => {
    await saveProgress(env, 1, "pdf-quiz-1", "Quiz one", { index: 1 });
    await saveProgress(env, 1, "pdf-quiz-1", "Quiz one", { index: 2 });
    await saveProgress(env, 1, "pdf-quiz-2", "Quiz two", { index: 5 });
    await saveProgress(env, 1, "pdf-quiz-2", "Quiz two", {}, "done");
    const resume = await resumePoints(env, 1);
    expect(resume.items).toHaveLength(1);
    expect(resume.items[0]).toMatchObject({ key: "pdf-quiz-1", label: "Quiz one", payload: { index: 2 } });
  });

  it("prefers done on an exact timestamp tie", async () => {
    const ns = "sp-u1-progress";
    const at = "2026-09-19T10:00:00.000000+00:00";
    store.push(
      { namespace: ns, text: buildProgress(ns, "deck-1", "Deck", {}, "active", at, "2026-09-19") },
      { namespace: ns, text: buildProgress(ns, "deck-1", "Deck", {}, "done", at, "2026-09-19") },
    );
    expect((await resumePoints(env, 1)).items).toEqual([]);
  });

  it("reads study days back out of SESSION records", async () => {
    const ns = "sp-u1-studied";
    store.push(
      { namespace: ns, text: buildSession(ns, [], 0, 0, 0, 30, "2026-09-02") },
      { namespace: ns, text: buildSession(ns, [], 0, 0, 0, 12, "2026-09-01") },
    );
    expect(await studyHistory(env, 1)).toMatchObject({
      days: [
        { date: "2026-09-01", minutes: 12 },
        { date: "2026-09-02", minutes: 30 },
      ],
      total_minutes: 42,
    });
  });
});
