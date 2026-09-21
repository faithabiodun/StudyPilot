// Port of apps/advisor/views.py.

import { Hono } from "hono";
import type { Sql } from "../db";
import { failure, notFound, readJson, str, success, toInt } from "../http";
import { requireUser, type AppEnv } from "../auth/users";
import { AINotConfigured, AIServiceError } from "../lib/ai";
import { recordActivity } from "../services/activity";
import { generateAdvisorResponse } from "../services/advisor";

async function sessionsWithMessages(sql: Sql, userId: number, sessionId?: number) {
  const sessions = sessionId
    ? await sql`select * from advisor_chatsession where user_id = ${userId} and id = ${sessionId}`
    : await sql`select * from advisor_chatsession where user_id = ${userId} order by updated_at desc`;
  if (!sessions.length) return [];
  const messages = await sql`
    select id, session_id, sender, message, created_at from advisor_chatmessage
    where session_id in ${sql(sessions.map((s) => s.id as number))} order by created_at, id
  `;
  return sessions.map((session) => ({
    id: session.id,
    title: session.title,
    messages: messages
      .filter((m) => m.session_id === session.id)
      .map((m) => ({ id: m.id, sender: m.sender, message: m.message, created_at: m.created_at })),
    created_at: session.created_at,
    updated_at: session.updated_at,
  }));
}

const advisor = new Hono<AppEnv>({ strict: false });
advisor.use("*", requireUser);

advisor.get("/sessions", async (c) => success("Chat sessions fetched", await sessionsWithMessages(c.get("sql"), c.get("user").id)));

advisor.post("/sessions", async (c) => {
  const sql = c.get("sql");
  const body = await readJson(c.req.raw);
  const title = body.title === undefined ? "New academic chat" : str(body.title).trim();
  if (!title) return failure("Chat session creation failed", { title: ["This field may not be blank."] });
  if (title.length > 180) return failure("Chat session creation failed", { title: ["Ensure this field has no more than 180 characters."] });
  const now = new Date();
  const [session] = await sql`
    insert into advisor_chatsession (user_id, title, created_at, updated_at) values (${c.get("user").id}, ${title}, ${now}, ${now}) returning id
  `;
  const [created] = await sessionsWithMessages(sql, c.get("user").id, session.id as number);
  return success("Chat session created", created, 201);
});

advisor.get("/sessions/:id{[0-9]+}", async (c) => {
  const [session] = await sessionsWithMessages(c.get("sql"), c.get("user").id, Number(c.req.param("id")));
  if (!session) throw notFound("ChatSession");
  return success("Chat session fetched", session);
});

advisor.post("/chat", async (c) => {
  const sql = c.get("sql");
  const user = c.get("user");
  const body = await readJson(c.req.raw);
  const message = str(body.message).trim();
  if (!message) {
    return failure("Chat request failed", { message: [body.message === undefined ? "This field is required." : "This field may not be blank."] });
  }
  const sessionId = body.session_id === undefined || body.session_id === null ? null : toInt(body.session_id);
  const documentId = body.document_id === undefined || body.document_id === null ? null : toInt(body.document_id);

  let session: { id: number };
  const now = new Date();
  if (sessionId) {
    const [found] = await sql`select id from advisor_chatsession where id = ${sessionId} and user_id = ${user.id}`;
    if (!found) throw notFound("ChatSession");
    session = { id: found.id as number };
  } else {
    const [created] = await sql`
      insert into advisor_chatsession (user_id, title, created_at, updated_at) values (${user.id}, ${message.slice(0, 80)}, ${now}, ${now}) returning id
    `;
    session = { id: created.id as number };
  }

  const [userMessage] = await sql`
    insert into advisor_chatmessage (session_id, sender, message, created_at) values (${session.id}, 'user', ${message}, ${now}) returning id
  `;
  let advisorData;
  try {
    advisorData = await generateAdvisorResponse(c.env, sql, user, message, documentId);
  } catch (error) {
    if (error instanceof AINotConfigured) return failure(error.message, {}, 500);
    if (error instanceof AIServiceError) return failure("Advisor service failed to generate a response.", {}, 502);
    console.warn(`Advisor failed: ${error instanceof Error ? error.message : error}`);
    return failure("Advisor service failed to generate a response.", {}, 502);
  }
  const replyAt = new Date();
  const [assistantMessage] = await sql`
    insert into advisor_chatmessage (session_id, sender, message, created_at)
    values (${session.id}, 'assistant', ${advisorData.response}, ${replyAt}) returning id
  `;
  await sql`update advisor_chatsession set updated_at = ${replyAt} where id = ${session.id}`;
  await recordActivity(c.env, sql, user.id, "advisor_question", "Asked AI Advisor", `You asked: ${message.slice(0, 120)}`, { session_id: session.id });
  return success("Advisor response generated successfully", {
    ...advisorData,
    session_id: session.id,
    user_message_id: userMessage.id,
    assistant_message_id: assistantMessage.id,
  });
});

export default advisor;
