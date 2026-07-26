import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveGlucoseTargets, SEVERE_HYPER_MG_DL } from "@/lib/health/glucose-thresholds";
import { computePeriodAdherence } from "@/lib/medications/adherence";
import { localDateKey, localDayRangeUTC } from "@/lib/time/local-day";
import type { MetabolicAuditRow } from "@/lib/audit/types";

export type ReportExtreme = { day: string; count: number; firstAt: string; peak: number };

export type ReportMedAdherence = {
  name: string;
  dosage: string | null;
  timesPerDay: number;
  expectedDoses: number;
  loggedDoses: number;
  /** Registros que não casaram com nenhuma dose agendada (dose extra ou duplicidade). */
  extraLogs: number;
};

export type MedicalReportData = {
  patientName: string | null;
  diabetesType: string | null;
  targetMin: number;
  targetMax: number;
  audit: MetabolicAuditRow;
  hyperDays: ReportExtreme[];
  hypoDays: ReportExtreme[];
  medications: ReportMedAdherence[];
  generatedAt: string;
};

/** Junta o que o Mapa de risco já calcula (score.ts) com o que falta pra um
 * médico ler em 90s: extremos com data/hora (não só contagem), e adesão à
 * medicação real (medications x medication_logs) — nenhum dos dois dado
 * aparece hoje em nenhuma tela do app.
 *
 * Os "extremos" de hiper usam `SEVERE_HYPER_MG_DL` (fixo), não a meta do
 * usuário: aqui é evento clínico, não tempo fora do alvo. Ver
 * lib/health/glucose-thresholds.ts. */
export async function buildMedicalReportData(
  supabase: SupabaseClient,
  userId: string
): Promise<MedicalReportData | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, diabetes_type, target_glucose_min, target_glucose_max, timezone")
    .eq("id", userId)
    .maybeSingle();

  const { data: auditRows } = await supabase
    .from("metabolic_audits")
    .select("*")
    .eq("user_id", userId)
    .order("computed_at", { ascending: false })
    .limit(1);
  const audit = (auditRows?.[0] as MetabolicAuditRow | undefined) ?? null;
  if (!audit) return null;

  const tz = profile?.timezone || "America/Sao_Paulo";
  const { targetMin, targetMax } = resolveGlucoseTargets(profile);

  const { startISO } = localDayRangeUTC(audit.period_start, tz);
  const { endISO } = localDayRangeUTC(audit.period_end, tz);

  const { data: readings } = await supabase
    .from("glucose_readings")
    .select("recorded_at, value_mg_dl")
    .eq("user_id", userId)
    .gte("recorded_at", startISO)
    .lt("recorded_at", endISO);

  const hyperByDay = new Map<string, { count: number; firstAt: string; peak: number }>();
  const hypoByDay = new Map<string, { count: number; firstAt: string; peak: number }>();
  for (const r of readings ?? []) {
    const value = Number(r.value_mg_dl);
    const recordedAt = r.recorded_at as string;
    const day = localDateKey(recordedAt, tz);
    if (value >= SEVERE_HYPER_MG_DL) {
      const cur = hyperByDay.get(day);
      if (!cur) hyperByDay.set(day, { count: 1, firstAt: recordedAt, peak: value });
      else {
        cur.count += 1;
        cur.peak = Math.max(cur.peak, value);
        if (recordedAt < cur.firstAt) cur.firstAt = recordedAt;
      }
    } else if (value < targetMin) {
      const cur = hypoByDay.get(day);
      if (!cur) hypoByDay.set(day, { count: 1, firstAt: recordedAt, peak: value });
      else {
        cur.count += 1;
        cur.peak = Math.min(cur.peak, value);
        if (recordedAt < cur.firstAt) cur.firstAt = recordedAt;
      }
    }
  }
  const toSorted = (m: Map<string, { count: number; firstAt: string; peak: number }>): ReportExtreme[] =>
    [...m.entries()]
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => a.day.localeCompare(b.day));

  const { data: meds } = await supabase
    .from("medications")
    .select("id, name, dosage, reminder_times")
    .eq("user_id", userId)
    .eq("active", true)
    .eq("kind", "med")
    .not("reminder_times", "is", null);

  const medIds = (meds ?? []).map((m) => m.id as string);
  const logsByMed = new Map<string, { taken_at: string }[]>();
  if (medIds.length) {
    const { data: logs } = await supabase
      .from("medication_logs")
      .select("medication_id, taken_at")
      .eq("user_id", userId)
      .in("medication_id", medIds)
      .gte("taken_at", startISO)
      .lt("taken_at", endISO);
    for (const l of (logs ?? []) as { medication_id: string; taken_at: string }[]) {
      const list = logsByMed.get(l.medication_id) ?? [];
      list.push({ taken_at: l.taken_at });
      logsByMed.set(l.medication_id, list);
    }
  }

  // Mesma regra da tela do dia (lib/medications/adherence.ts): registro casa
  // com dose agendada por janela, e cada registro conta uma vez só. Antes aqui
  // era contagem bruta de logs, que inflava a adesão de quem clicou duas vezes
  // ou registrou dose extra — e o número frouxo era justamente o que ia para o
  // médico.
  const medications: ReportMedAdherence[] = (meds ?? []).map((m) => {
    const times = (m.reminder_times as string[] | null) ?? [];
    const adherence = computePeriodAdherence(
      times,
      logsByMed.get(m.id as string) ?? [],
      tz,
      audit.period_start,
      audit.period_end
    );
    return {
      name: m.name as string,
      dosage: (m.dosage as string | null) ?? null,
      timesPerDay: times.length,
      expectedDoses: adherence.expectedDoses,
      loggedDoses: adherence.takenDoses,
      extraLogs: adherence.unmatchedLogs,
    };
  });

  return {
    patientName: (profile?.full_name as string | null) ?? null,
    diabetesType: (profile?.diabetes_type as string | null) ?? null,
    targetMin,
    targetMax,
    audit,
    hyperDays: toSorted(hyperByDay),
    hypoDays: toSorted(hypoByDay),
    medications,
    generatedAt: new Date().toISOString(),
  };
}
