import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { logMedicationTaken } from "@/app/actions/medications";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DailyDosesCard,
  type TodayLog,
  type TodaySnooze,
} from "@/components/medicacao/daily-doses-card";
import { MedicationScheduleSuggestion } from "@/components/medicacao/medication-schedule-suggestion";
import { startOfLocalDayISO } from "@/lib/time/local-day";
import type { Medication } from "@/types/database";
import { demoMedications, demoMedicationLogs } from "@/lib/demo/data";
import { resumirDosesDoDia } from "@/lib/medications/day-summary";

// "Doses de hoje" = a tela de AGIR: o que tomar agora, marcar como tomada e o
// histórico recente (agenda fundida aqui). O cadastro, estoque, alarmes e
// edição foram para "Meus medicamentos" (/medicacao/medicamentos), separando
// a ação diária da gestão. Antes tudo isso vivia numa única tela de 539 linhas.
type HistoryRow = {
  id: string;
  taken_at: string;
  medications: { name: string; dosage: string | null } | null;
};
type RawHistoryRow = Omit<HistoryRow, "medications"> & {
  medications: HistoryRow["medications"] | HistoryRow["medications"][];
};

export default async function MedicacaoDosesPage() {
  let meds: Medication[] = [];
  let todayLogs: TodayLog[] = [];
  let todaySnoozes: TodaySnooze[] = [];
  let history: HistoryRow[] = [];
  let timezone: string | null = null;
  const demoMode = !isSupabaseConfigured();

  async function logMedicationTakenAction(formData: FormData): Promise<void> {
    "use server";
    await logMedicationTaken(formData);
  }

  if (demoMode) {
    meds = demoMedications;
    history = demoMedicationLogs;
  } else {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: p } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", user.id)
          .maybeSingle();
        timezone = p?.timezone ?? null;
        const startOfDayISO = startOfLocalDayISO(timezone);

        const [medsRes, logsRes, snoozesRes, historyRes] = await Promise.all([
          supabase
            .from("medications")
            .select("*")
            .eq("user_id", user.id)
            .eq("active", true)
            .order("created_at", { ascending: false }),
          supabase
            .from("medication_logs")
            .select("medication_id, taken_at")
            .eq("user_id", user.id)
            .gte("taken_at", startOfDayISO),
          supabase
            .from("medication_snoozes")
            .select("medication_id, snoozed_until, scheduled_for")
            .eq("user_id", user.id)
            .gte("created_at", startOfDayISO),
          supabase
            .from("medication_logs")
            .select("id, taken_at, medications ( name, dosage )")
            .eq("user_id", user.id)
            .order("taken_at", { ascending: false })
            .limit(40),
        ]);
        meds = (medsRes.data ?? []) as Medication[];
        todayLogs = (logsRes.data ?? []) as TodayLog[];
        todaySnoozes = (snoozesRes.data ?? []) as TodaySnooze[];
        history = ((historyRes.data ?? []) as RawHistoryRow[]).map((log) => ({
          ...log,
          medications: Array.isArray(log.medications) ? log.medications[0] ?? null : log.medications,
        }));
      }
    }
  }

  // Tiles e próxima dose saem da MESMA função que o card abaixo — a regra
  // única de casamento dose↔registro. Contar aqui por conta seria a terceira
  // contagem da mesma grandeza nesta tela.
  const resumo = resumirDosesDoDia(meds, todayLogs, todaySnoozes, timezone);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {!demoMode && resumo.total > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { rotulo: "doses hoje", valor: resumo.total, cor: "text-zinc-100" },
              { rotulo: "medicamentos", valor: meds.length, cor: "text-zinc-100" },
              {
                rotulo: "atrasadas",
                valor: resumo.atrasadas,
                cor: resumo.atrasadas > 0 ? "text-amber-300" : "text-zinc-100",
              },
              {
                rotulo: "adesão hoje",
                // Travessão, não "0%": antes de qualquer dose vencer, zero
                // seria acusação sobre algo que ainda não aconteceu.
                valor: resumo.adesaoPct == null ? "—" : `${resumo.adesaoPct}%`,
                cor: "text-emerald-300",
              },
            ].map((t) => (
              <div
                key={t.rotulo}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3"
              >
                <p className={`font-mono text-2xl ${t.cor}`}>{t.valor}</p>
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">{t.rotulo}</p>
              </div>
            ))}
          </div>

          {resumo.proxima ? (
            <Card className="border-l-[3px] border-l-emerald-500/70">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                    {resumo.proxima.state === "pendente" ? "Dose pendente" : "Próxima dose"}
                  </p>
                  <p className="mt-0.5 font-mono text-lg text-zinc-100">
                    {resumo.proxima.time} · {resumo.proxima.name}
                  </p>
                  {/* A dose exibida é a que ELE cadastrou, não sugestão do app. */}
                  {resumo.proxima.dosage ? (
                    <p className="text-xs text-zinc-500">{resumo.proxima.dosage}</p>
                  ) : null}
                </div>
                <form action={logMedicationTakenAction}>
                  <input type="hidden" name="medication_id" value={resumo.proxima.medicationId} />
                  <Button type="submit" size="sm">
                    Registrar agora
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      {!demoMode ? (
        <DailyDosesCard
          meds={meds}
          logs={todayLogs}
          snoozes={todaySnoozes}
          timezone={timezone}
          markTakenAction={logMedicationTakenAction}
        />
      ) : null}

      {!demoMode ? <MedicationScheduleSuggestion medications={meds} /> : null}

      <Link
        href="/medicacao/medicamentos"
        className="block rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-zinc-300 transition hover:border-emerald-500/40 hover:text-zinc-100"
      >
        💊 Meus medicamentos — adicionar, estoque, alarmes e edição →
      </Link>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-zinc-100">Histórico de doses</h2>
        {history.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nenhum registro</CardTitle>
              <CardDescription>
                Confirme doses acima (ou em Meus medicamentos) para preencher o histórico.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="space-y-2">
            {history.map((log) => (
              <li key={log.id}>
                <Card className="border-zinc-800/90">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div>
                      <p className="font-medium text-zinc-100">
                        {log.medications?.name ?? "Medicamento removido"}
                      </p>
                      <p className="text-xs text-zinc-500">{log.medications?.dosage ?? "—"}</p>
                    </div>
                    <time className="font-mono text-xs text-zinc-400">
                      {new Date(log.taken_at).toLocaleString("pt-BR")}
                    </time>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
