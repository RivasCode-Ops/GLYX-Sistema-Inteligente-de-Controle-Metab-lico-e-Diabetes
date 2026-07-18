"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { uploadPrivatePhoto } from "@/lib/storage/upload-private-photo";
import { namesLookSimilar } from "@/lib/medications/similar";
import type { SupabaseClient } from "@supabase/supabase-js";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const LABEL_PHOTO_MAX_BYTES = 4 * 1024 * 1024;

function uploadLabelPhoto(
  supabase: SupabaseClient,
  userId: string,
  file: FormDataEntryValue | null
): Promise<string | null> {
  return uploadPrivatePhoto(supabase, "medication-labels", userId, file, LABEL_PHOTO_MAX_BYTES);
}

const medSchema = z.object({
  name: z.string().min(1),
  dosage: z.string().optional(),
  schedule_hint: z.string().optional(),
  reminder_times: z.array(z.string().regex(TIME_RE)).optional(),
  kind: z.enum(["med", "supplement"]).default("med"),
});

/**
 * Compõe a dosagem a partir de quantidade + unidade do formulário (ex.: 10 +
 * "U" → "10 U"; 30 + "g" → "30 g") — cobre insulina em unidades, whey e
 * creatina em gramas/scoop, além de comprimidos. Sem quantidade, vale o
 * texto livre.
 */
function composeDosage(formData: FormData): string | undefined {
  const amountRaw = String(formData.get("dose_amount") ?? "").trim().replace(",", ".");
  const unit = String(formData.get("dose_unit") ?? "").trim();
  const free = String(formData.get("dosage") ?? "").trim();
  const amount = Number(amountRaw);
  if (amountRaw && Number.isFinite(amount) && amount > 0 && unit) {
    const num = Number.isInteger(amount) ? String(amount) : String(amount).replace(".", ",");
    return `${num} ${unit}`;
  }
  return free || undefined;
}

// "08:00, 20h30, 7:5, 08:00" → ["08:00", "20:30"] (inválidos e repetidos são descartados)
function parseReminderTimes(input: string): string[] {
  const times = input
    .split(/[,;]/)
    .map((t) => t.trim().replace("h", ":").replace(/^(\d):/, "0$1:"))
    .filter((t) => TIME_RE.test(t));
  return [...new Set(times)];
}

export type ActionResult = { ok?: true; error?: string };

export async function addMedication(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const timesRaw = String(formData.get("reminder_times") ?? "").trim();
  const reminderTimes = timesRaw ? parseReminderTimes(timesRaw) : [];

  const parsed = medSchema.safeParse({
    name: formData.get("name"),
    dosage: composeDosage(formData),
    schedule_hint: formData.get("schedule_hint") || undefined,
    reminder_times: reminderTimes.length ? reminderTimes : undefined,
    kind: formData.get("kind") === "supplement" ? "supplement" : "med",
  });
  if (!parsed.success) return { error: "Nome do medicamento é obrigatório." };

  const stockRaw = Number.parseInt(String(formData.get("stock_units") ?? ""), 10);
  const stock =
    Number.isFinite(stockRaw) && stockRaw > 0 && stockRaw <= 100000
      ? {
          stock_units: stockRaw,
          stock_updated_on: new Date().toISOString().slice(0, 10),
        }
      : {};

  const labelPhotoPath = await uploadLabelPhoto(supabase, user.id, formData.get("label_photo"));

  const { error } = await supabase.from("medications").insert({
    user_id: user.id,
    ...parsed.data,
    ...stock,
    ...(labelPhotoPath ? { label_photo_path: labelPhotoPath } : {}),
  });

  if (error) return { error: error.message };

  revalidatePath("/medicacao");
  return { ok: true };
}

export type SimilarMedication = {
  id: string;
  name: string;
  dosage: string | null;
  stock_units: number | null;
};

/**
 * Checa se já existe um item ativo com nome parecido — usado no cadastro por
 * foto pra avisar antes de criar duplicata (ex.: fotografar a 2ª/3ª caneta
 * de um remédio que já está cadastrado, em vez de atualizar o estoque dele).
 */
export async function findSimilarActiveMedications(name: string): Promise<SimilarMedication[]> {
  const supabase = await createClient();
  if (!supabase || !name.trim()) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("medications")
    .select("id, name, dosage, stock_units")
    .eq("user_id", user.id)
    .eq("active", true);

  return (data ?? []).filter((m) => namesLookSimilar(name, m.name));
}

export async function attachMedicationLabel(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const medicationId = formData.get("medication_id") as string | null;
  if (!medicationId) return { error: "Medicamento inválido." };

  const path = await uploadLabelPhoto(supabase, user.id, formData.get("label_photo"));
  if (!path) return { error: "Selecione uma foto (JPEG/PNG/WebP, até 4 MB)." };

  // Remove a foto anterior, se houver, antes de trocar a referência.
  const { data: current } = await supabase
    .from("medications")
    .select("label_photo_path")
    .eq("id", medicationId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("medications")
    .update({ label_photo_path: path })
    .eq("id", medicationId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  if (current?.label_photo_path) {
    await supabase.storage.from("medication-labels").remove([current.label_photo_path]);
  }

  revalidatePath("/medicacao");
  return { ok: true };
}

export async function removeMedicationLabel(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const medicationId = formData.get("medication_id") as string | null;
  if (!medicationId) return { error: "Medicamento inválido." };

  const { data: current } = await supabase
    .from("medications")
    .select("label_photo_path")
    .eq("id", medicationId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("medications")
    .update({ label_photo_path: null })
    .eq("id", medicationId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  if (current?.label_photo_path) {
    await supabase.storage.from("medication-labels").remove([current.label_photo_path]);
  }

  revalidatePath("/medicacao");
  return { ok: true };
}

export async function updateMedication(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const medicationId = formData.get("medication_id") as string | null;
  if (!medicationId) return { error: "Medicamento inválido." };

  const timesRaw = String(formData.get("reminder_times") ?? "").trim();
  const reminderTimes = timesRaw ? parseReminderTimes(timesRaw) : [];

  const parsed = medSchema.safeParse({
    name: formData.get("name"),
    dosage: formData.get("dosage") || undefined,
    schedule_hint: formData.get("schedule_hint") || undefined,
    reminder_times: reminderTimes,
    kind: formData.get("kind") === "supplement" ? "supplement" : "med",
  });
  if (!parsed.success) return { error: "Nome do medicamento é obrigatório." };

  const { error } = await supabase
    .from("medications")
    .update({
      name: parsed.data.name,
      dosage: parsed.data.dosage ?? null,
      schedule_hint: parsed.data.schedule_hint ?? null,
      reminder_times: reminderTimes.length ? reminderTimes : null,
      kind: parsed.data.kind,
    })
    .eq("id", medicationId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/medicacao");
  return { ok: true };
}

export async function updateMedicationStock(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const medicationId = formData.get("medication_id") as string | null;
  const stock = Number.parseInt(String(formData.get("stock_units") ?? ""), 10);
  if (!medicationId || !Number.isFinite(stock) || stock < 0 || stock > 100000) {
    return { error: "Informe a quantidade em estoque." };
  }

  const { error } = await supabase
    .from("medications")
    .update({
      stock_units: stock,
      stock_updated_on: new Date().toISOString().slice(0, 10),
    })
    .eq("id", medicationId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/medicacao");
  return { ok: true };
}

export async function deactivateMedication(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const medicationId = formData.get("medication_id") as string | null;
  if (!medicationId) return { error: "Medicamento inválido." };

  const { error } = await supabase
    .from("medications")
    .update({ active: false })
    .eq("id", medicationId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/medicacao");
  return { ok: true };
}

export async function logMedicationTaken(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const medicationId = formData.get("medication_id") as string | null;
  if (!medicationId) return { error: "Medicamento inválido." };

  const { error } = await supabase.from("medication_logs").insert({
    user_id: user.id,
    medication_id: medicationId,
    confirmed: true,
  });

  if (error) return { error: error.message };

  revalidatePath("/medicacao");
  revalidatePath("/dashboard");
  return { ok: true };
}
