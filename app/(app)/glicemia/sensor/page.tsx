import { Suspense } from "react";
import { isDexcomOAuthConfigured } from "@/lib/cgm/dexcom";
import { createClient } from "@/lib/supabase/server";
import { LibreCsvImport } from "@/components/glicemia/libre-csv-import";
import { LibreLinkConnect } from "@/components/glicemia/libre-link-connect";
import { DexcomConnect } from "@/components/glicemia/dexcom-connect";

export default async function GlicemiaSensorPage() {
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
      const { data: rows } = await supabase
        .from("cgm_connections")
        .select("provider, email, last_sync_at, last_error, circuit_open_until, last_error_kind")
        .eq("user_id", user.id);
      for (const data of rows ?? []) {
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
    <div className="mx-auto max-w-5xl space-y-6">
      <p className="text-sm text-zinc-400">
        Conecte seu sensor de glicose: as leituras entram no mesmo histórico das medições manuais
        (mg/dL), sem duplicar nada.
      </p>
      <LibreLinkConnect connection={libreConnection} />
      <Suspense fallback={null}>
        <DexcomConnect connection={dexcomConnection} oauthConfigured={isDexcomOAuthConfigured()} />
      </Suspense>
      <LibreCsvImport />
    </div>
  );
}
