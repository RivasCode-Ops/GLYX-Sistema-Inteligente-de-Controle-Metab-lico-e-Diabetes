import { Check, CircleDashed, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ItemDoChecklist, ItemEstado } from "@/lib/exercicios/plateau-checklist";

const ESTADO: Record<ItemEstado, { icone: LucideIcon; cor: string; rotulo: string }> = {
  ok: { icone: Check, cor: "text-emerald-400", rotulo: "sem sinal" },
  atencao: { icone: TriangleAlert, cor: "text-severity-atencao", rotulo: "candidato" },
  sem_dado: { icone: CircleDashed, cor: "text-zinc-600", rotulo: "sem dado" },
};

export function PlateauChecklistCard({
  itens,
  grupo,
  dias,
}: {
  itens: ItemDoChecklist[];
  grupo: string;
  /** Dias com registro de alimentação na janela — a tela diz sobre o que fala. */
  dias: number;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-medium text-zinc-100">
        Carga parada em {grupo} — por onde olhar
      </h3>
      {/* A ordem é o produto: cinco coisas produzem o mesmo sintoma do volume
          baixo, e somar série em cima de qualquer uma delas piora o quadro. A
          lista NÃO se reordena por gravidade, senão o volume voltaria ao topo
          no dia em que fosse o único número ruim. */}
      <p className="mt-0.5 text-xs text-zinc-500">
        Nesta ordem. Volume é o último item de propósito.
        {dias > 0 ? ` Alimentação medida em ${dias} ${dias === 1 ? "dia" : "dias"} com registro.` : ""}
      </p>

      <ol className="mt-3 space-y-2.5">
        {itens.map((item, i) => {
          const e = ESTADO[item.estado];
          const Icone = e.icone;
          return (
            <li key={item.id} className="flex gap-3">
              <span className="mt-0.5 font-mono text-[11px] text-zinc-600">{i + 1}</span>
              <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${e.cor}`} aria-hidden />
              <div className="min-w-0">
                <p className="text-sm text-zinc-200">
                  {item.titulo}
                  <span className={`ml-2 text-[11px] ${e.cor}`}>{e.rotulo}</span>
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{item.detalhe}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
