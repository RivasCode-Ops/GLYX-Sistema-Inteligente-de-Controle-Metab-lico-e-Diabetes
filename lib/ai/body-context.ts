/**
 * Bloco de composição corporal para o contexto do chat.
 *
 * Separado de `user-context.ts` e deliberadamente enxuto: o chat roda a cada
 * mensagem, então aqui entram só as duas últimas medições e as metas — não o
 * snapshot completo do módulo (que faz 8 consultas e serve à tela e ao
 * relatório). Sem isso, perguntas como "estou ganhando músculo ou gordura?"
 * seriam respondidas às cegas pelo modelo, que é exatamente o que o app evita.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { BODY_FIELD_KEYS, type BodyMeasurement } from "@/lib/body/fields";
import { computeComposition, METHOD_LABEL, type Sex } from "@/lib/body/composition";
import { computeProgress, progressSummary } from "@/lib/body/progress";
import { computeAllGoalProgress, projectionMessage, type BodyGoalRow } from "@/lib/body/goals";

function toMeasurement(row: Record<string, unknown>): BodyMeasurement {
  const out: BodyMeasurement = { measured_on: String(row.measured_on) };
  for (const key of BODY_FIELD_KEYS) {
    const raw = row[key];
    if (raw == null) continue;
    const num = Number(raw);
    if (Number.isFinite(num)) out[key] = num;
  }
  return out;
}

export async function buildBodyContextLines(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const [profileRes, measurementsRes, goalsRes] = await Promise.all([
    supabase.from("profiles").select("sex, birth_year, height_cm").eq("id", userId).maybeSingle(),
    supabase
      .from("body_measurements")
      .select("*")
      .eq("user_id", userId)
      .order("measured_on", { ascending: false })
      .limit(6),
    supabase
      .from("body_goals")
      .select("metric, target_value, start_value, start_on, target_date")
      .eq("user_id", userId),
  ]);

  const rows = (measurementsRes.data ?? []) as Record<string, unknown>[];
  if (!rows.length) return [];

  const profile = profileRes.data as
    | { sex: Sex | null; birth_year: number | null; height_cm: number | null }
    | null;
  const ageYears = profile?.birth_year ? new Date().getFullYear() - profile.birth_year : null;

  // Vieram em ordem decrescente; o resto do módulo trabalha em ordem cronológica.
  const history = rows.map(toMeasurement).reverse();
  const latest = history[history.length - 1];
  const previous = history.length > 1 ? history[history.length - 2] : null;

  const compositionOf = (m: BodyMeasurement) =>
    computeComposition({
      measurement: m,
      sex: profile?.sex ?? null,
      ageYears,
      heightCm: profile?.height_cm ?? null,
    });

  const latestComposition = compositionOf(latest);
  const lines: string[] = [];

  const parts: string[] = [];
  if (latestComposition.weightKg != null) parts.push(`peso ${latestComposition.weightKg} kg`);
  if (latestComposition.bodyFatPercent != null) {
    parts.push(
      `gordura estimada ${latestComposition.bodyFatPercent}% (${
        latestComposition.bodyFatMethod ? METHOD_LABEL[latestComposition.bodyFatMethod] : "—"
      })`
    );
  }
  if (latestComposition.leanMassKg != null) {
    parts.push(`massa magra ${latestComposition.leanMassKg} kg`);
  }
  if (latestComposition.waistToHeight != null) {
    parts.push(`cintura/altura ${latestComposition.waistToHeight}`);
  }
  if (parts.length) {
    lines.push(
      `Composição corporal (medição de ${latest.measured_on}): ${parts.join(", ")}. Percentual de gordura por fita/dobra é estimativa com erro de 3-4 pontos — falar de tendência, nunca do valor absoluto.`
    );
  }

  if (previous) {
    const progress = computeProgress(
      { measurement: previous, composition: compositionOf(previous) },
      { measurement: latest, composition: latestComposition }
    );
    lines.push(
      `Evolução corporal já classificada pelo sistema (${progress.fromDate} → ${progress.toDate}): ${progress.verdict.headline}. ${progressSummary(progress)} Usar esta classificação, não recalcular.`
    );
  }

  const goals = computeAllGoalProgress((goalsRes.data ?? []) as BodyGoalRow[], history);
  if (goals.length) {
    lines.push(
      `Metas corporais: ${goals
        .map((g) => `${g.label} ${g.current ?? "?"}→${g.target} ${g.unit} (${projectionMessage(g)})`)
        .join(" | ")}`
    );
  }

  return lines;
}
