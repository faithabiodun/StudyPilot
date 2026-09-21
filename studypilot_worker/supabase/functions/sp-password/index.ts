// sp-password: Django-compatible password hashing for the StudyPilot Worker.
//
// Why this exists: accounts created by the Django backend store
// pbkdf2_sha256 hashes at 1,000,000+ iterations. Cloudflare Workers cap WebCrypto
// PBKDF2 at 100,000 iterations and the free plan allows ~10ms of CPU, so the
// Worker cannot check those hashes itself. Deno has no cap and Edge Functions get
// 2s of CPU, so the Worker asks this function instead.
//
// Hashes are read and written in Django's exact format, so the Django backend
// can still log these users in if it is ever brought back.
//
// Auth: the caller must send the shared secret in x-sp-secret. The secret lives
// in public.sp_function_secrets, which has RLS on and no policies, so only this
// function's service-role key can read it.

import { createClient } from "npm:@supabase/supabase-js@2";

const ITERATIONS = 1_200_000; // Django 6.0's PBKDF2PasswordHasher default
const MIN_LENGTH = 8;
const COMMON_PASSWORDS_URL =
  "https://raw.githubusercontent.com/django/django/6.0.5/django/contrib/auth/common-passwords.txt.gz";

const encoder = new TextEncoder();

let secretPromise: Promise<string> | null = null;
let commonPromise: Promise<Set<string> | null> | null = null;

function sharedSecret(): Promise<string> {
  secretPromise ??= (async () => {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await supabase.from("sp_function_secrets").select("value").eq("name", "sp-password").single();
    if (error || !data?.value) throw new Error("shared secret missing");
    return data.value as string;
  })().catch((error) => {
    secretPromise = null; // retry on the next request rather than caching the failure
    throw error;
  });
  return secretPromise;
}

/** Django's CommonPasswordValidator list, fetched once per instance. */
function commonPasswords(): Promise<Set<string> | null> {
  commonPromise ??= (async () => {
    try {
      const response = await fetch(COMMON_PASSWORDS_URL);
      if (!response.ok || !response.body) return null;
      const text = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).text();
      return new Set(text.split("\n").map((line) => line.trim().toLowerCase()).filter(Boolean));
    } catch {
      return null;
    }
  })().then((list) => {
    if (!list) commonPromise = null;
    return list;
  });
  return commonPromise;
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

async function pbkdf2(password: string, salt: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations },
    key,
    256,
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

async function verify(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterations, salt, hash] = (encoded || "").split("$");
  if (algorithm !== "pbkdf2_sha256" || !salt || !hash) return false;
  const count = Number.parseInt(iterations, 10);
  if (!Number.isInteger(count) || count < 1 || count > 10_000_000) return false;
  return constantTimeEqual(await pbkdf2(password, salt, count), hash);
}

function randomSalt(length = 22): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Django's AUTH_PASSWORD_VALIDATORS as the register endpoint ran them.
 * UserAttributeSimilarityValidator is absent on purpose: the serializer called
 * validate_password() without a user, so it never ran at sign-up.
 */
async function validate(password: string): Promise<string[]> {
  const errors: string[] = [];
  if (password.length < MIN_LENGTH) {
    errors.push(`This password is too short. It must contain at least ${MIN_LENGTH} characters.`);
  }
  const common = await commonPasswords();
  if (common?.has(password.toLowerCase().trim())) errors.push("This password is too common.");
  if (/^\d+$/.test(password)) errors.push("This password is entirely numeric.");
  return errors;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  let secret: string;
  try {
    secret = await sharedSecret();
  } catch {
    return json({ error: "not configured" }, 503);
  }
  if (!constantTimeEqual(request.headers.get("x-sp-secret") ?? "", secret)) return json({ error: "forbidden" }, 403);

  let body: { action?: string; password?: unknown; hash?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const password = typeof body.password === "string" ? body.password : "";

  if (body.action === "verify") {
    return json({ valid: password !== "" && (await verify(password, String(body.hash ?? ""))) });
  }
  if (body.action === "hash") {
    const errors = await validate(password);
    if (errors.length) return json({ errors });
    const salt = randomSalt();
    return json({ hash: `pbkdf2_sha256$${ITERATIONS}$${salt}$${await pbkdf2(password, salt, ITERATIONS)}` });
  }
  return json({ error: "unknown action" }, 400);
});
