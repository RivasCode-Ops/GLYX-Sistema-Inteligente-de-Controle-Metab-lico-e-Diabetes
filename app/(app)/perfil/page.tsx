import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { logWeight, updateProfile } from "@/app/actions/profile";
import { AiUsageCard } from "@/components/perfil/ai-usage-card";
import { DataPrivacySection } from "@/components/perfil/data-privacy-section";
import { GoalFeasibilityCard } from "@/components/perfil/goal-feasibility-card";
import { WeightChart } from "@/components/perfil/weight-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GOAL_LABEL, ACTIVITY_LABEL, adaptiveAdjustment, smoothedWeight } from "@/lib/health/energy";
import type { Profile, WeightLog } from "@/types/database";
import { demoProfile } from "@/lib/demo/data";

export default async function PerfilPage() {
  let profile: Profile | null = null;
  let weights: WeightLog[] = [];
  const demoMode = !isSupabaseConfigured();

  async function updateProfileAction(formData: FormData): Promise<void> {
    "use server";
    await updateProfile(formData);
  }

  async function logWeightAction(formData: FormData): Promise<void> {
    "use server";
    await logWeight(formData);
  }

  if (demoMode) {
    profile = demoProfile;
  } else {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
        profile = data as Profile | null;
        const { data: w } = await supabase
          .from("weight_logs")
          .select("*")
          .eq("user_id", user.id)
          .order("logged_on", { ascending: false })
          .limit(20);
        weights = (w ?? []) as WeightLog[];
      }
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <p className="text-sm text-zinc-400">
        Metas clínicas são definidas com seu médico; aqui você organiza preferências no app.
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Perfil metabólico</CardTitle>
          <CardDescription>Dados usados para faixas e alertas iniciais.</CardDescription>
        </CardHeader>
        <CardContent>
          {demoMode ? (
            <p className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
              Perfil fictício da demo para validar campos e metas clínicas iniciais.
            </p>
          ) : null}
          <form action={updateProfileAction} className="grid gap-4">
            <div className="grid gap-1">
              <Label htmlFor="full_name">Nome</Label>
              <Input
                id="full_name"
                name="full_name"
                defaultValue={profile?.full_name ?? ""}
                placeholder="Seu nome"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="diabetes_type">Tipo / contexto</Label>
              <Input
                id="diabetes_type"
                name="diabetes_type"
                defaultValue={profile?.diabetes_type ?? ""}
                placeholder="ex.: DM2, gestacional…"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="target_glucose_min">Meta mín. (mg/dL)</Label>
                <Input
                  id="target_glucose_min"
                  name="target_glucose_min"
                  type="number"
                  defaultValue={profile?.target_glucose_min ?? 70}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="target_glucose_max">Meta máx. (mg/dL)</Label>
                <Input
                  id="target_glucose_max"
                  name="target_glucose_max"
                  type="number"
                  defaultValue={profile?.target_glucose_max ?? 180}
                />
              </div>
            </div>
            <Button type="submit">Salvar perfil</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Objetivo corporal</CardTitle>
          <CardDescription>
            Base para metas de calorias/proteína e para a análise de viabilidade. Mudanças de dieta
            com insulina/sulfonilureia pedem aval médico.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateProfileAction} className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="body_goal">Objetivo</Label>
              <select
                id="body_goal"
                name="body_goal"
                defaultValue={profile?.body_goal ?? ""}
                className="h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
              >
                <option value="">Selecione…</option>
                {Object.entries(GOAL_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="activity_level">Nível de atividade</Label>
              <select
                id="activity_level"
                name="activity_level"
                defaultValue={profile?.activity_level ?? ""}
                className="h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
              >
                <option value="">Selecione…</option>
                {Object.entries(ACTIVITY_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="sex">Sexo</Label>
              <select
                id="sex"
                name="sex"
                defaultValue={profile?.sex ?? ""}
                className="h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
              >
                <option value="">Selecione…</option>
                <option value="m">Masculino</option>
                <option value="f">Feminino</option>
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="birth_year">Ano de nascimento</Label>
              <Input
                id="birth_year"
                name="birth_year"
                type="number"
                defaultValue={profile?.birth_year ?? ""}
                placeholder="ex.: 1975"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="height_cm">Altura (cm)</Label>
              <Input
                id="height_cm"
                name="height_cm"
                type="number"
                defaultValue={profile?.height_cm ?? ""}
                placeholder="ex.: 172"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="target_weight_kg">Peso-meta (kg, opcional)</Label>
              <Input
                id="target_weight_kg"
                name="target_weight_kg"
                type="number"
                step="0.1"
                defaultValue={profile?.target_weight_kg ?? ""}
                placeholder="ex.: 78"
              />
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <Label htmlFor="family_history">Histórico familiar (opcional)</Label>
              <Input
                id="family_history"
                name="family_history"
                defaultValue={profile?.family_history ?? ""}
                placeholder="ex.: diabetes e hipertensão na família"
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Salvar objetivo</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Peso</CardTitle>
          <CardDescription>Pese-se 1x por semana, de manhã — a análise usa a tendência.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!demoMode ? (
            <form action={logWeightAction} className="flex items-center gap-2">
              <Input
                name="weight_kg"
                type="number"
                step="0.1"
                min={20}
                placeholder="peso de hoje (kg)"
                className="h-9 w-44"
                required
              />
              <Button type="submit" variant="outline" size="sm">
                Registrar
              </Button>
            </form>
          ) : null}
          <WeightChart logs={weights} targetKg={profile?.target_weight_kg} />
          {weights.length ? (
            <div className="flex flex-wrap gap-2">
              {weights.slice(0, 8).map((w, i) => (
                <span
                  key={w.id}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    i === 0
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400"
                  }`}
                >
                  {Number(w.weight_kg).toFixed(1)} kg ·{" "}
                  {new Date(w.logged_on + "T12:00:00").toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Nenhuma pesagem registrada ainda.</p>
          )}
          {(() => {
            if (!profile?.body_goal || profile.body_goal === "maintain" || weights.length < 4)
              return null;
            const points = weights.map((w) => ({
              weightKg: Number(w.weight_kg),
              loggedOn: w.logged_on,
            }));
            const adj = adaptiveAdjustment(points, profile.body_goal, points[0].weightKg);
            const trend = smoothedWeight(points);
            if (!adj) return null;
            return (
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-zinc-300">
                <p className="font-medium text-sky-300">
                  Check-in automático · tendência {trend} kg
                </p>
                <p className="mt-1">
                  Ritmo real: {adj.observedWeeklyKg} kg/sem (plano: {adj.plannedWeeklyKg} kg/sem).{" "}
                  {adj.reason}
                  {adj.deltaKcal !== 0
                    ? ` Sugestão: ${adj.deltaKcal > 0 ? "+" : ""}${adj.deltaKcal} kcal/dia.`
                    : ""}
                </p>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {!demoMode ? <GoalFeasibilityCard /> : null}
      {!demoMode ? <AiUsageCard /> : null}
      {!demoMode ? <DataPrivacySection /> : null}
    </div>
  );
}
