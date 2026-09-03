import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { montarCsp, novoNonce } from "@/lib/security/csp";

export async function middleware(request: NextRequest) {
  const nonce = novoNonce();
  const csp = montarCsp(nonce);

  // O nonce precisa ir nos cabeçalhos da REQUISIÇÃO, não só na resposta: é de
  // lá que o Next o lê para carimbar os próprios <script> inline. Só na
  // resposta, o valor não bateria com script nenhum e a página ficaria em
  // branco.
  const cabecalhos = new Headers(request.headers);
  cabecalhos.set("x-nonce", nonce);
  cabecalhos.set("Content-Security-Policy", csp);

  // O CSP entra em TODA resposta que sai daqui — inclusive os redirecionamentos
  // e o 403 de conta desativada. Cabeçalho posto só no caminho feliz é o tipo
  // de proteção que falta justamente onde o app está se defendendo.
  const resposta = await updateSession(request, cabecalhos);
  resposta.headers.set("Content-Security-Policy", csp);
  return resposta;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
