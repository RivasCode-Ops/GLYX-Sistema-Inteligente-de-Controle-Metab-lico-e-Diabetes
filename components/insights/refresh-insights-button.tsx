"use client";

import { useState, useTransition } from "react";
import { refreshCorrelationInsights } from "@/app/actions/insights";
import { Button } from "@/components/ui/button";

export function RefreshInsightsButton() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setMsg(null);
    startTransition(() => {
      void (async () => {
        const r = await refreshCorrelationInsights(14);
        if (r.error) setMsg(r.error);
        else
          setMsg(
            `Recalculado: ${r.generated ?? 0} correlações encontradas, ${r.upserted ?? 0} gravadas.`
          );
      })();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" disabled={pending} onClick={run}>
        {pending ? "A calcular…" : "Recalcular insights (14 dias)"}
      </Button>
      {msg ? <p className="text-xs text-zinc-400">{msg}</p> : null}
    </div>
  );
}
