import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { saveHypoPlan } from "@/app/actions/hypo-plan";
import { resolveGlucoseTargets } from "@/lib/health/glucose-thresholds";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Cadastro do plano de hipoglicemia.
 *
 * A tela existe porque o card do painel se recusa a sugerir conduta: sem plano
 * cadastrado ele diz "plano não configurado" e traz para cá. O que a pessoa
 * escreve aqui é o que aparece na tela dela numa hipoglicemia — literal, sem
 * passar pela IA.
 *
 * O único campo pré-preenchido é o limiar, e vem do que ela JÁ configurou como
 * limite inferior da faixa alvo. É sugestão de partida vinda dos dados dela
 * própria, não número escolhido pelo app.
 */
export default async function PlanoHipoglicemiaPage() {
  let plano: {
    correction_text: string;
    recheck_minutes: number;
    threshold_mg_dl: number;
    emergency_text: string | null;
  } | null = null;
  let limiteInferior = 70;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const [{ data: p }, { data: perfil }] = await Promise.all([
          supabase
            .from("hypo_plan")
            .select("correction_text, recheck_minutes, threshold_mg_dl, emergency_text")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("profiles")
            .select("target_glucose_min, target_glucose_max")
            .eq("id", user.id)
            .maybeSingle(),
        ]);
        plano = p ?? null;
        limiteInferior = resolveGlucoseTargets(perfil).targetMin;
      }
    }
  }

  async function salvar(formData: FormData): Promise<void> {
    "use server";
    await saveHypoPlan(formData);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/perfil" className="inline-block text-sm text-emerald-400 hover:underline">
        ← Perfil
      </Link>

      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Meu plano de hipoglicemia</h1>
        <p className="mt-1 text-sm text-zinc-400">
          O que você combinou com seu médico para quando a glicemia cair. O GLYX mostra este texto
          exatamente como você escrever — ele não sugere conduta, não calcula quantidade e não
          altera o que está aqui.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form action={salvar} className="grid gap-5">
            <div className="grid gap-1">
              <Label htmlFor="correction_text">O que eu faço quando cai</Label>
              <textarea
                id="correction_text"
                name="correction_text"
                required
                rows={4}
                defaultValue={plano?.correction_text ?? ""}
                placeholder="Escreva com as suas palavras o que seu médico orientou."
                className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
              <p className="text-[11px] text-zinc-600">
                Este texto aparece na tela sem nenhuma alteração, e sem passar pela IA.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="threshold_mg_dl">Abaixo de quanto o alerta aparece (mg/dL)</Label>
                <Input
                  id="threshold_mg_dl"
                  name="threshold_mg_dl"
                  type="number"
                  required
                  min={50}
                  max={100}
                  defaultValue={plano?.threshold_mg_dl ?? limiteInferior}
                />
                <p className="text-[11px] text-zinc-600">
                  Sugerido a partir do limite inferior da sua faixa alvo ({limiteInferior} mg/dL).
                  Confirme com seu médico.
                </p>
              </div>

              <div className="grid gap-1">
                <Label htmlFor="recheck_minutes">Reavaliar depois de (minutos)</Label>
                <Input
                  id="recheck_minutes"
                  name="recheck_minutes"
                  type="number"
                  required
                  min={5}
                  max={60}
                  defaultValue={plano?.recheck_minutes ?? 15}
                />
                <p className="text-[11px] text-zinc-600">
                  O app lembra de medir de novo depois desse tempo.
                </p>
              </div>
            </div>

            <div className="grid gap-1">
              <Label htmlFor="emergency_text">Emergência (opcional)</Label>
              <textarea
                id="emergency_text"
                name="emergency_text"
                rows={2}
                defaultValue={plano?.emergency_text ?? ""}
                placeholder="Contato ou orientação para o caso de não melhorar."
                className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit">{plano ? "Atualizar plano" : "Salvar plano"}</Button>
              {plano ? (
                <span className="text-xs text-emerald-400">Plano cadastrado</span>
              ) : (
                <span className="text-xs text-amber-300">Ainda sem plano cadastrado</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="text-[11px] leading-4 text-zinc-600">
        Ajuste de conduta em hipoglicemia é decisão médica. Este cadastro serve para o app repetir
        na hora certa o que já foi combinado com seu médico — nada aqui é recomendação do GLYX.
      </p>
    </div>
  );
}
