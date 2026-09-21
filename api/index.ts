// Vercel entry point. The same Hono app that runs on Cloudflare Workers is
// served here as one Node function, with every /api path rewritten to it by
// vercel.json.
//
// Hono reads configuration from `c.env`, which on Workers is the bindings
// object. On Vercel that is process.env, so it is passed in explicitly.

import app from "../studypilot_worker/src/index";

export const config = { runtime: "nodejs" };

export default function handler(request: Request): Response | Promise<Response> {
  return app.fetch(request, process.env as never);
}
