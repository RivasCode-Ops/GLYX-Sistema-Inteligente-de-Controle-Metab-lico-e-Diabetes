import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AliasRow, InteractionFinding, Severity } from "../interaction-check";
import type { MechanismRow } from "../mechanism-count";

/**
 * Lê o seed real da migration de segurança.
 *
 * Os testes usam a base CURADA, não um fixture escrito à mão. O incidente que
 * originou o módulo não foi do motor sozinho nem da base sozinha — foi da
 * combinação. Um fixture inventado testaria o motor contra dados que não são os
 * que rodam em produção, e passaria verde no dia em que alguém errasse uma
 * linha do seed.
 *
 * A suíte não sobe Postgres (o projeto não tem `config.toml` nem container),
 * então o SQL é lido como texto. É paliativo assumido, do mesmo tipo já usado em
 * `lib/exercicios/catalog.test.ts`.
 *
 * Só é importado por arquivos de teste — fica fora do bundle do app.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const MIGRATION_INTERACOES = join(MIGRATIONS_DIR, "20260907120000_substance_safety.sql");
const MIGRATION_MECANISMOS = join(MIGRATIONS_DIR, "20260907140000_substance_mechanisms.sql");

/** SQL sem comentários de linha. Nenhuma string do seed contém `--`. */
function lerSql(caminho: string): string {
  return readFileSync(caminho, "utf8")
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

function sql(): string {
  return lerSql(MIGRATION_INTERACOES);
}

/**
 * Extrai as tuplas de um `insert into <tabela> ... values ...;`.
 *
 * Varre caractere a caractere respeitando aspas em vez de usar regex por
 * tupla: as mensagens clínicas contêm vírgulas, e um split ingênuo por vírgula
 * partiria a mensagem no meio.
 */
function tuplesFor(table: string, texto: string = sql()): string[][] {
  const inicio = texto.indexOf(`insert into public.${table}`);
  if (inicio === -1) throw new Error(`insert de ${table} não encontrado na migration`);

  // Corta antes do `on conflict (...)`: aquele parêntese não é uma tupla de
  // dados, e engoli-lo como tupla produzia campos undefined — falha barulhenta,
  // mas por pouco: uma tupla vazia a mais e o seed passaria a ser lido errado
  // em silêncio.
  const pontoEVirgula = texto.indexOf(";", inicio);
  const onConflict = texto.indexOf("on conflict", inicio);
  const fim = onConflict !== -1 && onConflict < pontoEVirgula ? onConflict : pontoEVirgula;
  const corpo = texto.slice(texto.indexOf("values", inicio) + "values".length, fim);

  const tuplas: string[][] = [];
  let atual: string[] | null = null;
  let campo = "";
  let emAspas = false;

  for (let i = 0; i < corpo.length; i += 1) {
    const c = corpo[i];
    if (emAspas) {
      if (c === "'") {
        emAspas = false;
        atual?.push(campo);
        campo = "";
      } else {
        campo += c;
      }
      continue;
    }
    if (c === "'") {
      emAspas = true;
      continue;
    }
    if (c === "(") atual = [];
    else if (c === ")" && atual) {
      tuplas.push(atual);
      atual = null;
    }
  }

  return tuplas;
}

/** Garante que cada tupla tem a aridade esperada antes de virar objeto. */
function tuplasComAridade(table: string, aridade: number, texto?: string): string[][] {
  const tuplas = tuplesFor(table, texto);
  for (const t of tuplas) {
    if (t.length !== aridade) {
      throw new Error(`tupla de ${table} com ${t.length} campos (esperado ${aridade}): ${t.join(" | ")}`);
    }
  }
  return tuplas;
}

export function seedAliases(): AliasRow[] {
  return tuplasComAridade("substance_aliases", 2).map(([canonical, alias]) => ({
    canonical,
    alias,
  }));
}

export function seedInteractions(): InteractionFinding[] {
  return tuplasComAridade("substance_interactions", 5).map(
    ([substanceA, substanceB, severity, mechanism, message]) => ({
      substanceA,
      substanceB,
      severity: severity as Severity,
      mechanism,
      message,
    })
  );
}

/**
 * Seed de `substance_mechanisms`.
 *
 * `lowers_glucose` vem como literal SQL (`true`/`false`) e a duração como
 * número — o tokenizador só extrai strings entre aspas, então aqui os campos
 * não-string são lidos por regex sobre a tupla inteira.
 */
export function seedMechanisms(): MechanismRow[] {
  const texto = lerSql(MIGRATION_MECANISMOS);
  const inicio = texto.indexOf("insert into public.substance_mechanisms");
  if (inicio === -1) throw new Error("insert de substance_mechanisms não encontrado");
  const fimClause = texto.indexOf("on conflict", inicio);
  const corpo = texto.slice(texto.indexOf("values", inicio), fimClause);

  const linhas = [...corpo.matchAll(/\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*(true|false)\s*,\s*'([^']*)'\s*,\s*([\d.]+)\s*\)/g)];
  if (!linhas.length) throw new Error("nenhuma tupla de substance_mechanisms lida");

  return linhas.map((m) => ({
    canonical: m[1],
    mechanism: m[2],
    lowersGlucose: m[3] === "true",
    label: m[4],
    typicalDurationHours: Number(m[5]),
  }));
}

/** Vocabulário aceito pelo CHECK de `severity` no Postgres. */
export function severityCheckVocabulary(): string[] {
  const m = sql().match(/severity\s+text not null check \(severity in \(([^)]*)\)\)/);
  if (!m) throw new Error("CHECK de severity não encontrado na migration");
  return m[1]
    .split(",")
    .map((v) => v.trim().replace(/'/g, ""))
    .filter(Boolean);
}
