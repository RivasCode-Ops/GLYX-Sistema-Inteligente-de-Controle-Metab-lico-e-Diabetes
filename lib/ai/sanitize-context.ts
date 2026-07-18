/**
 * Corta e neutraliza texto de origem não confiável (ex.: nome/dosagem lidos
 * por OCR de foto de rótulo) antes de interpolar em prompt de IA — sem
 * limite, um rótulo fabricado poderia embutir instruções longas que se
 * passam por parte do contexto do sistema. Achata quebras de linha (para não
 * imitar uma nova linha de instrução) e trunca a um tamanho curto, já que
 * nome/dosagem de remédio nunca precisam ser longos.
 */
export function sanitizeForPrompt(value: string, maxLen: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > maxLen ? `${flat.slice(0, maxLen)}…` : flat;
}
