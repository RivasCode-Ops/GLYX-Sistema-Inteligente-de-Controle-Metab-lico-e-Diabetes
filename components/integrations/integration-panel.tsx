"use client";

import { useState, useTransition } from "react";
import { ingestMockHealth } from "@/app/actions/health";
import type { HealthIntegrationStatus } from "@/lib/health/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  initialStatus: HealthIntegrationStatus;
};

export function IntegrationPanel({ initialStatus }: Props) {
  const [status] = useState(initialStatus);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runMock() {
    setMsg(null);
    startTransition(() => {
      void (async () => {
        const r = await ingestMockHealth(7);
        if (r.error) setMsg(r.error);
        else setMsg(`Mock: ${r.upserted ?? 0} dias gravados (upsert).`);
      })();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Google Fit / Health Connect</CardTitle>
            <CardDescription>{status.googleFit.hint}</CardDescription>
          </CardHeader>
          <CardContent>
            <span
              className={
                status.googleFit.configured ? "text-sm text-emerald-400" : "text-sm text-zinc-500"
              }
            >
              {status.googleFit.configured ? "Variáveis OAuth presentes" : "Não configurado"}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Apple Health</CardTitle>
            <CardDescription>{status.appleHealth.hint}</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-sm text-amber-400/90">Apenas nativo / exportação → API</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados de demo</CardTitle>
          <CardDescription>
            Grava 7 dias na tabela <code className="font-mono text-xs">health_snapshots</code>{" "}
            (fonte mock).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button type="button" variant="subtle" disabled={pending} onClick={runMock}>
            {pending ? "A gravar…" : "Importar 7 dias (mock)"}
          </Button>
          {msg ? <p className="text-xs text-zinc-400">{msg}</p> : null}
        </CardContent>
      </Card>

      <Card className="border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base text-zinc-200">API</CardTitle>
          <CardDescription>
            <code className="font-mono text-[11px]">POST /api/health/ingest</code> — modos{" "}
            <code className="font-mono text-[11px]">unified</code>,{" "}
            <code className="font-mono text-[11px]">google_fit</code>,{" "}
            <code className="font-mono text-[11px]">apple_health</code>,{" "}
            <code className="font-mono text-[11px]">mock</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
