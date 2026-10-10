import { createClient } from "@supabase/supabase-js";

export function createSupabaseAuth(url: string, anonKey: string) {
  return createClient(url, anonKey);
}
