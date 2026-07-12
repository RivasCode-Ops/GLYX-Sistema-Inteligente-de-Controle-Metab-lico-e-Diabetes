import { getCgmIntegrationStatus } from "@/lib/cgm/config";
import { SensorPanel } from "@/components/glicemia/sensor-panel";
import { LibreCsvImport } from "@/components/glicemia/libre-csv-import";

export default async function GlicemiaSensorPage() {
  const status = getCgmIntegrationStatus();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <p className="text-sm text-zinc-400">
        Conecte seu sensor de glicose: as leituras entram no mesmo histórico das medições manuais
        (mg/dL), sem duplicar nada.
      </p>
      <LibreCsvImport />
      <SensorPanel initialStatus={status} />
    </div>
  );
}
