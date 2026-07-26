import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProfileForm } from "@/components/perfil/profile-form";
import type { Profile } from "@/types/database";
import { demoProfile } from "@/lib/demo/data";
import {
  DEFAULT_TARGET_MAX_MG_DL,
  DEFAULT_TARGET_MIN_MG_DL,
  MIN_TARGET_SPAN_MG_DL,
  TARGET_MAX_CEIL_MG_DL,
  TARGET_MAX_FLOOR_MG_DL,
  TARGET_MIN_CEIL_MG_DL,
  TARGET_MIN_FLOOR_MG_DL,
} from "@/lib/health/glucose-thresholds";

// Perfil dividido em abas (Metabólico / Corpo & peso / Conta) — antes eram 8
// blocos heterogêneos empilhados numa página só. Esta é a aba Metabólico:
// identidade clínica + parâmetros da calculadora de insulina.
export default async function PerfilMetabolicoPage() {
  let profile: Profile | null = null;
  const demoMode = !isSupabaseConfigured();

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
          <ProfileForm submitLabel="Salvar perfil">
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
                  min={TARGET_MIN_FLOOR_MG_DL}
                  max={TARGET_MIN_CEIL_MG_DL}
                  defaultValue={profile?.target_glucose_min ?? DEFAULT_TARGET_MIN_MG_DL}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="target_glucose_max">Meta máx. (mg/dL)</Label>
                <Input
                  id="target_glucose_max"
                  name="target_glucose_max"
                  type="number"
                  min={TARGET_MAX_FLOOR_MG_DL}
                  max={TARGET_MAX_CEIL_MG_DL}
                  defaultValue={profile?.target_glucose_max ?? DEFAULT_TARGET_MAX_MG_DL}
                />
              </div>
            </div>
            <p className="text-xs text-zinc-400">
              Faixa combinada com seu médico. A máxima precisa ficar ao menos{" "}
              {MIN_TARGET_SPAN_MG_DL} mg/dL acima da mínima — ela alimenta o tempo no alvo, o
              mapa de risco e o alerta de hipoglicemia.
            </p>
          </ProfileForm>
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
          <ProfileForm
            submitLabel="Salvar parâmetros"
            successMessage="Parâmetros salvos."
            className="grid gap-4 sm:grid-cols-3"
            spanClassName="sm:col-span-3"
          >
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
          </ProfileForm>
        </CardContent>
      </Card>
    </div>
  );
}
