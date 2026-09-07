import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildContextReceipt,
  divergenciaAlimentacao,
  divergenciaExercicio,
  divergenciaInsulina,
  divergenciaMedicacao,
  type ContextReceipt,
} from "@/lib/ai/context-receipt";
import { startOfLocalDayISO } from "@/lib/time/local-day";

/**
 * Monta o recibo de contexto a partir do banco — implementação ÚNICA.
 *
 * O prompt do copiloto e o bloco do painel leem daqui. Duas montagens do mesmo
 * recibo seriam duas verdades sobre o que o app sabe, e a tela poderia dizer
 * "sem registro" enquanto o modelo recebe um número — que é a divergência que
 * este recibo existe para detectar.
 *
 * As consultas são de CONTAGEM (`head: true`), não de linhas: o recibo precisa
 * saber quantos, não quais. A única exceção é exercício, que precisa somar
 * duração para detectar a divergência de sessão com 0 min.
 */

/** Janelas de cada fonte, definidas num lugar só. */
function janelas(timezone: string | null | undefined, agora = new Date()) {
  const iso = (ms: number) => new Date(agora.getTime() - ms).toISOString();
  const to = agora.toISOString();
  return {
    hoje: { from: startOfLocalDayISO(timezone, agora), to },
    duasSemanas: { from: iso(14 * 86_400_000), to },
    doisDias: { from: iso(48 * 3600_000), to },
    tresDias: { from: iso(72 * 3600_000), to },
    seteDias: { from: iso(7 * 86_400_000), to },
    cincoDias: { from: iso(5 * 86_400_000), to },
  };
}

export async function getContextReceipt(
  supabase: SupabaseClient,
  userId: string,
  timezone?: string | null
): Promise<ContextReceipt> {
  const j = janelas(timezone);
  const contar = (tabela: string) =>
    supabase.from(tabela).select("id", { count: "exact", head: true }).eq("user_id", userId);

  const [
    glicemia,
    refeicoes,
    picos,
    exercicios,
    medicamentos,
    dosesOrfas,
    insulina,
    insulinaOutra,
    sono,
    alertas,
    auditoria,
  ] = await Promise.all([
    contar("glucose_readings").gte("recorded_at", j.duasSemanas.from),
    contar("meals").gte("eaten_at", j.hoje.from),
    contar("meals").eq("glucose_spike", true).gte("eaten_at", j.tresDias.from),
    // Única consulta de linhas: a divergência de exercício precisa da soma de
    // duração, não só da contagem.
    supabase
      .from("exercise_sessions")
      .select("duration_min")
      .eq("user_id", userId)
      .gte("started_at", j.doisDias.from),
    contar("medications").eq("active", true),
    contar("medication_logs").is("medication_id", null).gte("taken_at", j.seteDias.from),
    contar("insulin_logs").gte("applied_at", j.doisDias.from),
    contar("insulin_logs").eq("insulin_kind", "outra").gte("applied_at", j.seteDias.from),
    contar("health_snapshots")
      .not("sleep_hours", "is", null)
      .gte("snapshot_date", j.cincoDias.from.slice(0, 10)),
    contar("metabolic_alerts").gte("created_at", j.doisDias.from),
    contar("metabolic_audits"),
  ]);

  const sessoes = exercicios.data ?? [];
  const minutosDeExercicio = sessoes.reduce(
    (s, e) => s + ((e.duration_min as number | null) ?? 0),
    0
  );
  const n = (r: { count: number | null }) => r.count ?? 0;

  return buildContextReceipt(userId, {
    glicemia: {
      count: n(glicemia),
      summary: `${n(glicemia)} leitura(s) em 14 dias`,
      window: j.duasSemanas,
    },
    alimentacao: {
      count: n(refeicoes),
      summary: `${n(refeicoes)} refeição(ões) hoje`,
      window: j.hoje,
      divergence: divergenciaAlimentacao({
        spikeMeals: n(picos),
        glucoseReadingsAfterSpike: n(glicemia),
      }),
    },
    exercicio: {
      count: sessoes.length,
      summary: `${sessoes.length} sessão(ões), ${minutosDeExercicio} min`,
      window: j.doisDias,
      divergence: divergenciaExercicio({
        sessions: sessoes.length,
        totalMinutes: minutosDeExercicio,
      }),
    },
    medicacao: {
      count: n(medicamentos),
      summary: `${n(medicamentos)} item(ns) ativo(s)`,
      window: j.seteDias,
      divergence: divergenciaMedicacao({ orphanLogs: n(dosesOrfas) }),
    },
    insulina: {
      count: n(insulina),
      summary: `${n(insulina)} registro(s) em 48h`,
      window: j.doisDias,
      divergence: divergenciaInsulina({ kindOther: n(insulinaOutra) }),
    },
    sono: {
      count: n(sono),
      summary: `${n(sono)} noite(s) com registro`,
      window: j.cincoDias,
    },
    alertas_48h: {
      count: n(alertas),
      summary: `${n(alertas)} alerta(s)`,
      window: j.doisDias,
    },
    mapa_risco: {
      count: n(auditoria) > 0 ? 1 : 0,
      summary: "auditoria calculada",
      window: j.seteDias,
    },
  });
}
