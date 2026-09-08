import { computeDoseStatus, doseWindows, type DoseLog, type DoseSnooze } from "./adherence";
import { localDateKey } from "@/lib/time/local-day";

/**
 * Resumo das doses do dia — uma implementação, vários consumidores.
 *
 * Os tiles do topo de `/medicacao`, o card "Doses de hoje" e o card de ação do
 * painel falam do mesmo conjunto. Cada um contando por conta seria a terceira,
 * quarta e quinta contagem da mesma grandeza — o defeito que este app já pagou
 * em adesão, em "Inferior A × 0 min" e no recibo de contexto.
 *
 * Todo o casamento dose↔registro vem de `adherence.ts`, que é a regra única.
 * Aqui só se agrupa o resultado.
 */

export type MedicationLike = {
  id: string;
  name: string;
  dosage?: string | null;
  reminder_times?: string[] | null;
};

export type DoseDoDia = {
  medicationId: string;
  name: string;
  dosage: string | null;
  /** HH:MM do horário previsto */
  time: string;
  scheduledUTC: Date;
  state: "tomada" | "adiada" | "agendada" | "pendente";
  takenAt?: string;
  snoozedUntil?: string;
};

export type ResumoDoDia = {
  doses: DoseDoDia[];
  total: number;
  tomadas: number;
  /** vencidas e sem registro — `pendente` no vocabulário da regra */
  atrasadas: number;
  agendadas: number;
  /** próxima dose ainda não registrada, a mais cedo; null quando não há */
  proxima: DoseDoDia | null;
  /**
   * Adesão do dia em %, ou null quando ainda não há dose vencida.
   *
   * Null não é zero: às 06:00, com a primeira dose às 08:00, "0% de adesão"
   * seria uma acusação sobre algo que ainda não aconteceu. Só entra no
   * denominador o que já venceu.
   */
  adesaoPct: number | null;
};

export function resumirDosesDoDia(
  meds: MedicationLike[],
  logs: (DoseLog & { medication_id?: string | null })[],
  snoozes: (DoseSnooze & { medication_id: string })[],
  timezone: string | null | undefined,
  now: number = Date.now()
): ResumoDoDia {
  const tz = timezone || "America/Sao_Paulo";
  const [y, mo, d] = localDateKey(new Date(now).toISOString(), tz).split("-").map(Number);

  const doses: DoseDoDia[] = [];

  for (const m of meds) {
    const horarios = (m.reminder_times ?? []).filter((t) => /^\d{1,2}:\d{2}$/.test(t));
    if (!horarios.length) continue;

    const medLogs = logs.filter((l) => l.medication_id === m.id);
    const medSnoozes = snoozes.filter((s) => s.medication_id === m.id);
    const usados = new Set<string>();

    for (const w of doseWindows(horarios, y, mo, d, tz)) {
      const status = computeDoseStatus(
        w.scheduledUTC,
        w.windowEndUTC,
        medLogs,
        medSnoozes,
        usados,
        now
      );
      doses.push({
        medicationId: m.id,
        name: m.name,
        dosage: m.dosage ?? null,
        time: w.time,
        scheduledUTC: w.scheduledUTC,
        state: status.state,
        takenAt: status.state === "tomada" ? status.at : undefined,
        snoozedUntil: status.state === "adiada" ? status.until : undefined,
      });
    }
  }

  doses.sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));

  const tomadas = doses.filter((x) => x.state === "tomada").length;
  const atrasadas = doses.filter((x) => x.state === "pendente").length;
  const agendadas = doses.filter((x) => x.state === "agendada").length;

  // A próxima é a mais cedo que ainda não foi registrada — inclui a atrasada,
  // porque "próxima" para quem usa é "a que eu ainda preciso tomar", não a
  // próxima no relógio.
  const proxima = doses.find((x) => x.state !== "tomada") ?? null;

  const vencidas = doses.length - agendadas;
  return {
    doses,
    total: doses.length,
    tomadas,
    atrasadas,
    agendadas,
    proxima,
    adesaoPct: vencidas > 0 ? Math.round((tomadas / vencidas) * 100) : null,
  };
}
