import { createClient } from "@/lib/supabase/server";
import { dailyTargets, PROTEIN_G_PER_KG } from "@/lib/health/energy";
import type { ActivityLevel, BodyGoal, Sex } from "@/lib/health/energy";

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
  const desdeDia = desdeIso.slice(0, 10);

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
      .gte("snapshot_date", desdeDia),
    supabase
      .from("medications")
      .select("reminder_times")
      .eq("user_id", user.id)
      .eq("active", true),
    supabase
      .from("medication_logs")
      .select("id")
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
  const diasComRefeicao = new Set(refeicoes.map((r) => r.eaten_at.slice(0, 10)));
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

  // Adesão da janela: registros contra o previsto pelos horários cadastrados
  // HOJE. É aproximação, e o texto do checklist diz isso em voz alta — remédio
  // incluído no meio da janela infla o denominador para trás.
  const horariosPorDia = ((medsRes.data ?? []) as { reminder_times: string[] | null }[]).reduce(
    (s, m) => s + (m.reminder_times ?? []).length,
    0
  );
  const previstas = horariosPorDia * dias;
  const registradas = (dosesRes.data ?? []).length;
  const adesao = previstas > 0 ? Math.min(1, registradas / previstas) : null;

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
