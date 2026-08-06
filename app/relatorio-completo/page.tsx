import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { buildFullHistoryReport, type FullHistoryReport } from "@/lib/reports/full-history";
import { SEVERE_HYPER_MG_DL } from "@/lib/health/glucose-thresholds";
import { BODY_FIELDS, BODY_FIELD_BY_KEY, isBodyMeasurementKey } from "@/lib/body/fields";
import { METHOD_LABEL, waistToHeightBand } from "@/lib/body/composition";
import { progressSummary, type ProgressTone } from "@/lib/body/progress";
import { projectionMessage } from "@/lib/body/goals";
import { MUSCLE_GROUP_BY_ID, resolveMuscleGroupIds } from "@/lib/data/muscle-groups";
import { INTENSITY_LEVELS, activityTypeLabel } from "@/lib/data/activity-types";
import { ACTIVITY_LABEL, GOAL_LABEL, type ActivityLevel, type BodyGoal } from "@/lib/health/energy";
import { EXAM_TYPE_LABEL, parseExamType } from "@/lib/exams/types";
import { PrintButton } from "@/components/relatorio/print-button";

export const metadata = { title: "Diário completo — GLYX" };

/**
 * Diário completo: todo registro do usuário, do primeiro dia até hoje.
 *
 * Convive com `/relatorio-medico` de propósito e não o substitui: aquele é o
 * resumo de janela curta que um médico lê em 90s; este é o arquivo integral,
 * para o usuário guardar ou entregar quando pedem o histórico inteiro. Mesma
 * mecânica de saída dos dois — HTML com CSS de impressão e "Salvar como PDF" do
 * navegador, sem biblioteca de PDF no servidor.
 */

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

/** Data já vinda como YYYY-MM-DD (dia local calculado no builder) — parseia em
 * UTC para não deslocar um dia ao renderizar. */
function fmtDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function fmtDayShort(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
  });
}

function fmtDateTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function num(value: number | null | undefined, suffix = ""): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Number(value)}${suffix}`;
}

function intensityLabel(raw: string | null): string {
  if (!raw) return "—";
  return INTENSITY_LEVELS.find((i) => i.id === raw)?.label ?? raw;
}

function muscleLabels(groups: string[] | null): string {
  if (!groups?.length) return "—";
  const ids = groups.flatMap((g) => resolveMuscleGroupIds(g));
  if (ids.length === 0) return groups.join(", ");
  return [...new Set(ids)].map((id) => MUSCLE_GROUP_BY_ID[id].label).join(", ");
}

// ---------------------------------------------------------------------------
// Blocos visuais
// ---------------------------------------------------------------------------

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="border-b-2 border-zinc-900 pb-1 text-[13px] font-semibold uppercase tracking-wide text-zinc-800">
        {title}
        {count != null ? <span className="ml-2 font-normal text-zinc-500">({count})</span> : null}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[13px] italic text-zinc-500">{children}</p>;
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <table className="mt-2 w-full border-collapse text-[12px]">
      <thead>
        <tr className="text-left text-[10.5px] uppercase text-zinc-600">
          {head.map((h) => (
            <th key={h} className="border-b border-zinc-300 py-1 pr-2 align-bottom font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`border-b border-zinc-200 py-1 pr-2 align-top ${className}`}>{children}</td>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-[104px]">
      <div className="text-lg font-bold leading-tight">{value}</div>
      <div className="text-[10.5px] uppercase tracking-wide text-zinc-600">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seções de conteúdo
// ---------------------------------------------------------------------------

/** Quantas colunas de data cabem na tabela transposta de medidas antes de
 * estourar a largura da folha. Acima disso mostramos as mais recentes e
 * dizemos quantas ficaram de fora — corte silencioso num relatório
 * "completo" seria pior que o corte em si. */
const MAX_MEASUREMENT_COLUMNS = 8;

function MeasurementsTable({ report }: { report: FullHistoryReport }) {
  const all = report.measurements;
  const shown = all.slice(-MAX_MEASUREMENT_COLUMNS);
  const omitted = all.length - shown.length;

  // Só campos que o usuário preencheu ao menos uma vez — as 21 linhas fixas
  // deixariam a tabela quase toda vazia.
  const fields = BODY_FIELDS.filter((f) =>
    shown.some((m) => {
      const v = m[f.key];
      return typeof v === "number" && Number.isFinite(v);
    })
  );

  if (fields.length === 0) return <Empty>Nenhuma medida preenchida.</Empty>;

  return (
    <>
      {omitted > 0 ? (
        <p className="mt-2 text-[11.5px] text-zinc-600">
          Mostrando as {shown.length} medições mais recentes; {omitted} anterior(es) ficaram fora por
          largura da página.
        </p>
      ) : null}
      <Table head={["Medida", ...shown.map((m) => fmtDayShort(m.measured_on))]}>
        {fields.map((f) => (
          <tr key={f.key}>
            <Td className="font-medium">
              {f.label} <span className="text-zinc-500">({f.unit})</span>
            </Td>
            {shown.map((m) => {
              const v = m[f.key];
              return (
                <Td key={`${f.key}-${m.measured_on}`}>
                  {typeof v === "number" && Number.isFinite(v) ? v : "—"}
                </Td>
              );
            })}
          </tr>
        ))}
      </Table>
      {shown.some((m) => m.notes) ? (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[11.5px] text-zinc-600">
          {shown
            .filter((m) => m.notes)
            .map((m) => (
              <li key={`note-${m.measured_on}`}>
                <strong>{fmtDay(m.measured_on)}:</strong> {m.notes}
              </li>
            ))}
        </ul>
      ) : null}
    </>
  );
}

/** Impresso em preto e branco a cor some, então o veredito também carrega
 * palavra e borda — nunca só o tom. */
const TONE_BOX: Record<ProgressTone, string> = {
  otimo: "border-emerald-700 bg-emerald-50",
  bom: "border-emerald-600 bg-emerald-50/60",
  atencao: "border-amber-600 bg-amber-50",
  neutro: "border-zinc-400 bg-zinc-50",
};

function ProgressBlock({
  progress,
  caption,
}: {
  progress: NonNullable<FullHistoryReport["body"]["progress"]>;
  caption: string;
}) {
  return (
    <div className={`mt-2 break-inside-avoid rounded-lg border-2 p-3 ${TONE_BOX[progress.verdict.tone]}`}>
      <div className="text-[10.5px] uppercase tracking-wide text-zinc-600">{caption}</div>
      <div className="mt-0.5 text-[15px] font-bold">{progress.verdict.headline}</div>
      <p className="mt-1 text-[12.5px] leading-5">{progress.verdict.detail}</p>
      <p className="mt-1.5 text-[12px] font-medium">{progressSummary(progress)}</p>
      {!progress.splitIsEstimated ? (
        <p className="mt-1.5 text-[11.5px] text-zinc-700">
          A divisão em quilos de músculo e de gordura não pôde ser calculada neste intervalo: ela exige
          percentual de gordura estimado pelo <strong>mesmo método</strong> nas duas datas. Faltou a
          medida necessária (pescoço, para o método de circunferências; as três dobras do protocolo,
          para o de dobras) em pelo menos uma delas.
        </p>
      ) : null}
    </div>
  );
}

function ExamSummaryText({ parsed }: { parsed: unknown }) {
  if (!parsed || typeof parsed !== "object") return <>—</>;
  const summary = (parsed as { summary?: unknown }).summary;
  return <>{typeof summary === "string" && summary ? summary : "—"}</>;
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default async function RelatorioCompletoPage() {
  if (!isSupabaseConfigured()) notFound();
  const supabase = await createClient();
  if (!supabase) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const report = await buildFullHistoryReport(supabase, user.id);
  const { profile: p, glucose: g, body: b } = report;
  const tz = p.timezone;

  const latestComposition = b.compositions[b.compositions.length - 1]?.composition ?? null;
  const waistBand = waistToHeightBand(latestComposition?.waistToHeight ?? null);

  const totalRecords =
    (g.overall?.count ?? 0) +
    report.meals.length +
    report.water.reduce((acc, d) => acc + d.kinds.reduce((s, k) => s + k.count, 0), 0) +
    report.medicationLogCount +
    report.insulin.length +
    report.exercises.length +
    report.strength.length +
    report.weights.length +
    report.measurements.length +
    report.pressure.length +
    report.exams.length;

  if (!report.firstDay) {
    return (
      <main className="mx-auto max-w-xl px-5 py-16 text-center">
        <h1 className="text-xl font-semibold">Ainda não há nada para relatar</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Este relatório reúne tudo que você registrou. Assim que houver o primeiro registro —
          glicemia, refeição, dose, treino ou medida — ele passa a ser gerado.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-[#16181c] print:px-0 print:py-0">
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 flex justify-end print:hidden">
          <PrintButton />
        </div>

        <h1 className="text-xl font-bold">Diário metabólico completo</h1>
        <p className="mt-0.5 text-[12.5px] text-zinc-600">
          {p.fullName ?? p.email ?? "Paciente"}
          {p.diabetesType ? ` · ${p.diabetesType}` : ""} · Período de{" "}
          <strong>{fmtDay(report.firstDay)}</strong> a <strong>{fmtDay(report.lastDay)}</strong> (
          {report.totalDays} dias corridos) · Gerado em{" "}
          {new Date(report.generatedAt).toLocaleString("pt-BR", { timeZone: tz })} pelo app GLYX
        </p>

        {g.demoCount > 0 ? (
          <div className="mt-3 rounded-lg border-2 border-amber-500 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">
            <strong>Atenção — dados de demonstração na conta.</strong> Foram encontradas{" "}
            {g.demoCount} leituras de glicemia com origem <em>demonstração</em> (semente de teste do
            app, não medição real). Elas estão <strong>excluídas</strong> de todos os números deste
            relatório, que considera apenas as {g.overall?.count ?? 0} leituras de sensor ou digitadas.
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 rounded-xl border border-zinc-300 bg-zinc-50 p-4">
          <Stat value={String(totalRecords)} label="Registros no total" />
          <Stat value={String(report.totalDays)} label="Dias de acompanhamento" />
          <Stat value={String(g.overall?.count ?? 0)} label="Leituras de glicemia" />
          <Stat value={String(report.meals.length)} label="Refeições" />
          <Stat value={String(report.medicationLogCount)} label="Doses registradas" />
          <Stat value={String(report.exercises.length)} label="Sessões de exercício" />
        </div>

        {/* ---------------------------------------------------------------- */}
        <Section title="Perfil e metas">
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[12.5px]">
            <div>
              <span className="text-zinc-600">Sexo:</span>{" "}
              {p.sex === "m" ? "Masculino" : p.sex === "f" ? "Feminino" : "—"}
            </div>
            <div>
              <span className="text-zinc-600">Ano de nascimento:</span> {num(p.birthYear)}
            </div>
            <div>
              <span className="text-zinc-600">Altura:</span> {num(p.heightCm, " cm")}
            </div>
            <div>
              <span className="text-zinc-600">Nível de atividade:</span>{" "}
              {p.activityLevel && p.activityLevel in ACTIVITY_LABEL
                ? ACTIVITY_LABEL[p.activityLevel as ActivityLevel]
                : "—"}
            </div>
            <div>
              <span className="text-zinc-600">Objetivo corporal:</span>{" "}
              {p.bodyGoal && p.bodyGoal in GOAL_LABEL ? GOAL_LABEL[p.bodyGoal as BodyGoal] : "—"}
            </div>
            <div>
              <span className="text-zinc-600">Peso-alvo:</span> {num(p.targetWeightKg, " kg")}
            </div>
            <div>
              <span className="text-zinc-600">Faixa-alvo de glicemia:</span> {report.targetMin}–
              {report.targetMax} mg/dL
            </div>
            <div>
              <span className="text-zinc-600">Fuso do registro:</span> {tz}
            </div>
            <div>
              <span className="text-zinc-600">Razão carboidrato/insulina:</span> {num(p.carbRatio)}
            </div>
            <div>
              <span className="text-zinc-600">Fator de correção:</span> {num(p.correctionFactor)}
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section title="Glicemia — consolidado do período">
          {g.overall ? (
            <>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-3">
                <Stat value={`${g.overall.tirPercent}%`} label="Tempo no alvo" />
                <Stat value={`${g.overall.avg} mg/dL`} label="Média geral" />
                <Stat value={`${g.overall.min}`} label="Menor leitura" />
                <Stat value={`${g.overall.max}`} label="Maior leitura" />
                <Stat value={String(g.overall.below)} label={`Abaixo de ${report.targetMin}`} />
                <Stat value={String(g.overall.above)} label={`Acima de ${report.targetMax}`} />
                <Stat value={String(g.overall.severe)} label={`≥ ${SEVERE_HYPER_MG_DL} mg/dL`} />
              </div>
              <p className="mt-2 text-[11.5px] text-zinc-600">
                {g.overall.count} leituras em {g.overall.daysWithData} de {report.totalDays} dias do
                período. Origem:{" "}
                {g.bySource.map((s) => `${s.label} (${s.count})`).join(", ")}.
              </p>
            </>
          ) : (
            <Empty>Nenhuma leitura de glicemia registrada.</Empty>
          )}
        </Section>

        <Section title="Glicemia — dia a dia" count={g.days.length}>
          {g.days.length === 0 ? (
            <Empty>Nenhum dia com leitura.</Empty>
          ) : (
            <>
              <p className="mt-2 text-[11.5px] text-zinc-600">
                O sensor grava a cada poucos minutos; listar leitura por leitura tornaria este
                documento ilegível. Cada linha resume um dia — os eventos individuais de hipo e
                hiperglicemia severa estão na seção seguinte.
              </p>
              <Table
                head={["Dia", "Leituras", "Mínima", "Média", "Máxima", "No alvo", "Abaixo", "Acima", `≥${SEVERE_HYPER_MG_DL}`]}
              >
                {g.days.map((d) => (
                  <tr key={d.day}>
                    <Td className="whitespace-nowrap">{fmtDay(d.day)}</Td>
                    <Td>{d.count}</Td>
                    <Td>{d.min}</Td>
                    <Td className="font-medium">{d.avg}</Td>
                    <Td>{d.max}</Td>
                    <Td>{d.tirPercent}%</Td>
                    <Td className={d.below > 0 ? "font-medium text-[#0a63a8]" : ""}>{d.below}</Td>
                    <Td className={d.above > 0 ? "font-medium text-[#a13b00]" : ""}>{d.above}</Td>
                    <Td className={d.severe > 0 ? "font-medium text-[#a13b00]" : ""}>{d.severe}</Td>
                  </tr>
                ))}
              </Table>
            </>
          )}
        </Section>

        <Section title="Glicemia — eventos individuais" count={g.events.length}>
          {g.events.length === 0 ? (
            <Empty>
              Nenhuma hipoglicemia (&lt;{report.targetMin} mg/dL) nem hiperglicemia severa (≥
              {SEVERE_HYPER_MG_DL} mg/dL) no período.
            </Empty>
          ) : (
            <Table head={["Data e hora", "Tipo", "Valor"]}>
              {/* Listas estáticas renderizadas no servidor, nunca reordenadas nem
                  filtradas no cliente: o índice é chave estável. Timestamp não
                  serve — dois registros podem cair no mesmo instante. */}
              {g.events.map((e, i) => (
                <tr key={i}>
                  <Td className="whitespace-nowrap">{fmtDateTime(e.recordedAt, tz)}</Td>
                  <Td
                    className={
                      e.kind === "hipo" ? "font-medium text-[#0a63a8]" : "font-medium text-[#a13b00]"
                    }
                  >
                    {e.kind === "hipo" ? "Hipoglicemia" : "Hiperglicemia severa"}
                  </Td>
                  <Td>{e.value} mg/dL</Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section title="Alimentação — todas as refeições" count={report.meals.length}>
          {report.meals.length === 0 ? (
            <Empty>Nenhuma refeição registrada.</Empty>
          ) : (
            <Table
              head={["Data e hora", "Refeição", "kcal", "Carb (g)", "Prot (g)", "Gord (g)", "CG", "Pico"]}
            >
              {report.meals.map((m, i) => (
                <tr key={i}>
                  <Td className="whitespace-nowrap">{fmtDateTime(m.eaten_at, tz)}</Td>
                  <Td>
                    {m.name ?? "—"}
                    {m.photo_path ? <span className="text-zinc-500"> 📷</span> : null}
                    {m.notes ? (
                      <div className="text-[11px] italic text-zinc-500">{m.notes}</div>
                    ) : null}
                  </Td>
                  <Td>{num(m.calories)}</Td>
                  <Td>{num(m.carbs_g)}</Td>
                  <Td>{num(m.protein_g)}</Td>
                  <Td>{num(m.fat_g)}</Td>
                  <Td>{num(m.glycemic_load_estimate)}</Td>
                  <Td className={m.glucose_spike ? "font-medium text-[#a13b00]" : ""}>
                    {m.glucose_spike ? "sim" : "—"}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section title="Medicamentos e suplementos cadastrados" count={report.medications.length}>
          {report.medications.length === 0 ? (
            <Empty>Nenhum medicamento ou suplemento cadastrado.</Empty>
          ) : (
            <Table head={["Nome", "Tipo", "Dose", "Horários", "Estoque", "Situação", "Cadastrado em"]}>
              {report.medications.map((m) => (
                <tr key={m.id}>
                  <Td className="font-medium">
                    {m.name}
                    {m.notes ? (
                      <div className="text-[11px] italic text-zinc-500">{m.notes}</div>
                    ) : null}
                  </Td>
                  <Td>{m.kind === "supplement" ? "Suplemento" : "Medicamento"}</Td>
                  <Td>{m.dosage ?? "—"}</Td>
                  <Td>{m.reminder_times?.length ? m.reminder_times.join(", ") : m.schedule_hint ?? "—"}</Td>
                  <Td>{num(m.stock_units)}</Td>
                  <Td>{m.active === false ? "Inativo" : "Ativo"}</Td>
                  <Td className="whitespace-nowrap">{fmtDateTime(m.created_at, tz)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section title="Doses registradas, dia a dia" count={report.medicationLogCount}>
          {report.medicationLogDays.length === 0 ? (
            <Empty>Nenhuma dose registrada.</Empty>
          ) : (
            <>
              <Table head={["Dia", "Doses registradas"]}>
                {report.medicationLogDays.map((d) => (
                  <tr key={d.day}>
                    <Td className="whitespace-nowrap font-medium">{fmtDay(d.day)}</Td>
                    <Td>
                      {d.entries
                        .map((e) => `${fmtTime(e.takenAt, tz)} ${e.name}`)
                        .join(" · ")}
                    </Td>
                  </tr>
                ))}
              </Table>
              <div className="mt-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900">
                <strong>Importante:</strong> esta é a lista de doses <em>registradas no aplicativo</em>,
                não de doses comprovadamente tomadas. Ausência de registro pode significar dose não
                tomada ou apenas esquecimento de registrar.
              </div>
            </>
          )}
        </Section>

        <Section title="Insulina" count={report.insulin.length}>
          {report.insulin.length === 0 ? (
            <Empty>Nenhuma aplicação de insulina registrada.</Empty>
          ) : (
            <Table head={["Data e hora", "Unidades", "Tipo", "Motivo", "Glicemia no momento", "Obs."]}>
              {report.insulin.map((i, idx) => (
                <tr key={idx}>
                  <Td className="whitespace-nowrap">{fmtDateTime(i.applied_at, tz)}</Td>
                  <Td className="font-medium">{num(i.units, " U")}</Td>
                  <Td>{i.insulin_kind ?? "—"}</Td>
                  <Td>{i.reason ?? "—"}</Td>
                  <Td>{num(i.glucose_mg_dl, " mg/dL")}</Td>
                  <Td>{i.notes ?? "—"}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section title="Exercício — sessões" count={report.exercises.length}>
          {report.exercises.length === 0 ? (
            <Empty>Nenhuma sessão de exercício registrada.</Empty>
          ) : (
            <Table
              head={["Data e hora", "Atividade", "Tipo", "Duração", "Intensidade", "Grupos musculares", "kcal"]}
            >
              {report.exercises.map((e, i) => (
                <tr key={i}>
                  <Td className="whitespace-nowrap">{fmtDateTime(e.started_at, tz)}</Td>
                  <Td>
                    {e.label ?? "—"}
                    {e.notes ? <div className="text-[11px] italic text-zinc-500">{e.notes}</div> : null}
                  </Td>
                  <Td>{activityTypeLabel(e.activity_type) ?? "—"}</Td>
                  <Td>{num(e.duration_min, " min")}</Td>
                  <Td>{intensityLabel(e.intensity)}</Td>
                  <Td>{muscleLabels(e.muscle_groups)}</Td>
                  <Td>{num(e.calories_burned)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section title="Exercício — cargas registradas" count={report.strength.length}>
          {report.strength.length === 0 ? (
            <Empty>Nenhuma carga registrada.</Empty>
          ) : (
            <Table head={["Data e hora", "Exercício", "Grupo", "Carga", "Séries", "Repetições"]}>
              {report.strength.map((s, i) => (
                <tr key={i}>
                  <Td className="whitespace-nowrap">{fmtDateTime(s.logged_at, tz)}</Td>
                  <Td className="font-medium">{s.exercise_name}</Td>
                  <Td>{muscleLabels(s.muscle_group ? [s.muscle_group] : null)}</Td>
                  <Td>{num(s.weight_kg, " kg")}</Td>
                  <Td>{num(s.sets)}</Td>
                  <Td>{num(s.reps)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        {report.musclePauses.length > 0 ? (
          <Section title="Pausas de grupo muscular" count={report.musclePauses.length}>
            <Table head={["Grupo", "Motivo", "Pausado em", "Retomado em"]}>
              {report.musclePauses.map((mp, i) => (
                <tr key={i}>
                  <Td>{muscleLabels([mp.muscle_group])}</Td>
                  <Td>{mp.reason ?? "—"}</Td>
                  <Td className="whitespace-nowrap">{fmtDateTime(mp.paused_at, tz)}</Td>
                  <Td className="whitespace-nowrap">
                    {mp.resumed_at ? fmtDateTime(mp.resumed_at, tz) : "em pausa"}
                  </Td>
                </tr>
              ))}
            </Table>
          </Section>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        <Section title="Peso e composição corporal">
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-3">
            <Stat
              value={b.weightFirst ? `${b.weightFirst.kg} kg` : "—"}
              label={b.weightFirst ? `Peso em ${fmtDayShort(b.weightFirst.day)}` : "Peso inicial"}
            />
            <Stat
              value={b.weightLast ? `${b.weightLast.kg} kg` : "—"}
              label={b.weightLast ? `Peso em ${fmtDayShort(b.weightLast.day)}` : "Peso atual"}
            />
            <Stat
              value={
                b.weightDeltaKg == null
                  ? "—"
                  : `${b.weightDeltaKg > 0 ? "+" : ""}${b.weightDeltaKg} kg`
              }
              label="Variação no período"
            />
            <Stat value={num(latestComposition?.bmi)} label="IMC atual" />
            <Stat
              value={
                latestComposition?.bodyFatPercent != null
                  ? `${latestComposition.bodyFatPercent}%`
                  : "—"
              }
              label="Gordura estimada"
            />
            <Stat value={num(latestComposition?.leanMassKg, " kg")} label="Massa magra" />
            <Stat value={num(latestComposition?.fatMassKg, " kg")} label="Massa gorda" />
          </div>

          {waistBand ? (
            <p className="mt-2 text-[12px]">
              <span className="text-zinc-600">Cintura ÷ altura:</span>{" "}
              <strong>{latestComposition?.waistToHeight}</strong> — {waistBand.label}. Referência:
              manter a cintura abaixo de metade da altura.
            </p>
          ) : null}

          {b.weightTargetConflict ? (
            <div className="mt-2 rounded-lg border-2 border-amber-500 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">
              <strong>Metas de peso em conflito.</strong> O perfil traz{" "}
              {b.weightTargetConflict.profileKg} kg como peso-alvo, e a meta corporal cadastrada pede{" "}
              {b.weightTargetConflict.goalKg} kg. São dois números incompatíveis apontando direções
              opostas — vale corrigir um dos dois no app para que o progresso pare de ser medido contra
              alvos que se contradizem.
            </div>
          ) : null}

          {b.progress ? (
            <ProgressBlock
              progress={b.progress}
              caption={`Da primeira à última medição · ${fmtDay(b.progress.fromDate)} a ${fmtDay(b.progress.toDate)} (${b.progress.days} dias)`}
            />
          ) : (
            <Empty>
              É necessária mais de uma medição corporal para calcular evolução. Registre uma nova em
              Composição › Medidas.
            </Empty>
          )}

          {b.comparableProgress ? (
            <ProgressBlock
              progress={b.comparableProgress}
              caption={`Maior intervalo com divisão músculo/gordura confiável · ${fmtDay(b.comparableProgress.fromDate)} a ${fmtDay(b.comparableProgress.toDate)} (${b.comparableProgress.days} dias)`}
            />
          ) : null}

          {b.compositions.length > 0 ? (
            <>
              <h3 className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-zinc-700">
                Composição estimada em cada medição
              </h3>
              <Table
                head={["Data", "Peso", "IMC", "Cint./alt.", "% gordura", "Método", "Gorda", "Magra", "FFMI"]}
              >
                {b.compositions.map((c, i) => (
                  <tr key={i}>
                    <Td className="whitespace-nowrap">{fmtDay(c.measuredOn)}</Td>
                    <Td>{num(c.composition.weightKg, " kg")}</Td>
                    <Td>{num(c.composition.bmi)}</Td>
                    <Td>{num(c.composition.waistToHeight)}</Td>
                    <Td className="font-medium">
                      {c.composition.bodyFatPercent != null ? `${c.composition.bodyFatPercent}%` : "—"}
                    </Td>
                    <Td className="text-[11px]">
                      {c.composition.bodyFatMethod ? METHOD_LABEL[c.composition.bodyFatMethod] : "—"}
                    </Td>
                    <Td>{num(c.composition.fatMassKg, " kg")}</Td>
                    <Td>{num(c.composition.leanMassKg, " kg")}</Td>
                    <Td>{num(c.composition.ffmi)}</Td>
                  </tr>
                ))}
              </Table>
              <p className="mt-1.5 text-[11.5px] text-zinc-600">
                Nenhuma fórmula de fita ou dobra <em>mede</em> gordura — todas inferem por equação de
                regressão, com erro de ~3-4 pontos percentuais. O uso correto é acompanhar a tendência
                da mesma pessoa medida do mesmo jeito, não comparar o número absoluto com exame
                (DEXA/bioimpedância) nem com outra pessoa. Linhas com método diferente não são
                comparáveis entre si.
              </p>
            </>
          ) : null}

          {b.progress && b.progress.deltas.length > 0 ? (
            <>
              <h3 className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-zinc-700">
                Variação de cada medida no período
              </h3>
              <Table head={["Medida", "De", "Para", "Variação", "Leitura"]}>
                {b.progress.deltas.map((d, i) => (
                  <tr key={i}>
                    <Td className="font-medium">
                      {d.label} <span className="text-zinc-500">({d.unit})</span>
                    </Td>
                    <Td>{d.from}</Td>
                    <Td>{d.to}</Td>
                    <Td className="font-medium">
                      {d.delta > 0 ? "+" : ""}
                      {d.delta}
                    </Td>
                    <Td className="text-[11.5px]">
                      {d.withinNoise
                        ? "dentro da margem de erro"
                        : d.direction === "up"
                          ? "aumentou"
                          : "reduziu"}
                    </Td>
                  </tr>
                ))}
              </Table>
              <p className="mt-1.5 text-[11.5px] text-zinc-600">
                Fita métrica erra ~1 cm entre medições da mesma pessoa no mesmo dia; o peso oscila 1-2
                kg por água, sal e intestino. Variação abaixo desse piso é lida como estável, não como
                evolução.
              </p>
            </>
          ) : null}
        </Section>

        <Section title="Peso registrado" count={report.weights.length}>
          {report.weights.length === 0 ? (
            <Empty>Nenhum peso registrado.</Empty>
          ) : (
            <Table head={["Data", "Peso"]}>
              {report.weights.map((w, i) => (
                <tr key={i}>
                  <Td className="whitespace-nowrap">{fmtDay(w.logged_on)}</Td>
                  <Td className="font-medium">{num(w.weight_kg, " kg")}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section title="Medidas corporais" count={report.measurements.length}>
          {report.measurements.length === 0 ? (
            <Empty>Nenhuma medida corporal registrada.</Empty>
          ) : (
            <MeasurementsTable report={report} />
          )}
        </Section>

        <Section title="Metas corporais e progresso" count={report.bodyGoals.length}>
          {b.goalProgress.length === 0 ? (
            report.bodyGoals.length === 0 ? (
              <Empty>Nenhuma meta corporal definida.</Empty>
            ) : (
              <Table head={["Medida", "Partida", "Meta", "Prazo"]}>
                {report.bodyGoals.map((goal, i) => (
                  <tr key={i}>
                    <Td className="font-medium">
                      {isBodyMeasurementKey(goal.metric)
                        ? BODY_FIELD_BY_KEY[goal.metric].label
                        : goal.metric}
                    </Td>
                    <Td>{num(goal.start_value)}</Td>
                    <Td>{num(goal.target_value)}</Td>
                    <Td className="whitespace-nowrap">
                      {goal.target_date ? fmtDay(goal.target_date) : "—"}
                    </Td>
                  </tr>
                ))}
              </Table>
            )
          ) : (
            <>
              <Table head={["Medida", "Partida", "Atual", "Meta", "Falta", "Andado", "Ritmo"]}>
                {b.goalProgress.map((goal, i) => (
                  <tr key={i}>
                    <Td className="font-medium">{goal.label}</Td>
                    <Td>{num(goal.start, ` ${goal.unit}`)}</Td>
                    <Td className="font-medium">{num(goal.current, ` ${goal.unit}`)}</Td>
                    <Td>
                      {goal.target} {goal.unit}
                    </Td>
                    <Td>
                      {goal.achieved ? (
                        <span className="font-medium text-[#0a6b2f]">atingida</span>
                      ) : (
                        num(goal.remaining, ` ${goal.unit}`)
                      )}
                    </Td>
                    <Td>{goal.progressPercent != null ? `${goal.progressPercent}%` : "—"}</Td>
                    <Td>
                      {goal.ratePerWeek != null ? `${goal.ratePerWeek} ${goal.unit}/sem` : "—"}
                    </Td>
                  </tr>
                ))}
              </Table>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[11.5px] leading-5">
                {b.goalProgress.map((goal, i) => (
                  <li key={i}>
                    <strong>{goal.label}:</strong> {projectionMessage(goal)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section title="Pressão arterial" count={report.pressure.length}>
          {report.pressure.length === 0 ? (
            <Empty>Nenhuma aferição de pressão registrada.</Empty>
          ) : (
            <Table head={["Data e hora", "Sistólica", "Diastólica", "Pulso", "Obs."]}>
              {report.pressure.map((b, i) => (
                <tr key={i}>
                  <Td className="whitespace-nowrap">{fmtDateTime(b.recorded_at, tz)}</Td>
                  <Td className="font-medium">{b.systolic}</Td>
                  <Td className="font-medium">{b.diastolic}</Td>
                  <Td>{num(b.pulse)}</Td>
                  <Td>{b.notes ?? "—"}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section title="Hidratação e bebidas, dia a dia" count={report.water.length}>
          {report.water.length === 0 ? (
            <Empty>Nenhum registro de bebida.</Empty>
          ) : (
            <Table head={["Dia", "Hidratação", "Total", "Detalhe"]}>
              {report.water.map((d) => (
                <tr key={d.day}>
                  <Td className="whitespace-nowrap">{fmtDay(d.day)}</Td>
                  <Td className="font-medium">{d.hydratingMl} ml</Td>
                  <Td>{d.totalMl} ml</Td>
                  <Td>{d.kinds.map((k) => `${k.label} ${k.ml}ml (${k.count}x)`).join(" · ")}</Td>
                </tr>
              ))}
            </Table>
          )}
          <p className="mt-1.5 text-[11.5px] text-zinc-600">
            Só água, água com gás e chá contam como hidratação; café e refrigerante diet são
            registrados mas não somam na meta.
          </p>
        </Section>

        <Section title="Exames" count={report.exams.length}>
          {report.exams.length === 0 ? (
            <Empty>Nenhum exame registrado.</Empty>
          ) : (
            <Table head={["Data", "Título", "Modalidade", "Laboratório", "Resumo"]}>
              {report.exams.map((e, i) => (
                <tr key={i}>
                  <Td className="whitespace-nowrap">{fmtDateTime(e.created_at, tz)}</Td>
                  <Td className="font-medium">{e.title ?? "—"}</Td>
                  <Td>{EXAM_TYPE_LABEL[parseExamType(e.exam_type)]}</Td>
                  <Td>{e.lab_name ?? "—"}</Td>
                  <Td>
                    <ExamSummaryText parsed={e.parsed_summary} />
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section title="Passos, sono e batimentos" count={report.snapshots.length}>
          {report.snapshots.length === 0 ? (
            <Empty>
              Nenhum dado de wearable sincronizado. Conecte Google Fit ou Apple Health em Conexões.
            </Empty>
          ) : (
            <Table head={["Dia", "Origem", "Passos", "Sono", "FC repouso", "kcal ativas"]}>
              {report.snapshots.map((s, i) => (
                <tr key={i}>
                  <Td className="whitespace-nowrap">{fmtDay(s.snapshot_date)}</Td>
                  <Td>{s.source ?? "—"}</Td>
                  <Td>{num(s.steps)}</Td>
                  <Td>{num(s.sleep_hours, " h")}</Td>
                  <Td>{num(s.resting_hr, " bpm")}</Td>
                  <Td>{num(s.active_calories)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section title="Alertas gerados pelo app" count={report.alerts.length}>
          {report.alerts.length === 0 ? (
            <Empty>Nenhum alerta gerado.</Empty>
          ) : (
            <Table head={["Data e hora", "Gravidade", "Alerta", "Lido"]}>
              {report.alerts.map((a, i) => (
                <tr key={i}>
                  <Td className="whitespace-nowrap">{fmtDateTime(a.created_at, tz)}</Td>
                  <Td
                    className={
                      a.severity === "critical"
                        ? "font-medium text-[#a13b00]"
                        : a.severity === "warning"
                          ? "font-medium text-[#8a6100]"
                          : ""
                    }
                  >
                    {a.severity === "critical"
                      ? "Crítico"
                      : a.severity === "warning"
                        ? "Atenção"
                        : "Informativo"}
                  </Td>
                  <Td>
                    <strong>{a.title ?? "—"}</strong>
                    {a.body ? <div className="text-[11.5px] text-zinc-600">{a.body}</div> : null}
                  </Td>
                  <Td className="whitespace-nowrap">{a.read_at ? "sim" : "não"}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        {/* ---------------------------------------------------------------- */}
        <div className="mt-8 break-inside-avoid rounded-lg border-2 border-zinc-900 bg-zinc-100 p-3 text-[11.5px]">
          <strong className="mb-0.5 block">Aviso importante</strong>
          Este documento reúne o autorregistro do próprio usuário e leituras de sensor de glicemia
          contínua, reunidos no aplicativo GLYX. Não é resultado de exame laboratorial, não foi
          revisado por profissional de saúde e não substitui avaliação clínica. Os registros de
          medicação, alimentação e exercício refletem o que foi lançado no aplicativo, não
          necessariamente o que foi efetivamente feito. Valores estimados por inteligência artificial
          (calorias e macronutrientes de refeições fotografadas, por exemplo) são aproximações.
          <div className="mt-1.5 text-zinc-600">
            Documento gerado automaticamente em{" "}
            {new Date(report.generatedAt).toLocaleString("pt-BR", { timeZone: tz })} · GLYX
          </div>
        </div>
      </div>
    </main>
  );
}
