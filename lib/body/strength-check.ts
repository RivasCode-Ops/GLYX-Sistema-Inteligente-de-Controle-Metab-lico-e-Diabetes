import type { ProgressVerdict } from "@/lib/body/progress";
import { progressionRate, type ExerciseProgression } from "@/lib/exercicios/weekly-volume";

/**
 * A força confirma ou contradiz o que a balança e a fita disseram?
 *
 * `classify` em `progress.ts` decide o veredito a partir de peso, cintura,
 * medidas e composição estimada. É uma regra densa e coberta por testes, e ela
 * NÃO muda aqui: a performance entra como camada separada, do mesmo jeito que a
 * fita entra em `muscle-response.ts` — confirmando ou contradizendo, nunca
 * decidindo sozinha.
 *
 * A razão de ser separada é concreta. Peso subindo com cintura estável é
 * "ganho predominante de massa" pela composição, e continua sendo: o corpo
 * mudou. Mas se nenhuma carga subiu no período, o ganho não está acompanhado de
 * melhora de performance — e isso é informação que a balança não tem como dar.
 * Fundir as duas coisas num veredito só faria a performance derrubar uma
 * leitura corporal correta, ou a leitura corporal esconder uma performance
 * parada.
 */

export type CorroboracaoDeForca = {
  estado: "confirma" | "contradiz" | "sem_base";
  /** Fração de exercícios com progressão de carga na janela (0-1). */
  taxa: number | null;
  exercicios: number;
  texto: string;
};

/** Vereditos que afirmam GANHO — os únicos em que "a força acompanhou?" é a
 *  pergunta certa. Em perda de peso, carga estável é resultado bom, não ruim. */
const VEREDITOS_DE_GANHO: ProgressVerdict["id"][] = ["ganho_magro", "recomposicao"];

/** Metade dos exercícios progredindo é o piso para dizer que a força acompanhou:
 *  ninguém progride em tudo ao mesmo tempo, e exigir isso reprovaria um período
 *  bom. Abaixo de um quarto, a leitura oposta se sustenta. */
const PISO_CONFIRMA = 0.5;
const TETO_CONTRADIZ = 0.25;

export function checarForca(
  verdict: ProgressVerdict | null,
  progressions: ExerciseProgression[]
): CorroboracaoDeForca | null {
  if (!verdict) return null;

  const taxa = progressionRate(progressions);
  const exercicios = progressions.length;

  if (taxa == null) {
    return {
      estado: "sem_base",
      taxa: null,
      exercicios: 0,
      texto:
        "Sem carga registrada no período para dizer se a força acompanhou. Anote peso e repetições para o app cruzar as duas coisas.",
    };
  }

  const pct = Math.round(taxa * 100);
  const progredindo = Math.round(taxa * exercicios);

  if (VEREDITOS_DE_GANHO.includes(verdict.id)) {
    if (taxa >= PISO_CONFIRMA) {
      return {
        estado: "confirma",
        taxa,
        exercicios,
        texto: `A força acompanhou: ${progredindo} de ${exercicios} exercícios com carga em alta (${pct}%).`,
      };
    }
    if (taxa <= TETO_CONTRADIZ) {
      return {
        estado: "contradiz",
        taxa,
        exercicios,
        texto: `O ganho não veio acompanhado de performance: só ${progredindo} de ${exercicios} exercícios tiveram carga em alta. Ganhar peso sem ganhar força costuma significar que a maior parte do ganho não é músculo.`,
      };
    }
    return {
      estado: "confirma",
      taxa,
      exercicios,
      texto: `Força em alta em ${progredindo} de ${exercicios} exercícios (${pct}%) — parcial, mas na direção do resultado corporal.`,
    };
  }

  // Perda de peso: carga MANTIDA já é o bom resultado. Exigir progressão em
  // déficit reprovaria justamente quem está fazendo a coisa certa.
  if (verdict.id === "perda_de_gordura") {
    return {
      estado: taxa >= TETO_CONTRADIZ ? "confirma" : "sem_base",
      taxa,
      exercicios,
      texto:
        taxa >= TETO_CONTRADIZ
          ? `Força subindo em ${progredindo} de ${exercicios} exercícios mesmo com o peso caindo — sinal de que a massa magra está sendo preservada.`
          : `Carga estável na maior parte dos exercícios. Em perda de peso isso é esperado; manter a força já é o resultado.`,
    };
  }

  if (verdict.id === "perda_com_massa_magra") {
    return {
      estado: taxa <= TETO_CONTRADIZ ? "confirma" : "contradiz",
      taxa,
      exercicios,
      texto:
        taxa <= TETO_CONTRADIZ
          ? `A carga também não subiu (${progredindo} de ${exercicios} exercícios), o que reforça a leitura das medidas.`
          : `A carga subiu em ${progredindo} de ${exercicios} exercícios, o que não combina com a leitura das medidas — vale conferir se as medições do período foram feitas do mesmo jeito.`,
    };
  }

  // Peso e cintura subindo juntos: a força é o que separa "estou ganhando
  // músculo e um pouco de gordura junto" de "estou só ganhando gordura". É o
  // caso em que ela mais acrescenta, e por isso não cai no genérico abaixo.
  if (verdict.id === "ganho_com_gordura") {
    return {
      estado: taxa >= PISO_CONFIRMA ? "contradiz" : "confirma",
      taxa,
      exercicios,
      texto:
        taxa >= PISO_CONFIRMA
          ? `Mas a carga subiu em ${progredindo} de ${exercicios} exercícios (${pct}%): parte do ganho é músculo, mesmo com a cintura subindo junto.`
          : `A carga também não subiu (${progredindo} de ${exercicios} exercícios), o que reforça a leitura de que a maior parte do ganho não é músculo.`,
    };
  }

  return {
    estado: "sem_base",
    taxa,
    exercicios,
    texto: `Carga em alta em ${progredindo} de ${exercicios} exercícios no período.`,
  };
}
