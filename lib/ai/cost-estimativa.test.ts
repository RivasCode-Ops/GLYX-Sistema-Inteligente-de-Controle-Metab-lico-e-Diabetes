import { describe, expect, it } from "vitest";
import { estimarUsoDeTokens } from "./cost";

describe("estimarUsoDeTokens", () => {
  it("arredonda para cima, ~4 caracteres por token", () => {
    expect(estimarUsoDeTokens("a".repeat(9), 5)).toEqual({ prompt_tokens: 3, completion_tokens: 2 });
    expect(estimarUsoDeTokens("", 0)).toEqual({ prompt_tokens: 0, completion_tokens: 0 });
  });
});