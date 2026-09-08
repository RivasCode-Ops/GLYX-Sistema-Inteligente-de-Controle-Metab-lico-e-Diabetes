/**
 * Motor do card "o que fazer agora".
 *
 * REGRAS DE ESCOPO, todas com teste:
 *
 * 1. O motor DECIDE qual card aparece; a LLM só redige o texto do card eleito,
 *    e apenas quando `narratable` é true. Se nada é eleito além do neutro, não
 *    há chamada de IA.
 * 2. Nenhuma conduta é inventada. O card de hipoglicemia renderiza o plano que
 *    o usuário cadastrou com o médico, literal. O app não define quantidade,
 *    dose nem intervalo clínico.
 * 3. Um card por vez. Prioridade estrita, primeiro match vence.
 * 4. Card sem ação executável não existe: todo card tem ao menos uma ação com
 *    `intent` não vazio.
 * 5. Ausência de alerta é dita, não escondida.
 *
 * O módulo é PURO: recebe um contexto já lido, devolve um card. É o que torna a
 * prioridade e as travas testáveis sem banco.
 */

export type CardLevel = "critico" | "atencao" | "neutro";

export type CardAction = {
  label: string;
  kind: "primary" | "secondary";
  /** endpoint ou rota que grava — card sem isso não passa no teste */
  intent: string;
};

export type CardAgora = {
  /** slug estável, usado em teste e telemetria */
  id: string;
  level: CardLevel;
  title: string;
  /** o dado que disparou a regra, literal */
  evidence: string;
  /** corpo do card; no hipo é o texto do usuário, sem reescrita */
  body: string | null;
  /** regra em linguagem simples, exibida no "Por quê?" */
  why: string;
  actions: CardAction[];
  /** true quando o texto pode ser reescrito pela LLM */
  narratable: boolean;
};

export type HypoPlan = {
  correctionText: string;
  recheckMinutes: number;
  thresholdMgDl: number;
  emergencyText: string | null;
};

export type OpenHypoEvent = {
  id: string;
  detectedAt: string;
  glucoseMgDl: number;
  actedAt: string | null;
};

/**
 * Tendência no vocabulário que o app JÁ usa (`lib/health/reading-freshness.ts`).
 *
 * O briefing escreve `"caindo"`. Manter dois nomes para a mesma grandeza é
 * justamente o que produziu o conflito "Inferior A" × "0 min" no painel, então
 * aqui vale o vocabulário existente: `"down"` é caindo.
 */
export type GlucoseTrend = "up" | "down" | "flat" | null;

export type CardContext = {
  now: Date;
  lastGlucose: number | null;
  lastGlucoseAt: string | null;
  glucoseTrend: GlucoseTrend;
  targetRange: { low: number; high: number };
  hypoPlan: HypoPlan | null;
  /** evento com `acted_at` preenchido e `recheck_at` nulo */
  openHypoEvent: OpenHypoEvent | null;
  /** insulina rápida ainda dentro da janela de ação */
  rapidInsulin: { appliedAt: string; minutesAgo: number } | null;
  /** veredito `blocked` da fatia 1, ainda não lido pelo usuário */
  blockedInteraction: { message: string } | null;
  lateMedications: { name: string; scheduledAt: string; minutesLate: number }[];
  lowStock: { name: string; units: number; daysLeft: number }[];
  /** chaves em `nao_registrado` vindas do recibo da fatia 3 */
  receiptMissing: string[];
  exerciseSessionToday: boolean;
  exerciseStartingNow: boolean;
  /** rótulo do treino planejado, quando houver */
  plannedWorkoutLabel: string | null;
  withinPreferredExerciseWindow: boolean;
  lastMeal: { name: string; carbs: number; minutesAgo: number } | null;
  medianMealCarbs: number | null;
  weekPattern: { label: string; occurrences: number; weeks: number } | null;
  /** contagens para o card neutro dizer o que foi verificado */
  medicationsOnTime: number;
};

/** Abaixo disto o motor de insights não afirma padrão — mesma régua do MuscleMind. */
export const MIN_OCORRENCIAS_PADRAO = 3;

const HORA = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

// ---------------------------------------------------------------------------
// Travas — guardas nomeadas, não posição na lista
// ---------------------------------------------------------------------------
// A ordem das regras pode ser alterada por engano; uma guarda com nome, não.

/**
 * Sugestão de exercício é suprimida sempre que houver risco de queda.
 *
 * Esta é a trava que faltava quando o card de dica sugeria caminhada com
 * glicemia entre 140 e 179 sem olhar insulina rápida — a lacuna que fez a
 * sugestão ser removida em 07/09/2026. Ela volta por aqui, com o dado.
 */
export function exerciseSuppressed(ctx: CardContext): boolean {
  return (
    ctx.lastGlucose == null || // sem dado, não sugere
    ctx.lastGlucose < ctx.targetRange.low ||
    ctx.glucoseTrend === "down" ||
    ctx.rapidInsulin !== null ||
    ctx.openHypoEvent !== null
  );
}

/**
 * Sem leitura de glicemia, o motor não conclui nada sobre glicemia.
 *
 * Cards que não dependem dela — interação, medicação atrasada, estoque —
 * continuam valendo: suprimi-los seria esconder um alerta de segurança por
 * falta de um dado que não é dele.
 */
export function glucoseBlind(ctx: CardContext): boolean {
  return ctx.lastGlucose == null || ctx.receiptMissing.includes("glicemia");
}

function hipoCondicao(ctx: CardContext): boolean {
  if (glucoseBlind(ctx) || ctx.lastGlucose == null) return false;
  const limiar = ctx.hypoPlan?.thresholdMgDl ?? ctx.targetRange.low;
  if (ctx.lastGlucose < limiar) return true;
  // Acima do limiar mas caindo: a condição do briefing para "queda acentuada".
  return ctx.glucoseTrend === "down" && ctx.lastGlucose < limiar + 20;
}

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

export function elegerCard(ctx: CardContext): CardAgora {
  const evidenciaGlicemia = () => {
    const valor = `${ctx.lastGlucose} mg/dL`;
    const hora = ctx.lastGlucoseAt ? ` às ${HORA(ctx.lastGlucoseAt)}` : "";
    const tend = ctx.glucoseTrend === "down" ? " · caindo" : "";
    return `${valor}${hora}${tend}`;
  };

  // 1 / 1b — hipoglicemia. O texto NUNCA passa pela LLM.
  if (hipoCondicao(ctx)) {
    if (ctx.hypoPlan) {
      return {
        id: "hipo_ativa",
        level: "critico",
        title: "Glicemia baixa",
        evidence: evidenciaGlicemia(),
        // Literal, sem reescrita: é a conduta que ele definiu com o médico.
        body: ctx.hypoPlan.correctionText,
        why: `Sua leitura ficou abaixo do limiar de ${ctx.hypoPlan.thresholdMgDl} mg/dL que você cadastrou.`,
        actions: [
          { label: "Fiz", kind: "primary", intent: "/api/hypo/acted" },
          { label: "Registrar nova medição", kind: "secondary", intent: "/glicemia" },
          ...(ctx.hypoPlan.emergencyText
            ? [{ label: "Emergência", kind: "secondary" as const, intent: "/api/hypo/emergency" }]
            : []),
        ],
        narratable: false,
      };
    }
    return {
      id: "hipo_sem_plano",
      level: "critico",
      title: "Glicemia baixa — plano não configurado",
      evidence: evidenciaGlicemia(),
      body:
        "O app não tem a sua conduta de hipoglicemia cadastrada. Ela é definida com o seu médico — o GLYX não sugere o que fazer nem quanto tomar.",
      why: "Sua leitura ficou abaixo do limite inferior da sua faixa alvo, e não há plano cadastrado.",
      actions: [
        { label: "Cadastrar meu plano", kind: "primary", intent: "/perfil/hipoglicemia" },
        { label: "Registrar nova medição", kind: "secondary", intent: "/glicemia" },
      ],
      narratable: false,
    };
  }

  // 1c — reavaliação pendente.
  if (ctx.openHypoEvent?.actedAt && ctx.hypoPlan) {
    const minutos = Math.floor(
      (ctx.now.getTime() - new Date(ctx.openHypoEvent.actedAt).getTime()) / 60_000
    );
    if (minutos >= ctx.hypoPlan.recheckMinutes) {
      return {
        id: "hipo_recheck",
        level: "critico",
        title: "Hora de conferir de novo",
        evidence: `você agiu às ${HORA(ctx.openHypoEvent.actedAt)} · ${minutos} min`,
        body: null,
        why: `Você cadastrou reavaliação em ${ctx.hypoPlan.recheckMinutes} minutos após agir.`,
        actions: [{ label: "Registrar medição", kind: "primary", intent: "/api/hypo/recheck" }],
        narratable: false,
      };
    }
  }

  // 2 — interação grave. A mensagem é a da tabela, literal.
  if (ctx.blockedInteraction) {
    return {
      id: "interacao_grave",
      level: "critico",
      title: "Interação grave",
      evidence: "checagem determinística do app",
      body: ctx.blockedInteraction.message,
      why: "O par foi encontrado na base de interações do app, com severidade grave.",
      actions: [
        { label: "Entendi", kind: "primary", intent: "/api/interacao/lida" },
        { label: "Ver detalhes", kind: "secondary", intent: "/medicacao/medicamentos" },
      ],
      narratable: false,
    };
  }

  // 3 — insulina rápida ativa com exercício em jogo.
  if (ctx.rapidInsulin && (ctx.exerciseStartingNow || ctx.withinPreferredExerciseWindow)) {
    return {
      id: "insulina_ativa_exercicio",
      level: "atencao",
      title: "Insulina rápida ativa",
      evidence: `aplicada às ${HORA(ctx.rapidInsulin.appliedAt)} · há ${ctx.rapidInsulin.minutesAgo} min`,
      body: ctx.hypoPlan
        ? `Atividade física com insulina rápida em ação aumenta o risco de queda. Sua conduta cadastrada: ${ctx.hypoPlan.correctionText}`
        : "Atividade física com insulina rápida em ação aumenta o risco de queda. Você ainda não cadastrou sua conduta de hipoglicemia.",
      why: "Há insulina rápida dentro da janela de ação e treino previsto ou em início.",
      actions: [
        { label: "Adiar treino", kind: "primary", intent: "/api/exercicio/adiar" },
        { label: "Registrar glicemia antes", kind: "secondary", intent: "/glicemia" },
      ],
      narratable: false,
    };
  }

  // 4 — medicação atrasada. Agrega quando há mais de uma.
  if (ctx.lateMedications.length) {
    const [primeira] = ctx.lateMedications;
    const varias = ctx.lateMedications.length > 1;
    return {
      id: "medicacao_atrasada",
      level: "atencao",
      title: varias ? `${ctx.lateMedications.length} medicamentos atrasados` : `${primeira.name} atrasado`,
      evidence: varias
        ? ctx.lateMedications.map((m) => `${m.name} ${HORA(m.scheduledAt)}`).join(" · ")
        : `previsto ${HORA(primeira.scheduledAt)} · atrasado ${primeira.minutesLate} min`,
      body: null,
      why: "O horário passou sem registro de dose e sem adiamento ativo.",
      actions: varias
        ? [
            { label: "Ver agenda", kind: "primary", intent: "/medicacao" },
            { label: "Adiar 15 min", kind: "secondary", intent: "/api/medications/snooze" },
          ]
        : [
            { label: "Registrei", kind: "primary", intent: "/api/medications/taken" },
            { label: "Adiar 15 min", kind: "secondary", intent: "/api/medications/snooze" },
          ],
      narratable: false,
    };
  }

  // 5 — estoque baixo.
  if (ctx.lowStock.length) {
    const [item] = ctx.lowStock;
    return {
      id: "estoque_baixo",
      level: "atencao",
      title: `${item.name} acabando`,
      // "12 unidades" reprovaria na varredura de dose — e com razão, porque num
      // app de insulina "unidades" é a palavra da dose.
      evidence: `${item.units} em estoque · ~${item.daysLeft} dia(s)`,
      body: null,
      why: "O estoque cadastrado não cobre os próximos 7 dias no ritmo dos seus horários.",
      actions: [
        { label: "Atualizar estoque", kind: "primary", intent: "/medicacao/medicamentos" },
        { label: "Adiar aviso", kind: "secondary", intent: "/api/estoque/adiar" },
      ],
      narratable: false,
    };
  }

  // 6 — contexto incompleto. Existe para o app não ficar mudo justamente
  // quando entende menos.
  if (ctx.receiptMissing.length >= 2) {
    return {
      id: "contexto_incompleto",
      level: "atencao",
      title: "Leitura do dia incompleta",
      evidence: `sem registro de ${ctx.receiptMissing.join(" e ")}`,
      body: null,
      why: "Duas ou mais fontes do dia estão sem registro, então as análises saem parciais.",
      actions: [
        { label: "Registrar refeição", kind: "primary", intent: "/alimentacao/foto" },
        { label: "Registrar glicemia", kind: "secondary", intent: "/glicemia" },
      ],
      narratable: false,
    };
  }

  // 7 — janela de exercício. Só passa pela guarda.
  if (
    !exerciseSuppressed(ctx) &&
    !ctx.exerciseSessionToday &&
    ctx.withinPreferredExerciseWindow &&
    ctx.lastGlucose != null &&
    ctx.lastGlucose <= ctx.targetRange.high
  ) {
    const partes = [
      `${ctx.lastGlucose} mg/dL${ctx.glucoseTrend === "flat" ? " estável" : ""}`,
      "sem insulina rápida ativa",
      ...(ctx.plannedWorkoutLabel ? [`${ctx.plannedWorkoutLabel} pendente`] : []),
    ];
    return {
      id: "janela_exercicio",
      level: "neutro",
      title: "Boa janela para treinar",
      evidence: partes.join(" · "),
      body: null,
      why: "Glicemia na faixa, sem insulina rápida na janela de ação e sem sessão registrada hoje.",
      actions: [
        { label: "Iniciar sessão", kind: "primary", intent: "/exercicios" },
        { label: "Hoje não", kind: "secondary", intent: "/api/exercicio/dispensar" },
      ],
      narratable: true,
    };
  }

  // 8 — contenção de pico.
  if (
    !exerciseSuppressed(ctx) &&
    ctx.lastMeal &&
    ctx.lastMeal.minutesAgo <= 30 &&
    ctx.medianMealCarbs != null &&
    ctx.lastMeal.carbs > ctx.medianMealCarbs
  ) {
    return {
      id: "contencao_pico",
      level: "neutro",
      title: "Caminhada agora ajuda",
      evidence: `${ctx.lastMeal.name} com ${ctx.lastMeal.carbs} g carb há ${ctx.lastMeal.minutesAgo} min`,
      body:
        "Caminhada curta depois da refeição, hidratação e comer salada ou proteína antes do carboidrato ajudam a conter o pico.",
      why: `O carboidrato desta refeição está acima da sua mediana (${ctx.medianMealCarbs} g).`,
      actions: [
        { label: "Registrar caminhada", kind: "primary", intent: "/exercicios" },
        { label: "Dispensar", kind: "secondary", intent: "/api/card/dispensar" },
      ],
      narratable: true,
    };
  }

  // 9 — padrão da semana. Abaixo de 3 ocorrências o motor não afirma padrão.
  if (ctx.weekPattern && ctx.weekPattern.occurrences >= MIN_OCORRENCIAS_PADRAO) {
    return {
      id: "padrao_semana",
      level: "neutro",
      title: "Padrão observado",
      evidence: `${ctx.weekPattern.occurrences} ocorrências · ${ctx.weekPattern.weeks} semanas`,
      body: ctx.weekPattern.label,
      why: `O motor de insights só afirma padrão a partir de ${MIN_OCORRENCIAS_PADRAO} ocorrências.`,
      actions: [{ label: "Ver análise", kind: "primary", intent: "/analise" }],
      narratable: true,
    };
  }

  // 10 — nada pendente. Diz o que foi verificado; não inventa urgência nem
  // mensagem motivacional.
  const verificado = [
    ctx.medicationsOnTime > 0 ? `${ctx.medicationsOnTime} medicamento(s) em dia` : null,
    ctx.lastGlucose != null && ctx.lastGlucose <= ctx.targetRange.high
      ? "glicemia na faixa"
      : null,
  ].filter(Boolean);

  return {
    id: "nada",
    level: "neutro",
    title: "Nada pendente agora",
    evidence: verificado.length ? verificado.join(" · ") : "sem pendências detectadas",
    body: null,
    why: "Nenhuma das regras do painel encontrou pendência com os dados de agora.",
    actions: [
      { label: "Registrar glicemia", kind: "primary", intent: "/glicemia" },
      { label: "Registrar refeição", kind: "secondary", intent: "/alimentacao/foto" },
    ],
    narratable: false,
  };
}

/** Regex da varredura de dose. Nenhum texto de card pode casar. */
export const REGEX_DOSE = /\d+\s*(unidades?|UI|U)\b/i;

/** Todo texto que um card leva para a tela. */
export function textoDoCard(card: CardAgora): string[] {
  return [card.title, card.evidence, card.body ?? "", card.why, ...card.actions.map((a) => a.label)];
}
