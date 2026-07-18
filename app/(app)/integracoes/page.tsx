import { Suspense } from "react";
import { getHealthIntegrationStatus } from "@/lib/health/config";
import { isGoogleFitOAuthConfigured } from "@/lib/health/google-fit-oauth";
import { IntegrationPanel } from "@/components/integrations/integration-panel";
import { GoogleFitConnect } from "@/components/integrations/google-fit-connect";
import { createClient } from "@/lib/supabase/server";

export default async function IntegracoesPage() {
  const status = getHealthIntegrationStatus();

  let googleFitConnection: { lastSyncAt: string | null; lastError: string | null } | null = null;
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("google_fit_connections")
        .select("last_sync_at, last_error")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        googleFitConnection = { lastSyncAt: data.last_sync_at, lastError: data.last_error };
      }
    }
  }

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
      <Suspense fallback={null}>
        <GoogleFitConnect connection={googleFitConnection} oauthConfigured={isGoogleFitOAuthConfigured()} />
      </Suspense>
      <IntegrationPanel initialStatus={status} />
    </div>
  );
}
