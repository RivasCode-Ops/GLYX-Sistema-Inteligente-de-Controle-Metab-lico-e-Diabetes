import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { buildMedicalReportData } from "@/lib/audit/medical-report";
import { PrintButton } from "@/components/relatorio/print-button";

export const metadata = { title: "Relatório para o médico — GLYX" };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function fmtDateTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
}

export default async function RelatorioMedicoPage() {
  if (!isSupabaseConfigured()) notFound();
  const supabase = await createClient();
  if (!supabase) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  const tz = profile?.timezone || "America/Sao_Paulo";

  const report = await buildMedicalReportData(supabase, user.id);

  if (!report) {
    return (
      <main className="mx-auto max-w-xl px-5 py-16 text-center text-zinc-300">
        <h1 className="text-xl font-semibold text-zinc-100">Ainda não há relatório pra gerar</h1>
        <p className="mt-2 text-sm text-zinc-400">
          O relatório usa os números do resumo de risco. Gere um primeiro na Análise.
        </p>
        <Link
          href="/analise"
          className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Ir para a Análise
        </Link>
      </main>
    );
  }

  const m = report.audit.metrics;
  const hasMedGaps = report.medications.some(
    (med) => med.expectedDoses > 0 && med.loggedDoses / med.expectedDoses < 0.5
  );
  const coverageGap = m.daysWithGlucose < report.audit.window_days;

  const questions: string[] = [];
  if (report.hyperDays.length > 0) {
    const worst = [...report.hyperDays].sort((a, b) => b.peak - a.peak)[0];
    questions.push(
      `Diante da hiperglicemia registrada em ${report.hyperDays.length} dia(s) do período (pico de ${worst.peak} mg/dL em ${fmtDate(worst.day)}), há ajuste indicado no esquema atual?`
    );
  }
  if (hasMedGaps) {
    questions.push(
      "O app mostra poucas doses registradas para alguns medicamentos no período — isso reflete falha em registrar no app ou doses realmente não tomadas nesses horários?"
    );
  }
  if (coverageGap) {
    questions.push(
      `A cobertura de leitura de glicemia foi de ${m.daysWithGlucose} de ${report.audit.window_days} dias do período — há algo a ajustar no uso do sensor?`
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-[#16181c] print:px-0 print:py-0">
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 flex justify-end print:hidden">
          <PrintButton />
        </div>

        <h1 className="text-xl font-bold">Relatório de acompanhamento metabólico</h1>
        <p className="mt-0.5 text-[12.5px] text-zinc-600">
          {report.patientName ?? "Paciente"}
          {report.diabetesType ? ` · ${report.diabetesType}` : ""} · Gerado em{" "}
          {new Date(report.generatedAt).toLocaleDateString("pt-BR", { timeZone: tz })} a partir do app GLYX
        </p>

        <div className="mt-4 flex flex-wrap gap-4 rounded-xl border border-zinc-300 bg-zinc-50 p-4">
          <div className="min-w-[110px]">
            <div className="text-xl font-bold">{m.tirPercent != null ? `${m.tirPercent}%` : "—"}</div>
            <div className="text-[11px] uppercase tracking-wide text-zinc-600">
              Tempo no alvo ({report.targetMin}–{report.targetMax})
            </div>
          </div>
          <div className="min-w-[110px]">
            <div className="text-xl font-bold">{m.avgGlucose != null ? `${m.avgGlucose} mg/dL` : "—"}</div>
            <div className="text-[11px] uppercase tracking-wide text-zinc-600">Glicemia média</div>
          </div>
          <div className="min-w-[110px]">
            <div className="text-xl font-bold">{m.hypoCount}</div>
            <div className="text-[11px] uppercase tracking-wide text-zinc-600">
              Hipoglicemias (&lt;{report.targetMin})
            </div>
          </div>
          <div className="min-w-[110px]">
            <div className="text-xl font-bold">{m.hyperCount}</div>
            <div className="text-[11px] uppercase tracking-wide text-zinc-600">Leituras ≥250 mg/dL</div>
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          Período de referência: {fmtDate(report.audit.period_start)} a {fmtDate(report.audit.period_end)} (
          {report.audit.window_days} dias corridos).{" "}
          {coverageGap ? (
            <strong>
              Atenção: apenas {m.daysWithGlucose} desses {report.audit.window_days} dias tiveram leitura de
              sensor registrada ({m.readingCount} leituras no total) — os números acima refletem só os dias
              com dado.
            </strong>
          ) : (
            `Cobertura de sensor: ${m.daysWithGlucose} de ${report.audit.window_days} dias, ${m.readingCount} leituras.`
          )}
        </p>

        <h2 className="mt-5 border-b-2 border-zinc-900 pb-1 text-[13px] font-semibold uppercase tracking-wide text-zinc-800">
          Extremos glicêmicos
        </h2>
        {report.hyperDays.length === 0 && report.hypoDays.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">Nenhuma leitura fora da meta no período.</p>
        ) : (
          <table className="mt-2 w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-zinc-600">
                <th className="border-b border-zinc-300 py-1">Data</th>
                <th className="border-b border-zinc-300 py-1">Tipo</th>
                <th className="border-b border-zinc-300 py-1">Leituras fora da meta</th>
                <th className="border-b border-zinc-300 py-1">Primeiro horário</th>
                <th className="border-b border-zinc-300 py-1">Pico do dia</th>
              </tr>
            </thead>
            <tbody>
              {report.hyperDays.map((d) => (
                <tr key={`hyper-${d.day}`}>
                  <td className="border-b border-zinc-200 py-1">{fmtDate(d.day)}</td>
                  <td className="border-b border-zinc-200 py-1 font-medium text-[#a13b00]">Hiper (≥250)</td>
                  <td className="border-b border-zinc-200 py-1">{d.count}</td>
                  <td className="border-b border-zinc-200 py-1">{fmtDateTime(d.firstAt, tz)}</td>
                  <td className="border-b border-zinc-200 py-1">{d.peak} mg/dL</td>
                </tr>
              ))}
              {report.hypoDays.map((d) => (
                <tr key={`hypo-${d.day}`}>
                  <td className="border-b border-zinc-200 py-1">{fmtDate(d.day)}</td>
                  <td className="border-b border-zinc-200 py-1 font-medium text-[#0a63a8]">
                    Hipo (&lt;{report.targetMin})
                  </td>
                  <td className="border-b border-zinc-200 py-1">{d.count}</td>
                  <td className="border-b border-zinc-200 py-1">{fmtDateTime(d.firstAt, tz)}</td>
                  <td className="border-b border-zinc-200 py-1">{d.peak} mg/dL</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2 className="mt-5 border-b-2 border-zinc-900 pb-1 text-[13px] font-semibold uppercase tracking-wide text-zinc-800">
          Adesão à medicação (registrada no app)
        </h2>
        {report.medications.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">Nenhum medicamento com horário programado cadastrado.</p>
        ) : (
          <>
            <table className="mt-2 w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase text-zinc-600">
                  <th className="border-b border-zinc-300 py-1">Medicamento</th>
                  <th className="border-b border-zinc-300 py-1">Dose</th>
                  <th className="border-b border-zinc-300 py-1">Esperado ({report.audit.window_days}d)</th>
                  <th className="border-b border-zinc-300 py-1">Registrado no app</th>
                </tr>
              </thead>
              <tbody>
                {report.medications.map((med) => (
                  <tr key={med.name}>
                    <td className="border-b border-zinc-200 py-1">{med.name}</td>
                    <td className="border-b border-zinc-200 py-1">{med.dosage ?? "—"}</td>
                    <td className="border-b border-zinc-200 py-1">{med.expectedDoses}</td>
                    <td className="border-b border-zinc-200 py-1">{med.loggedDoses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              <strong>Importante:</strong> esta contagem é de doses registradas no aplicativo, não de doses
              confirmadamente tomadas ou não tomadas. Uma diferença grande entre esperado e registrado pode
              refletir falha em abrir o app pra registrar, não necessariamente a dose não aplicada.
            </div>
          </>
        )}

        <h2 className="mt-5 border-b-2 border-zinc-900 pb-1 text-[13px] font-semibold uppercase tracking-wide text-zinc-800">
          Fatores de estilo de vida (mesmo período)
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
          <div>
            <span className="text-zinc-600">Sono médio:</span>{" "}
            {m.avgSleepHours != null ? `${m.avgSleepHours} h/noite (${m.lowSleepDays} noites curtas)` : "sem dado registrado"}
          </div>
          <div>
            <span className="text-zinc-600">Dias com atividade física:</span> {m.activeDays} de{" "}
            {report.audit.window_days}
          </div>
          <div>
            <span className="text-zinc-600">Duração média do exercício:</span>{" "}
            {m.avgExerciseMin != null ? `~${m.avgExerciseMin} min` : "—"}
          </div>
          <div>
            <span className="text-zinc-600">Carboidrato médio/dia:</span>{" "}
            {m.avgCarbsPerDay != null ? `${m.avgCarbsPerDay} g` : "—"}
          </div>
          <div>
            <span className="text-zinc-600">Refeições com pico glicêmico associado:</span> {m.spikeMealCount}
          </div>
        </div>

        {questions.length > 0 ? (
          <>
            <h2 className="mt-5 border-b-2 border-zinc-900 pb-1 text-[13px] font-semibold uppercase tracking-wide text-zinc-800">
              Pontos para discutir na consulta
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px]">
              {questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </>
        ) : null}

        <div className="mt-6 rounded-lg border-2 border-zinc-900 bg-zinc-100 p-3 text-[12px]">
          <strong className="mb-0.5 block">Aviso importante</strong>
          Este relatório é gerado a partir de autorregistro do paciente e leituras de sensor de glicemia
          contínua, reunidos no aplicativo GLYX. Não é resultado de exame laboratorial, não foi revisado por
          profissional de saúde e não substitui avaliação clínica presencial. Os números de adesão à
          medicação refletem apenas o que foi registrado no aplicativo, não necessariamente o que foi
          efetivamente tomado.
        </div>
      </div>
    </main>
  );
}
