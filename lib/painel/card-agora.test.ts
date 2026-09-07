import { describe, expect, it } from "vitest";
import {
  MIN_OCORRENCIAS_PADRAO,
  REGEX_DOSE,
  elegerCard,
  exerciseSuppressed,
  glucoseBlind,
  textoDoCard,
  type CardContext,
  type HypoPlan,
} from "./card-agora";

const AGORA = new Date("2026-09-07T17:05:00.000Z");

const PLANO: HypoPlan = {
  correctionText: "Tomar 150 ml de suco de laranja e aguardar.",
  recheckMinutes: 15,
  thresholdMgDl: 70,
  emergencyText: null,
};

function ctx(over: Partial<CardContext> = {}): CardContext {
  return {
    now: AGORA,
    lastGlucose: 118,
    lastGlucoseAt: "2026-09-07T17:00:00.000Z",
    glucoseTrend: "flat",
    targetRange: { low: 70, high: 140 },
    hypoPlan: PLANO,
    openHypoEvent: null,
    rapidInsulin: null,
    blockedInteraction: null,
    lateMedications: [],
    lowStock: [],
    receiptMissing: [],
    exerciseSessionToday: false,
    exerciseStartingNow: false,
    plannedWorkoutLabel: null,
    withinPreferredExerciseWindow: false,
    lastMeal: null,
    medianMealCarbs: null,
    weekPattern: null,
    medicationsOnTime: 0,
    ...over,
  };
}

describe("prioridade", () => {
  it("hipo vence medicação atrasada e janela de exercício simultâneas", () => {
    const c = elegerCard(
      ctx({
        lastGlucose: 62,
        glucoseTrend: "down",
        lateMedications: [
          { name: "Lantus", scheduledAt: "2026-09-07T01:00:00.000Z", minutesLate: 40 },
        ],
        withinPreferredExerciseWindow: true,
        weekPattern: { label: "picos após o almoço", occurrences: 9, weeks: 3 },
      })
    );
    expect(c.id).toBe("hipo_ativa");
    expect(c.level).toBe("critico");
  });

  it("todas as regras falsas cai em 'nada'", () => {
    expect(elegerCard(ctx()).id).toBe("nada");
  });

  it("é sempre UM card, nunca lista", () => {
    const c = elegerCard(ctx({ lateMedications: [], lowStock: [] }));
    expect(Array.isArray(c)).toBe(false);
    expect(typeof c.id).toBe("string");
  });
});

describe("travas de segurança", () => {
  const cenarios: [string, Partial<CardContext>][] = [
    ["glicemia abaixo da faixa", { lastGlucose: 60 }],
    ["insulina rápida ativa", { rapidInsulin: { appliedAt: "2026-09-07T16:30:00.000Z", minutesAgo: 35 } }],
    ["sem leitura de glicemia", { lastGlucose: null }],
    ["tendência de queda", { glucoseTrend: "down" }],
    ["evento de hipo aberto", { openHypoEvent: { id: "e1", detectedAt: "", glucoseMgDl: 60, actedAt: null } }],
  ];

  it.each(cenarios)("%s suprime a sugestão de exercício", (_nome, over) => {
    const c = ctx({ withinPreferredExerciseWindow: true, ...over });
    expect(exerciseSuppressed(c)).toBe(true);
    expect(elegerCard(c).id).not.toBe("janela_exercicio");
  });

  it("a guarda também suprime a contenção de pico", () => {
    const c = ctx({
      rapidInsulin: { appliedAt: "2026-09-07T16:30:00.000Z", minutesAgo: 35 },
      lastMeal: { name: "almoço", carbs: 68, minutesAgo: 10 },
      medianMealCarbs: 40,
    });
    expect(elegerCard(c).id).not.toBe("contencao_pico");
  });

  it("hipo_ativa e hipo_sem_plano nunca são narratable", () => {
    const comPlano = elegerCard(ctx({ lastGlucose: 62 }));
    const semPlano = elegerCard(ctx({ lastGlucose: 62, hypoPlan: null }));
    expect(comPlano.id).toBe("hipo_ativa");
    expect(comPlano.narratable).toBe(false);
    expect(semPlano.id).toBe("hipo_sem_plano");
    expect(semPlano.narratable).toBe(false);
  });

  it("o texto do plano vai literal, sem reescrita", () => {
    expect(elegerCard(ctx({ lastGlucose: 62 })).body).toBe(PLANO.correctionText);
  });

  it("sem leitura de glicemia o motor não conclui sobre glicemia", () => {
    const c = ctx({ lastGlucose: null, receiptMissing: ["glicemia"] });
    expect(glucoseBlind(c)).toBe(true);
    const eleito = elegerCard(c);
    expect(["hipo_ativa", "hipo_sem_plano", "janela_exercicio", "contencao_pico"]).not.toContain(
      eleito.id
    );
  });

  it("mas alerta que não depende de glicemia continua aparecendo", () => {
    // Suprimir a interação grave por falta de leitura seria esconder um alerta
    // de segurança por causa de um dado que não é dele.
    const c = ctx({
      lastGlucose: null,
      receiptMissing: ["glicemia", "sono"],
      blockedInteraction: { message: "RISCO DE HIPOGLICEMIA GRAVE." },
    });
    expect(elegerCard(c).id).toBe("interacao_grave");
  });

  it("nenhum card critico coexiste com sugestão de exercício", () => {
    const c = elegerCard(
      ctx({
        blockedInteraction: { message: "RISCO DE HIPOGLICEMIA GRAVE." },
        withinPreferredExerciseWindow: true,
      })
    );
    expect(c.level).toBe("critico");
    expect(c.id).not.toBe("janela_exercicio");
  });
});

/**
 * A varredura que impede o card de virar superfície de dose. Inclui o exemplo
 * do próprio briefing para `estoque_baixo` ("12 unidades · ~4 dias"), que
 * reprovava aqui — num app de insulina, "unidades" é a palavra da dose.
 */
describe("nenhum card carrega número de dose", () => {
  const todos = [
    elegerCard(ctx({ lastGlucose: 62 })),
    elegerCard(ctx({ lastGlucose: 62, hypoPlan: null })),
    elegerCard(ctx({ openHypoEvent: { id: "e", detectedAt: "", glucoseMgDl: 60, actedAt: "2026-09-07T16:40:00.000Z" } })),
    elegerCard(ctx({ blockedInteraction: { message: "Não combine sem avaliação médica." } })),
    elegerCard(
      ctx({
        rapidInsulin: { appliedAt: "2026-09-07T16:30:00.000Z", minutesAgo: 35 },
        exerciseStartingNow: true,
      })
    ),
    elegerCard(
      ctx({ lateMedications: [{ name: "Lantus", scheduledAt: "2026-09-07T01:00:00.000Z", minutesLate: 40 }] })
    ),
    elegerCard(ctx({ lowStock: [{ name: "Fiasp", units: 12, daysLeft: 4 }] })),
    elegerCard(ctx({ receiptMissing: ["alimentacao", "sono"] })),
    elegerCard(ctx({ withinPreferredExerciseWindow: true, plannedWorkoutLabel: "Inferior A" })),
    elegerCard(ctx({ lastMeal: { name: "almoço", carbs: 68, minutesAgo: 10 }, medianMealCarbs: 40 })),
    elegerCard(ctx({ weekPattern: { label: "picos após o almoço", occurrences: 9, weeks: 3 } })),
    elegerCard(ctx({ medicationsOnTime: 4 })),
  ];

  it.each(todos.map((c) => [c.id, c] as const))("%s", (_id, card) => {
    for (const t of textoDoCard(card)) {
      expect(t, `"${t}"`).not.toMatch(REGEX_DOSE);
    }
  });

  it("o exemplo do briefing reprovaria", () => {
    expect("12 unidades · ~4 dias").toMatch(REGEX_DOSE);
    expect(elegerCard(ctx({ lowStock: [{ name: "Fiasp", units: 12, daysLeft: 4 }] })).evidence).not.toMatch(
      REGEX_DOSE
    );
  });
});

describe("ciclo do hipo", () => {
  it("dispara abaixo do limiar cadastrado", () => {
    expect(elegerCard(ctx({ lastGlucose: 62 })).id).toBe("hipo_ativa");
  });

  it("dispara acima do limiar quando está caindo", () => {
    expect(elegerCard(ctx({ lastGlucose: 82, glucoseTrend: "down" })).id).toBe("hipo_ativa");
  });

  it("não dispara na faixa com tendência estável", () => {
    expect(elegerCard(ctx({ lastGlucose: 118, glucoseTrend: "flat" })).id).toBe("nada");
  });

  it("o limiar é o do usuário, não um número do código", () => {
    const limiarAlto = { ...PLANO, thresholdMgDl: 90 };
    expect(elegerCard(ctx({ lastGlucose: 85, hypoPlan: limiarAlto })).id).toBe("hipo_ativa");
    expect(elegerCard(ctx({ lastGlucose: 85 })).id).not.toBe("hipo_ativa");
  });

  it("depois de agir, a reavaliação aparece quando o tempo dele passa", () => {
    const agiu = (minutosAtras: number) => ({
      id: "e1",
      detectedAt: "2026-09-07T16:30:00.000Z",
      glucoseMgDl: 62,
      actedAt: new Date(AGORA.getTime() - minutosAtras * 60_000).toISOString(),
    });
    expect(elegerCard(ctx({ openHypoEvent: agiu(10) })).id).not.toBe("hipo_recheck");
    expect(elegerCard(ctx({ openHypoEvent: agiu(20) })).id).toBe("hipo_recheck");
  });

  it("a reavaliação cita o horário em que ele agiu", () => {
    const c = elegerCard(
      ctx({
        openHypoEvent: {
          id: "e1",
          detectedAt: "2026-09-07T16:30:00.000Z",
          glucoseMgDl: 62,
          actedAt: "2026-09-07T16:40:00.000Z",
        },
      })
    );
    expect(c.id).toBe("hipo_recheck");
    expect(c.evidence).toContain("min");
  });

  it("sem plano, o card leva ao cadastro e não sugere conduta", () => {
    const c = elegerCard(ctx({ lastGlucose: 62, hypoPlan: null }));
    expect(c.actions[0].intent).toContain("hipoglicemia");
    expect(c.body).toContain("definida com o seu médico");
    expect(c.body).not.toMatch(/tome|coma|ingira/i);
  });
});

describe("supressão de padrão", () => {
  it(`abaixo de ${MIN_OCORRENCIAS_PADRAO} ocorrências não existe padrão`, () => {
    const c = elegerCard(ctx({ weekPattern: { label: "x", occurrences: 2, weeks: 3 } }));
    expect(c.id).toBe("nada");
  });

  it("a partir de 3, existe e mostra a contagem", () => {
    const c = elegerCard(ctx({ weekPattern: { label: "picos após o almoço", occurrences: 3, weeks: 2 } }));
    expect(c.id).toBe("padrao_semana");
    expect(c.evidence).toContain("3 ocorrências");
  });
});

describe("toda regra produz card executável", () => {
  const eleitos = [
    elegerCard(ctx({ lastGlucose: 62 })),
    elegerCard(ctx({ lastGlucose: 62, hypoPlan: null })),
    elegerCard(ctx({ openHypoEvent: { id: "e", detectedAt: "", glucoseMgDl: 60, actedAt: "2026-09-07T16:40:00.000Z" } })),
    elegerCard(ctx({ blockedInteraction: { message: "m" } })),
    elegerCard(ctx({ rapidInsulin: { appliedAt: "2026-09-07T16:30:00.000Z", minutesAgo: 35 }, exerciseStartingNow: true })),
    elegerCard(ctx({ lateMedications: [{ name: "L", scheduledAt: "2026-09-07T01:00:00.000Z", minutesLate: 40 }] })),
    elegerCard(ctx({ lowStock: [{ name: "F", units: 12, daysLeft: 4 }] })),
    elegerCard(ctx({ receiptMissing: ["alimentacao", "sono"] })),
    elegerCard(ctx({ withinPreferredExerciseWindow: true })),
    elegerCard(ctx({ lastMeal: { name: "almoço", carbs: 68, minutesAgo: 10 }, medianMealCarbs: 40 })),
    elegerCard(ctx({ weekPattern: { label: "p", occurrences: 9, weeks: 3 } })),
    elegerCard(ctx()),
  ];

  it.each(eleitos.map((c) => [c.id, c] as const))("%s tem ação que grava", (_id, card) => {
    expect(card.actions.length).toBeGreaterThan(0);
    for (const a of card.actions) expect(a.intent.trim()).not.toBe("");
    expect(card.actions.filter((a) => a.kind === "primary")).toHaveLength(1);
  });

  it("as doze regras são alcançáveis", () => {
    expect(new Set(eleitos.map((c) => c.id)).size).toBe(12);
  });
});

describe("o card neutro não inventa urgência", () => {
  const c = elegerCard(ctx({ medicationsOnTime: 4, lastGlucose: 118 }));

  it("diz o que foi verificado", () => {
    expect(c.evidence).toContain("4 medicamento(s) em dia");
    expect(c.evidence).toContain("glicemia na faixa");
  });

  it("não traz saudação nem motivação", () => {
    for (const t of textoDoCard(c)) {
      expect(t).not.toMatch(/bom dia|boa tarde|boa noite|parabéns|continue assim|você consegue/i);
    }
  });
});
