import { describe, expect, it } from "vitest";
import { computeHourlyPattern, worstHours } from "./hourly-pattern";

const TZ = "America/Sao_Paulo";

function reading(hourUTC: number, value: number, day = 10) {
  return {
    value_mg_dl: value,
    recorded_at: `2026-07-${String(day).padStart(2, "0")}T${String(hourUTC).padStart(2, "0")}:00:00.000Z`,
  };
}

describe("computeHourlyPattern", () => {
  it("agrupa pela hora LOCAL (15h UTC = 12h em São Paulo)", () => {
    const buckets = computeHourlyPattern([reading(15, 200)], TZ, 180);
    expect(buckets).toEqual([{ hour: 12, avg: 200, count: 1, pctAbove: 100 }]);
  });

  it("calcula média e % acima da meta por hora", () => {
    const buckets = computeHourlyPattern(
      [reading(15, 200, 10), reading(15, 160, 11), reading(3, 100, 10)],
      TZ,
      180
    );
    const meioDia = buckets.find((b) => b.hour === 12)!;
    expect(meioDia.avg).toBe(180);
    expect(meioDia.count).toBe(2);
    expect(meioDia.pctAbove).toBe(50);
  });
});

describe("worstHours", () => {
  it("ignora horas com poucas leituras e ordena da pior para a melhor", () => {
    const readings = [
      ...Array.from({ length: 5 }, (_, i) => reading(15, 220, 10 + i)),
      ...Array.from({ length: 5 }, (_, i) => reading(23, 150, 10 + i)),
      reading(3, 300, 10),
    ];
    const worst = worstHours(computeHourlyPattern(readings, TZ, 180));
    expect(worst[0]?.hour).toBe(12);
    expect(worst.find((b) => b.hour === 0)).toBeUndefined();
  });
});
