"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { updateProfile, type ActionResult } from "@/app/actions/profile";

/**
 * Formulário do perfil com retorno visível.
 *
 * As duas formas desta tela chamavam a server action dentro de um wrapper
 * `Promise<void>`: qualquer `{ error }` — inclusive faixa-alvo incoerente e
 * razão carbo/insulina fora dos limites — era descartado em silêncio, e o
 * usuário via a página recarregar como se tivesse salvado.
 */
async function formAction(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  return updateProfile(formData);
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : label}
    </Button>
  );
}

export function ProfileForm({
  children,
  submitLabel,
  successMessage = "Perfil salvo.",
  className = "grid gap-4",
  /** Classe aplicada às faixas que devem ocupar a linha toda em grid multi-coluna. */
  spanClassName = "",
}: {
  children: ReactNode;
  submitLabel: string;
  successMessage?: string;
  className?: string;
  spanClassName?: string;
}) {
  const [state, action] = useActionState(formAction, undefined);

  return (
    <form action={action} className={className}>
      {state?.error ? (
        <p
          className={`rounded-lg border border-red-900/60 bg-red-950/40 p-2 text-xs text-red-200 ${spanClassName}`}
        >
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p
          className={`rounded-lg border border-emerald-900/60 bg-emerald-950/40 p-2 text-xs text-emerald-200 ${spanClassName}`}
        >
          {successMessage}
        </p>
      ) : null}
      {children}
      <div className={spanClassName}>
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
