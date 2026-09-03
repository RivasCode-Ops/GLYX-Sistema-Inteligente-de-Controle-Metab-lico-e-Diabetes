/**
 * Verifica o CSP em navegador de verdade.
 *
 * Por que não basta conferir o cabeçalho: a política pode estar impecável na
 * resposta e mesmo assim matar a página. É o que acontece com página
 * pré-renderizada — os `<script>` saem sem o nonce, o navegador recusa os
 * inline, e a página aparece na tela **sem hidratar**: o formulário desenha e o
 * botão não faz nada. Nenhum código de status denuncia isso; a resposta é 200.
 *
 * Por isso a verificação afirma DUAS coisas, e a segunda é a que importa:
 *   1. zero violações de CSP (console + evento `securitypolicyviolation`);
 *   2. `hidratou=true` — o React montou. Sem esta, "zero violação" também
 *      descreveria uma página morta, que não chegou a tentar nada.
 *
 * Uso, com o app servindo em produção (`npm run build && npm start`):
 *   node scripts/verifica-csp.mjs http://127.0.0.1:3000
 *   node scripts/verifica-csp.mjs http://127.0.0.1:3000 /login /dashboard
 *
 * Para alcançar as telas internas sem sessão, suba o servidor sem o Supabase
 * (`NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npx next start`):
 * o middleware devolve cedo e as páginas renderizam com as fixtures de demo.
 * Nesse modo o `connect-src` sai sem a origem do Supabase — o que se prova aqui
 * é script e estilo, não a lista de origens.
 *
 * Sai com código 1 se qualquer rota reprovar, para poder virar passo de CI.
 */
import { chromium } from "@playwright/test";

/** As públicas (alcançáveis sem sessão) e uma amostra do miolo do app. */
const ROTAS_PADRAO = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/privacidade",
  "/instalar",
  "/risco",
  "/conta-desativada",
];

const base = (process.argv[2] || "http://127.0.0.1:3000").replace(/\/+$/, "");
const rotas = (process.argv.length > 3 ? process.argv.slice(3) : ROTAS_PADRAO).map(
  (r) => {
    // O Git Bash do Windows converte um argumento iniciado em "/" para caminho
    // do Windows ANTES de o script ver: "/login" chega como
    // "C:/Program Files/Git/login". Recupera-se o que vem depois do "/Git/",
    // preservando rota de mais de um nível.
    const bruto = String(r);
    const i = bruto.indexOf("/Git/");
    const limpo = i >= 0 ? bruto.slice(i + "/Git".length) : bruto;
    return "/" + limpo.replace(/^\/+/, "");
  }
);

const navegador = await chromium.launch();
let houveFalha = false;

for (const rota of rotas) {
  const ctx = await navegador.newContext();
  const page = await ctx.newPage();
  const violacoes = [];
  const erros = [];

  page.on("console", (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to/i.test(t)) violacoes.push(t);
  });
  page.on("pageerror", (e) => erros.push(String(e).slice(0, 160)));

  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__csp.push(`${e.violatedDirective} <- ${e.blockedURI || "inline"}`);
    });
  });

  const resp = await page.goto(base + rota, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  const doDom = await page.evaluate(() => window.__csp || []);

  // React montado deixa propriedades internas no primeiro elemento do body.
  const hidratou = await page.evaluate(() => {
    const el = document.body.querySelector("*");
    if (!el) return false;
    return Object.keys(el).some((k) => k.startsWith("__react"));
  });

  const nonces = await page.evaluate(
    () => document.querySelectorAll("script[nonce]").length
  );
  const scripts = await page.evaluate(() => document.querySelectorAll("script").length);

  const todas = [...new Set([...violacoes, ...doDom])];
  const ok = todas.length === 0 && hidratou && erros.length === 0;
  if (!ok) houveFalha = true;

  console.log(
    `${ok ? "OK  " : "FALHA"} ${rota.padEnd(22)} status=${resp?.status()} ` +
      `scripts=${scripts} com-nonce=${nonces} hidratou=${hidratou} violacoes=${todas.length}`
  );
  for (const v of todas.slice(0, 4)) console.log("       ! " + v.slice(0, 150));
  for (const e of erros.slice(0, 2)) console.log("       x " + e);
  await ctx.close();
}

await navegador.close();
process.exit(houveFalha ? 1 : 0);
