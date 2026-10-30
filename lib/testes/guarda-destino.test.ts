import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { conferirDestinos, VARIAVEL_DE_EXCECAO } from "./guarda-destino";

// .env.local FALSO numa pasta temporária: imita a forma do arquivo real, sem nenhum valor real.
const pasta = mkdtempSync(join(tmpdir(), "glyx-guarda-"));
writeFileSync(
  join(pasta, ".env.local"),
  [
    "﻿# arquivo falso de teste",
    "NEXT_PUBLIC_SUPABASE_URL=https://falso-producao.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY=sb_secret_valor-falso-de-producao",
    "OPENAI_BASE_URL=https://provedor-falso.example/v1",
    "AI_DAILY_BUDGET_USD=1",
  ].join("\n")
);
afterAll(() => rmSync(pasta, { recursive: true, force: true }));

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (corpo: object) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64(corpo)}.assinatura-falsa`;

const TESTE = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55421",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ iss: "supabase-demo", role: "anon" }),
  SUPABASE_SERVICE_ROLE_KEY: "chave-de-teste",
  OPENAI_BASE_URL: "http://127.0.0.1:9/v1",
  AI_DAILY_BUDGET_USD: "1", // igual ao "produção" de propósito: não é segredo nem destino
};

const conferir = (env: Record<string, string | undefined>, exigirCobertura = true) =>
  conferirDestinos({ env, pasta, exigirCobertura });

describe("guarda de destino (GLYX-46)", () => {
  it("aprova a configuração de teste completa", () => {
    expect(conferir(TESTE)).toEqual([]);
  });

  it("barra o caso do incidente: nome do .env.local ausente no processo", () => {
    const semChave: Record<string, string | undefined> = { ...TESTE, SUPABASE_SERVICE_ROLE_KEY: undefined };
    expect(conferir(semChave)).toEqual([
      "SUPABASE_SERVICE_ROLE_KEY: ausente no processo — o Next carregaria o valor do .env.local",
    ]);
  });

  it("no Vitest (sem carregar .env.local) ausência não é motivo de parada", () => {
    expect(conferir({}, false)).toEqual([]);
  });

  it("barra segredo igual ao do .env.local, sem imprimir o valor", () => {
    const falhas = conferir({ ...TESTE, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_valor-falso-de-producao" });
    expect(falhas).toEqual(["SUPABASE_SERVICE_ROLE_KEY: igual ao .env.local"]);
    expect(falhas.join(" ")).not.toContain("valor-falso");
  });

  it("barra destino fora da máquina", () => {
    expect(conferir({ ...TESTE, NEXT_PUBLIC_SUPABASE_URL: "https://exemplo.supabase.co" })).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL: host fora da lista permitida (exemplo.supabase.co)",
    ]);
    expect(conferir({ ...TESTE, OPENAI_BASE_URL: "https://provedor-falso.example/v1" })).toContain(
      "OPENAI_BASE_URL: host fora da lista permitida (provedor-falso.example)"
    );
  });

  it("barra identificador de produção em qualquer variável", () => {
    expect(conferir({ ...TESTE, OPS_ALERT_WEBHOOK_URL: "https://glyx-sistema-inteligente-de-control.vercel.app/x" })).toEqual([
      "OPS_ALERT_WEBHOOK_URL: contém identificador de produção",
      "OPS_ALERT_WEBHOOK_URL: host fora da lista permitida (glyx-sistema-inteligente-de-control.vercel.app)",
    ]);
  });

  it("variáveis do runner do GitHub Actions não reprovam a suíte (o CI de 30/10)", () => {
    const runner = {
      GITHUB_API_URL: "https://api.github.com",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_GRAPHQL_URL: "https://api.github.com/graphql",
      ACTIONS_RESULTS_URL: "https://results-receiver.actions.githubusercontent.com/",
      RUNNER_TEMP: "/home/runner/work/_temp",
    };
    expect(conferir({ ...TESTE, ...runner })).toEqual([]);
  });

  it("a exceção do runner é só de host: produção continua barrada nelas", () => {
    expect(
      conferir({ ...TESTE, GITHUB_SERVER_URL: "https://glyx-sistema-inteligente-de-control.vercel.app" })
    ).toEqual(["GITHUB_SERVER_URL: contém identificador de produção"]);
  });

  it("nome do app parecido com o do runner continua conferido", () => {
    expect(conferir({ ...TESTE, MY_GITHUB_API_URL: "https://api.github.com" })).toEqual([
      "MY_GITHUB_API_URL: host fora da lista permitida (api.github.com)",
    ]);
  });

  it("barra JWT de projeto hospedado", () => {
    expect(conferir({ ...TESTE, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ iss: "supabase", ref: "abcdefghijklmnop" }) })).toEqual([
      "NEXT_PUBLIC_SUPABASE_ANON_KEY: JWT de projeto hospedado (ref presente)",
    ]);
  });

  it("exceção explícita libera só o host listado, nunca produção", () => {
    const comExcecao = { ...TESTE, [VARIAVEL_DE_EXCECAO]: "teste.exemplo.invalid", NEXT_PUBLIC_SUPABASE_URL: "https://teste.exemplo.invalid" };
    expect(conferir(comExcecao)).toEqual([]);
    expect(
      conferir({ ...TESTE, [VARIAVEL_DE_EXCECAO]: "glyx-sistema-inteligente-de-control.vercel.app" })
    ).toContain(`${VARIAVEL_DE_EXCECAO}: não pode liberar destino de produção`);
  });
});

describe("rede bloqueada nos testes unitários (GLYX-46)", () => {
  it("conexão para fora da máquina é recusada antes de sair", async () => {
    await expect(fetch("https://example.invalid/")).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringContaining("GUARDA DE DESTINO") }),
    });
  });

  it("conexão local continua funcionando", async () => {
    const servidor = createServer((_, res) => res.end("ok"));
    await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
    const { port } = servidor.address() as { port: number };
    try {
      expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe("ok");
    } finally {
      servidor.close();
    }
  });
});
