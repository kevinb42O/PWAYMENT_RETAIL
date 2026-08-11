import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.generated";

const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const configuredKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(configuredUrl && configuredKey);

// Non-production fallbacks keep unit-test module imports deterministic. Auth
// methods reject through requireSupabaseConfiguration before using them.
export const supabase = createClient<Database>(
  configuredUrl || "http://127.0.0.1:54321",
  configuredKey || "supabase-not-configured",
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  },
);

export const requireSupabaseConfiguration = (): void => {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is niet geconfigureerd. Stel VITE_SUPABASE_URL en VITE_SUPABASE_PUBLISHABLE_KEY in.",
    );
  }
};
