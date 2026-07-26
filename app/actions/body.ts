"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { uploadPrivatePhoto } from "@/lib/storage/upload-private-photo";
import {
  BODY_FIELD_BY_KEY,
  BODY_FIELD_KEYS,
  isBodyMeasurementKey,
  type BodyMeasurementKey,
} from "@/lib/body/fields";

export type ActionResult = { ok?: true; error?: string };

const POSES = ["frente", "costas", "perfil_esq", "perfil_dir"] as const;
export type BodyPhotoPose = (typeof POSES)[number];

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function revalidateComposition() {
  revalidatePath("/composicao");
  revalidatePath("/composicao/medidas");
  revalidatePath("/composicao/historico");
  revalidatePath("/composicao/metas");
  revalidatePath("/composicao/fotos");
}

/** "32,5" → 32.5. Vírgula é o separador decimal que o teclado brasileiro entrega. */
function parseDecimal(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const text = String(raw).trim().replace(",", ".");
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

/**
 * Salva (ou substitui) a medição de uma data.
 *
 * Upsert por (user_id, measured_on) de propósito: remedir o braço três vezes na
 * mesma tarde não é evolução, é ruído — a última medida do dia vence. Campos
 * vazios viram null em vez de manter o valor anterior: "não medi hoje" é
 * informação diferente de "está igual", e misturar as duas inventa uma série
 * plana que nunca foi medida.
 */
export async function saveBodyMeasurement(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsedDate = dateSchema.safeParse(formData.get("measured_on") || undefined);
  if (!parsedDate.success) return { error: "Data inválida." };
  const measuredOn = parsedDate.data ?? new Date().toISOString().slice(0, 10);

  const values: Partial<Record<BodyMeasurementKey, number | null>> = {};
  let filled = 0;
  for (const key of BODY_FIELD_KEYS) {
    const value = parseDecimal(formData.get(key));
    if (value != null && value <= 0) {
      return { error: `${BODY_FIELD_BY_KEY[key].label}: informe um valor maior que zero.` };
    }
    values[key] = value;
    if (value != null) filled += 1;
  }

  if (filled === 0) {
    return { error: "Preencha pelo menos uma medida." };
  }

  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500) || null;

  const { error } = await supabase.from("body_measurements").upsert(
    {
      user_id: user.id,
      measured_on: measuredOn,
      ...values,
      notes,
    },
    { onConflict: "user_id,measured_on" }
  );
  if (error) return { error: error.message };

  // Peso da medição também vira pesagem do dia: o ajuste calórico e o gráfico
  // de peso leem weight_logs, e quem mede a fita costuma pesar na mesma hora.
  // Sem isso o usuário teria que digitar o mesmo peso em duas telas.
  if (values.weight_kg != null) {
    await supabase.from("weight_logs").upsert(
      { user_id: user.id, weight_kg: values.weight_kg, logged_on: measuredOn },
      { onConflict: "user_id,logged_on" }
    );
    revalidatePath("/perfil/corpo");
    revalidatePath("/dashboard");
  }

  revalidateComposition();
  return { ok: true };
}

export async function deleteBodyMeasurement(formData: FormData): Promise<ActionResult> {
  const measuredOn = String(formData.get("measured_on") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(measuredOn)) return { error: "Registro inválido." };

  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { error } = await supabase
    .from("body_measurements")
    .delete()
    .eq("user_id", user.id)
    .eq("measured_on", measuredOn);
  if (error) return { error: error.message };

  revalidateComposition();
  return { ok: true };
}

/**
 * Cria ou atualiza a meta de uma medida.
 *
 * `start_value` é congelado com a medição mais recente disponível no momento em
 * que a meta é criada — e NÃO é reescrito quando a meta é editada, senão o
 * progresso já conquistado desapareceria a cada ajuste de alvo.
 */
export async function saveBodyGoal(formData: FormData): Promise<ActionResult> {
  const metric = String(formData.get("metric") ?? "");
  if (!isBodyMeasurementKey(metric)) return { error: "Medida inválida." };

  const target = parseDecimal(formData.get("target_value"));
  if (target == null || target <= 0) return { error: "Informe o valor da meta." };

  const targetDateRaw = String(formData.get("target_date") ?? "").trim();
  if (targetDateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(targetDateRaw)) {
    return { error: "Data-alvo inválida." };
  }

  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { data: existing } = await supabase
    .from("body_goals")
    .select("start_value, start_on")
    .eq("user_id", user.id)
    .eq("metric", metric)
    .maybeSingle();

  let startValue = existing?.start_value ?? null;
  let startOn = existing?.start_on ?? new Date().toISOString().slice(0, 10);

  if (startValue == null) {
    const { data: latest } = await supabase
      .from("body_measurements")
      .select(`measured_on, ${metric}`)
      .eq("user_id", user.id)
      .not(metric, "is", null)
      .order("measured_on", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = latest as Record<string, unknown> | null;
    const value = row?.[metric];
    if (value != null && Number.isFinite(Number(value))) {
      startValue = Number(value);
      startOn = String(row!.measured_on);
    }
  }

  const { error } = await supabase.from("body_goals").upsert(
    {
      user_id: user.id,
      metric,
      target_value: target,
      start_value: startValue,
      start_on: startOn,
      target_date: targetDateRaw || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,metric" }
  );
  if (error) return { error: error.message };

  revalidateComposition();
  return { ok: true };
}

export async function deleteBodyGoal(formData: FormData): Promise<ActionResult> {
  const metric = String(formData.get("metric") ?? "");
  if (!isBodyMeasurementKey(metric)) return { error: "Medida inválida." };

  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { error } = await supabase
    .from("body_goals")
    .delete()
    .eq("user_id", user.id)
    .eq("metric", metric);
  if (error) return { error: error.message };

  revalidateComposition();
  return { ok: true };
}

/**
 * Envia fotos de progresso de uma data (uma por pose, todas opcionais).
 *
 * Falha de upload é reportada, não engolida: uma foto de progresso perdida em
 * silêncio só aparece três meses depois, quando a comparação que era o motivo
 * inteiro de tirar a foto não pode mais ser feita.
 */
export async function saveBodyPhotos(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsedDate = dateSchema.safeParse(formData.get("taken_on") || undefined);
  if (!parsedDate.success) return { error: "Data inválida." };
  const takenOn = parsedDate.data ?? new Date().toISOString().slice(0, 10);

  const failed: string[] = [];
  let saved = 0;

  for (const pose of POSES) {
    const file = formData.get(pose);
    if (!(file instanceof File) || file.size === 0) continue;

    if (file.size > MAX_PHOTO_BYTES) {
      failed.push(pose);
      continue;
    }

    const path = await uploadPrivatePhoto(supabase, "body-photos", user.id, file, MAX_PHOTO_BYTES);
    if (!path) {
      failed.push(pose);
      continue;
    }

    const { error } = await supabase.from("body_photos").upsert(
      { user_id: user.id, taken_on: takenOn, pose, photo_path: path },
      { onConflict: "user_id,taken_on,pose" }
    );
    if (error) failed.push(pose);
    else saved += 1;
  }

  if (!saved && !failed.length) return { error: "Escolha pelo menos uma foto." };

  revalidateComposition();
  if (failed.length) {
    return {
      error: `Não foi possível salvar: ${failed.join(", ")}. Verifique o tamanho (máx. 8 MB) e tente de novo.`,
    };
  }
  return { ok: true };
}

export async function deleteBodyPhoto(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Foto inválida." };

  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { data: photo } = await supabase
    .from("body_photos")
    .select("photo_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase.from("body_photos").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };

  // Remove o arquivo depois da linha: órfão no banco apontando pra arquivo que
  // não existe quebra a tela; arquivo órfão no bucket, não.
  if (photo?.photo_path) {
    await supabase.storage.from("body-photos").remove([photo.photo_path]);
  }

  revalidateComposition();
  return { ok: true };
}
