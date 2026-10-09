import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Frontend services are JavaScript.
import { rememberQuizCompletion } from "../../studypilot/src/services/memoryService.js";
// @ts-expect-error Frontend services are JavaScript.
import { fetchQuiz } from "../../studypilot/src/services/quizService.js";

afterEach(() => vi.unstubAllGlobals());
function network() {
  vi.stubGlobal("localStorage", { getItem: () => "student-access" });
  const fetch = vi.fn(async () => Response.json({ success: true, data: { id: 7, questions: [] } }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("browser study memory contracts", () => {
  const detail = { question_id: 11, question: "What is 2NF?", selected_answer: "Remove partial dependencies", correct_answer: "Remove partial dependencies" };
  it("submits database quiz answers for server grading without trusting browser scores", async () => {
    const fetch = network();
    await rememberQuizCompletion({ title: "Databases", quizId: 7, details: [detail] });
    expect(fetch.mock.calls[0]).toEqual(["/api/quizzes/7/submit/", expect.objectContaining({
      method: "POST", headers: expect.objectContaining({ Authorization: "Bearer student-access" }),
      body: JSON.stringify({ answers: { 11: detail.selected_answer } }),
    })]);
  });
  it("captures a generated YouTube quiz without a database quiz ID", async () => {
    const fetch = network();
    await rememberQuizCompletion({ title: "YouTube lecture", details: [detail] });
    expect(fetch.mock.calls[0]).toEqual(["/api/memory/quiz-attempt/", expect.objectContaining({
      method: "POST", body: JSON.stringify({ title: "YouTube lecture", details: [detail] }),
    })]);
  });
  it("reopens the stored quiz for resume instead of generating new questions", async () => {
    const fetch = network();
    const result = await fetchQuiz(7);
    expect(result.data.id).toBe(7);
    expect(fetch.mock.calls[0]).toEqual(["/api/quizzes/7/", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer student-access" }) })]);
  });
});
