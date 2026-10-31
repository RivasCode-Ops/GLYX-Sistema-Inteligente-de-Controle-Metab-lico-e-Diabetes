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

/**
 * Limpa TEXTO livre que vai ao Sentry: mensagem do evento, valor da exceção e
 * strings em `extra` (Etapa 1, A9). Erro do Postgres traz a linha recusada
 * inteira ("Failing row contains (… 54, 'Insulina Lantus' …)") e o par
 * chave/valor da violação; erro de rede pode trazer e-mail ou token. A pilha e o
 * tipo do erro ficam — é com eles que se acha o defeito.
 */
export function scrubText(texto: string): string {
  return texto
    .replace(/Failing row contains \([\s\S]*?\)(?=\.|$|\s)/gi, "Failing row contains ([omitido])")
    .replace(/Key \((.*?)\)=\((.*?)\)/g, "Key ($1)=([omitido])")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[e-mail]")
    .replace(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g, "[jwt]")
    .replace(/\b(sk|sb_secret|sb_publishable)[-_][A-Za-z0-9_-]{8,}/g, "[chave]")
    .replace(/\b\d+(?:[.,]\d+)?\s*mg\/dl\b/gi, "[valor] mg/dL")
    .slice(0, 2000);
}

/** Contextos que descrevem o ambiente, não a pessoa nem a requisição. */
const CONTEXTOS_PERMITIDOS = new Set(["runtime", "os", "browser", "device", "trace", "app", "culture", "cloud_resource"]);

function scrubExtra(extra: Record<string, unknown>): Record<string, unknown> {
  const limpo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    if (/body|payload|content|prompt|resposta|texto/i.test(k)) continue;
    if (typeof v === "string") limpo[k] = scrubText(v);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) limpo[k] = v;
    // objetos e listas ficam de fora: não dá para garantir o que carregam
  }
  return limpo;
}

export function scrubEvent<T extends Event>(event: T): T {
  if (typeof event.message === "string") event.message = scrubText(event.message);
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (typeof ex.value === "string") ex.value = scrubText(ex.value);
    }
  }
  if (event.extra) event.extra = scrubExtra(event.extra as Record<string, unknown>);
  if (event.contexts) {
    event.contexts = Object.fromEntries(
      Object.entries(event.contexts).filter(([k]) => CONTEXTOS_PERMITIDOS.has(k))
    ) as T["contexts"];
  }

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
