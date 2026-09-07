import { describe, expect, it } from "vitest";
import { seedMechanisms } from "./__fixtures__/read-seed";
import { buildOverlapReport, type ScheduledDose } from "./overlap";

const MECHANISMS = seedMechanisms();

function dose(
  canonical: string,
  name: string,
  at: string,
  durationHours: number,
  source: ScheduledDose["source"] = "reminder"
): ScheduledDose {
  return { canonical, name, at, durationHours, source };
}

/** O caso de referência do briefing. */
const DIA = [
  dose("insulina_rapida", "Fiasp", "12:00", 5, "insulin_log"),
  dose("inibidor_sglt2", "Glyxambi", "12:30", 24),
  dose("inibidor_dpp4", "Glyxambi", "12:30", 24),
  dose("berberina", "Berberina", "15:00", 8),
  dose("insulina_basal", "Lantus", "22:00", 24, "insulin_log"),
];

describe("sobreposição de janelas", () => {
  const r = buildOverlapReport(DIA, MECHANISMS);

  it("o pico é 15:00–17:00 com 4 mecanismos", () => {
    expect(r.peak).not.toBeNull();
    expect(r.peak?.from).toBe("15:00");
    expect(r.peak?.to).toBe("17:00");
    expect(r.peak?.mechanismCount).toBe(4);
  });

  it("os quatro são vias distintas, não substâncias", () => {
    expect(r.peak?.mechanisms).toEqual([
      "glicosuria_renal",
      "incretina",
      "insulina_exogena_rapida",
      "sensibilizador_amp",
    ]);
  });

  it("nenhuma janela reportada tem menos de 3", () => {
    for (const w of r.windows) expect(w.mechanismCount).toBeGreaterThanOrEqual(3);
  });
});

describe("o que fica de fora do cálculo", () => {
  it("item sem horário aparece em unscheduled e não altera o pico", () => {
    const semHorario = dose("gymnema", "Gymnema", "", 8);
    const r = buildOverlapReport([...DIA, semHorario], MECHANISMS);
    expect(r.unscheduled).toContain("Gymnema");
    expect(r.peak?.mechanismCount).toBe(4);
    expect(r.peak?.from).toBe("15:00");
  });

  it("item sem duração aparece em unscheduled", () => {
    const r = buildOverlapReport([dose("berberina", "Berberina", "15:00", 0)], MECHANISMS);
    expect(r.unscheduled).toEqual(["Berberina"]);
    expect(r.peak).toBeNull();
  });

  it("horário malformado não é engolido em silêncio", () => {
    const r = buildOverlapReport([dose("berberina", "Berberina", "25:99", 8)], MECHANISMS);
    expect(r.unscheduled).toEqual(["Berberina"]);
  });

  it("substância sem mecanismo hipoglicemiante conhecido fica de fora", () => {
    const r = buildOverlapReport([dose("estatina", "Sinvastatina", "22:00", 24)], MECHANISMS);
    expect(r.unscheduled).toEqual(["Sinvastatina"]);
  });
});

describe("limiar de reporte", () => {
  it("janela com 2 mecanismos não é reportada", () => {
    const r = buildOverlapReport(
      [
        dose("insulina_rapida", "Fiasp", "12:00", 5, "insulin_log"),
        dose("berberina", "Berberina", "12:00", 8),
      ],
      MECHANISMS
    );
    expect(r.windows).toEqual([]);
    expect(r.peak).toBeNull();
  });

  it("duas substâncias da mesma via não somam", () => {
    const r = buildOverlapReport(
      [
        dose("insulina_rapida", "Fiasp", "12:00", 5, "insulin_log"),
        dose("insulina_basal", "Lantus", "12:00", 24, "insulin_log"),
        dose("berberina", "Berberina", "12:00", 8),
        dose("gymnema", "Gymnema", "12:00", 8),
        dose("canela_cassia", "Canela", "12:00", 8),
      ],
      MECHANISMS
    );
    // basal + rápida + sensibilizador = 3. Berberina, gymnema e canela são a
    // mesma via e contam uma vez.
    expect(r.peak?.mechanismCount).toBe(3);
  });
});

describe("empate de pico", () => {
  it("resolve pelo mais cedo", () => {
    const r = buildOverlapReport(
      [
        dose("insulina_basal", "Lantus", "06:00", 24, "insulin_log"),
        dose("inibidor_sglt2", "Jardiance", "06:00", 24),
        dose("metformina", "Glifage", "06:00", 12),
        dose("inibidor_dpp4", "Januvia", "06:00", 24),
      ],
      MECHANISMS
    );
    expect(r.peak?.from).toBe("06:00");
  });
});

/**
 * Limitação declarada: a dose de ontem que ainda age não é projetada no dia de
 * hoje. A contagem é um piso — nunca superestima, pode subestimar. O teste
 * existe para a limitação ficar visível em vez de virar surpresa.
 */
describe("recorte no dia", () => {
  it("dose de ação longa é cortada na meia-noite, não projetada para o dia seguinte", () => {
    const r = buildOverlapReport(
      [
        dose("insulina_basal", "Lantus", "22:00", 24, "insulin_log"),
        dose("inibidor_sglt2", "Jardiance", "22:00", 24),
        dose("inibidor_dpp4", "Januvia", "22:00", 24),
      ],
      MECHANISMS
    );
    expect(r.peak?.from).toBe("22:00");
    expect(r.peak?.to).toBe("24:00");
  });
});
