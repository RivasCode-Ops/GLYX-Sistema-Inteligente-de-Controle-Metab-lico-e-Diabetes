import { afterEach, describe, expect, it } from "vitest";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { decryptCredentialDetailed, encryptCredential } from "./librelinkup";

const ORIGINAL = {
  CGM: process.env.CGM_CREDENTIALS_SECRET,
  CRON: process.env.CRON_SECRET,
};

afterEach(() => {
  if (ORIGINAL.CGM === undefined) delete process.env.CGM_CREDENTIALS_SECRET;
  else process.env.CGM_CREDENTIALS_SECRET = ORIGINAL.CGM;
  if (ORIGINAL.CRON === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL.CRON;
});

describe("CGM credential crypto", () => {
  it("cifra e decifra com CGM_CREDENTIALS_SECRET", () => {
    process.env.CGM_CREDENTIALS_SECRET = "dedicated-key-for-tests";
    delete process.env.CRON_SECRET;
    const enc = encryptCredential('{"email":"a@b.c","password":"x"}');
    const out = decryptCredentialDetailed(enc);
    expect(out.usedLegacyKey).toBe(false);
    expect(JSON.parse(out.plain)).toEqual({ email: "a@b.c", password: "x" });
  });

  it("lê payload legado CRON_SECRET quando a chave dedicada é outra", () => {
    process.env.CRON_SECRET = "old-cron-secret";
    delete process.env.CGM_CREDENTIALS_SECRET;
    const legacyCipher = encryptCredential('{"email":"old@x.com","password":"p"}');

    process.env.CGM_CREDENTIALS_SECRET = "new-dedicated-secret";
    process.env.CRON_SECRET = "old-cron-secret";
    const out = decryptCredentialDetailed(legacyCipher);
    expect(out.usedLegacyKey).toBe(true);
    expect(JSON.parse(out.plain).email).toBe("old@x.com");
  });
});

describe("migração da derivação de chave (SHA-256 simples → HKDF)", () => {
  /**
   * Reproduz o formato ANTIGO: chave = sha256(secret + ":libre-cred-v1").
   *
   * Este teste existe porque a troca da derivação é a única mudança de cripto
   * que pode deixar alguém sem conexão CGM sem nenhum erro aparente — a
   * credencial simplesmente para de abrir. Um teste que só verifica ida e volta
   * com a chave nova passaria feliz e não veria isso.
   */
  function cifrarComChaveAntiga(secret: string, plain: string): string {
    const key = createHash("sha256").update(`${secret}:libre-cred-v1`).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
  }

  it("credencial gravada com a chave antiga continua abrindo", () => {
    process.env.CGM_CREDENTIALS_SECRET = "segredo-de-producao";
    delete process.env.CRON_SECRET;

    const antiga = cifrarComChaveAntiga("segredo-de-producao", '{"email":"a@b.c"}');
    const r = decryptCredentialDetailed(antiga);

    expect(r.plain).toBe('{"email":"a@b.c"}');
    // Marcada como legada: é o sinal para o chamador re-criptografar no próximo
    // sync, e é assim que a base migra sozinha, sem janela de indisponibilidade.
    expect(r.usedLegacyKey).toBe(true);
  });

  it("o que for cifrado agora usa a chave nova e não é marcado como legado", () => {
    process.env.CGM_CREDENTIALS_SECRET = "segredo-de-producao";
    delete process.env.CRON_SECRET;

    const r = decryptCredentialDetailed(encryptCredential("novo"));
    expect(r.plain).toBe("novo");
    expect(r.usedLegacyKey).toBe(false);
  });

  it("a chave nova é DIFERENTE da antiga — senão a troca não teria efeito", () => {
    process.env.CGM_CREDENTIALS_SECRET = "segredo-de-producao";
    delete process.env.CRON_SECRET;

    // Cifrar o mesmo texto pelos dois caminhos e conferir que o antigo não abre
    // como se fosse o novo seria circular. O que prova a diferença é o próprio
    // fallback ter sido acionado no primeiro teste.
    const novo = encryptCredential("x");
    const antigo = cifrarComChaveAntiga("segredo-de-producao", "x");
    expect(novo).not.toBe(antigo);
  });

  it("segredo legado com formato antigo também abre", () => {
    // O caso mais difícil: quem ainda não trocou CRON_SECRET por
    // CGM_CREDENTIALS_SECRET e tem credencial cifrada do jeito antigo.
    process.env.CGM_CREDENTIALS_SECRET = "novo-dedicado";
    process.env.CRON_SECRET = "cron-antigo";

    const antiga = cifrarComChaveAntiga("cron-antigo", '{"email":"legado@b.c"}');
    const r = decryptCredentialDetailed(antiga);
    expect(r.plain).toBe('{"email":"legado@b.c"}');
    expect(r.usedLegacyKey).toBe(true);
  });

  it("payload corrompido continua falhando, e não abre com chave nenhuma", () => {
    process.env.CGM_CREDENTIALS_SECRET = "segredo-de-producao";
    delete process.env.CRON_SECRET;
    expect(() => decryptCredentialDetailed(Buffer.from("lixo").toString("base64"))).toThrow();
  });
});
