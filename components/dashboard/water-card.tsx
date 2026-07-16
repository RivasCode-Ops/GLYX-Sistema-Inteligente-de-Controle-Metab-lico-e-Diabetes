"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { logBeverage } from "@/app/actions/water";
import { BEVERAGE_META, type BeverageKind } from "@/lib/health/beverages";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type BeverageSummary = { kind: BeverageKind; count: number; totalMl: number };

const EXTRA_BUTTONS: BeverageKind[] = ["agua_com_gas", "cafe", "cha", "refrigerante_diet", "outra"];

export function WaterCard({
  todayMl,
  goalMl,
  extras = [],
}: {
  todayMl: number;
  goalMl: number;
  /** Bebidas de hoje que não contam na meta de água (café, refri diet, outra). */
  extras?: BeverageSummary[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const pct = Math.min(100, Math.round((todayMl / goalMl) * 100));

  function add(kind: BeverageKind, ml?: number) {
    startTransition(async () => {
      await logBeverage(ml ?? BEVERAGE_META[kind].defaultMl, kind);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">💧 Água e bebidas hoje</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-2xl text-sky-300">
            {todayMl} <span className="text-sm text-zinc-500">/ {goalMl} ml</span>
          </p>
          <p className="text-xs text-zinc-500">{pct}%</p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => add("agua", 250)}
            disabled={pending}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-sky-500/50"
          >
            + 250 ml (copo)
          </button>
          <button
            type="button"
            onClick={() => add("agua", 500)}
            disabled={pending}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-sky-500/50"
          >
            + 500 ml (garrafa)
          </button>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-zinc-500">
            Outras bebidas
          </p>
          <div className="flex flex-wrap gap-1.5">
            {EXTRA_BUTTONS.map((kind) => {
              const meta = BEVERAGE_META[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => add(kind)}
                  disabled={pending}
                  title={`${meta.label} · ${meta.defaultMl} ml`}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs text-zinc-300 transition hover:border-sky-500/40 hover:text-zinc-100"
                >
                  {meta.emoji} {meta.label}
                </button>
              );
            })}
          </div>
          {extras.length > 0 ? (
            <p className="mt-2 text-xs text-zinc-500">
              Hoje:{" "}
              {extras
                .map((e) => `${e.count}× ${BEVERAGE_META[e.kind].label.toLowerCase()}`)
                .join(" · ")}
            </p>
          ) : null}
          <p className="mt-1 text-[10px] leading-4 text-zinc-600">
            Água, água com gás e chá contam na meta. Café e refri diet são registrados para a IA
            considerar no seu contexto metabólico.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
