/**
 * Só aceita como destino de push os serviços dos navegadores (GLYX-31 / P25).
 *
 * O endpoint vem do navegador do usuário e o SERVIDOR faz o POST para ele. Sem
 * filtro, qualquer conta logada podia cadastrar `http://169.254.169.254/...`
 * ou um host interno e fazer o servidor bater lá a cada alarme — SSRF com
 * agenda. Os navegadores só emitem endpoints destes serviços:
 *
 * - Chrome, Android, Opera, Brave: `fcm.googleapis.com` (e o antigo `android.googleapis.com`)
 * - Firefox: `updates.push.services.mozilla.com` e variações em `push.services.mozilla.com`
 * - Safari (macOS 13+, iOS 16.4+): `web.push.apple.com`
 * - Edge: `*.notify.windows.com` (WNS, com prefixo regional, ex. `wns2-par02p`)
 *
 * Navegador novo com serviço próprio entra aqui; até lá, a assinatura dele é
 * recusada com 400 — falha visível, não silenciosa.
 */
const HOSTS_EXATOS = new Set([
  "fcm.googleapis.com",
  "android.googleapis.com",
  "web.push.apple.com",
]);
const SUFIXOS = [".push.services.mozilla.com", ".notify.windows.com"];

export function isKnownPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  // https puro, porta padrão, sem credencial embutida.
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return HOSTS_EXATOS.has(host) || SUFIXOS.some((s) => host.endsWith(s));
}
