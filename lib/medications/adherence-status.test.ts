import { describe, expect, it } from "vitest";
import { resolveAdherenceStatus, type AdherenceInput } from "./adherence-status";

const TZ = "America/Sao_Paulo";

/** 07/09/2026, hora local de São Paulo (UTC-3), como instante absoluto. */
function local(hora: number, minuto = 0): Date {
  return new Date(Date.UTC(2026, 8, 7, hora + 3, minuto));
}

function entrada(over: Partial<AdherenceInput> = {}): AdherenceInput {
  return {
    reminderTimes: ["08:00"],
    strictness: "rigido",
    graceMinutes: null,
    takenAt: local(8),
    timeZone: TZ,
    ...over,
  };
}

/**
 * A invariante que estrutura a fatia: nenhuma entrada produz recusa. O módulo
 * não tem caminho de erro — sempre devolve um rótulo.
 */
describe("o app nunca recusa registro", () => {
  const casos: AdherenceInput[] = [
    entrada(),
    entrada({ takenAt: local(14) }),
    entrada({ reminderTimes: null }),
    entrada({ reminderTimes: [] }),
    entrada({ strictness: "livre", reminderTimes: null }),
    entrada({ reminderTimes: ["lixo", "99:99"] }),
    entrada({ takenAt: local(3) }),
    entrada({ takenAt: local(23, 59) }),
  ];

  it.each(casos.map((c, i) => [i, c] as const))("caso %i devolve um status", (_i, c) => {
    const r = resolveAdherenceStatus(c);
    expect(["no_horario", "atrasado", "fora_janela", "avulso"]).toContain(r.status);
  });
});

describe("item rígido", () => {
  it("no horário exato é no_horario", () => {
    expect(resolveAdherenceStatus(entrada()).status).toBe("no_horario");
  });

  it("dentro da tolerância de 60 min é no_horario", () => {
    expect(resolveAdherenceStatus(entrada({ takenAt: local(8, 45) })).status).toBe("no_horario");
  });

  /** O caso do briefing: 6 h depois do horário, o insert SUCEDE e o rótulo é atrasado. */
  it("6 horas depois é atrasado, não recusa", () => {
    const r = resolveAdherenceStatus(entrada({ takenAt: local(14) }));
    expect(r.status).toBe("atrasado");
    expect(r.scheduledFor).not.toBeNull();
  });

  it("grace_minutes preenchido vence o padrão da rigidez", () => {
    const tarde = entrada({ takenAt: local(14) });
    expect(resolveAdherenceStatus(tarde).status).toBe("atrasado");
    expect(resolveAdherenceStatus({ ...tarde, graceMinutes: 420 }).status).toBe("no_horario");
  });
});

describe("item flexível", () => {
  it("tem janela mais larga que o rígido para o mesmo registro", () => {
    const tresHorasDepois = entrada({ takenAt: local(11) });
    expect(resolveAdherenceStatus(tresHorasDepois).status).toBe("atrasado");
    expect(resolveAdherenceStatus({ ...tresHorasDepois, strictness: "flexivel" }).status).toBe(
      "no_horario"
    );
  });
});

describe("item livre", () => {
  it("registro a qualquer hora é avulso", () => {
    for (const h of [0, 8, 15, 23]) {
      const r = resolveAdherenceStatus(
        entrada({ strictness: "livre", reminderTimes: null, takenAt: local(h) })
      );
      expect(r.status).toBe("avulso");
      expect(r.scheduledFor).toBeNull();
    }
  });

  it("livre com horário cadastrado é inconsistência visível, não avulso", () => {
    const r = resolveAdherenceStatus(entrada({ strictness: "livre", reminderTimes: ["08:00"] }));
    expect(r.status).toBe("fora_janela");
  });
});

describe("sem horário cadastrado", () => {
  it("é avulso", () => {
    expect(resolveAdherenceStatus(entrada({ reminderTimes: null })).status).toBe("avulso");
    expect(resolveAdherenceStatus(entrada({ reminderTimes: [] })).status).toBe("avulso");
  });

  it("horário malformado não vira horário", () => {
    expect(resolveAdherenceStatus(entrada({ reminderTimes: ["ontem"] })).status).toBe("avulso");
  });
});

describe("reuso da regra única de casamento", () => {
  /**
   * A janela de casamento é a de `adherence.ts`: de 1 h antes do horário até o
   * próximo horário. Registro antes disso não cumpre dose nenhuma.
   */
  it("registro muito antes do primeiro horário não casa com dose", () => {
    const r = resolveAdherenceStatus(entrada({ takenAt: local(3) }));
    expect(r.status).toBe("fora_janela");
    expect(r.scheduledFor).toBeNull();
  });

  it("com dois horários, casa com o do período", () => {
    const r = resolveAdherenceStatus(
      entrada({ reminderTimes: ["08:00", "20:00"], takenAt: local(20, 10) })
    );
    expect(r.status).toBe("no_horario");
    expect(r.scheduledFor?.toISOString()).toBe(local(20).toISOString());
  });
});
