import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  addMedication,
  attachMedicationLabel,
  deactivateMedication,
  logMedicationTaken,
  removeMedicationLabel,
  updateMedication,
  updateMedicationStock,
} from "@/app/actions/medications";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { PhotoCaptureField } from "@/components/ui/photo-capture-field";
import { AlarmSetup } from "@/components/push/alarm-setup";
import { SupplementCheckForm } from "@/components/medicacao/supplement-check-form";
import {
  DailyDosesCard,
  computeMedicationDoseSummary,
  type TodayLog,
  type TodaySnooze,
} from "@/components/medicacao/daily-doses-card";
import { AddMedicationByPhoto } from "@/components/medicacao/add-by-photo";
import { MedicationScheduleSuggestion } from "@/components/medicacao/medication-schedule-suggestion";
import { ReminderTimesField } from "@/components/medicacao/reminder-times-field";
import { startOfLocalDayISO } from "@/lib/time/local-day";
import type { Medication } from "@/types/database";
import { demoMedications } from "@/lib/demo/data";
import { DOSE_UNITS, doseUnitLabel } from "@/lib/medications/dose-units";

/** Busca sem acento/maiúscula: "insulína" acha "Insulina NPH". */
function normaliza(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export default async function MedicacaoOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const busca = (q ?? "").trim();
  let meds: Medication[] = [];
  let todayLogs: TodayLog[] = [];
  let todaySnoozes: TodaySnooze[] = [];
  let timezone: string | null = null;
  const demoMode = !isSupabaseConfigured();

  async function addMedicationAction(formData: FormData): Promise<void> {
    "use server";
    await addMedication(formData);
  }

  async function logMedicationTakenAction(formData: FormData): Promise<void> {
    "use server";
    await logMedicationTaken(formData);
  }

  async function updateStockAction(formData: FormData): Promise<void> {
    "use server";
    await updateMedicationStock(formData);
  }

  async function deactivateAction(formData: FormData): Promise<void> {
    "use server";
    await deactivateMedication(formData);
  }

  async function updateMedicationAction(formData: FormData): Promise<void> {
    "use server";
    await updateMedication(formData);
  }

  async function attachLabelAction(formData: FormData): Promise<void> {
    "use server";
    await attachMedicationLabel(formData);
  }

  async function removeLabelAction(formData: FormData): Promise<void> {
    "use server";
    await removeMedicationLabel(formData);
  }

  /** Dias de estoque restantes: consome doses/dia (nº de alarmes, mínimo 1) desde a última atualização. */
  function stockDaysLeft(m: Medication): number | null {
    if (m.stock_units == null || !m.stock_updated_on) return null;
    const dpd = Math.max(m.reminder_times?.length ?? 1, 1);
    const elapsed = Math.max(
      0,
      Math.floor((Date.now() - new Date(m.stock_updated_on).getTime()) / 86_400_000)
    );
    return Math.floor((m.stock_units - elapsed * dpd) / dpd);
  }

  const labelUrls = new Map<string, string>();

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

        const { data: p } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", user.id)
          .maybeSingle();
        timezone = p?.timezone ?? null;
        const startOfDayISO = startOfLocalDayISO(timezone);
        const [logsRes, snoozesRes] = await Promise.all([
          supabase
            .from("medication_logs")
            .select("medication_id, taken_at")
            .eq("user_id", user.id)
            .gte("taken_at", startOfDayISO),
          supabase
            .from("medication_snoozes")
            .select("medication_id, snoozed_until")
            .eq("user_id", user.id)
            .gte("created_at", startOfDayISO),
        ]);
        todayLogs = (logsRes.data ?? []) as TodayLog[];
        todaySnoozes = (snoozesRes.data ?? []) as TodaySnooze[];

        const paths = meds
          .map((m) => m.label_photo_path)
          .filter((p): p is string => Boolean(p));
        if (paths.length) {
          const { data: signed } = await supabase.storage
            .from("medication-labels")
            .createSignedUrls(paths, 3600);
          for (const s of signed ?? []) {
            if (s.signedUrl && s.path) labelUrls.set(s.path, s.signedUrl);
          }
        }
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {!demoMode ? (
        <DailyDosesCard
          meds={meds}
          logs={todayLogs}
          snoozes={todaySnoozes}
          timezone={timezone}
          markTakenAction={logMedicationTakenAction}
        />
      ) : null}

      {!demoMode ? <MedicationScheduleSuggestion medications={meds} /> : null}

      <CollapsibleSection
        title="➕ Adicionar remédio ou suplemento"
        description="Por foto do rótulo (a IA preenche) ou digitando — ajustes terapêuticos só com seu médico"
      >
        {!demoMode ? (
          <>
            <AddMedicationByPhoto />
            <p className="border-t border-zinc-800/60 pt-4 text-xs font-medium uppercase tracking-wide text-zinc-500">
              ⌨️ Ou preencha manualmente
            </p>
          </>
        ) : null}
        <div>
          {demoMode ? (
            <p className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
              Demo pública: medicamentos e doses são fictícios. Ajustes terapêuticos continuam sendo
              responsabilidade médica.
            </p>
          ) : null}
          <form action={addMedicationAction} className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" required placeholder="ex.: Metformina, Whey…" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="kind">Tipo</Label>
              <select
                id="kind"
                name="kind"
                defaultValue="med"
                className="h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
              >
                <option value="med">Medicamento</option>
                <option value="supplement">Suplemento</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label htmlFor="dose_amount">Dose por vez</Label>
                <Input
                  id="dose_amount"
                  name="dose_amount"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  placeholder="ex.: 10"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="dose_unit">Unidade</Label>
                <select
                  id="dose_unit"
                  name="dose_unit"
                  defaultValue="comprimido(s)"
                  className="h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
                >
                  {DOSE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {doseUnitLabel(u)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 grid gap-1">
                <Input id="dosage" name="dosage" placeholder="ou descreva: ex.: 1 colher rasa" className="h-8 text-xs" />
              </div>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="schedule_hint">Observação de horário</Label>
              <Input id="schedule_hint" name="schedule_hint" placeholder="ex.: café da manhã" />
            </div>
            <div className="grid gap-1">
              <Label>Alarmes de dose (quantos horários precisar)</Label>
              <ReminderTimesField />
              <p className="text-[11px] text-zinc-600">
                Nesses horários, os dispositivos com alarme ativado tocam com o nome e a dose.
              </p>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="stock_units">Unidades em estoque (opcional)</Label>
              <Input
                id="stock_units"
                name="stock_units"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="ex.: 30 comprimidos ou 60 scoops/colheres"
              />
              <p className="text-[11px] text-zinc-600">
                Com o estoque informado, o GLYX avisa por notificação quando faltar ~1 semana para
                acabar.
              </p>
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <Label htmlFor="label_photo">Foto do rótulo (opcional)</Label>
              <PhotoCaptureField name="label_photo" accept="image/jpeg,image/png,image/webp" />
              <p className="text-[11px] text-zinc-600">
                Anexar ou não é opcional — guarda o rótulo para consulta rápida depois. Para a
                análise de segurança por IA, use a seção &quot;Analisar suplemento&quot;.
              </p>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </div>
      </CollapsibleSection>

      {!demoMode ? (
        <CollapsibleSection
          title="🔍 Analisar suplemento antes de comprar"
          description="Só avalia a segurança cruzando com seus dados — não cadastra nada"
        >
          <SupplementCheckForm />
        </CollapsibleSection>
      ) : null}

      {!demoMode ? (
        <CollapsibleSection
          title="⏰ Alarmes neste aparelho"
          description="Ative para o celular tocar nos horários das doses"
        >
          <AlarmSetup />
        </CollapsibleSection>
      ) : null}

      <form method="get" className="flex items-center gap-2">
        <Input
          name="q"
          defaultValue={busca}
          placeholder="🔎 Buscar remédio ou suplemento pelo nome…"
          className="max-w-sm"
        />
        <Button type="submit" variant="outline" size="sm">
          Buscar
        </Button>
        {busca ? (
          <a href="/medicacao" className="text-xs text-zinc-500 hover:text-zinc-300">
            limpar
          </a>
        ) : null}
      </form>

      {(["med", "supplement"] as const).map((section) => {
        const items = meds.filter(
          (m) =>
            (m.kind ?? "med") === section &&
            (!busca || normaliza(m.name).includes(normaliza(busca)))
        );
        if (section === "supplement" && items.length === 0) return null;
        return (
      <div key={section}>
        <h2 className="mb-3 text-lg font-semibold text-zinc-100">
          {section === "med" ? "Medicamentos ativos" : "💪 Suplementos"}
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {busca ? `Nada encontrado para "${busca}".` : "Nenhum medicamento cadastrado."}
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((m) => {
              const daysLeft = stockDaysLeft(m);
              return (
                <li key={m.id}>
                  <Card>
                    <CardContent className="space-y-3 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          {m.label_photo_path && labelUrls.get(m.label_photo_path) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={labelUrls.get(m.label_photo_path)}
                              alt={`Rótulo de ${m.name}`}
                              className="h-12 w-12 shrink-0 rounded-lg border border-zinc-800 object-cover"
                            />
                          ) : null}
                          <div>
                          <p className="font-medium text-zinc-100">{m.name}</p>
                          <p className="text-sm text-zinc-500">
                            {m.dosage ?? "—"} · {m.schedule_hint ?? "sem horário"}
                            {m.reminder_times?.length ? ` · ⏰ ${m.reminder_times.join(", ")}` : ""}
                          </p>
                          {daysLeft != null ? (
                            <p
                              className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] ${
                                daysLeft <= 0
                                  ? "border-red-500/40 bg-red-500/10 text-red-300"
                                  : daysLeft <= 7
                                    ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                                    : "border-zinc-700 bg-zinc-900 text-zinc-400"
                              }`}
                            >
                              {(() => {
                                const icon = m.kind === "supplement" ? "🥄" : "💊";
                                return daysLeft <= 0
                                  ? `${icon} Estoque pode ter acabado — reponha e atualize`
                                  : `${icon} Estoque para ~${daysLeft} dia(s)`;
                              })()}
                            </p>
                          ) : null}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <form action={logMedicationTakenAction}>
                            <input type="hidden" name="medication_id" value={m.id} />
                            <Button type="submit" variant="outline" size="sm">
                              Registrar dose
                            </Button>
                          </form>
                          {(() => {
                            const medLogs = todayLogs.filter((l) => l.medication_id === m.id);
                            const medSnoozes = todaySnoozes.filter((s) => s.medication_id === m.id);
                            const { taken, lastAt } = computeMedicationDoseSummary(
                              m,
                              medLogs,
                              medSnoozes,
                              timezone
                            );
                            if (!taken || !lastAt) return null;
                            return (
                              <p className="text-[11px] text-emerald-400/90">
                                ✓ hoje: {taken}× · última às{" "}
                                {new Date(lastAt).toLocaleTimeString("pt-BR", {
                                  timeZone: timezone ?? "America/Sao_Paulo",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            );
                          })()}
                        </div>
                      </div>
                      {!demoMode ? (
                        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800/60 pt-3">
                          <form action={updateStockAction} className="flex items-center gap-2">
                            <input type="hidden" name="medication_id" value={m.id} />
                            <Input
                              name="stock_units"
                              type="number"
                              min={0}
                              inputMode="numeric"
                              placeholder="comprei mais: total atual"
                              className="h-8 w-44 text-xs"
                            />
                            <Button type="submit" variant="outline" size="sm">
                              Atualizar estoque
                            </Button>
                          </form>
                          <form action={deactivateAction} className="ml-auto">
                            <input type="hidden" name="medication_id" value={m.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                              className="text-zinc-500 hover:text-red-300"
                            >
                              Desativar
                            </Button>
                          </form>
                        </div>
                      ) : null}
                      {!demoMode ? (
                        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800/60 pt-3">
                          <form action={attachLabelAction} className="flex items-center gap-2">
                            <input type="hidden" name="medication_id" value={m.id} />
                            <PhotoCaptureField
                              name="label_photo"
                              accept="image/jpeg,image/png,image/webp"
                              required
                            />
                            <Button type="submit" variant="outline" size="sm">
                              {m.label_photo_path ? "Trocar foto" : "Anexar foto"}
                            </Button>
                          </form>
                          {m.label_photo_path ? (
                            <form action={removeLabelAction} className="ml-auto">
                              <input type="hidden" name="medication_id" value={m.id} />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="sm"
                                className="text-zinc-500 hover:text-red-300"
                              >
                                Remover foto
                              </Button>
                            </form>
                          ) : null}
                        </div>
                      ) : null}
                      {!demoMode ? (
                        <details className="group">
                          <summary className="cursor-pointer list-none text-xs text-zinc-500 transition hover:text-emerald-300">
                            ✏️ Editar nome, dose ou horários
                          </summary>
                          <form
                            action={updateMedicationAction}
                            className="mt-3 grid gap-3 rounded-xl border border-zinc-800/60 bg-zinc-950/40 p-3 sm:grid-cols-2"
                          >
                            <input type="hidden" name="medication_id" value={m.id} />
                            <div className="grid gap-1">
                              <Label className="text-xs">Nome</Label>
                              <Input name="name" defaultValue={m.name} required className="h-8 text-sm" />
                            </div>
                            <div className="grid gap-1">
                              <Label className="text-xs">Dosagem</Label>
                              <Input name="dosage" defaultValue={m.dosage ?? ""} className="h-8 text-sm" />
                            </div>
                            <div className="grid gap-1">
                              <Label className="text-xs">Observação de horário</Label>
                              <Input
                                name="schedule_hint"
                                defaultValue={m.schedule_hint ?? ""}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="grid gap-1">
                              <Label className="text-xs">Alarmes de dose</Label>
                              <ReminderTimesField defaultTimes={m.reminder_times ?? []} />
                            </div>
                            <div className="grid gap-1">
                              <Label className="text-xs">Tipo</Label>
                              <select
                                name="kind"
                                defaultValue={m.kind ?? "med"}
                                className="h-8 rounded-md border border-zinc-800 bg-zinc-950 px-2 text-sm text-zinc-100"
                              >
                                <option value="med">Medicamento</option>
                                <option value="supplement">Suplemento</option>
                              </select>
                            </div>
                            <div className="flex items-end">
                              <Button type="submit" size="sm">
                                Salvar alterações
                              </Button>
                            </div>
                          </form>
                        </details>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
        );
      })}

      <a
        href="/medicacao/agenda"
        className="block rounded-2xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-sm text-zinc-400 transition hover:border-emerald-500/40 hover:text-zinc-200"
      >
        📖 Ver histórico completo de doses (agenda) →
      </a>
    </div>
  );
}
