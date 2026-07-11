"use server";

import { revalidatePath } from "next/cache";
import { ingestUnifiedReadings } from "@/lib/cgm/ingest";
import { generateMockCgmSeries } from "@/lib/cgm/mock";
import { createClient } from "@/lib/supabase/server";

export type CgmActionResult = { ok?: true; inserted?: number; skipped?: number; error?: string };

export async function ingestMockCgmReadings(points: number = 36): Promise<CgmActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const readings = generateMockCgmSeries(Math.min(Math.max(points, 1), 288), 5);
  const result = await ingestUnifiedReadings(supabase, user.id, readings);

  if (result.error) return { error: result.error };

  revalidatePath("/dashboard");
  revalidatePath("/glicemia");
  revalidatePath("/glicemia/tendencias");
  return { ok: true, inserted: result.inserted, skipped: result.skipped };
}
