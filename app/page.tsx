import Link from "next/link";
import { Activity, ArrowRight, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { mainNav } from "@/lib/navigation";

export default function Home() {
  const modules = mainNav.filter((item) =>
    ["/dashboard", "/glicemia", "/alimentacao", "/exercicios", "/medicacao", "/analise"].includes(
      item.href
    )
  );

  return (
    <main className="min-h-dvh overflow-hidden px-4 py-8 md:px-8">
      <section className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-7xl flex-col justify-center gap-10">
        <div className="grid items-center gap-10 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
              <Sparkles className="h-3.5 w-3.5" />
              MVP com acesso por convite · dados reais só após login
            </div>

            <div className="space-y-5">
              <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-zinc-50 md:text-7xl">
                GLYX controla sinais metabólicos em uma experiência única.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-zinc-300">
                Dashboard, glicemia, alimentação, exercício, medicação, exames e insights com
                backend Supabase. Com variáveis configuradas, o app exige login; o cadastro é
                somente por código de convite. Não substitui avaliação médica.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/login">
                  Entrar <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/register">Criar conta com convite</Link>
              </Button>
            </div>

            <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
              {[
                ["Login obrigatório", "sessão Supabase Auth"],
                ["Convite no cadastro", "signup público fechável"],
                ["LGPD na conta", "exportar e apagar dados"],
              ].map(([title, desc]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4"
                >
                  <CheckCircle2 className="mb-3 h-4 w-4 text-emerald-400" />
                  <p className="text-sm font-medium text-zinc-100">{title}</p>
                  <p className="mt-1 text-xs text-zinc-500">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          <Card className="relative overflow-hidden border-emerald-500/25 bg-zinc-950/70 shadow-2xl shadow-emerald-950/30">
            <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-emerald-500/20 to-transparent" />
            <CardHeader className="relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-400/30">
                    <Activity className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div>
                    <CardTitle>GLYX</CardTitle>
                    <CardDescription>Autocuidado metabólico · pt-BR</CardDescription>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-200">
                  invite-only
                </span>
              </div>
            </CardHeader>
            <CardContent className="relative space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["CGM", "Libre", "sync automático"],
                  ["IA", "visão", "refeição e exames"],
                  ["Push", "VAPID", "medicação"],
                ].map(([value, unit, label]) => (
                  <div key={label} className="rounded-2xl border border-zinc-800 bg-black/25 p-4">
                    <p className="font-mono text-3xl text-zinc-50">{value}</p>
                    <p className="text-xs text-emerald-300">{unit}</p>
                    <p className="mt-2 text-[11px] uppercase tracking-wide text-zinc-500">
                      {label}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {modules.slice(1, 5).map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.href}
                      className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3"
                    >
                      <span className="flex items-center gap-3 text-sm text-zinc-200">
                        <Icon className="h-4 w-4 text-emerald-400" />
                        {item.title}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-start gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
                <p className="text-sm leading-6 text-sky-100/80">
                  Esta página só aparece se o Supabase não estiver configurado no ambiente. Em
                  produção o middleware redireciona visitantes para o login.{" "}
                  <Link href="/privacidade" className="text-sky-300 underline-offset-2 hover:underline">
                    Política de Privacidade
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
