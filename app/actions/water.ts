"use server";

import { revalidatePath } from "next/cache";
import { isBeverageKind, type BeverageKind } from "@/lib/health/beverages";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok?: true; error?: string };

export async function logBeverage(
  amountMl: number,
  kind: BeverageKind = "agua"
): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  if (!Number.isFinite(amountMl) || amountMl <= 0 || amountMl > 5000) {
    return { error: "Quantidade inválida." };
  }
  if (!isBeverageKind(kind)) return { error: "Bebida inválida." };

  const { error } = await supabase
    .from("water_logs")
    .insert({ user_id: user.id, amount_ml: Math.round(amountMl), kind });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function logWater(amountMl: number): Promise<ActionResult> {
  return logBeverage(amountMl, "agua");
}
