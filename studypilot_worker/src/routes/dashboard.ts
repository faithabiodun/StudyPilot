// Port of apps/dashboard/views.py (student summary, heartbeat, admin views).

import { Hono } from "hono";
import { success } from "../http";
import { requireAdmin, requireUser, serializeUser, type AppEnv, type Ctx, type User } from "../auth/users";
import { addDays, today } from "../memory/records";
import { updateUserSession } from "../services/activity";
import { serializeDocument } from "./documents";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const dashboard = new Hono<AppEnv>({ strict: false });
dashboard.use("*", requireUser);

dashboard.get("/summary", async (c) => {
  const sql = c.get("sql");
  const user = c.get("user");
  const courses = Array.isArray(user.current_courses) ? user.current_courses : [];
  const day = today();
  const start = addDays(day, -6);

  // Independent reads, issued together.
  const [counts, recent, sessions, saved, opened, logins] = await Promise.all([
    sql`
      select
        (select count(*) from documents_document where user_id = ${user.id}) as pdf_documents,
        (select count(*) from flashcards_flashcarddeck where user_id = ${user.id}) as flashcard_decks,
        (select count(*) from quizzes_quiz where user_id = ${user.id}) as quizzes,
        (select count(*) from dashboard_activitylog where user_id = ${user.id}
           and activity_type in ('resource_search', 'resource_opened')) as resource_results,
        (select count(*) from flashcards_flashcard f join flashcards_flashcarddeck d on d.id = f.deck_id
           where d.user_id = ${user.id}) as total_flashcards,
        (select count(*) from resources_savedresource where user_id = ${user.id} and is_saved = true) as saved_resources
    `,
    sql`select activity_type, title, description, metadata, created_at from dashboard_activitylog
        where user_id = ${user.id} order by created_at desc limit 5`,
    sql`select session_date::text as day, sum(duration_seconds) as seconds from dashboard_usersessionactivity
        where user_id = ${user.id} and session_date >= ${start} and session_date <= ${day} group by session_date`,
    sql`select * from resources_savedresource where user_id = ${user.id} and is_saved = true order by created_at desc limit 5`,
    sql`select title, description, metadata from dashboard_activitylog
        where user_id = ${user.id} and activity_type = 'resource_opened' order by created_at desc limit 10`,
    sql`select login_date::text as date, login_count as count from dashboard_loginactivity where user_id = ${user.id} order by login_date`,
  ]);
  const totals = counts[0];

  const secondsByDay = new Map(sessions.map((row) => [row.day as string, Number(row.seconds)]));
  // Always seven bars in chronological order (oldest -> today), each labelled
  // with its own weekday so the chart reads left to right.
  const studyProgress = Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(start, offset);
    return {
      date,
      day: WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()],
      hours: Math.round(((secondsByDay.get(date) ?? 0) / 3600) * 100) / 100,
    };
  });

  const recommendations: Record<string, unknown>[] = saved
    .filter((item) => item.url)
    .map((item) => ({
      title: item.title,
      description: item.description,
      url: item.url,
      resource_type: item.resource_type,
      source_name: item.source_name,
      author_or_channel: item.author_or_channel,
      published_date: item.published_date,
      thumbnail: item.thumbnail,
    }));
  if (recommendations.length < 5) {
    const seen = new Set(recommendations.map((r) => r.url));
    for (const activity of opened) {
      const metadata = (activity.metadata ?? {}) as Record<string, string>;
      const url = metadata.url;
      if (!url || seen.has(url)) continue;
      recommendations.push({
        title: String(activity.description).replace("You opened ", "").replace(/\.+$/, "") || activity.title,
        description: activity.description,
        url,
        resource_type: metadata.resource_type ?? "link",
        source_name: metadata.source_name ?? "Resource Hub",
        author_or_channel: "",
        published_date: "",
        thumbnail: "",
      });
      seen.add(url);
      if (recommendations.length >= 5) break;
    }
  }

  const pdfDocuments = Number(totals.pdf_documents);
  const decks = Number(totals.flashcard_decks);
  const quizzes = Number(totals.quizzes);
  return success("Dashboard summary fetched successfully", {
    active_courses: courses.length,
    resource_results: Number(totals.resource_results),
    pdf_documents: pdfDocuments,
    generated_outputs: decks + quizzes,
    login_days: logins.map((row) => ({ date: row.date, count: row.count })),
    recent_activity: recent.map((item) => ({
      type: item.activity_type,
      title: item.title,
      description: item.description,
      metadata: item.metadata,
      created_at: item.created_at,
    })),
    recommended_resources: recommendations,
    total_documents: pdfDocuments,
    total_flashcard_decks: decks,
    total_flashcards: Number(totals.total_flashcards),
    total_quizzes: quizzes,
    total_saved_resources: Number(totals.saved_resources),
    recommended_actions: [
      "Upload a recent lecture PDF",
      "Generate flashcards for your hardest course",
      "Take a short quiz before your next class",
      "Ask AI Advisor for a weekly study plan",
    ],
    study_progress: studyProgress,
  });
});

export async function heartbeat(c: Ctx) {
  const session = await updateUserSession(c.env, c.get("sql"), c.get("user").id);
  return success("Activity heartbeat recorded", {
    session_date: session?.session_date ?? null,
    duration_seconds: session?.duration_seconds ?? 0,
  });
}

dashboard.post("/heartbeat", heartbeat);

export const admin = new Hono<AppEnv>({ strict: false });
admin.use("*", requireUser, requireAdmin);

admin.get("/summary", async (c) => {
  const [row] = await c.get("sql")`
    select
      (select count(*) from accounts_user) as total_users,
      (select count(*) from accounts_user where role = 'student') as total_students,
      (select count(*) from accounts_user where role = 'admin') as total_admins,
      (select count(*) from documents_document) as total_documents,
      (select count(*) from quizzes_quiz) as total_quizzes,
      (select count(*) from flashcards_flashcarddeck) as total_flashcard_decks
  `;
  return success("Admin summary fetched", Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)])));
});

admin.get("/users", async (c) => {
  const users = (await c.get("sql")`select * from accounts_user order by date_joined desc`) as unknown as User[];
  return success("Admin users fetched", users.map(serializeUser));
});

admin.get("/documents", async (c) => {
  const sql = c.get("sql");
  const rows = await sql`
    select d.*, (select count(*) from documents_documentchunk ch where ch.document_id = d.id) as chunk_count
    from documents_document d order by d.uploaded_at desc
  `;
  return success("Admin documents fetched", rows.map(serializeDocument));
});
