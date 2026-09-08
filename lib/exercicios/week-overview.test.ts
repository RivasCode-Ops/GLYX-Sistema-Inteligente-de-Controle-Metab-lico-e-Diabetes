import { describe, expect, it } from "vitest";
import { resumirSemanaDeExercicio } from "./week-overview";
import type { ExerciseSession } from "@/types/database";

// Quarta-feira, 22/07/2026 às 10:00. A semana começa na segunda, 20/07.
const AGORA = new Date(2026, 6, 22, 10, 0, 0);

function sessao(
  dia: Date,
  duracao: number | null,
  kcal: number | null = null
): ExerciseSession {
  return {
    id: `s-${dia.toISOString()}-${duracao}`,
    user_id: "u1",
    label: "Treino",
    started_at: dia.toISOString(),
    duration_min: duracao,
    calories_burned: kcal,
    activity_type: null,
    intensity: null,
    muscle_groups: null,
    notes: null,
    created_at: dia.toISOString(),
  } as ExerciseSession;
}

const seg = new Date(2026, 6, 20, 7, 0);
const ter = new Date(2026, 6, 21, 7, 0);
const qua = new Date(2026, 6, 22, 7, 0);

describe("resumirSemanaDeExercicio", () => {
  it("marca os dias treinados e não conta dia repetido duas vezes", () => {
    const r = resumirSemanaDeExercicio(
      [sessao(seg, 40), sessao(seg, 20), sessao(qua, 45)],
      "maintain",
      AGORA
    );
    expect(r.dias.map((d) => d.sigla)).toEqual(["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]);
    expect(r.dias.filter((d) => d.treinou).map((d) => d.sigla)).toEqual(["Seg", "Qua"]);
    expect(r.diasTreinados).toBe(2);
  });

  it("separa dia vazio no passado de dia que ainda não chegou", () => {
    const r = resumirSemanaDeExercicio([sessao(seg, 40)], "maintain", AGORA);
    const porSigla = Object.fromEntries(r.dias.map((d) => [d.sigla, d]));
    expect(porSigla.Ter.futuro).toBe(false); // terça passou em branco
    expect(porSigla.Qui.futuro).toBe(true); // quinta ainda não chegou
    expect(porSigla.Qua.hoje).toBe(true);
    expect(porSigla.Qua.futuro).toBe(false); // hoje não é futuro
  });

  it("não inventa caloria: kcal é null quando nenhum registro traz o número", () => {
    const r = resumirSemanaDeExercicio([sessao(seg, 40), sessao(qua, 45)], "maintain", AGORA);
    expect(r.kcal).toBeNull();
    expect(r.kcalDeSessoes).toBe(0);
  });

  it("soma só as sessões que informaram caloria, e diz quantas foram", () => {
    const r = resumirSemanaDeExercicio(
      [sessao(seg, 40, 300), sessao(ter, 30), sessao(qua, 45, 380)],
      "maintain",
      AGORA
    );
    expect(r.kcal).toBe(680);
    expect(r.kcalDeSessoes).toBe(2);
  });

  it("não compara com semana anterior vazia — delta é null, não +100%", () => {
    const r = resumirSemanaDeExercicio([sessao(seg, 60)], "maintain", AGORA);
    expect(r.carga.deltaPct).toBeNull();
  });

  it("compara minutos com a semana anterior quando ela existe", () => {
    const segAnterior = new Date(2026, 6, 13, 7, 0);
    const quaAnterior = new Date(2026, 6, 15, 7, 0);
    const r = resumirSemanaDeExercicio(
      [sessao(seg, 60), sessao(segAnterior, 30), sessao(quaAnterior, 20)],
      "maintain",
      AGORA
    );
    // 60 contra 50 = +20%
    expect(r.carga.deltaPct).toBe(20);
  });

  it("classifica a carga contra a meta do usuário, não contra tabela fixa", () => {
    // 120 min: meta de "maintain" é 120 → 100% → alta.
    const manter = resumirSemanaDeExercicio([sessao(seg, 120)], "maintain", AGORA);
    expect(manter.carga.faixa).toBe("alta");
    // Os MESMOS 120 min com meta de "gain" (180) dão 67% → moderada.
    const ganhar = resumirSemanaDeExercicio([sessao(seg, 120)], "gain", AGORA);
    expect(ganhar.carga.faixa).toBe("moderada");
  });

  it("não conta a semana em curso como falha na sequência", () => {
    // Nenhuma sessão esta semana, mas as duas anteriores bateram a meta de 3.
    const anteriores: ExerciseSession[] = [];
    for (let k = 1; k <= 2; k++) {
      for (let d = 0; d < 3; d++) {
        const dia = new Date(2026, 6, 20 - 7 * k + d, 7, 0);
        anteriores.push(sessao(dia, 40));
      }
    }
    const r = resumirSemanaDeExercicio(anteriores, "maintain", AGORA);
    expect(r.progresso.sessions).toBe(0);
    expect(r.semanasSeguidasNaMeta).toBe(2);
  });

  it("a sequência para na primeira semana fechada que não bateu a meta", () => {
    const sess: ExerciseSession[] = [];
    // Semana -1: 3 sessões (bate). Semana -2: 1 sessão (não bate). Semana -3: 3.
    for (let d = 0; d < 3; d++) sess.push(sessao(new Date(2026, 6, 13 + d, 7, 0), 40));
    sess.push(sessao(new Date(2026, 6, 6, 7, 0), 40));
    for (let d = 0; d < 3; d++) sess.push(sessao(new Date(2026, 5, 29 + d, 7, 0), 40));
    const r = resumirSemanaDeExercicio(sess, "maintain", AGORA);
    expect(r.semanasSeguidasNaMeta).toBe(1);
  });

  it("minutos e % vêm da regra única, sem recontagem", () => {
    const r = resumirSemanaDeExercicio([sessao(seg, 40), sessao(qua, 20)], "maintain", AGORA);
    expect(r.progresso.minutes).toBe(60);
    expect(r.progresso.progressPct).toBe(50); // 60 de 120
  });
});
