import { getCgmIntegrationStatus } from "@/lib/cgm/config";
import { SensorPanel } from "@/components/glicemia/sensor-panel";

export default async function GlicemiaSensorPage() {
  const status = getCgmIntegrationStatus();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-sm text-zinc-400">
          Camada CGM unifica Libre e Dexcom para o mesmo modelo interno (mg/dL, UTC, dedup por{" "}
          <code className="font-mono text-xs text-zinc-500">external_id</code>). Execute a migração{" "}
          <code className="font-mono text-xs">20260109120000_cgm_glucose_columns.sql</code> no Supabase
          antes de importar.
        </p>
      </div>
      <SensorPanel initialStatus={status} />
    </div>
  );
}
