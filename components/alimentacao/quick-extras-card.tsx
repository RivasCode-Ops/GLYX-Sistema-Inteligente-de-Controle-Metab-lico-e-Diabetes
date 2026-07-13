"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addMeal } from "@/app/actions/meals";

/** Registro livre de lanches/bebidas fora do fluxo de foto — mesma lógica
 * de sempre (meals.eaten_at = agora), então entra automaticamente na
 * detecção de pico glicêmico pós-refeição já existente no banco. */
export function QuickExtrasCard() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [carbs, setCarbs] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", name.trim());
      if (carbs) fd.set("carbs_g", carbs);
      const res = await addMeal(fd);
      setStatus(res.error ?? `${name.trim()} registrado.`);
      if (!res.error) {
        setName("");
        setCarbs("");
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Extras</CardTitle>
        <CardDescription>Um lanche, uma bebida — o que não passou pela foto.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {open ? (
          <div className="space-y-3">
            <div className="grid gap-1">
              <Label htmlFor="quick_extra_name">O que foi?</Label>
              <Input
                id="quick_extra_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex.: 2 maçãs"
                autoFocus
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="quick_extra_carbs">Carbo (g) — opcional</Label>
              <Input
                id="quick_extra_carbs"
                type="number"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                className="w-24"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={pending || !name.trim()} onClick={submit}>
                {pending ? "Registrando…" : "Registrar"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            + Adicionar extra
          </Button>
        )}
        {status ? <p className="text-xs text-emerald-300">{status}</p> : null}
      </CardContent>
    </Card>
  );
}
