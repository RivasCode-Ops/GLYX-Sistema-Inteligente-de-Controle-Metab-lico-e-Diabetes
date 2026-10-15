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
import { formatarDataHora, formatarHora } from "@/lib/time/format";
import { destinoAposRegistro, lerConflito } from "@/lib/medications/conflito-registro";
import { FormularioDeAcao, type ResultadoDeAcao } from "@/components/medicacao/formulario-de-acao";
import { MENSAGENS_REGISTRO, type CodigoRegistro } from "@/lib/medications/register-dose";
import { consolidarRegistrosDeDose, marcacaoDoRegistro } from "@/lib/medications/tomadas";

// "Doses de hoje" = a tela de AGIR: o que tomar agora, marcar como tomada e o
// histórico recente (agenda fundida aqui). O cadastro, estoque, alarmes e
// edição foram para "Meus medicamentos" (/medicacao/medicamentos), separando
// a ação diária da gestão. Antes tudo isso vivia numa única tela de 539 linhas.
type HistoryRow = {
  id: string;
  medication_id?: string | null;
  taken_at: string;
  confirmed?: boolean;
  adherence_status?: string | null;
  /** Só existe depois da migration 20261015101000; o `select("*")` a traz quando houver. */
  correcoes?: unknown[] | null;
  medications: { name: string; dosage: string | null } | null;
};
type RawHistoryRow = Omit<HistoryRow, "medications"> & {
  medications: HistoryRow["medications"] | HistoryRow["medications"][];
};

export default async function MedicacaoDosesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const conflito = lerConflito(sp);
  const codigoErro = typeof sp.registro_erro === "string" && sp.registro_erro in MENSAGENS_REGISTRO
    ? (sp.registro_erro as CodigoRegistro)
    : null;
  let conflitoExistentes: { id: string; taken_at: string }[] = [];
  let conflitoNome: string | null = null;
  let meds: Medication[] = [];
  let todayLogs: TodayLog[] = [];
  let todaySnoozes: TodaySnooze[] = [];
  let history: HistoryRow[] = [];
  let timezone: string | null = null;
  const demoMode = !isSupabaseConfigured();

  async function logMedicationTakenAction(_anterior: ResultadoDeAcao, formData: FormData): Promise<ResultadoDeAcao> {
    "use server";
    // Conflito, falha, sessão expirada ou resposta à pergunta: a tela navega
    // para o destino (FormularioDeAcao). Sem `redirect()` depois da ação.
    const r = await logMedicationTaken(formData);
    const ir = destinoAposRegistro(r, Boolean(formData.get("intencao")), "/medicacao");
    return ir ? { ir } : null;
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
            .select("medication_id, taken_at, confirmed")
            .eq("user_id", user.id)
            .gte("taken_at", startOfDayISO),
          supabase
            .from("medication_snoozes")
            .select("medication_id, snoozed_until, scheduled_for")
            .eq("user_id", user.id)
            .gte("created_at", startOfDayISO),
          // `*`: traz `correcoes` quando a migration estiver aplicada, sem quebrar antes dela.
          supabase
            .from("medication_logs")
            .select("*, medications ( name, dosage )")
            .eq("user_id", user.id)
            .order("taken_at", { ascending: false })
            .limit(40),
        ]);
        if (conflito) {
          const [ex, med] = await Promise.all([
            supabase
              .from("medication_logs")
              .select("id, taken_at")
              .eq("user_id", user.id)
              .eq("medication_id", conflito.medicationId)
              .eq("scheduled_for", conflito.scheduledFor)
              .eq("confirmed", true)
              .order("taken_at", { ascending: true }),
            supabase.from("medications").select("name").eq("id", conflito.medicationId).eq("user_id", user.id).maybeSingle(),
          ]);
          conflitoExistentes = (ex.data ?? []) as { id: string; taken_at: string }[];
          conflitoNome = (med.data?.name as string | undefined) ?? null;
        }
        meds = (medsRes.data ?? []) as Medication[];
        todayLogs = (logsRes.data ?? []) as TodayLog[];
        todaySnoozes = (snoozesRes.data ?? []) as TodaySnooze[];
        // Repetição IDÊNTICA do histórico antigo aparece uma vez (D14); instantes
        // diferentes aparecem todos, com a marcação do que são.
        history = consolidarRegistrosDeDose(
          ((historyRes.data ?? []) as RawHistoryRow[]).map((log) => ({
            ...log,
            medications: Array.isArray(log.medications) ? log.medications[0] ?? null : log.medications,
          }))
        ).registros;
      }
    }
  }

  // Tiles e próxima dose saem da MESMA função que o card abaixo — a regra
  // única de casamento dose↔registro. Contar aqui por conta seria a terceira
  // contagem da mesma grandeza nesta tela.
  const resumo = resumirDosesDoDia(meds, todayLogs, todaySnoozes, timezone);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {codigoErro ? (
        <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {MENSAGENS_REGISTRO[codigoErro]}
        </p>
      ) : null}

      {conflito && conflitoExistentes.length > 0 ? (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle className="text-base">Já existe uma tomada registrada nesta dose</CardTitle>
            <CardDescription>
              {conflitoNome ?? "Este item"}: dose prevista das {formatarHora(conflito.scheduledFor, timezone)}, já registrada
              às {conflitoExistentes.map((e) => formatarHora(e.taken_at, timezone)).join(", ")}. Você pediu para registrar
              às {formatarHora(conflito.takenAtPedido, timezone)}. Nada foi gravado ainda — o que aconteceu?
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {conflitoExistentes.map((e) => (
              <FormularioDeAcao key={e.id} acao={logMedicationTakenAction}>
                <input type="hidden" name="medication_id" value={conflito.medicationId} />
                <input type="hidden" name="taken_at_iso" value={conflito.takenAtPedido} />
                <input type="hidden" name="intencao" value="corrigir" />
                <input type="hidden" name="alvo_id" value={e.id} />
                {conflito.pedido ? <input type="hidden" name="pedido" value={conflito.pedido} /> : null}
                <Button type="submit" size="sm" variant="outline">
                  Corrigir: a tomada das {formatarHora(e.taken_at, timezone)} foi às{" "}
                  {formatarHora(conflito.takenAtPedido, timezone)}
                </Button>
              </FormularioDeAcao>
            ))}
            <FormularioDeAcao acao={logMedicationTakenAction}>
              <input type="hidden" name="medication_id" value={conflito.medicationId} />
              <input type="hidden" name="taken_at_iso" value={conflito.takenAtPedido} />
              <input type="hidden" name="intencao" value="outra" />
              {conflito.pedido ? <input type="hidden" name="pedido" value={conflito.pedido} /> : null}
              <Button type="submit" size="sm" variant="outline">
                Foi outra tomada às {formatarHora(conflito.takenAtPedido, timezone)}
              </Button>
            </FormularioDeAcao>
            <Link href="/medicacao" className="self-center px-2 text-sm text-zinc-400 underline">
              Cancelar
            </Link>
          </CardContent>
        </Card>
      ) : null}

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
                <FormularioDeAcao acao={logMedicationTakenAction}>
                  <input type="hidden" name="medication_id" value={resumo.proxima.medicationId} />
                  {/* Identidade da ação: enviar o mesmo formulário de novo não cria outra tomada. */}
                  <input type="hidden" name="pedido" value={crypto.randomUUID()} />
                  <Button type="submit" size="sm">
                    Registrar agora
                  </Button>
                </FormularioDeAcao>
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
                        {marcacaoDoRegistro(log) ? (
                          <span className="ml-2 rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] font-normal text-zinc-400">
                            {marcacaoDoRegistro(log)}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-zinc-500">{log.medications?.dosage ?? "—"}</p>
                    </div>
                    <time className="font-mono text-xs text-zinc-400">
                      {formatarDataHora(log.taken_at)}
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
