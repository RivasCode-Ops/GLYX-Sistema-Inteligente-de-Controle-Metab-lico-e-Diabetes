import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { destinoAposRegistro, lerConflito } from "./conflito-registro";

// Para onde a tela vai depois de registrar uma dose. Antes era `redirect()` depois
// da ação, que no build de produção nem sempre navegava (15/10/2026): a pergunta
// de conflito não abria.
const CONFLITO = {
  medicationId: "11111111-1111-4111-8111-111111111111",
  scheduledFor: "2026-10-14T11:00:00.000Z",
  takenAtPedido: "2026-10-14T16:00:00.000Z",
  pedido: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

describe("destino depois de registrar a dose", () => {
  it("conflito leva à pergunta, com tudo o que ela precisa", () => {
    const ir = destinoAposRegistro({ conflito: CONFLITO }, false, "/medicacao");
    expect(ir?.startsWith("/medicacao?conflito=1&")).toBe(true);
    expect(lerConflito(Object.fromEntries(new URL(ir!, "http://x").searchParams))).toEqual(CONFLITO);
  });

  it("sessão expirada leva ao login e volta para a tela de origem", () => {
    expect(destinoAposRegistro({ error: "Sessão expirada." }, false, "/medicacao/medicamentos")).toBe(
      "/login?next=%2Fmedicacao%2Fmedicamentos"
    );
  });

  it("falha mostra o motivo por código fechado, nunca texto livre", () => {
    expect(destinoAposRegistro({ error: "Medicamento não encontrado." }, false, "/medicacao")).toBe(
      "/medicacao?registro_erro=medicamento_nao_encontrado"
    );
    expect(destinoAposRegistro({ error: "qualquer outra coisa <script>" }, false, "/medicacao")).toBe(
      "/medicacao?registro_erro=falha_gravacao"
    );
  });

  it("resposta à pergunta volta para a tela limpa; registro comum fica onde está", () => {
    expect(destinoAposRegistro({ ok: true } as { error?: string }, true, "/medicacao")).toBe("/medicacao");
    expect(destinoAposRegistro({}, false, "/medicacao")).toBeNull();
  });

  it("as telas de dose não usam redirect() depois da ação", () => {
    for (const pagina of ["app/(app)/medicacao/page.tsx", "app/(app)/medicacao/medicamentos/page.tsx"]) {
      const fonte = readFileSync(join(process.cwd(), ...pagina.split("/")), "utf8");
      // Chamada com argumento; o comentário "sem `redirect()`" não conta.
      expect(fonte).not.toMatch(/\bredirect\([^)]/);
      expect(fonte).toMatch(/<FormularioDeAcao/);
    }
  });
});
