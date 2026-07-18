"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addMeal } from "@/app/actions/meals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";

/** "2026-07-18T13:04" no fuso local do navegador — valor inicial do
 * datetime-local, pra já vir preenchido com "agora" mas editável. */
function nowLocalInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewMealForm() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [carbs, setCarbs] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [eatenAt, setEatenAt] = useState(nowLocalInputValue);
  const [estimating, setEstimating] = useState(false);
  const [saving, setSaving] = useState(false);
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
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setEstimating(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      setStatus("Digite o nome da refeição antes de salvar.");
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const fd = new FormData();
      fd.set("name", name.trim());
      if (calories) fd.set("calories", calories);
      if (carbs) fd.set("carbs_g", carbs);
      if (protein) fd.set("protein_g", protein);
      if (fat) fd.set("fat_g", fat);
      if (eatenAt) fd.set("eaten_at_local", eatenAt);
      const res = await addMeal(fd);
      if (res.error) {
        setStatus(res.error);
        return;
      }
      setName("");
      setCalories("");
      setCarbs("");
      setProtein("");
      setFat("");
      setEatenAt(nowLocalInputValue());
      toast("Refeição salva.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="name">Nome</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex.: Almoço, omelete de 2 ovos com frango desfiado"
        />
      </div>
      <div className="sm:col-span-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={estimating || !name.trim()}
          onClick={() => void estimate()}
        >
          {estimating ? "Estimando…" : "✨ Estimar calorias/macros com IA"}
        </Button>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="calories">Calorias</Label>
        <Input id="calories" type="number" min={0} value={calories} onChange={(e) => setCalories(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="carbs_g">Carboidratos (g)</Label>
        <Input id="carbs_g" type="number" step="0.1" min={0} value={carbs} onChange={(e) => setCarbs(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="protein_g">Proteína (g)</Label>
        <Input id="protein_g" type="number" step="0.1" min={0} value={protein} onChange={(e) => setProtein(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="fat_g">Gordura (g)</Label>
        <Input id="fat_g" type="number" step="0.1" min={0} value={fat} onChange={(e) => setFat(e.target.value)} />
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="eaten_at">Horário real da refeição</Label>
        <Input id="eaten_at" type="datetime-local" value={eatenAt} onChange={(e) => setEatenAt(e.target.value)} />
        <p className="text-[11px] text-zinc-600">
          Registrando depois de ter comido? Ajuste aqui — sem isso o app grava &quot;agora&quot;, o que pode
          desalinhar a detecção de pico glicêmico pós-refeição.
        </p>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando…" : "Salvar refeição"}
        </Button>
      </div>
      {status ? <p className="text-xs text-amber-300 sm:col-span-2">{status}</p> : null}
      {!calories && !carbs && !protein && !fat ? (
        <p className="text-[11px] text-zinc-600 sm:col-span-2">
          Sem estimar nem preencher os campos, essa refeição não vai contar nos totais de hoje.
        </p>
      ) : null}
    </form>
  );
}
