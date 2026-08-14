import Link from "next/link";
import { listCatalogExercises } from "@/lib/queries/exercise-catalog";
import { groupByCategory } from "@/lib/exercicios/catalog";
import { MUSCLE_GROUP_BY_ID } from "@/lib/data/muscle-groups";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Catálogo de exercícios — GLYX" };

/**
 * O catálogo visível.
 *
 * Ele existia desde a Fatia 1 e só aparecia como lista suspensa dentro do
 * formulário de carga: dava para escolher um exercício, não para ver quais
 * existem. Saber o que o app conhece antes de ir treinar é outra pergunta, e é
 * a que esta tela responde.
 */
export default async function CatalogoPage() {
  const catalog = await listCatalogExercises();
  const groups = groupByCategory(catalog);
  const resistencia = catalog.filter((e) => e.mechanic === "resistencia").length;
  const cardio = catalog.length - resistencia;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <p className="text-sm text-zinc-400">
        {catalog.length} exercícios que o app reconhece — {resistencia} de resistência e {cardio} de
        cardio. Escolher da lista ao{" "}
        <Link href="/exercicios/recuperacao" className="text-emerald-300 underline">
          registrar carga
        </Link>{" "}
        é o que faz o app saber qual músculo você treinou; digitar o nome à mão registra o peso, mas
        não conta na recuperação muscular.
      </p>

      {groups.map((group) => (
        <Card key={group.category}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{group.category}</CardTitle>
            <CardDescription>
              {group.exercises.length}{" "}
              {group.exercises.length === 1 ? "exercício" : "exercícios"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1.5">
              {group.exercises.map((exercise) => (
                <li
                  key={exercise.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/70 bg-zinc-950/40 px-3 py-2"
                >
                  <span className="text-sm text-zinc-200">
                    {exercise.name}
                    {exercise.secondaryMuscles.length ? (
                      <span className="mt-0.5 block text-[11px] text-zinc-500">
                        também recruta{" "}
                        {exercise.secondaryMuscles
                          .map((m) => MUSCLE_GROUP_BY_ID[m].label.toLowerCase())
                          .join(" e ")}
                      </span>
                    ) : null}
                  </span>
                  {exercise.primaryMuscle ? (
                    <span className="shrink-0 rounded-md bg-zinc-800/80 px-2 py-0.5 text-[11px] text-zinc-300">
                      {MUSCLE_GROUP_BY_ID[exercise.primaryMuscle].label}
                    </span>
                  ) : (
                    // Cardio não tem músculo primário e não entra no motor de
                    // fadiga — dizer isso aqui evita a leitura de que faltou dado.
                    <span className="shrink-0 rounded-md bg-zinc-800/50 px-2 py-0.5 text-[11px] text-zinc-500">
                      cardio
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {catalog.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-zinc-400">
            O catálogo está vazio. Isso quer dizer que a migration que o popula não foi aplicada
            neste banco.
          </CardContent>
        </Card>
      ) : null}

      <p className="text-[11px] leading-snug text-zinc-500">
        A categoria é a do material de origem e nem sempre bate com o músculo principal — elevação
        pélvica vem em &quot;Pernas&quot; e é de glúteos. As duas informações aparecem juntas de
        propósito: a categoria é onde você procura, o músculo é o que o app conta.
      </p>
      <p className="text-[11px] leading-snug text-zinc-500">
        &quot;Também recruta&quot; é trabalho secundário: supino treina tríceps e ombro nas mesmas
        séries em que treina peito. Isso <strong>não</strong> entra na conta comparada com a sua
        meta de volume — as faixas de referência já contam com o trabalho indireto dos compostos, e
        somar duas vezes daria um número alto e errado. Aparece como informação à parte.
      </p>
    </div>
  );
}
