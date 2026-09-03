/**
 * Content-Security-Policy do app.
 *
 * Por que existe: era o único dos seis cabeçalhos de segurança que faltava. Os
 * outros quatro estão no `next.config.ts` (valor fixo) e o HSTS vem da
 * hospedagem. Este não pode ser fixo: o `script-src` carrega um nonce que muda
 * a cada requisição, então ele nasce no middleware.
 *
 * O nonce é o que permite recusar script inline sem quebrar o Next. O Next
 * injeta `<script>` inline em toda página (a carga de hidratação), e um CSP que
 * simplesmente proibisse inline derrubaria o app. Com nonce, os scripts do
 * próprio Next passam e um `<script>` injetado por texto de terceiro — resposta
 * de IA, OCR de rótulo, nome de refeição — não passa, porque quem injeta não
 * conhece o valor sorteado naquela resposta.
 *
 * A alternativa comum, `script-src 'unsafe-inline'`, ganharia a mesma nota no
 * securityheaders.com e não pararia injeção nenhuma: é o cabeçalho presente sem
 * a proteção que o nome promete.
 */

/** Origem de uma URL de configuração, ou null se ela não existir/for inválida. */
function origemDe(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Sorteia o nonce. `crypto` global existe no runtime de edge do middleware, que
 * é onde isto roda — não usar `node:crypto`, que não existe lá.
 */
export function novoNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Monta a política. Cada origem externa aqui é uma que o NAVEGADOR alcança —
 * Supabase (dados, realtime e fotos privadas) e Sentry (erros). Os provedores
 * que o app consome no servidor (Kimi, Dexcom, Libre, Google Fit) NÃO entram:
 * quem fala com eles é a rota, não a página, e listá-los aqui afrouxaria a
 * política em troca de nada.
 */
export function montarCsp(nonce: string): string {
  const supabase = origemDe(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const sentry = origemDe(process.env.NEXT_PUBLIC_SENTRY_DSN);

  const conecta = ["'self'"];
  const imagens = ["'self'", "data:", "blob:"];
  if (supabase) {
    conecta.push(supabase, `wss://${new URL(supabase).host}`);
    imagens.push(supabase);
  }
  if (sentry) conecta.push(sentry);

  const diretivas = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    // O app não embute ninguém e não quer ser embutido: o X-Frame-Options: DENY
    // do next.config diz o mesmo para navegador velho.
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    // Sem 'unsafe-inline' em estilo os gráficos e qualquer `style=` do React
    // somem. Diferente de script, atributo de estilo não executa código: o pior
    // caso é aparência, não execução.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imagens.join(" ")}`,
    "font-src 'self'",
    `connect-src ${conecta.join(" ")}`,
    // O service worker das notificações, e blob: para a compressão de foto.
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "upgrade-insecure-requests",
  ];

  return diretivas.join("; ");
}
