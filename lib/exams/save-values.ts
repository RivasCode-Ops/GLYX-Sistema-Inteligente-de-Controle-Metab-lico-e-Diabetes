import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedValue } from "./parse-values";

export type ExamValueRow = {
  exam_id: string;
  user_id: string;
  analyte: string;
  label: string;
  value_num: number | null;
  value_text: string | null;
  unit: string | null;
  ref_min: number | null;
  ref_max: number | null;
  ref_text: string | null;
  collected_on: string | null;
};

export type SaveValuesResult = { ok?: true; error?: string; extraidos?: number; aviso?: string };

/**
 * Linhas de `exam_values` a partir do que o parser leu, uma por analito.
 *
 * Sem slug canônico o resultado continua sendo gravado, com um slug derivado do
 * rótulo: perder o valor porque o vocabulário não previu a grafia seria pior
 * que não ter série dele.
 *
 * O slug livre é cortado em 40 caracteres, e o parser deduplica pelo rótulo
 * INTEIRO: dois rótulos longos com o mesmo começo viram o mesmo slug aqui e
 * quebrariam o unique (exam_id, analyte). Fica a primeira ocorrência — a mesma
 * regra do parser.
 */
export function toExamValueRows(
  valores: ParsedValue[],
  examId: string,
  userId: string,
  collectedOn: string | null
): ExamValueRow[] {
  const vistos = new Set<string>();
  const rows: ExamValueRow[] = [];
  for (const v of valores) {
    const analyte = v.analyte ?? `livre:${v.label.toLowerCase().slice(0, 40)}`;
    if (vistos.has(analyte)) continue;
    vistos.add(analyte);
    rows.push({
      exam_id: examId,
      user_id: userId,
      analyte,
      label: v.label,
      value_num: v.valueNum,
      value_text: v.valueText,
      unit: v.unit,
      ref_min: v.refMin,
      ref_max: v.refMax,
      ref_text: v.refText,
      collected_on: collectedOn,
    });
  }
  return rows;
}

/**
 * Troca os valores de um exame pelos novos sem passar por "exame vazio"
 * (GLYX-20).
 *
 * Antes era apagar tudo e depois inserir, sem olhar o erro do delete: se o
 * insert falhasse, o exame ficava sem valor nenhum — a série de HbA1c perdia o
 * ponto, e nada na tela dizia por quê.
 *
 * Agora a ordem é a inversa, e cada passo para em erro:
 *
 *   1. lê os ids atuais — falhou, nada mudou;
 *   2. grava os novos por cima (upsert em `exam_values_unico`), num comando só —
 *      falhou, o banco desfaz o comando inteiro e os valores antigos continuam;
 *   3. só então apaga os analitos que o laudo não tem mais — falhou, os novos
 *      já estão lá e sobra algum antigo, o que é avisado.
 *
 * Em nenhum ponto o exame fica com menos informação do que tinha. Atomicidade
 * completa pediria uma função no banco (migration), e este caminho chega ao
 * mesmo resultado para quem lê sem mexer no schema.
 */
export async function regravarValores(
  supabase: SupabaseClient,
  examId: string,
  userId: string,
  rows: ExamValueRow[]
): Promise<SaveValuesResult> {
  if (!rows.length) return { error: "Nenhum valor para gravar." };

  const { data: atuais, error: errLeitura } = await supabase
    .from("exam_values")
    .select("id, analyte")
    .eq("exam_id", examId)
    .eq("user_id", userId);
  if (errLeitura) {
    console.error("[exam-values] leitura dos valores atuais falhou", errLeitura);
    return { error: "Não foi possível ler os valores atuais do exame. Nada foi alterado — tente de novo." };
  }

  const { error: errGravacao } = await supabase
    .from("exam_values")
    .upsert(rows, { onConflict: "exam_id,analyte" });
  if (errGravacao) {
    console.error("[exam-values] gravação dos valores falhou", errGravacao);
    return {
      error: "Não foi possível gravar os valores. Os valores anteriores do exame foram mantidos — tente de novo.",
    };
  }

  const novos = new Set(rows.map((r) => r.analyte));
  const sobras = (atuais ?? []).filter((a) => !novos.has(a.analyte as string)).map((a) => a.id as string);
  if (sobras.length) {
    const { error: errLimpeza } = await supabase
      .from("exam_values")
      .delete()
      .eq("user_id", userId)
      .in("id", sobras);
    if (errLimpeza) {
      console.error("[exam-values] limpeza dos valores antigos falhou", errLimpeza);
      return {
        ok: true,
        extraidos: rows.length,
        aviso: `${rows.length} valores gravados, mas ${sobras.length} valor(es) de uma leitura anterior, que este laudo não tem, continuam no exame. Extraia de novo para removê-los.`,
      };
    }
  }

  return { ok: true, extraidos: rows.length };
}
