import { AlertTriangle, CircleHelp, RefreshCw, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RespostaMuscular, RespostaVeredito } from "@/lib/exercicios/muscle-response";

const VEREDITO: Record<
  RespostaVeredito,
  { rotulo: string; icone: LucideIcon; cor: string; borda: string }
> = {
  positiva: {
    rotulo: "Respondendo",
    icone: TrendingUp,
    cor: "text-emerald-400",
    borda: "border-l-emerald-500/70",
  },
  estimulo_insuficiente: {
    rotulo: "Estímulo insuficiente",
    icone: AlertTriangle,
    cor: "text-severity-atencao",
    borda: "border-l-severity-atencao/70",
  },
  revisar: {
    rotulo: "Revisar",
    icone: RefreshCw,
    cor: "text-module-exercicio",
    borda: "border-l-module-exercicio/70",
  },
  sem_base: {
    rotulo: "Sem base",
    icone: CircleHelp,
    cor: "text-zinc-500",
    borda: "border-l-zinc-700",
  },
};

export function MuscleResponseList({ respostas }: { respostas: RespostaMuscular[] }) {
  if (!respostas.length) {
    return (
      <p className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-500">
        Sem registros de carga suficientes para avaliar resposta. Anote peso, repetições e séries em
        Recuperação → Progressão de carga.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {respostas.map((r) => {
        const v = VEREDITO[r.veredito];
        const Icone = v.icone;
        return (
          <li
            key={r.id}
            className={`rounded-2xl border border-zinc-800 border-l-[3px] ${v.borda} bg-zinc-900/40 p-4`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-zinc-100">{r.label}</p>
              {/* Ícone junto do rótulo, não cor sozinha: quatro estados
                  separados só por matiz não se leem sem distinguir cor. */}
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${v.cor}`}>
                <Icone className="h-3.5 w-3.5" aria-hidden />
                {v.rotulo}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-zinc-500">
              <span>
                {r.volume.setsPerWeek} séries/sem
                <span className="text-zinc-600"> · piso {r.volume.minTarget}</span>
              </span>
              {/* Série indireta NUNCA soma na de cima: a faixa de referência já
                  embute trabalho indireto, e somar compararia número inflado
                  contra alvo calibrado para série direta. */}
              {r.indiretas > 0 ? <span>+{r.indiretas} indiretas</span> : null}
              {r.performancePct != null ? (
                <span>
                  carga {r.performancePct >= 0 ? "+" : ""}
                  {r.performancePct}%
                </span>
              ) : (
                <span>carga sem registro</span>
              )}
              {r.medida ? (
                <span>
                  {r.medida.label.toLowerCase()} {r.medida.delta >= 0 ? "+" : ""}
                  {r.medida.delta} cm
                </span>
              ) : null}
            </div>

            <p className="mt-2 text-xs leading-relaxed text-zinc-400">{r.motivo}</p>
          </li>
        );
      })}
    </ul>
  );
}
