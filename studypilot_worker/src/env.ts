export interface Env {
  ASSETS: Fetcher;
  HYPERDRIVE?: Hyperdrive;

  DATABASE_URL: string;
  SECRET_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  PASSWORD_FN_SECRET: string;
  GOOGLE_CLIENT_ID?: string;

  DEEPSEEK_API_KEY: string;
  DEEPSEEK_BASE_URL: string;
  DEEPSEEK_MODEL: string;
  DEEPSEEK_TIMEOUT_SECONDS: string;

  YOUTUBE_API_KEY?: string;
  GOOGLE_BOOKS_API_KEY?: string;
  OPENALEX_EMAIL?: string;

  JWT_ACCESS_TOKEN_LIFETIME_MINUTES: string;
  JWT_REFRESH_TOKEN_LIFETIME_DAYS: string;
  MAX_EXTRACTED_TEXT_CHARS: string;
  MAX_DEEPSEEK_CONTEXT_CHARS: string;

  MEMWAL_ENABLED: string;
  MEMWAL_ACCOUNT_ID: string;
  MEMWAL_PRIVATE_KEY?: string;
}

export function intVar(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
