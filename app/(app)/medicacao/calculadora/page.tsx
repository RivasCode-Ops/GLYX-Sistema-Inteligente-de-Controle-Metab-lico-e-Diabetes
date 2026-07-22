import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BolusCalculatorForm } from "@/components/medicacao/bolus-calculator-form";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function CalculadoraDosePage() {
  let carbRatio: number | null = null;
  let correctionFactor: number | null = null;
  let targetGlucose: number | null = null;
  let latestGlucose: number | null = null;
  let targetGlucoseMin: number | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const [{ data: profile }, { data: glucose }] = await Promise.all([
          supabase
            .from("profiles")
            .select("carb_ratio, correction_factor, target_glucose_bolus, target_glucose_min")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("glucose_readings")
            .select("value_mg_dl")
            .eq("user_id", user.id)
            .order("recorded_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        carbRatio = profile?.carb_ratio ?? null;
        correctionFactor = profile?.correction_factor ?? null;
        targetGlucose = profile?.target_glucose_bolus ?? null;
        targetGlucoseMin = profile?.target_glucose_min ?? null;
        latestGlucose = glucose?.value_mg_dl ?? null;
      }
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <p className="text-sm text-zinc-400">
        Calcula a dose de insulina rápida a partir do carboidrato da refeição e da glicemia atual.
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calculadora de dose</CardTitle>
          <CardDescription>Dose sugerida em unidades — sempre revise antes de aplicar.</CardDescription>
        </CardHeader>
        <CardContent>
          {carbRatio ? (
            <BolusCalculatorForm
              carbRatio={carbRatio}
              correctionFactor={correctionFactor}
              targetGlucose={targetGlucose}
              latestGlucose={latestGlucose}
              targetGlucoseMin={targetGlucoseMin}
            />
          ) : (
            <p className="rounded-xl border border-amber-900/60 bg-amber-950/40 p-3 text-xs text-amber-200">
              Configure a razão carbo/insulina em{" "}
              <Link href="/perfil" className="underline">
                Perfil
              </Link>{" "}
              antes de usar a calculadora.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
