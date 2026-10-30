import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { publicDbError, publicDbErrorMessage } from "./public-error";

describe("publicDbErrorMessage (GLYX-32)", () => {
  it.each([
    [{ code: "23505", message: 'duplicate key value violates unique constraint "x"' }, /Já existe/],
    [{ code: "23514", message: 'new row violates check constraint "meals_carbs_check"' }, /fora do permitido/],
    [{ code: "42501", message: "permission denied for table meals" }, /permissão/],
    [{ message: 'new row violates row-level security policy for table "medication_logs"' }, /permissão/],
    [{ code: "PGRST301", message: "JWT expired" }, /sessão expirou/],
    [{ code: "XX000", message: "internal error" }, /Tente de novo/],
    [null, /Tente de novo/],
  ])("%j vira frase sem nome de tabela", (erro, esperado) => {
    const frase = publicDbErrorMessage(erro);
    expect(frase).toMatch(esperado);
    expect(frase).not.toMatch(/constraint|policy|table|meals|medication_logs|JWT/i);
  });

  it("o erro completo vai para o log do servidor", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const erro = { code: "23514", message: "check meals_carbs_check" };
    publicDbError(erro, "actions/meals");
    expect(log).toHaveBeenCalledWith("[actions/meals]", erro);
    log.mockRestore();
  });
});

/**
 * Trava contra regressão: nenhuma action ou rota devolve `X.message` como
 * `error` ao cliente. Varre o FONTE de `app/`, porque é lá que a resposta é
 * montada. Exceções são mensagens do fabricante do sensor, traduzidas para a
 * pessoa agir — essas não usam o padrão `error: X.message`.
 */
describe("app/ não devolve mensagem crua de erro", () => {
  const raiz = join(__dirname, "..", "..", "app");

  function arquivos(dir: string): string[] {
    return readdirSync(dir).flatMap((nome) => {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) return arquivos(p);
      return /\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [p] : [];
    });
  }

  it("nenhum `error: X.message` em resposta", () => {
    const achados = arquivos(raiz).flatMap((p) =>
      readFileSync(p, "utf8")
        .split("\n")
        .map((linha, i) => ({ linha, i }))
        .filter(({ linha }) => /\berror:\s*\w+\??\.message\b/.test(linha))
        .map(({ linha, i }) => `${relative(raiz, p)}:${i + 1}: ${linha.trim()}`)
    );
    expect(achados).toEqual([]);
  });
});
