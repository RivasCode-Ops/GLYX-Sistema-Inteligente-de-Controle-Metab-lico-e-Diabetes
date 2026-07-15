import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { runSystemChecks, appVersion, type CheckStatus } from "@/lib/status/checks";

export const dynamic = "force-dynamic";

const STYLE: Record<CheckStatus, { dot: string; card: string; label: string }> = {
  ok: { dot: "bg-emerald-400", card: "border-zinc-800 bg-zinc-900/30", label: "Funcionando" },
  warn: { dot: "bg-amber-400", card: "border-amber-500/30 bg-amber-500/5", label: "Atenção" },
  fail: { dot: "bg-red-500", card: "border-red-500/30 bg-red-500/5", label: "Com problema" },
  off: { dot: "bg-zinc-600", card: "border-zinc-800 bg-zinc-900/30", label: "Não ativado" },
};

export default async function StatusPage() {
  if (!isSupabaseConfigured()) {
    return (
      <p className="text-sm text-zinc-500">
        Configure o Supabase para ver a auditoria do sistema.
      </p>
    );
  }
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const checks = await runSystemChecks(supabase, user.id);
  const falhas = checks.filter((c) => c.status === "fail").length;
  const atencao = checks.filter((c) => c.status === "warn").length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              {falhas > 0
                ? `🔴 ${falhas} ${falhas === 1 ? "problema encontrado" : "problemas encontrados"}`
                : atencao > 0
                  ? `🟡 Funcionando, com ${atencao} ${atencao === 1 ? "ponto de atenção" : "pontos de atenção"}`
                  : "🟢 Tudo funcionando"}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Cada item abaixo foi verificado agora, direto na fonte — não é estimativa.
            </p>
          </div>
          <Link
            href="/status"
            className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-emerald-500/50 hover:text-emerald-200"
          >
            Verificar de novo
          </Link>
        </div>
        <p className="mt-3 border-t border-zinc-800 pt-3 font-mono text-[11px] text-zinc-500">
          Versão do app: {appVersion()} · verificado em{" "}
          {new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
        </p>
      </div>

      <ul className="space-y-2.5">
        {checks.map((c) => {
          const s = STYLE[c.status];
          return (
            <li key={c.id} className={`rounded-2xl border p-4 ${s.card}`}>
              <div className="flex items-center gap-2.5">
                <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} aria-hidden />
                <p className="flex-1 text-sm font-medium text-zinc-100">{c.title}</p>
                <span className="shrink-0 text-[11px] uppercase tracking-wide text-zinc-500">
                  {s.label}
                </span>
              </div>
              <p className="mt-2 pl-5 text-sm leading-relaxed text-zinc-400">{c.detail}</p>
              {c.action ? (
                <div className="mt-2 pl-5">
                  <Link
                    href={c.action.href}
                    className="inline-block rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 transition hover:border-emerald-500/50 hover:text-emerald-200"
                  >
                    {c.action.label} →
                  </Link>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="text-xs leading-relaxed text-zinc-600">
        Esta página consulta o estado real do sistema (banco, sensor, robô de avisos, notificações
        e IA) no momento em que você abre. Se algo aparecer vermelho aqui, é problema de verdade —
        e o botão de ação leva direto ao lugar de resolver.
      </p>
    </div>
  );
}
