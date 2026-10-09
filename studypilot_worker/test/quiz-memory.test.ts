import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/auth/users";
import type { Sql } from "../src/db";
import type { Env } from "../src/env";
import { accessFor } from "../src/auth/jwt";
import { HttpError } from "../src/http";

vi.mock("../src/services/activity", () => ({ recordActivity: vi.fn() }));
vi.mock("../src/memory/services", () => ({
  memwalEnabled: (env: Env) => env.MEMWAL_ENABLED === "true",
  recordQuizAttempt: vi.fn(async () => ({ enabled: true, written: 0, error: "" })),
  rememberMaterial: vi.fn(async () => ({ enabled: true, queued: 1, written: 0, error: "" })),
  recentStudyMemories: vi.fn(), resumePoints: vi.fn(), saveProgress: vi.fn(), studyHistory: vi.fn(),
  weaknessBriefing: vi.fn(), generationFocus: vi.fn(),
}));
import memory from "../src/routes/memory";
import quizzes from "../src/routes/quizzes";
import { recordQuizAttempt, rememberMaterial, saveProgress } from "../src/memory/services";
import { recordActivity } from "../src/services/activity";

const env = { SECRET_KEY: "quiz-test", MEMWAL_ENABLED: "true" } as Env;
beforeEach(() => vi.clearAllMocks());

async function harness(route = memory, rows: unknown[][] = []) {
  const queries: { text: string; values: unknown[] }[] = [];
  const sql = ((strings: TemplateStringsArray | unknown[], ...values: unknown[]) => {
    if (!("raw" in strings)) return strings;
    queries.push({ text: strings.join("?"), values });
    if (strings.join("").includes("accounts_user")) return Promise.resolve([{ id: 9, is_active: true }]);
    if (!rows.length) throw new Error("Unexpected database query");
    return Promise.resolve(rows.shift());
  }) as unknown as Sql;
  const app = new Hono<AppEnv>();
  app.onError((error) => error instanceof HttpError ? Response.json(error.body, { status: error.status }) : Response.json({}, { status: 500 }));
  app.use("*", async (c, next) => { c.set("sql", sql); await next(); });
  app.route("/", route);
  const token = await accessFor(env, 9);
  const post = (path: string, body: unknown, authenticated = true, enabled = true) => app.request(`https://test.local${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  }, { ...env, MEMWAL_ENABLED: String(enabled) });
  return { post, queries };
}

describe("completed quizzes reach persistent study memory", () => {
  it("records YouTube questions and answers under the authenticated student and computes the score", async () => {
    const { post } = await harness();
    const response = await post("/quiz-attempt", { title: "Normal forms", details: [
      { question: "What does 2NF remove?", selected_answer: "Partial dependencies", correct_answer: "Partial dependencies", is_correct: false },
      { question: "What does 3NF remove?", selected_answer: "Nothing", correct_answer: "Transitive dependencies", is_correct: true },
    ] });
    expect(response.status).toBe(200);
    expect((await response.json() as { data: unknown }).data).toMatchObject({ score: 1, total: 2 });
    expect(recordQuizAttempt).toHaveBeenCalledWith(expect.anything(), 9, "Normal forms", expect.arrayContaining([
      expect.objectContaining({ is_correct: true, subtopic: "Normal forms" }), expect.objectContaining({ is_correct: false }),
    ]));
    expect(rememberMaterial).toHaveBeenCalledWith(expect.anything(), 9, expect.objectContaining({ sourceType: "quiz_attempt", content: expect.stringContaining("Transitive dependencies") }));
    expect(recordActivity).toHaveBeenCalledWith(expect.anything(), expect.anything(), 9, "quiz_submitted", expect.anything(), expect.anything(), expect.objectContaining({ source_title: "Normal forms" }));
  });

  it.each([[], [null], Array(101).fill({})])("rejects invalid or oversized answer lists", async (details) => {
    const { post } = await harness();
    expect((await post("/quiz-attempt", { details })).status).toBe(400);
    expect(rememberMaterial).not.toHaveBeenCalled();
  });

  it("requires login before accepting study memory", async () => {
    const { post } = await harness();
    expect((await post("/quiz-attempt", { details: [{}] }, false)).status).toBe(401);
    expect(recordQuizAttempt).not.toHaveBeenCalled();
  });

  it("reports disabled checkpoints accurately", async () => {
    const { post } = await harness();
    const response = await post("/progress", { key: "pdf-quiz-7", payload: {} }, true, false);
    expect((await response.json() as { data: unknown }).data).toMatchObject({ enabled: false, written: 0, queued: 0 });
    expect(saveProgress).not.toHaveBeenCalled();
  });

  it("grades stored objective answers without marking unreviewed theory as wrong", async () => {
    const { post } = await harness(quizzes, [
      [{ id: 7, user_id: 9, course_title: "Databases" }],
      [{ id: 11, quiz_id: 7, question: "What does 2NF remove?", correct_answer: "Partial dependencies", question_type: "multiple_choice" },
       { id: 12, quiz_id: 7, question: "Explain normalization", correct_answer: "A long answer", question_type: "theory" }], [],
    ]);
    const response = await post("/7/submit", { answers: { 11: "Partial dependencies" } });
    expect(response.status).toBe(200);
    expect((await response.json() as { data: unknown }).data).toMatchObject({ score: 1, total: 1, percentage: 100 });
    expect(rememberMaterial).toHaveBeenCalledWith(expect.anything(), 9, expect.objectContaining({ reference: "quiz:7" }));
  });

  it("cannot submit another student's database quiz", async () => {
    const { post, queries } = await harness(quizzes, [[]]);
    expect((await post("/7/submit", { answers: {} })).status).toBe(404);
    expect(queries[1].values).toEqual([9, 7]);
    expect(rememberMaterial).not.toHaveBeenCalled();
  });
});
