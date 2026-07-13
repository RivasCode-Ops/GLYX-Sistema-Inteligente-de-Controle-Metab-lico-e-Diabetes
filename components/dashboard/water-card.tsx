"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { logWater } from "@/app/actions/water";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function WaterCard({ todayMl, goalMl }: { todayMl: number; goalMl: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const pct = Math.min(100, Math.round((todayMl / goalMl) * 100));

  function add(ml: number) {
    startTransition(async () => {
      await logWater(ml);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">💧 Água hoje</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-2xl text-sky-300">
            {todayMl} <span className="text-sm text-zinc-500">/ {goalMl} ml</span>
          </p>
          <p className="text-xs text-zinc-500">{pct}%</p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full bg-sky-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => add(250)}
            disabled={pending}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-sky-500/50"
          >
            + 250 ml (copo)
          </button>
          <button
            type="button"
            onClick={() => add(500)}
            disabled={pending}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-sky-500/50"
          >
            + 500 ml (garrafa)
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
