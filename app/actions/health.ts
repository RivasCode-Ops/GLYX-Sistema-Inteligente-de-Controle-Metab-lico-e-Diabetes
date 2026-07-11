"use server";

import { revalidatePath } from "next/cache";
import { generateMockHealthSnapshots } from "@/lib/health/mock";
import { ingestHealthSnapshots } from "@/lib/health/ingest";
import { createClient } from "@/lib/supabase/server";

export type HealthActionResult = { ok?: true; upserted?: number; error?: string };

export async function ingestMockHealth(days: number = 7): Promise<HealthActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const snaps = generateMockHealthSnapshots(Math.min(Math.max(days, 1), 90));
  const result = await ingestHealthSnapshots(supabase, user.id, snaps);

  if (result.error) return { error: result.error };

  revalidatePath("/dashboard");
  revalidatePath("/integracoes");
  return { ok: true, upserted: result.upserted };
}
