// Seção recolhível (details/summary nativo — funciona sem JavaScript).
// Padrão para tirar formulários pesados do caminho: a página mostra o que
// importa e as ações ficam a um toque, fechadas por padrão.

export function CollapsibleSection({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-zinc-800 bg-zinc-900/30"
    >
      <summary className="cursor-pointer list-none select-none px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-zinc-100">{title}</p>
          <span
            aria-hidden
            className="text-zinc-500 transition-transform group-open:rotate-90"
          >
            ›
          </span>
        </div>
        {description ? <p className="mt-0.5 text-xs text-zinc-500">{description}</p> : null}
      </summary>
      <div className="space-y-4 border-t border-zinc-800/60 p-4">{children}</div>
    </details>
  );
}
