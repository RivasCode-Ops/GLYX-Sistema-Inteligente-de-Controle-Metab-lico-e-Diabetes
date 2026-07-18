"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addMeal } from "@/app/actions/meals";
import { useToast } from "@/components/ui/toast-provider";

/** Registro livre de lanches/bebidas fora do fluxo de foto — mesma lógica
 * de sempre (meals.eaten_at = agora), então entra automaticamente na
 * detecção de pico glicêmico pós-refeição já existente no banco.
 *
 * Sem estimativa, calorias/proteína/gordura ficam nulas e a refeição some
 * dos totais do dia sem aviso nenhum — por isso o botão "Estimar com IA"
 * (opcional, mas visível) em vez de só o campo de carboidrato solto. */
export function QuickExtrasCard() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [carbs, setCarbs] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [estimated, setEstimated] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function estimate() {
    if (!name.trim()) return;
    setEstimating(true);
    setStatus(null);
    try {
      const res = await fetch("/api/ai/meal-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: name.trim() }),
      });
      const data = (await res.json()) as {
        meal?: { calories: number; carbs_g: number; protein_g: number; fat_g: number };
        error?: string;
      };
      if (!res.ok || !data.meal) {
        setStatus(data.error ?? "Falha ao estimar.");
        return;
      }
      setCalories(String(data.meal.calories));
      setCarbs(String(data.meal.carbs_g));
      setProtein(String(data.meal.protein_g));
      setFat(String(data.meal.fat_g));
      setEstimated(true);
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setEstimating(false);
    }
  }

  function submit() {
    if (!name.trim()) {
      setStatus("Digite o que foi antes de registrar.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", name.trim());
      if (carbs) fd.set("carbs_g", carbs);
      if (calories) fd.set("calories", calories);
      if (protein) fd.set("protein_g", protein);
      if (fat) fd.set("fat_g", fat);
      const res = await addMeal(fd);
      if (res.error) {
        setStatus(res.error);
      } else {
        setStatus(null);
        toast(`${name.trim()} registrado.`);
        setName("");
        setCarbs("");
        setCalories("");
        setProtein("");
        setFat("");
        setEstimated(false);
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
                onChange={(e) => {
                  setName(e.target.value);
                  setEstimated(false);
                }}
                placeholder="ex.: 2 maçãs, omelete de 2 ovos com frango desfiado"
                autoFocus
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={estimating || pending || !name.trim()}
              onClick={() => void estimate()}
            >
              {estimating ? "Estimando…" : "✨ Estimar calorias/macros com IA"}
            </Button>
            {estimated ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="grid gap-1">
                  <Label htmlFor="quick_extra_cal">kcal</Label>
                  <Input id="quick_extra_cal" type="number" value={calories} onChange={(e) => setCalories(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="quick_extra_carbs">Carbo (g)</Label>
                  <Input id="quick_extra_carbs" type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="quick_extra_protein">Proteína (g)</Label>
                  <Input id="quick_extra_protein" type="number" value={protein} onChange={(e) => setProtein(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="quick_extra_fat">Gordura (g)</Label>
                  <Input id="quick_extra_fat" type="number" value={fat} onChange={(e) => setFat(e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="grid gap-1">
                <Label htmlFor="quick_extra_carbs_only">Carbo (g) — opcional, sem estimativa por IA</Label>
                <Input
                  id="quick_extra_carbs_only"
                  type="number"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  className="w-24"
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={pending} onClick={submit}>
                {pending ? "Registrando…" : "Registrar"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
                Cancelar
              </Button>
            </div>
            {!estimated ? (
              <p className="text-[11px] text-zinc-600">
                Sem estimar, só o carboidrato (se preenchido) conta nos totais do dia — calorias e
                proteína ficam de fora.
              </p>
            ) : null}
          </div>
        ) : (
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            + Adicionar extra
          </Button>
        )}
        {status ? <p className="text-xs text-amber-300">{status}</p> : null}
      </CardContent>
    </Card>
  );
}
