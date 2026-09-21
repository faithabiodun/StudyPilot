// Just enough of DRF's field coercion to accept the same payloads and reject
// them with the same messages as the Django serializers did.

import type { Validator } from "../http";

export interface CharSpec {
  maxLength: number;
  allowBlank?: boolean;
}

export function charField(v: Validator, field: string, value: unknown, spec: CharSpec): string | undefined {
  if (value === null) {
    v.add(field, "This field may not be null.");
    return undefined;
  }
  if (typeof value === "boolean" || (typeof value !== "string" && typeof value !== "number")) {
    v.add(field, "Not a valid string.");
    return undefined;
  }
  const text = String(value).trim(); // trim_whitespace=True
  if (!text && !spec.allowBlank) {
    v.add(field, "This field may not be blank.");
    return undefined;
  }
  if (text.length > spec.maxLength) {
    v.add(field, `Ensure this field has no more than ${spec.maxLength} characters.`);
    return undefined;
  }
  return text;
}

export function smallPositiveInt(v: Validator, field: string, value: unknown): number | null | undefined {
  if (value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed)) {
    v.add(field, "A valid integer is required.");
    return undefined;
  }
  if (parsed < 0) {
    v.add(field, "Ensure this value is greater than or equal to 0.");
    return undefined;
  }
  if (parsed > 32767) {
    v.add(field, "Ensure this value is less than or equal to 32767.");
    return undefined;
  }
  return parsed;
}

const URL_RE = /^(?:https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;

export function urlField(v: Validator, field: string, value: unknown, maxLength = 200): string | undefined {
  const text = charField(v, field, value, { maxLength, allowBlank: true });
  if (text === undefined) return undefined;
  if (text && !URL_RE.test(text)) {
    v.add(field, "Enter a valid URL.");
    return undefined;
  }
  return text;
}

// Close to Django's EmailValidator for the cases a sign-up form produces.
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

export function emailField(v: Validator, field: string, value: unknown): string | undefined {
  if (value === undefined) {
    v.add(field, "This field is required.");
    return undefined;
  }
  const text = charField(v, field, value, { maxLength: 254 });
  if (text === undefined) return undefined;
  if (!EMAIL_RE.test(text)) {
    v.add(field, "Enter a valid email address.");
    return undefined;
  }
  return text;
}

export function required(v: Validator, field: string, value: unknown): boolean {
  if (value === undefined) {
    v.add(field, "This field is required.");
    return false;
  }
  return true;
}
