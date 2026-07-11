import Link from "next/link";
import { SectionCards } from "@/components/module/section-cards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { demoGlucoseReadings } from "@/lib/demo/data";

export default async function GlicemiaOverviewPage() {
  let latest: { value_mg_dl: number; recorded_at: string } | null = null;

  if (!isSupabaseConfigured()) {
    latest = demoGlucoseReadings[0] ?? null;
  } else {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("glucose_readings")
          .select("value_mg_dl, recorded_at")
          .eq("user_id", user.id)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        latest = data;
      }
    }
  }

  const displayValue = latest?.value_mg_dl ?? null;
  const displayTime = latest?.recorded_at
    ? new Date(latest.recorded_at).toLocaleString("pt-BR")
    : "—";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <p className="text-sm text-zinc-400">
        Visão geral do módulo — detalhes ficam nas sub-rotas e no drill-down por episódio.
      </p>
      <SectionCards
        items={[
          {
            title: "Tendências",
            description: "Gráficos e padrões glicêmicos no período.",
            href: "/glicemia/tendencias",
          },
          {
            title: "Sensor (CGM)",
            description: "Conexão e leitura contínua (integração futura).",
            href: "/glicemia/sensor",
          },
          {
            title: "Histórico",
            description: "Linha do tempo e exportação.",
            href: "/glicemia/historico",
          },
          {
            title: "Histórico por dia",
            description: "Lista por data com drill-down YYYY-MM-DD.",
            href: "/glicemia/historico",
          },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Última leitura</CardTitle>
          <CardDescription>Sincronizada com o painel e histórico.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-3xl text-zinc-50">{displayValue ?? "—"}</p>
            <p className="text-sm text-zinc-500">
              {displayValue != null ? `mg/dL · ${displayTime}` : "Registre no painel ou aqui pelo histórico"}
            </p>
          </div>
          <Link
            href="/glicemia/historico"
            className="text-sm font-medium text-emerald-400 hover:underline"
          >
            Ver histórico completo
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
