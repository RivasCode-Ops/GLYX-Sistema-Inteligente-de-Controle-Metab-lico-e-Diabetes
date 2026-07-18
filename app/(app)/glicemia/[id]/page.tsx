import Link from "next/link";
import { notFound } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { deleteGlucoseReading } from "@/app/actions/glucose";
import { demoGlucoseReadings } from "@/lib/demo/data";
import { localDayRangeUTC } from "@/lib/time/local-day";

type Props = { params: Promise<{ id: string }> };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function GlicemiaDetailPage({ params }: Props) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    const readings = DATE_RE.test(id)
      ? demoGlucoseReadings.filter((r) => r.recorded_at.slice(0, 10) === id)
      : [];

    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/glicemia/historico" className="text-sm text-emerald-400 hover:underline">
          ← Voltar ao histórico
        </Link>
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">
            {DATE_RE.test(id)
              ? new Date(id + "T12:00:00").toLocaleDateString("pt-BR")
              : "Detalhe demo"}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">Drill-down com leituras fictícias da prova pública.</p>
        </div>
        {readings.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma leitura demo neste dia.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900/30">
            {readings.map((r) => (
              <li key={r.id} className="flex justify-between px-4 py-3 text-sm">
                <span className="font-mono text-zinc-200">{r.value_mg_dl} mg/dL</span>
                <span className="text-zinc-500">
                  {new Date(r.recorded_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {r.context ? ` · ${r.context}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const supabase = await createClient();
  if (!supabase) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  let readings: { id: string; value_mg_dl: number; recorded_at: string; context: string | null }[] =
    [];

  if (DATE_RE.test(id)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", user.id)
      .maybeSingle();
    const { startISO, endISO } = localDayRangeUTC(id, profile?.timezone);
    const { data } = await supabase
      .from("glucose_readings")
      .select("id, value_mg_dl, recorded_at, context")
      .eq("user_id", user.id)
      .gte("recorded_at", startISO)
      .lt("recorded_at", endISO)
      .order("recorded_at", { ascending: true });
    readings = data ?? [];
  }

  async function deleteReadingAction(formData: FormData): Promise<void> {
    "use server";
    await deleteGlucoseReading(formData);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/glicemia/historico" className="text-sm text-emerald-400 hover:underline">
        ← Voltar ao histórico
      </Link>
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">
          {DATE_RE.test(id)
            ? new Date(id + "T12:00:00").toLocaleDateString("pt-BR")
            : "Detalhe"}
        </h2>
        {!DATE_RE.test(id) ? (
          <p className="mt-1 font-mono text-sm text-zinc-500">id = {id}</p>
        ) : null}
      </div>

      {DATE_RE.test(id) && readings.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhuma leitura neste dia.</p>
      ) : DATE_RE.test(id) ? (
        <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900/30">
          {readings.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="font-mono text-zinc-200">{r.value_mg_dl} mg/dL</span>
              <span className="flex items-center gap-3 text-zinc-500">
                {new Date(r.recorded_at).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {r.context ? ` · ${r.context}` : ""}
                <form action={deleteReadingAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button
                    type="submit"
                    aria-label={`Excluir leitura de ${r.value_mg_dl} mg/dL`}
                    title="Excluir"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-sm text-zinc-600 transition hover:bg-red-950/50 hover:text-red-300"
                  >
                    ✕
                  </button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-400">
          Use uma data no formato <code className="font-mono">YYYY-MM-DD</code> na URL ou navegue pelo
          histórico.
        </div>
      )}
    </div>
  );
}
