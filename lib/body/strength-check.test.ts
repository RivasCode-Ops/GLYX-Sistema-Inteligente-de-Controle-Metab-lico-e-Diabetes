import { describe, expect, it } from "vitest";
import { checarForca } from "./strength-check";
import type { ProgressVerdict } from "@/lib/body/progress";
import type { ExerciseProgression } from "@/lib/exercicios/weekly-volume";

function veredito(id: ProgressVerdict["id"]): ProgressVerdict {
  return { id, headline: "h", detail: "d", tone: "neutro" };
}

/** `n` exercícios, dos quais `progredindo` com carga em alta. */
function progressoes(n: number, progredindo: number): ExerciseProgression[] {
  return Array.from({ length: n }, (_, i) => ({
    exercise: `ex-${i}`,
    muscleGroup: "peito",
    firstOneRm: 80,
    lastOneRm: i < progredindo ? 88 : 80,
    deltaPercent: i < progredindo ? 10 : 0,
    sessions: 4,
    progressing: i < progredindo,
  }));
}

describe("checarForca", () => {
  it("sem veredito não há o que corroborar", () => {
    expect(checarForca(null, progressoes(4, 4))).toBeNull();
  });

  it("sem carga registrada diz isso, em vez de tratar como ausência de progresso", () => {
    const r = checarForca(veredito("ganho_magro"), [])!;
    expect(r.estado).toBe("sem_base");
    expect(r.taxa).toBeNull();
    expect(r.texto).toContain("Sem carga registrada");
  });

  it("ganho de massa com a força acompanhando confirma", () => {
    const r = checarForca(veredito("ganho_magro"), progressoes(4, 3))!;
    expect(r.estado).toBe("confirma");
    expect(r.texto).toContain("3 de 4");
  });

  it("ganho de peso sem melhora de carga contradiz — o caso do briefing", () => {
    // Peso ↑, cintura estável (a composição diz "ganho de massa"), força ↔.
    const r = checarForca(veredito("ganho_magro"), progressoes(8, 1))!;
    expect(r.estado).toBe("contradiz");
    expect(r.texto).toContain("não veio acompanhado de performance");
  });

  it("em perda de peso, carga estável NÃO é lida como fracasso", () => {
    const r = checarForca(veredito("perda_de_gordura"), progressoes(6, 0))!;
    // Exigir progressão em déficit reprovaria justamente quem faz certo.
    expect(r.estado).not.toBe("contradiz");
    expect(r.texto).toContain("esperado");
  });

  it("em perda de peso, força subindo é sinal de massa magra preservada", () => {
    const r = checarForca(veredito("perda_de_gordura"), progressoes(4, 2))!;
    expect(r.estado).toBe("confirma");
    expect(r.texto).toContain("preservada");
  });

  it("ganho com cintura: força subindo salva parte do diagnóstico", () => {
    const r = checarForca(veredito("ganho_com_gordura"), progressoes(4, 3))!;
    expect(r.estado).toBe("contradiz");
    expect(r.texto).toContain("parte do ganho é músculo");
  });

  it("ganho com cintura e carga parada reforça o alerta", () => {
    const r = checarForca(veredito("ganho_com_gordura"), progressoes(4, 0))!;
    expect(r.estado).toBe("confirma");
    expect(r.texto).toContain("reforça");
  });

  it("perda com massa magra e carga em alta sinaliza medição inconsistente", () => {
    const r = checarForca(veredito("perda_com_massa_magra"), progressoes(4, 4))!;
    expect(r.estado).toBe("contradiz");
    expect(r.texto).toContain("mesmo jeito");
  });

  it("nunca devolve percentual sem base numérica", () => {
    for (const id of [
      "ganho_magro",
      "recomposicao",
      "perda_de_gordura",
      "perda_com_massa_magra",
      "ganho_com_gordura",
      "estavel",
    ] as ProgressVerdict["id"][]) {
      const r = checarForca(veredito(id), [])!;
      expect(r.taxa).toBeNull();
      // Com taxa nula, o texto não pode conter número de exercício nenhum.
      expect(r.texto).not.toMatch(/\d+ de \d+/);
    }
  });
});
