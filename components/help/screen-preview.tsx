/**
 * Moldura de "tela de exemplo" pro manual do usuário — mostra um mockup
 * estático (dados fictícios) do que aquela parte do app parece, sem
 * depender de captura de tela real (que exigiria login/dados de verdade).
 */
export function ScreenPreview({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-1.5 border-b border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="ml-2 text-[11px] text-zinc-500">{label}</span>
      </div>
      <div className="space-y-3 p-4">{children}</div>
    </div>
  );
}
