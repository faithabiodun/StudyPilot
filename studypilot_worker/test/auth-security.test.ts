import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import accounts, { suiChallengeMessage } from "../src/routes/accounts";
import flashcards from "../src/routes/flashcards";
import { accessFor, decode, tokensFor, TokenError } from "../src/auth/jwt";
import type { AppEnv } from "../src/auth/users";
import type { Sql } from "../src/db";
import type { Env } from "../src/env";

vi.mock("../src/services/activity", () => ({ recordLogin: vi.fn(), recordActivity: vi.fn() }));

const env = { SECRET_KEY: "test-secret", GOOGLE_CLIENT_ID: "test-client" } as Env;
const key = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(7));
const address = key.toSuiAddress();
const nonce = "a".repeat(32);
const origin = "https://studypilot.test";

function harness(rows: unknown[][], route = accounts) {
  const queries: { text: string; values: unknown[] }[] = [];
  const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    queries.push({ text: strings.join("?"), values });
    if (!rows.length) throw new Error("Unexpected database query");
    return rows.shift();
  });
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => { c.set("sql", sql as unknown as Sql); await next(); });
  app.route("/", route);
  const post = (path: string, body: unknown, headers = {}, host = origin) => app.request(`${host}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  }, env);
  return { post, queries, sql };
}

afterEach(() => vi.unstubAllGlobals());

describe("wallet login security", () => {
  it("issues a message containing the website, canonical wallet and expiry", async () => {
    const { post } = harness([[], []]);
    const response = await post("/sui/challenge", { address });
    const { data } = await response.json() as { data: { nonce: string; message: string; issued_at: string } };
    expect(response.status).toBe(200);
    expect(data.message).toBe(suiChallengeMessage(data.nonce, origin, address, new Date(data.issued_at)));
    expect(data.message).toContain("Expires at:");
  });

  it("rejects invalid addresses before writing a challenge", async () => {
    const { post, sql } = harness([]);
    expect((await post("/sui/challenge", { address: "bad" })).status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("accepts a real SDK signature once and rejects its replay", async () => {
    const issued = new Date();
    const { signature } = await key.signPersonalMessage(new TextEncoder().encode(suiChallengeMessage(nonce, origin, address, issued)));
    const { post } = harness([[{ id: 1, created_at: issued }], [{ id: 9, is_active: true, full_name: "Student" }], [], []]);
    expect((await post("/sui", { address, nonce, signature })).status).toBe(200);
    expect((await post("/sui", { address, nonce, signature })).status).toBe(400);
  });

  it("rejects a signature from another website", async () => {
    const issued = new Date();
    const { signature } = await key.signPersonalMessage(new TextEncoder().encode(suiChallengeMessage(nonce, "https://other.test", address, issued)));
    const { post } = harness([[{ id: 1, created_at: issued }]]);
    expect((await post("/sui", { address, nonce, signature })).status).toBe(401);
  });

  it("rejects expired challenges before issuing tokens", async () => {
    const { post } = harness([[{ id: 1, created_at: new Date(Date.now() - 301000) }], []]);
    expect((await post("/sui", { address, nonce, signature: "unused" })).status).toBe(400);
  });

  it("refuses a disabled wallet account even with a valid signature", async () => {
    const issued = new Date();
    const { signature } = await key.signPersonalMessage(new TextEncoder().encode(suiChallengeMessage(nonce, origin, address, issued)));
    const { post, queries } = harness([[{ id: 1, created_at: issued }], [{ id: 9, is_active: false }]]);
    expect((await post("/sui", { address, nonce, signature })).status).toBe(403);
    expect(queries).toHaveLength(2);
  });
});

describe("other account boundaries", () => {
  it("refuses to revoke another account's refresh token", async () => {
    const tokenSql = vi.fn(async () => []) as unknown as Sql;
    const { refresh } = await tokensFor(env, tokenSql, 10);
    const access = await accessFor(env, 9);
    const { post, queries } = harness([[{ id: 9, is_active: true }]]);
    expect((await post("/logout", { refresh }, { Authorization: `Bearer ${access}` })).status).toBe(403);
    expect(queries).toHaveLength(1);
  });

  it("blocks Google login to a disabled account", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ aud: "test-client", iss: "https://accounts.google.com", email: "student@test.com", sub: "google-1", email_verified: "true" })));
    const { post } = harness([[{ id: 9, is_active: false }]]);
    expect((await post("/google", { credential: "test" })).status).toBe(403);
  });

  it("rejects Google tokens with unverified emails before account lookup", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ aud: "test-client", iss: "https://accounts.google.com", email: "student@test.com", sub: "google-1", email_verified: "false" })));
    const { post, sql } = harness([]);
    expect((await post("/google", { credential: "test" })).status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("cannot attach another student's document to a deck", async () => {
    const access = await accessFor(env, 9);
    const { post, queries } = harness([[{ id: 9, is_active: true }], []], flashcards);
    expect((await post("/decks", { title: "Deck", document: 12 }, { Authorization: `Bearer ${access}` })).status).toBe(400);
    expect(queries[1].text).toContain("user_id =");
    expect(queries[1].values).toEqual([12, 9]);
  });

  it("returns a token error for malformed JWT signatures and null headers", async () => {
    const access = await accessFor(env, 9);
    const [header, body] = access.split(".");
    await expect(decode(`${header}.${body}.!`, env.SECRET_KEY, "access")).rejects.toBeInstanceOf(TokenError);
    await expect(decode(`${btoa("null")}.${body}.AAAA`, env.SECRET_KEY, "access")).rejects.toBeInstanceOf(TokenError);
  });
});
