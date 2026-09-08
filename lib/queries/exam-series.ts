import { createClient } from "@/lib/supabase/server";
import { ANALYTE_BY_SLUG } from "@/lib/exams/analytes";

/**
 * Série por analito — o que transforma exame arquivado em exame acompanhado.
 *
 * Lê direto de `exam_values`, sem join: a data da coleta está denormalizada lá
 * justamente para isto. Ordena por data de COLETA, não de cadastro — três
 * laudos cadastrados no mesmo dia, de coletas de junho e julho, sairiam na
 * ordem de digitação se a chave fosse `created_at`.
 */

export type SeriePonto = {
  collectedOn: string | null;
  valueNum: number | null;
  valueText: string | null;
  unit: string | null;
  refText: string | null;
  refMin: number | null;
  refMax: number | null;
};

export type SerieDeAnalito = {
  analyte: string;
  label: string;
  pontos: SeriePonto[];
  /** Variação entre o primeiro e o último ponto NUMÉRICO com data. */
  delta: number | null;
  /** Quantos pontos ainda estão sem data de coleta — a série não os ordena. */
  semData: number;
};

export async function getExamSeries(): Promise<SerieDeAnalito[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("exam_values")
    .select("analyte, label, value_num, value_text, unit, ref_text, ref_min, ref_max, collected_on")
    .eq("user_id", user.id)
    .order("collected_on", { ascending: true, nullsFirst: false });

  const porAnalito = new Map<string, SerieDeAnalito>();
  for (const v of data ?? []) {
    const slug = v.analyte as string;
    const atual =
      porAnalito.get(slug) ??
      ({
        analyte: slug,
        // O rótulo canônico quando existe; senão o que o laudo escreveu.
        label: ANALYTE_BY_SLUG.get(slug)?.label ?? (v.label as string),
        pontos: [],
        delta: null,
        semData: 0,
      } satisfies SerieDeAnalito);

    atual.pontos.push({
      collectedOn: (v.collected_on as string | null) ?? null,
      valueNum: v.value_num == null ? null : Number(v.value_num),
      valueText: (v.value_text as string | null) ?? null,
      unit: (v.unit as string | null) ?? null,
      refText: (v.ref_text as string | null) ?? null,
      refMin: v.ref_min == null ? null : Number(v.ref_min),
      refMax: v.ref_max == null ? null : Number(v.ref_max),
    });
    if (!v.collected_on) atual.semData += 1;
    porAnalito.set(slug, atual);
  }

  for (const serie of porAnalito.values()) {
    // Variação só entre pontos COM data e COM número: comparar dois resultados
    // sem saber qual veio antes produziria um delta com o sinal trocado.
    const comparaveis = serie.pontos.filter((p) => p.collectedOn && p.valueNum != null);
    serie.delta =
      comparaveis.length >= 2
        ? Math.round(
            (comparaveis[comparaveis.length - 1].valueNum! - comparaveis[0].valueNum!) * 100
          ) / 100
        : null;
  }

  return [...porAnalito.values()].sort((a, b) => {
    // Quem tem série (2+ pontos) primeiro: é o que a tela existe para mostrar.
    const sa = a.pontos.length > 1 ? 0 : 1;
    const sb = b.pontos.length > 1 ? 0 : 1;
    return sa - sb || a.label.localeCompare(b.label);
  });
}
