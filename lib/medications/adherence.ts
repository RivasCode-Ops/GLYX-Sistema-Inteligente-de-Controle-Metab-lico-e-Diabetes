/**
 * Casamento entre dose agendada e dose registrada — **regra única** do app.
 *
 * Existiam duas: a tela do dia casava registro com horário agendado por janela
 * (`daily-doses-card.tsx`), e o relatório médico contava logs brutos no período.
 * Para o mesmo intervalo, os dois números podiam divergir — e o que ia para o
 * médico era justamente o mais frouxo: dois registros feitos no mesmo horário
 * (clique duplicado, ou registro de dose extra) contavam como duas doses de
 * adesão, inflando a aderência de quem esqueceu metade das doses.
 *
 * A regra, que agora vale nos dois lugares:
 *
 * - um registro cobre uma dose agendada se caiu entre **1h antes** do horário e
 *   o **próximo horário agendado** (ou o fim do dia local, na última dose);
 * - **cada registro casa com no máximo uma dose** — daí o `usedLogs`.
 *
 * A janela termina no próximo horário em vez de um intervalo fixo porque uma
 * dose registrada bem depois (estatina das 19h registrada às 23h54) nunca
 * casava com janela fixa e ficava "pendente" para sempre — bug real corrigido
 * nesta base.
 */

import { localDayRangeUTC, wallClockToUTC } from "@/lib/time/local-day";

export type DoseLog = { taken_at: string };
export type DoseSnooze = {
  snoozed_until: string;
  /**
   * Qual dose este adiamento empurra. Nulo nas linhas anteriores à migration
   * `20260907132000_snooze_invariants`.
   */
  scheduled_for?: string | null;
};

export type DoseStatus =
  | { state: "tomada"; at: string }
  | { state: "adiada"; until: string }
  | { state: "agendada" }
  | { state: "pendente" };

export const MATCH_BEFORE_MS = 60 * 60 * 1000;

export type DoseWindow = { time: string; scheduledUTC: Date; windowEndUTC: Date };

/** Horários agendados de um remédio num dia local, cada um com sua janela de casamento. */
export function doseWindows(
  times: string[],
  y: number,
  mo: number,
  d: number,
  tz: string
): DoseWindow[] {
  const sorted = [...times].sort();
  const scheduled = sorted.map((time) => {
    const [hh, mm] = time.split(":").map(Number);
    return { time, scheduledUTC: wallClockToUTC(y, mo, d, hh, mm, 0, tz) };
  });
  const dateStr = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const endOfDayUTC = new Date(localDayRangeUTC(dateStr, tz).endISO);
  return scheduled.map((s, i) => ({
    ...s,
    windowEndUTC: scheduled[i + 1]?.scheduledUTC ?? endOfDayUTC,
  }));
}

export function computeDoseStatus(
  scheduledUTC: Date,
  windowEndUTC: Date,
  medLogs: DoseLog[],
  medSnoozes: DoseSnooze[],
  usedLogs: Set<string>,
  now: number
): DoseStatus {
  const t = scheduledUTC.getTime();
  const end = windowEndUTC.getTime();
  const match = medLogs.find((l) => {
    if (usedLogs.has(l.taken_at)) return false;
    const lt = new Date(l.taken_at).getTime();
    return lt >= t - MATCH_BEFORE_MS && lt <= end;
  });
  if (match) {
    usedLogs.add(match.taken_at);
    return { state: "tomada", at: match.taken_at };
  }
  // O adiamento é DESTA dose, não do remédio.
  //
  // Antes bastava existir qualquer snooze do remédio com `snoozed_until` no
  // futuro para TODA dose vencida dele aparecer como "adiada" — e, como o botão
  // de registrar só existia no estado `pendente`, a dose ficava impossível de
  // registrar pela tela. Adiar a dose das 08:00 tirava o botão da dose das
  // 20:00. Adiar de novo estendia o efeito: da parte de quem usa, o horário se
  // prorrogava sozinho e o registro era recusado. Reproduzido em teste antes
  // desta correção.
  //
  // `scheduled_for` amarra o adiamento à dose. Linha antiga não tem a coluna:
  // para ela, vale só se o retorno cair dentro da janela desta dose — o que
  // também marca no máximo uma. E entre as candidatas vence a de maior
  // `snoozed_until`, para o estado não depender da ordem do array.
  const desteDose = medSnoozes.filter((s) => {
    const ate = new Date(s.snoozed_until).getTime();
    if (!(ate > now)) return false;
    if (s.scheduled_for) return new Date(s.scheduled_for).getTime() === t;
    return ate >= t && ate <= end;
  });
  const snooze = desteDose.sort(
    (a, b) => new Date(b.snoozed_until).getTime() - new Date(a.snoozed_until).getTime()
  )[0];
  if (snooze && t <= now) return { state: "adiada", until: snooze.snoozed_until };
  if (t > now) return { state: "agendada" };
  return { state: "pendente" };
}

/** Lista de dias locais (YYYY-MM-DD) de `start` a `end`, inclusive nas duas pontas. */
export function localDaysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  // Guarda contra período invertido ou absurdo: relatório de 90 dias é o teto
  // do app, 400 iterações cobre com folga sem virar laço infinito por dado ruim.
  let guard = 0;
  while (cursor <= last && guard < 400) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return out;
}

export type PeriodAdherence = {
  expectedDoses: number;
  takenDoses: number;
  /** Registros que não casaram com nenhuma dose agendada (dose extra, duplicidade). */
  unmatchedLogs: number;
};

/**
 * Adesão de UM medicamento num período, aplicando a mesma janela dia a dia.
 *
 * `expectedDoses` é horários/dia × dias do período. Registro que não casa com
 * nenhuma janela **não** vira adesão — é contado à parte, porque some no
 * relatório antigo e é informação clínica: pode ser dose extra de correção ou
 * clique duplicado.
 */
export function computePeriodAdherence(
  times: string[],
  logs: DoseLog[],
  tz: string,
  startDay: string,
  endDay: string
): PeriodAdherence {
  const days = localDaysBetween(startDay, endDay);
  if (!times.length) {
    // Remédio sem horário agendado (uso conforme necessidade) não tem dose
    // esperada — cada registro conta como tomada, sem inventar adesão.
    return { expectedDoses: 0, takenDoses: logs.length, unmatchedLogs: 0 };
  }

  const usedLogs = new Set<string>();
  let taken = 0;

  for (const day of days) {
    const [y, mo, d] = day.split("-").map(Number);
    for (const { scheduledUTC, windowEndUTC } of doseWindows(times, y, mo, d, tz)) {
      const t = scheduledUTC.getTime();
      const end = windowEndUTC.getTime();
      const match = logs.find((l) => {
        if (usedLogs.has(l.taken_at)) return false;
        const lt = new Date(l.taken_at).getTime();
        return lt >= t - MATCH_BEFORE_MS && lt <= end;
      });
      if (match) {
        usedLogs.add(match.taken_at);
        taken += 1;
      }
    }
  }

  return {
    expectedDoses: times.length * days.length,
    takenDoses: taken,
    unmatchedLogs: logs.length - usedLogs.size,
  };
}
