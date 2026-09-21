// HS256 tokens byte-compatible with djangorestframework-simplejwt, signed with
// the same SECRET_KEY. Tokens issued by the Django backend keep working here and
// the other way round, so switching hosts does not log anyone out.
//
// Claims match SimpleJWT's defaults: token_type, exp, iat, jti (uuid4 hex) and
// user_id as a string.

import type { Sql } from "../db";
import type { Env } from "../env";
import { intVar } from "../env";

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    keyCache.set(secret, key);
  }
  return key;
}

export interface TokenPayload {
  token_type: "access" | "refresh";
  exp: number;
  iat: number;
  jti: string;
  user_id: string;
  [claim: string]: unknown;
}

async function sign(payload: TokenPayload, secret: string): Promise<string> {
  // PyJWT's header key order, so tokens are identical in shape to Django's.
  const header = b64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(new Uint8Array(signature))}`;
}

export class TokenError extends Error {}

export async function decode(token: string, secret: string, expected: TokenPayload["token_type"]): Promise<TokenPayload> {
  const parts = (token || "").split(".");
  if (parts.length !== 3) throw new TokenError("Token is invalid");
  let payload: TokenPayload;
  let header: { alg?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch {
    throw new TokenError("Token is invalid");
  }
  if (header.alg !== "HS256") throw new TokenError("Token is invalid");
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    b64urlDecode(parts[2]),
    encoder.encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) throw new TokenError("Token is invalid");
  if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new TokenError("Token is expired");
  }
  if (payload.token_type !== expected) throw new TokenError("Token has wrong type");
  if (!payload.jti || payload.user_id === undefined) throw new TokenError("Token contained no recognizable user identification");
  return payload;
}

function newJti(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function claims(type: TokenPayload["token_type"], userId: number | string, lifetimeSeconds: number): TokenPayload {
  const now = Math.floor(Date.now() / 1000);
  return { token_type: type, exp: now + lifetimeSeconds, iat: now, jti: newJti(), user_id: String(userId) };
}

export function accessLifetime(env: Env) {
  return intVar(env.JWT_ACCESS_TOKEN_LIFETIME_MINUTES, 60) * 60;
}

export async function accessFor(env: Env, userId: number | string): Promise<string> {
  return sign(claims("access", userId, accessLifetime(env)), env.SECRET_KEY);
}

/**
 * RefreshToken.for_user: issue a refresh token and record it as outstanding,
 * which is what lets logout blacklist it later.
 */
export async function tokensFor(env: Env, sql: Sql, userId: number): Promise<{ access: string; refresh: string }> {
  const lifetime = intVar(env.JWT_REFRESH_TOKEN_LIFETIME_DAYS, 7) * 86400;
  const payload = claims("refresh", userId, lifetime);
  const refresh = await sign(payload, env.SECRET_KEY);
  await sql`
    insert into token_blacklist_outstandingtoken (token, created_at, expires_at, user_id, jti)
    values (${refresh}, ${new Date(payload.iat * 1000)}, ${new Date(payload.exp * 1000)}, ${userId}, ${payload.jti})
  `;
  return { access: await accessFor(env, userId), refresh };
}

export async function isBlacklisted(sql: Sql, jti: string): Promise<boolean> {
  const rows = await sql`
    select 1 from token_blacklist_blacklistedtoken b
    join token_blacklist_outstandingtoken o on o.id = b.token_id
    where o.jti = ${jti} limit 1
  `;
  return rows.length > 0;
}

export async function blacklist(sql: Sql, token: string, payload: TokenPayload): Promise<void> {
  const userId = Number(payload.user_id);
  let rows = await sql`select id from token_blacklist_outstandingtoken where jti = ${payload.jti}`;
  if (!rows.length) {
    rows = await sql`
      insert into token_blacklist_outstandingtoken (token, created_at, expires_at, user_id, jti)
      values (${token}, ${new Date(payload.iat * 1000)}, ${new Date(payload.exp * 1000)}, ${Number.isFinite(userId) ? userId : null}, ${payload.jti})
      returning id
    `;
  }
  const tokenId = rows[0].id as number;
  const existing = await sql`select 1 from token_blacklist_blacklistedtoken where token_id = ${tokenId}`;
  if (!existing.length) {
    await sql`insert into token_blacklist_blacklistedtoken (blacklisted_at, token_id) values (${new Date()}, ${tokenId})`;
  }
}
