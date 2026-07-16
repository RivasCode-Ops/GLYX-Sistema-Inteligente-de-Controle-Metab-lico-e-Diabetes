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
import { addInsulinLog, type ActionResult } from "@/app/actions/insulin";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Registrar dose"}
    </Button>
  );
}

async function formAction(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  return addInsulinLog(formData);
}

const SELECT_CLASS =
  "flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60";

/**
 * Registro rápido de insulina extra (correção/refeição). O app só ANOTA a
 * dose que o usuário aplicou conforme orientação médica — não calcula nem
 * sugere quantidade; a IA usa o registro para contextualizar as análises.
 */
export function InsulinQuickDialog({ latestGlucose }: { latestGlucose?: number | null }) {
  const [state, action] = useActionState(formAction, undefined);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          💉 Insulina extra
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar insulina extra</DialogTitle>
          <DialogDescription>
            Anote a dose que você aplicou conforme a orientação do seu médico — o GLYX registra
            para acompanhar o efeito, mas nunca sugere quantidade.
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
              Dose registrada.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="units">Unidades (U)</Label>
              <Input
                id="units"
                name="units"
                type="number"
                required
                min={0.5}
                max={100}
                step={0.5}
                placeholder="ex.: 4"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="insulin_kind">Tipo</Label>
              <select id="insulin_kind" name="insulin_kind" className={SELECT_CLASS} defaultValue="rapida">
                <option value="rapida">Rápida</option>
                <option value="basal">Basal</option>
                <option value="outra">Outra</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="reason">Motivo</Label>
              <select id="reason" name="reason" className={SELECT_CLASS} defaultValue="correcao">
                <option value="correcao">Correção (glicemia alta)</option>
                <option value="refeicao">Refeição</option>
                <option value="outra">Outro</option>
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="glucose_mg_dl">Glicemia agora (opcional)</Label>
              <Input
                id="glucose_mg_dl"
                name="glucose_mg_dl"
                type="number"
                min={20}
                max={600}
                defaultValue={latestGlucose ?? undefined}
                placeholder="mg/dL"
              />
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="notes">Observação (opcional)</Label>
            <Input id="notes" name="notes" maxLength={300} placeholder="ex.: 2h após o almoço" />
          </div>
          <SubmitButton />
        </form>
      </DialogContent>
    </Dialog>
  );
}
