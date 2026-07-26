"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBodyMeasurement, type ActionResult } from "@/app/actions/body";
import {
  GROUP_LABEL,
  GROUP_ORDER,
  fieldsByGroup,
  type BodyMeasurement,
  measurementValue,
} from "@/lib/body/fields";

async function formAction(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  return saveBodyMeasurement(formData);
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Salvar medição"}
    </Button>
  );
}

/**
 * Formulário das 21 medidas.
 *
 * A medição anterior aparece como **placeholder**, nunca como valor
 * preenchido: campo já preenchido convida a salvar sem medir, e uma série de
 * valores repetidos que ninguém mediu é pior que uma série com buracos — a
 * primeira mente, a segunda só falta.
 */
export function MeasurementForm({
  latest,
  defaultDate,
}: {
  latest: BodyMeasurement | null;
  defaultDate: string;
}) {
  const [state, action] = useActionState(formAction, undefined);

  return (
    <form action={action} className="space-y-5">
      {state?.error ? (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 p-2 text-xs text-red-200">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 p-2 text-xs text-emerald-200">
          Medição salva.
        </p>
      ) : null}

      <div className="grid gap-1 sm:max-w-[220px]">
        <Label htmlFor="measured_on">Data da medição</Label>
        <Input id="measured_on" name="measured_on" type="date" defaultValue={defaultDate} />
      </div>

      {GROUP_ORDER.map((group) => {
        const fields = fieldsByGroup(group);
        if (!fields.length) return null;
        return (
          <fieldset key={group} className="space-y-3">
            <legend className="text-sm font-semibold text-zinc-200">{GROUP_LABEL[group]}</legend>
            {group === "dobra" ? (
              <p className="text-[11px] text-zinc-500">
                Precisam de adipômetro. Com peitoral + abdominal + coxa (homens) ou tricipital +
                supra-ilíaca + coxa (mulheres), a estimativa de gordura passa a usar dobras, que
                erram menos que a fita.
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((field) => {
                const previous = measurementValue(latest, field.key);
                return (
                  <div key={field.key} className="grid gap-1">
                    <Label htmlFor={field.key} className="text-xs">
                      {field.label} <span className="text-zinc-500">({field.unit})</span>
                    </Label>
                    <Input
                      id={field.key}
                      name={field.key}
                      type="text"
                      inputMode="decimal"
                      placeholder={previous != null ? `anterior: ${previous}` : field.unit}
                    />
                    {field.hint ? (
                      <span className="text-[11px] leading-snug text-zinc-500">{field.hint}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <div className="grid gap-1">
        <Label htmlFor="notes" className="text-xs">
          Observações (opcional)
        </Label>
        <Input id="notes" name="notes" placeholder="ex.: medido em jejum, antes do treino" />
      </div>

      <SubmitButton />
      <p className="text-[11px] leading-snug text-zinc-500">
        Meça sempre no mesmo horário e nas mesmas referências. Campo em branco fica registrado como
        &quot;não medido&quot; — o app não repete o valor anterior.
      </p>
    </form>
  );
}
