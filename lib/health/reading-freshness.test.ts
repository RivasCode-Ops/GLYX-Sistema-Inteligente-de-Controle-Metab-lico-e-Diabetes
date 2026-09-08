import { describe, expect, it } from "vitest";
import { describeAge, glucoseTrend, readingAge } from "./reading-freshness";

const AGORA = new Date("2026-09-03T20:00:00Z");
function minutosAtras(m: number) {
  return new Date(AGORA.getTime() - m * 60000).toISOString();
}

describe("readingAge", () => {
  it("trata como atual só o que chegou nos últimos 20 min", () => {
    expect(readingAge(minutosAtras(4), AGORA).freshness).toBe("fresh");
    expect(readingAge(minutosAtras(20), AGORA).freshness).toBe("fresh");
    expect(readingAge(minutosAtras(21), AGORA).freshness).toBe("recent");
  });

  it("classifica como velha a leitura que não descreve mais o presente", () => {
    expect(readingAge(minutosAtras(6 * 60), AGORA).freshness).toBe("recent");
    expect(readingAge(minutosAtras(6 * 60 + 1), AGORA).freshness).toBe("stale");
  });

  it("o caso real que originou isto: três semanas paradas", () => {
    // Última leitura do Libre em 13/08/2026 20:19, com o painel escrevendo
    // "Glicemia atual" em 03/09.
    //
    // Diz "há 20 dias" e não 21 de propósito: aqui se mede tempo decorrido
    // (20 d 23 h 40 min), enquanto o `now()::date - recorded_at::date` do
    // Postgres conta a virada do calendário e devolve 21. Os dois estão certos
    // sobre coisas diferentes, e a tela fala de tempo decorrido.
    const idade = readingAge("2026-08-13T20:19:54Z", AGORA);
    expect(idade.freshness).toBe("stale");
    expect(idade.label).toBe("há 20 dias");
  });

  it("não devolve idade negativa se o registro vier do futuro", () => {
    // Relógio do celular adiantado grava leitura à frente do servidor.
    const idade = readingAge(new Date(AGORA.getTime() + 60 * 60000), AGORA);
    expect(idade.minutes).toBe(0);
    expect(idade.freshness).toBe("fresh");
  });
});

describe("describeAge", () => {
  it("fala em minuto, hora e dia conforme a distância", () => {
    expect(describeAge(0)).toBe("agora");
    expect(describeAge(12)).toBe("há 12 min");
    expect(describeAge(180)).toBe("há 3 h");
    expect(describeAge(60 * 24)).toBe("há 1 dia");
    expect(describeAge(60 * 24 * 21)).toBe("há 21 dias");
  });
});

describe("glucoseTrend", () => {
  it("recusa afirmar direção com uma leitura só", () => {
    expect(glucoseTrend([{ value: 116, recordedAt: minutosAtras(3) }])).toBeNull();
  });

  it("recusa afirmar direção quando as leituras estão longe no tempo", () => {
    // Duas leituras separadas por dias não descrevem uma subida.
    expect(
      glucoseTrend([
        { value: 90, recordedAt: minutosAtras(60 * 24 * 3) },
        { value: 180, recordedAt: minutosAtras(3) },
      ])
    ).toBeNull();
  });

  it("chama de queda o que o card antigo chamava de estável", () => {
    // 200 -> 130 em 10 min: o card antigo olhava só o 130 (entre 100 e 140) e
    // escrevia "estável" — o pior erro possível, porque é exatamente a hipo em
    // formação.
    expect(
      glucoseTrend([
        { value: 200, recordedAt: minutosAtras(13) },
        { value: 130, recordedAt: minutosAtras(3) },
      ])
    ).toBe("down");
  });

  it("só chama de estável variação pequena entre leituras próximas", () => {
    expect(
      glucoseTrend([
        { value: 116, recordedAt: minutosAtras(8) },
        { value: 120, recordedAt: minutosAtras(3) },
      ])
    ).toBe("flat");
  });

  it("reconhece subida", () => {
    expect(
      glucoseTrend([
        { value: 120, recordedAt: minutosAtras(8) },
        { value: 165, recordedAt: minutosAtras(3) },
      ])
    ).toBe("up");
  });
});
