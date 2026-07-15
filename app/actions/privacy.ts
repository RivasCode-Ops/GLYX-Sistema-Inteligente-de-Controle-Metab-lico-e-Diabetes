"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  PRIVATE_PHOTO_BUCKETS,
  USER_DATA_DELETE_ORDER,
} from "@/lib/privacy/user-data";

export type PrivacyActionResult = { ok?: true; error?: string };

async function purgeUserStorageFolder(
  supabase: SupabaseClient,
  bucket: string,
  userId: string
): Promise<string | null> {
  const { data: entries, error: listError } = await supabase.storage.from(bucket).list(userId, {
    limit: 1000,
  });
  if (listError) return `Falha ao listar fotos em ${bucket}: ${listError.message}`;
  if (!entries?.length) return null;

  const paths = entries.map((f) => `${userId}/${f.name}`);
  const { error: removeError } = await supabase.storage.from(bucket).remove(paths);
  if (removeError) return `Falha ao apagar fotos em ${bucket}: ${removeError.message}`;
  return null;
}

// Direito de eliminação (LGPD): apaga registros + fotos privadas.
// A conta Auth permanece; exclusão do login continua via contato do responsável.
export async function deleteAllMyData(): Promise<PrivacyActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  for (const bucket of PRIVATE_PHOTO_BUCKETS) {
    const storageError = await purgeUserStorageFolder(supabase, bucket, user.id);
    if (storageError) return { error: storageError };
  }

  for (const table of USER_DATA_DELETE_ORDER) {
    const { error } = await supabase.from(table).delete().eq("user_id", user.id);
    if (error) return { error: `Falha ao apagar ${table}: ${error.message}` };
  }

  // Mantém a conta Auth, mas remove PII clínica do perfil.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: null,
      diabetes_type: null,
      target_glucose_min: 70,
      target_glucose_max: 180,
      sex: null,
      birth_year: null,
      height_cm: null,
      activity_level: null,
      body_goal: null,
      target_weight_kg: null,
      family_history: null,
      primary_focus: null,
      onboarding_done: false,
    })
    .eq("id", user.id);
  if (profileError) {
    return { error: `Dados apagados, mas falha ao limpar perfil: ${profileError.message}` };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
