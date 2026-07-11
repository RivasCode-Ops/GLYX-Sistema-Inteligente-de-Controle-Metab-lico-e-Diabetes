"use client";

import { useState, useTransition } from "react";
import { ingestMockCgmReadings } from "@/app/actions/cgm";
import type { CgmIntegrationStatus } from "@/lib/cgm/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  initialStatus: CgmIntegrationStatus;
};

export function SensorPanel({ initialStatus }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function refreshStatus() {
    try {
      const res = await fetch("/api/cgm/status");
      const j = (await res.json()) as CgmIntegrationStatus;
      setStatus(j);
    } catch {
      /* ignore */
    }
  }

  function runMock() {
    setMsg(null);
    startTransition(() => {
      void (async () => {
        const r = await ingestMockCgmReadings(48);
        if (r.error) setMsg(r.error);
        else setMsg(`Mock: ${r.inserted ?? 0} inseridas, ${r.skipped ?? 0} ignoradas (dedup).`);
        await refreshStatus();
      })();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Dexcom</CardTitle>
            <CardDescription>{status.dexcom.hint}</CardDescription>
          </CardHeader>
          <CardContent>
            <span
              className={
                status.dexcom.configured ? "text-emerald-400 text-sm" : "text-zinc-500 text-sm"
              }
            >
              {status.dexcom.configured ? "Credenciais detectadas" : "Não configurado"}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Libre</CardTitle>
            <CardDescription>{status.libre.hint}</CardDescription>
          </CardHeader>
          <CardContent>
            <span
              className={
                status.libre.configured ? "text-emerald-400 text-sm" : "text-zinc-500 text-sm"
              }
            >
              {status.libre.configured ? "Credenciais detectadas" : "Não configurado"}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mock</CardTitle>
            <CardDescription>Série sintética para desenvolver UI e motor.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button type="button" variant="subtle" disabled={pending} onClick={runMock}>
              {pending ? "A importar…" : "Importar 48 pontos (mock)"}
            </Button>
            {msg ? <p className="text-xs text-zinc-400">{msg}</p> : null}
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base text-zinc-200">Ingestão via API</CardTitle>
          <CardDescription>
            <code className="font-mono text-[11px] text-zinc-500">
              POST /api/cgm/ingest
            </code>{" "}
            com corpo{" "}
            <code className="font-mono text-[11px]">
              {"{ \"mode\": \"dexcom\" | \"libre\" | \"unified\" | \"mock\", ... }"}
            </code>
            — autenticado com cookie de sessão.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-xs leading-relaxed text-zinc-500">
          Normalizadores em <code className="font-mono">lib/cgm/normalize/</code>. Próximo passo:
          cliente OAuth Dexcom / cliente Libre regional consumindo estes endpoints internamente.
        </CardContent>
      </Card>
    </div>
  );
}
