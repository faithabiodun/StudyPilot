// Port of apps/dashboard/services.py: study-time sessions, login days and the
// activity log, plus rolling finished days into Walrus.

import type { Sql } from "../db";
import type { Env } from "../env";
import { rememberSession } from "../memory/services";
import { today } from "../memory/records";

const SESSION_GAP_SECONDS = 30 * 60;
const MAX_HEARTBEAT_CREDIT_SECONDS = 5 * 60;

/**
 * Write every day before today into memory, exactly once. Guarded by
 * memory_written because the store is append-only and a second write would
 * double-count the day.
 */
export async function flushFinishedSessions(env: Env, sql: Sql, userId: number, day: string): Promise<number> {
  const pending = await sql`
    select id, session_date::text as session_date, duration_seconds
    from dashboard_usersessionactivity
    where user_id = ${userId} and memory_written = false and session_date < ${day}
  `;
  if (!pending.length) return 0;

  // A day can span several rows (a 30 minute gap starts a new one). Sum them so
  // a day is one record with its real total, not three holding a fraction each.
  const byDay = new Map<string, { id: number; duration_seconds: number }[]>();
  for (const row of pending) {
    const list = byDay.get(row.session_date as string) ?? [];
    list.push({ id: row.id as number, duration_seconds: row.duration_seconds as number });
    byDay.set(row.session_date as string, list);
  }

  let daysWritten = 0;
  const settled: number[] = [];
  for (const date of [...byDay.keys()].sort()) {
    const rows = byDay.get(date)!;
    const minutes = Math.round(rows.reduce((sum, r) => sum + r.duration_seconds, 0) / 60);
    if (minutes < 1) {
      // Nothing worth remembering, but settle it so we stop re-checking.
      settled.push(...rows.map((r) => r.id));
      continue;
    }
    if ((await rememberSession(env, userId, date, minutes)).written) {
      settled.push(...rows.map((r) => r.id));
      daysWritten += 1;
    }
  }
  if (settled.length) {
    await sql`update dashboard_usersessionactivity set memory_written = true where id in ${sql(settled)}`;
  }
  return daysWritten;
}

export async function updateUserSession(env: Env, sql: Sql, userId: number) {
  const now = new Date();
  const day = today();
  // Roll up completed days first. Memory is optional, so a failure here must
  // not stop the heartbeat recording study time locally.
  try {
    await flushFinishedSessions(env, sql, userId, day);
  } catch (error) {
    console.warn(`Session memory flush failed for user=${userId}: ${error instanceof Error ? error.message : error}`);
  }
  const [session] = await sql`
    select id, last_seen_at, duration_seconds, session_date::text as session_date
    from dashboard_usersessionactivity
    where user_id = ${userId} and session_date = ${day}
    order by last_seen_at desc limit 1
  `;
  if (!session || (now.getTime() - (session.last_seen_at as Date).getTime()) / 1000 > SESSION_GAP_SECONDS) {
    const [created] = await sql`
      insert into dashboard_usersessionactivity
        (user_id, session_date, started_at, last_seen_at, duration_seconds, memory_written, created_at, updated_at)
      values (${userId}, ${day}, ${now}, ${now}, 0, false, ${now}, ${now})
      returning session_date::text as session_date, duration_seconds
    `;
    return created;
  }
  const elapsed = Math.floor((now.getTime() - (session.last_seen_at as Date).getTime()) / 1000);
  const delta = Math.max(0, Math.min(elapsed, MAX_HEARTBEAT_CREDIT_SECONDS));
  const [updated] = await sql`
    update dashboard_usersessionactivity
    set last_seen_at = ${now}, duration_seconds = greatest(0, duration_seconds + ${delta}), updated_at = ${now}
    where id = ${session.id as number}
    returning session_date::text as session_date, duration_seconds
  `;
  return updated;
}

export async function recordActivity(
  env: Env,
  sql: Sql,
  userId: number,
  activityType: string,
  title: string,
  description = "",
  metadata: Record<string, unknown> = {},
) {
  await updateUserSession(env, sql, userId);
  const now = new Date();
  await sql`
    insert into dashboard_activitylog (user_id, activity_type, title, description, metadata, created_at)
    values (${userId}, ${activityType}, ${title.slice(0, 180)}, ${description}, ${sql.json(metadata as never)}, ${now})
  `;
}

export async function recordLogin(env: Env, sql: Sql, userId: number) {
  await updateUserSession(env, sql, userId);
  const now = new Date();
  await sql`
    insert into dashboard_loginactivity (user_id, login_date, login_count, created_at, updated_at)
    values (${userId}, ${today()}, 1, ${now}, ${now})
    on conflict (user_id, login_date)
    do update set login_count = dashboard_loginactivity.login_count + 1, updated_at = ${now}
  `;
  await recordActivity(env, sql, userId, "logged_in", "Logged in", "You logged in to StudyPilot.");
}
