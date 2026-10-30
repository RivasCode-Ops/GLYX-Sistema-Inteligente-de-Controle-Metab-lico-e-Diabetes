"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  definirDataDaColeta,
  extrairValoresDoExame,
  type ActionResult,
} from "@/app/actions/exam-values";

/**
 * Ações da linha do exame na lista. Existem como componente cliente para o
 * resultado chegar à tela: a página chamava as actions e descartava o retorno,
 * então "Extrair valores" que falhava não dizia nada (GLYX-20).
 */

async function extrairAction(_prev: ActionResult | undefined, formData: FormData) {
  return extrairValoresDoExame(formData);
}

async function dataAction(_prev: ActionResult | undefined, formData: FormData) {
  return definirDataDaColeta(formData);
}

function Enviar({ label, pendente, variant }: { label: string; pendente: string; variant: "ghost" | "outline" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size="sm" className="h-7 text-[11px]" disabled={pending}>
      {pending ? pendente : label}
    </Button>
  );
}

function Retorno({ state, sucesso }: { state: ActionResult | undefined; sucesso?: string }) {
  if (!state) return null;
  if (state.error) return <p className="w-full text-[11px] text-red-300">{state.error}</p>;
  if (state.aviso) return <p className="w-full text-[11px] text-amber-300">{state.aviso}</p>;
  return sucesso ? <p className="w-full text-[11px] text-emerald-300">{sucesso}</p> : null;
}

export function ExamCollectedOnForm({
  examId,
  collectedOn,
}: {
  examId: string;
  collectedOn: string | null | undefined;
}) {
  const [state, action] = useActionState(dataAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="exam_id" value={examId} />
      <label className="text-[11px] text-zinc-500" htmlFor={`coleta-${examId}`}>
        Coleta
      </label>
      <input
        id={`coleta-${examId}`}
        type="date"
        name="collected_on"
        defaultValue={collectedOn ?? ""}
        className="h-7 rounded-md border border-zinc-800 bg-zinc-950 px-2 font-mono text-[11px] text-zinc-300"
      />
      <Enviar label="Salvar" pendente="Salvando…" variant="ghost" />
      <Retorno state={state} />
    </form>
  );
}

export function ExamExtractValuesForm({ examId }: { examId: string }) {
  const [state, action] = useActionState(extrairAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="exam_id" value={examId} />
      <Enviar label="Extrair valores" pendente="Extraindo…" variant="outline" />
      <Retorno
        state={state}
        sucesso={state?.extraidos ? `${state.extraidos} valores extraídos.` : undefined}
      />
    </form>
  );
}
