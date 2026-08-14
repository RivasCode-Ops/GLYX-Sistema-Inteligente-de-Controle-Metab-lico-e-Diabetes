import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { MuscleGroupId } from "@/lib/data/muscle-groups";
import type { CatalogExercise } from "@/lib/exercicios/catalog";

/**
 * Leitura do catálogo de exercícios. Referência global: não é filtrada por
 * usuário e não depende de sessão — a tabela não tem `user_id` e a política de
 * RLS é de leitura para qualquer autenticado.
 *
 * Fica separado de `lib/exercicios/catalog.ts` porque aquele módulo é importado
 * pelo formulário, que é componente cliente.
 */

const COLUMNS = "id, slug, name, mechanic, primary_muscle, source_category";

type Row = {
  id: string;
  slug: string;
  name: string;
  mechanic: string;
  primary_muscle: string | null;
  source_category: string;
};

function toCatalogExercise(row: Row): CatalogExercise {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    mechanic: row.mechanic as CatalogExercise["mechanic"],
    primaryMuscle: (row.primary_muscle as MuscleGroupId | null) ?? null,
    sourceCategory: row.source_category,
  };
}

/** Catálogo inteiro, ordenado como aparece na tela. */
export async function listCatalogExercises(): Promise<CatalogExercise[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("exercises")
    .select(COLUMNS)
    .order("source_category")
    .order("name");

  return ((data ?? []) as Row[]).map(toCatalogExercise);
}

/** Um exercício por id — o que a gravação precisa, sem trazer os 42. Recebe o
 * cliente pronto porque quem grava já autenticou o usuário. */
export async function getCatalogExercise(
  supabase: SupabaseClient,
  id: string
): Promise<CatalogExercise | null> {
  const { data } = await supabase.from("exercises").select(COLUMNS).eq("id", id).maybeSingle();
  return data ? toCatalogExercise(data as Row) : null;
}
