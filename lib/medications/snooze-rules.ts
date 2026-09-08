import { localDateKey } from "@/lib/time/local-day";
import type { TimingStrictness } from "./adherence-status";

/**
 * Regras do adiamento.
 *
 * SINTOMA RELATADO: o adiar às vezes não é aceito, e o horário às vezes se
 * prorroga sozinho.
 *
 * MEDIDO NO CÓDIGO EM 07/09/2026, e corrige a hipótese registrada no briefing:
 * o job NÃO recalcula `snoozed_until`. O dispatcher só faz `set fired = true`;
 * não existe UPDATE nessa coluna em lugar nenhum. O que produz o sintoma é
 * outra coisa:
 *
 *   - "prorroga sozinho": o push de adiamento passa pelo MESMO handler de
 *     `public/sw.js` e, por carregar `medId`, recebe de novo o botão
 *     "⏰ Adiar 15min". A cadeia não tinha fim — sem contador, sem limite, e
 *     sem nada que invalidasse o adiamento na virada do dia.
 *   - "não é aceito": a rota exige sessão de cookie e o service worker dispara
 *     com o app fechado, quando a sessão pode ter expirado. É falha de
 *     autenticação, e o SW já a exibe como "erro <status>".
 *
 * Este módulo é a parte determinística: decide se pode adiar e qual é a
 * tentativa. A imutabilidade de `snoozed_until` é garantida no banco pelo
 * unique `(user_id, medication_id, scheduled_for, attempt)`.
 */

/** Teto de adiamentos por dose. Atingido, o card troca as ações. */
export const MAX_SNOOZE_ATTEMPTS = 3;

export const DEFAULT_SNOOZE_MINUTES = 15;

export type SnoozeDecision =
  | { allowed: true; attempt: number; snoozedUntil: Date }
  | { allowed: false; reason: "livre" | "limite" | "dia_virado" };

export type SnoozeInput = {
  strictness: TimingStrictness;
  /** horário previsto que este adiamento empurra */
  scheduledFor: Date;
  /** adiamentos já gravados para ESTA dose */
  attemptsUsed: number;
  minutes?: number;
  now: Date;
  timeZone: string;
};

export function decideSnooze(input: SnoozeInput): SnoozeDecision {
  const { strictness, scheduledFor, attemptsUsed, now, timeZone } = input;

  // Item livre não tem alarme; não há o que adiar.
  if (strictness === "livre") return { allowed: false, reason: "livre" };

  // O adiamento morre com o dia. A dose de ontem não é a dose de hoje, e um
  // adiamento de 15 min pedido às 23:55 tocaria às 00:10 para um horário
  // previsto que já não existe mais.
  if (localDateKey(scheduledFor.toISOString(), timeZone) !== localDateKey(now.toISOString(), timeZone)) {
    return { allowed: false, reason: "dia_virado" };
  }

  // Atingido o limite, o adiar SOME — não volta a aparecer. É o que quebra a
  // cadeia infinita de "adiar o adiamento".
  if (attemptsUsed >= MAX_SNOOZE_ATTEMPTS) return { allowed: false, reason: "limite" };

  const minutes = input.minutes ?? DEFAULT_SNOOZE_MINUTES;
  return {
    allowed: true,
    // Tentativa NOVA, sempre. Adiar de novo cria linha nova; nunca atualiza a
    // anterior — é isso que mantém `snoozed_until` imutável.
    attempt: attemptsUsed + 1,
    snoozedUntil: new Date(now.getTime() + minutes * 60_000),
  };
}

/**
 * Ações que o card oferece. Some o "Adiar" quando não há mais adiamento
 * possível, em vez de oferecê-lo e recusar depois.
 */
export function snoozeActionsFor(
  decision: SnoozeDecision
): ("registrei" | "adiar" | "pulei_hoje")[] {
  return decision.allowed
    ? ["registrei", "adiar", "pulei_hoje"]
    : ["registrei", "pulei_hoje"];
}
