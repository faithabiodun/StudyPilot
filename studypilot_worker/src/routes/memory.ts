// Port of apps/memory/views.py.

import { Hono } from "hono";
import { failure, readJson, success } from "../http";
import { requireUser, type AppEnv } from "../auth/users";
import { cleanSafeString } from "../lib/text";
import { memwalEnabled, recordQuizAttempt, rememberMaterial, recentStudyMemories, resumePoints, saveProgress, studyHistory, weaknessBriefing } from "../memory/services";
import { recordActivity } from "../services/activity";
import { background } from "../runtime";

const memory = new Hono<AppEnv>({ strict: false });
memory.use("*", requireUser);
memory.get("/recent", async (c) => success("Recent study memory", await recentStudyMemories(c.env, c.get("user").id)));

/** Days studied, read back out of Walrus rather than the local database. */
memory.get("/history", async (c) => success("Study history", await studyHistory(c.env, c.get("user").id)));

/**
 * What this student keeps getting wrong, ranked. `truncated` and
 * `unparsed_records` are in the payload on purpose: the first says the ranking
 * is over a sample, the second turns record format drift into a visible number.
 */
memory.get("/briefing", async (c) =>
  success("Weakness briefing", await weaknessBriefing(c.env, c.get("user").id, c.req.query("course") || "")),
);

/** Work the student left unfinished, so a closed tab is not lost work. */
memory.get("/resume", async (c) => success("Resume points", await resumePoints(c.env, c.get("user").id)));

/** YouTube quizzes are generated in the browser and have no database quiz ID. */
memory.post("/quiz-attempt", async (c) => {
  const body = await readJson(c.req.raw);
  if (!Array.isArray(body.details) || !body.details.length || body.details.length > 100) {
    return failure("Quiz answers must be a list of 1 to 100 items.");
  }
  const title = cleanSafeString(body.title, "YouTube quiz", 220);
  const details = [];
  for (const value of body.details) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return failure("Invalid quiz answer.");
    const selected = cleanSafeString(value.selected_answer, "", 500);
    const correct = cleanSafeString(value.correct_answer, "", 500);
    details.push({ question: cleanSafeString(value.question, "", 1500),
      subtopic: cleanSafeString(value.subtopic || title, "", 120), selected_answer: selected,
      correct_answer: correct, is_correct: Boolean(selected && selected === correct) });
  }
  const userId = c.get("user").id;
  const correct = details.filter((detail) => detail.is_correct).length;
  const memory = await recordQuizAttempt(c.env, userId, title, details);
  await rememberMaterial(c.env, userId, { sourceType: "quiz_attempt", title: `${title} results`, topic: title,
    summary: `Scored ${correct} of ${details.length} objective questions.`, content: JSON.stringify(details) });
  await recordActivity(c.env, c.get("sql"), userId, "quiz_submitted", "Completed Quiz", `You scored ${correct} of ${details.length} on ${title}.`,
    { source_title: title, score: correct, total: details.length });
  return success("Quiz attempt remembered", { score: correct, total: details.length, memory });
});

/**
 * Checkpoint an in-flight quiz or deck. Called as the student answers, so it
 * must stay cheap and never fail the interaction.
 */
memory.post("/progress", async (c) => {
  const body = await readJson(c.req.raw);
  const key = cleanSafeString(body.key, "", 120);
  if (!key) return failure("A progress key is required.", {}, 400);
  const label = cleanSafeString(body.label, "Unfinished activity", 180);
  const payload = body.payload ?? {};
  if (typeof payload !== "object" || Array.isArray(payload) || payload === null) {
    return failure("Progress payload must be an object.", {}, 400);
  }
  const state = body.done ? "done" : "active";
  const userId = c.get("user").id;
  if (!memwalEnabled(c.env)) return success("Persistent memory is not configured", { enabled: false, written: 0, queued: 0, error: "" });
  // The student is mid-quiz and should not wait on a Walrus write, so the
  // response returns at once and the write finishes in the background. It
  // reports "queued" rather than claiming a write that has not happened yet.
  await background(c as never, saveProgress(c.env, userId, key, label, payload, state));
  return success("Progress queued", { enabled: true, written: 0, queued: 1, error: "" });
});

export default memory;
