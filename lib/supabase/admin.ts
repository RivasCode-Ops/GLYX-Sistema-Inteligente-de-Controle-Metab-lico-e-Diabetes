import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Cliente com service role — só no servidor, nunca no browser. */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.length || !serviceKey?.length) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
