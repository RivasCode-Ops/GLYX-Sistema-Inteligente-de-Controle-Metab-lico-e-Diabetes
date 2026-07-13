import { describe, expect, it } from "vitest";
import { startOfLocalDayISO } from "./local-day";

describe("startOfLocalDayISO", () => {
  it("retorna meia-noite em São Paulo (UTC-3) para um horário à tarde", () => {
    // 2026-07-13 18:00 UTC = 15:00 em São Paulo, mesmo dia local
    const at = new Date("2026-07-13T18:00:00.000Z");
    expect(startOfLocalDayISO("America/Sao_Paulo", at)).toBe("2026-07-13T03:00:00.000Z");
  });

  it("já virou o dia local mesmo antes da meia-noite UTC (fuso negativo)", () => {
    // 2026-07-14 01:30 UTC = 2026-07-13 22:30 em São Paulo — ainda dia 13 local
    const at = new Date("2026-07-14T01:30:00.000Z");
    expect(startOfLocalDayISO("America/Sao_Paulo", at)).toBe("2026-07-13T03:00:00.000Z");
  });

  it("cruza a virada exata da meia-noite local", () => {
    // 2026-07-14 03:00:00 UTC = 2026-07-14 00:00:00 em São Paulo (início do dia 14)
    const at = new Date("2026-07-14T03:00:00.000Z");
    expect(startOfLocalDayISO("America/Sao_Paulo", at)).toBe("2026-07-14T03:00:00.000Z");
  });

  it("usa America/Sao_Paulo como padrão quando o fuso é nulo/indefinido", () => {
    const at = new Date("2026-07-13T18:00:00.000Z");
    expect(startOfLocalDayISO(null, at)).toBe(startOfLocalDayISO("America/Sao_Paulo", at));
    expect(startOfLocalDayISO(undefined, at)).toBe(startOfLocalDayISO("America/Sao_Paulo", at));
  });

  it("funciona em fuso positivo (Ásia/Tóquio, UTC+9)", () => {
    // 2026-07-13 20:00 UTC = 2026-07-14 05:00 em Tóquio
    const at = new Date("2026-07-13T20:00:00.000Z");
    expect(startOfLocalDayISO("Asia/Tokyo", at)).toBe("2026-07-13T15:00:00.000Z");
  });

  it("funciona em fuso com meia hora de deslocamento (Índia, UTC+5:30)", () => {
    // 2026-07-13 20:00 UTC = 2026-07-14 01:30 em Kolkata
    const at = new Date("2026-07-13T20:00:00.000Z");
    expect(startOfLocalDayISO("Asia/Kolkata", at)).toBe("2026-07-13T18:30:00.000Z");
  });

  it("respeita o horário de verão dos EUA (America/New_York)", () => {
    // Em julho (DST ativo), Nova York é UTC-4
    const summer = new Date("2026-07-13T18:00:00.000Z");
    expect(startOfLocalDayISO("America/New_York", summer)).toBe("2026-07-13T04:00:00.000Z");

    // Em janeiro (sem DST), Nova York é UTC-5
    const winter = new Date("2026-01-13T18:00:00.000Z");
    expect(startOfLocalDayISO("America/New_York", winter)).toBe("2026-01-13T05:00:00.000Z");
  });
});
