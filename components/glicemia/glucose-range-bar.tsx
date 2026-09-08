import { cn } from "@/lib/utils";

/**
 * Barra de faixa com o marcador da leitura.
 *
 * POR QUE ELA EXISTE: "165 mg/dL · Moderado" não diz moderado em relação a quê.
 * A barra põe a régua ao lado do número, e a régua é a FAIXA DO USUÁRIO —
 * `targetMin`/`targetMax` do perfil dele, combinados com o médico —, não uma
 * escala fixa do app.
 *
 * A escala vai de 40 a 300 mg/dL só para desenhar: são os limites de leitura
 * plausível de glicosímetro e sensor, e servem para posicionar o marcador. As
 * fronteiras que significam algo são as duas da faixa alvo.
 */

const ESCALA_MIN = 40;
const ESCALA_MAX = 300;

function posicao(valor: number): number {
  const p = ((valor - ESCALA_MIN) / (ESCALA_MAX - ESCALA_MIN)) * 100;
  return Math.min(100, Math.max(0, p));
}

export function GlucoseRangeBar({
  value,
  targetMin,
  targetMax,
  className = "",
}: {
  value: number | null;
  targetMin: number;
  targetMax: number;
  className?: string;
}) {
  const inicioAlvo = posicao(targetMin);
  const fimAlvo = posicao(targetMax);

  return (
    <div className={cn("w-full", className)}>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        {/* Abaixo da meta — a ponta que importa mais, porque hipoglicemia é o
            risco imediato. */}
        <div
          className="absolute inset-y-0 left-0 bg-red-500/70"
          style={{ width: `${inicioAlvo}%` }}
          aria-hidden
        />
        {/* Dentro da meta */}
        <div
          className="absolute inset-y-0 bg-emerald-500/70"
          style={{ left: `${inicioAlvo}%`, width: `${fimAlvo - inicioAlvo}%` }}
          aria-hidden
        />
        {/* Acima da meta */}
        <div
          className="absolute inset-y-0 right-0 bg-amber-500/70"
          style={{ left: `${fimAlvo}%` }}
          aria-hidden
        />

        {value != null ? (
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-zinc-950 bg-zinc-100 shadow"
            style={{ left: `${posicao(value)}%` }}
            aria-hidden
          />
        ) : null}
      </div>

      {/* Os números da régua são os DELE. Sem eles a barra viraria decoração. */}
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-zinc-500">
        <span>{ESCALA_MIN}</span>
        <span className="text-emerald-400/80">{targetMin}</span>
        <span className="text-emerald-400/80">{targetMax}</span>
        <span>{ESCALA_MAX}</span>
      </div>
    </div>
  );
}
