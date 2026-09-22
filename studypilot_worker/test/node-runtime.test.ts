// The app runs on Cloudflare Workers and on Vercel's Node runtime. This checks
// the Node path: the module imports cleanly outside workerd, and requests are
// handled with plain `process.env` in place of Worker bindings.

import { describe, expect, it } from "vitest";
import app from "../src/index";

// postgres.js connects lazily, so a placeholder URL is enough for requests that
// never reach a query.
const env = {
  SECRET_KEY: "test-secret",
  MEMWAL_ENABLED: "false",
  DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/postgres",
} as never;

describe("running on Node", () => {
  it("serves the health check", async () => {
    const response = await app.fetch(new Request("https://studypilot.test/api/health/"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, runtime: "node" });
  });

  it("answers unknown API paths with 404 rather than the React app", async () => {
    const response = await app.fetch(new Request("https://studypilot.test/api/nope/"), env);
    expect(response.status).toBe(404);
  });

  it("requires a token, without a database connection or a waitUntil", async () => {
    const response = await app.fetch(new Request("https://studypilot.test/api/auth/me/"), env);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ detail: "Authentication credentials were not provided." });
  });
});
