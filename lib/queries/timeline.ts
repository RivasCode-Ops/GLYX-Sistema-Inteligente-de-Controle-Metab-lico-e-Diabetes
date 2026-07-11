import { createClient } from "@/lib/supabase/server";

export type TimelineItem =
  | {
      type: "glicemia";
      id: string;
      at: string;
      label: string;
      detail: string;
    }
  | {
      type: "refeição";
      id: string;
      at: string;
      label: string;
      detail: string;
    };

export async function getTimeline(): Promise<TimelineItem[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [gRes, mRes] = await Promise.all([
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

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return items.slice(0, 40);
}
