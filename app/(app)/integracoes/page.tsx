import { getHealthIntegrationStatus } from "@/lib/health/config";
import { IntegrationPanel } from "@/components/integrations/integration-panel";

export default async function IntegracoesPage() {
  const status = getHealthIntegrationStatus();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Integrações de saúde</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Agregados diários por fonte (passos, sono, FC, etc.) para cruzar com glicemia no motor de
          insights. Execute a migração{" "}
          <code className="font-mono text-xs text-zinc-500">20260109140000_health_snapshots.sql</code>{" "}
          no Supabase.
        </p>
      </div>
      <IntegrationPanel initialStatus={status} />
    </div>
  );
}
