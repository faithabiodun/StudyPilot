import type { Sql } from "../db";
import type { Env } from "../env";
import { recentStudyMemories, type StudyMemory } from "../memory/services";

const SOURCES: Record<string, string> = {
  pdf_uploaded: "pdf", flashcards_generated: "flashcards", flashcard_deck_created: "flashcards",
  mixed_quiz_generated: "quiz", mcq_quiz_generated: "mcq", quiz_submitted: "quiz_attempt",
  youtube_docx_generated: "youtube", youtube_flashcards_generated: "youtube_flashcards",
  youtube_mcq_generated: "youtube_mcq", youtube_quiz_generated: "youtube_quiz",
  resource_search: "search", resource_saved: "saved", resource_opened: "opened",
};

export function suggestionForMemory(item: StudyMemory) {
  const title = item.title.replace(/[\r\n]/g, " ").slice(0, 180);
  let question: string;
  if (item.source.includes("flashcards")) question = `Quiz me on my recent flashcards: "${title}".`;
  else if (["quiz", "mcq", "youtube_quiz", "youtube_mcq", "quiz_attempt"].includes(item.source)) question = `Help me revise the questions and answers from "${title}".`;
  else if (item.source === "pdf") question = `Explain the key points from my PDF "${title}".`;
  else if (item.source === "search") question = `Help me choose and study the resources I searched for: "${title}".`;
  else if (["saved", "opened"].includes(item.source)) question = `Help me study my recent resource "${title}".`;
  else if (item.source.startsWith("youtube")) question = `Help me revise my YouTube lecture "${title}".`;
  else return null;
  const document = /^document:(\d+)$/.exec(item.reference);
  return { question, title, source: item.source, saved_at: item.saved_at,
    ...(document ? { document_id: Number(document[1]) } : {}) };
}

/** The activity log bridges the few seconds while accepted memories index,
 * and preserves useful suggestions when the relayer is unavailable. */
export async function advisorStudySuggestions(env: Env, sql: Sql, userId: number) {
  const [memory, activities] = await Promise.all([
    recentStudyMemories(env, userId, 12),
    (async () => {
      try {
        return await sql`
          select a.activity_type, a.description, a.metadata, a.created_at,
            coalesce(a.metadata->>'source_title', a.metadata->>'query', d.title, deck.title, q.course_title) as source_title
          from dashboard_activitylog a
          left join documents_document d on d.id::text = a.metadata->>'document_id' and d.user_id = a.user_id
          left join flashcards_flashcarddeck deck on deck.id::text = a.metadata->>'deck_id' and deck.user_id = a.user_id
          left join quizzes_quiz q on q.id::text = a.metadata->>'quiz_id' and q.user_id = a.user_id
          where a.user_id = ${userId} and a.activity_type in ${sql(Object.keys(SOURCES))}
            and (a.activity_type <> 'resource_search' or length(coalesce(a.metadata->>'query', '')) >= 3)
          order by a.created_at desc, a.id desc limit 30
        `;
      } catch { return []; }
    })(),
  ]);
  const recent: StudyMemory[] = activities.map((row) => {
    const metadata = (row.metadata || {}) as Record<string, unknown>;
    return { title: String(row.source_title || row.description || "Recent study"), source: SOURCES[String(row.activity_type)],
      summary: String(row.description || ""), reference: metadata.document_id ? `document:${metadata.document_id}`
        : metadata.query ? `search:${String(metadata.query).toLowerCase()}` : metadata.quiz_id ? `quiz:${metadata.quiz_id}`
        : metadata.deck_id ? `deck:${metadata.deck_id}` : metadata.video_id ? `https://www.youtube.com/watch?v=${metadata.video_id}` : String(metadata.url || ""),
      saved_at: new Date(row.created_at as string | Date).toISOString() };
  });
  const items = [...memory.items, ...recent].sort((a, b) => b.saved_at.localeCompare(a.saved_at));
  const unique = new Set<string>();
  const suggestions = items.flatMap((item) => {
    const suggestion = suggestionForMemory(item);
    const key = `${item.source}:${item.reference || item.title.toLowerCase()}`;
    if (!suggestion || unique.has(key)) return [];
    unique.add(key);
    return [suggestion];
  }).slice(0, 8);
  return { suggestions, memory_enabled: memory.enabled, memory_available: memory.enabled && !memory.error,
    recent_context: items.slice(0, 8).map((item) => `- ${item.source} at ${item.saved_at}: ${item.title}. ${item.summary}\n${item.excerpt || ""}`).join("\n").slice(0, 8000) };
}
