import { describe, expect, it } from "vitest";
import { consolidarDespachos } from "./dispatch-outcome";

const ok = { entregue: true } as const;
const morta = { entregue: false, morta: true, motivo: "serviço de push respondeu 410" } as const;
const transitoria = { entregue: false, morta: false, motivo: "serviço de push respondeu 503" } as const;

describe("desfecho do despacho de alarme", () => {
  it("chegou a um aparelho basta: enviado", () => {
    const r = consolidarDespachos([
      { dispatchId: "a", resultado: transitoria },
      { dispatchId: "a", resultado: ok },
    ]);
    expect(r).toEqual([{ id: "a", status: "enviado", erro: null }]);
  });

  it("falha transitória vira 'falhou', para o banco reenviar", () => {
    const r = consolidarDespachos([
      { dispatchId: "a", resultado: morta },
      { dispatchId: "a", resultado: transitoria },
    ]);
    expect(r).toEqual([{ id: "a", status: "falhou", erro: "serviço de push respondeu 503" }]);
  });

  it("todas as assinaturas mortas: não há para onde reenviar", () => {
    const r = consolidarDespachos([{ dispatchId: "a", resultado: morta }]);
    expect(r[0].status).toBe("sem_assinatura");
  });

  it("alarmes diferentes são decididos separadamente", () => {
    const r = consolidarDespachos([
      { dispatchId: "a", resultado: ok },
      { dispatchId: "b", resultado: transitoria },
    ]);
    expect(Object.fromEntries(r.map((d) => [d.id, d.status]))).toEqual({ a: "enviado", b: "falhou" });
  });

  it("item sem dispatchId (dica, água) não pede confirmação", () => {
    expect(consolidarDespachos([{ dispatchId: null, resultado: transitoria }])).toEqual([]);
  });
});
