"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok?: true; error?: string };

export async function toggleUserDisabled(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const targetId = String(formData.get("user_id") ?? "");
  const nextDisabled = formData.get("disabled") === "true";
  if (!targetId) return { error: "Usuário inválido." };
  if (targetId === user.id) return { error: "Você não pode desativar a própria conta admin." };

  // RLS: só passa se o usuário logado for admin (policy profiles_update_admin)
  const { error } = await supabase
    .from("profiles")
    .update({ disabled: nextDisabled })
    .eq("id", targetId);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true };
}
