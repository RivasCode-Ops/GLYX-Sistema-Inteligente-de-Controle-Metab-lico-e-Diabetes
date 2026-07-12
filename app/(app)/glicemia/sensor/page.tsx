import { getCgmIntegrationStatus } from "@/lib/cgm/config";
import { createClient } from "@/lib/supabase/server";
import { SensorPanel } from "@/components/glicemia/sensor-panel";
import { LibreCsvImport } from "@/components/glicemia/libre-csv-import";
import { LibreLinkConnect } from "@/components/glicemia/libre-link-connect";

export default async function GlicemiaSensorPage() {
  const status = getCgmIntegrationStatus();

  let connection: { email: string; lastSyncAt: string | null; lastError: string | null } | null =
    null;
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("cgm_connections")
        .select("email, last_sync_at, last_error")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        connection = {
          email: data.email,
          lastSyncAt: data.last_sync_at,
          lastError: data.last_error,
        };
      }
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <p className="text-sm text-zinc-400">
        Conecte seu sensor de glicose: as leituras entram no mesmo histórico das medições manuais
        (mg/dL), sem duplicar nada.
      </p>
      <LibreLinkConnect connection={connection} />
      <LibreCsvImport />
      <SensorPanel initialStatus={status} />
    </div>
  );
}
