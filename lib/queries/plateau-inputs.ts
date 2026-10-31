import { createClient } from "@/lib/supabase/server";
import { dailyTargets, PROTEIN_G_PER_KG } from "@/lib/health/energy";
import type { ActivityLevel, BodyGoal, Sex } from "@/lib/health/energy";
import { FILTRO_SEM_DEMONSTRACAO } from "@/lib/queries/fetch-all";
import { computePeriodAdherence, type DoseLog } from "@/lib/medications/adherence";
import { ehDiaDeDose, type CamposDeCadencia } from "@/lib/medications/cadence";
import { localDateKey } from "@/lib/time/local-day";

/**
 * As entradas do checklist de platô que ainda não existiam em consulta nenhuma:
 * médias de alimentação, sono e adesão na janela.
 *
 * Volume e recuperação NÃO vêm daqui — já existem e a página os passa das
 * mesmas fontes que as outras telas usam. Buscá-los de novo aqui seria a
 * segunda leitura da mesma grandeza, que é o defeito recorrente deste app.
 */

export type PlateauInputs = {
  proteinaPorKg: number | null;
  alvoProteinaPorKg: number | null;
  kcalMedia: number | null;
  kcalAlvo: number | null;
  sonoHoras: number | null;
  adesao: number | null;
  /** Dias efetivamente cobertos pela janela — o texto da tela precisa dizer. */
  dias: number;
};

const VAZIO: PlateauInputs = {
  proteinaPorKg: null,
  alvoProteinaPorKg: null,
  kcalMedia: null,
  kcalAlvo: null,
  sonoHoras: null,
  adesao: null,
  dias: 0,
};

export async function getPlateauInputs(dias = 28): Promise<PlateauInputs> {
  const supabase = await createClient();
  if (!supabase) return VAZIO;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return VAZIO;

  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  const desdeIso = desde.toISOString();

  // Fuso antes do resto: o dia de cada série é o dia local (B7).
  const { data: fusoRow } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  const tz = (fusoRow as { timezone?: string | null } | null)?.timezone || "America/Sao_Paulo";
  const desdeDia = localDateKey(desdeIso, tz);
  const hojeDia = localDateKey(new Date().toISOString(), tz);

  const [perfilRes, pesoRes, refeicoesRes, sonoRes, medsRes, dosesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("sex, birth_year, height_cm, activity_level, body_goal")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("weight_logs")
      .select("weight_kg")
      .eq("user_id", user.id)
      .order("logged_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("meals")
      .select("calories, protein_g, eaten_at")
      .eq("user_id", user.id)
      .gte("eaten_at", desdeIso),
    supabase
      .from("health_snapshots")
      .select("sleep_hours")
      .eq("user_id", user.id)
      .or(FILTRO_SEM_DEMONSTRACAO)
      .gte("snapshot_date", desdeDia),
    supabase
      .from("medications")
      .select("id, reminder_times, cadence, cadence_weekday, cadence_interval_days, cadence_anchor_on")
      .eq("user_id", user.id)
      .eq("active", true),
    supabase
      .from("medication_logs")
      .select("medication_id, taken_at, confirmed")
      .eq("user_id", user.id)
      .gte("taken_at", desdeIso),
  ]);

  const p = perfilRes.data;
  const pesoKg = pesoRes.data?.weight_kg ? Number(pesoRes.data.weight_kg) : null;

  const refeicoes = (refeicoesRes.data ?? []) as {
    calories: number | null;
    protein_g: number | null;
    eaten_at: string;
  }[];

  // Média por DIA COM REGISTRO, não por dia do calendário. Dividir pelos 28
  // dias puniria quem registra só parte da semana: apareceria como "come
  // pouco" alguém que apenas anota pouco — e o checklist apontaria alimentação
  // por falta de registro, que é acusar sem medir.
  const diasComRefeicao = new Set(refeicoes.map((r) => localDateKey(r.eaten_at, tz)));
  const diasRegistrados = diasComRefeicao.size;

  const totalKcal = refeicoes.reduce((s, r) => s + (r.calories ?? 0), 0);
  const totalProteina = refeicoes.reduce((s, r) => s + (r.protein_g ?? 0), 0);

  const kcalMedia = diasRegistrados > 0 ? totalKcal / diasRegistrados : null;
  const proteinaMediaG = diasRegistrados > 0 ? totalProteina / diasRegistrados : null;
  const proteinaPorKg =
    proteinaMediaG != null && pesoKg && pesoKg > 0 ? proteinaMediaG / pesoKg : null;

  const objetivo = (p?.body_goal as BodyGoal | null) ?? null;
  const alvos =
    p?.sex && p.birth_year && p.height_cm && p.activity_level && pesoKg
      ? dailyTargets(
          {
            sex: p.sex as Sex,
            age: new Date().getFullYear() - p.birth_year,
            heightCm: p.height_cm,
            weightKg: pesoKg,
            activity: p.activity_level as ActivityLevel,
          },
          objetivo ?? "maintain"
        )
      : null;

  const noites = ((sonoRes.data ?? []) as { sleep_hours: number | null }[])
    .map((s) => s.sleep_hours)
    .filter((h): h is number => h != null && h > 0);
  const sonoHoras = noites.length ? noites.reduce((a, b) => a + b, 0) / noites.length : null;

  // Adesão da janela pela regra única (B8): janela por dose, cadência (semanal
  // não espera 7 doses), "Pulei hoje" fora (D16). Continua aproximação pelos
  // horários cadastrados HOJE — remédio incluído no meio da janela infla o
  // denominador para trás, e o texto do checklist diz isso.
  const logsPorRemedio = new Map<string, DoseLog[]>();
  for (const l of (dosesRes.data ?? []) as { medication_id: string; taken_at: string; confirmed: boolean | null }[]) {
    const lista = logsPorRemedio.get(l.medication_id) ?? [];
    lista.push({ taken_at: l.taken_at, confirmed: l.confirmed });
    logsPorRemedio.set(l.medication_id, lista);
  }
  let previstas = 0;
  let tomadas = 0;
  for (const m of (medsRes.data ?? []) as ({ id: string; reminder_times: string[] | null } & CamposDeCadencia)[]) {
    const a = computePeriodAdherence(
      m.reminder_times ?? [],
      logsPorRemedio.get(m.id) ?? [],
      tz,
      desdeDia,
      hojeDia,
      (dia) => ehDiaDeDose(m, dia)
    );
    previstas += a.expectedDoses;
    tomadas += Math.min(a.takenDoses, a.expectedDoses);
  }
  const adesao = previstas > 0 ? Math.min(1, tomadas / previstas) : null;

  return {
    proteinaPorKg,
    alvoProteinaPorKg: objetivo ? PROTEIN_G_PER_KG[objetivo] : null,
    kcalMedia,
    kcalAlvo: alvos?.calories ?? null,
    sonoHoras,
    adesao,
    dias: diasRegistrados,
  };
}
