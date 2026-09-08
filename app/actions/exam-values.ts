"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseExamValues } from "@/lib/exams/parse-values";

export type ActionResult = { ok?: true; error?: string; extraidos?: number };

/**
 * Extrai os resultados do texto do laudo e grava um por analito.
 *
 * DETERMINÍSTICO: nenhum modelo é chamado. O laudo é uma tabela, e ler tabela
 * com regra é reproduzível, testável contra o texto real e não alucina um LDL
 * que não está escrito. A IA fica para o que a regra não pegar — laudo em
 * prosa, PDF mal convertido — e entra depois.
 *
 * Reexecutável: apaga os valores anteriores DESTE exame antes de inserir. Um
 * exame tem os resultados do laudo dele, não a soma de todas as tentativas de
 * extração; e sem isso o unique (exam_id, analyte) faria a segunda tentativa
 * falhar em vez de corrigir.
 */
export async function extrairValoresDoExame(formData: FormData): Promise<ActionResult> {
  const examId = String(formData.get("exam_id") ?? "");
  if (!examId) return { error: "Exame inválido." };

  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { data: exame } = await supabase
    .from("exams")
    .select("id, raw_text, collected_on")
    .eq("id", examId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!exame) return { error: "Exame não encontrado." };
  if (!exame.raw_text?.trim()) {
    return { error: "Este exame não tem texto para ler. Cole o laudo ou use a leitura por foto." };
  }

  const valores = parseExamValues(exame.raw_text);
  if (!valores.length) {
    return {
      error:
        "Não reconheci nenhum resultado no formato \"analito: valor\". Se o laudo estiver em prosa ou em colunas, a leitura por texto ainda não dá conta dele.",
    };
  }

  await supabase.from("exam_values").delete().eq("exam_id", examId).eq("user_id", user.id);

  const { error } = await supabase.from("exam_values").insert(
    valores.map((v) => ({
      exam_id: examId,
      user_id: user.id,
      // Sem slug canônico o resultado continua sendo gravado, com um slug
      // derivado do rótulo: perder o valor porque o vocabulário não previu a
      // grafia seria pior que não ter série dele.
      analyte: v.analyte ?? `livre:${v.label.toLowerCase().slice(0, 40)}`,
      label: v.label,
      value_num: v.valueNum,
      value_text: v.valueText,
      unit: v.unit,
      ref_min: v.refMin,
      ref_max: v.refMax,
      ref_text: v.refText,
      collected_on: exame.collected_on,
    }))
  );

  if (error) return { error: error.message };

  revalidatePath("/exames");
  revalidatePath(`/exames/${examId}`);
  return { ok: true, extraidos: valores.length };
}

/**
 * Data da coleta, informada por quem cadastrou.
 *
 * O app NÃO deduz do texto: a data está escrita no laudo, mas confundir "a data
 * que aparece no cabeçalho" com "a data da coleta" é fácil — laudo traz data de
 * coleta, de liberação e de impressão, às vezes as três. Errar aqui coloca a
 * série na ordem errada, e o erro não se anuncia.
 */
export async function definirDataDaColeta(formData: FormData): Promise<ActionResult> {
  const examId = String(formData.get("exam_id") ?? "");
  const data = String(formData.get("collected_on") ?? "").trim();
  if (!examId) return { error: "Exame inválido." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { error: "Informe a data da coleta." };

  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { error } = await supabase
    .from("exams")
    .update({ collected_on: data })
    .eq("id", examId)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  // Os valores já extraídos carregam a data para a série ser lida sem join —
  // então eles precisam acompanhar a correção.
  await supabase
    .from("exam_values")
    .update({ collected_on: data })
    .eq("exam_id", examId)
    .eq("user_id", user.id);

  revalidatePath("/exames");
  revalidatePath(`/exames/${examId}`);
  return { ok: true };
}
