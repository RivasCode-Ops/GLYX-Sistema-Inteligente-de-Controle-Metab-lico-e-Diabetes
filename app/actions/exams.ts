"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  title: z.string().min(1),
  raw_text: z.string().min(10),
});

export type ActionResult = { ok?: true; error?: string };

export async function saveExamDraft(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = schema.safeParse({
    title: formData.get("title"),
    raw_text: formData.get("raw_text"),
  });
  if (!parsed.success) return { error: "Título e texto do exame são obrigatórios." };

  const { error } = await supabase.from("exams").insert({
    user_id: user.id,
    title: parsed.data.title,
    raw_text: parsed.data.raw_text,
    parsed_summary: null,
  });

  if (error) return { error: error.message };

  revalidatePath("/exames");
  return { ok: true };
}
