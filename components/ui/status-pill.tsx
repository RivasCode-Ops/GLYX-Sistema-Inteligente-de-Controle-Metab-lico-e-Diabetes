import { cn } from "@/lib/utils";

export type PillTone = "emerald" | "amber" | "red" | "sky" | "zinc";

const TONE_CLASS: Record<PillTone, string> = {
  emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  red: "border-red-500/40 bg-red-500/10 text-red-300",
  sky: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  zinc: "border-zinc-700 bg-zinc-900 text-zinc-500",
};

type Props = {
  tone: PillTone;
  children: React.ReactNode;
  className?: string;
};

/**
 * Pílula de status/severidade única pro app — mesmo visual que já existia
 * duplicado em daily-doses-card.tsx (tomado/pendente) e mapa-risco/page.tsx
 * (crítico/atenção/informativo). Usar em qualquer tela nova em vez de
 * parágrafo/bullet colorido à parte.
 */
export function StatusPill({ tone, children, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        TONE_CLASS[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
