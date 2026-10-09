import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Sql } from "../src/db";
import type { Env } from "../src/env";
import type { User } from "../src/auth/users";

const memory = vi.hoisted(() => ({
  recent: { enabled: true, items: [] as { title: string; source: string; summary: string; reference: string; saved_at: string }[], error: "" },
  prompt: "",
}));
vi.mock("../src/memory/services", () => ({
  recentStudyMemories: vi.fn(async () => memory.recent),
  materialContext: vi.fn(async () => "Question: What is 2NF? Answer: Remove partial dependencies."),
  misconceptionContext: vi.fn(async () => "Previously missed 2NF"),
  conversationContext: vi.fn(async () => "Earlier conversation about normal forms"),
}));
vi.mock("../src/lib/ai", () => ({
  generateText: vi.fn(async (_env: unknown, prompt: string) => { memory.prompt = prompt; return "An explanation"; }),
}));
import { advisorStudySuggestions, suggestionForMemory } from "../src/services/advisor-memory";
import { generateAdvisorResponse } from "../src/services/advisor";

beforeEach(() => { memory.recent = { enabled: true, items: [], error: "" }; memory.prompt = ""; });

function sqlFor(rows: unknown[]) {
  return ((strings: TemplateStringsArray | string[]) => strings && "raw" in strings ? Promise.resolve(rows) : strings) as unknown as Sql;
}

describe("chat suggestions based on study activity", () => {
  it.each(["flashcards", "pdf", "youtube", "youtube_flashcards", "youtube_mcq", "youtube_quiz", "quiz", "mcq", "quiz_attempt", "search", "saved", "opened"])("supports %s activity", (source) => {
    expect(suggestionForMemory({ source, title: "Database systems", summary: "", reference: "", saved_at: "2026-10-09" })?.question).toContain("Database systems");
  });

  it("merges recent memory and indexing-pending activity, newest first", async () => {
    memory.recent.items = [{ source: "pdf", title: "Old PDF", summary: "", reference: "document:7", saved_at: "2026-10-07T00:00:00Z" }];
    const result = await advisorStudySuggestions({} as Env, sqlFor([{ activity_type: "resource_search", source_title: "Compilers", metadata: {}, created_at: new Date("2026-10-09") }]), 1);
    expect(result.suggestions.map((s) => s.title)).toEqual(["Compilers", "Old PDF"]);
    expect(result.suggestions[1].document_id).toBe(7);
  });

  it("does not duplicate the same material from memory and the activity log", async () => {
    memory.recent.items = [{ source: "pdf", title: "Lecture", summary: "", reference: "document:7", saved_at: "2026-10-09T00:00:00Z" }];
    const result = await advisorStudySuggestions({} as Env, sqlFor([{ activity_type: "pdf_uploaded", source_title: "Lecture", metadata: { document_id: 7 }, created_at: new Date("2026-10-09") }]), 1);
    expect(result.suggestions).toHaveLength(1);
  });

  it("falls back to stored activity during a memory outage", async () => {
    memory.recent.error = "unavailable";
    const result = await advisorStudySuggestions({} as Env, sqlFor([{ activity_type: "flashcards_generated", source_title: "Compilers", metadata: {}, created_at: new Date() }]), 1);
    expect(result.memory_available).toBe(false);
    expect(result.suggestions[0].question).toContain("flashcards");
  });

  it("uses a user-scoped activity query", async () => {
    const values: unknown[] = [];
    const sql = ((strings: TemplateStringsArray | string[], ...parameters: unknown[]) => {
      if (!("raw" in strings)) return strings;
      expect(strings.join("?")).toContain("where a.user_id =");
      values.push(...parameters); return Promise.resolve([]);
    }) as unknown as Sql;
    await advisorStudySuggestions({} as Env, sql, 42);
    expect(values[0]).toBe(42);
  });
});

describe("advisor generation", () => {
  it("passes actual study content, earlier chat and stored conversations to the chatbot", async () => {
    const user = { id: 1, current_courses: [], full_name: "Student" } as unknown as User;
    const data = await generateAdvisorResponse({} as Env, sqlFor([]), user, "Explain normal forms", null, "user: I struggle with dependencies");
    expect(memory.prompt).toContain("Remove partial dependencies");
    expect(memory.prompt).toContain("I struggle with dependencies");
    expect(memory.prompt).toContain("Earlier conversation about normal forms");
    expect(memory.prompt).toContain("untrusted");
    expect(data.used_memory_context).toBe(true);
    expect(data.suggested_followups.length).toBeGreaterThan(0);
  });
});
