export type NextStepTone = "danger" | "warning" | "success" | "neutral";

export type NextStepInsight = {
  text: string;
  actionLabel: string;
  actionHref: string;
  tone: NextStepTone;
};

/**
 * Sugestão de "próximo passo" no dashboard, derivada por regra dos dados já
 * calculados (sem custo/latência de IA). Usa os mesmos limiares de
 * lib/queries/dashboard.ts (Atenção: <70 ou >=180; Moderado: >=140).
 */
export function getNextStepInsight(input: {
  latestGlucose: number | null;
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

  if (latestGlucose < 70) {
    return {
      text: "Glicemia baixa. Considere um lanche rápido com carboidrato e reavalie em 15 minutos.",
      actionLabel: "Registrar refeição",
      actionHref: "/alimentacao/foto",
      tone: "danger",
    };
  }

  if (latestGlucose >= 180) {
    return {
      text: "Glicemia bem acima da meta. Beba água e monitore de perto nas próximas horas.",
      actionLabel: "Ver histórico",
      actionHref: "/glicemia/historico",
      tone: "danger",
    };
  }

  if (latestGlucose >= 140) {
    return activeMinutes === 0
      ? {
          text: "Glicemia acima da meta e nenhuma atividade hoje. Uma caminhada de 15 minutos pode ajudar.",
          actionLabel: "Ver plano de exercício",
          actionHref: "/exercicios/plano",
          tone: "warning",
        }
      : {
          text: "Glicemia um pouco acima da meta. Vale controlar o carboidrato da próxima refeição.",
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
