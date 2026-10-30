"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseExamValues } from "@/lib/exams/parse-values";
import { regravarValores, toExamValueRows } from "@/lib/exams/save-values";
import { publicDbError } from "@/lib/errors/public-error";

export type ActionResult = {
  ok?: true;
  error?: string;
  extraidos?: number;
  /** Deu certo, mas com uma ressalva que a pessoa precisa ver. */
  aviso?: string;
};

/**
 * Extrai os resultados do texto do laudo e grava um por analito.
 *
 * DETERMINÍSTICO: nenhum modelo é chamado. O laudo é uma tabela, e ler tabela
 * com regra é reproduzível, testável contra o texto real e não alucina um LDL
 * que não está escrito. A IA fica para o que a regra não pegar — laudo em
 * prosa, PDF mal convertido — e entra depois.
 *
 * Reexecutável: o exame fica com os resultados do laudo dele, não com a soma de
 * todas as tentativas. A gravação é a lógica de `regravarValores`.
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

  const resultado = await regravarValores(
    supabase,
    examId,
    user.id,
    toExamValueRows(valores, examId, user.id, exame.collected_on)
  );

  revalidatePath("/exames");
  revalidatePath(`/exames/${examId}`);
  return resultado;
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
  if (error) return { error: publicDbError(error, "actions/exam-values") };

  // Os valores já extraídos carregam a data para a série ser lida sem join —
  // então eles precisam acompanhar a correção. Se não acompanharem, a série
  // fica com a data velha sem nada dizer: por isso o erro é devolvido.
  const { error: errValores } = await supabase
    .from("exam_values")
    .update({ collected_on: data })
    .eq("exam_id", examId)
    .eq("user_id", user.id);

  revalidatePath("/exames");
  revalidatePath(`/exames/${examId}`);
  if (errValores) {
    console.error("[exam-values] data da coleta não propagou para os valores", errValores);
    return {
      ok: true,
      aviso:
        "A data do exame foi salva, mas os valores já extraídos continuam com a data anterior. Salve a data de novo.",
    };
  }
  return { ok: true };
}
