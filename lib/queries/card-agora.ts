import type { SupabaseClient } from "@supabase/supabase-js";
import { MATCH_BEFORE_MS, computeDoseStatus, doseWindows } from "@/lib/medications/adherence";
import { checkSubstanceSafety } from "@/lib/queries/substance-safety";
import { getContextReceipt } from "@/lib/queries/context-receipt";
import { resolveGlucoseTargets } from "@/lib/health/glucose-thresholds";
import { localDateKey } from "@/lib/time/local-day";
import { elegerCard, type CardAgora, type CardContext } from "@/lib/painel/card-agora";
import type { ContextReceipt } from "@/lib/ai/context-receipt";

/**
 * Monta o contexto do card do painel a partir do banco e elege o card.
 *
 * A ELEIÇÃO é do motor puro (`lib/painel/card-agora.ts`). Aqui só se lê o banco
 * e se preenche o contexto — nenhuma regra de prioridade mora neste arquivo, e
 * é isso que mantém a prioridade e as travas testáveis sem subir Postgres.
 */

/** Janela de ação da insulina rápida, em horas. */
const JANELA_INSULINA_RAPIDA_H = 5;

/** Dias de estoque abaixo dos quais o card de reposição aparece. */
const ESTOQUE_MINIMO_DIAS = 7;

export type CardAgoraResult = { card: CardAgora; receipt: ContextReceipt };

export async function getCardAgora(
  supabase: SupabaseClient,
  userId: string,
  entrada: {
    lastGlucose: number | null;
    lastGlucoseAt: string | null;
    glucoseTrend: "up" | "down" | "flat" | null;
    plannedWorkoutLabel: string | null;
    profile: { target_glucose_min?: number | null; target_glucose_max?: number | null; timezone?: string | null } | null;
  }
): Promise<CardAgoraResult> {
  const tz = entrada.profile?.timezone || "America/Sao_Paulo";
  const agora = new Date();
  const inicioDoDia = new Date(`${localDateKey(agora.toISOString(), tz)}T00:00:00Z`).toISOString();
  const janelaInsulina = new Date(
    agora.getTime() - JANELA_INSULINA_RAPIDA_H * 3600_000
  ).toISOString();

  const [receipt, planoRes, eventoRes, insulinaRes, medsRes, logsRes, snoozesRes, exercicioRes, refeicoesRes] =
    await Promise.all([
      getContextReceipt(supabase, userId, tz),
      supabase
        .from("hypo_plan")
        .select("correction_text, recheck_minutes, threshold_mg_dl, emergency_text")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("hypo_events")
        .select("id, detected_at, glucose_mg_dl, acted_at")
        .eq("user_id", userId)
        .is("recheck_at", null)
        .order("detected_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("insulin_logs")
        .select("applied_at")
        .eq("user_id", userId)
        .eq("insulin_kind", "rapida")
        .gte("applied_at", janelaInsulina)
        .order("applied_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("medications")
        .select("id, name, reminder_times, kind, stock_units, stock_updated_on")
        .eq("user_id", userId)
        .eq("active", true),
      supabase
        .from("medication_logs")
        .select("medication_id, taken_at")
        .eq("user_id", userId)
        .gte("taken_at", inicioDoDia),
      supabase
        .from("medication_snoozes")
        .select("medication_id, snoozed_until, scheduled_for")
        .eq("user_id", userId)
        .gte("created_at", inicioDoDia),
      supabase
        .from("exercise_sessions")
        .select("id")
        .eq("user_id", userId)
        .gte("started_at", inicioDoDia),
      supabase
        .from("meals")
        .select("name, carbs_g, eaten_at")
        .eq("user_id", userId)
        .order("eaten_at", { ascending: false })
        .limit(30),
    ]);

  const targets = resolveGlucoseTargets(entrada.profile);
  const meds = medsRes.data ?? [];
  const logs = (logsRes.data ?? []) as { medication_id: string | null; taken_at: string }[];
  const snoozes = (snoozesRes.data ?? []) as {
    medication_id: string;
    snoozed_until: string;
    scheduled_for?: string | null;
  }[];

  // Atraso e "em dia" saem da REGRA ÚNICA de casamento dose↔registro
  // (`lib/medications/adherence.ts`), a mesma da tela do dia e do relatório
  // médico. Uma terceira contagem aqui seria a divergência de novo.
  const [y, mo, d] = localDateKey(agora.toISOString(), tz).split("-").map(Number);
  const lateMedications: CardContext["lateMedications"] = [];
  let medicationsOnTime = 0;

  for (const m of meds) {
    const horarios = ((m.reminder_times as string[] | null) ?? []).filter((t) =>
      /^\d{1,2}:\d{2}$/.test(t)
    );
    if (!horarios.length) continue;
    const medLogs = logs.filter((l) => l.medication_id === m.id);
    const medSnoozes = snoozes.filter((s) => s.medication_id === m.id);
    const usados = new Set<string>();
    for (const w of doseWindows(horarios, y, mo, d, tz)) {
      const status = computeDoseStatus(
        w.scheduledUTC,
        w.windowEndUTC,
        medLogs,
        medSnoozes,
        usados,
        agora.getTime()
      );
      if (status.state === "tomada") medicationsOnTime += 1;
      if (status.state === "pendente") {
        lateMedications.push({
          name: m.name as string,
          scheduledAt: w.scheduledUTC.toISOString(),
          minutesLate: Math.floor((agora.getTime() - w.scheduledUTC.getTime()) / 60_000),
        });
      }
    }
  }

  // Estoque: doses/dia = número de horários, mínimo 1 — mesma conta da tela de
  // medicamentos.
  const lowStock: CardContext["lowStock"] = [];
  for (const m of meds) {
    const unidades = m.stock_units as number | null;
    if (unidades == null || !m.stock_updated_on) continue;
    const porDia = Math.max(((m.reminder_times as string[] | null) ?? []).length, 1);
    const decorridos = Math.max(
      0,
      Math.floor((agora.getTime() - new Date(m.stock_updated_on as string).getTime()) / 86_400_000)
    );
    const dias = Math.floor((unidades - decorridos * porDia) / porDia);
    if (dias <= ESTOQUE_MINIMO_DIAS) {
      lowStock.push({ name: m.name as string, units: unidades, daysLeft: Math.max(dias, 0) });
    }
  }

  // Interação grave dos suplementos ativos. Falha aqui não derruba o painel,
  // mas também não vira silêncio: sem veredito, o card simplesmente não é
  // eleito, e o SYSTEM do copiloto já manda declarar a checagem não executada.
  let blockedInteraction: CardContext["blockedInteraction"] = null;
  const suplementos = meds
    .filter((m) => m.kind === "supplement")
    .map((m) => m.name as string)
    .filter(Boolean);
  if (suplementos.length) {
    try {
      const verdict = await checkSubstanceSafety(supabase, userId, suplementos);
      const grave = verdict.findings.find((f) => f.severity === "grave");
      if (verdict.blocked && grave) blockedInteraction = { message: grave.message };
    } catch {
      /* sem veredito, sem card */
    }
  }

  const refeicoes = (refeicoesRes.data ?? []) as {
    name: string | null;
    carbs_g: number | null;
    eaten_at: string;
  }[];
  const carbs = refeicoes.map((m) => m.carbs_g ?? 0).filter((c) => c > 0).sort((a, b) => a - b);
  const medianMealCarbs = carbs.length ? carbs[Math.floor(carbs.length / 2)] : null;
  const ultima = refeicoes[0];

  const insulina = insulinaRes.data as { applied_at: string } | null;
  const evento = eventoRes.data as {
    id: string;
    detected_at: string;
    glucose_mg_dl: number;
    acted_at: string | null;
  } | null;

  const ctx: CardContext = {
    now: agora,
    timezone: tz,
    lastGlucose: entrada.lastGlucose,
    lastGlucoseAt: entrada.lastGlucoseAt,
    glucoseTrend: entrada.glucoseTrend,
    targetRange: { low: targets.targetMin, high: targets.targetMax },
    hypoPlan: planoRes.data
      ? {
          correctionText: planoRes.data.correction_text as string,
          recheckMinutes: planoRes.data.recheck_minutes as number,
          thresholdMgDl: planoRes.data.threshold_mg_dl as number,
          emergencyText: (planoRes.data.emergency_text as string | null) ?? null,
        }
      : null,
    openHypoEvent: evento
      ? {
          id: evento.id,
          detectedAt: evento.detected_at,
          glucoseMgDl: evento.glucose_mg_dl,
          actedAt: evento.acted_at,
        }
      : null,
    rapidInsulin: insulina
      ? {
          appliedAt: insulina.applied_at,
          minutesAgo: Math.floor(
            (agora.getTime() - new Date(insulina.applied_at).getTime()) / 60_000
          ),
        }
      : null,
    blockedInteraction,
    lateMedications,
    lowStock,
    receiptMissing: receipt.missing,
    exerciseSessionToday: (exercicioRes.data ?? []).length > 0,
    exerciseStartingNow: false,
    plannedWorkoutLabel: entrada.plannedWorkoutLabel,
    // O app ainda não tem preferência de horário de treino cadastrada. Sem ela,
    // `janela_exercicio` NÃO é eleito — que é o lado seguro: o card de treino só
    // aparece quando houver o dado, em vez de o app escolher a hora por conta.
    withinPreferredExerciseWindow: false,
    lastMeal: ultima
      ? {
          name: ultima.name ?? "refeição",
          carbs: ultima.carbs_g ?? 0,
          minutesAgo: Math.floor((agora.getTime() - new Date(ultima.eaten_at).getTime()) / 60_000),
        }
      : null,
    medianMealCarbs,
    // O motor de insights ainda não expõe padrão semanal com contagem no
    // formato que o card exige. Sem contagem não há padrão — a mesma régua do
    // MuscleMind, aplicada por ausência.
    weekPattern: null,
    medicationsOnTime,
  };

  return { card: elegerCard(ctx), receipt };
}

export { MATCH_BEFORE_MS };
