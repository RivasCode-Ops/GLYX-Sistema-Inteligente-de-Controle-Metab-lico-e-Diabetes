"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apagarUsoDeIa } from "@/lib/privacy/apagar-uso-ia";
import {
  PRIVATE_PHOTO_BUCKETS,
  PROFILE_RESET_NULL_COLUMNS,
  USER_DATA_DELETE_ORDER,
} from "@/lib/privacy/user-data";
import {
  DEFAULT_TARGET_MAX_MG_DL,
  DEFAULT_TARGET_MIN_MG_DL,
} from "@/lib/health/glucose-thresholds";

export type PrivacyActionResult = { ok?: true; error?: string };

const STORAGE_PAGINA = 1000;

/**
 * Apaga a pasta do usuário num bucket, PAGINANDO. A versão anterior listava
 * no máximo 1000 arquivos e apagava só esses — o resto ficava no Storage
 * depois de "apagar todos os meus dados".
 */
async function purgeUserStorageFolder(
  supabase: SupabaseClient,
  bucket: string,
  userId: string
): Promise<string | null> {
  // Sempre a primeira página: o que foi apagado sai da listagem seguinte.
  for (let rodada = 0; rodada < 1000; rodada += 1) {
    const { data: entries, error: listError } = await supabase.storage
      .from(bucket)
      .list(userId, { limit: STORAGE_PAGINA, offset: 0 });
    if (listError) return `Falha ao listar fotos em ${bucket}.`;
    if (!entries?.length) return null;

    const paths = entries.map((f) => `${userId}/${f.name}`);
    const { data: removidos, error: removeError } = await supabase.storage.from(bucket).remove(paths);
    if (removeError) return `Falha ao apagar fotos em ${bucket}.`;
    // Nada removido e a listagem segue cheia: a próxima rodada veria a mesma
    // página. Para em vez de girar.
    if (!removidos?.length) return `Falha ao apagar fotos em ${bucket}.`;
    if (entries.length < STORAGE_PAGINA) return null;
  }
  return `Fotos demais em ${bucket}: a limpeza parou por segurança. Tente de novo.`;
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
    if (error) return { error: `Falha ao apagar ${table}.` };
  }

  const usoErro = await apagarUsoDeIa(createAdminClient(), user.id);
  if (usoErro) return { error: usoErro };

  // Mantém a conta Auth, mas remove PII clínica do perfil. A lista vem do
  // inventário, e um teste reprova coluna nova do perfil fora dela.
  const limpeza = Object.fromEntries(PROFILE_RESET_NULL_COLUMNS.map((c) => [c, null]));
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      ...limpeza,
      target_glucose_min: DEFAULT_TARGET_MIN_MG_DL,
      target_glucose_max: DEFAULT_TARGET_MAX_MG_DL,
      onboarding_done: false,
    })
    .eq("id", user.id);
  if (profileError) {
    return { error: "Dados apagados, mas falha ao limpar o perfil. Tente de novo." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
