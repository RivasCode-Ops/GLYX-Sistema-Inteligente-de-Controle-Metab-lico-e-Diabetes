import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { localDateKey, localDayRangeUTC, wallClockToUTC } from "@/lib/time/local-day";
import type { Medication } from "@/types/database";

// Painel do dia: uma linha por dose agendada, com estado visível — era a
// peça que faltava: o "Registrar dose" funcionava, mas nada na tela mostrava
// o que já foi tomado, então parecia que o registro não pegava.

export type TodayLog = { medication_id: string | null; taken_at: string };
export type TodaySnooze = { medication_id: string; snoozed_until: string };

type DoseStatus =
  | { state: "tomada"; at: string }
  | { state: "adiada"; until: string }
  | { state: "agendada" }
  | { state: "pendente" };

const MATCH_BEFORE_MS = 60 * 60 * 1000;

function hora(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Horários agendados de um remédio no dia, cada um com o instante UTC e o
 * fim da janela de casamento com registros — o próximo horário do mesmo
 * remédio (ou o fim do dia local, na última dose). Sem isso, uma dose
 * registrada bem depois do horário (ex.: estatina às 23h54 agendada pras
 * 19h) nunca casava com nenhuma janela fixa e ficava "pendente" pra sempre.
 */
function doseWindows(
  times: string[],
  y: number,
  mo: number,
  d: number,
  tz: string
): { time: string; scheduledUTC: Date; windowEndUTC: Date }[] {
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
  medLogs: TodayLog[],
  medSnoozes: TodaySnooze[],
  usedLogs: Set<string>,
  now: number
): DoseStatus {
  // Um registro cobre uma dose agendada se caiu entre 1h antes do horário e
  // o próximo horário agendado (ou o fim do dia) — e cada registro só conta
  // para uma dose.
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
  const snooze = medSnoozes.find((s) => new Date(s.snoozed_until).getTime() > now);
  if (snooze && t <= now) return { state: "adiada", until: snooze.snoozed_until };
  if (t > now) return { state: "agendada" };
  return { state: "pendente" };
}

/**
 * Resumo "doses de hoje" de UM medicamento, usando o mesmo casamento
 * horário-agendado↔registro do DailyDosesCard — para não haver dois números
 * diferentes na mesma tela para a mesma dose (ex.: card do topo dizendo
 * "0 de 1 tomadas" e a lista de remédios abaixo dizendo "✓ hoje: 1×" pro
 * mesmo medicamento). Remédios sem horário agendado (uso conforme
 * necessidade) não têm janela pra casar — cada registro do dia conta direto.
 */
export function computeMedicationDoseSummary(
  med: Medication,
  medLogs: TodayLog[],
  medSnoozes: TodaySnooze[],
  timezone: string | null | undefined,
  now: number = Date.now()
): { taken: number; lastAt: string | null } {
  const times = med.reminder_times ?? [];
  if (!times.length) {
    const sorted = medLogs.map((l) => l.taken_at).sort();
    return { taken: sorted.length, lastAt: sorted.at(-1) ?? null };
  }

  const tz = timezone || "America/Sao_Paulo";
  const [y, mo, d] = localDateKey(new Date(now).toISOString(), tz).split("-").map(Number);
  const usedLogs = new Set<string>();
  let taken = 0;
  let lastAt: string | null = null;
  for (const { scheduledUTC, windowEndUTC } of doseWindows(times, y, mo, d, tz)) {
    const status = computeDoseStatus(scheduledUTC, windowEndUTC, medLogs, medSnoozes, usedLogs, now);
    if (status.state === "tomada") {
      taken += 1;
      if (!lastAt || status.at > lastAt) lastAt = status.at;
    }
  }
  return { taken, lastAt };
}

export function DailyDosesCard({
  meds,
  logs,
  snoozes,
  timezone,
  markTakenAction,
}: {
  meds: Medication[];
  logs: TodayLog[];
  snoozes: TodaySnooze[];
  timezone: string | null | undefined;
  markTakenAction: (formData: FormData) => Promise<void>;
}) {
  const tz = timezone || "America/Sao_Paulo";
  const scheduled = meds.filter((m) => (m.reminder_times?.length ?? 0) > 0);
  if (!scheduled.length) return null;

  const now = Date.now();
  const [y, mo, d] = localDateKey(new Date().toISOString(), tz).split("-").map(Number);

  const rows = scheduled
    .flatMap((m) => {
      const medLogs = logs.filter((l) => l.medication_id === m.id);
      const medSnoozes = snoozes.filter((s) => s.medication_id === m.id);
      const usedLogs = new Set<string>();
      return doseWindows(m.reminder_times ?? [], y, mo, d, tz).map(
        ({ time, scheduledUTC, windowEndUTC }) => ({
          med: m,
          time,
          status: computeDoseStatus(scheduledUTC, windowEndUTC, medLogs, medSnoozes, usedLogs, now),
        })
      );
    })
    // Uma linha por horário, na ordem do relógio — não por remédio criado por último.
    .sort((a, b) => a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name));

  const tomadas = rows.filter((r) => r.status.state === "tomada").length;

  return (
    <Card className="border-emerald-500/25">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">📋 Doses de hoje</CardTitle>
        <CardDescription>
          {tomadas} de {rows.length} tomadas — registre em &quot;Registrar dose&quot;, na seção
          Medicamentos ativos abaixo, ou pelo botão da notificação; o estado aparece na hora.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-zinc-800/70">
          {rows.map(({ med, time, status }) => (
            <li key={`${med.id}-${time}`} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="w-12 shrink-0 font-mono text-sm text-zinc-400">{time}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                {med.name}
                {med.dosage ? <span className="text-zinc-500"> · {med.dosage}</span> : null}
              </span>
              {status.state === "tomada" ? (
                <span className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                  ✓ tomada às {hora(status.at, tz)}
                </span>
              ) : status.state === "adiada" ? (
                <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
                  ⏰ adiada até {hora(status.until, tz)}
                </span>
              ) : status.state === "agendada" ? (
                <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-500">
                  mais tarde
                </span>
              ) : (
                <form action={markTakenAction} className="shrink-0">
                  <input type="hidden" name="medication_id" value={med.id} />
                  <Button type="submit" variant="outline" size="sm">
                    Marcar como tomada
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
