/**
 * "Pulei hoje" — QUAL dose foi pulada (correção de 31/10/2026).
 *
 * O pulo era gravado com a hora do toque. Tocar "Pulei hoje" no alarme das
 * 08:00 às 19:45 marcava a dose das 20:00; na tela, pular a das 08:00 às 15:00
 * caía fora da janela e a dose seguia "atrasada". Agora a tela e a notificação
 * mandam a dose prevista, e o registro do pulo leva o horário DELA — é a
 * afirmação que a pessoa fez ("pulei a das 08:00"), não o instante do clique.
 */

/** Pulo de dose de até 36 h atrás (ontem à noite, de manhã) ou até 12 h à frente. */
const MAX_PASSADO_MS = 36 * 3600_000;
const MAX_FUTURO_MS = 12 * 3600_000;

export function doseDoPulo(scheduledFor: unknown, agora: Date = new Date()): Date | null {
  if (typeof scheduledFor !== "string" || !scheduledFor) return null;
  const t = Date.parse(scheduledFor);
  if (!Number.isFinite(t)) return null;
  if (t < agora.getTime() - MAX_PASSADO_MS || t > agora.getTime() + MAX_FUTURO_MS) return null;
  return new Date(t);
}
