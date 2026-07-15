import { afterEach, describe, expect, it } from "vitest";
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
