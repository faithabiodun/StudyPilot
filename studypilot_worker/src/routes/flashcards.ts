// Port of apps/flashcards/views.py.

import { Hono } from "hono";
import type { Sql } from "../db";
import { Validator, countChoice, difficultyChoice, failure, notFound, readJson, str, success, toInt } from "../http";
import { requireUser, type AppEnv } from "../auth/users";
import { generateFlashcards } from "../lib/ai";
import { deduplicateFlashcards } from "../lib/dedup";
import { cleanExtractedText, cleanSafeString } from "../lib/text";
import { charField } from "../lib/fields";
import { rememberMaterial } from "../memory/services";
import { recordActivity } from "../services/activity";
import { aiFailure, documentContexts, generateWithRetry } from "../services/generation";
import { ownedDocument } from "./documents";

async function decksWithCards(sql: Sql, userId: number, deckId?: number) {
  const decks = deckId
    ? await sql`select * from flashcards_flashcarddeck where user_id = ${userId} and id = ${deckId}`
    : await sql`select * from flashcards_flashcarddeck where user_id = ${userId} order by created_at desc`;
  if (!decks.length) return [];
  const ids = decks.map((d) => d.id as number);
  const cards = await sql`
    select id, deck_id, question, answer, created_at from flashcards_flashcard
    where deck_id in ${sql(ids)} order by id
  `;
  return decks.map((deck) => {
    const own = cards
      .filter((card) => card.deck_id === deck.id)
      .map((card) => ({ id: card.id, question: card.question, answer: card.answer, created_at: card.created_at }));
    return {
      id: deck.id,
      document: deck.document_id,
      course_title: deck.course_title,
      title: deck.title,
      description: deck.description,
      card_count: own.length,
      cards: own,
      created_at: deck.created_at,
      updated_at: deck.updated_at,
    };
  });
}

const flashcards = new Hono<AppEnv>({ strict: false });
flashcards.use("*", requireUser);

flashcards.get("/decks", async (c) => {
  return success("Flashcard decks fetched", await decksWithCards(c.get("sql"), c.get("user").id));
});

flashcards.post("/decks", async (c) => {
  const sql = c.get("sql");
  const user = c.get("user");
  const body = await readJson(c.req.raw);
  const v = new Validator();
  const title = body.title === undefined ? (v.add("title", "This field is required."), undefined) : charField(v, "title", body.title, { maxLength: 180 });
  const courseTitle = body.course_title === undefined ? "" : charField(v, "course_title", body.course_title, { maxLength: 180, allowBlank: true });
  const description = body.description === undefined ? "" : charField(v, "description", body.description, { maxLength: 100000, allowBlank: true });
  let documentId: number | null = null;
  if (body.document !== undefined && body.document !== null) {
    documentId = toInt(body.document);
    const exists = documentId === null ? [] : await sql`select 1 from documents_document where id = ${documentId}`;
    if (!exists.length) v.add("document", `Invalid pk "${str(body.document)}" - object does not exist.`);
  }
  if (!v.ok) return failure("Flashcard deck creation failed", v.errors);
  const now = new Date();
  const [deck] = await sql`
    insert into flashcards_flashcarddeck (user_id, document_id, course_title, title, description, created_at, updated_at)
    values (${user.id}, ${documentId}, ${courseTitle ?? ""}, ${title!}, ${description ?? ""}, ${now}, ${now})
    returning id
  `;
  const [created] = await decksWithCards(sql, user.id, deck.id as number);
  return success("Flashcard deck created", created, 201);
});

flashcards.get("/decks/:id{[0-9]+}", async (c) => {
  const [deck] = await decksWithCards(c.get("sql"), c.get("user").id, Number(c.req.param("id")));
  if (!deck) throw notFound("FlashcardDeck");
  return success("Flashcard deck fetched", deck);
});

flashcards.delete("/decks/:id{[0-9]+}", async (c) => {
  const sql = c.get("sql");
  const id = Number(c.req.param("id"));
  const [deck] = await sql`select id from flashcards_flashcarddeck where id = ${id} and user_id = ${c.get("user").id}`;
  if (!deck) throw notFound("FlashcardDeck");
  await sql.begin(async (tx) => {
    await tx`delete from flashcards_flashcard where deck_id = ${id}`;
    await tx`delete from flashcards_flashcarddeck where id = ${id}`;
  });
  return success("Flashcard deck deleted");
});

flashcards.post("/generate", async (c) => {
  const sql = c.get("sql");
  const user = c.get("user");
  const body = await readJson(c.req.raw);
  const v = new Validator();
  const documentId = toInt(body.document_id);
  if (documentId === null) v.add("document_id", body.document_id === undefined ? "This field is required." : "A valid integer is required.");
  const requested = countChoice(v, "number_of_cards", body.number_of_cards);
  const difficulty = difficultyChoice(v, body.difficulty);
  if (!v.ok) return failure("Flashcard generation failed", v.errors);

  const doc = await ownedDocument(sql, user.id, documentId!);
  const [contextRow] = await sql`select study_context, study_context_retry from documents_document where id = ${documentId!}`;
  if (!str(doc.focused_extracted_text) && !str(doc.extracted_text)) {
    return failure("This document has no extracted text.", {}, 400);
  }
  const sourceTitle = cleanSafeString(str(body.course_title) || str(doc.title) || str(doc.original_filename), "Uploaded PDF", 180);

  let cards;
  try {
    cards = await generateWithRetry(
      documentContexts(c.env, { ...doc, ...contextRow }),
      requested,
      (context) => generateFlashcards(c.env, context, difficulty, requested),
      (items, limit) => deduplicateFlashcards(items, limit),
      "flashcards",
    );
  } catch (error) {
    return aiFailure(error, "Flashcard generation failed.");
  }
  const clean = cards
    .map((card) => ({ question: cleanExtractedText(card.question), answer: cleanExtractedText(card.answer) }))
    .filter((card) => card.question && card.answer);
  if (!clean.length) return failure("Not enough clean text was found to generate questions.", {}, 400);

  const now = new Date();
  const deckId = await sql.begin(async (tx) => {
    const [deck] = await tx`
      insert into flashcards_flashcarddeck (user_id, document_id, course_title, title, description, created_at, updated_at)
      values (${user.id}, ${doc.id as number}, ${sourceTitle}, ${`${sourceTitle} Flashcards`.slice(0, 180)},
              ${`Generated from ${doc.title}.`}, ${now}, ${now})
      returning id
    `;
    await tx`insert into flashcards_flashcard ${tx(clean.map((card) => ({ ...card, deck_id: deck.id, created_at: now })) as never)}`;
    return deck.id as number;
  });
  const [deck] = await decksWithCards(sql, user.id, deckId);

  await recordActivity(c.env, sql, user.id, "flashcards_generated", "Generated Flashcards", `You generated ${deck.card_count} flashcards from ${doc.title}.`, {
    document_id: doc.id,
    deck_id: deck.id,
    count: deck.card_count,
  });
  await rememberMaterial(c.env, user.id, {
    sourceType: "flashcards",
    title: `${deck.course_title || doc.title} flashcard deck`,
    summary: `${deck.card_count} cards from ${doc.title}`,
  });
  const message =
    deck.card_count < requested
      ? "StudyPilot generated the strongest unique questions available from this PDF."
      : "Flashcards generated successfully";
  return success(message, deck, 201);
});

export default flashcards;
