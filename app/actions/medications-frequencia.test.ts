import { beforeEach, describe, expect, it, vi } from "vitest";

// D1–D3 (aprovadas em 15/10/2026) no caminho da TELA, com banco falso em
// memória. `semColuna` imita o banco antes da migration 20261015103000: o
// PostgREST recusa `cadence_confirmed_at` com PGRST204.
type Linha = Record<string, unknown>;
const estado = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => estado.cliente }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { addMedication, confirmarFrequencia, updateMedication } from "./medications";

const USER = "pessoa-sintetica";
const ID = "med-1";

function bancoFalso({ semColuna = false, inicial = [] as Linha[] } = {}) {
  const linhas: Linha[] = inicial.map((l) => ({ ...l }));
  const recusa = (l: Linha) =>
    semColuna && "cadence_confirmed_at" in l
      ? {
          code: "PGRST204",
          message: "Could not find the 'cadence_confirmed_at' column of 'medications' in the schema cache",
          details: null,
          hint: null,
        }
      : null;
  const cliente = {
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    from() {
      return {
        insert: async (l: Linha) => {
          const erro = recusa(l);
          if (!erro) linhas.push({ id: `med-${linhas.length + 1}`, ...l });
          return { error: erro };
        },
        update: (l: Linha) => {
          const filtros: Linha = {};
          const q = {
            eq(col: string, v: unknown) {
              filtros[col] = v;
              if (Object.keys(filtros).length < 2) return q;
              const erro = recusa(l);
              if (!erro) {
                for (const r of linhas) {
                  if (Object.entries(filtros).every(([k, x]) => r[k] === x)) Object.assign(r, l);
                }
              }
              return Promise.resolve({ error: erro });
            },
          };
          return q;
        },
        select: () => {
          const filtros: Linha = {};
          const q = {
            eq(col: string, v: unknown) {
              filtros[col] = v;
              return q;
            },
            maybeSingle: async () => {
              const r = linhas.find((x) => Object.entries(filtros).every(([k, v]) => x[k] === v));
              if (!r) return { data: null, error: null };
              const copia = { ...r };
              if (semColuna) delete copia.cadence_confirmed_at;
              return { data: copia, error: null };
            },
          };
          return q;
        },
      };
    },
  };
  return { cliente, linhas };
}

const form = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

const ANTIGO: Linha = {
  id: ID,
  user_id: USER,
  name: "Remédio antigo",
  reminder_times: ["08:00"],
  cadence: "diaria",
  cadence_confirmed_at: null,
  timing_strictness: "flexivel",
};

let db: ReturnType<typeof bancoFalso>;
beforeEach(() => {
  db = bancoFalso({ inicial: [ANTIGO] });
  estado.cliente = db.cliente;
});

describe("D1 — cadastro novo", () => {
  it("com horário e sem frequência é recusado com frase, e nada é gravado", async () => {
    const r = await addMedication(form({ name: "Novo", reminder_times: "08:00" }));
    expect(r.error).toBe("Escolha a frequência dos alarmes: todo dia, uma vez por semana ou a cada N dias.");
    expect(db.linhas).toHaveLength(1);
  });

  it("com frequência escolhida grava a frequência e a marca de confirmação", async () => {
    expect(await addMedication(form({ name: "Novo", reminder_times: "08:00", cadence: "diaria" }))).toEqual({ ok: true });
    const novo = db.linhas[1];
    expect(novo.cadence).toBe("diaria");
    expect(typeof novo.cadence_confirmed_at).toBe("string");
  });

  it("sem horário não exige frequência e não marca confirmação", async () => {
    expect(await addMedication(form({ name: "Sem horário" }))).toEqual({ ok: true });
    expect(db.linhas[1].cadence).toBeNull();
    expect("cadence_confirmed_at" in db.linhas[1]).toBe(false);
  });

  it("banco antes da migration: grava a frequência escolhida sem a coluna nova", async () => {
    db = bancoFalso({ semColuna: true });
    estado.cliente = db.cliente;
    expect(await addMedication(form({ name: "Novo", reminder_times: "08:00", cadence: "semanal", cadence_weekday: "3" }))).toEqual({ ok: true });
    expect(db.linhas[0]).toMatchObject({ cadence: "semanal", cadence_weekday: 3 });
    expect("cadence_confirmed_at" in db.linhas[0]).toBe(false);
  });
});

describe("D1 — itens antigos", () => {
  it("editar outro campo deixando a frequência vazia não muda nem confirma", async () => {
    const r = await updateMedication(form({ medication_id: ID, name: "Nome novo", reminder_times: "08:00", cadence: "" }));
    expect(r).toEqual({ ok: true });
    expect(db.linhas[0]).toMatchObject({ name: "Nome novo", cadence: "diaria", cadence_confirmed_at: null, reminder_times: ["08:00"] });
  });

  it("confirmar é ação explícita: registra a confirmação sem mudar horário nem frequência", async () => {
    expect(await confirmarFrequencia(form({ medication_id: ID }))).toEqual({ ok: true });
    expect(db.linhas[0]).toMatchObject({ cadence: "diaria", reminder_times: ["08:00"] });
    expect(typeof db.linhas[0].cadence_confirmed_at).toBe("string");
  });

  it("frequência nunca declarada, confirmada, passa a constar como 'todo dia' (o que o alarme já fazia)", async () => {
    db = bancoFalso({ inicial: [{ ...ANTIGO, cadence: null }] });
    estado.cliente = db.cliente;
    expect(await confirmarFrequencia(form({ medication_id: ID }))).toEqual({ ok: true });
    expect(db.linhas[0].cadence).toBe("diaria");
  });

  it("antes da migration a confirmação avisa que não está disponível", async () => {
    db = bancoFalso({ semColuna: true, inicial: [ANTIGO] });
    estado.cliente = db.cliente;
    expect(await confirmarFrequencia(form({ medication_id: ID }))).toEqual({
      error: "A confirmação da frequência ainda não está disponível. Tente mais tarde.",
    });
  });
});

describe("D3 — 'livre' com horário", () => {
  const LIVRE = { ...ANTIGO, timing_strictness: "livre" };
  beforeEach(() => {
    db = bancoFalso({ inicial: [LIVRE] });
    estado.cliente = db.cliente;
  });

  it("editar sem programação não ativa alarme", async () => {
    await updateMedication(form({ medication_id: ID, name: "x", reminder_times: "08:00", cadence: "diaria" }));
    expect(db.linhas[0].timing_strictness).toBe("livre");
  });

  it("programação sem frequência escolhida é recusada", async () => {
    const r = await updateMedication(form({ medication_id: ID, name: "x", reminder_times: "08:00", cadence: "", timing_strictness: "flexivel" }));
    expect(r.error).toBe("Para ativar o alarme deste item, escolha também a frequência.");
    expect(db.linhas[0].timing_strictness).toBe("livre");
  });

  it("programação e frequência escolhidas ativam", async () => {
    const r = await updateMedication(form({ medication_id: ID, name: "x", reminder_times: "08:00", cadence: "diaria", timing_strictness: "rigido" }));
    expect(r).toEqual({ ok: true });
    expect(db.linhas[0]).toMatchObject({ timing_strictness: "rigido", cadence: "diaria" });
  });

  it("não se confirma pelo botão: precisa escolher a programação", async () => {
    expect(await confirmarFrequencia(form({ medication_id: ID }))).toEqual({
      error: "Para ativar o alarme deste item, escolha também a frequência.",
    });
    expect(db.linhas[0].cadence_confirmed_at).toBeNull();
  });
});
