"use client";

import { useState, useTransition } from "react";
import { generateMetabolicAudit } from "@/app/actions/audit";
import { Button } from "@/components/ui/button";

const WINDOWS = [7, 14, 30] as const;

export function GenerateAuditButton({ defaultWindow = 14 }: { defaultWindow?: number }) {
  const [windowDays, setWindowDays] = useState(defaultWindow);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setMsg(null);
    startTransition(() => {
      void (async () => {
        const r = await generateMetabolicAudit(windowDays);
        if (r.error) setMsg(r.error);
        else
          setMsg(
            `Mapa gerado: ${r.report?.label ?? "—"} · score ${r.report?.score ?? "—"} / 100 (${windowDays} dias).`
          );
      })();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {WINDOWS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWindowDays(w)}
            className={
              windowDays === w
                ? "rounded-lg border border-emerald-600/60 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300"
                : "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-500"
            }
          >
            {w} dias
          </button>
        ))}
      </div>
      <Button type="button" variant="outline" disabled={pending} onClick={run}>
        {pending ? "A calcular…" : "Gerar mapa de risco"}
      </Button>
      {msg ? <p className="text-xs text-zinc-400">{msg}</p> : null}
    </div>
  );
}
