import postgres from "postgres";
import type { Env } from "./env";

export type Sql = postgres.Sql<Record<string, never>>;

/**
 * One connection per request, through Cloudflare Hyperdrive.
 *
 * Hyperdrive is not just an optimisation here. Supabase's database certificate
 * is signed by Supabase's own CA, and Workers sockets only trust public CAs, so
 * a direct TLS connection from the Worker is dropped mid-handshake. Hyperdrive
 * makes the TLS connection to Supabase itself and hands the Worker a pooled,
 * already-warm connection near the database.
 *
 * DATABASE_URL is only used by `wrangler dev`, pointed at a loopback TLS proxy
 * (plaintext never leaves the machine), so it is only ever unencrypted on
 * 127.0.0.1.
 *
 * `prepare: false` because pooled connections hand each statement to whichever
 * backend is free, so a prepared statement from one may not exist on the next.
 */
export function connect(env: Env): Sql {
  const url = env.HYPERDRIVE?.connectionString || env.DATABASE_URL;
  const loopback = /@(127\.0\.0\.1|localhost)[:/]/.test(url);
  if (!env.HYPERDRIVE && !loopback) {
    throw new Error("No Hyperdrive binding: refusing to connect to a remote database without TLS support.");
  }
  return postgres(url, {
    max: 1,
    prepare: false,
    fetch_types: false,
    idle_timeout: 5,
    connect_timeout: 15,
    ssl: false,
    // bigint (ids, count(*)) arrives as a string by default, which would leak
    // into JSON as "17" where Django sent 17. Every value here fits a double.
    types: {
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    } as never,
    transform: { undefined: null },
  }) as unknown as Sql;
}
