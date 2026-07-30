import { describe, expect, it } from "vitest";
import { MIN_LOGS_FOR_ESTABLISHED_HISTORY, MUSCLE_GROUP_IDS } from "@/lib/data/muscle-groups";
import { computeMuscleRecovery, suggestMuscleFocus } from "@/lib/exercicios/muscle-recovery";
import { hasEstablishedHistory, shouldSuppressVolumeDiagnosis } from "@/lib/exercicios/weekly-volume";

/**
 * A guarda de "grupo novo no modelo" tem duas pontas, e errar qualquer uma delas
 * é pior que não ter guarda nenhuma:
 *
 *  - Calar de menos: trapézio e glúteos entraram sem histórico e o app anuncia
 *    "nunca estimulado, prioridade máxima" para músculos que já são treinados,
 *    só que registrados sob outro grupo.
 *  - Calar demais: quem nunca registrou nada perde justamente o aviso que o
 *    produto existe para dar.
 *
 * A diferença entre os dois casos não está no grupo, está no conjunto — por isso
 * a decisão depende de existir histórico em algum outro lugar.
 */
describe("guarda de histórico estabelecido", () => {
  const NOW = new Date("2026-08-05T12:00:00.000Z");

  it("não silencia volume quando ninguém tem histórico — aí zero é a verdade", () => {
    const todos = MUSCLE_GROUP_IDS.map(() => ({ logCount: 0 }));
    expect(shouldSuppressVolumeDiagnosis({ logCount: 0 }, todos)).toBe(false);
  });

  it("silencia o grupo sem histórico quando outros já têm", () => {
    const todos = [{ logCount: 0 }, { logCount: MIN_LOGS_FOR_ESTABLISHED_HISTORY }];
    expect(shouldSuppressVolumeDiagnosis({ logCount: 0 }, todos)).toBe(true);
  });

  it("volta a falar assim que o grupo atinge o mínimo", () => {
    const todos = [
      { logCount: MIN_LOGS_FOR_ESTABLISHED_HISTORY },
      { logCount: MIN_LOGS_FOR_ESTABLISHED_HISTORY },
    ];
    expect(hasEstablishedHistory({ logCount: MIN_LOGS_FOR_ESTABLISHED_HISTORY })).toBe(true);
    expect(
      shouldSuppressVolumeDiagnosis({ logCount: MIN_LOGS_FOR_ESTABLISHED_HISTORY }, todos)
    ).toBe(false);
  });

  it("não manda treinar trapézio na frente de tudo só por ele ser novo", () => {
    const treinadoHaMuito = new Date(NOW.getTime() - 300 * 3_600_000).toISOString();
    // Tudo treinado e com histórico próprio, menos trapézio e glúteos — que é
    // exatamente o estado do banco no dia seguinte à ponte.
    const lastTrained = Object.fromEntries(
      MUSCLE_GROUP_IDS.filter((id) => id !== "trapezio" && id !== "gluteos").map((id) => [
        id,
        treinadoHaMuito,
      ])
    );
    const logCounts = Object.fromEntries(
      MUSCLE_GROUP_IDS.filter((id) => id !== "trapezio" && id !== "gluteos").map((id) => [
        id,
        MIN_LOGS_FOR_ESTABLISHED_HISTORY,
      ])
    );

    const statuses = computeMuscleRecovery(lastTrained, {}, NOW, logCounts);
    const trapezio = statuses.find((s) => s.id === "trapezio")!;

    expect(trapezio.status).toBe("never");
    expect(trapezio.establishedHistory).toBe(false);
    expect(trapezio.prioritizeAsNever).toBe(false);
    expect(suggestMuscleFocus(statuses)?.id).not.toBe("trapezio");
  });

  it("usuário novo continua recebendo sugestão — sem histórico, 'nunca' vale", () => {
    const statuses = computeMuscleRecovery({}, {}, NOW, {});
    expect(statuses.every((s) => s.prioritizeAsNever)).toBe(true);
    expect(suggestMuscleFocus(statuses)).not.toBeNull();
  });
});
