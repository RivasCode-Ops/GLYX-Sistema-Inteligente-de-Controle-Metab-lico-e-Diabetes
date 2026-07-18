import type { SupabaseClient } from "@supabase/supabase-js";
import { BEVERAGE_META, isBeverageKind } from "@/lib/health/beverages";
import { computeHourlyPattern, worstHours } from "@/lib/insights/hourly-pattern";
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
    .select("timezone, primary_focus, body_goal, target_glucose_min, target_glucose_max")
    .eq("id", userId)
    .maybeSingle();
  const tz = profile?.timezone || "America/Sao_Paulo";
  const startOfDay = startOfLocalDayISO(profile?.timezone);
  const twoDaysAgo = new Date(Date.now() - 48 * 3600_000).toISOString();

  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const fiveDaysAgoDate = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);

  const [
    glucoseRes,
    mealsRes,
    insulinRes,
    beveragesRes,
    exerciseRes,
    weightRes,
    spikesRes,
    historyRes,
    medsRes,
    sleepRes,
    auditRes,
    alertsRes,
  ] = await Promise.all([
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
      supabase
        .from("meals")
        .select("name, carbs_g, eaten_at")
        .eq("user_id", userId)
        .eq("glucose_spike", true)
        .gte("eaten_at", new Date(Date.now() - 72 * 3600_000).toISOString())
        .order("eaten_at", { ascending: false })
        .limit(5),
      supabase
        .from("glucose_readings")
        .select("value_mg_dl, recorded_at")
        .eq("user_id", userId)
        .gte("recorded_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
        .order("recorded_at", { ascending: false })
        .limit(2000),
      supabase
        .from("medications")
        .select("id, name, dosage, reminder_times, kind")
        .eq("user_id", userId)
        .eq("active", true)
        .eq("kind", "med"),
      supabase
        .from("health_snapshots")
        .select("snapshot_date, source, sleep_hours")
        .eq("user_id", userId)
        .gte("snapshot_date", fiveDaysAgoDate)
        .not("sleep_hours", "is", null),
      supabase
        .from("metabolic_audits")
        .select("score, label, factors, computed_at")
        .eq("user_id", userId)
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("metabolic_alerts")
        .select("severity, title, created_at")
        .eq("user_id", userId)
        .gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const meds = medsRes.data ?? [];
  const medIds = meds.map((m) => m.id as string);
  const medLogCounts = new Map<string, number>();
  if (medIds.length) {
    const { data: medLogs } = await supabase
      .from("medication_logs")
      .select("medication_id")
      .eq("user_id", userId)
      .in("medication_id", medIds)
      .gte("taken_at", sevenDaysAgo);
    for (const l of medLogs ?? []) {
      const id = l.medication_id as string;
      medLogCounts.set(id, (medLogCounts.get(id) ?? 0) + 1);
    }
  }

  const linhas: string[] = [];

  if (profile?.primary_focus) {
    const foco = { diabetes: "controle do diabetes", lose: "emagrecer", gain: "ganhar massa" }[
      profile.primary_focus as "diabetes" | "lose" | "gain"
    ];
    if (foco) linhas.push(`Foco do usuário: ${foco}.`);
  }
  if (weightRes.data?.weight_kg) linhas.push(`Peso atual: ${weightRes.data.weight_kg} kg.`);
  linhas.push(
    `Faixa alvo de glicemia definida no app: ${profile?.target_glucose_min ?? 70}–${profile?.target_glucose_max ?? 180} mg/dL (ajustes de meta são decisão médica).`
  );

  const audit = auditRes.data as { score: number; label: string; factors: unknown; computed_at: string } | null;
  if (audit) {
    const factors = (Array.isArray(audit.factors) ? audit.factors : []) as {
      label?: string;
      severity?: string;
    }[];
    const topFactors = factors
      .slice(0, 3)
      .map((f) => `${f.label ?? "fator"}${f.severity ? ` (${f.severity})` : ""}`)
      .join(", ");
    linhas.push(
      `Mapa de risco (auditoria longitudinal mais recente, ${new Date(audit.computed_at).toLocaleDateString("pt-BR")}): score ${audit.score}/100, classificação "${audit.label}"${topFactors ? `. Principais fatores: ${topFactors}` : ""}.`
    );
  }

  const alerts = alertsRes.data ?? [];
  if (alerts.length) {
    linhas.push(
      `Alertas metabólicos recentes (48h, já notificados ao usuário no app): ${alerts
        .map((a) => `${a.title} (${a.severity}) às ${HORA(a.created_at, tz)}`)
        .join("; ")}.`
    );
  }

  if (meds.length) {
    linhas.push(
      `Medicação/insulina com horário programado (últimos 7 dias, doses REGISTRADAS no app — pode não refletir 100% da adesão real se o usuário esquecer de registrar): ${meds
        .map((m) => {
          const times = (m.reminder_times as string[] | null) ?? [];
          const expected = times.length * 7;
          const logged = medLogCounts.get(m.id as string) ?? 0;
          return `${m.name}${m.dosage ? ` (${m.dosage})` : ""} — ${times.length}×/dia, ${logged}/${expected} doses registradas`;
        })
        .join("; ")}.`
    );
  }

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

  const history = historyRes.data ?? [];
  if (history.length >= 20) {
    const targetMax = profile?.target_glucose_max ?? 180;
    const piores = worstHours(computeHourlyPattern(history, tz, targetMax));
    if (piores.length) {
      linhas.push(
        `Padrão por hora do dia (14 dias, fuso do usuário) — janelas com mais leituras ACIMA da meta: ${piores
          .map((b) => `${b.hour}h (média ${b.avg} mg/dL, ${b.pctAbove}% acima da meta em ${b.count} leituras)`)
          .join("; ")}.`
      );
    } else {
      linhas.push("Padrão por hora do dia (14 dias): nenhuma janela concentra leituras acima da meta.");
    }
  }

  const spikes = spikesRes.data ?? [];
  if (spikes.length) {
    linhas.push(
      `Refeições que causaram PICO glicêmico (72h, subida ≥50 mg/dL ou acima de 180 em até 2h): ${spikes
        .map((s) => `${s.name ?? "refeição"} (${s.carbs_g ?? "?"} g carb) às ${HORA(s.eaten_at, tz)}`)
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

  const SLEEP_SRC_PRIORITY = ["manual", "apple_health", "google_fit"];
  const sleepByDate = new Map<string, { hours: number; rank: number }>();
  for (const row of sleepRes.data ?? []) {
    const day = row.snapshot_date as string;
    const rank = SLEEP_SRC_PRIORITY.indexOf(row.source as string);
    if (rank === -1) continue;
    const existing = sleepByDate.get(day);
    if (!existing || rank < existing.rank) {
      sleepByDate.set(day, { hours: Number(row.sleep_hours), rank });
    }
  }
  if (sleepByDate.size) {
    const dias = [...sleepByDate.entries()].sort(([a], [b]) => a.localeCompare(b));
    linhas.push(
      `Sono (últimos dias com registro): ${dias
        .map(([day, v]) => `${new Date(day + "T12:00:00").toLocaleDateString("pt-BR")} — ${v.hours}h`)
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
