/**
 * OKLCH → sRGB e contraste WCAG.
 *
 * Existe porque a regra do sistema visual é "conferir, não presumir": a
 * conversão da landing (clara) para o app (escuro) foi um remapeamento de
 * luminosidade feito à mão, e remapeamento à mão erra contraste em silêncio —
 * o texto continua aparecendo, só que ilegível para quem não enxerga bem.
 *
 * A implementação é única e vive aqui. Quem mede é `contrast.test.ts`, que lê
 * os tokens do `globals.css` real (não de uma cópia) e grava os números em
 * `docs/CONTRASTE.md`.
 */

export type Oklch = { l: number; c: number; h: number };

/** `0.78 0.11 180` → {l, c, h}. É o formato gravado nas CSS vars. */
export function parseOklchTriple(triple: string): Oklch | null {
  const p = triple.trim().split(/\s+/).map(Number);
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return null;
  return { l: p[0], c: p[1], h: p[2] };
}

/** sRGB linear, sem gama. `clipped` marca cor fora do gamut sRGB. */
export type LinearRgb = { r: number; g: number; b: number; clipped: boolean };

export function oklchToLinearRgb({ l, c, h }: Oklch): LinearRgb {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const bb = c * Math.sin(rad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * bb;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * bb;
  const s_ = l - 0.089484178 * a - 1.291485548 * bb;

  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;

  const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const b = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;

  const clipped = [r, g, b].some((v) => v < -0.0001 || v > 1.0001);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { r: clamp(r), g: clamp(g), b: clamp(b), clipped };
}

function gamma(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

export function oklchToHex(color: Oklch): string {
  const { r, g, b } = oklchToLinearRgb(color);
  const to255 = (v: number) =>
    Math.round(Math.min(255, Math.max(0, gamma(v) * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${to255(r)}${to255(g)}${to255(b)}`;
}

/**
 * Luminância relativa WCAG. Usa o sRGB LINEAR — que é exatamente o que
 * `oklchToLinearRgb` devolve, então não há linearização a refazer aqui.
 */
export function relativeLuminance({ r, g, b }: LinearRgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: Oklch, b: Oklch): number {
  const la = relativeLuminance(oklchToLinearRgb(a));
  const lb = relativeLuminance(oklchToLinearRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Alvos WCAG AA. Texto grande e elemento de interface passam com 3:1. */
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;
