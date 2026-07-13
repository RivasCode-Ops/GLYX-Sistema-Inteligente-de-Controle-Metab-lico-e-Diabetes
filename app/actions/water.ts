"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok?: true; error?: string };

export async function logWater(amountMl: number): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  if (!Number.isFinite(amountMl) || amountMl <= 0 || amountMl > 5000) {
    return { error: "Quantidade inválida." };
  }

  const { error } = await supabase
    .from("water_logs")
    .insert({ user_id: user.id, amount_ml: Math.round(amountMl) });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}
