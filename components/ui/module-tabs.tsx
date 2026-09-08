"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getModuleKeyFromPath, moduleSubNav } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Abas do módulo — Visão geral · Histórico · Pressão, e equivalentes.
 *
 * `moduleSubNav` e `getModuleKeyFromPath` já existiam em `lib/navigation.ts` e
 * **nada os renderizava**: a tela de glicemia dizia "as abas acima" para abas
 * que não existiam, e as sub-rotas só eram alcançáveis por link solto no meio
 * do texto. O dado estava certo; faltava a superfície.
 *
 * Fica no `ui/` e é dirigido pelo mapa, não por lista própria: assim os outros
 * módulos que já têm sub-rotas (análise, alimentação, perfil) ganham a mesma
 * navegação sem uma segunda fonte de verdade sobre quais telas existem.
 */
export function ModuleTabs({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const chave = getModuleKeyFromPath(pathname);
  const itens = chave ? moduleSubNav[chave] : null;
  if (!itens?.length) return null;

  return (
    <nav aria-label="Seções do módulo" className={cn("flex flex-wrap gap-2", className)}>
      {itens.map((item) => {
        // A raiz do módulo só está ativa em correspondência exata; do contrário
        // "Visão geral" ficaria aceso em Histórico e em Pressão também.
        const ativo = item.href === chave ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
              ativo
                ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/40"
                : "border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200"
            )}
          >
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}
