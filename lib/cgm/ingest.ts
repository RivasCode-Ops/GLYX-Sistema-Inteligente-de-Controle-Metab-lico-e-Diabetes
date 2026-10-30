import type { SupabaseClient } from "@supabase/supabase-js";
import type { UnifiedCgmReading } from "@/lib/cgm/types";

/**
 * `error` presente = a ingestão parou antes do fim. `inserted` e `skipped`
 * continuam valendo e contam o que JÁ aconteceu: o que entrou fica gravado, e
 * quem chama precisa poder dizer "entraram 3.000 de 8.600" em vez de só "falhou".
 */
export type IngestResult = {
  inserted: number;
  skipped: number;
  /** Leituras que não entraram nem eram duplicadas — perdidas, se não houver nova tentativa. */
  failed: number;
  error?: string;
};

/**
 * Tamanho do bloco. A deduplicação filtra com `.in("external_id", ids)`, que
 * vira query string: ~40 caracteres por id, então 200 ids ficam em ~8 KB de
 * URL — abaixo do teto do gateway — e a resposta fica abaixo do teto de 1000
 * linhas do PostgREST. O import do LibreView manda até ~8.600 leituras; antes
 * iam todas numa consulta só (GLYX-19).
 */
export const INGEST_CHUNK = 200;

const DUPLICADA = "23505";

/**
 * Insere leituras CGM normalizadas; dedup por (user_id, source, external_id)
 * quando external_id existe.
 *
 * Nenhum erro é engolido (GLYX-19). Antes: falha na consulta de deduplicação
 * virava "nada existe ainda"; o fallback linha a linha descartava qualquer erro
 * que não fosse duplicata — a leitura sumia sem entrar em contagem nenhuma.
 */
export async function ingestUnifiedReadings(
  supabase: SupabaseClient,
  userId: string,
  readings: UnifiedCgmReading[]
): Promise<IngestResult> {
  const total: IngestResult = { inserted: 0, skipped: 0, failed: 0 };
  // Dedup dentro do próprio envio: o mesmo ponto pode vir duas vezes no payload.
  const vistos = new Set<string>();

  for (let i = 0; i < readings.length; i += INGEST_CHUNK) {
    const bloco = readings.slice(i, i + INGEST_CHUNK);
    const r = await ingestChunk(supabase, userId, bloco, vistos);
    total.inserted += r.inserted;
    total.skipped += r.skipped;
    total.failed += r.failed;
    if (r.error) {
      // O que ainda não foi tentado também não entrou.
      total.failed += readings.length - (i + bloco.length);
      return { ...total, error: r.error };
    }
  }

  return total;
}

async function ingestChunk(
  supabase: SupabaseClient,
  userId: string,
  readings: UnifiedCgmReading[],
  vistos: Set<string>
): Promise<IngestResult> {
  const withExt = readings.filter((r) => r.externalId != null);
  const externalIds = [...new Set(withExt.map((r) => r.externalId as string))];

  const existing = new Set<string>();
  if (externalIds.length > 0) {
    const sources = [...new Set(withExt.map((r) => r.source))];
    const { data, error } = await supabase
      .from("glucose_readings")
      .select("source, external_id")
      .eq("user_id", userId)
      .in("source", sources)
      .in("external_id", externalIds);

    // Sem saber o que já existe, inserir seria apostar no índice único — e o
    // fallback para a aposta perdida é uma ida ao banco por leitura. Parar e
    // dizer é melhor que adivinhar.
    if (error) {
      return {
        inserted: 0,
        skipped: 0,
        failed: readings.length,
        error: `consulta de duplicadas falhou: ${error.message}`,
      };
    }

    for (const row of data ?? []) {
      if (row.external_id) existing.add(`${row.source}:${row.external_id}`);
    }
  }

  let skipped = 0;
  const rows: Record<string, unknown>[] = [];

  for (const r of readings) {
    const key = r.externalId ? `${r.source}:${r.externalId}` : null;
    if (key && (existing.has(key) || vistos.has(key))) {
      skipped++;
      continue;
    }
    if (key) vistos.add(key);

    rows.push({
      user_id: userId,
      value_mg_dl: r.valueMgDl,
      recorded_at: r.recordedAt,
      source: r.source,
      context: null,
      notes: null,
      external_id: r.externalId,
      trend: r.trend,
      metadata: r.metadata,
    });
  }

  if (rows.length === 0) return { inserted: 0, skipped, failed: 0 };

  const { error } = await supabase.from("glucose_readings").insert(rows);
  if (!error) return { inserted: rows.length, skipped, failed: 0 };

  if (error.code !== DUPLICADA) {
    return { inserted: 0, skipped, failed: rows.length, error: error.message };
  }

  // Duplicata no lote (corrida com outro sync): o insert em lote é tudo ou
  // nada, então tenta uma a uma. Aqui cada linha tem destino contado.
  let inserted = 0;
  let failed = 0;
  let primeiroErro: string | undefined;
  for (const row of rows) {
    const { error: e2 } = await supabase.from("glucose_readings").insert(row);
    if (!e2) inserted++;
    else if (e2.code === DUPLICADA) skipped++;
    else {
      failed++;
      primeiroErro ??= e2.message;
    }
  }

  return primeiroErro
    ? { inserted, skipped, failed, error: `${failed} leitura(s) recusada(s): ${primeiroErro}` }
    : { inserted, skipped, failed: 0 };
}
