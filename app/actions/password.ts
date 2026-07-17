"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { friendlyAuthError } from "@/lib/auth/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(128),
  confirmPassword: z.string().min(6).max(128),
});

export type PasswordActionResult = { ok?: true; error?: string };

/**
 * Troca de senha no servidor.
 * Conta admin (dono): usa service role — evita rate limit do signIn repetido no celular.
 * Demais contas: confirma senha atual uma vez e atualiza.
 */
export async function changePasswordAction(formData: FormData): Promise<PasswordActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre de novo." };

  const parsed = schema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: "Preencha senha atual, nova senha e confirmação." };

  const { currentPassword, newPassword, confirmPassword } = parsed.data;
  if (newPassword !== confirmPassword) {
    return { error: "A confirmação não coincide com a nova senha." };
  }
  if (newPassword === currentPassword) {
    return { error: "A nova senha precisa ser diferente da atual." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  const admin = createAdminClient();

  // Dono / admin: uma chamada via service role (sem martelar signInWithPassword).
  if (profile?.is_admin && admin) {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });
    if (error) return { error: friendlyAuthError(error.message) };
    revalidatePath("/perfil");
    return { ok: true };
  }

  if (!user.email) {
    return { error: "Não foi possível confirmar o e-mail da conta." };
  }

  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyErr) {
    return { error: friendlyAuthError(verifyErr.message) };
  }

  const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
  if (updateErr) {
    return { error: friendlyAuthError(updateErr.message) };
  }

  revalidatePath("/perfil");
  return { ok: true };
}
