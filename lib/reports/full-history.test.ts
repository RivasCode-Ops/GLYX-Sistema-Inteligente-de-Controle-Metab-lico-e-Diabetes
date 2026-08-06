import { describe, expect, it } from "vitest";
import {
  aggregateGlucoseByDay,
  aggregateWaterByDay,
  daysBetweenInclusive,
  earliestDay,
  extractGlucoseEvents,
  groupMedicationLogsByDay,
  isRealGlucoseSource,
  summarizeGlucose,
} from "./full-history";

const TZ = "America/Sao_Paulo";

function reading(recordedAt: string, value: number) {
  return { recorded_at: recordedAt, value_mg_dl: value };
}

describe("aggregateGlucoseByDay", () => {
  it("agrupa pelo dia local, não pelo dia UTC", () => {
    // 02:00Z do dia 15 é 23:00 do dia 14 em São Paulo (UTC-3).
    const days = aggregateGlucoseByDay(
      [reading("2026-07-15T02:00:00Z", 120), reading("2026-07-15T13:00:00Z", 140)],
      TZ,
      70,
      180
    );
    expect(days.map((d) => d.day)).toEqual(["2026-07-14", "2026-07-15"]);
  });

  it("conta abaixo, acima e severa pela faixa-alvo do perfil", () => {
    const [day] = aggregateGlucoseByDay(
      [
        reading("2026-07-15T12:00:00Z", 60),
        reading("2026-07-15T13:00:00Z", 100),
        reading("2026-07-15T14:00:00Z", 200),
        reading("2026-07-15T15:00:00Z", 260),
      ],
      TZ,
      70,
      180
    );
    expect(day.count).toBe(4);
    expect(day.below).toBe(1);
    expect(day.above).toBe(2); // 200 e 260 estão acima da meta
    expect(day.severe).toBe(1); // só 260 passa de 250
    expect(day.min).toBe(60);
    expect(day.max).toBe(260);
    expect(day.avg).toBe(155);
    expect(day.tirPercent).toBe(25);
  });

  it("ignora leitura sem valor numérico em vez de produzir NaN", () => {
    const days = aggregateGlucoseByDay(
      [
        reading("2026-07-15T12:00:00Z", Number.NaN),
        reading("2026-07-15T13:00:00Z", 100),
      ],
      TZ,
      70,
      180
    );
    expect(days).toHaveLength(1);
    expect(days[0].count).toBe(1);
    expect(days[0].avg).toBe(100);
  });
});

describe("summarizeGlucose", () => {
  it("pondera a média pela contagem do dia, não pela média das médias", () => {
    const days = aggregateGlucoseByDay(
      [
        // Dia cheio, média 100.
        ...Array.from({ length: 9 }, (_, i) =>
          reading(`2026-07-15T1${i}:00:00Z`, 100)
        ),
        // Dia com uma leitura só, bem alta.
        reading("2026-07-16T12:00:00Z", 200),
      ],
      TZ,
      70,
      180
    );
    const overall = summarizeGlucose(days);
    expect(overall?.count).toBe(10);
    expect(overall?.daysWithData).toBe(2);
    // Média de médias daria 150; ponderada dá 110.
    expect(overall?.avg).toBe(110);
  });

  it("devolve null quando não há dia nenhum", () => {
    expect(summarizeGlucose([])).toBeNull();
  });
});

describe("extractGlucoseEvents", () => {
  it("lista só hipo e hiper severa, em ordem cronológica", () => {
    const events = extractGlucoseEvents(
      [
        reading("2026-07-15T14:00:00Z", 300),
        reading("2026-07-15T12:00:00Z", 65),
        reading("2026-07-15T13:00:00Z", 150),
        reading("2026-07-15T15:00:00Z", 200),
      ],
      70
    );
    expect(events).toEqual([
      { recordedAt: "2026-07-15T12:00:00Z", value: 65, kind: "hipo" },
      { recordedAt: "2026-07-15T14:00:00Z", value: 300, kind: "hiper" },
    ]);
  });
});

describe("isRealGlucoseSource", () => {
  it("aceita sensor e digitação, rejeita semente de demonstração", () => {
    expect(isRealGlucoseSource("libre")).toBe(true);
    expect(isRealGlucoseSource("dexcom")).toBe(true);
    expect(isRealGlucoseSource("manual")).toBe(true);
    expect(isRealGlucoseSource("mock")).toBe(false);
    expect(isRealGlucoseSource(null)).toBe(false);
  });
});

describe("aggregateWaterByDay", () => {
  it("separa o que hidrata do que só foi registrado", () => {
    const [day] = aggregateWaterByDay(
      [
        { logged_at: "2026-07-15T12:00:00Z", amount_ml: 250, kind: "agua" },
        { logged_at: "2026-07-15T13:00:00Z", amount_ml: 250, kind: "agua" },
        { logged_at: "2026-07-15T14:00:00Z", amount_ml: 100, kind: "cafe" },
      ],
      TZ
    );
    expect(day.totalMl).toBe(600);
    expect(day.hydratingMl).toBe(500); // café não conta para a meta
    expect(day.kinds).toEqual([
      { kind: "agua", label: "Água", ml: 500, count: 2 },
      { kind: "cafe", label: "Café", ml: 100, count: 1 },
    ]);
  });

  it("trata kind nulo como 'outra' sem quebrar", () => {
    const [day] = aggregateWaterByDay(
      [{ logged_at: "2026-07-15T12:00:00Z", amount_ml: 200, kind: null }],
      TZ
    );
    expect(day.kinds[0].kind).toBe("outra");
    expect(day.hydratingMl).toBe(0);
  });
});

describe("groupMedicationLogsByDay", () => {
  it("resolve o nome do medicamento e ordena por horário", () => {
    const names = new Map([["m1", "Metformina"]]);
    const days = groupMedicationLogsByDay(
      [
        { medication_id: "m1", taken_at: "2026-07-15T20:00:00Z" },
        { medication_id: "m1", taken_at: "2026-07-15T13:00:00Z" },
      ],
      names,
      TZ
    );
    expect(days).toHaveLength(1);
    expect(days[0].entries.map((e) => e.takenAt)).toEqual([
      "2026-07-15T13:00:00Z",
      "2026-07-15T20:00:00Z",
    ]);
    expect(days[0].entries[0].name).toBe("Metformina");
  });

  it("mantém a dose no relatório quando o medicamento foi excluído do cadastro", () => {
    const days = groupMedicationLogsByDay(
      [{ medication_id: "sumiu", taken_at: "2026-07-15T13:00:00Z" }],
      new Map(),
      TZ
    );
    expect(days[0].entries[0].name).toBe("(medicamento removido)");
  });
});

describe("earliestDay", () => {
  it("ignora vazios e devolve a menor data", () => {
    expect(earliestDay([null, "2026-07-20", undefined, "2026-07-11", "2026-08-01"])).toBe(
      "2026-07-11"
    );
  });

  it("devolve null quando não há data nenhuma", () => {
    expect(earliestDay([null, undefined])).toBeNull();
  });
});

describe("daysBetweenInclusive", () => {
  it("conta as duas pontas", () => {
    expect(daysBetweenInclusive("2026-07-11", "2026-07-11")).toBe(1);
    expect(daysBetweenInclusive("2026-07-11", "2026-08-06")).toBe(27);
  });

  it("atravessa virada de mês e de ano", () => {
    expect(daysBetweenInclusive("2026-12-31", "2027-01-01")).toBe(2);
  });
});
