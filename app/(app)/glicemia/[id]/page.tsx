import Link from "next/link";
import { notFound } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { demoGlucoseReadings } from "@/lib/demo/data";

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

  let readings: { value_mg_dl: number; recorded_at: string; context: string | null }[] = [];

  if (DATE_RE.test(id)) {
    const start = `${id}T00:00:00.000Z`;
    const end = `${id}T23:59:59.999Z`;
    const { data } = await supabase
      .from("glucose_readings")
      .select("value_mg_dl, recorded_at, context")
      .eq("user_id", user.id)
      .gte("recorded_at", start)
      .lte("recorded_at", end)
      .order("recorded_at", { ascending: true });
    readings = data ?? [];
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
          {readings.map((r, i) => (
            <li key={`${r.recorded_at}-${i}`} className="flex justify-between px-4 py-3 text-sm">
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
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-400">
          Use uma data no formato <code className="font-mono">YYYY-MM-DD</code> na URL ou navegue pelo
          histórico.
        </div>
      )}
    </div>
  );
}
