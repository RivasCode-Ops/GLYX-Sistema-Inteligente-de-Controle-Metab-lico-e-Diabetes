import { describe, expect, it } from "vitest";
import { namesLookSimilar } from "./similar";

describe("namesLookSimilar", () => {
  it("detecta o mesmo remédio com nomes diferentes (marca em comum)", () => {
    expect(namesLookSimilar("Insulina Fiasp", "Fiasp FlexTouch insulina asparte")).toBe(true);
  });

  it("não confunde duas insulinas diferentes só por compartilharem 'insulina'", () => {
    expect(namesLookSimilar("Insulina Fiasp", "Insulina Lantus (Glargina)")).toBe(false);
  });

  it("não confunde remédios sem nenhuma palavra em comum", () => {
    expect(namesLookSimilar("Glyxambi 25/5", "Creatina")).toBe(false);
  });

  it("ignora maiúsculas e acentos", () => {
    expect(namesLookSimilar("CREATINA", "creatína monohidratada")).toBe(true);
  });
});
