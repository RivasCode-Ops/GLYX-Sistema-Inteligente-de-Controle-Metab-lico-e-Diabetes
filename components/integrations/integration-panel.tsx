"use client";

import type { HealthIntegrationStatus } from "@/lib/health/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  initialStatus: HealthIntegrationStatus;
};

export function IntegrationPanel({ initialStatus: status }: Props) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Apple Health</CardTitle>
          <CardDescription>{status.appleHealth.hint}</CardDescription>
        </CardHeader>
        <CardContent>
          <span className="text-sm text-amber-400/90">Apenas nativo / exportação → API</span>
        </CardContent>
      </Card>

      <Card className="border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base text-zinc-200">API</CardTitle>
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
