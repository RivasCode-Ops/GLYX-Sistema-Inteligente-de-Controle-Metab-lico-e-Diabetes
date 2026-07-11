import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Item = { title: string; description: string; href: string };

export function SectionCards({ items, className }: { items: Item[]; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
          <Card className="h-full transition hover:border-emerald-500/30 hover:bg-zinc-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base group-hover:text-emerald-200">{item.title}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent className="text-xs font-medium text-emerald-400/80 opacity-0 transition group-hover:opacity-100">
              Abrir →
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
