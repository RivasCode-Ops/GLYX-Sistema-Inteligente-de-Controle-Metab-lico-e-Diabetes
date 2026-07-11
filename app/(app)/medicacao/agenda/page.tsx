import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { demoMedicationLogs } from "@/lib/demo/data";

type LogRow = {
  id: string;
  taken_at: string;
  medications: { name: string; dosage: string | null } | null;
};

type RawLogRow = Omit<LogRow, "medications"> & {
  medications: LogRow["medications"] | LogRow["medications"][];
};

export default async function MedicacaoAgendaPage() {
  let logs: LogRow[] = [];
  const demoMode = !isSupabaseConfigured();

  if (demoMode) {
    logs = demoMedicationLogs;
  } else {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("medication_logs")
          .select(
            `
            id,
            taken_at,
            medications ( name, dosage )
          `
          )
          .eq("user_id", user.id)
          .order("taken_at", { ascending: false })
          .limit(80);
        logs = ((data ?? []) as RawLogRow[]).map((log) => ({
          ...log,
          medications: Array.isArray(log.medications)
            ? log.medications[0] ?? null
            : log.medications,
        }));
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-zinc-400">
          Linha do tempo de doses confirmadas — complemento ao cadastro em{" "}
          <Link href="/medicacao" className="text-emerald-400 hover:underline">
            Medicação
          </Link>
          .
        </p>
      </div>

      {logs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nenhum registro</CardTitle>
            <CardDescription>
              Confirme doses na lista de medicamentos ativos para preencher esta agenda.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => (
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
  );
}
