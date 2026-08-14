"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhotoCaptureField } from "@/components/ui/photo-capture-field";
import { saveBodyPhotos, type ActionResult } from "@/app/actions/body";

const POSES: { name: string; label: string }[] = [
  { name: "frente", label: "Frente" },
  { name: "costas", label: "Costas" },
  { name: "perfil_esq", label: "Perfil esquerdo" },
  { name: "perfil_dir", label: "Perfil direito" },
];

async function formAction(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    return await saveBodyPhotos(formData);
  } catch {
    // Falha de transporte (envio recusado por tamanho, rede caindo) rejeita a
    // promessa antes de a action rodar. Sem este catch o formulário só quebrava,
    // sem dizer nada — que era exatamente o sintoma relatado.
    return {
      error: "Não consegui enviar as fotos. Envie menos poses de uma vez ou tente de novo.",
    };
  }
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Enviando…" : "Salvar fotos"}
    </Button>
  );
}

export function PhotoUploadForm({ defaultDate }: { defaultDate: string }) {
  const [state, action] = useActionState(formAction, undefined);

  return (
    <form action={action} className="space-y-4">
      {state?.error ? (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 p-2 text-xs text-red-200">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 p-2 text-xs text-emerald-200">
          Fotos salvas.
        </p>
      ) : null}

      <div className="grid gap-1 sm:max-w-[220px]">
        <Label htmlFor="taken_on">Data das fotos</Label>
        <Input id="taken_on" name="taken_on" type="date" defaultValue={defaultDate} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {POSES.map((pose) => (
          <div key={pose.name} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <p className="mb-2 text-xs font-medium text-zinc-300">{pose.label}</p>
            <PhotoCaptureField name={pose.name} accept="image/*" />
          </div>
        ))}
      </div>

      <SubmitButton />
      <p className="text-[11px] leading-snug text-zinc-500">
        Mesma luz, mesma distância, mesma roupa e mesmo horário — foto de progresso comparável
        depende mais disso que da câmera. As imagens ficam num bucket privado, visíveis só para
        você.
      </p>
    </form>
  );
}
