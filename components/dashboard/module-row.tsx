import Link from "next/link";
import { getModuleAccent, type ModuleAccent } from "@/lib/navigation";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

type Props = {
  title: string;
  href: string;
  icon: LucideIcon;
  metric?: string;
  metricClassName?: string;
  /**
   * Cor de identidade do módulo. Pinta o PONTO — o ícone e nada mais.
   * Severidade é que pinta bloco; a diferença de área é o que separa as duas
   * coisas quando a matiz coincide (glicemia é rosa, severidade crítica também).
   *
   * Omitido, sai do próprio `href`. Passar à mão em cada linha dava uma chance
   * de esquecer por linha — e uma linha esquecida é o módulo mudando de cor
   * entre o painel e a tela dele.
   */
  accent?: ModuleAccent;
};

const ACCENT: Record<ModuleAccent, string> = {
  glicemia: "text-module-glicemia",
  alimentacao: "text-module-alimentacao",
  exercicio: "text-module-exercicio",
  medicacao: "text-module-medicacao",
  neutro: "text-module-neutro",
};

/** Linha compacta de módulo — mesma informação do antigo ModuleTeaser em card,
 * mas densa o bastante para caber vários sem rolagem excessiva. */
export function ModuleRow({ title, href, icon: Icon, metric, metricClassName, accent }: Props) {
  const cor = ACCENT[accent ?? getModuleAccent(href)];
  return (
    <Link
      href={href}
      className="flex items-center gap-3 border-b border-zinc-800/70 py-3 last:border-b-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg"
    >
      <Icon className={`h-[18px] w-[18px] shrink-0 ${cor}`} aria-hidden />
      <span className="flex-1 text-sm text-zinc-200">{title}</span>
      {metric ? (
        <span className={metricClassName ?? "font-mono text-xs text-zinc-500"}>{metric}</span>
      ) : null}
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
    </Link>
  );
}
