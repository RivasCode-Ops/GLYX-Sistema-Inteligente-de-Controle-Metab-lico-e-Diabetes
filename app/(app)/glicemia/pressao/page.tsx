import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addBloodPressureReading, deleteBloodPressureReading } from "@/app/actions/blood-pressure";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { classifyBloodPressure, BLOOD_PRESSURE_TIER_LABEL } from "@/lib/health/blood-pressure";
import type { BloodPressureLog } from "@/types/database";

const TIER_STYLE: Record<string, string> = {
  normal: "bg-emerald-500/15 text-emerald-300",
  elevada: "bg-sky-500/15 text-sky-300",
  estagio1: "bg-amber-500/15 text-amber-300",
  estagio2: "bg-orange-500/15 text-orange-300",
  crise: "bg-red-500/15 text-red-300",
};

export default async function PressaoArterialPage() {
  let logs: BloodPressureLog[] = [];
  const demoMode = !isSupabaseConfigured();

  async function addAction(formData: FormData): Promise<void> {
    "use server";
    await addBloodPressureReading(formData);
  }

  async function deleteAction(formData: FormData): Promise<void> {
    "use server";
    await deleteBloodPressureReading(formData);
  }

  if (!demoMode) {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("blood_pressure_logs")
          .select("*")
          .eq("user_id", user.id)
          .order("recorded_at", { ascending: false })
          .limit(20);
        logs = (data ?? []) as BloodPressureLog[];
      }
    }
  }

  const latest = logs[0];
  const latestTier = latest ? classifyBloodPressure(latest.systolic, latest.diastolic) : null;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <p className="text-sm text-zinc-400">
        Hipertensão é comorbidade comum com diabetes — registre junto pra ter os dois na mesma
        história.
      </p>

      {demoMode ? (
        <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          Demo pública: configure o Supabase para registrar de verdade.
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registrar leitura</CardTitle>
            <CardDescription>Sistólica × diastólica, pulso opcional.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={addAction} className="grid grid-cols-3 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="systolic">Sistólica</Label>
                <Input id="systolic" name="systolic" type="number" required placeholder="120" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="diastolic">Diastólica</Label>
                <Input id="diastolic" name="diastolic" type="number" required placeholder="80" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="pulse">Pulso (opcional)</Label>
                <Input id="pulse" name="pulse" type="number" placeholder="72" />
              </div>
              <div className="col-span-3">
                <Button type="submit">Registrar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {latest && latestTier ? (
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="font-mono text-2xl text-zinc-50">
                {latest.systolic}/{latest.diastolic}
              </p>
              <p className="text-xs text-zinc-500">
                {latest.pulse ? `${latest.pulse} bpm · ` : ""}
                {new Date(latest.recorded_at).toLocaleString("pt-BR")}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${TIER_STYLE[latestTier]}`}>
              {BLOOD_PRESSURE_TIER_LABEL[latestTier]}
            </span>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma leitura registrada ainda.</p>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {logs.map((log) => {
                const tier = classifyBloodPressure(log.systolic, log.diastolic);
                return (
                  <li key={log.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-mono text-sm text-zinc-100">
                        {log.systolic}/{log.diastolic}
                        {log.pulse ? ` · ${log.pulse} bpm` : ""}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {new Date(log.recorded_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${TIER_STYLE[tier]}`}>
                        {BLOOD_PRESSURE_TIER_LABEL[tier]}
                      </span>
                      {!demoMode ? (
                        <form action={deleteAction}>
                          <input type="hidden" name="id" value={log.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Excluir
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
