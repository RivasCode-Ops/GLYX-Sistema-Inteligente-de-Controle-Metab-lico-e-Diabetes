import { describe, expect, it } from "vitest";
import { summarizeOtherAccounts, sinceLabel, type AccountRow } from "./other-accounts";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const EU = "self-id";

function row(over: Partial<AccountRow> & { id: string }): AccountRow {
  return {
    email: null,
    full_name: null,
    is_admin: false,
    disabled: false,
    last_sign_in_at: null,
    last_activity_at: null,
    ...over,
  };
}

describe("summarizeOtherAccounts", () => {
  it("não conta o próprio dono como outra pessoa", () => {
    const r = summarizeOtherAccounts([row({ id: EU, email: "eu@x.com", is_admin: true })], EU);
    expect(r.active).toBe(0);
    expect(r.accounts).toHaveLength(0);
  });

  it("acusa conta ativa além da sua", () => {
    const r = summarizeOtherAccounts(
      [row({ id: EU, is_admin: true }), row({ id: "b", email: "outro@x.com" })],
      EU
    );
    expect(r.active).toBe(1);
    expect(r.accounts[0].label).toBe("outro@x.com");
  });

  /** Desativar é a ação que o aviso existe para provocar — feita, ele silencia. */
  it("conta desativada não alarma, mas continua contabilizada", () => {
    const r = summarizeOtherAccounts(
      [row({ id: EU }), row({ id: "b", email: "outro@x.com", disabled: true })],
      EU
    );
    expect(r.active).toBe(0);
    expect(r.disabled).toBe(1);
  });

  it("outro admin também conta — o aviso é sobre acesso, não sobre privilégio", () => {
    const r = summarizeOtherAccounts(
      [row({ id: EU }), row({ id: "b", email: "admin2@x.com", is_admin: true })],
      EU
    );
    expect(r.active).toBe(1);
  });

  it("usa o sinal mais recente entre acesso e registro", () => {
    const r = summarizeOtherAccounts(
      [
        row({
          id: "b",
          email: "b@x.com",
          last_sign_in_at: "2026-07-10T10:00:00Z",
          last_activity_at: "2026-07-28T10:00:00Z",
        }),
      ],
      EU
    );
    expect(r.accounts[0].lastSeenAt).toBe("2026-07-28T10:00:00Z");
    expect(r.accounts[0].lastSeenKind).toBe("registro");
  });

  it("cai para o acesso quando a conta nunca registrou nada", () => {
    const r = summarizeOtherAccounts(
      [row({ id: "b", email: "b@x.com", last_sign_in_at: "2026-07-12T14:29:00Z" })],
      EU
    );
    expect(r.accounts[0].lastSeenKind).toBe("acesso");
  });

  it("ordena da mais recente para a mais antiga, com nunca-vista por último", () => {
    const r = summarizeOtherAccounts(
      [
        row({ id: "nunca", email: "nunca@x.com" }),
        row({ id: "velha", email: "velha@x.com", last_sign_in_at: "2026-07-01T10:00:00Z" }),
        row({ id: "nova", email: "nova@x.com", last_sign_in_at: "2026-07-29T10:00:00Z" }),
      ],
      EU
    );
    expect(r.accounts.map((a) => a.id)).toEqual(["nova", "velha", "nunca"]);
  });

  it("identifica pelo nome quando existe, senão pelo e-mail", () => {
    const r = summarizeOtherAccounts(
      [
        row({ id: "a", full_name: "  Fulano  ", email: "a@x.com" }),
        row({ id: "b", email: "b@x.com" }),
        row({ id: "c" }),
      ],
      EU
    );
    expect(r.accounts.map((x) => x.label)).toEqual([
      "Fulano",
      "b@x.com",
      "conta sem identificação",
    ]);
  });
});

describe("sinceLabel", () => {
  it("descreve o intervalo em linguagem comum", () => {
    expect(sinceLabel(null, NOW)).toBe("nunca usou");
    expect(sinceLabel("2026-07-30T08:00:00Z", NOW)).toBe("hoje");
    expect(sinceLabel("2026-07-29T08:00:00Z", NOW)).toBe("ontem");
    expect(sinceLabel("2026-07-12T14:29:00Z", NOW)).toBe("há 17 dias");
    expect(sinceLabel("2026-05-30T12:00:00Z", NOW)).toBe("há 2 meses");
  });
});
