"use server";

import { revalidatePath } from "next/cache";
import { checkAndRecordAiUsage, rateLimitMessage, recordAiTokens } from "@/lib/ai/rate-limit";
import { aiModel } from "@/lib/env";
import { interpretExamText } from "@/lib/exams/interpret";
import { createClient } from "@/lib/supabase/server";

export type ExamInterpretActionResult = {
  ok?: true;
  error?: string;
  demo?: boolean;
};

export async function runExamInterpretation(examId: string): Promise<ExamInterpretActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { data: exam, error: fetchErr } = await supabase
    .from("exams")
    .select("id, raw_text, user_id, exam_type")
    .eq("id", examId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr || !exam?.raw_text) return { error: "Exame não encontrado ou sem texto." };

  const rate = await checkAndRecordAiUsage(supabase, user.id, "exam");
  if (!rate.allowed) {
    return { error: rateLimitMessage(rate) };
  }

  const result = await interpretExamText(exam.raw_text);

  if (!result.ok) {
    return { error: result.error, demo: result.demo };
  }

  await recordAiTokens(supabase, rate.usageId, result.usage, aiModel());

  const summary = {
    ...result.data,
    modality: (exam.exam_type as "lab" | "ecg" | "rx" | null) ?? result.data.modality ?? "lab",
  };

  const { error: upErr } = await supabase
    .from("exams")
    .update({
      parsed_summary: summary as unknown as Record<string, unknown>,
    })
    .eq("id", examId)
    .eq("user_id", user.id);

  if (upErr) return { error: upErr.message };

  revalidatePath("/exames");
  revalidatePath(`/exames/${examId}`);
  return { ok: true };
}
