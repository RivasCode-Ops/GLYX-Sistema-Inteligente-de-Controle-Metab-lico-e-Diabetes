import { describe, expect, it } from "vitest";
import { computeGlucoseMetrics, findHourPattern, type GlucosePoint } from "./glucose-metrics";

const FAIXA = { targetMin: 70, targetMax: 180 };

/** Série a cada 5 min a partir de um instante, como o sensor entrega. */
function serie(inicioISO: string, valores: number[], passoMin = 5): GlucosePoint[] {
  const t0 = new Date(inicioISO).getTime();
  return valores.map((v, i) => ({
    value_mg_dl: v,
    recorded_at: new Date(t0 + i * passoMin * 60_000).toISOString(),
  }));
}

describe("métricas do consenso", () => {
  it("calcula GMI, CV e os tempos em faixa", () => {
    const pontos = serie("2026-07-01T12:00:00Z", [100, 120, 140, 160, 110, 130]);
    const m = computeGlucoseMetrics(pontos, FAIXA);
    expect(m.readings).toBe(6);
    expect(m.mean).toBe(127);
    // GMI = 3,31 + 0,02392 × média (Bergenstal 2018).
    expect(m.gmiPercent).toBeCloseTo(3.31 + 0.02392 * (760 / 6), 1);
    expect(m.tirPercent).toBe(100);
    expect(m.tbrPercent).toBe(0);
    expect(m.tarPercent).toBe(0);
    expect(m.cvPercent).toBeGreaterThan(0);
  });

  it("uma leitura só não produz coeficiente de variação", () => {
    const m = computeGlucoseMetrics(serie("2026-07-01T12:00:00Z", [120]), FAIXA);
    // Dispersão de um ponto não existe — null, não zero.
    expect(m.cvPercent).toBeNull();
    expect(m.mean).toBe(120);
  });

  it("série vazia devolve tudo nulo, sem dividir por zero", () => {
    const m = computeGlucoseMetrics([], FAIXA);
    expect(m.mean).toBeNull();
    expect(m.gmiPercent).toBeNull();
    expect(m.episodes).toEqual([]);
    expect(m.coverage.percent).toBeNull();
  });
});

describe("episódio, não leitura", () => {
  it("27 leituras seguidas acima da meta são UM episódio", () => {
    // O caso real: 17/07, das 10:08 às 12:50, contado pelo app como 27
    // ocorrências — número que descreve a frequência do sensor, não a do
    // usuário.
    const pontos = serie("2026-07-17T13:08:00Z", Array(27).fill(260));
    const m = computeGlucoseMetrics(pontos, FAIXA);
    expect(m.hiperEpisodes).toBe(1);
    expect(m.episodes[0].readings).toBe(27);
    expect(m.episodes[0].peak).toBe(260);
    expect(m.episodes[0].minutes).toBe(130);
  });

  it("pico de menos de 15 minutos não vira episódio", () => {
    // Duas leituras (5 min) fora da faixa, cercadas por leituras normais.
    const pontos = serie("2026-07-01T12:00:00Z", [120, 120, 200, 200, 120, 120, 120, 120]);
    const m = computeGlucoseMetrics(pontos, FAIXA);
    expect(m.hiperEpisodes).toBe(0);
    // E ainda assim as leituras entram no percentual de tempo acima.
    expect(m.tarPercent).toBeGreaterThan(0);
  });

  it("descida breve para dentro da faixa não parte um episódio em dois", () => {
    // 30 min alto, uma leitura dentro (5 min), 30 min alto de novo. Voltar por
    // menos de 15 min não encerra: seria contar um evento como dois.
    const pontos = serie("2026-07-01T12:00:00Z", [
      200, 200, 200, 200, 200, 200, 170, 200, 200, 200, 200, 200, 200,
    ]);
    const m = computeGlucoseMetrics(pontos, FAIXA);
    expect(m.hiperEpisodes).toBe(1);
  });

  it("silêncio longo do sensor não emenda dois episódios", () => {
    const antes = serie("2026-07-01T12:00:00Z", Array(6).fill(220));
    // Retoma quatro horas depois: o que houve no meio não foi medido.
    const depois = serie("2026-07-01T16:00:00Z", Array(6).fill(220));
    const m = computeGlucoseMetrics([...antes, ...depois], FAIXA);
    expect(m.hiperEpisodes).toBe(2);
  });

  it("hipo e hiper são contadas separadamente, com o pior valor de cada", () => {
    const pontos = [
      ...serie("2026-07-01T02:00:00Z", [65, 62, 60, 58, 61]),
      ...serie("2026-07-01T12:00:00Z", [190, 210, 250, 200]),
    ];
    const m = computeGlucoseMetrics(pontos, FAIXA);
    expect(m.hipoEpisodes).toBe(1);
    expect(m.hiperEpisodes).toBe(1);
    expect(m.episodes.find((e) => e.kind === "hipo")!.peak).toBe(58);
    expect(m.episodes.find((e) => e.kind === "hiper")!.peak).toBe(250);
  });
});

describe("cobertura do sensor", () => {
  it("conta os dias com dado e acha as lacunas", () => {
    const pontos = [
      ...serie("2026-07-01T12:00:00Z", [120, 120]),
      ...serie("2026-07-02T12:00:00Z", [120, 120]),
      // Buraco de 3 dias.
      ...serie("2026-07-06T12:00:00Z", [120, 120]),
    ];
    const m = computeGlucoseMetrics(pontos, FAIXA);
    expect(m.coverage.daysWithData).toBe(3);
    expect(m.coverage.daysInPeriod).toBe(6);
    expect(m.coverage.percent).toBe(50);
    expect(m.coverage.gaps).toHaveLength(1);
    expect(m.coverage.gaps[0]).toMatchObject({ fromDay: "2026-07-02", days: 3 });
  });
});

describe("padrão por hora", () => {
  it("acha a concentração na madrugada — o caso real", () => {
    // As 14 hipoglicemias do usuário: 10 entre 3h e 7h.
    const byHour = Array(24).fill(0);
    byHour[3] = 1;
    byHour[4] = 2;
    byHour[5] = 3;
    byHour[6] = 1;
    byHour[7] = 3;
    byHour[11] = 2;
    byHour[12] = 1;
    byHour[19] = 1;

    const p = findHourPattern(byHour)!;
    expect(p.count).toBe(10);
    expect(p.total).toBe(14);
    expect(p.percent).toBeCloseTo(71.4, 0);
    expect(p.fromHour).toBe(3);
    expect(p.toHour).toBe(7);
  });

  it("não afirma padrão com poucos episódios", () => {
    const byHour = Array(24).fill(0);
    byHour[3] = 2;
    byHour[4] = 2;
    // Quatro episódios não sustentam uma afirmação sobre horário.
    expect(findHourPattern(byHour)).toBeNull();
  });

  it("não afirma padrão quando os episódios estão espalhados", () => {
    const byHour = Array(24).fill(0);
    for (let h = 0; h < 24; h += 2) byHour[h] = 1;
    expect(findHourPattern(byHour)).toBeNull();
  });

  it("enxerga faixa que cruza a meia-noite", () => {
    const byHour = Array(24).fill(0);
    byHour[23] = 3;
    byHour[0] = 3;
    byHour[1] = 3;
    byHour[14] = 1;
    const p = findHourPattern(byHour)!;
    expect(p.fromHour).toBe(23);
    expect(p.toHour).toBe(1);
    expect(p.count).toBe(9);
  });
});
