"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { logWeight, type ActionResult } from "@/app/actions/profile";

async function formAction(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  return logWeight(formData);
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Salvando…" : "Registrar"}
    </Button>
  );
}

/**
 * Registro de peso com retorno visível — o formulário anterior chamava a action
 * dentro de um wrapper `Promise<void>`, então "Informe um peso válido em kg" e
 * qualquer erro do banco eram descartados e a página recarregava como se
 * tivesse salvado. Mesma classe de bug já corrigida nos formulários do Perfil.
 */
export function WeightForm() {
  const [state, action] = useActionState(formAction, undefined);

  return (
    <div className="space-y-2">
      <form action={action} className="flex items-center gap-2">
        <Input
          name="weight_kg"
          type="number"
          step="0.1"
          min={20}
          placeholder="peso de hoje (kg)"
          className="h-9 w-44"
          required
        />
        <SubmitButton />
      </form>
      {state?.error ? (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 p-2 text-xs text-red-200">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? <p className="text-xs text-emerald-300">Peso registrado.</p> : null}
    </div>
  );
}
