import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "@/app/actions/profile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Profile } from "@/types/database";
import { demoProfile } from "@/lib/demo/data";

// Perfil dividido em abas (Metabólico / Corpo & peso / Conta) — antes eram 8
// blocos heterogêneos empilhados numa página só. Esta é a aba Metabólico:
// identidade clínica + parâmetros da calculadora de insulina.
export default async function PerfilMetabolicoPage() {
  let profile: Profile | null = null;
  const demoMode = !isSupabaseConfigured();

  async function updateProfileAction(formData: FormData): Promise<void> {
    "use server";
    await updateProfile(formData);
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
          <CardTitle className="text-base">Calculadora de dose de insulina</CardTitle>
          <CardDescription>
            Defina com seu endocrinologista — sem esses valores, a calculadora em Medicação não
            aparece. Nunca ajuste dose sem orientação médica.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateProfileAction} className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1">
              <Label htmlFor="carb_ratio">Razão carbo/insulina (g por 1U)</Label>
              <Input
                id="carb_ratio"
                name="carb_ratio"
                type="number"
                step="0.1"
                defaultValue={profile?.carb_ratio ?? ""}
                placeholder="ex.: 15"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="correction_factor">Fator de correção (mg/dL por 1U)</Label>
              <Input
                id="correction_factor"
                name="correction_factor"
                type="number"
                step="0.1"
                defaultValue={profile?.correction_factor ?? ""}
                placeholder="ex.: 30"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="target_glucose_bolus">Meta pra correção (mg/dL)</Label>
              <Input
                id="target_glucose_bolus"
                name="target_glucose_bolus"
                type="number"
                defaultValue={profile?.target_glucose_bolus ?? ""}
                placeholder="ex.: 100"
              />
            </div>
            <div className="sm:col-span-3">
              <Button type="submit">Salvar parâmetros</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
