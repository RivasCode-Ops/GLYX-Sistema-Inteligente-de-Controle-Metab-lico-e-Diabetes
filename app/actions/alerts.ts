"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Marca como lidos os alertas do usuário (B16). Chamado quando a lista de
 * alertas é exibida — por um componente no cliente, depois de montar, e não
 * durante a renderização do servidor (D6: tela não grava ao renderizar).
 */
export async function marcarAlertasComoLidos(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  if (!supabase) return { ok: false };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from("metabolic_alerts")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) return { ok: false };

  revalidatePath("/", "layout");
  return { ok: true };
}
