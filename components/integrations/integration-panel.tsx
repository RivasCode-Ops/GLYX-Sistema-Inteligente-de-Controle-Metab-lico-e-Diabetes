"use client";

import { Plug } from "lucide-react";
import type { HealthIntegrationStatus } from "@/lib/health/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";

type Props = {
  initialStatus: HealthIntegrationStatus;
};

export function IntegrationPanel({ initialStatus: status }: Props) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
            <CardTitle className="text-base">Apple Health</CardTitle>
          </div>
          <CardDescription>{status.appleHealth.hint}</CardDescription>
        </CardHeader>
        <CardContent>
          <StatusPill tone="amber">Apenas nativo / exportação → API</StatusPill>
        </CardContent>
      </Card>

      <Card className="border-zinc-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
            <CardTitle className="text-base text-zinc-200">API</CardTitle>
          </div>
          <CardDescription>
            <code className="font-mono text-[11px]">POST /api/health/ingest</code> — modos{" "}
            <code className="font-mono text-[11px]">unified</code>,{" "}
            <code className="font-mono text-[11px]">google_fit</code>,{" "}
            <code className="font-mono text-[11px]">apple_health</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
