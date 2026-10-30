import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { ParsedValue } from "./parse-values";
import { regravarValores, toExamValueRows, type ExamValueRow } from "./save-values";

// GLYX-20: reextrair nunca deixa o exame com menos do que tinha.

type Linha = Record<string, unknown>;
type Falha = "select" | "upsert" | "delete";

/** `exam_values` falso com o unique (exam_id, analyte) e upsert de um comando só. */
function banco(inicial: Linha[], falhar?: Falha) {
  let tabela: Linha[] = inicial.map((l, i) => ({ id: `id${i}`, ...l }));
  let seq = tabela.length;
  const erro = { message: "falha simulada" };

  const from = () => {
    const filtros: ((l: Linha) => boolean)[] = [];
    let op: "select" | "delete" = "select";
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => (filtros.push((l) => l[c] === v), b),
      in: (c: string, vs: unknown[]) => (filtros.push((l) => vs.includes(l[c])), b),
      delete: () => ((op = "delete"), b),
      upsert: async (rows: Linha[]) => {
        if (falhar === "upsert") return { error: erro };
        const nova = [...tabela];
        for (const r of rows) {
          const i = nova.findIndex((t) => t.exam_id === r.exam_id && t.analyte === r.analyte);
          if (i >= 0) nova[i] = { ...nova[i], ...r };
          else nova.push({ id: `id${seq++}`, ...r });
        }
        tabela = nova;
        return { error: null };
      },
      then: <R>(resolve: (v: { data: Linha[] | null; error: typeof erro | null }) => R) => {
        if (falhar === op) return Promise.resolve(resolve({ data: null, error: erro }));
        const alvo = tabela.filter((l) => filtros.every((f) => f(l)));
        if (op === "delete") tabela = tabela.filter((l) => !alvo.includes(l));
        return Promise.resolve(resolve({ data: alvo, error: null }));
      },
    };
    return b;
  };

  return { cliente: { from } as unknown as SupabaseClient, tabela: () => tabela };
}

function linha(analyte: string, value_num: number): ExamValueRow {
  return {
    exam_id: "e1",
    user_id: "u1",
    analyte,
    label: analyte,
    value_num,
    value_text: null,
    unit: null,
    ref_min: null,
    ref_max: null,
    ref_text: null,
    collected_on: "2026-07-15",
  };
}

const ANTIGOS = [linha("hba1c", 7.9), linha("ldl", 140), linha("creatinina", 1.1)];
const valores = (t: () => Linha[]) =>
  Object.fromEntries(t().map((l) => [l.analyte as string, l.value_num]));

describe("regravarValores", () => {
  it("troca os valores e remove o analito que o laudo não tem mais", async () => {
    const { cliente, tabela } = banco(ANTIGOS);
    const r = await regravarValores(cliente, "e1", "u1", [linha("hba1c", 7.1), linha("ldl", 98)]);
    expect(r).toEqual({ ok: true, extraidos: 2 });
    expect(valores(tabela)).toEqual({ hba1c: 7.1, ldl: 98 });
  });

  it("o caso do defeito: gravação falha e os valores antigos continuam", async () => {
    // Antes: delete sem checagem + insert falho = exame com zero valores.
    const { cliente, tabela } = banco(ANTIGOS, "upsert");
    const r = await regravarValores(cliente, "e1", "u1", [linha("hba1c", 7.1)]);
    expect(r.error).toMatch(/mantidos/);
    expect(valores(tabela)).toEqual({ hba1c: 7.9, ldl: 140, creatinina: 1.1 });
  });

  it("leitura dos atuais falha: nada muda", async () => {
    const { cliente, tabela } = banco(ANTIGOS, "select");
    const r = await regravarValores(cliente, "e1", "u1", [linha("hba1c", 7.1)]);
    expect(r.error).toMatch(/Nada foi alterado/);
    expect(valores(tabela)).toEqual({ hba1c: 7.9, ldl: 140, creatinina: 1.1 });
  });

  it("limpeza falha: os novos ficam e a sobra é avisada, não escondida", async () => {
    const { cliente, tabela } = banco(ANTIGOS, "delete");
    const r = await regravarValores(cliente, "e1", "u1", [linha("hba1c", 7.1)]);
    expect(r.ok).toBe(true);
    expect(r.aviso).toMatch(/2 valor\(es\)/);
    expect(valores(tabela)).toEqual({ hba1c: 7.1, ldl: 140, creatinina: 1.1 });
  });

  it("não toca valores de outro exame", async () => {
    const outro = { ...linha("ldl", 120), exam_id: "e2" };
    const { cliente, tabela } = banco([...ANTIGOS, outro]);
    await regravarValores(cliente, "e1", "u1", [linha("hba1c", 7.1)]);
    expect(tabela().find((l) => l.exam_id === "e2")?.value_num).toBe(120);
  });
});

describe("toExamValueRows", () => {
  const pv = (label: string, analyte: string | null = null): ParsedValue => ({
    analyte,
    label,
    valueNum: 1,
    valueText: null,
    unit: null,
    refMin: null,
    refMax: null,
    refText: null,
    source: label,
  });

  it("dois rótulos longos com o mesmo começo não quebram o unique", () => {
    const base = "Pesquisa de anticorpos anti-receptor de TSH (TRAb)";
    const rows = toExamValueRows([pv(`${base} método A`), pv(`${base} método B`)], "e1", "u1", null);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe(`${base} método A`);
  });

  it("slug canônico tem prioridade sobre o livre", () => {
    const rows = toExamValueRows([pv("Hemoglobina glicada", "hba1c")], "e1", "u1", "2026-07-15");
    expect(rows[0]).toMatchObject({ analyte: "hba1c", collected_on: "2026-07-15" });
  });
});
