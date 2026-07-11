import { createClient } from "@/lib/supabase/server";
import type { InsightFinding } from "@/types/database";

export async function listInsightFindings(): Promise<InsightFinding[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("insight_findings")
    .select("*")
    .eq("user_id", user.id)
    .order("computed_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as InsightFinding[];
}
