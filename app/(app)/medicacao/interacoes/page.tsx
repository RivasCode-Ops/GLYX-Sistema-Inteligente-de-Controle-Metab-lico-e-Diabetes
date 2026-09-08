import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadInteracoesEmUso } from "@/lib/queries/substance-safety";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CircleHelp, Info } from "lucide-react";

export const metadata = { title: "Interações — GLYX" };

/**
 * Panorama de interações entre o que já está em uso.
 *
 * Existia o motor, existia o alerta no painel, e não existia esta tela: o
 * painel mostrava a interação MAIS GRAVE e "Ver detalhes" levava para a lista
 * de medicamentos, que não menciona interação nenhuma. Com cinco achados no
 * conjunto ativo, quatro não apareciam em lugar algum do app.
 */

const ESTILO = {
  grave: {
    borda: "border-l-severity-critico",
    texto: "text-severity-critico",
    rotulo: "Grave",
  },
  moderada: {
    borda: "border-l-severity-atencao",
    texto: "text-severity-atencao",
    rotulo: "Moderada",
  },
  leve: { borda: "border-l-zinc-600", texto: "text-zinc-400", rotulo: "Leve" },
} as const;

export default async function InteracoesPage() {
  const supabase = await createClient();
  if (!supabase) {
    return <p className="text-sm text-zinc-500">Supabase não configurado.</p>;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <p className="text-sm text-zinc-500">Entre na sua conta para ver as interações.</p>;
  }

  const { interacoes, naoReconhecidos, totalItens } = await loadInteracoesEmUso(supabase, user.id);
  const graves = interacoes.filter((i) => i.finding.severity === "grave").length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <p className="text-sm text-zinc-400">
        Cruzamento do que você tem cadastrado como ativo, entre si. A checagem de algo{" "}
        <strong className="font-medium text-zinc-300">novo</strong> fica em{" "}
        <Link href="/medicacao/medicamentos" className="text-module-medicacao hover:underline">
          Meus medicamentos
        </Link>
        .
      </p>

      {interacoes.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nenhuma interação na base</CardTitle>
            {/* Nunca "seguro", nunca verde: a base é curada e limitada, e a
                ausência de achado é sobre ela, não sobre o seu corpo. */}
            <CardDescription>
              Entre os {totalItens} itens ativos, a base curada do app não encontrou par com
              interação descrita. Isso é sobre a base, não é atestado de segurança — ela cobre um
              conjunto de substâncias, não todas.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
            <p className="text-sm text-zinc-200">
              {interacoes.length} {interacoes.length === 1 ? "interação" : "interações"} entre os
              seus itens ativos
              {graves > 0 ? (
                <>
                  {" "}
                  · <span className="font-medium text-severity-critico">{graves} grave</span>
                  {graves > 1 ? "s" : ""}
                </>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Leve ao seu médico. O app relata a associação descrita na base — quem decide conduta é
              ele.
            </p>
          </div>

          <ul className="space-y-2">
            {interacoes.map((i) => {
              const e = ESTILO[i.finding.severity];
              return (
                <li
                  key={`${i.finding.substanceA}-${i.finding.substanceB}`}
                  className={`rounded-2xl border border-zinc-800 border-l-[3px] ${e.borda} bg-zinc-900/40 p-4`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-100">
                      {i.itensA.join(" / ")} <span className="text-zinc-600">×</span>{" "}
                      {i.itensB.join(" / ")}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-medium ${e.texto}`}
                    >
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                      {e.rotulo}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">{i.finding.message}</p>
                  <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-zinc-500">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    {i.finding.mechanism}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {naoReconhecidos.length > 0 ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <CircleHelp className="h-4 w-4 text-zinc-500" aria-hidden />
            {naoReconhecidos.length} de {totalItens}{" "}
            {totalItens === 1 ? "item não foi reconhecido" : "itens não foram reconhecidos"}
          </h2>
          {/* Dito em voz alta, e não omitido: um panorama que lista só o que
              encontrou passa impressão de cobertura total. A régua é a mesma do
              checador — "conheço e não achei nada" é diferente de "não conheço". */}
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            A base do app não conhece estes nomes, então eles não entraram em nenhum cruzamento
            acima. Ausência de alerta aqui não é ausência de risco.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {naoReconhecidos.map((n) => (
              <li
                key={n}
                className="rounded-full border border-zinc-800 bg-zinc-950/60 px-2.5 py-1 text-[11px] text-zinc-400"
              >
                {n}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-[11px] leading-relaxed text-zinc-500">
        A base é local e curada, escrita em migration com histórico — não vem de serviço externo. A
        Drug Interaction API do RxNav (NLM) foi descontinuada em 2 de janeiro de 2024 sem
        substituto, e as bases que ela usava cobrem mal justamente o par suplemento × medicamento.
      </p>
    </div>
  );
}
