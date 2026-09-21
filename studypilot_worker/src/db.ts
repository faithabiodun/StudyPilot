import postgres from "postgres";
import type { Env } from "./env";
import { onWorkers } from "./runtime";

export type Sql = postgres.Sql<Record<string, never>>;

/**
 * One connection per request.
 *
 * On Cloudflare Workers this has to go through Hyperdrive. Supabase's database
 * certificate is signed by Supabase's own CA and Workers sockets only trust
 * public CAs, so a direct TLS connection is dropped mid-handshake. Hyperdrive
 * makes that connection itself and hands the Worker a pooled one.
 *
 * On Node (Vercel) there is no such restriction: `sslmode=require` encrypts
 * without demanding a publicly trusted CA, which is exactly what the Django
 * backend did through psycopg2.
 *
 * `prepare: false` because pooled connections hand each statement to whichever
 * backend is free, so a prepared statement from one may not exist on the next.
 */
export function connect(env: Env): Sql {
  const hyperdrive = env.HYPERDRIVE?.connectionString;
  const url = hyperdrive || env.DATABASE_URL;
  if (!url) throw new Error("No database connection string configured.");
  const loopback = /@(127\.0\.0\.1|localhost)[:/]/.test(url);
  if (onWorkers && !hyperdrive && !loopback) {
    throw new Error("No Hyperdrive binding: a Worker cannot make the TLS connection to Supabase directly.");
  }
  return postgres(url, {
    max: 1,
    prepare: false,
    fetch_types: false,
    idle_timeout: 5,
    connect_timeout: 15,
    // Hyperdrive and the local proxy terminate TLS themselves; everywhere else
    // encrypt without requiring a publicly trusted CA.
    ssl: hyperdrive || loopback ? false : "require",
    // bigint (ids, count(*)) arrives as a string by default, which would leak
    // into JSON as "17" where Django sent 17. Every value here fits a double.
    types: {
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    } as never,
    transform: { undefined: null },
  }) as unknown as Sql;
}
