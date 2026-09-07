import { localDateKey } from "@/lib/time/local-day";
import { MATCH_BEFORE_MS, doseWindows } from "./adherence";

/**
 * Rótulo de adesão de um registro — derivado, nunca porteiro.
 *
 * REGRA QUE ESTRUTURA O MÓDULO: o app não recusa registro.
 *
 * Recusar registro atrasado não melhora adesão — apaga o dado. O usuário toma o
 * item de qualquer forma, e o banco passa a AFIRMAR que ele não tomou. Esse
 * histórico falso alimenta o checador de interação, o contador de mecanismos e
 * o relatório do médico. Registro atrasado é informação correta; registro
 * ausente é informação errada. Por isso `resolveAdherenceStatus` não tem
 * caminho de recusa: qualquer entrada produz um status.
 *
 * REUSA A REGRA ÚNICA de `adherence.ts` (`doseWindows` + a janela de 1 h antes)
 * em vez de calcular a própria. O cabeçalho daquele arquivo conta o preço de ter
 * duas regras para a mesma pergunta: a tela do dia e o relatório médico
 * divergiam, e o número que ia para o médico era o mais frouxo. Aqui só se
 * ACRESCENTA um rótulo por cima do casamento que já existe.
 */

export type TimingStrictness = "rigido" | "flexivel" | "livre";

export type AdherenceStatus = "no_horario" | "atrasado" | "fora_janela" | "avulso";

/**
 * Tolerância padrão por rigidez, em minutos — o que separa "no horário" de
 * "atrasado". Não é a janela de casamento (essa continua sendo a de
 * `adherence.ts`); é só o corte do rótulo.
 */
export const DEFAULT_GRACE_MINUTES: Record<TimingStrictness, number | null> = {
  rigido: 60,
  flexivel: 240,
  livre: null,
};

export type AdherenceInput = {
  /** `medications.reminder_times`, no formato HH:MM */
  reminderTimes: string[] | null;
  strictness: TimingStrictness;
  /** `medications.grace_minutes`. Nulo usa o padrão da rigidez. */
  graceMinutes: number | null;
  /** momento do registro */
  takenAt: Date;
  /** fuso do usuário: "mesmo dia" é o dia dele, não o do servidor */
  timeZone: string;
};

export type AdherenceResult = {
  status: AdherenceStatus;
  /** horário previsto que este registro cumpre; nulo quando não há */
  scheduledFor: Date | null;
};

export function resolveAdherenceStatus(input: AdherenceInput): AdherenceResult {
  const { reminderTimes, strictness, graceMinutes, takenAt, timeZone } = input;
  const horarios = (reminderTimes ?? []).filter((t) => /^\d{1,2}:\d{2}$/.test(t.trim()));

  // Item `livre` não tem horário: vira pergunta diária (tomou hoje?), sem
  // alarme e sem atraso a apontar.
  if (strictness === "livre") {
    // Um item livre que AINDA tem horário cadastrado é inconsistência de dado,
    // não uso normal. Fica como fora_janela para aparecer no relatório em vez
    // de se confundir com registro avulso legítimo.
    return horarios.length
      ? { status: "fora_janela", scheduledFor: null }
      : { status: "avulso", scheduledFor: null };
  }

  if (!horarios.length) return { status: "avulso", scheduledFor: null };

  const dia = localDateKey(takenAt.toISOString(), timeZone);
  const [y, mo, d] = dia.split("-").map(Number);
  const janelas = doseWindows(horarios, y, mo, d, timeZone);

  const t = takenAt.getTime();
  const casada = janelas.find(
    (w) => t >= w.scheduledUTC.getTime() - MATCH_BEFORE_MS && t <= w.windowEndUTC.getTime()
  );

  // Não caiu em janela nenhuma do dia local: cumpre horário de outro dia, ou
  // horário nenhum. Segue gravado — só não conta como dose no horário.
  if (!casada) return { status: "fora_janela", scheduledFor: null };

  const tolerancia = (graceMinutes ?? DEFAULT_GRACE_MINUTES[strictness] ?? 0) * 60_000;
  const distancia = Math.abs(t - casada.scheduledUTC.getTime());

  return {
    status: distancia <= tolerancia ? "no_horario" : "atrasado",
    scheduledFor: casada.scheduledUTC,
  };
}
