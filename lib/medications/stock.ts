/**
 * Estoque restante — e a diferença entre "acabou" e "não sei mais".
 *
 * ---------------------------------------------------------------------------
 * O DEFEITO
 * ---------------------------------------------------------------------------
 * A projeção é simples: unidades informadas, menos os dias passados vezes as
 * doses por dia. Ela assume que toda dose prevista foi tomada, todo dia, desde
 * a última atualização — e o app tem `medication_logs`, mas essa conta não os
 * consulta.
 *
 * Enquanto a informação é recente isso é aproximação razoável. Quando ela
 * envelhece, deixa de ser: medido em 08/09/2026, sete dos dez itens com estoque
 * apareciam como "Estoque pode ter acabado — reponha e atualize", e todos
 * tinham estoque informado havia 52 a 57 dias. O aviso não estava medindo o
 * estoque, estava medindo o tempo desde o último cadastro — e com sete de dez
 * disparando ao mesmo tempo, virou ruído que ninguém lê.
 *
 * ---------------------------------------------------------------------------
 * A CORREÇÃO É DE FRASE, NÃO DE FÓRMULA
 * ---------------------------------------------------------------------------
 * A projeção continua a mesma. O que muda é o que o app AFIRMA quando ela
 * termina: não "seu estoque acabou" — que ele não tem como saber — e sim "a
 * informação que eu tinha já se esgotou pela conta; me diga quanto sobrou".
 *
 * É a mesma régua da leitura de glicemia velha e do relatório com idade: número
 * derivado de informação vencida não vira afirmação sobre o presente.
 */

export type MedicationStock = {
  stock_units?: number | null;
  stock_updated_on?: string | null;
  reminder_times?: string[] | null;
};

export type StockState =
  | { kind: "sem_dado" }
  /** A projeção ainda cobre o presente. */
  | { kind: "estimado"; daysLeft: number; low: boolean }
  /** A projeção terminou: o app não sabe mais, e diz isso. */
  | { kind: "informacao_vencida"; daysSinceUpdate: number };

/** Abaixo disto o aviso é útil; acima, é só informação. */
export const LOW_STOCK_DAYS = 7;

export function stockState(m: MedicationStock, now: Date = new Date()): StockState {
  if (m.stock_units == null || !m.stock_updated_on) return { kind: "sem_dado" };

  const dosesPorDia = Math.max(m.reminder_times?.length ?? 1, 1);
  const diasDesde = Math.max(
    0,
    Math.floor((now.getTime() - new Date(m.stock_updated_on).getTime()) / 86_400_000)
  );
  const restante = Math.floor((m.stock_units - diasDesde * dosesPorDia) / dosesPorDia);

  if (restante <= 0) return { kind: "informacao_vencida", daysSinceUpdate: diasDesde };
  return { kind: "estimado", daysLeft: restante, low: restante <= LOW_STOCK_DAYS };
}

/** Frase pronta — uma só, para as telas não divergirem no texto. */
export function stockLabel(state: StockState, isSupplement: boolean): string | null {
  const icone = isSupplement ? "🥄" : "💊";
  switch (state.kind) {
    case "sem_dado":
      return null;
    case "estimado":
      return `${icone} Estoque para ~${state.daysLeft} dia(s)`;
    case "informacao_vencida":
      // Não afirma que acabou: afirma que a informação venceu, que é o que o
      // app de fato sabe.
      return `${icone} Estoque informado há ${state.daysSinceUpdate} dias — pela conta já teria acabado. Atualize para o app voltar a estimar.`;
  }
}
