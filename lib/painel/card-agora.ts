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

import { formatarHora } from "@/lib/time/format";
import { FRESH_MAX_MINUTES, describeAge } from "@/lib/health/reading-freshness";

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
  /**
   * Ciclo de hipoglicemia (Etapa 2, B2): o evento que "Fiz" e a reavaliação
   * fecham. Nulo quando o evento ainda não existe — "Fiz" então o cria com a
   * leitura que disparou o card.
   */
  hypo?: {
    eventId: string | null;
    glucoseMgDl: number | null;
    detectedAt: string | null;
    emergencyText: string | null;
  };
  /**
   * Medicação atrasada (um item): o remédio e a dose que "Registrei" e "Adiar
   * 15 min" gravam pelas rotas da notificação (correção de 31/10/2026 — antes
   * o botão apontava para um formulário que não existia).
   */
  medicacao?: { medId: string; scheduledFor: string };
};

/**
 * Ações que só ESCONDEM o card até o fim do dia neste aparelho ("Hoje não",
 * "Adiar aviso", "Entendi"). Não havia rota para nenhuma delas: o botão não
 * fazia nada. O componente as trata localmente.
 */
export const INTENTS_DE_DISPENSAR = [
  "/api/card/dispensar",
  "/api/estoque/adiar",
  "/api/exercicio/adiar",
  "/api/exercicio/dispensar",
  "/api/interacao/lida",
] as const;

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
  /** Fuso do perfil. A consulta já o resolvia (`lib/queries/card-agora.ts`) e
   *  não o entregava à regra — por isso as horas do card saíam em UTC. */
  timezone?: string | null;
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
  lateMedications: { medId?: string; name: string; scheduledAt: string; minutesLate: number }[];
  lowStock: { medId?: string; name: string; units: number; daysLeft: number }[];
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

/** Fuso explícito: sem ele o servidor formata em UTC e a dose das 19:00 vira
 *  22:00 na tela — foi o que a auditoria de 08/09/2026 mediu no histórico. */
const HORA = (iso: string, timezone?: string | null) =>
  formatarHora(iso, timezone);

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

/**
 * Idade máxima da leitura para o card crítico de hipoglicemia (Etapa 1, B1).
 *
 * Antes não havia limite: o card só considerava a glicemia "ausente" quando o
 * recibo dizia que não havia leitura em 14 DIAS — uma leitura baixa de ontem
 * elegia "Glicemia baixa" hoje, mostrando só a hora, sem a data. 60 min cobre o
 * ciclo de quem mede no dedo (corrigir e medir de novo em 15 min) sem acusar
 * hipo com dado de horas atrás. É regra de apresentação, não clínica; o valor
 * fica para validação do proprietário (D7).
 */
export const HIPO_LEITURA_MAX_MINUTOS = 60;

/**
 * Até quando uma última leitura baixa, sem nada depois, ainda pede "meça de
 * novo" (6 h, a mesma janela em que um episódio aberto comanda o card).
 */
export const HIPO_ACOMPANHAMENTO_MAX_MINUTOS = 6 * 60;

/** Minutos desde a leitura, ou null se não há horário. */
function idadeDaLeituraMin(ctx: CardContext): number | null {
  if (!ctx.lastGlucoseAt) return null;
  const t = Date.parse(ctx.lastGlucoseAt);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((ctx.now.getTime() - t) / 60000));
}

function hipoCondicao(ctx: CardContext): boolean {
  if (glucoseBlind(ctx) || ctx.lastGlucose == null) return false;
  const idade = idadeDaLeituraMin(ctx);
  if (idade != null && idade > HIPO_LEITURA_MAX_MINUTOS) return false;
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
    // A idade vai junto quando a leitura não é "de agora": só a hora fazia uma
    // leitura de ontem parecer de hoje.
    const idade = idadeDaLeituraMin(ctx);
    const idadeTxt = idade != null && idade > FRESH_MAX_MINUTES ? ` (${describeAge(idade)})` : "";
    const hora = ctx.lastGlucoseAt ? ` às ${HORA(ctx.lastGlucoseAt, ctx.timezone)}${idadeTxt}` : "";
    const tend = ctx.glucoseTrend === "down" ? " · caindo" : "";
    return `${valor}${hora}${tend}`;
  };

  const limiarHipo = ctx.hypoPlan?.thresholdMgDl ?? ctx.targetRange.low;
  const ev = ctx.openHypoEvent;
  // "Fiz" depois da última leitura: o card de agir não volta igual (cada toque
  // criava outro episódio, sem confirmação na tela). Espera a reavaliação.
  const agiuDepoisDaLeitura = Boolean(
    ev?.actedAt && (!ctx.lastGlucoseAt || Date.parse(ev.actedAt) >= Date.parse(ctx.lastGlucoseAt))
  );

  // 1 / 1b — hipoglicemia. O texto NUNCA passa pela LLM.
  if (hipoCondicao(ctx) && !(agiuDepoisDaLeitura && ctx.hypoPlan)) {
    if (ctx.hypoPlan) {
      // Abaixo do limiar há episódio a registrar; no ramo "caindo" (ainda
      // acima do limiar) a conduta aparece, mas "Fiz" não grava hipo que não
      // houve.
      const abaixo = (ctx.lastGlucose as number) < limiarHipo;
      return {
        id: "hipo_ativa",
        level: "critico",
        title: abaixo ? "Glicemia baixa" : "Glicemia caindo perto do limiar",
        evidence: evidenciaGlicemia(),
        // Literal, sem reescrita: é a conduta que ele definiu com o médico.
        body: ctx.hypoPlan.correctionText,
        why: abaixo
          ? `Sua leitura ficou abaixo do limiar de ${ctx.hypoPlan.thresholdMgDl} mg/dL que você cadastrou.`
          : `Sua leitura está caindo e a menos de 20 mg/dL do limiar de ${ctx.hypoPlan.thresholdMgDl} mg/dL que você cadastrou.`,
        actions: [
          ...(abaixo ? [{ label: "Fiz", kind: "primary" as const, intent: "/api/hypo/acted" }] : []),
          { label: "Registrar nova medição", kind: abaixo ? ("secondary" as const) : ("primary" as const), intent: "/glicemia" },
          ...(ctx.hypoPlan.emergencyText
            ? [{ label: "Emergência", kind: "secondary" as const, intent: "/api/hypo/emergency" }]
            : []),
        ],
        narratable: false,
        hypo: {
          // Leitura nova ainda baixa depois de agir é o MESMO episódio: "Fiz"
          // atualiza o evento aberto em vez de criar outro.
          eventId: ev?.id ?? null,
          glucoseMgDl: abaixo ? ctx.lastGlucose : null,
          detectedAt: ctx.lastGlucoseAt,
          emergencyText: ctx.hypoPlan.emergencyText,
        },
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
        evidence: `você agiu às ${HORA(ctx.openHypoEvent.actedAt, ctx.timezone)} · ${minutos} min`,
        body: null,
        why: `Você cadastrou reavaliação em ${ctx.hypoPlan.recheckMinutes} minutos após agir.`,
        actions: [{ label: "Registrar medição", kind: "primary", intent: "/api/hypo/recheck" }],
        narratable: false,
        hypo: {
          eventId: ctx.openHypoEvent.id,
          glucoseMgDl: ctx.openHypoEvent.glucoseMgDl,
          detectedAt: ctx.openHypoEvent.detectedAt,
          emergencyText: ctx.hypoPlan.emergencyText,
        },
      };
    }
    if (agiuDepoisDaLeitura) {
      // A confirmação do "Fiz" e o relógio da reavaliação, no lugar do card
      // de agir.
      const faltam = ctx.hypoPlan.recheckMinutes - minutos;
      return {
        id: "hipo_aguardando",
        level: "critico",
        title: "Correção registrada",
        evidence: `você agiu às ${HORA(ctx.openHypoEvent.actedAt, ctx.timezone)} · reavaliar em ${faltam} min`,
        body: null,
        why: `Você cadastrou reavaliação em ${ctx.hypoPlan.recheckMinutes} minutos após agir.`,
        actions: [{ label: "Registrar nova medição", kind: "secondary", intent: "/glicemia" }],
        narratable: false,
      };
    }
  }

  // 1d — a última leitura foi baixa e nada veio depois. Antes o card sumia
  // aos 60 min sem que nada tivesse sido resolvido.
  if (!glucoseBlind(ctx) && ctx.lastGlucose != null && ctx.lastGlucose < limiarHipo) {
    const idade = idadeDaLeituraMin(ctx);
    if (idade != null && idade > HIPO_LEITURA_MAX_MINUTOS && idade <= HIPO_ACOMPANHAMENTO_MAX_MINUTOS) {
      return {
        id: "hipo_leitura_antiga",
        level: "atencao",
        title: "Última leitura foi baixa",
        evidence: evidenciaGlicemia(),
        body: "Não chegou leitura nova depois dela. Meça de novo para saber como está agora.",
        why: `A última leitura registrada ficou abaixo de ${limiarHipo} mg/dL e tem mais de ${HIPO_LEITURA_MAX_MINUTOS} minutos.`,
        actions: [{ label: "Registrar medição", kind: "primary", intent: "/glicemia" }],
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
        // Antes apontava para a lista de medicamentos, que não menciona
        // interação nenhuma: o card anunciava um achado e o botão levava a uma
        // tela onde ele não existe. E o painel mostra só a MAIS GRAVE — as
        // demais só passaram a ter onde aparecer com esta tela.
        { label: "Ver detalhes", kind: "secondary", intent: "/medicacao/interacoes" },
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
      evidence: `aplicada às ${HORA(ctx.rapidInsulin.appliedAt, ctx.timezone)} · há ${ctx.rapidInsulin.minutesAgo} min`,
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
        ? ctx.lateMedications.map((m) => `${m.name} ${HORA(m.scheduledAt, ctx.timezone)}`).join(" · ")
        : `previsto ${HORA(primeira.scheduledAt, ctx.timezone)} · atrasado ${primeira.minutesLate} min`,
      body: null,
      why: "O horário passou sem registro de dose e sem adiamento ativo.",
      // Com vários atrasados, adiar exigiria escolher um: vai para a agenda.
      // Com um só (e o id dele), os botões gravam pelas rotas da notificação.
      actions:
        varias || !primeira.medId
          ? [{ label: "Ver agenda", kind: "primary", intent: "/medicacao" }]
          : [
              { label: "Registrei", kind: "primary", intent: "/api/medications/taken" },
              { label: "Adiar 15 min", kind: "secondary", intent: "/api/medications/snooze" },
            ],
      narratable: false,
      ...(!varias && primeira.medId ? { medicacao: { medId: primeira.medId, scheduledFor: primeira.scheduledAt } } : {}),
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
      // "Repor" leva à tela de reposição DESTE item (somar compra ou informar
      // o total) — antes caía na lista inteira de medicamentos.
      actions: [
        {
          label: "Repor estoque",
          kind: "primary",
          intent: item.medId ? `/medicacao/estoque/${item.medId}` : "/medicacao/medicamentos",
        },
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
