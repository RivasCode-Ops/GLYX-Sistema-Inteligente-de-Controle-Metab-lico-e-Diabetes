import type { SupabaseClient } from "@supabase/supabase-js";
import { BEVERAGE_META, isBeverageKind } from "@/lib/health/beverages";
import { startOfLocalDayISO } from "@/lib/time/local-day";

// Contexto compacto dos dados recentes do usuário para o copiloto de IA:
// glicemia, refeições, insulina extra, bebidas, água e exercício. Sem isso o
// chat conversa "às cegas". Montado no servidor (sessão do usuário, RLS) e
// injetado como mensagem de sistema — o modelo lê, mas nunca prescreve dose.

const HORA = (iso: string, tz: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export async function buildUserContext(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, primary_focus, body_goal")
    .eq("id", userId)
    .maybeSingle();
  const tz = profile?.timezone || "America/Sao_Paulo";
  const startOfDay = startOfLocalDayISO(profile?.timezone);
  const twoDaysAgo = new Date(Date.now() - 48 * 3600_000).toISOString();

  const [glucoseRes, mealsRes, insulinRes, beveragesRes, exerciseRes, weightRes] =
    await Promise.all([
      supabase
        .from("glucose_readings")
        .select("value_mg_dl, recorded_at, source")
        .eq("user_id", userId)
        .order("recorded_at", { ascending: false })
        .limit(8),
      supabase
        .from("meals")
        .select("name, calories, carbs_g, eaten_at")
        .eq("user_id", userId)
        .gte("eaten_at", startOfDay)
        .order("eaten_at", { ascending: true }),
      supabase
        .from("insulin_logs")
        .select("units, insulin_kind, reason, glucose_mg_dl, applied_at")
        .eq("user_id", userId)
        .gte("applied_at", twoDaysAgo)
        .order("applied_at", { ascending: false })
        .limit(10),
      supabase
        .from("water_logs")
        .select("amount_ml, kind")
        .eq("user_id", userId)
        .gte("logged_at", startOfDay),
      supabase
        .from("exercise_sessions")
        .select("label, duration_min, started_at")
        .eq("user_id", userId)
        .gte("started_at", twoDaysAgo)
        .order("started_at", { ascending: false })
        .limit(5),
      supabase
        .from("weight_logs")
        .select("weight_kg")
        .eq("user_id", userId)
        .order("logged_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const linhas: string[] = [];

  if (profile?.primary_focus) {
    const foco = { diabetes: "controle do diabetes", lose: "emagrecer", gain: "ganhar massa" }[
      profile.primary_focus as "diabetes" | "lose" | "gain"
    ];
    if (foco) linhas.push(`Foco do usuário: ${foco}.`);
  }
  if (weightRes.data?.weight_kg) linhas.push(`Peso atual: ${weightRes.data.weight_kg} kg.`);

  const gl = glucoseRes.data ?? [];
  if (gl.length) {
    linhas.push(
      `Glicemia recente (mg/dL): ${gl
        .map((g) => `${g.value_mg_dl} às ${HORA(g.recorded_at, tz)}${g.source === "manual" ? " (manual)" : ""}`)
        .join("; ")}.`
    );
  }

  const meals = mealsRes.data ?? [];
  if (meals.length) {
    linhas.push(
      `Refeições de hoje: ${meals
        .map((m) => `${m.name ?? "refeição"} (${m.carbs_g ?? "?"} g carb) às ${HORA(m.eaten_at, tz)}`)
        .join("; ")}.`
    );
  }

  const ins = insulinRes.data ?? [];
  if (ins.length) {
    const motivo: Record<string, string> = { correcao: "correção", refeicao: "refeição", outra: "outro" };
    linhas.push(
      `Insulina extra registrada (últimas 48h): ${ins
        .map(
          (i) =>
            `${i.units} U ${i.insulin_kind} (${motivo[i.reason] ?? i.reason}) às ${HORA(i.applied_at, tz)}${
              i.glucose_mg_dl ? ` com glicemia ${i.glucose_mg_dl}` : ""
            }`
        )
        .join("; ")}.`
    );
  }

  const bev = beveragesRes.data ?? [];
  if (bev.length) {
    const porTipo = new Map<string, { count: number; ml: number }>();
    for (const b of bev) {
      const kind = b.kind ?? "agua";
      const cur = porTipo.get(kind) ?? { count: 0, ml: 0 };
      cur.count += 1;
      cur.ml += b.amount_ml ?? 0;
      porTipo.set(kind, cur);
    }
    linhas.push(
      `Bebidas de hoje: ${[...porTipo.entries()]
        .map(([kind, v]) => {
          const label = isBeverageKind(kind) ? BEVERAGE_META[kind].label : kind;
          return `${v.count}× ${label} (${v.ml} ml)`;
        })
        .join("; ")}.`
    );
  }

  const ex = exerciseRes.data ?? [];
  if (ex.length) {
    linhas.push(
      `Exercício (48h): ${ex
        .map((e) => `${e.label}${e.duration_min ? ` ${e.duration_min} min` : ""} em ${HORA(e.started_at, tz)}`)
        .join("; ")}.`
    );
  }

  if (!linhas.length) return "";

  return (
    "DADOS RECENTES DO USUÁRIO (somente leitura, use para contextualizar as respostas; " +
    "horários no fuso do usuário):\n- " +
    linhas.join("\n- ")
  );
}
