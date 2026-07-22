import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { logMedicationTaken } from "@/app/actions/medications";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DailyDosesCard,
  type TodayLog,
  type TodaySnooze,
} from "@/components/medicacao/daily-doses-card";
import { MedicationScheduleSuggestion } from "@/components/medicacao/medication-schedule-suggestion";
import { startOfLocalDayISO } from "@/lib/time/local-day";
import type { Medication } from "@/types/database";
import { demoMedications, demoMedicationLogs } from "@/lib/demo/data";

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
            .select("medication_id, snoozed_until")
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

  return (
    <div className="mx-auto max-w-4xl space-y-8">
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
