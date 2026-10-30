import type { Breadcrumb, Event } from "@sentry/nextjs";

/**
 * O que sai para o Sentry (GLYX-35 / P28).
 *
 * `sendDefaultPii: false` tira IP e cookie de sessão, mas não tira o CORPO da
 * requisição, a query string nem os breadcrumbs. Num app de diabetes o corpo é
 * glicemia, dose, nome de remédio, foto de exame — dado sensível da LGPD, que
 * não pode ir para um processador que a DPIA não prevê para isso.
 *
 * Regra: o Sentry recebe o suficiente para achar o defeito (rota, método,
 * stack, tags) e nada do conteúdo. Os três `Sentry.init` chamam isto.
 */

/** Cabeçalhos que ajudam a diagnosticar e não carregam dado da pessoa. */
const HEADERS_PERMITIDOS = new Set(["content-type", "content-length", "accept", "user-agent"]);

/** Tira os valores da query e o fragmento: `?code=abc&state=x` → `?code=&state=`. */
export function scrubUrl(url: string): string {
  const semFragmento = url.split("#")[0];
  const i = semFragmento.indexOf("?");
  if (i === -1) return semFragmento;
  const chaves = semFragmento
    .slice(i + 1)
    .split("&")
    .filter(Boolean)
    .map((par) => `${par.split("=")[0]}=`);
  return `${semFragmento.slice(0, i)}?${chaves.join("&")}`;
}

export function scrubEvent<T extends Event>(event: T): T {
  if (event.request) {
    const req = event.request;
    delete req.data;
    delete req.cookies;
    delete req.query_string;
    if (req.url) req.url = scrubUrl(req.url);
    if (req.headers) {
      req.headers = Object.fromEntries(
        Object.entries(req.headers).filter(([k]) => HEADERS_PERMITIDOS.has(k.toLowerCase()))
      );
    }
  }

  // Só o id: e-mail, nome e IP ficam de fora mesmo se algum código os setar.
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {};

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map((b) => scrubBreadcrumb(b))
      .filter((b): b is Breadcrumb => b !== null);
  }

  return event;
}

/**
 * Breadcrumb de console carrega o que o código logou — e o código loga erro de
 * banco com a linha inteira. Fica só nível e categoria. Navegação e fetch
 * ficam, com a URL limpa: é por eles que se reconstrói o caminho até o erro.
 */
export function scrubBreadcrumb(b: Breadcrumb): Breadcrumb | null {
  if (b.category === "console") {
    return { ...b, message: "[console omitido]", data: undefined };
  }
  if (!b.data) return b;
  const data: Record<string, unknown> = { ...b.data };
  for (const k of ["url", "from", "to"]) {
    if (typeof data[k] === "string") data[k] = scrubUrl(data[k] as string);
  }
  // Corpo de fetch/xhr, quando alguma integração o anexa.
  delete data.body;
  delete data.request_body;
  delete data.response_body;
  return { ...b, data };
}
