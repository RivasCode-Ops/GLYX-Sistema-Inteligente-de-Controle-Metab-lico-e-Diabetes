import { createClient } from "@/lib/supabase/server";

export type TimelineItem = {
  type: "glicemia" | "refeição" | "medicação" | "exercício" | "insulina";
  id: string;
  at: string;
  label: string;
  detail: string;
};

const INSULIN_REASON_LABEL: Record<string, string> = {
  correcao: "correção",
  refeicao: "refeição",
  outra: "outro",
};

export async function getTimeline(): Promise<TimelineItem[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [gRes, mRes, medRes, exRes, insRes] = await Promise.all([
    supabase
      .from("glucose_readings")
      .select("id, value_mg_dl, recorded_at")
      .eq("user_id", user.id)
      .order("recorded_at", { ascending: false })
      .limit(25),
    supabase
      .from("meals")
      .select("id, name, eaten_at")
      .eq("user_id", user.id)
      .order("eaten_at", { ascending: false })
      .limit(25),
    supabase
      .from("medication_logs")
      .select("id, taken_at, medications(name)")
      .eq("user_id", user.id)
      .order("taken_at", { ascending: false })
      .limit(25),
    supabase
      .from("exercise_sessions")
      .select("id, label, started_at, duration_min")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(25),
    supabase
      .from("insulin_logs")
      .select("id, units, reason, glucose_mg_dl, applied_at")
      .eq("user_id", user.id)
      .order("applied_at", { ascending: false })
      .limit(25),
  ]);

  const items: TimelineItem[] = [];

  for (const g of gRes.data ?? []) {
    items.push({
      type: "glicemia",
      id: g.id,
      at: g.recorded_at,
      label: "Glicemia",
      detail: `${g.value_mg_dl} mg/dL`,
    });
  }

  for (const m of mRes.data ?? []) {
    items.push({
      type: "refeição",
      id: m.id,
      at: m.eaten_at,
      label: "Refeição",
      detail: m.name ?? "—",
    });
  }

  for (const d of medRes.data ?? []) {
    const medName = (d.medications as unknown as { name?: string } | null)?.name;
    items.push({
      type: "medicação",
      id: d.id,
      at: d.taken_at,
      label: "Dose tomada",
      detail: medName ?? "—",
    });
  }

  for (const e of exRes.data ?? []) {
    items.push({
      type: "exercício",
      id: e.id,
      at: e.started_at,
      label: "Exercício",
      detail: e.duration_min != null ? `${e.label} · ${e.duration_min} min` : e.label,
    });
  }

  for (const i of insRes.data ?? []) {
    const motivo = INSULIN_REASON_LABEL[i.reason] ?? i.reason;
    items.push({
      type: "insulina",
      id: i.id,
      at: i.applied_at,
      label: "Insulina extra",
      detail: `${i.units} U (${motivo})${i.glucose_mg_dl ? ` · glicemia ${i.glucose_mg_dl}` : ""}`,
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return items.slice(0, 60);
}
