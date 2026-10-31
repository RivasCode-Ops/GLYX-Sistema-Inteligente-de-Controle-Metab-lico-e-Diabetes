import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReporEstoqueForm } from "@/components/medicacao/repor-estoque-form";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { stockLabel, stockState, unidadesRestantes, type MedicationStock } from "@/lib/medications/stock";

// Tela de reposição de UM item — destino do aviso "Hora de repor" e do card
// de estoque baixo (estoque-repor, 31/10/2026).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReporEstoquePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id) || !isSupabaseConfigured()) notFound();

  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) notFound();

  const { data: med } = await supabase
    .from("medications")
    .select(
      "id, name, dosage, kind, active, stock_units, stock_updated_on, reminder_times, cadence, cadence_weekday, cadence_interval_days, cadence_anchor_on"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!med) notFound();

  const m = med as MedicationStock & { id: string; name: string; dosage: string | null; kind: string | null; active: boolean };
  const suplemento = m.kind === "supplement";
  const situacao = stockLabel(stockState(m), suplemento);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Repor estoque: {m.name}
            {m.dosage ? <span className="text-zinc-500"> · {m.dosage}</span> : null}
          </CardTitle>
          <CardDescription>
            {situacao ?? "Sem estoque informado ainda. Informe quanto tem para o app avisar quando estiver acabando."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {m.active ? (
            <ReporEstoqueForm medicationId={m.id} restantes={unidadesRestantes(m)} unidade="unidades" />
          ) : (
            <p className="text-sm text-zinc-400">Este item está desativado. Reative em Meus medicamentos para controlar o estoque.</p>
          )}
        </CardContent>
      </Card>
      <Link href="/medicacao/medicamentos" className="block text-sm text-zinc-400 underline">
        Ver todos os medicamentos
      </Link>
    </div>
  );
}
