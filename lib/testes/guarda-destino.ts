/**
 * Guarda de destino dos testes (GLYX-46).
 *
 * Em 14/10/2026 um teste "sem chave de serviço" APAGOU a variável do processo e o
 * Next carregou a chave de produção do `.env.local` — o Next completa a partir do
 * arquivo tudo o que FALTA no processo. Valor falso protege só os nomes que alguém
 * lembrou de preencher; esta guarda confere a configuração EFETIVA e interrompe o
 * teste antes de qualquer requisição. Registro: docs/INCIDENTES-AMBIENTE-14-10-2026.md.
 *
 * Por padrão só destinos locais são permitidos. Exceção só por variável explícita
 * (`GLYX_TESTE_HOSTS_PERMITIDOS`, lista separada por vírgula), que NENHUM arquivo do
 * repositório define — e mesmo com ela o identificador de produção continua barrado.
 * Quando uma exceção seria necessária: docs/TRD.md (T-TEST-1).
 *
 * Nunca imprime valor: compara segredo com o `.env.local` por hash.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const HOSTS_LOCAIS = ["127.0.0.1", "localhost", "::1", "host.docker.internal"] as const;

/** Identificadores do ambiente de produção (não são segredo; são o alvo a evitar). */
export const IDS_DE_PRODUCAO = ["ajlbtahvmirdgiwycecb", "glyx-sistema-inteligente-de-control.vercel.app"] as const;

export const VARIAVEL_DE_EXCECAO = "GLYX_TESTE_HOSTS_PERMITIDOS";

/** Nome com cara de destino: o valor, se for URL, precisa apontar para host permitido. */
const NOME_DE_DESTINO = /URL|BASE|DSN|SITE|WEBHOOK|ENDPOINT|HOST/;
/** Segredo ou destino: igualdade com o `.env.local` é proibida. Orçamento "1" igual ao de produção não leva a lugar nenhum. */
const NOME_SENSIVEL = /KEY|SECRET|TOKEN|PASSWORD|URL|DSN|SITE|BASE|INVITE|VAPID|WEBHOOK|ENDPOINT|HOST|EMAIL/;

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export function hostsPermitidos(env: NodeJS.ProcessEnv | Record<string, string | undefined>): Set<string> {
  const extra = (env[VARIAVEL_DE_EXCECAO] ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return new Set<string>([...HOSTS_LOCAIS, ...extra]);
}

export function hostPermitido(host: string, permitidos: Set<string>): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (IDS_DE_PRODUCAO.some((id) => h.includes(id))) return false;
  return permitidos.has(h);
}

/** Lê os pares do `.env.local` sem expor valores para fora desta função. */
function lerEnvLocal(pasta: string): Map<string, string> {
  const arq = join(pasta, ".env.local");
  const pares = new Map<string, string>();
  if (!existsSync(arq)) return pares;
  for (const linha of readFileSync(arq, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) pares.set(m[1], m[2].trim().replace(/^["']|["']$/g, ""));
  }
  return pares;
}

export type OpcoesGuarda = {
  env: Record<string, string | undefined>;
  /** Pasta do app (onde o Next procuraria o `.env.local`). */
  pasta: string;
  /**
   * true quando o processo conferido vai subir o Next (E2E, build): todo nome do
   * `.env.local` precisa estar definido, senão o Next carregaria o valor real.
   * O Vitest não lê o `.env.local`, então não precisa.
   */
  exigirCobertura: boolean;
};

/** Devolve a lista de motivos para interromper (vazia = pode rodar). */
export function conferirDestinos({ env, pasta, exigirCobertura }: OpcoesGuarda): string[] {
  const falhas: string[] = [];
  const permitidos = hostsPermitidos(env);

  for (const id of IDS_DE_PRODUCAO) {
    if ((env[VARIAVEL_DE_EXCECAO] ?? "").includes(id)) falhas.push(`${VARIAVEL_DE_EXCECAO}: não pode liberar destino de produção`);
  }

  const doArquivo = lerEnvLocal(pasta);
  for (const [nome, valorArquivo] of doArquivo) {
    const noProcesso = env[nome];
    if (noProcesso === undefined || noProcesso === "") {
      if (exigirCobertura) falhas.push(`${nome}: ausente no processo — o Next carregaria o valor do .env.local`);
    } else if (NOME_SENSIVEL.test(nome) && valorArquivo && hash(noProcesso) === hash(valorArquivo)) {
      falhas.push(`${nome}: igual ao .env.local`);
    }
  }

  for (const [nome, valor] of Object.entries(env)) {
    if (!valor || nome === VARIAVEL_DE_EXCECAO) continue;
    for (const id of IDS_DE_PRODUCAO) if (valor.includes(id)) falhas.push(`${nome}: contém identificador de produção`);
    if (NOME_DE_DESTINO.test(nome) && /^[a-z][a-z0-9+.-]*:\/\//i.test(valor)) {
      let host = "";
      try {
        host = new URL(valor).hostname;
      } catch {
        falhas.push(`${nome}: URL inválida`);
        continue;
      }
      if (!hostPermitido(host, permitidos)) falhas.push(`${nome}: host fora da lista permitida (${host})`);
    }
    for (const jwt of valor.match(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g) ?? []) {
      try {
        const corpo = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()) as { ref?: string; iss?: string };
        if (corpo.ref) falhas.push(`${nome}: JWT de projeto hospedado (ref presente)`);
        else if (corpo.iss && corpo.iss !== "supabase-demo") falhas.push(`${nome}: JWT com emissor não local`);
      } catch {
        // não é JWT decodificável: ignorado
      }
    }
  }
  return [...new Set(falhas)];
}

/** Para usar em setup de teste: lança com a lista de motivos. */
export function exigirDestinosLocais(opcoes: OpcoesGuarda): void {
  const falhas = conferirDestinos(opcoes);
  if (falhas.length) {
    throw new Error("GUARDA DE DESTINO: teste interrompido.\n - " + falhas.join("\n - "));
  }
}
