import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBodySnapshot } from "@/lib/queries/body-composition";
import { DashboardBars } from "@/components/composicao/dashboard-bars";
import { CompositionSummary } from "@/components/composicao/composition-summary";
import { BodyAlertsList } from "@/components/composicao/body-alerts-list";
import { AiReportCard } from "@/components/composicao/ai-report-card";
import { progressSummary } from "@/lib/body/progress";

export const metadata = { title: "Composição corporal — GLYX" };

const VERDICT_STYLE: Record<string, string> = {
  otimo: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  bom: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  atencao: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  neutro: "border-zinc-700 bg-zinc-900/60 text-zinc-200",
};

export default async function ComposicaoPage() {
  const snapshot = await getBodySnapshot();

  if (!snapshot) {
    return (
      <div className="mx-auto max-w-xl">
        <p className="text-sm text-zinc-400">Entre na sua conta para acompanhar composição corporal.</p>
      </div>
    );
  }

  const { latest, latestComposition, progress, bars, alerts, profile } = snapshot;
  const missingProfile = !profile.sex || !profile.heightCm;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <p className="text-sm text-zinc-400">
        Peso sozinho não distingue músculo de gordura. Aqui as medidas de fita, as dobras, a carga
        dos treinos e o contexto metabólico entram juntos para responder o que a balança não responde.
      </p>

      {missingProfile ? (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-amber-200">
              Complete sexo e altura no{" "}
              <Link href="/perfil/corpo" className="underline">
                perfil corporal
              </Link>{" "}
              — sem eles não dá para estimar gordura, massa magra nem relação cintura/altura.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!latest ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comece pela primeira medição</CardTitle>
            <CardDescription>
              Fita métrica e 10 minutos. A partir da segunda medição o app passa a comparar e a
              classificar sua evolução.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/composicao/medidas"
              className="inline-block rounded-lg bg-sky-500 px-3 py-2 text-sm font-medium text-zinc-950"
            >
              Registrar medidas
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {progress ? (
        <div className={`rounded-xl border px-4 py-3 ${VERDICT_STYLE[progress.verdict.tone]}`}>
          <p className="text-sm font-semibold">{progress.verdict.headline}</p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-200">{progress.verdict.detail}</p>
          <p className="mt-1 text-xs text-zinc-400">{progressSummary(progress)}</p>
        </div>
      ) : null}

      {latestComposition && latest ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Onde você está</CardTitle>
          </CardHeader>
          <CardContent>
            <CompositionSummary composition={latestComposition} measuredOn={latest.measured_on} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Painel</CardTitle>
          <CardDescription>Cada barra mostra a própria definição — régua diferente por barra.</CardDescription>
        </CardHeader>
        <CardContent>
          <DashboardBars bars={bars} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Achados</CardTitle>
          <CardDescription>
            Calculados a partir dos seus dados — mesma entrada, mesma saída, sempre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BodyAlertsList alerts={alerts} />
        </CardContent>
      </Card>

      <AiReportCard enabled={snapshot.history.length >= 2} />
    </div>
  );
}
