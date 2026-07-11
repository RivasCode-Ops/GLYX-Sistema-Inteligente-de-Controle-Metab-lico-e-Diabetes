import Link from "next/link";
import {
  Droplets,
  UtensilsCrossed,
  Dumbbell,
  Pill,
  Lightbulb,
  Sparkles,
  BellRing,
  Plug,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ModuleTeaser } from "@/components/dashboard/module-teaser";
import { QuickReadingDialog } from "@/components/dashboard/quick-reading-dialog";
import { Separator } from "@/components/ui/separator";
import type { MetabolicAlert } from "@/types/database";

type Props = {
  latestGlucose: number | null;
  carbsToday: number;
  activeMinutes: number;
  riskLabel: string;
  alerts: MetabolicAlert[];
  stepsToday?: number | null;
  sleepHoursToday?: number | null;
};

export function DashboardShell({
  latestGlucose,
  carbsToday,
  activeMinutes,
  riskLabel,
  alerts,
  stepsToday = null,
  sleepHoursToday = null,
}: Props) {
  const glucoseLabel =
    latestGlucose != null ? `${latestGlucose} mg/dL` : "— sem leituras";
  const trend =
    latestGlucose != null && latestGlucose >= 140
      ? ("up" as const)
      : latestGlucose != null && latestGlucose < 100
        ? ("down" as const)
        : ("stable" as const);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-emerald-500/25 bg-gradient-to-br from-emerald-950/40 to-zinc-950/40 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-medium text-emerald-100">
              Resumo metabólico
            </CardTitle>
            <CardDescription>Dados do seu perfil e registros de hoje.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Última glicemia</p>
              <p className="mt-1 font-mono text-2xl text-zinc-50">
                {latestGlucose ?? "—"}
              </p>
              <p className="text-xs text-emerald-400/90">
                {latestGlucose != null ? "mg/dL" : "Registre uma leitura"}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Carboidratos (hoje)</p>
              <p className="mt-1 font-mono text-2xl text-zinc-50">{carbsToday}</p>
              <p className="text-xs text-zinc-500">g no dia</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Risco (regras)</p>
              <p className="mt-1 font-mono text-2xl text-zinc-50">{riskLabel}</p>
              <p className="text-xs text-zinc-500">modelo inicial</p>
            </div>
            {(stepsToday != null || sleepHoursToday != null) && (
              <div className="sm:col-span-3 border-t border-zinc-800/80 pt-4">
                <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">
                  Wearables (hoje)
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-zinc-500">Passos</p>
                    <p className="font-mono text-lg text-zinc-200">
                      {stepsToday != null ? stepsToday.toLocaleString("pt-BR") : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Sono (h)</p>
                    <p className="font-mono text-lg text-zinc-200">
                      {sleepHoursToday != null ? sleepHoursToday : "—"}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-zinc-600">
                  Fonte com prioridade: manual → Apple → Google → mock.{" "}
                  <Link href="/integracoes" className="text-emerald-500/90 hover:underline">
                    Integrações
                  </Link>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ações rápidas</CardTitle>
            <CardDescription>Modais para tarefas curtas.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <QuickReadingDialog />
            <p className="text-[11px] text-zinc-500">
              Fluxos longos ficam nas páginas de cada módulo.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Módulos GLYX</h2>
            <p className="text-sm text-zinc-500">
              Cada cartão abre uma experiência dedicada.
            </p>
          </div>
          <p className="text-xs text-zinc-600">
            Atividade hoje: <span className="font-mono text-zinc-400">{activeMinutes} min</span>
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <ModuleTeaser
            title="Glicemia"
            description="Sensor, tendências, histórico e episódios."
            href="/glicemia"
            icon={Droplets}
            metric={glucoseLabel}
            trend={trend}
          />
          <ModuleTeaser
            title="Alimentação"
            description="Refeições, plano e análise por foto."
            href="/alimentacao"
            icon={UtensilsCrossed}
            metric={`${carbsToday} g carb · hoje`}
          />
          <ModuleTeaser
            title="Exercícios"
            description="Plano, sessões e correlação com glicemia."
            href="/exercicios"
            icon={Dumbbell}
            metric={`${activeMinutes} min · hoje`}
          />
          <ModuleTeaser
            title="Medicação"
            description="Agenda, lembretes e confirmação de doses."
            href="/medicacao"
            icon={Pill}
            metric="Ver agenda"
          />
          <ModuleTeaser
            title="Integrações"
            description="Google Fit, Apple Health (bridge), dados demo."
            href="/integracoes"
            icon={Plug}
            metric={
              stepsToday != null ? `${stepsToday.toLocaleString("pt-BR")} passos` : "Conectar fontes"
            }
          />
          <ModuleTeaser
            title="Insights"
            description="Padrões e alertas do motor de regras."
            href="/insights"
            icon={Lightbulb}
          />
          <ModuleTeaser
            title="IA metabólica"
            description="Copiloto com base nos seus dados (OpenAI opcional)."
            href="/ia-metabolica"
            icon={Sparkles}
          />
        </div>
      </section>

      <Separator className="bg-zinc-800" />

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="transition hover:border-sky-600/40">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-amber-400" />
              <CardTitle className="text-base">Alertas recentes</CardTitle>
            </div>
            <CardDescription>
              <Link href="/alertas" className="text-emerald-400 hover:underline">
                Ver todos os alertas →
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-zinc-400">
            {alerts.length === 0 ? (
              <p>Nenhum alerta não lido.</p>
            ) : (
              <ul className="space-y-2">
                {alerts.slice(0, 3).map((a) => (
                  <li key={a.id} className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2">
                    <span className="text-xs uppercase text-amber-500/90">{a.severity}</span>
                    <p className="text-zinc-200">{a.title}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Copiloto</CardTitle>
            <CardDescription>
              Integrações CGM e wearables podem ser ligadas em seguida via backend.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-zinc-400">
            Motor de regras já cria alertas em leituras extremas. IA opcional com{" "}
            <code className="font-mono text-xs text-zinc-300">OPENAI_API_KEY</code>.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
