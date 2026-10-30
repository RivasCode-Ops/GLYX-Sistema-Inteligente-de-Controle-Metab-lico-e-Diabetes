import { parseModelJson } from "./parse-json";

// Converte a resposta textual do modelo (JSON, possivelmente cercado de ```json)
// no objeto de refeição; em falha de parse, preserva o texto bruto em notes.
// As rotas de refeição usam `validateMealEstimate`; isto fica para quem só
// quer o objeto, sem decidir se ele vale como estimativa.
export function parseMealJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as Record<string, unknown>;
  } catch {
    return { name: "análise pendente", notes: raw };
  }
}

/**
 * Resposta que não dá pra usar: vazia ou cortada no teto de `max_tokens`.
 *
 * Sem essa checagem o fluxo falha em silêncio — `parseMealJson` cai no
 * fallback, `sumMealItems` soma zero item e a rota devolve calorias/macros
 * zerados como se a estimativa tivesse dado certo. Foi o que aconteceu em
 * 20/07/2026, quando um build sem `thinking: disabled` gastou todos os tokens
 * em raciocínio e devolveu conteúdo vazio: a tela mostrou 0 em tudo, sem erro.
 */
export function isUnusableCompletion(
  content: string | null | undefined,
  finishReason?: string | null
): boolean {
  return !content?.trim() || finishReason === "length";
}

export type MealItem = {
  name: string;
  calories: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  /** Só preenchido pela análise por foto (um item pode ter carga glicêmica
   * bem diferente do resto do prato — ex.: o refrigerante sozinho). */
  glycemic_load_estimate?: number;
  implication?: string;
};

// Soma os itens detectados (um por alimento/bebida distinto na foto) nos
// totais da refeição — o modelo não é confiável pra fazer essa soma sozinho,
// então a aritmética fica no servidor.
export function sumMealItems(raw: Record<string, unknown>): {
  name: string;
  calories: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  items: MealItem[];
} {
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items: MealItem[] = rawItems.map((it) => {
    const r = (it ?? {}) as Record<string, unknown>;
    return {
      name: String(r.name ?? "item"),
      calories: Number(r.calories) || 0,
      carbs_g: Number(r.carbs_g) || 0,
      protein_g: Number(r.protein_g) || 0,
      fat_g: Number(r.fat_g) || 0,
      ...(typeof r.glycemic_load_estimate === "number"
        ? { glycemic_load_estimate: r.glycemic_load_estimate }
        : {}),
      ...(typeof r.implication === "string" && r.implication ? { implication: r.implication } : {}),
    };
  });

  const sum = (key: keyof MealItem) =>
    Math.round(items.reduce((acc, it) => acc + (typeof it[key] === "number" ? (it[key] as number) : 0), 0));

  return {
    name: items.map((it) => it.name).filter(Boolean).join(" + ") || String(raw.name ?? "análise pendente"),
    calories: sum("calories"),
    carbs_g: sum("carbs_g"),
    protein_g: sum("protein_g"),
    fat_g: sum("fat_g"),
    items,
  };
}

/**
 * Teto por ITEM de comida ou bebida. Não é regra nutricional: é filtro de
 * plausibilidade, a mesma ideia do filtro de glicemia. Um prato feito tem
 * ~800 kcal e ~100 g de carboidrato; 3000 kcal ou 400 g num item só é erro de
 * leitura (unidade trocada, gramas do prato no lugar de carboidrato), não
 * refeição grande. Refeição grande vem como vários itens.
 */
export const MEAL_ITEM_MAX = { calories: 3000, carbs_g: 400, protein_g: 300, fat_g: 300 } as const;

export type MealEstimate =
  | {
      ok: true;
      totals: ReturnType<typeof sumMealItems>;
      /** Carga glicêmica do conjunto (0–100), ou null se o modelo não deu uma válida. */
      glycemicLoad: number | null;
      raw: Record<string, unknown>;
    }
  | { ok: false; motivo: "json_invalido" | "sem_itens" | "fora_da_faixa"; detalhe: string };

/** Número de verdade: aceita "62" mas não "", null, "muito" nem NaN. */
function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function cargaGlicemica(v: unknown): number | null {
  const n = numero(v);
  return n != null && n >= 0 && n <= 100 ? n : null;
}

/**
 * Decide se a resposta do modelo vale como estimativa (GLYX-27 / P12).
 *
 * Antes, JSON ilegível caía em `parseMealJson` → "análise pendente" sem itens →
 * `sumMealItems` somava zero, e campo não numérico virava 0 via `|| 0`. A tela
 * recebia uma refeição de 0 g de carboidrato indistinguível de uma estimativa
 * real — e carboidrato alimenta a calculadora de bolus. Agora qualquer um dos
 * três casos é falha declarada, e quem chama devolve erro em vez de número.
 */
export function validateMealEstimate(content: string | null | undefined): MealEstimate {
  const raw = parseModelJson<unknown>(content);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, motivo: "json_invalido", detalhe: "resposta não é um objeto JSON" };
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.items) || obj.items.length === 0) {
    return { ok: false, motivo: "sem_itens", detalhe: "nenhum item identificado" };
  }

  const items: Record<string, unknown>[] = [];
  for (const it of obj.items) {
    if (!it || typeof it !== "object") {
      return { ok: false, motivo: "json_invalido", detalhe: "item que não é objeto" };
    }
    const r = { ...(it as Record<string, unknown>) };
    for (const campo of Object.keys(MEAL_ITEM_MAX) as (keyof typeof MEAL_ITEM_MAX)[]) {
      const n = numero(r[campo]);
      if (n == null || n < 0 || n > MEAL_ITEM_MAX[campo]) {
        return {
          ok: false,
          motivo: "fora_da_faixa",
          detalhe: `${String(r.name ?? "item")}: ${campo}=${JSON.stringify(r[campo])}`,
        };
      }
      r[campo] = n;
    }
    // Carga glicêmica é complemento, não base de conta: inválida some do item
    // em vez de derrubar a estimativa — e nunca vira 0.
    const cg = cargaGlicemica(r.glycemic_load_estimate);
    if (cg == null) delete r.glycemic_load_estimate;
    else r.glycemic_load_estimate = cg;
    items.push(r);
  }

  const limpo = { ...obj, items };
  const totals = sumMealItems(limpo);

  // A do conjunto vem do campo de topo (texto) ou da média dos itens que têm
  // uma (foto). Item sem carga não entra na média como zero.
  const doTopo = cargaGlicemica(obj.glycemic_load_estimate);
  const dosItens = totals.items
    .map((i) => i.glycemic_load_estimate)
    .filter((v): v is number => typeof v === "number");
  const glycemicLoad =
    doTopo ?? (dosItens.length ? Math.round(dosItens.reduce((a, b) => a + b, 0) / dosItens.length) : null);

  return { ok: true, totals, glycemicLoad, raw: limpo };
}

/** Resposta HTTP para estimativa reprovada. `origem` muda só a frase do "sem itens". */
export function mealEstimateError(
  motivo: Extract<MealEstimate, { ok: false }>["motivo"],
  origem: "foto" | "texto"
): { error: string; status: number } {
  if (motivo === "sem_itens") {
    return {
      error:
        origem === "foto"
          ? "Não identifiquei comida ou bebida nesta foto. Tente uma imagem mais nítida ou registre manualmente."
          : "Não identifiquei comida ou bebida nessa descrição. Tente descrever de forma mais simples.",
      status: 422,
    };
  }
  return {
    error:
      "A estimativa da IA veio com valores que não fazem sentido, então não foi usada. " +
      "Tente de novo ou registre os valores manualmente.",
    status: 502,
  };
}
