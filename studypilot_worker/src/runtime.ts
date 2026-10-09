// The API runs on Vercel's Node runtime.

import type { Context } from "hono";

/**
 * Await writes and connection cleanup before the serverless function ends.
 */
export async function background(_c: Context<never>, work: Promise<unknown>): Promise<void> {
  await work;
}
