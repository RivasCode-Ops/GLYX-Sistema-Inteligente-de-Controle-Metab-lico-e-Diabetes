"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addMeal } from "@/app/actions/meals";
import { QUICK_FOOD_PRESETS, type QuickFoodPreset } from "@/lib/data/quick-food-presets";

/** Registro em 1 toque de lanches/bebidas fora do fluxo de foto — mesma
 * lógica de sempre (meals.eaten_at = agora), então entra automaticamente
 * na detecção de pico glicêmico pós-refeição já existente no banco. */
export function QuickExtrasCard() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customCarbs, setCustomCarbs] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  function logPreset(preset: QuickFoodPreset) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", preset.name);
      fd.set("calories", String(preset.calories));
      fd.set("carbs_g", String(preset.carbs_g));
      fd.set("protein_g", String(preset.protein_g));
      fd.set("fat_g", String(preset.fat_g));
      const res = await addMeal(fd);
      setStatus(res.error ?? `${preset.name} registrado.`);
      if (!res.error) router.refresh();
    });
  }

  function logCustom() {
    if (!customName.trim()) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", customName.trim());
      if (customCarbs) fd.set("carbs_g", customCarbs);
      const res = await addMeal(fd);
      setStatus(res.error ?? `${customName.trim()} registrado.`);
      if (!res.error) {
        setCustomName("");
        setCustomCarbs("");
        setCustomOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Extras</CardTitle>
        <CardDescription>Um lanche, uma bebida — sem precisar de foto.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {QUICK_FOOD_PRESETS.map((p) => (
            <Button
              key={p.id}
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => logPreset(p)}
            >
              {p.name}
            </Button>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setCustomOpen((v) => !v)}>
            + Outro
          </Button>
        </div>
        {customOpen ? (
          <div className="flex flex-wrap items-end gap-2 border-t border-zinc-800 pt-3">
            <div className="grid gap-1">
              <label htmlFor="quick_extra_name" className="text-xs text-zinc-500">
                O que foi?
              </label>
              <Input
                id="quick_extra_name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="ex.: Bolo de fubá"
                className="h-9 w-40 text-sm"
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor="quick_extra_carbs" className="text-xs text-zinc-500">
                Carbo (g)
              </label>
              <Input
                id="quick_extra_carbs"
                type="number"
                value={customCarbs}
                onChange={(e) => setCustomCarbs(e.target.value)}
                className="h-9 w-20 text-sm"
              />
            </div>
            <Button type="button" size="sm" disabled={pending || !customName.trim()} onClick={logCustom}>
              Registrar
            </Button>
          </div>
        ) : null}
        {status ? <p className="text-xs text-emerald-300">{status}</p> : null}
      </CardContent>
    </Card>
  );
}
