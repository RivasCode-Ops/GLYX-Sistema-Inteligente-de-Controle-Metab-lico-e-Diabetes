import { afterEach, describe, expect, it } from "vitest";
import { signDexcomOAuthState, verifyDexcomOAuthState } from "./dexcom";

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

describe("Dexcom OAuth state", () => {
  it("assina e valida state", () => {
    process.env.CGM_CREDENTIALS_SECRET = "test-oauth-secret";
    const state = signDexcomOAuthState("user-123", Date.now());
    expect(verifyDexcomOAuthState(state)?.userId).toBe("user-123");
  });

  it("rejeita state adulterado", () => {
    process.env.CGM_CREDENTIALS_SECRET = "test-oauth-secret";
    const state = signDexcomOAuthState("user-123", Date.now());
    expect(verifyDexcomOAuthState(state + "x")).toBeNull();
  });
});
