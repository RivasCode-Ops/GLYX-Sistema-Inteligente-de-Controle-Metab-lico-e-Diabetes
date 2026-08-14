import { createClient } from "@/lib/supabase/server";
import {
  GLUCOSE_INSIGHT_MODULE,
  persistFindings,
  runCorrelationEngine,
} from "@/lib/insights/v2/engine";
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

/**
 * Calcula as correlações de glicemia na primeira visita, quando ainda não há
 * nenhuma gravada.
 *
 * Roda no caminho de leitura de propósito, e isso merece justificativa: escrever
 * durante o render de uma página é coisa que normalmente se evita. Aqui o que
 * pesa mais é que o motor é heurística local — algumas consultas e aritmética,
 * sem chamada de IA, sem custo por execução — e que a alternativa em vigor
 * deixou a análise vazia desde sempre.
 *
 * Só dispara com a lista vazia. Com achados gravados, quem atualiza é o botão:
 * sem essa guarda, um usuário cujo motor legitimamente não encontra nada pagaria
 * o cálculo inteiro a cada visita, para sempre.
 *
 * Falha em silêncio devolvendo lista vazia — a tela já sabe mostrar "sem
 * resultados ainda", e derrubar a página de análise porque o cálculo automático
 * falhou seria trocar uma tela incompleta por nenhuma.
 */
export async function computeInsightsIfEmpty(windowDays = 14): Promise<InsightFinding[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  try {
    const findings = await runCorrelationEngine(supabase, user.id, windowDays);
    if (!findings.length) return [];

    const saved = await persistFindings(supabase, user.id, findings, GLUCOSE_INSIGHT_MODULE);
    if (saved.error) return [];

    return listInsightFindings(GLUCOSE_INSIGHT_MODULE);
  } catch {
    return [];
  }
}
