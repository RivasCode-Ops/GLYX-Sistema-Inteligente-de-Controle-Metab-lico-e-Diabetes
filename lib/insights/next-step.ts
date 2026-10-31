import {
  classifyGlucose,
  DEFAULT_TARGET_MAX_MG_DL,
  DEFAULT_TARGET_MIN_MG_DL,
  type GlucoseZone,
} from "@/lib/health/glucose-thresholds";

export type NextStepTone = "danger" | "warning" | "success" | "neutral";

export type NextStepInsight = {
  text: string;
  actionLabel: string;
  actionHref: string;
  tone: NextStepTone;
};

/**
 * Sugestão de "próximo passo" no dashboard, derivada por regra dos dados já
 * calculados (sem custo/latência de IA).
 *
 * A zona vem de `classifyGlucose` com a faixa do PERFIL (Etapa 2, B10) — a
 * mesma régua do cartão de glicemia ao lado. Antes eram 70/180/140 fixos: com
 * meta 70–140, um 160 aparecia "acima da meta" no cartão e "um pouco acima"
 * aqui; com meta 80–200, um 75 era "na meta" no cartão e "baixa" aqui.
 */
export function getNextStepInsight(input: {
  latestGlucose: number | null;
  /** Zona já classificada com a faixa do perfil; ausente, usa a faixa padrão. */
  zone?: GlucoseZone | null;
  carbsToday: number;
  activeMinutes: number;
}): NextStepInsight {
  const { latestGlucose, carbsToday, activeMinutes } = input;

  if (latestGlucose == null) {
    return {
      text: "Você ainda não registrou nenhuma leitura de glicemia hoje.",
      actionLabel: "Registrar leitura",
      actionHref: "/glicemia",
      tone: "neutral",
    };
  }

  const zone =
    input.zone ??
    classifyGlucose(latestGlucose, {
      targetMin: DEFAULT_TARGET_MIN_MG_DL,
      targetMax: DEFAULT_TARGET_MAX_MG_DL,
    }).zone;

  if (zone === "abaixo") {
    return {
      text: "Glicemia abaixo da meta. Considere um lanche rápido com carboidrato e reavalie em 15 minutos.",
      actionLabel: "Registrar refeição",
      actionHref: "/alimentacao/foto",
      tone: "danger",
    };
  }

  if (zone === "acima") {
    return {
      text: "Glicemia acima da meta. Beba água e monitore de perto nas próximas horas.",
      actionLabel: "Ver histórico",
      actionHref: "/glicemia/historico",
      tone: "danger",
    };
  }

  // SUGESTÃO DE EXERCÍCIO REMOVIDA — 07/09/2026.
  //
  // Aqui havia, para glicemia entre 140 e 179 sem atividade no dia: "Uma
  // caminhada de 15 minutos pode ajudar", com link para o plano de exercício.
  //
  // A entrada desta função é `{ latestGlucose, carbsToday, activeMinutes }`.
  // Não é que faltasse checar insulina rápida ativa: o dado não chega aqui.
  // E a faixa é justamente a pior — com insulina rápida em ação, exercício
  // SOMA ao efeito hipoglicemiante, que é a mesma somatória que o contador de
  // mecanismos (`lib/safety/mechanism-count.ts`) conta como via distinta.
  // Sugerir atividade sem olhar `insulin_logs` empurra para baixo uma glicemia
  // que já está caindo.
  //
  // Volta quando a guarda `exerciseSuppressed` existir, com a janela de ação
  // da insulina rápida (5 h no seed de mecanismos) consultada antes de
  // sugerir. Até lá, a orientação alimentar cobre os dois ramos — ela não tem
  // como piorar uma hipoglicemia.
  if (zone === "topo_da_meta") {
    return {
      text: "Glicemia no topo da meta. Vale controlar o carboidrato da próxima refeição.",
      actionLabel: "Registrar refeição",
      actionHref: "/alimentacao/foto",
      tone: "warning",
    };
  }

  if (carbsToday === 0 && activeMinutes === 0) {
    return {
      text: "Nenhuma refeição ou atividade registrada ainda hoje. Comece registrando o que comeu.",
      actionLabel: "Registrar refeição",
      actionHref: "/alimentacao/foto",
      tone: "neutral",
    };
  }

  return {
    text: "Glicemia dentro da meta. Continue assim.",
    actionLabel: "Ver tendências",
    actionHref: "/glicemia",
    tone: "success",
  };
}
