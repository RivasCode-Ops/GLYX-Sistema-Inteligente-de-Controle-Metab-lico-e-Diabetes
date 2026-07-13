import { getLastTrainedByMuscleGroup } from "@/lib/queries/muscle-recovery";
import { computeMuscleRecovery, suggestMuscleFocus } from "@/lib/exercicios/muscle-recovery";
import { MuscleRecoveryPanel } from "@/components/exercicios/muscle-recovery-panel";

export default async function RecuperacaoMuscularPage() {
  const lastTrained = await getLastTrainedByMuscleGroup();
  const statuses = computeMuscleRecovery(lastTrained);
  const suggestion = suggestMuscleFocus(statuses);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <p className="text-sm text-zinc-400">
        Cada grupo muscular tem uma janela de recuperação estimada — registre o que treinou hoje e
        acompanhe quando cada um fica pronto de novo.
      </p>
      <MuscleRecoveryPanel statuses={statuses} suggestion={suggestion} />
    </div>
  );
}
