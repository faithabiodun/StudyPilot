import postgres from "postgres";
import type { Env } from "./env";

export type Sql = postgres.Sql<Record<string, never>>;

/**
 * One connection per request.
 *
 * On Node (Vercel), `sslmode=require` encrypts
 * without demanding a publicly trusted CA, which is exactly what the Django
 * backend did through psycopg2.
 *
 * `prepare: false` because pooled connections hand each statement to whichever
 * backend is free, so a prepared statement from one may not exist on the next.
 */
export function connect(env: Env): Sql {
  const url = env.DATABASE_URL;
  if (!url) throw new Error("No database connection string configured.");
  const loopback = /@(127\.0\.0\.1|localhost)[:/]/.test(url);
  return postgres(url, {
    max: 1,
    prepare: false,
    fetch_types: false,
    idle_timeout: 5,
    connect_timeout: 15,
    // Local connections use plaintext; hosted connections require TLS.
    ssl: loopback ? false : "require",
    // bigint (ids, count(*)) arrives as a string by default, which would leak
    // into JSON as "17" where Django sent 17. Every value here fits a double.
    types: {
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    } as never,
    transform: { undefined: null },
  }) as unknown as Sql;
}
