"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  getModuleAccent,
  getModuleKeyFromPath,
  moduleSubNav,
  type ModuleAccent,
} from "@/lib/navigation";

/** A classe fica aqui porque o Tailwind só enxerga literal; a chave vem de
 *  `lib/navigation`, que é a fonte única da cor de cada módulo. */
const ATIVO: Record<ModuleAccent, string> = {
  glicemia: "bg-module-glicemia/20 text-module-glicemia ring-1 ring-module-glicemia/40",
  alimentacao: "bg-module-alimentacao/20 text-module-alimentacao ring-1 ring-module-alimentacao/40",
  exercicio: "bg-module-exercicio/20 text-module-exercicio ring-1 ring-module-exercicio/40",
  medicacao: "bg-module-medicacao/20 text-module-medicacao ring-1 ring-module-medicacao/40",
  neutro: "bg-emerald-600/25 text-emerald-200 ring-1 ring-emerald-500/40",
};

export function ModuleSubnav() {
  const pathname = usePathname();
  const key = getModuleKeyFromPath(pathname);
  if (!key) return null;

  const items = moduleSubNav[key];
  const ativo = ATIVO[getModuleAccent(pathname)];
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto pb-1 scrollbar-thin md:flex-wrap">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== key && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              active ? ativo : "bg-zinc-900/60 text-zinc-400 ring-1 ring-zinc-800 hover:text-zinc-200"
            )}
          >
            {item.title}
          </Link>
        );
      })}
    </div>
  );
}
