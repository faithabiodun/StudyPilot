// Port of apps/memory/views.py.

import { Hono } from "hono";
import { failure, readJson, success } from "../http";
import { requireUser, type AppEnv } from "../auth/users";
import { cleanSafeString } from "../lib/text";
import { resumePoints, saveProgress, studyHistory, weaknessBriefing } from "../memory/services";
import { background } from "../runtime";

const memory = new Hono<AppEnv>({ strict: false });
memory.use("*", requireUser);

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
  // The student is mid-quiz and should not wait on a Walrus write, so the
  // response returns at once and the write finishes in the background. It
  // reports "queued" rather than claiming a write that has not happened yet.
  await background(c as never, saveProgress(c.env, userId, key, label, payload, state));
  return success("Progress queued", { enabled: true, written: 0, queued: 1, error: "" });
});

export default memory;
