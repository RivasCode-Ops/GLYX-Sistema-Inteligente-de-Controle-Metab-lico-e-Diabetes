import { describeAge } from "@/lib/health/reading-freshness";

/**
 * Idade de um relatório longitudinal — score de risco, relatório para o médico.
 *
 * ---------------------------------------------------------------------------
 * A RÉGUA QUE O APP APLICAVA NUM LUGAR SÓ
 * ---------------------------------------------------------------------------
 * A tela de Glicemia já dizia "há 4 min" ao lado do valor: uma leitura velha
 * mostrada como se fosse de agora é o defeito que `reading-freshness.ts` existe
 * para fechar. Auditoria de 08/09/2026: a mesma régua **não** estava no score de
 * risco nem no relatório médico.
 *
 * O `/analise` exibia "52/100 · Janela 14 dias · 06/07 → 20/07" em destaque, com
 * cinquenta dias de idade e nenhum aviso. E o relatório impresso — o papel que
 * vai ao consultório — trazia o mesmo período sem dizer no topo que estava
 * velho. Um número velho apresentado como atual é pior num relatório que numa
 * tela: a tela o usuário reabre, o papel o médico lê como retrato de hoje.
 *
 * ---------------------------------------------------------------------------
 * QUANDO UM RELATÓRIO FICA VELHO
 * ---------------------------------------------------------------------------
 * Não é uma constante em dias: depende da janela que ele cobre. Um relatório de
 * 7 dias feito há 10 já fala de um período que terminou antes do que veio
 * depois; um de 14 dias feito há 10 ainda toca o presente.
 *
 * A régua é essa: **velho quando a idade passa a janela que ele cobre** — o
 * relatório passou a descrever um tempo menor do que o que se passou desde que
 * foi feito. Isso não é medida clínica, é aritmética de cobertura, e vale a
 * mesma coisa para qualquer relatório com janela declarada.
 */

export type ReportAge = {
  /** Dias inteiros desde a geração. */
  days: number;
  /** A idade passou a janela coberta. */
  stale: boolean;
  /** "há 50 dias" — mesma frase de `reading-freshness`, um vocabulário só. */
  label: string;
  /**
   * Frase de aviso pronta, ou `null` quando o relatório ainda está dentro da
   * janela. Null é resposta: a tela não desenha aviso nenhum.
   */
  warning: string | null;
};

const DIA_MS = 86_400_000;

export function reportAge(
  computedAt: string | Date,
  windowDays: number,
  now: Date = new Date()
): ReportAge {
  const ms = now.getTime() - new Date(computedAt).getTime();
  const days = Math.max(0, Math.floor(ms / DIA_MS));
  const label = describeAge(Math.max(0, Math.floor(ms / 60_000)));

  // Janela inválida (zero, negativa, ausente) não vira divisão nem palpite:
  // sem cobertura declarada não há como dizer se envelheceu.
  const janela = windowDays > 0 ? windowDays : null;
  const stale = janela != null && days > janela;

  return {
    days,
    stale,
    label,
    warning: stale
      ? `Este relatório foi gerado ${label} e cobre ${janela} dias. Ele descreve um período que já passou — gere um novo antes de levar ao consultório.`
      : null,
  };
}
