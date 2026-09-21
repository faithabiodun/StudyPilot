// Response helpers that keep the exact envelope the Django API returned, so
// the frontend does not need to know the backend changed.

export type Json = Record<string, unknown>;

export function success(message = "Action completed successfully", data: unknown = {}, status = 200): Response {
  return Response.json({ success: true, message, data: data ?? {} }, { status });
}

export function failure(message = "Error", errors: unknown = {}, status = 400): Response {
  return Response.json({ success: false, message, errors: errors ?? {} }, { status });
}

/** Thrown anywhere in a handler; the app turns it into the matching response. */
export class HttpError extends Error {
  constructor(public status: number, public body: Json) {
    super(String(body.message ?? body.detail ?? status));
  }
}

/** DRF's get_object_or_404 shape. */
export function notFound(model: string): HttpError {
  return new HttpError(404, { detail: `No ${model} matches the given query.` });
}

export function badRequest(message: string, errors: unknown = {}, status = 400): HttpError {
  return new HttpError(status, { success: false, message, errors });
}

/** Field-level validation errors, collected the way DRF serializers report them. */
export class Validator {
  errors: Record<string, string[]> = {};

  add(field: string, message: string) {
    (this.errors[field] ??= []).push(message);
  }

  get ok() {
    return Object.keys(this.errors).length === 0;
  }
}

export async function readJson(request: Request): Promise<Json> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Json) : {};
  } catch {
    return {};
  }
}

export function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

export function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number.parseInt(value, 10);
  return null;
}

/** DRF ChoiceField over 10/20/30, accepting numbers or numeric strings. */
export function countChoice(v: Validator, field: string, value: unknown, fallback = 10): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = toInt(value);
  if (parsed === null || ![10, 20, 30].includes(parsed)) {
    v.add(field, `"${str(value)}" is not a valid choice.`);
    return fallback;
  }
  return parsed;
}

export function difficultyChoice(v: Validator, value: unknown, fallback = "medium"): string {
  const difficulty = (str(value) || fallback).toLowerCase();
  if (!["easy", "medium", "hard"].includes(difficulty)) {
    v.add("difficulty", "Difficulty must be easy, medium, or hard.");
  }
  return difficulty;
}
