import { describe, expect, it } from "vitest";
import { urlDoAviso } from "./url-do-aviso";

describe("urlDoAviso", () => {
  it("aviso de reposição abre a tela de repor daquele item", () => {
    expect(urlDoAviso("glyx-refill-1b4e28ba-2fa1-11d2-883f-0016d3cca427@refill-2026-10-31")).toBe(
      "/medicacao/estoque/1b4e28ba-2fa1-11d2-883f-0016d3cca427"
    );
  });

  it("alarme de dose e tag desconhecida continuam em /medicacao", () => {
    expect(urlDoAviso("glyx-med-1b4e28ba-2fa1-11d2-883f-0016d3cca427@08:00-2026-10-31")).toBe("/medicacao");
    expect(urlDoAviso("glyx-refill-../../admin@refill-x")).toBe("/medicacao");
    expect(urlDoAviso(null)).toBe("/medicacao");
  });
});