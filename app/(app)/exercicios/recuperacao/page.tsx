import { getLastTrainedByMuscleGroup, getActiveMusclePauses } from "@/lib/queries/muscle-recovery";
import { computeMuscleRecovery, suggestMuscleFocus } from "@/lib/exercicios/muscle-recovery";
import { MuscleRecoveryPanel } from "@/components/exercicios/muscle-recovery-panel";

export default async function RecuperacaoMuscularPage() {
  const [lastTrained, pausedGroups] = await Promise.all([
    getLastTrainedByMuscleGroup(),
    getActiveMusclePauses(),
  ]);
  const statuses = computeMuscleRecovery(lastTrained, pausedGroups);
  const suggestion = suggestMuscleFocus(statuses);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <p className="text-sm text-zinc-400">
        Cada grupo muscular tem uma janela de recuperação estimada — registre o que treinou hoje e
        acompanhe quando cada um fica pronto de novo. Não consegue seguir o plano num grupo agora?
        Pause em vez de deixar o cronômetro correndo sozinho.
      </p>
      <MuscleRecoveryPanel statuses={statuses} suggestion={suggestion} />
    </div>
  );
}
