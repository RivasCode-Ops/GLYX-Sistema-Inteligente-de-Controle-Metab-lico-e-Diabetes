import { sanitizeForPrompt } from "@/lib/ai/sanitize-context";
import type { InteractionFinding, SafetyVerdict, Severity } from "./interaction-check";

/**
 * Como o veredito determinístico vira texto — para o prompt do modelo e para a
 * tela.
 *
 * Uma regra atravessa este arquivo inteiro: **ausência de alerta nunca é
 * renderizada como "seguro"**. Esse é o ponto exato onde o app falhou antes.
 * Por isso não existe estado verde aqui: o melhor caso possível é
 * `sem_alerta`, cuja legenda diz o que o app de fato sabe — que não encontrou
 * alerta na base dele, o que não é atestado de segurança.
 */

/** Estado que a tela mostra. Note que não há "seguro". */
export type VerdictTone = "evitar" | "atencao" | "sem_alerta";

export function verdictTone(verdict: SafetyVerdict): VerdictTone {
  if (verdict.blocked) return "evitar";
  if (verdict.findings.length || verdict.unresolved.length) return "atencao";
  return "sem_alerta";
}

export const TONE_LABEL: Record<VerdictTone, string> = {
  evitar: "🚫 Não combine sem falar com seu médico",
  atencao: "⚠️ Atenção",
  sem_alerta: "🔍 Sem alerta na base do app",
};

/**
 * A frase que fecha o buraco do incidente. O usuário precisa saber que "o app
 * não achou nada" e "o app não conhece isso" são coisas diferentes.
 */
export function unknownSubstanceNote(unresolved: string[]): string | null {
  if (!unresolved.length) return null;
  const nomes = unresolved.map((n) => sanitizeForPrompt(n, 60)).join(", ");
  return (
    `O app não tem ${unresolved.length > 1 ? "estas substâncias" : "esta substância"} na base de interação: ${nomes}. ` +
    "Não haver alerta aqui NÃO significa que não há risco — significa que o app não sabe. " +
    "Confirme com seu médico ou farmacêutico antes de usar."
  );
}

/** Legenda fixa do estado sem achado. Existe para nunca virar "seguro". */
export const NO_FINDING_NOTE =
  "O app não encontrou interação cadastrada entre este produto e o que você tem registrado. " +
  "A base do app é limitada e não cobre todas as substâncias — isso não é um atestado de segurança.";

export const DOCTOR_NOTE =
  "Leve esta informação ao seu médico antes de iniciar. Ajuste de dose de qualquer medicação é decisão médica.";

/**
 * Texto entregue quando o veredito é `blocked` e o modelo NÃO é chamado.
 * São as mensagens fixas da base, na ordem em que foram cadastradas, mais a
 * orientação médica. Nada aqui passa por LLM.
 */
export function blockedText(verdict: SafetyVerdict): string {
  const graves = verdict.findings.filter((f) => f.severity === "grave");
  const linhas = graves.map((f) => `• ${f.message}`);
  const aviso = unknownSubstanceNote(verdict.unresolved);
  return [...linhas, aviso, DOCTOR_NOTE].filter(Boolean).join("\n\n");
}

/**
 * O que trafega do servidor para a tela.
 *
 * Existe como tipo único porque duas rotas (`supplement-check` e `med-label`)
 * produzem o mesmo alerta e duas telas o consomem. Duplicar o mapeamento seria
 * criar a chance de as duas divergirem no que consideram risco — e a que
 * divergisse para menos não daria erro nenhum.
 */
export type SafetyPayload = {
  tone: VerdictTone;
  label: string;
  blocked: boolean;
  worst: Severity | null;
  findings: Pick<InteractionFinding, "substanceA" | "substanceB" | "severity" | "message">[];
  unresolved: string[];
  unknownNote: string | null;
  noFindingNote: string | null;
  doctorNote: string;
};

export function toSafetyPayload(verdict: SafetyVerdict): SafetyPayload {
  const tone = verdictTone(verdict);
  return {
    tone,
    label: TONE_LABEL[tone],
    blocked: verdict.blocked,
    worst: verdict.worst,
    findings: verdict.findings.map((f) => ({
      substanceA: f.substanceA,
      substanceB: f.substanceB,
      severity: f.severity,
      message: f.message,
    })),
    unresolved: verdict.unresolved,
    unknownNote: unknownSubstanceNote(verdict.unresolved),
    // Só existe no estado sem achado — é a legenda que impede a tela de ficar
    // muda quando nada foi encontrado.
    noFindingNote: tone === "sem_alerta" ? NO_FINDING_NOTE : null,
    doctorNote: DOCTOR_NOTE,
  };
}

const SEVERIDADE_VAZIA = "nenhuma";

/**
 * Bloco injetado no contexto do modelo. É DADO, não instrução: nomes vêm de
 * cadastro do usuário e de OCR de rótulo, então passam por `sanitizeForPrompt`
 * antes de entrar. O SYSTEM instrui o modelo a tratar este bloco como veredito
 * já decidido e a não reavaliá-lo.
 */
export function renderVerdictBlock(verdict: SafetyVerdict): string {
  const severidade: Severity | typeof SEVERIDADE_VAZIA = verdict.worst ?? SEVERIDADE_VAZIA;

  const achados = verdict.findings.length
    ? verdict.findings
        .map(
          (f) =>
            `  - ${f.substanceA} x ${f.substanceB} | ${f.severity} | ${sanitizeForPrompt(f.mechanism, 200)} | ${sanitizeForPrompt(f.message, 300)}`
        )
        .join("\n")
    : "  (nenhum)";

  const lista = (nomes: string[]) =>
    nomes.length ? `[${nomes.map((n) => sanitizeForPrompt(n, 60)).join(", ")}]` : "[]";

  return [
    "CHECAGEM DE INTERAÇÃO (veredito determinístico — já decidido, não reavalie)",
    `severidade_maxima: ${severidade}`,
    "achados:",
    achados,
    `substancias_nao_reconhecidas: ${lista(verdict.unresolved)}`,
    `substancias_reconhecidas_sem_achado: ${lista(verdict.resolvedClean)}`,
  ].join("\n");
}
