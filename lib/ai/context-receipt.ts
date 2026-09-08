/**
 * Recibo de contexto — o que o app SABE, separado do que ele NÃO RECEBEU.
 *
 * REGRA CENTRAL: todo campo tem três estados, nunca dois.
 *
 *   registrado      — há linhas no período
 *   zero_confirmado — há registro explícito de ausência; é fato
 *   nao_registrado  — não há linha nenhuma; é lacuna
 *
 * `nao_registrado` NUNCA vira zero, nem no prompt nem na tela. A diferença
 * importa porque o modelo, vendo "0 g de carboidrato", conclui jejum; vendo
 * "sem registro", declara a lacuna. A mesma regra já existia no SYSTEM para
 * dose de medicação ("pode ser falha de registro, não presuma não-adesão") —
 * aqui ela vale para todas as fontes.
 *
 * E há uma consequência para o checador de interação: se a leitura de
 * `medications` voltar vazia por qualquer motivo — filtro, `active`, RLS —, o
 * cruzamento acontece contra conjunto vazio e não encontra nada. Isso sai como
 * silêncio, e silêncio já foi lido como liberação uma vez.
 */

export type FieldState = "registrado" | "zero_confirmado" | "nao_registrado";

/** As oito fontes que entram no contexto do copiloto. */
export const RECEIPT_KEYS = [
  "glicemia",
  "alimentacao",
  "exercicio",
  "medicacao",
  "insulina",
  "sono",
  "alertas_48h",
  "mapa_risco",
] as const;

export type ReceiptKey = (typeof RECEIPT_KEYS)[number];

export type ReceiptField = {
  /** chave do campo, igual à usada no user-context */
  key: ReceiptKey;
  state: FieldState;
  /** contagem de linhas lidas da fonte — SEMPRE um inteiro, nunca null */
  count: number;
  /** resumo curto e legível, ou null quando nao_registrado */
  summary: string | null;
  /** janela consultada, em ISO */
  window: { from: string; to: string };
  /** divergências detectadas contra outra fonte da mesma grandeza */
  divergence: string | null;
};

export type ContextReceipt = {
  builtAt: string;
  userId: string;
  fields: ReceiptField[];
  /** true se qualquer campo tem divergence != null */
  hasDivergence: boolean;
  /** chaves em nao_registrado, para o prompt e para a UI */
  missing: ReceiptKey[];
};

export type FieldInput = {
  /**
   * Contagem de linhas vinda da MESMA query que alimenta o `user-context`.
   * Não derivar do resumo já montado: se o resumo estiver errado, a contagem
   * repete o erro e o recibo perde exatamente a função que tem.
   */
  count: number;
  summary: string | null;
  window: { from: string; to: string };
  /**
   * true quando existe registro EXPLÍCITO de ausência — o usuário disse que não
   * houve, em vez de não ter dito nada. Sem isso, contagem zero é lacuna.
   */
  zeroConfirmed?: boolean;
  divergence?: string | null;
};

/**
 * Monta o recibo.
 *
 * O parâmetro é um `Record` das oito chaves: omitir uma é erro de compilação,
 * não teste que falha depois. Campo ausente do recibo é bug — o prompt passaria
 * a não mencionar uma fonte inteira, e ninguém veria.
 */
export function buildContextReceipt(
  userId: string,
  entradas: Record<ReceiptKey, FieldInput>,
  builtAt: Date = new Date()
): ContextReceipt {
  const fields: ReceiptField[] = RECEIPT_KEYS.map((key) => {
    const e = entradas[key];
    const count = Math.max(0, Math.trunc(e.count));
    const state: FieldState =
      count > 0 ? "registrado" : e.zeroConfirmed ? "zero_confirmado" : "nao_registrado";
    return {
      key,
      state,
      count,
      // Resumo só existe quando há o que resumir. Deixar texto num campo sem
      // registro é o caminho mais curto para o "0 g de carboidrato" voltar.
      summary: state === "nao_registrado" ? null : e.summary,
      window: e.window,
      divergence: e.divergence ?? null,
    };
  });

  return {
    builtAt: builtAt.toISOString(),
    userId,
    fields,
    hasDivergence: fields.some((f) => f.divergence !== null),
    missing: fields.filter((f) => f.state === "nao_registrado").map((f) => f.key),
  };
}

// ---------------------------------------------------------------------------
// Regras de divergência — uma função por par, sem generalizar
// ---------------------------------------------------------------------------
// Generalizar aqui produziria uma regra que "detecta inconsistência" e não
// consegue dizer QUAL, o que é o mesmo que não detectar. Cada uma abaixo nasce
// de um conflito concreto entre duas fontes da mesma grandeza.

/**
 * Sessão de exercício registrada com duração total zero.
 *
 * NOTA: este NÃO é o caso da captura de 07/09/2026, ao contrário do que o
 * briefing supõe. Lá, "Hoje: Inferior A" era `planSummaryLabel(suggestFromPlan(…))`
 * — o treino SUGERIDO para o dia, derivado da recuperação muscular — e não uma
 * sessão registrada. Os dois números estavam certos, medindo coisas diferentes;
 * a tela é que os mostrava na mesma coluna. Isso já foi corrigido.
 *
 * A regra continua valendo por si: sessão gravada sem duração é dado que some
 * do contador de minutos, e o recibo deixa de escondê-lo.
 */
export function divergenciaExercicio(input: {
  sessions: number;
  totalMinutes: number;
}): string | null {
  if (input.sessions > 0 && input.totalMinutes === 0) {
    return `${input.sessions} sessão(ões) registrada(s) com 0 min de duração`;
  }
  return null;
}

/**
 * Doses órfãs. `medication_logs.medication_id` é `on delete set null`, então
 * apagar um medicamento deixa registros sem nome. Qualquer contagem de adesão
 * que os ignore está errada, e para menos.
 */
export function divergenciaMedicacao(input: { orphanLogs: number }): string | null {
  if (input.orphanLogs > 0) {
    return `${input.orphanLogs} dose(s) sem medicamento associado (medication_id null)`;
  }
  return null;
}

/** Refeição marcada como causadora de pico sem leitura de glicemia depois dela. */
export function divergenciaAlimentacao(input: {
  spikeMeals: number;
  glucoseReadingsAfterSpike: number;
}): string | null {
  if (input.spikeMeals > 0 && input.glucoseReadingsAfterSpike === 0) {
    return `${input.spikeMeals} refeição(ões) marcada(s) como pico sem leitura de glicemia posterior`;
  }
  return null;
}

/**
 * Insulina sem tipo definido.
 *
 * `'outra'` não mapeia para `insulina_basal` nem `insulina_rapida`, então esses
 * registros SOMEM do conjunto de substâncias em uso do checador de interação —
 * e sumir do checador é sumir de um alerta de segurança. O usuário precisa
 * saber disso.
 */
export function divergenciaInsulina(input: { kindOther: number }): string | null {
  if (input.kindOther > 0) {
    return `${input.kindOther} registro(s) de insulina sem tipo definido — não entram no checador de interação`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Renderização para o prompt
// ---------------------------------------------------------------------------

const LARGURA_CHAVE = Math.max(...RECEIPT_KEYS.map((k) => k.length));

const ROTULO_ESTADO: Record<FieldState, string> = {
  registrado: "registrado",
  zero_confirmado: "zero_confirmado",
  nao_registrado: "nao_registrado",
};

/**
 * O recibo vai no TOPO do bloco de contexto, antes dos dados — o modelo precisa
 * saber o que falta antes de ler o que existe.
 */
export function renderContextReceipt(receipt: ContextReceipt): string {
  const linhas = receipt.fields.map((f) => {
    const chave = f.key.padEnd(LARGURA_CHAVE);
    const estado = ROTULO_ESTADO[f.state].padEnd(15);
    const contagem = `${f.count}`.padStart(3);
    const detalhe = f.summary ? ` | ${f.summary}` : "";
    const divergencia = f.divergence ? ` | DIVERGENCIA: ${f.divergence}` : "";
    return `${chave} | ${estado} | ${contagem} linha(s)${detalhe}${divergencia}`;
  });

  const semRegistro = receipt.missing.length
    ? `\n\nCAMPOS SEM REGISTRO: ${receipt.missing.join(", ")}`
    : "\n\nCAMPOS SEM REGISTRO: (nenhum)";

  return `RECIBO DE CONTEXTO (montado em ${receipt.builtAt})\n${linhas.join("\n")}${semRegistro}`;
}
