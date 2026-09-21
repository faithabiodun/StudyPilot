// Port of apps/documents/views.py.
//
// The one real change: the PDF is read in the browser, not here. Workers have
// no PyMuPDF and the free plan's ~10ms CPU budget cannot parse a 50-page PDF,
// so the frontend extracts the text with pdf.js (same page and character caps,
// same focus range) and uploads that. No file ever reaches the server, which the
// old flow only approximated by deleting the temp file after extraction.

import { Hono } from "hono";
import type { Sql } from "../db";
import { intVar } from "../env";
import { failure, notFound, readJson, str, success, toInt } from "../http";
import { requireUser, type AppEnv } from "../auth/users";
import { cleanSafeString, sanitizeCleanedText } from "../lib/text";
import { rememberMaterial } from "../memory/services";
import { recordActivity } from "../services/activity";

export function serializeDocument(doc: Record<string, unknown>) {
  const text = str(doc.extracted_text);
  const focused = str(doc.focused_extracted_text);
  return {
    id: doc.id,
    title: doc.title,
    original_filename: doc.original_filename,
    file: null,
    file_url: "",
    file_type: doc.file_type,
    file_size: doc.file_size,
    page_count: doc.page_count,
    total_page_count: doc.total_page_count,
    focused_start_page: doc.focused_start_page,
    focused_end_page: doc.focused_end_page,
    extracted_text: text,
    focused_extracted_text: focused,
    extracted_text_length: text.length,
    focused_extracted_text_length: focused.length,
    chunk_count: Number(doc.chunk_count ?? 0),
    status: doc.status,
    uploaded_at: doc.uploaded_at,
    updated_at: doc.updated_at,
  };
}

const DOCUMENT_COLUMNS = (sql: Sql) => sql`
  d.id, d.title, d.original_filename, d.file_type, d.file_size, d.page_count, d.total_page_count,
  d.focused_start_page, d.focused_end_page, d.extracted_text, d.focused_extracted_text, d.status,
  d.uploaded_at, d.updated_at,
  (select count(*) from documents_documentchunk c where c.document_id = d.id) as chunk_count
`;

export async function ownedDocument(sql: Sql, userId: number, id: number) {
  const [doc] = await sql`select ${DOCUMENT_COLUMNS(sql)} from documents_document d where d.id = ${id} and d.user_id = ${userId}`;
  if (!doc) throw notFound("Document");
  return doc;
}

const documents = new Hono<AppEnv>({ strict: false });
documents.use("*", requireUser);

documents.get("/", async (c) => {
  const sql = c.get("sql");
  const rows = await sql`
    select ${DOCUMENT_COLUMNS(sql)} from documents_document d
    where d.user_id = ${c.get("user").id} order by d.uploaded_at desc
  `;
  return success("Documents fetched", rows.map(serializeDocument));
});

documents.post("/upload", async (c) => {
  const started = Date.now();
  const sql = c.get("sql");
  const user = c.get("user");
  const body = await readJson(c.req.raw);
  const maxChars = intVar(c.env.MAX_EXTRACTED_TEXT_CHARS, 80000);

  const filename = cleanSafeString(body.original_filename, "uploaded.pdf", 255);
  if (!filename.toLowerCase().endsWith(".pdf")) {
    return failure("Upload failed", { file: ["Only readable PDF files are supported by PDF Study Converter."] });
  }
  // The browser cleaned the text with the same cleanExtractedText; the server
  // still enforces the caps and strips what Postgres cannot store.
  const text = sanitizeCleanedText(body.text, maxChars);
  let focused = sanitizeCleanedText(body.focused_text, maxChars) || text;
  if (focused.length < 400) focused = text;
  if (!text) {
    return failure(
      "StudyPilot could not extract readable text from this PDF.",
      { file: "StudyPilot could not extract readable text from this PDF." },
      400,
    );
  }

  const stem = filename.replace(/\.[^.]+$/, "") || "Uploaded PDF";
  const title = cleanSafeString(str(body.title) || stem, stem, 255);
  const pageCount = toInt(body.page_count);
  const now = new Date();
  const [doc] = await sql`
    insert into documents_document ${sql({
      user_id: user.id,
      title,
      original_filename: filename,
      file: "",
      file_type: "pdf",
      file_size: Math.max(0, toInt(body.file_size) ?? 0),
      page_count: pageCount,
      total_page_count: toInt(body.total_page_count) ?? pageCount,
      focused_start_page: toInt(body.focused_start_page),
      focused_end_page: toInt(body.focused_end_page),
      extracted_text: text,
      focused_extracted_text: focused,
      study_context: sanitizeCleanedText(body.study_context, maxChars),
      study_context_retry: sanitizeCleanedText(body.study_context_retry, maxChars),
      status: "processed",
      uploaded_at: now,
      updated_at: now,
    } as never)}
    returning id, title, original_filename, file_size, file_type, page_count, total_page_count,
      focused_start_page, focused_end_page, status, uploaded_at
  `;

  await recordActivity(c.env, sql, user.id, "pdf_uploaded", "Uploaded PDF", `You uploaded ${doc.original_filename}.`, {
    document_id: doc.id,
    filename: doc.original_filename,
  });
  // Remember what was studied so the advisor can refer back to it later.
  await rememberMaterial(c.env, user.id, {
    sourceType: "pdf",
    title: str(doc.title) || str(doc.original_filename),
    summary: cleanSafeString(text, "", 220),
  });

  const limited = Boolean(body.extraction_limited);
  return success(
    "PDF processed successfully",
    {
      id: doc.id,
      title: doc.title,
      original_filename: doc.original_filename,
      file_size: doc.file_size,
      file_type: doc.file_type,
      page_count: doc.page_count,
      total_page_count: doc.total_page_count || doc.page_count,
      focused_start_page: doc.focused_start_page,
      focused_end_page: doc.focused_end_page,
      status: doc.status,
      extracted_text_length: text.length,
      focused_extracted_text_length: focused.length,
      chunk_count: 0,
      processing_time_seconds: Math.round((Date.now() - started) / 10) / 100,
      extraction_limited: limited,
      notice: limited ? "This PDF is large, so StudyPilot extracted the most useful readable sections for faster study generation." : "",
      uploaded_at: doc.uploaded_at,
    },
    201,
  );
});

// Temp files no longer exist, so there is never anything to clean up. Kept so
// the frontend's call still succeeds.
documents.post("/cleanup-temp", (c) => success("Temporary PDF files cleaned up", { deleted_files: 0 }));

documents.get("/:id{[0-9]+}", async (c) => {
  const doc = await ownedDocument(c.get("sql"), c.get("user").id, Number(c.req.param("id")));
  return success("Document fetched", serializeDocument(doc));
});

documents.delete("/:id{[0-9]+}", async (c) => {
  const sql = c.get("sql");
  const doc = await ownedDocument(sql, c.get("user").id, Number(c.req.param("id")));
  await sql.begin(async (tx) => {
    // Django's on_delete: chunks cascade, decks and quizzes keep going with no document.
    await tx`delete from documents_documentchunk where document_id = ${doc.id as number}`;
    await tx`update flashcards_flashcarddeck set document_id = null where document_id = ${doc.id as number}`;
    await tx`update quizzes_quiz set document_id = null where document_id = ${doc.id as number}`;
    await tx`delete from documents_document where id = ${doc.id as number}`;
  });
  return success("Document deleted");
});

// Extraction now happens in the browser at upload time, so re-extracting on the
// server has nothing to read. A stored document already carries its text.
documents.post("/:id{[0-9]+}/extract-text", async (c) => {
  const doc = await ownedDocument(c.get("sql"), c.get("user").id, Number(c.req.param("id")));
  if (!str(doc.extracted_text)) return failure("Text extraction failed", {}, 400);
  return success("Text extraction completed", serializeDocument(doc));
});

export default documents;
