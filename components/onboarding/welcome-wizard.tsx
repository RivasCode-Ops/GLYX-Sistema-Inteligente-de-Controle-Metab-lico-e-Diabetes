"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACTIVITY_LABEL } from "@/lib/health/energy";

type Focus = "diabetes" | "lose" | "gain";

const FOCUS_OPTIONS: { value: Focus; emoji: string; title: string; desc: string }[] = [
  {
    value: "diabetes",
    emoji: "🩸",
    title: "Controlar o diabetes",
    desc: "Glicemia estável, medicação em dia e alimentação consciente",
  },
  {
    value: "lose",
    emoji: "⚖️",
    title: "Emagrecer",
    desc: "Perder gordura com segurança — com ou sem diabetes",
  },
  {
    value: "gain",
    emoji: "💪",
    title: "Ganhar massa muscular",
    desc: "Treino, proteína e carboidrato no momento certo",
  },
];

export function WelcomeWizard({
  action,
}: {
  action: (formData: FormData) => Promise<{ ok?: true; error?: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    diabetes_type: "",
    sex: "",
    birth_year: "",
    height_cm: "",
    activity_level: "",
    weight_kg: "",
    target_weight_kg: "",
  });

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function submit() {
    if (!focus) return;
    const fd = new FormData();
    fd.set("primary_focus", focus);
    Object.entries(form).forEach(([k, v]) => {
      if (v) fd.set(k, v);
    });
    startTransition(async () => {
      const res = await action(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-1.5">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-emerald-500" : "bg-zinc-800"}`}
          />
        ))}
      </div>

      {step === 1 ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-100">O que te traz ao GLYX?</h2>
          {FOCUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                setFocus(o.value);
                setStep(2);
              }}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                focus === o.value
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-600"
              }`}
            >
              <p className="text-base font-medium text-zinc-100">
                {o.emoji} {o.title}
              </p>
              <p className="mt-0.5 text-sm text-zinc-500">{o.desc}</p>
            </button>
          ))}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-100">Sobre você</h2>
          <p className="text-sm text-zinc-500">
            Usado nos cálculos de meta — tudo opcional, tudo editável depois no Perfil.
          </p>
          {focus === "diabetes" ? (
            <div className="grid gap-1">
              <Label>Tipo de diabetes</Label>
              <Input
                value={form.diabetes_type}
                onChange={(e) => set("diabetes_type", e.target.value)}
                placeholder="ex.: DM2, DM1, pré-diabetes, gestacional"
              />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Sexo</Label>
              <select
                value={form.sex}
                onChange={(e) => set("sex", e.target.value)}
                className="h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
              >
                <option value="">—</option>
                <option value="m">Masculino</option>
                <option value="f">Feminino</option>
              </select>
            </div>
            <div className="grid gap-1">
              <Label>Ano de nascimento</Label>
              <Input
                type="number"
                value={form.birth_year}
                onChange={(e) => set("birth_year", e.target.value)}
                placeholder="1975"
              />
            </div>
            <div className="grid gap-1">
              <Label>Altura (cm)</Label>
              <Input
                type="number"
                value={form.height_cm}
                onChange={(e) => set("height_cm", e.target.value)}
                placeholder="172"
              />
            </div>
            <div className="grid gap-1">
              <Label>Atividade física</Label>
              <select
                value={form.activity_level}
                onChange={(e) => set("activity_level", e.target.value)}
                className="h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
              >
                <option value="">—</option>
                {Object.entries(ACTIVITY_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Voltar
            </Button>
            <Button onClick={() => setStep(3)}>Continuar</Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-100">Ponto de partida</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Peso hoje (kg)</Label>
              <Input
                type="number"
                step="0.1"
                value={form.weight_kg}
                onChange={(e) => set("weight_kg", e.target.value)}
                placeholder="ex.: 86.5"
              />
            </div>
            {focus !== "diabetes" ? (
              <div className="grid gap-1">
                <Label>Peso desejado (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.target_weight_kg}
                  onChange={(e) => set("target_weight_kg", e.target.value)}
                  placeholder="ex.: 78"
                />
              </div>
            ) : null}
          </div>
          <p className="text-[11px] leading-4 text-zinc-600">
            O GLYX é educativo e não substitui seu médico — metas e tratamento são decisões
            clínicas.
          </p>
          {error ? <p className="text-xs text-red-300">{error}</p> : null}
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Voltar
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Preparando seu app…" : "Começar a usar 🚀"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
