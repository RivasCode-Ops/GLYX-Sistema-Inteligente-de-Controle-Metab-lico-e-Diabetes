import { describe, expect, it } from "vitest";
import { countOwnRegistrations, mergeLastTrained, type MuscleEvent } from "./muscle-history";

const DIA = 86_400_000;
const AGORA = new Date("2026-08-14T12:00:00.000Z");

function em(diasAtras: number): string {
  return new Date(AGORA.getTime() - diasAtras * DIA).toISOString();
}

function evento(groups: string[], diasAtras: number): MuscleEvent {
  return { groups, at: em(diasAtras) };
}

describe("mergeLastTrained", () => {
  it("usa o registro de carga quando ele é mais recente que a sessão", () => {
    const sessoes = [evento(["peito"], 5)];
    const cargas = [evento(["peito"], 1)];

    expect(mergeLastTrained(sessoes, cargas).peito).toBe(em(1));
  });

  it("mantém a sessão quando ela é a mais recente", () => {
    const sessoes = [evento(["peito"], 1)];
    const cargas = [evento(["peito"], 5)];

    expect(mergeLastTrained(sessoes, cargas).peito).toBe(em(1));
  });

  it("compara por instante, não pela ordem em que as fontes chegam", () => {
    // Cada fonte vem ordenada por conta própria; concatenar não produz ordem
    // única, então o mais antigo pode aparecer primeiro.
    const cargas = [evento(["costas"], 10), evento(["costas"], 2)];

    expect(mergeLastTrained([], cargas).costas).toBe(em(2));
  });

  it("expande o legado 'pernas' em quadríceps e posterior", () => {
    const resultado = mergeLastTrained([evento(["pernas"], 3)]);

    expect(resultado.quadriceps).toBe(em(3));
    expect(resultado.posterior).toBe(em(3));
  });

  it("registra grupo que só aparece na carga", () => {
    const resultado = mergeLastTrained([evento(["peito"], 2)], [evento(["trapezio"], 1)]);

    expect(resultado.trapezio).toBe(em(1));
    expect(resultado.peito).toBe(em(2));
  });

  it("devolve mapa vazio sem eventos", () => {
    expect(mergeLastTrained([], [])).toEqual({});
  });
});

describe("countOwnRegistrations", () => {
  it("conta sessão por linha", () => {
    const sessoes = [evento(["peito"], 1), evento(["peito"], 3), evento(["peito"], 6)];

    expect(countOwnRegistrations(sessoes, []).peito).toBe(3);
  });

  it("conta carga por dia distinto, não por série", () => {
    // Quatro séries de supino no mesmo dia são um treino, não quatro ocasiões:
    // contar por linha desarmaria a guarda de histórico no primeiro dia.
    const cargas = [
      evento(["peito"], 1),
      evento(["peito"], 1),
      evento(["peito"], 1),
      evento(["peito"], 1),
    ];

    expect(countOwnRegistrations([], cargas).peito).toBe(1);
  });

  it("soma dias distintos de carga", () => {
    const cargas = [evento(["peito"], 1), evento(["peito"], 1), evento(["peito"], 4)];

    expect(countOwnRegistrations([], cargas).peito).toBe(2);
  });

  it("soma as duas fontes", () => {
    const sessoes = [evento(["costas"], 8)];
    const cargas = [evento(["costas"], 2), evento(["costas"], 2), evento(["costas"], 5)];

    expect(countOwnRegistrations(sessoes, cargas).costas).toBe(3);
  });

  it("não conta grupo que nunca apareceu", () => {
    const resultado = countOwnRegistrations([evento(["peito"], 1)], []);

    expect(resultado.gluteos).toBeUndefined();
  });

  it("expande o legado 'pernas' nas duas fontes", () => {
    const resultado = countOwnRegistrations([evento(["pernas"], 2)], [evento(["pernas"], 1)]);

    expect(resultado.quadriceps).toBe(2);
    expect(resultado.posterior).toBe(2);
  });
});
