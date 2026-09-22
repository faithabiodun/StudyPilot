// Vercel entry point. The same Hono app that runs on Cloudflare Workers is
// served here as one Node function, with every /api path rewritten to it by
// vercel.json.
//
// Hono reads configuration from `c.env`, which on Workers is the bindings
// object. Vercel's adapter does not pass one, so process.env is injected here.

import { Hono } from "hono";
import { handle } from "hono/vercel";
import app from "../studypilot_worker/src/index";

export const config = { runtime: "nodejs" };

const root = new Hono();

root.all("*", async (c) => {
  let executionCtx: ExecutionContext | undefined;
  try {
    executionCtx = c.executionCtx;
  } catch {
    // No deferred work on this platform; the app awaits instead.
  }
  return app.fetch(c.req.raw, process.env as never, executionCtx as never);
});

export default handle(root);
