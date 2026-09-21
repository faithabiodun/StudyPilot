// The same Hono app runs on Cloudflare Workers and on Vercel's Node runtime.
// These are the only two places the difference matters.

import type { Context } from "hono";

export const onWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

/**
 * Run work after the response is sent when the platform supports it. Workers
 * has waitUntil; on Node there is nothing to hand the promise to, so it is
 * awaited instead, which costs a little latency but never drops the write.
 */
export async function background(c: Context<never>, work: Promise<unknown>): Promise<void> {
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    await work;
  }
}
