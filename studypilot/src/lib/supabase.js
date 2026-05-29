import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (import.meta.env.DEV) {
  console.log("Supabase URL exists:", Boolean(supabaseUrl));
  console.log("Supabase anon key exists:", Boolean(supabaseAnonKey));
  console.log("API base URL:", import.meta.env.VITE_API_BASE_URL);
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "studypilot_supabase_auth",
      }
    })
  : null;
