import { Card, CardContent } from "@/components/ui/card";
import type { ContextReceipt, FieldState } from "@/lib/ai/context-receipt";

/**
 * "Como esta leitura foi montada" — o recibo da fatia 3 na tela.
 *
 * Colapsado e fechado por padrão: é conferência, não decisão, e o painel
 * responde o que fazer agora.
 *
 * A REGRA QUE ELE EXISTE PARA CUMPRIR: campo sem registro aparece com travessão,
 * NUNCA com `0`. Zero é medida; travessão é ausência de medida. Foi confundir os
 * dois que fez a tela dizer "0 g de carboidrato" para quem simplesmente não
 * tinha registrado nada.
 */

const ROTULO: Record<FieldState, string> = {
  registrado: "registrado",
  zero_confirmado: "zero confirmado",
  nao_registrado: "sem registro",
};

const COR: Record<FieldState, string> = {
  registrado: "text-zinc-300",
  zero_confirmado: "text-zinc-300",
  nao_registrado: "text-amber-300",
};

const NOME: Record<string, string> = {
  glicemia: "Glicemia",
  alimentacao: "Alimentação",
  exercicio: "Exercício",
  medicacao: "Medicação",
  insulina: "Insulina",
  sono: "Sono",
  alertas_48h: "Alertas (48h)",
  mapa_risco: "Mapa de risco",
};

export function ReciboContexto({ receipt }: { receipt: ContextReceipt }) {
  const faltando = receipt.missing.length;

  return (
    <details className="group">
      <summary className="cursor-pointer list-none rounded-xl border border-zinc-800/80 px-4 py-2.5 text-xs text-zinc-500 transition hover:text-zinc-300">
        <span className="select-none">▸ Como esta leitura foi montada</span>
        {faltando ? (
          <span className="ml-2 text-amber-300/90">
            {faltando} fonte(s) sem registro
          </span>
        ) : null}
        {receipt.hasDivergence ? (
          <span className="ml-2 text-amber-300/90">· divergência</span>
        ) : null}
      </summary>

      <Card className="mt-2">
        <CardContent className="p-4">
          <ul className="divide-y divide-zinc-800/70 text-xs">
            {receipt.fields.map((f) => (
              <li key={f.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                <span className="w-32 shrink-0 text-zinc-400">{NOME[f.key] ?? f.key}</span>

                {/* Travessão, nunca zero. */}
                <span className="w-12 shrink-0 text-right font-mono text-zinc-200">
                  {f.state === "nao_registrado" ? "—" : f.count}
                </span>

                <span className={`w-28 shrink-0 ${COR[f.state]}`}>{ROTULO[f.state]}</span>

                {f.summary && f.state !== "nao_registrado" ? (
                  <span className="text-zinc-500">{f.summary}</span>
                ) : null}

                {f.divergence ? (
                  <span className="w-full text-amber-300">⚠ {f.divergence}</span>
                ) : null}
              </li>
            ))}
          </ul>

          <p className="mt-3 border-t border-zinc-800/80 pt-3 text-[11px] leading-4 text-zinc-600">
            Campo com travessão significa que o app não recebeu o dado — não que o evento não
            tenha acontecido. É a mesma leitura que vai para o copiloto.
          </p>
        </CardContent>
      </Card>
    </details>
  );
}
