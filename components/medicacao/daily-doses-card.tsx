import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormularioDeAcao, type ResultadoDeAcao } from "@/components/medicacao/formulario-de-acao";
import { localDateKey } from "@/lib/time/local-day";
import { computeDoseStatus, doseWindows } from "@/lib/medications/adherence";
import { ehDiaDeDose } from "@/lib/medications/cadence";
import type { Medication } from "@/types/database";
import { formatarHora } from "@/lib/time/format";

// Painel do dia: uma linha por dose agendada, com estado visível — era a
// peça que faltava: o "Registrar dose" funcionava, mas nada na tela mostrava
// o que já foi tomado, então parecia que o registro não pegava.

/** `confirmed === false` é "Pulei hoje" (D16): aparece como pulada, nunca como tomada. */
export type TodayLog = { medication_id: string | null; taken_at: string; confirmed?: boolean | null };
export type TodaySnooze = {
  medication_id: string;
  snoozed_until: string;
  /** Qual dose este adiamento empurra; nulo nas linhas anteriores à migration. */
  scheduled_for?: string | null;
};

export { computeDoseStatus } from "@/lib/medications/adherence";

function hora(iso: string, tz: string): string {
  return formatarHora(iso, null, {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const tz = timezone || "America/Sao_Paulo";
  const hoje = localDateKey(new Date(now).toISOString(), tz);
  // Dia sem dose pela cadência é tratado como item sem horário: não há janela
  // para casar, e cada registro do dia conta direto.
  const times = ehDiaDeDose(med, hoje) ? (med.reminder_times ?? []) : [];
  if (!times.length) {
    const sorted = medLogs.filter((l) => l.confirmed !== false).map((l) => l.taken_at).sort();
    return { taken: sorted.length, lastAt: sorted.at(-1) ?? null };
  }

  const [y, mo, d] = hoje.split("-").map(Number);
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
  markSkippedAction,
}: {
  meds: Medication[];
  logs: TodayLog[];
  snoozes: TodaySnooze[];
  timezone: string | null | undefined;
  markTakenAction: (anterior: ResultadoDeAcao, formData: FormData) => Promise<ResultadoDeAcao>;
  /** "Pulei hoje" (B3). Ausente, o botão não aparece. */
  markSkippedAction?: (anterior: ResultadoDeAcao, formData: FormData) => Promise<ResultadoDeAcao>;
}) {
  const tz = timezone || "America/Sao_Paulo";
  const hoje = localDateKey(new Date().toISOString(), tz);
  const scheduled = meds.filter(
    (m) => (m.reminder_times?.length ?? 0) > 0 && ehDiaDeDose(m, hoje)
  );
  if (!scheduled.length) return null;

  const now = Date.now();
  const [y, mo, d] = hoje.split("-").map(Number);

  const rows = scheduled
    .flatMap((m) => {
      const medLogs = logs.filter((l) => l.medication_id === m.id);
      const medSnoozes = snoozes.filter((s) => s.medication_id === m.id);
      const usedLogs = new Set<string>();
      return doseWindows(m.reminder_times ?? [], y, mo, d, tz).map(
        ({ time, scheduledUTC, windowEndUTC }) => ({
          med: m,
          time,
          scheduledISO: scheduledUTC.toISOString(),
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
          {rows.map(({ med, time, scheduledISO, status }) => (
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
              ) : (
                <>
                  {status.state === "pulada" ? (
                    <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400">
                      pulada
                    </span>
                  ) : status.state === "adiada" ? (
                    <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
                      ⏰ adiada até {hora(status.until, tz)}
                    </span>
                  ) : status.state === "agendada" ? (
                    <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-500">
                      mais tarde
                    </span>
                  ) : null}
                  {/* O BOTÃO SEMPRE EXISTE enquanto a dose não foi registrada.
                      Antes ele só aparecia no estado `pendente`: dose adiada ou
                      ainda não vencida não tinha como ser registrada pela tela,
                      e quem tomou o remédio mais cedo — ou tinha adiado — ficava
                      sem caminho nenhum. O servidor nunca recusou registro; a
                      recusa estava aqui, na condição de render. Registro
                      atrasado ou adiantado é informação correta; registro
                      ausente é informação errada. */}
                  {/* O campo de hora existe porque `taken_at` era a hora do
                      CLIQUE, e o clique acontece quando dá — não quando a dose
                      foi tomada. Vem pré-preenchido com o horário previsto e
                      pode ser deixado como está: registrar segue sendo um
                      toque. Sem ele, o cruzamento dose × glicemia lê rajadas de
                      registro em vez das doses. */}
                  <FormularioDeAcao acao={markTakenAction} className="flex shrink-0 items-center gap-1.5">
                    <input type="hidden" name="medication_id" value={med.id} />
                    {/* Identidade da ação: reenviar este formulário não cria outra tomada. */}
                    <input type="hidden" name="pedido" value={crypto.randomUUID()} />
                    <label className="sr-only" htmlFor={`hora-${med.id}-${time}`}>
                      Hora em que tomou {med.name}
                    </label>
                    <input
                      id={`hora-${med.id}-${time}`}
                      type="time"
                      name="taken_at_local"
                      defaultValue={time}
                      className="h-8 rounded-md border border-zinc-800 bg-zinc-950 px-2 font-mono text-xs text-zinc-300"
                    />
                    <Button type="submit" variant="outline" size="sm">
                      Registrar
                    </Button>
                  </FormularioDeAcao>
                  {/* Pular só a dose que já venceu (ou foi adiada): "mais tarde"
                      ainda não é decisão, e pulada já está marcada. */}
                  {markSkippedAction && status.state !== "pulada" && status.state !== "agendada" ? (
                    <FormularioDeAcao acao={markSkippedAction} className="shrink-0">
                      <input type="hidden" name="medication_id" value={med.id} />
                      {/* A dose DESTA linha: pular a das 08:00 às 15:00 marca a das 08:00. */}
                      <input type="hidden" name="scheduled_for" value={scheduledISO} />
                      <input type="hidden" name="pedido" value={crypto.randomUUID()} />
                      <Button type="submit" variant="ghost" size="sm" className="text-zinc-400">
                        Pulei hoje
                      </Button>
                    </FormularioDeAcao>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
