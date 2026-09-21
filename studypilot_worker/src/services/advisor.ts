// Port of apps/advisor/services.py and the keyword retrieval in
// apps/documents/rag.py.
//
// Django only served the canned fallback answers with DEBUG on; in production a
// DeepSeek failure was a 502. The Worker is always production, so it keeps the
// 502 and drops the fallbacks.

import type { Sql } from "../db";
import type { Env } from "../env";
import { intVar } from "../env";
import type { User } from "../auth/users";
import { generateText } from "../lib/ai";
import { cleanExtractedText } from "../lib/text";
import { materialContext, misconceptionContext } from "../memory/services";
import { combinedRecommendations } from "./resources";

const RESOURCE_KEYWORDS = ["recommend", "resource", "resources", "youtube", "video", "videos", "textbook", "book", "books", "article", "articles", "link", "links", "tutorial", "material", "materials"];
const PDF_KEYWORDS = ["pdf", "document", "uploaded", "upload", "summarize", "summary", "key points", "questions from"];
const PLAN_KEYWORDS = ["study plan", "timetable", "schedule", "prepare", "preparation"];

const hasAny = (text: string, keywords: string[]) => keywords.some((k) => text.includes(k));

export function classifyIntent(message: string): string {
  const text = (message || "").toLowerCase();
  if (hasAny(text, PDF_KEYWORDS) || text.includes("from the pdf") || text.includes("my pdf") || text.includes("uploaded pdf")) return "pdf";
  if (hasAny(text, RESOURCE_KEYWORDS)) return "resources";
  if (hasAny(text, PLAN_KEYWORDS)) return "study_plan";
  return "direct_explanation";
}

function display(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function academicPassportContext(user: User): string {
  const fields: [string, unknown][] = [
    ["Department", user.department],
    ["Level", user.level],
    ["Semester", user.semester],
    ["Current courses", user.current_courses],
    ["Academic goal", user.academic_goal],
    ["Weak courses/topics", user.weak_courses],
    ["Preferred learning style", user.preferred_learning_style],
    ["Preferred resource types", user.preferred_resource_types],
    ["Study hours per week", user.study_hours_per_week],
    ["Exam preparation focus", user.exam_preparation_focus],
    ["Career interest", user.career_interest],
  ];
  const lines = fields
    .filter(([, value]) => !(value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)))
    .map(([label, value]) => `${label}: ${display(value)}`);
  return lines.join("\n") || "Academic Passport is incomplete.";
}

function inferResourceType(message: string): string {
  const text = (message || "").toLowerCase();
  if (text.includes("youtube") || text.includes("video") || text.includes("tutorial")) return "youtube";
  if (text.includes("textbook") || text.includes("book")) return "textbooks";
  if (text.includes("article") || text.includes("paper") || text.includes("research")) return "articles";
  return "youtube";
}

function cleanResourceQuery(message: string): string {
  const text = (message || "").trim();
  const lowered = text.toLowerCase();
  const starters = [
    "recommend youtube videos for", "recommend videos for", "recommend resources for", "give me textbooks for",
    "find articles on", "find resources for", "textbooks for", "articles on", "youtube videos for", "resources for",
  ];
  for (const starter of starters) {
    if (lowered.startsWith(starter)) return text.slice(starter.length).replace(/^[ .?]+|[ .?]+$/g, "") || text;
  }
  return text;
}

async function resourceContext(env: Env, message: string, intent: string): Promise<[string, boolean]> {
  if (intent !== "resources") return ["", false];
  try {
    const data = await combinedRecommendations(env, cleanResourceQuery(message), inferResourceType(message));
    const results = data.results.slice(0, 5);
    if (!results.length) return ["", true];
    return [results.map((item) => `- ${item.title} (${item.source_name || item.resource_type}): ${item.url}`).join("\n"), true];
  } catch {
    return ["", false];
  }
}

// --- keyword retrieval over a document (rag.py) ---

function ragChunks(text: string, size = 1200, overlap = 150): string[] {
  // Stored document text was cleaned at upload (by Django, or by the browser
  // with the same function), so it is not re-cleaned on every question.
  const cleaned = text.trim();
  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + size, cleaned.length);
    const chunk = cleaned.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === cleaned.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

function termCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of (text || "").toLowerCase().match(/[a-z0-9]{3,}/g) ?? []) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

function retrieveRelevantChunks(documentText: string, query: string, maxChars: number, limit = 6): string {
  const chunks = ragChunks(documentText);
  if (!chunks.length) return documentText.trim().slice(0, maxChars);
  const queryTerms = termCounts(query);
  const scored = chunks.map((chunk, index) => {
    const textTerms = termCounts(chunk);
    let score = 0;
    for (const [term, n] of queryTerms) score += Math.min(n, textTerms.get(term) ?? 0);
    return { score, index, chunk };
  });
  // sorted by (score, -index) descending.
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored
    .slice(0, limit)
    .map((s) => s.chunk)
    .join("\n\n--- PDF CONTEXT CHUNK ---\n\n")
    .slice(0, maxChars);
}

async function pdfContext(env: Env, sql: Sql, userId: number, message: string, intent: string, documentId?: number | null): Promise<[string, boolean]> {
  if (!documentId && intent !== "pdf") return ["", false];
  try {
    const [doc] = documentId
      ? await sql`select title, original_filename, extracted_text from documents_document
                  where user_id = ${userId} and status = 'processed' and extracted_text <> '' and id = ${documentId}`
      : await sql`select title, original_filename, extracted_text from documents_document
                  where user_id = ${userId} and status = 'processed' and extracted_text <> ''
                  order by uploaded_at desc limit 1`;
    if (!doc) return ["", false];
    const query = `${message} academic explanation study plan key points practice questions`;
    const context = retrieveRelevantChunks(String(doc.extracted_text), query, intVar(env.MAX_DEEPSEEK_CONTEXT_CHARS, 20000));
    if (!context) return ["", false];
    return [`Using document: ${doc.title || doc.original_filename}\n${context}`, true];
  } catch {
    return ["", false];
  }
}

function advisorPrompt(message: string, intent: string, profile: string, pdf: string, resources: string, memory: string, studied: string): string {
  const memoryBlock = memory
    ? `
This student has previously got these things wrong. If the question touches one of
them, open by naming it, say how many times and when they last missed it, and quote
the stored misconception as written rather than softening it, then correct it. If
the question is unrelated to this list, ignore this section completely.
${memory}
`
    : "";
  const studiedBlock = studied
    ? `
The student has already worked through the material below, including lectures they
converted from YouTube. Refer to it naturally when it is relevant, for example
building on a video they watched rather than explaining from scratch. Never claim
they studied something that is not on this list.
${studied}
`
    : "";
  return `
You are StudyPilot, a student academic advisor. Answer the student's actual question directly.
Do not mention internal context, profiles, tools, or process. Do not say "I will".
Use short headings, clear paragraphs, bullets, or simple tables where useful.
For concept questions: define, explain key points, give an example, and add an exam-focused summary.
For study plans: give a practical timetable or checklist.
For resources: include the provided links when available.
For uploaded PDFs: use the provided PDF context when available.
${memoryBlock}${studiedBlock}
Student background, if useful:
${profile}

Relevant PDF context:
${pdf || ""}

Resource links:
${resources || ""}

Intent: ${intent}

Student question:
${message}

Return only the answer.
`;
}

function suggestedFollowups(message: string, intent: string): string[] {
  const text = (message || "").toLowerCase();
  if (text.includes("interpreter") && text.includes("compiler")) {
    return ["Give examples of compiled and interpreted languages", "Explain bytecode in Java", "Create MCQs on compilers and interpreters"];
  }
  if (text.includes("normalization") || text.includes("normalisation")) {
    return ["Explain 1NF, 2NF, and 3NF", "Give an example of database normalization", "Create MCQs on normalization"];
  }
  if (intent === "resources") return ["Find textbook resources for this topic", "Recommend beginner YouTube tutorials", "Turn these resources into a study plan"];
  if (intent === "pdf") return ["Summarize the key points from my PDF", "Generate MCQs from my PDF", "Create flashcards from this document"];
  if (intent === "study_plan") return ["Turn this into a weekly timetable", "Create revision questions for this course", "Recommend resources for the hardest topic"];
  return ["Explain this with an example", "Create MCQs on this topic", "Summarize this for exam revision"];
}

export async function generateAdvisorResponse(env: Env, sql: Sql, user: User, message: string, documentId?: number | null) {
  const intent = classifyIntent(message);
  const profile = academicPassportContext(user);
  // The context sources are independent network calls, so they run together.
  const courses = Array.isArray(user.current_courses) ? user.current_courses : [];
  const [[pdfText, usedPdf], [resourcesText, usedResources], memoryText, studiedText] = await Promise.all([
    pdfContext(env, sql, user.id, message, intent, documentId),
    resourceContext(env, message, intent),
    // The student's own past mistakes, so the advisor corrects the
    // misconception it already knows about instead of re-teaching from scratch.
    misconceptionContext(env, user.id, message, courses),
    materialContext(env, user.id, message),
  ]);
  const prompt = advisorPrompt(message, intent, profile, pdfText, resourcesText, memoryText, studiedText);
  const response = cleanExtractedText(
    await generateText(env, prompt, "You are StudyPilot. Answer student academic questions directly and clearly.", 0.35, 1600),
  );
  return {
    response,
    used_profile_context: true,
    used_pdf_context: usedPdf,
    used_resource_recommendations: usedResources,
    suggested_followups: suggestedFollowups(message, intent),
  };
}
