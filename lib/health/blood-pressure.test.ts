import { describe, expect, it } from "vitest";
import { classifyBloodPressure } from "./blood-pressure";

describe("classifyBloodPressure", () => {
  it("classifica normal", () => {
    expect(classifyBloodPressure(110, 70)).toBe("normal");
  });

  it("classifica elevada (sistólica 120-129, diastólica < 80)", () => {
    expect(classifyBloodPressure(125, 75)).toBe("elevada");
  });

  it("classifica estágio 1 quando diastólica sozinha já está em 80-89", () => {
    expect(classifyBloodPressure(125, 85)).toBe("estagio1");
  });

  it("classifica estágio 2", () => {
    expect(classifyBloodPressure(145, 92)).toBe("estagio2");
  });

  it("classifica crise hipertensiva", () => {
    expect(classifyBloodPressure(185, 95)).toBe("crise");
    expect(classifyBloodPressure(150, 125)).toBe("crise");
  });
});
