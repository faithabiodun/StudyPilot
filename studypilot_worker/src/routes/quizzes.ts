// Port of apps/quizzes/views.py.

import { Hono } from "hono";
import type { Sql } from "../db";
import { Validator, countChoice, difficultyChoice, failure, notFound, readJson, str, success, toInt } from "../http";
import { requireUser, type AppEnv } from "../auth/users";
import { generateMcqs, generateMixedQuiz } from "../lib/ai";
import { deduplicateQuestions, type Question } from "../lib/dedup";
import { cleanExtractedText, cleanSafeString } from "../lib/text";
import { slugifyTopic } from "../memory/records";
import { generationFocus, recordQuizAttempt, rememberMaterial, weaknessBriefing } from "../memory/services";
import { recordActivity } from "../services/activity";
import { aiFailure, documentContexts, generateWithRetry } from "../services/generation";
import { ownedDocument } from "./documents";

export const QUESTION_TYPES = ["multiple_choice", "true_false", "short_answer", "theory"];

export async function quizzesWithQuestions(sql: Sql, userId: number, quizId?: number) {
  const quizzes = quizId
    ? await sql`select * from quizzes_quiz where user_id = ${userId} and id = ${quizId}`
    : await sql`select * from quizzes_quiz where user_id = ${userId} order by created_at desc`;
  if (!quizzes.length) return [];
  const quizIds = quizzes.map((q) => q.id as number);
  const questions = await sql`select * from quizzes_quizquestion where quiz_id in ${sql(quizIds)} order by id`;
  const questionIds = questions.map((q) => q.id as number);
  const options = questionIds.length
    ? await sql`select id, question_id, option_text, is_correct from quizzes_quizoption where question_id in ${sql(questionIds)} order by id`
    : [];
  return quizzes.map((quiz) => ({
    id: quiz.id,
    document: quiz.document_id,
    course_title: quiz.course_title,
    difficulty: quiz.difficulty,
    question_type: quiz.question_type,
    number_of_questions: quiz.number_of_questions,
    questions: questions
      .filter((q) => q.quiz_id === quiz.id)
      .map((q) => ({
        id: q.id,
        question: q.question,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        question_type: q.question_type,
        subtopic: q.subtopic,
        options: options
          .filter((o) => o.question_id === q.id)
          .map((o) => ({ id: o.id, option_text: o.option_text, is_correct: o.is_correct })),
      })),
    created_at: quiz.created_at,
  }));
}

async function saveQuiz(
  sql: Sql,
  fields: { userId: number; documentId: number; courseTitle: string; difficulty: string; questionType: string; count: number },
  items: Question[],
  forceType?: string,
): Promise<number> {
  return sql.begin(async (tx) => {
    const [quiz] = await tx`
      insert into quizzes_quiz (user_id, document_id, course_title, difficulty, question_type, number_of_questions, created_at)
      values (${fields.userId}, ${fields.documentId}, ${fields.courseTitle}, ${fields.difficulty}, ${fields.questionType}, ${fields.count}, ${new Date()})
      returning id
    `;
    if (!items.length) return quiz.id as number;
    // One insert for every question and one for every option, rather than two
    // round trips per question from the edge to the database. Identity values
    // are assigned in VALUES order within a statement, so sorting the returned
    // ids lines them back up with `items`.
    const rows = items.map((item) => ({
      quiz_id: quiz.id,
      question: cleanExtractedText(item.question),
      correct_answer: cleanSafeString(item.correct_answer, "", 255),
      explanation: cleanExtractedText(item.explanation),
      question_type: forceType ?? cleanSafeString(item.question_type || "multiple_choice", "multiple_choice", 40),
      subtopic: slugifyTopic(item.subtopic || ""),
    }));
    const inserted = await tx`insert into quizzes_quizquestion ${tx(rows as never)} returning id`;
    const ids = inserted.map((row) => row.id as number).sort((a, b) => a - b);
    const options = items.flatMap((item, index) =>
      (item.options || [])
        .map((o) => ({ option_text: cleanSafeString(o.option_text, "", 240), is_correct: Boolean(o.is_correct), question_id: ids[index] }))
        .filter((o) => o.option_text),
    );
    if (options.length) await tx`insert into quizzes_quizoption ${tx(options as never)}`;
    return quiz.id as number;
  });
}

function questionTypesOf(v: Validator, value: unknown): string[] {
  if (value === undefined) return ["multiple_choice"];
  if (!Array.isArray(value)) {
    v.add("question_types", `Expected a list of items but got type "${typeof value}".`);
    return [];
  }
  const cleaned = value.filter((item) => typeof item === "string" && QUESTION_TYPES.includes(item)) as string[];
  if (!cleaned.length) v.add("question_types", "Choose at least one supported question type.");
  return cleaned;
}

const quizzes = new Hono<AppEnv>({ strict: false });
quizzes.use("*", requireUser);

quizzes.get("/", async (c) => success("Quizzes fetched", await quizzesWithQuestions(c.get("sql"), c.get("user").id)));

async function loadDocument(c: { get: (k: "sql") => Sql }, userId: number, documentId: number) {
  const sql = c.get("sql");
  const doc = await ownedDocument(sql, userId, documentId);
  const [contexts] = await sql`select study_context, study_context_retry from documents_document where id = ${documentId}`;
  return { ...doc, ...contexts };
}

quizzes.post("/generate", async (c) => {
  const sql = c.get("sql");
  const user = c.get("user");
  const body = await readJson(c.req.raw);
  const v = new Validator();
  const difficulty = difficultyChoice(v, body.difficulty);
  const questionTypes = questionTypesOf(v, body.question_types);
  const requested = countChoice(v, "number_of_questions", body.number_of_questions);
  const documentId = toInt(body.document_id);
  if (documentId === null) v.add("document_id", body.document_id === undefined ? "This field is required." : "A valid integer is required.");
  if (!v.ok) return failure("Quiz generation failed", v.errors);

  const doc = await loadDocument(c, user.id, documentId!);
  if (!str(doc.focused_extracted_text) && !str(doc.extracted_text)) return failure("This document has no extracted text.", {}, 400);
  const sourceTitle = cleanSafeString(str(body.course_title) || str(doc.title) || str(doc.original_filename), "Uploaded PDF", 180);

  let questions: Question[];
  try {
    // Stop generating quizzes about a PDF and start generating quizzes about
    // what this student keeps getting wrong in that PDF.
    const focus = generationFocus(await weaknessBriefing(c.env, user.id, sourceTitle));
    questions = await generateWithRetry(
      documentContexts(c.env, doc),
      requested,
      (context) => generateMixedQuiz(c.env, context, difficulty, requested, questionTypes, focus),
      (items, limit) => deduplicateQuestions(items, limit),
      "questions",
    );
  } catch (error) {
    return aiFailure(error, "Quiz generation failed.");
  }
  if (!questions.length) return failure("Not enough clean text was found to generate questions.", {}, 400);

  const quizId = await saveQuiz(
    sql,
    { userId: user.id, documentId: doc.id as number, courseTitle: sourceTitle, difficulty, questionType: questionTypes.join(","), count: requested },
    questions,
  );
  const [quiz] = await quizzesWithQuestions(sql, user.id, quizId);
  const count = quiz.questions.length;
  await recordActivity(c.env, sql, user.id, "mixed_quiz_generated", "Generated Mixed Quiz", `You generated ${count} mixed quiz questions from ${doc.title}.`, {
    document_id: doc.id,
    quiz_id: quizId,
    count,
  });
  await rememberMaterial(c.env, user.id, {
    sourceType: "quiz",
    title: `${sourceTitle} mixed quiz (${count} questions)`,
    topic: sourceTitle,
    summary: `generated from ${doc.title}`,
  });
  const message = count < requested ? "StudyPilot generated the strongest unique questions available from this PDF." : "Mixed quiz generated successfully";
  return success(message, quiz, 201);
});

quizzes.post("/generate-mcq", async (c) => {
  const sql = c.get("sql");
  const user = c.get("user");
  const body = await readJson(c.req.raw);
  const v = new Validator();
  const documentId = toInt(body.document_id);
  if (documentId === null) v.add("document_id", body.document_id === undefined ? "This field is required." : "A valid integer is required.");
  const difficulty = difficultyChoice(v, body.difficulty);
  const requested = countChoice(v, "number_of_questions", body.number_of_questions);
  if (!v.ok) return failure("MCQ generation failed", v.errors);

  const doc = await loadDocument(c, user.id, documentId!);
  if (!str(doc.focused_extracted_text) && !str(doc.extracted_text)) return failure("This document has no extracted text.", {}, 400);
  const sourceTitle = cleanSafeString(str(body.course_title) || str(doc.title) || str(doc.original_filename), "Uploaded PDF", 180);

  let mcqs: Question[];
  try {
    mcqs = await generateWithRetry(
      documentContexts(c.env, doc),
      requested,
      (context) => generateMcqs(c.env, context, difficulty, requested),
      (items, limit) => deduplicateQuestions(items, limit, true),
      "mcqs",
    );
  } catch (error) {
    return aiFailure(error, "MCQ generation failed.");
  }
  if (!mcqs.length) return failure("Not enough clean text was found to generate questions.", {}, 400);

  const quizId = await saveQuiz(
    sql,
    { userId: user.id, documentId: doc.id as number, courseTitle: sourceTitle, difficulty, questionType: "multiple_choice", count: requested },
    mcqs,
    "multiple_choice",
  );
  const [quiz] = await quizzesWithQuestions(sql, user.id, quizId);
  const count = quiz.questions.length;
  await recordActivity(c.env, sql, user.id, "mcq_quiz_generated", "Generated MCQ Quiz", `You generated ${count} MCQs from ${doc.title}.`, {
    document_id: doc.id,
    quiz_id: quizId,
    count,
  });
  await rememberMaterial(c.env, user.id, {
    sourceType: "mcq",
    title: `${sourceTitle} MCQ quiz (${count} questions)`,
    topic: sourceTitle,
    summary: `generated from ${doc.title}`,
  });
  const message = count < requested ? "StudyPilot generated the strongest unique questions available from this PDF." : "MCQ quiz generated successfully";
  return success(message, quiz, 201);
});

quizzes.get("/:id{[0-9]+}", async (c) => {
  const [quiz] = await quizzesWithQuestions(c.get("sql"), c.get("user").id, Number(c.req.param("id")));
  if (!quiz) throw notFound("Quiz");
  return success("Quiz fetched", quiz);
});

quizzes.post("/:id{[0-9]+}/submit", async (c) => {
  const sql = c.get("sql");
  const user = c.get("user");
  const [quiz] = await quizzesWithQuestions(sql, user.id, Number(c.req.param("id")));
  if (!quiz) throw notFound("Quiz");
  const body = await readJson(c.req.raw);
  const answers = body.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return failure("Quiz submission failed", {
      answers: [answers === undefined ? "This field is required." : `Expected a dictionary of items but got type "${Array.isArray(answers) ? "list" : typeof answers}".`],
    });
  }
  const map = answers as Record<string, unknown>;

  let correct = 0;
  const details = quiz.questions.map((question) => {
    const raw = map[String(question.id)];
    const selected = raw === undefined || raw === null ? "" : String(raw);
    const isCorrect = selected === question.correct_answer;
    if (isCorrect) correct += 1;
    return {
      question_id: question.id,
      question: question.question,
      subtopic: question.subtopic,
      selected_answer: selected,
      correct_answer: question.correct_answer,
      is_correct: isCorrect,
      explanation: question.explanation,
    };
  });
  const total = details.length;

  // Persist what was answered, not just what was asked. Never throws: a memory
  // outage must not stop a student seeing their score.
  const memory = await recordQuizAttempt(c.env, user.id, str(quiz.course_title), details as never);
  await recordActivity(c.env, sql, user.id, "quiz_submitted", "Submitted quiz", `You scored ${correct} of ${total} on ${quiz.course_title || "a quiz"}.`, {
    quiz_id: quiz.id,
    score: correct,
    total,
    memories_written: memory.written,
  });
  return success("Quiz submitted", {
    score: correct,
    total,
    percentage: total ? Math.round((correct / total) * 10000) / 100 : 0,
    details,
    memory,
  });
});

export default quizzes;
