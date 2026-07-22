import { Suspense } from "react";
import { getHealthIntegrationStatus } from "@/lib/health/config";
import { isGoogleFitOAuthConfigured } from "@/lib/health/google-fit-oauth";
import { isDexcomOAuthConfigured } from "@/lib/cgm/dexcom";
import { IntegrationPanel } from "@/components/integrations/integration-panel";
import { GoogleFitConnect } from "@/components/integrations/google-fit-connect";
import { ManualSleepForm } from "@/components/integrations/manual-sleep-form";
import { LibreCsvImport } from "@/components/glicemia/libre-csv-import";
import { LibreLinkConnect } from "@/components/glicemia/libre-link-connect";
import { DexcomConnect } from "@/components/glicemia/dexcom-connect";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

// Conexões: um só lugar para conectar fontes de dados — sensor de glicose (CGM)
// e integrações de saúde (Google Fit, sono). Antes o CGM ficava separado em
// /glicemia/sensor, fazendo a mesma classe de tarefa em dois módulos distintos.
export default async function ConexoesPage() {
  const status = getHealthIntegrationStatus();

  let googleFitConnection: { lastSyncAt: string | null; lastError: string | null } | null = null;
  let libreConnection: {
    email: string;
    lastSyncAt: string | null;
    lastError: string | null;
    circuitOpenUntil: string | null;
    lastErrorKind: string | null;
  } | null = null;
  let dexcomConnection: {
    lastSyncAt: string | null;
    lastError: string | null;
    circuitOpenUntil: string | null;
    lastErrorKind: string | null;
  } | null = null;

  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const [{ data: gfit }, { data: cgmRows }] = await Promise.all([
        supabase
          .from("google_fit_connections")
          .select("last_sync_at, last_error")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("cgm_connections")
          .select("provider, email, last_sync_at, last_error, circuit_open_until, last_error_kind")
          .eq("user_id", user.id),
      ]);

      if (gfit) googleFitConnection = { lastSyncAt: gfit.last_sync_at, lastError: gfit.last_error };

      for (const data of cgmRows ?? []) {
        if (data.provider === "dexcom") {
          dexcomConnection = {
            lastSyncAt: data.last_sync_at,
            lastError: data.last_error,
            circuitOpenUntil: data.circuit_open_until,
            lastErrorKind: data.last_error_kind,
          };
        } else if (data.provider === "librelinkup") {
          libreConnection = {
            email: data.email ?? "",
            lastSyncAt: data.last_sync_at,
            lastError: data.last_error,
            circuitOpenUntil: data.circuit_open_until,
            lastErrorKind: data.last_error_kind,
          };
        }
      }
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Sensor de glicose (CGM)</h2>
          <p className="mt-1 text-sm text-zinc-400">
            As leituras entram no mesmo histórico das medições manuais (mg/dL), sem duplicar nada.
          </p>
        </div>
        <LibreLinkConnect connection={libreConnection} />
        <Suspense fallback={null}>
          <DexcomConnect connection={dexcomConnection} oauthConfigured={isDexcomOAuthConfigured()} />
        </Suspense>
        <LibreCsvImport />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Integrações de saúde</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Agregados diários por fonte (passos, sono, FC, etc.) para cruzar com glicemia no motor de
            insights.
          </p>
        </div>
        <Suspense fallback={null}>
          <GoogleFitConnect connection={googleFitConnection} oauthConfigured={isGoogleFitOAuthConfigured()} />
        </Suspense>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sono manual</CardTitle>
            <CardDescription>
              Sem Apple/Google Fit conectado, registre aqui — entra na Análise e nos relatórios com
              prioridade sobre qualquer outra fonte do mesmo dia.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ManualSleepForm />
          </CardContent>
        </Card>
        <IntegrationPanel initialStatus={status} />
      </section>
    </div>
  );
}
