import { createClient } from "@/lib/supabase/server";
import type { InsightFinding, InsightModule } from "@/types/database";

/**
 * `insight_findings` é compartilhada entre módulos. O filtro por `module` é
 * obrigatório de propósito: sem ele, o achado de um módulo apareceria na tela
 * de outro, e o esquecimento seria invisível — a query continuaria retornando
 * linhas, só que as erradas.
 */
export async function listInsightFindings(module: InsightModule): Promise<InsightFinding[]> {
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
    .eq("module", module)
    .order("computed_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as InsightFinding[];
}
