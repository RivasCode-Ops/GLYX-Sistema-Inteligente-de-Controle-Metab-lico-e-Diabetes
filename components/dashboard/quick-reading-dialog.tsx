"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addGlucoseReading, type ActionResult } from "@/app/actions/glucose";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Salvar"}
    </Button>
  );
}

async function formAction(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  return addGlucoseReading(formData);
}

export function QuickReadingDialog() {
  const [state, action] = useActionState(formAction, undefined);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Registrar leitura
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar glicemia</DialogTitle>
          <DialogDescription>
            Registro rápido — também disponível em &quot;Glicemia&quot; para mais detalhes.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3">
          {state?.error ? (
            <p className="rounded-lg border border-red-900/60 bg-red-950/40 p-2 text-xs text-red-200">
              {state.error}
            </p>
          ) : null}
          {state?.ok ? (
            <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 p-2 text-xs text-emerald-200">
              Leitura salva.
            </p>
          ) : null}
          <div className="grid gap-1">
            <Label htmlFor="value_mg_dl">Valor (mg/dL)</Label>
            <Input
              id="value_mg_dl"
              name="value_mg_dl"
              type="number"
              required
              min={20}
              max={600}
              placeholder="ex.: 112"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="context">Contexto</Label>
            <select
              id="context"
              name="context"
              className="flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
              defaultValue=""
            >
              <option value="">—</option>
              <option value="jejum">Jejum</option>
              <option value="pos_refeicao">Pós-refeição</option>
              <option value="antes_dormir">Antes de dormir</option>
            </select>
          </div>
          <SubmitButton />
        </form>
      </DialogContent>
    </Dialog>
  );
}
