import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MetabolicAlert } from "@/types/database";
import { demoAlerts } from "@/lib/demo/data";

export default async function AlertasPage() {
  let alerts: MetabolicAlert[] = [];

  if (!isSupabaseConfigured()) {
    alerts = demoAlerts;
  } else {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("metabolic_alerts")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);
        alerts = (data ?? []) as MetabolicAlert[];
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <p className="text-sm text-zinc-400">
        Alertas gerados pelas regras do motor (e futuras integrações).{" "}
        <Link href="/dashboard" className="text-emerald-400 hover:underline">
          Voltar ao painel
        </Link>
      </p>
      {alerts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nenhum alerta</CardTitle>
            <CardDescription>
              Quando houver leituras extremas ou novas regras, eles aparecerão aqui.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-3">
          {alerts.map((a) => (
            <li key={a.id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{a.title}</CardTitle>
                    <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] uppercase text-amber-400">
                      {a.severity}
                    </span>
                  </div>
                  <CardDescription>
                    {new Date(a.created_at).toLocaleString("pt-BR")}
                  </CardDescription>
                </CardHeader>
                {a.body ? (
                  <CardContent className="text-sm text-zinc-400">{a.body}</CardContent>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
