import { afterEach, describe, expect, it } from "vitest";
import { montarCsp, novoNonce } from "./csp";

const supabaseOriginal = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sentryOriginal = process.env.NEXT_PUBLIC_SENTRY_DSN;

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseOriginal;
  process.env.NEXT_PUBLIC_SENTRY_DSN = sentryOriginal;
});

/** Diretiva isolada da política, para asserção sobre uma só. */
function diretiva(csp: string, nome: string): string {
  return csp.split("; ").find((d) => d.startsWith(`${nome} `)) ?? "";
}

describe("montarCsp", () => {
  it("permite script inline só pelo nonce, nunca por 'unsafe-inline'", () => {
    // Esta é a asserção que dá sentido ao cabeçalho. Um CSP com
    // 'unsafe-inline' em script-src ganha a mesma nota no securityheaders.com e
    // não impede injeção nenhuma — é o conserto tentador de qualquer quebra
    // futura, e este teste existe para reprovar esse conserto.
    const csp = montarCsp("abc123");
    const script = diretiva(csp, "script-src");
    expect(script).toContain("'nonce-abc123'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("fecha as portas que não têm uso legítimo no app", () => {
    const csp = montarCsp("n");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it("libera o Supabase para dados, realtime e imagem quando configurado", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    const csp = montarCsp("n");
    expect(diretiva(csp, "connect-src")).toContain("https://abc.supabase.co");
    expect(diretiva(csp, "connect-src")).toContain("wss://abc.supabase.co");
    // As fotos de progresso e de refeição vêm por URL assinada do Storage.
    expect(diretiva(csp, "img-src")).toContain("https://abc.supabase.co");
  });

  it("não inventa origem quando a variável está vazia ou quebrada", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SENTRY_DSN = "isto-nao-e-url";
    const csp = montarCsp("n");
    expect(diretiva(csp, "connect-src")).toBe("connect-src 'self'");
    expect(csp).not.toContain("undefined");
    expect(csp).not.toContain("null");
  });

  it("não lista os provedores que só o servidor alcança", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    const csp = montarCsp("n");
    // Kimi, Dexcom, Libre e Google Fit são chamados de dentro das rotas. Se
    // aparecerem aqui, alguém moveu uma chamada para o navegador — e nesse
    // caso o problema é a chave de API exposta, não o CSP.
    for (const host of [
      "moonshot",
      "dexcom",
      "libreview",
      "googleapis",
      "openai",
    ]) {
      expect(csp).not.toContain(host);
    }
  });
});

describe("novoNonce", () => {
  it("sorteia valor diferente a cada chamada", () => {
    const valores = new Set(Array.from({ length: 50 }, () => novoNonce()));
    expect(valores.size).toBe(50);
  });
});
