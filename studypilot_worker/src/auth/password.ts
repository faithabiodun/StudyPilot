// Password hashing is delegated to a Supabase Edge Function (sp-password).
//
// Django stores PBKDF2-SHA256 hashes at 1,000,000+ iterations. Workers cannot
// check those: WebCrypto in workerd caps PBKDF2 at 100,000 iterations, and the
// free plan allows ~10ms of CPU per request, while one such hash takes several
// hundred. The Edge Function runs on Deno with a 2s CPU budget and no cap, so it
// verifies existing hashes unchanged and writes new ones in the same format,
// which keeps the Django backend a working rollback.

import type { Env } from "../env";
import { HttpError } from "../http";

interface HashResult {
  hash?: string;
  errors?: string[];
}

async function call(env: Env, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${env.SUPABASE_URL}/functions/v1/sp-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // The anon key only gets the request past Supabase's gateway. The shared
        // secret is what the function actually checks.
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        "x-sp-secret": env.PASSWORD_FN_SECRET,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new HttpError(503, { success: false, message: "Sign-in is temporarily unavailable. Please try again.", errors: {} });
  }
  if (!response.ok) {
    console.warn(`sp-password returned ${response.status}`);
    throw new HttpError(503, { success: false, message: "Sign-in is temporarily unavailable. Please try again.", errors: {} });
  }
  return response.json();
}

export async function checkPassword(env: Env, password: string, encoded: string): Promise<boolean> {
  // Unusable passwords ("!...") and empty ones never match, like Django.
  if (!password || !encoded || encoded.startsWith("!")) return false;
  const result = await call(env, { action: "verify", password, hash: encoded });
  return result.valid === true;
}

/**
 * Validate with Django's AUTH_PASSWORD_VALIDATORS and hash. Validation lives in
 * the function too, because the common-passwords list is 20,000 entries.
 */
export async function hashPassword(env: Env, password: string, attributes: Record<string, string>): Promise<HashResult> {
  const result = await call(env, { action: "hash", password, attributes });
  return { hash: result.hash as string | undefined, errors: result.errors as string[] | undefined };
}
