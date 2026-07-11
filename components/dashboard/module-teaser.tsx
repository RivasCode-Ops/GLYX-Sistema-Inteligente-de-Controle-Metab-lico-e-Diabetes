import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  metric?: string;
  trend?: "up" | "down" | "stable";
};

export function ModuleTeaser({
  title,
  description,
  href,
  icon: Icon,
  metric,
  trend,
}: Props) {
  return (
    <Link href={href} className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-2xl">
      <Card
        className={cn(
          "h-full transition-all duration-200",
          "hover:border-emerald-500/35 hover:bg-zinc-900/70 hover:shadow-lg hover:shadow-emerald-950/20",
          "group-active:scale-[0.99]"
        )}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-950/80 ring-1 ring-sky-800/80">
              <Icon className="h-5 w-5 text-emerald-400" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="mt-1 max-w-prose">{description}</CardDescription>
            </div>
          </div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:text-emerald-400" />
        </CardHeader>
        <CardContent className="flex items-center justify-between pt-0">
          {metric ? (
            <p className="font-mono text-sm text-zinc-300">
              {metric}
              {trend ? (
                <span className="ml-2 text-xs text-zinc-500">
                  {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-xs text-zinc-500">Abrir módulo</p>
          )}
          <span className="text-xs font-medium text-emerald-400/90 opacity-0 transition group-hover:opacity-100">
            Explorar
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
