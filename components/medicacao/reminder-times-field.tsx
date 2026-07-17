"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// Seletor de horários de dose: várias linhas de relógio nativo + botão de
// adicionar — substitui o campo de texto "08:00, 20:00" (ruim no celular).
// Publica o valor num input escondido no formato que a action já entende.

export function ReminderTimesField({
  name = "reminder_times",
  defaultTimes = [],
  onChange,
}: {
  name?: string;
  defaultTimes?: string[];
  /** Para formulários controlados (ex.: cadastro por foto). */
  onChange?: (joined: string) => void;
}) {
  const [times, setTimes] = useState<string[]>(defaultTimes.length ? defaultTimes : []);

  function publish(next: string[]) {
    setTimes(next);
    onChange?.(next.filter(Boolean).join(", "));
  }

  function setAt(i: number, value: string) {
    publish(times.map((t, idx) => (idx === i ? value : t)));
  }

  function removeAt(i: number) {
    publish(times.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={times.filter(Boolean).join(", ")} />
      {times.length === 0 ? (
        <p className="text-xs text-zinc-600">Sem alarmes — adicione os horários das doses.</p>
      ) : null}
      {times.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="time"
            value={t}
            onChange={(e) => setAt(i, e.target.value)}
            className="h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 [color-scheme:dark]"
          />
          <button
            type="button"
            onClick={() => removeAt(i)}
            aria-label={`Remover horário ${t || i + 1}`}
            className="rounded-md px-2 py-1 text-xs text-zinc-600 transition hover:bg-red-950/50 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => publish([...times, ""])}>
        + adicionar horário
      </Button>
    </div>
  );
}
