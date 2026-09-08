import { describe, expect, it } from "vitest";
import { computeMuscleResponse, porPrioridade } from "./muscle-response";
import { computeWeeklyVolume, type StrengthLogRow } from "./weekly-volume";
import type { ExerciseProgression } from "./weekly-volume";
import type { BodyMeasurement } from "@/lib/body/fields";
import type { MuscleGroupId } from "@/lib/data/muscle-groups";

const AGORA = new Date("2026-09-07T12:00:00Z");
const JANELA = 4;

function log(
  grupo: string,
  sets: number,
  diasAtras: number,
  exercicio = "supino reto"
): StrengthLogRow {
  return {
    exercise_name: exercicio,
    muscle_group: grupo,
    weight_kg: 60,
    reps: 10,
    sets,
    logged_at: new Date(AGORA.getTime() - diasAtras * 86_400_000).toISOString(),
  };
}

/** Volume real, vindo da regra — não um objeto montado à mão que poderia
 *  divergir da função que a tela usa. */
function volumeCom(logs: StrengthLogRow[]) {
  return computeWeeklyVolume(logs, JANELA, AGORA);
}

function prog(grupo: string, delta: number, exercicio = "supino reto"): ExerciseProgression {
  return {
    exercise: exercicio,
    muscleGroup: grupo,
    firstOneRm: 80,
    lastOneRm: 80 * (1 + delta / 100),
    deltaPercent: delta,
    sessions: 4,
    progressing: delta >= 2.5,
  };
}

function medicao(diasAtras: number, campos: Partial<BodyMeasurement>): BodyMeasurement {
  const d = new Date(AGORA.getTime() - diasAtras * 86_400_000);
  return {
    id: `m-${diasAtras}`,
    user_id: "u1",
    measured_on: d.toISOString().slice(0, 10),
    created_at: d.toISOString(),
    ...campos,
  } as BodyMeasurement;
}

/** Peito com histórico estabelecido em vários grupos, para as guardas de
 *  "grupo novo no modelo" não silenciarem o caso sob teste. */
function logsDeBase(): StrengthLogRow[] {
  const out: StrengthLogRow[] = [];
  for (const g of ["peito", "costas", "biceps"]) {
    for (let i = 0; i < 5; i++) out.push(log(g, 8, i * 3 + 1, `ex-${g}`));
  }
  return out;
}

function acha(res: ReturnType<typeof computeMuscleResponse>, id: MuscleGroupId) {
  return res.find((r) => r.id === id)!;
}

describe("computeMuscleResponse", () => {
  it("carga subindo com volume na faixa é resposta positiva", () => {
    const logs = logsDeBase();
    const res = computeMuscleResponse(
      volumeCom(logs),
      [prog("peito", 7.2, "ex-peito")],
      new Map(),
      [],
      JANELA,
      AGORA
    );
    const peito = acha(res, "peito");
    expect(peito.veredito).toBe("positiva");
    expect(peito.performancePct).toBe(7.2);
  });

  it("volume abaixo do piso e carga parada é estímulo insuficiente", () => {
    // Bíceps com 1 série a cada registro: fica abaixo do piso de 6/semana.
    const logs = logsDeBase().filter((l) => l.muscle_group !== "biceps");
    for (let i = 0; i < 5; i++) logs.push(log("biceps", 1, i * 3 + 1, "ex-biceps"));
    const res = computeMuscleResponse(
      volumeCom(logs),
      [prog("biceps", 0.4, "ex-biceps")],
      new Map(),
      [],
      JANELA,
      AGORA
    );
    const b = acha(res, "biceps");
    expect(b.veredito).toBe("estimulo_insuficiente");
    expect(b.motivo).toContain("abaixo do piso");
  });

  it("volume na faixa e carga parada manda revisar, e NÃO manda somar série", () => {
    const logs = logsDeBase();
    const res = computeMuscleResponse(
      volumeCom(logs),
      [prog("peito", 0.5, "ex-peito")],
      new Map(),
      [],
      JANELA,
      AGORA
    );
    const peito = acha(res, "peito");
    expect(peito.veredito).toBe("revisar");
    expect(peito.motivo).toMatch(/alimentação, sono, adesão e execução/);
    // A saída burra seria "aumente o volume". O texto não pode sugerir isso.
    expect(peito.motivo).not.toMatch(/aumente o volume|acrescente séries/i);
  });

  it("sem carga anotada não afirma resposta — volume sozinho não é resultado", () => {
    const logs = logsDeBase().map((l) => ({ ...l, weight_kg: null }));
    const res = computeMuscleResponse(volumeCom(logs), [], new Map(), [], JANELA, AGORA);
    const peito = acha(res, "peito");
    expect(peito.veredito).toBe("sem_base");
    expect(peito.performancePct).toBeNull();
    expect(peito.motivo).toContain("sem carga anotada");
  });

  it("grupo novo no modelo fica calado em vez de aparecer como não responde", () => {
    // Só peito tem histórico; trapézio entra sem registro nenhum.
    const logs: StrengthLogRow[] = [];
    for (let i = 0; i < 5; i++) logs.push(log("peito", 4, i * 3 + 1, "ex-peito"));
    const res = computeMuscleResponse(volumeCom(logs), [], new Map(), [], JANELA, AGORA);
    expect(acha(res, "trapezio").veredito).toBe("sem_base");
  });

  it("a medida confirma a progressão quando saiu do ruído", () => {
    const logs = logsDeBase();
    const history = [
      medicao(70, { arm_right_flexed_cm: 38 }),
      medicao(2, { arm_right_flexed_cm: 39.2 }),
    ];
    const res = computeMuscleResponse(
      volumeCom(logs),
      [prog("biceps", 6, "ex-biceps")],
      new Map(),
      history,
      8,
      AGORA
    );
    const b = acha(res, "biceps");
    expect(b.veredito).toBe("positiva");
    expect(b.medida?.delta).toBe(1.2);
    expect(b.motivo).toContain("cm");
  });

  it("medida parada NÃO derruba a progressão de carga para negativa", () => {
    const logs = logsDeBase();
    // 0,2 cm em três meses está abaixo do piso de ruído da fita.
    const history = [
      medicao(70, { arm_right_flexed_cm: 38 }),
      medicao(2, { arm_right_flexed_cm: 38.2 }),
    ];
    const res = computeMuscleResponse(
      volumeCom(logs),
      [prog("biceps", 6, "ex-biceps")],
      new Map(),
      history,
      8,
      AGORA
    );
    const b = acha(res, "biceps");
    expect(b.veredito).toBe("positiva");
    expect(b.motivo).toContain("não saiu do lugar");
  });

  it("cintura e abdômen não entram como medida de resposta do abdômen", () => {
    const logs = logsDeBase();
    for (let i = 0; i < 5; i++) logs.push(log("abdomen", 3, i * 3 + 1, "ex-abdomen"));
    const history = [medicao(70, { waist_cm: 88 }), medicao(2, { waist_cm: 92 })];
    const res = computeMuscleResponse(
      volumeCom(logs),
      [prog("abdomen", 5, "ex-abdomen")],
      new Map(),
      history,
      8,
      AGORA
    );
    // Cintura crescendo 4 cm é ganho de gordura, não resposta de hipertrofia.
    expect(acha(res, "abdomen").medida).toBeNull();
  });

  it("séries indiretas aparecem em campo próprio, fora da comparação com a meta", () => {
    const logs = logsDeBase();
    const res = computeMuscleResponse(
      volumeCom(logs),
      [prog("peito", 5, "ex-peito")],
      new Map<MuscleGroupId, number>([["triceps", 6]]),
      [],
      JANELA,
      AGORA
    );
    const triceps = acha(res, "triceps");
    expect(triceps.indiretas).toBe(6);
    // O status de volume continua olhando só a série direta.
    expect(triceps.volume.setsPerWeek).toBe(0);
  });

  it("ordena pelo que pede ação primeiro", () => {
    const ordenado = [
      { veredito: "positiva", label: "A" },
      { veredito: "sem_base", label: "B" },
      { veredito: "estimulo_insuficiente", label: "C" },
      { veredito: "revisar", label: "D" },
    ]
      .map((x) => x as unknown as Parameters<typeof porPrioridade>[0])
      .sort(porPrioridade)
      .map((x) => x.label);
    expect(ordenado).toEqual(["C", "D", "A", "B"]);
  });
});

describe("sessão sem carga anotada", () => {
  // Sem histórico estabelecido em grupo NENHUM — é o estado real de quem tem
  // poucos registros de carga, e é quando a guarda de "grupo novo no modelo"
  // não silencia: aí "nenhuma série" chega à tela e contradiz Recuperação.
  const poucosLogs = [log("peito", 4, 2, "ex-peito")];

  it("não chama de estímulo insuficiente o grupo que Recuperação mostra treinado", () => {
    // O caso da auditoria: Peito com "pronto há 25 dias" numa tela e "nenhuma
    // série nas últimas 8 semanas" na outra. As duas frases eram verdadeiras
    // sobre fontes diferentes — sessão × série de carga.
    const treinado = new Date(AGORA.getTime() - 25 * 86_400_000).toISOString();
    const res = computeMuscleResponse(
      volumeCom(poucosLogs),
      [],
      new Map(),
      [],
      JANELA,
      AGORA,
      { ombros: treinado }
    );
    const ombros = acha(res, "ombros");
    expect(ombros.veredito).toBe("sem_base");
    expect(ombros.motivo).toContain("25 dias");
    expect(ombros.motivo).toContain("sem série de carga anotada");
  });

  it("sem sessão E sem série, aí sim é estímulo insuficiente", () => {
    const res = computeMuscleResponse(volumeCom(poucosLogs), [], new Map(), [], JANELA, AGORA, {});
    const ombros = acha(res, "ombros");
    expect(ombros.veredito).toBe("estimulo_insuficiente");
    expect(ombros.motivo).toContain("nem sessão");
  });
});
