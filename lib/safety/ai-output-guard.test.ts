import { describe, expect, it } from "vitest";
import {
  AVISO_RESPOSTA_BARRADA,
  RETENCAO_STREAM,
  criarGuardaDeStream,
  guardarCamposDaIA,
  guardarTextoDaIA,
  linguagemProibidaEm,
} from "./ai-output-guard";
import { findForbiddenLanguage } from "./forbidden-language";

// Etapa 1, A6: nenhum texto de IA com linguagem proibida chega ao usuário.

/** Simula o modelo mandando o texto em pedaços pequenos, como no streaming real. */
function emPedacos(texto: string, tamanho = 7): string[] {
  const out: string[] = [];
  for (let i = 0; i < texto.length; i += tamanho) out.push(texto.slice(i, i + tamanho));
  return out;
}

function rodar(texto: string) {
  const g = criarGuardaDeStream();
  let exibido = "";
  for (const p of emPedacos(texto)) {
    exibido += g.receber(p);
    if (g.bloqueado()) break;
  }
  exibido += g.finalizar();
  return { g, exibido };
}

describe("guarda de stream", () => {
  it("texto limpo sai inteiro, igual ao original", () => {
    const texto = "Sua média da semana foi 142 mg/dL. ".repeat(20) + "Leve isso à consulta.";
    const { g, exibido } = rodar(texto);
    expect(exibido).toBe(texto);
    expect(g.entregue()).toBe(texto);
    expect(g.bloqueado()).toBe(false);
  });

  it("frase proibida no meio NÃO chega a ser exibida, nem pela metade", () => {
    const antes = "Analisei seus dados das últimas duas semanas com cuidado. ".repeat(8);
    const texto = `${antes}Pelo que vejo, suspenda a metformina por uns dias e veja como fica.`;
    const { g, exibido } = rodar(texto);
    expect(g.bloqueado()).toBe(true);
    expect(exibido).not.toMatch(/suspen/i);
    expect(exibido).toContain(AVISO_RESPOSTA_BARRADA);
    // O que já tinha saído é parte do começo limpo.
    expect(antes.startsWith(exibido.split("\n\n")[0])).toBe(true);
  });

  it("previsão de glicemia com hora e valor é barrada", () => {
    const { g, exibido } = rodar("Com esse lanche, sua glicemia vai cair para 60 às 15h.");
    expect(g.bloqueado()).toBe(true);
    expect(exibido).not.toMatch(/60/);
  });

  it("frase proibida no fim, já dentro da retenção, também é barrada", () => {
    const texto = "x".repeat(RETENCAO_STREAM * 3) + " Pode manter como está.";
    const { g, exibido } = rodar(texto);
    expect(g.bloqueado()).toBe(true);
    expect(exibido).not.toMatch(/pode manter/i);
  });

  it("o histórico guarda o que foi entregue, com o aviso", () => {
    const { g } = rodar("O motivo é claro: é o remédio novo.");
    expect(g.entregue()).toContain(AVISO_RESPOSTA_BARRADA);
    expect(g.entregue()).not.toMatch(/motivo é claro/i);
  });
});

describe("texto pronto e estruturas", () => {
  it("guardarTextoDaIA troca pelo substituto", () => {
    expect(guardarTextoDaIA("Pode manter a dose.", "")).toMatchObject({ texto: "", bloqueado: true });
    expect(guardarTextoDaIA("Prefira salada antes do arroz.")).toMatchObject({ bloqueado: false });
  });

  it("guardarCamposDaIA barra todos os campos de texto quando um é proibido", () => {
    const r = guardarCamposDaIA({ resumo: "Tudo certo", dicas: ["isso está causando o pico"], n: 3 }, [
      "resumo",
      "dicas",
    ]);
    expect(r.bloqueado).toBe(true);
    expect(r.objeto.resumo).toBe(AVISO_RESPOSTA_BARRADA);
    expect(r.objeto.dicas).toEqual([]);
    expect(r.objeto.n).toBe(3);
  });

  it("linguagemProibidaEm varre objetos e listas aninhados", () => {
    expect(
      linguagemProibidaEm({ priorities: [{ title: "Sono", why: "ok", action: "interrompa o treino" }] })
    ).not.toHaveLength(0);
    expect(linguagemProibidaEm({ priorities: [{ title: "Sono", action: "dormir 7 h" }] })).toEqual([]);
  });

  it("o próprio aviso não contém linguagem proibida", () => {
    expect(findForbiddenLanguage(AVISO_RESPOSTA_BARRADA)).toEqual([]);
  });
});
