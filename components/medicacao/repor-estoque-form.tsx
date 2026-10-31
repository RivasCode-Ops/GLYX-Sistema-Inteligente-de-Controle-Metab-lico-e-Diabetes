"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { reporEstoque } from "@/app/actions/medications";

type Resultado = { ok?: true; error?: string; total?: number } | undefined;

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Salvar estoque"}
    </Button>
  );
}

/**
 * Reposição em um passo (estoque-repor, 31/10/2026). "Comprei mais" é o caso
 * comum depois do aviso: soma à sobra calculada, sem a pessoa precisar contar
 * comprimido. "Contei" corrige quando a conta divergiu da caixa.
 */
export function ReporEstoqueForm({
  medicationId,
  restantes,
  unidade,
}: {
  medicationId: string;
  /** O que a conta diz que resta hoje; nulo sem estoque informado. */
  restantes: number | null;
  unidade: string;
}) {
  const [modo, setModo] = useState<"somar" | "total">(restantes == null ? "total" : "somar");
  const [estado, enviar] = useActionState(async (_p: Resultado, fd: FormData) => reporEstoque(fd), undefined);

  if (estado?.ok) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-emerald-300">
          Estoque atualizado: {estado.total} {unidade}. O aviso de reposição volta a contar a partir de hoje.
        </p>
        <Button asChild variant="outline">
          <Link href="/medicacao/medicamentos">Voltar aos medicamentos</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={enviar} className="space-y-4">
      <input type="hidden" name="medication_id" value={medicationId} />
      <input type="hidden" name="modo" value={modo} />
      <fieldset className="space-y-2">
        <legend className="sr-only">Como você quer informar</legend>
        {restantes != null ? (
          <label className="flex items-start gap-2 text-sm text-zinc-200">
            <input type="radio" checked={modo === "somar"} onChange={() => setModo("somar")} className="mt-1" />
            <span>
              Comprei mais — somar ao que resta
              <span className="block text-xs text-zinc-500">
                Pela conta dos seus horários, restam ~{restantes} {unidade}.
              </span>
            </span>
          </label>
        ) : null}
        <label className="flex items-start gap-2 text-sm text-zinc-200">
          <input type="radio" checked={modo === "total"} onChange={() => setModo("total")} className="mt-1" />
          <span>
            Contei o que tenho agora — informar o total
            <span className="block text-xs text-zinc-500">Use quando a conta não bate com a caixa.</span>
          </span>
        </label>
      </fieldset>
      <label className="block text-sm text-zinc-300">
        {modo === "somar" ? `Quantas ${unidade} você comprou?` : `Quantas ${unidade} você tem agora?`}
        <input
          name="unidades"
          type="number"
          inputMode="numeric"
          min={modo === "somar" ? 1 : 0}
          max={10000}
          required
          className="mt-1 block h-10 w-32 rounded-md border border-zinc-700 bg-zinc-950 px-3 font-mono text-zinc-100"
        />
      </label>
      {estado?.error ? <p className="text-xs text-amber-300">{estado.error}</p> : null}
      <Enviar />
    </form>
  );
}
