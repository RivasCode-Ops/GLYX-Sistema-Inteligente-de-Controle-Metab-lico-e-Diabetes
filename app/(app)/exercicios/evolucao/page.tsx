import { getBodySnapshot, VOLUME_WINDOW_WEEKS, PROGRESSION_WINDOW_WEEKS } from "@/lib/queries/body-composition";
import { getRecentStrengthLogs } from "@/lib/queries/strength";
import { listCatalogExercises } from "@/lib/queries/exercise-catalog";
import { computeIndirectVolume, indirectSetsPerWeek } from "@/lib/exercicios/indirect-volume";
import { computeMuscleResponse, porPrioridade } from "@/lib/exercicios/muscle-response";
import { MuscleResponseList } from "@/components/exercicios/muscle-response-list";
import { PlateauChecklistCard } from "@/components/exercicios/plateau-checklist-card";
import { montarChecklistDePlato } from "@/lib/exercicios/plateau-checklist";
import { getPlateauInputs } from "@/lib/queries/plateau-inputs";
import { getLastTrainedByMuscleGroup, getActiveMusclePauses, getSessionCountByMuscleGroup } from "@/lib/queries/muscle-recovery";
import { computeMuscleRecovery } from "@/lib/exercicios/muscle-recovery";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

/**
 * Evolução — a tela que responde "o estímulo está produzindo resultado?".
 *
 * As outras três abas do módulo respondem coisas diferentes: Plano diz o que
 * fazer hoje, Recuperação diz se pode treinar, Catálogo diz como executar.
 * Nenhuma delas responde se o treino das últimas semanas produziu alguma coisa.
 *
 * Quase nada aqui é cálculo novo. Volume, progressão de carga e volume indireto
 * já existiam em `lib/exercicios/` e já eram computados a cada carregamento de
 * `body-composition.ts` — só que **nenhuma tela os mostrava**. O volume indireto
 * chegava a ser calculado e descartado sem consumidor nenhum. Esta página é
 * sobretudo ligação; o único cálculo novo é o cruzamento em `muscle-response.ts`.
 */
export default async function EvolucaoPage() {
  const [snapshot, strengthLogs, catalog, plateau, lastTrained, pausas, logCounts] =
    await Promise.all([
      getBodySnapshot(),
      // Por contagem, não por data: cobre com folga as 4 semanas do volume.
      getRecentStrengthLogs(400),
      listCatalogExercises(),
      getPlateauInputs(PROGRESSION_WINDOW_WEEKS * 7),
      getLastTrainedByMuscleGroup(),
      getActiveMusclePauses(),
      getSessionCountByMuscleGroup(),
    ]);

  if (!snapshot) {
    return (
      <p className="mx-auto max-w-3xl text-sm text-zinc-500">
        Entre na sua conta para ver a evolução do treino.
      </p>
    );
  }

  const indiretas = indirectSetsPerWeek(
    computeIndirectVolume(strengthLogs, catalog, VOLUME_WINDOW_WEEKS),
    VOLUME_WINDOW_WEEKS
  );

  const respostas = computeMuscleResponse(
    snapshot.volume,
    snapshot.progressions,
    indiretas,
    snapshot.history,
    PROGRESSION_WINDOW_WEEKS
  ).sort(porPrioridade);

  const progressoes = [...snapshot.progressions].sort((a, b) => b.deltaPercent - a.deltaPercent);

  const recuperacao = computeMuscleRecovery(lastTrained, pausas, new Date(), logCounts);

  // "Revisar" é exatamente o platô: volume dentro da faixa e carga que não
  // subiu. O checklist aparece para o primeiro deles, que é o mais prioritário
  // pela mesma ordenação da lista acima.
  const emPlato = respostas.find((r) => r.veredito === "revisar") ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <p className="text-sm text-zinc-400">
        Volume das últimas {VOLUME_WINDOW_WEEKS} semanas, carga e medidas das últimas{" "}
        {PROGRESSION_WINDOW_WEEKS}. As janelas são diferentes de propósito: volume muda de uma
        semana para a outra, resultado não.
      </p>

      <section>
        <h2 className="mb-1 text-lg font-semibold text-zinc-100">Resposta muscular</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Cruza estímulo, carga e medida. O que pede ação aparece primeiro.
        </p>
        <MuscleResponseList respostas={respostas} />
      </section>

      {/* O checklist só existe quando existe platô: volume dentro da faixa e
          carga parada. Mostrá-lo sempre transformaria uma investigação em
          decoração de tela, e ninguém leria quando importasse. */}
      {emPlato ? (
        <PlateauChecklistCard
          itens={montarChecklistDePlato({
            ...plateau,
            gruposEmRecuperacao: recuperacao.filter((r) => r.status === "recovering").length,
            gruposPausados: recuperacao.filter((r) => r.status === "paused").length,
            gruposTotais: recuperacao.length,
            volumeSetsPorSemana: emPlato.volume.setsPerWeek,
            volumePiso: emPlato.volume.minTarget,
          })}
          grupo={emPlato.label.toLowerCase()}
          dias={plateau.dias}
        />
      ) : null}

      <section>
        <h2 className="mb-1 text-lg font-semibold text-zinc-100">Progresso de força</h2>
        <p className="mb-3 text-xs text-zinc-500">
          1RM estimado da primeira metade da janela contra a segunda — um dia ruim no fim não apaga
          semanas de progresso. Ganho abaixo de 2,5% conta como ruído de execução.
        </p>
        {progressoes.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sem carga registrada</CardTitle>
              <CardDescription>
                O app precisa de peso e repetições do mesmo exercício em dois momentos da janela.{" "}
                <Link href="/exercicios/recuperacao" className="text-module-exercicio hover:underline">
                  Registrar carga →
                </Link>
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900/30">
            {progressoes.map((p) => (
              <li
                key={p.exercise}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm capitalize text-zinc-200">{p.exercise}</p>
                  <p className="font-mono text-[11px] text-zinc-500">
                    {p.firstOneRm} → {p.lastOneRm} kg · {p.sessions}{" "}
                    {p.sessions === 1 ? "sessão" : "sessões"}
                  </p>
                </div>
                <span
                  className={`shrink-0 font-mono text-sm ${
                    p.progressing ? "text-emerald-400" : "text-zinc-500"
                  }`}
                >
                  {p.deltaPercent >= 0 ? "+" : ""}
                  {p.deltaPercent}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs leading-relaxed text-zinc-500">
        Estas faixas são referência geral de treino, não prescrição individual — quem treina há dez
        anos e quem começou ontem não respondem ao mesmo volume. O app mostra o que seus registros
        dizem; ajuste de programa é conversa com quem acompanha seu treino.
      </p>
    </div>
  );
}
