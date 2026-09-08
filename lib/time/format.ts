/**
 * Formatação de data e hora para exibição — sempre com fuso explícito.
 *
 * ---------------------------------------------------------------------------
 * O DEFEITO QUE ISTO FECHA
 * ---------------------------------------------------------------------------
 * `new Date(iso).toLocaleString("pt-BR")` sem `timeZone` usa o fuso do AMBIENTE.
 * Num app Next com Server Components isso significa dois resultados diferentes
 * para o mesmo instante:
 *
 * - no servidor (Vercel roda em UTC): 03:24
 * - no navegador (America/Sao_Paulo):  00:24
 *
 * Medido em 08/09/2026: a mesma leitura de 147 mg/dL aparecia como "há 4 min"
 * numa tela e como `03:24:23` na linha do tempo; a dose de Fiasp das 19:00
 * aparecia como 22:00 no histórico; e `/glicemia/2026-09-07` começava às 03:04 e
 * terminava às 02:59, com o dia cortado três horas adiante. O console
 * acusava React #418 — text content mismatch entre servidor e cliente — que é o
 * mesmo defeito visto por outro ângulo.
 *
 * Num app de diabetes, hora errada não é cosmético: é o registro de quando a
 * insulina foi aplicada.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UM MÓDULO, E NÃO "lembrar de passar timeZone"
 * ---------------------------------------------------------------------------
 * Havia 57 chamadas sem fuso contra 7 com. Uma regra que depende de lembrar
 * falhou 57 vezes em 64. `migrations-rerunnable.test.ts` já usa a mesma solução
 * para outro caso: o teste que lê os arquivos e reprova o atalho.
 */

/** Fuso de referência quando o perfil não declara um. É o mesmo fallback que
 *  `day-summary.ts` e as demais contas de dia local já usavam. */
export const FUSO_PADRAO = "America/Sao_Paulo";

function tzOu(timezone: string | null | undefined): string {
  return timezone || FUSO_PADRAO;
}

/** Data e hora: `08/09/2026, 00:24`. */
export function formatarDataHora(
  iso: string | Date,
  timezone?: string | null,
  opcoes?: Intl.DateTimeFormatOptions
): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: tzOu(timezone),
    dateStyle: "short",
    timeStyle: "short",
    ...opcoes,
  });
}

/** Só a data: `08/09/2026`. */
export function formatarData(
  iso: string | Date,
  timezone?: string | null,
  opcoes?: Intl.DateTimeFormatOptions
): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: tzOu(timezone),
    ...opcoes,
  });
}

/** Só a hora: `00:24`. */
export function formatarHora(
  iso: string | Date,
  timezone?: string | null,
  opcoes?: Intl.DateTimeFormatOptions
): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: tzOu(timezone),
    hour: "2-digit",
    minute: "2-digit",
    ...opcoes,
  });
}

/**
 * Data pura (`YYYY-MM-DD`), sem hora nenhuma — medição corporal, meta, dia de
 * agregação.
 *
 * Ancorada ao MEIO-DIA UTC de propósito: `new Date("2026-09-08")` é meia-noite
 * UTC, que em qualquer fuso a oeste de Greenwich cai no dia 07. O meio-dia dá
 * doze horas de folga para cada lado e nenhum fuso habitado vira o dia.
 *
 * Por isso as chamadas que já usavam `T12:00:00Z` estavam corretas e não
 * precisavam de `timeZone` — este helper só lhes dá um nome.
 */
export function formatarDiaISO(
  dia: string,
  opcoes?: Intl.DateTimeFormatOptions
): string {
  return new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    ...opcoes,
  });
}
