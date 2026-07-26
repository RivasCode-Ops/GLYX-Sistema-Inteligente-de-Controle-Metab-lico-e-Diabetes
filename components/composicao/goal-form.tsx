"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBodyGoal, deleteBodyGoal, type ActionResult } from "@/app/actions/body";
import { BODY_FIELDS } from "@/lib/body/fields";

async function saveAction(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  return saveBodyGoal(formData);
}

async function deleteAction(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  return deleteBodyGoal(formData);
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando…" : label}
    </Button>
  );
}

/** Dobras não entram como meta: ninguém persegue "dobra tricipital de 8 mm" — a
 * meta de gordura vive na cintura, que é o que muda de verdade na fita. */
const GOAL_FIELDS = BODY_FIELDS.filter((f) => f.group !== "dobra");

export function GoalForm({ currentByMetric }: { currentByMetric: Record<string, number | null> }) {
  const [state, action] = useActionState(saveAction, undefined);

  return (
    <form action={action} className="grid gap-3">
      {state?.error ? (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 p-2 text-xs text-red-200">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 p-2 text-xs text-emerald-200">
          Meta salva.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <Label htmlFor="metric" className="text-xs">
            Medida
          </Label>
          <select
            id="metric"
            name="metric"
            className="h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
            defaultValue="waist_cm"
          >
            {GOAL_FIELDS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
                {currentByMetric[f.key] != null ? ` (hoje: ${currentByMetric[f.key]} ${f.unit})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="target_value" className="text-xs">
            Valor da meta
          </Label>
          <Input id="target_value" name="target_value" inputMode="decimal" placeholder="ex.: 85" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="target_date" className="text-xs">
            Data-alvo (opcional)
          </Label>
          <Input id="target_date" name="target_date" type="date" />
        </div>
      </div>

      <div>
        <SubmitButton label="Salvar meta" />
      </div>
      <p className="text-[11px] leading-snug text-zinc-500">
        O ponto de partida é congelado na medição mais recente quando a meta é criada — assim o
        progresso já conquistado não some quando você ajusta o alvo.
      </p>
    </form>
  );
}

export function DeleteGoalButton({ metric }: { metric: string }) {
  const [, action] = useActionState(deleteAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="metric" value={metric} />
      <Button type="submit" variant="outline" size="sm">
        Remover
      </Button>
    </form>
  );
}
