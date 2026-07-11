import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { addMedication, logMedicationTaken } from "@/app/actions/medications";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCards } from "@/components/module/section-cards";
import type { Medication } from "@/types/database";
import { demoMedications } from "@/lib/demo/data";

export default async function MedicacaoOverviewPage() {
  let meds: Medication[] = [];
  const demoMode = !isSupabaseConfigured();

  async function addMedicationAction(formData: FormData): Promise<void> {
    "use server";
    await addMedication(formData);
  }

  async function logMedicationTakenAction(formData: FormData): Promise<void> {
    "use server";
    await logMedicationTaken(formData);
  }

  if (demoMode) {
    meds = demoMedications;
  } else {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("medications")
          .select("*")
          .eq("user_id", user.id)
          .eq("active", true)
          .order("created_at", { ascending: false });
        meds = (data ?? []) as Medication[];
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <SectionCards
        items={[
          {
            title: "Agenda",
            description: "Linha do tempo de doses.",
            href: "/medicacao/agenda",
          },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar medicamento</CardTitle>
          <CardDescription>Ajustes terapêuticos só com seu médico.</CardDescription>
        </CardHeader>
        <CardContent>
          {demoMode ? (
            <p className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
              Demo pública: medicamentos e doses são fictícios. Ajustes terapêuticos continuam sendo
              responsabilidade médica.
            </p>
          ) : null}
          <form action={addMedicationAction} className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1 sm:col-span-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" required placeholder="ex.: Metformina" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="dosage">Dosagem</Label>
              <Input id="dosage" name="dosage" placeholder="ex.: 500 mg" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="schedule_hint">Horário / lembrete</Label>
              <Input id="schedule_hint" name="schedule_hint" placeholder="ex.: café da manhã" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-zinc-100">Ativos</h2>
        {meds.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum medicamento cadastrado.</p>
        ) : (
          <ul className="space-y-3">
            {meds.map((m) => (
              <li key={m.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                    <div>
                      <p className="font-medium text-zinc-100">{m.name}</p>
                      <p className="text-sm text-zinc-500">
                        {m.dosage ?? "—"} · {m.schedule_hint ?? "sem horário"}
                      </p>
                    </div>
                    <form action={logMedicationTakenAction}>
                      <input type="hidden" name="medication_id" value={m.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Registrar dose
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
