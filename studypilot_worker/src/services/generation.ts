// Shared generate -> dedupe -> retry loop used by the PDF and YouTube tools.

import type { Env } from "../env";
import { intVar } from "../env";
import { AINotConfigured, AIServiceError } from "../lib/ai";
import { selectStudyContext } from "../lib/context";
import { failure } from "../http";
import { str } from "../http";

/**
 * The first-pass and retry contexts for a stored document. Uploads made through
 * the Worker carry both, computed in the browser. Older documents fall back to
 * computing them here.
 */
export function documentContexts(env: Env, doc: Record<string, unknown>) {
  const maxChars = intVar(env.MAX_DEEPSEEK_CONTEXT_CHARS, 20000);
  const source = str(doc.focused_extracted_text) || str(doc.extracted_text);
  return {
    first: () => str(doc.study_context) || selectStudyContext(source, maxChars),
    retry: () => str(doc.study_context_retry) || selectStudyContext(source, maxChars, 10),
  };
}

export function textContexts(env: Env, text: string) {
  const maxChars = intVar(env.MAX_DEEPSEEK_CONTEXT_CHARS, 20000);
  return {
    first: () => selectStudyContext(text, maxChars),
    retry: () => selectStudyContext(text, maxChars, 10),
  };
}

/**
 * Generate, dedupe, and if the model came back short, generate once more from
 * the next-best slice of the material and merge.
 */
export async function generateWithRetry<T>(
  contexts: { first: () => string; retry: () => string },
  requested: number,
  generate: (context: string) => Promise<Record<string, unknown>>,
  dedupe: (items: unknown[], limit: number) => T[],
  key: string,
): Promise<T[]> {
  const items = (payload: Record<string, unknown>) => (Array.isArray(payload[key]) ? (payload[key] as unknown[]) : []);
  let result = dedupe(items(await generate(contexts.first())), requested);
  if (result.length < requested) {
    const retry = await generate(contexts.retry());
    result = dedupe([...(result as unknown[]), ...items(retry)], requested);
  }
  return result;
}

/** Map the AI errors onto the status codes the Django views used. */
export function aiFailure(error: unknown, fallback: string): Response {
  if (error instanceof AINotConfigured) return failure(error.message, {}, 500);
  if (error instanceof AIServiceError) return failure(error.message || fallback, {}, 502);
  throw error;
}
