import { getLastTrainedByMuscleGroup, getActiveMusclePauses } from "@/lib/queries/muscle-recovery";
import { getRecentStrengthLogs } from "@/lib/queries/strength";
import { computeMuscleRecovery, suggestMuscleFocus } from "@/lib/exercicios/muscle-recovery";
import { MuscleRecoveryPanel } from "@/components/exercicios/muscle-recovery-panel";
import { StrengthLogForm } from "@/components/exercicios/strength-log-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function RecuperacaoMuscularPage() {
  const [lastTrained, pausedGroups, strengthLogs] = await Promise.all([
    getLastTrainedByMuscleGroup(),
    getActiveMusclePauses(),
    getRecentStrengthLogs(),
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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Progressão de carga</CardTitle>
          <CardDescription>
            Peso × repetições por exercício — pra saber se você está evoluindo, não só se treinou.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StrengthLogForm logs={strengthLogs} />
        </CardContent>
      </Card>
    </div>
  );
}
