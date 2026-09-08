import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PwaSetup } from "@/components/pwa/pwa-setup";
import "./globals.css";

/**
 * Fontes servidas do próprio domínio, sem dependência externa em runtime.
 *
 * O app já não pedia fonte ao Google no navegador: `next/font/google` baixava no
 * build e servia de `/_next/static/media`, e o CSP daqui tem `font-src 'self'`
 * (medido no build: 8 woff2 locais, nenhuma requisição a gstatic). O que sai
 * agora é a dependência de BUILD — os arquivos moram no repositório, então o
 * build não depende de o Google estar no ar.
 *
 * São DOIS arquivos, não quatro: o Google serve Outfit e Inter como fontes
 * VARIÁVEIS, e um arquivo cobre a faixa inteira de pesos. Isso também elimina o
 * risco de negrito sintético — o eixo tem 400, 500, 600 e 700 de verdade, que
 * são exatamente os quatro pesos que o app declara (medido: 3 font-normal,
 * 149 font-medium, 70 font-semibold, 16 font-bold).
 *
 * A monoespaçada é a do sistema: não se baixa fonte para mostrar número.
 */
const outfit = localFont({
  src: "../public/fonts/Outfit-Variable.woff2",
  variable: "--font-outfit",
  weight: "400 700",
  display: "swap",
});

const inter = localFont({
  src: "../public/fonts/Inter-Variable.woff2",
  variable: "--font-inter",
  weight: "400 700",
  display: "swap",
});

/**
 * Toda página renderiza por requisição, e o motivo é o CSP.
 *
 * O `script-src` carrega um nonce sorteado no middleware, e é o render que
 * carimba esse nonce nos `<script>` do Next. Página pré-renderizada no build
 * não passa por render nenhum na requisição: ela sai com os scripts sem nonce,
 * o navegador recusa os inline e a página **não hidrata** — o formulário de
 * login aparece na tela e o botão não faz nada.
 *
 * Medido em 03/09/2026, antes desta linha existir: /login, /register,
 * /privacidade, /instalar e /risco eram estáticas e davam 7 a 8 violações de
 * CSP cada uma, com `hidratou=false` em navegador real
 * (`node scripts/verifica-csp.mjs`). Eram justamente as páginas públicas — as
 * únicas que um atacante alcança sem sessão.
 *
 * O preço é render por requisição em 12 rotas que antes vinham prontas. Num app
 * de um usuário, isso não se mede; a página de login morta, sim.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GLYX — Controle metabólico",
  description:
    "Copiloto inteligente para glicemia, alimentação, exercício e medicação.",
};

/** Mobile + safe areas: shell usa `env(safe-area-inset-*)` na tab bar e padding inferior. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body
        className={`${outfit.variable} ${inter.variable} font-sans glyx-bg`}
      >
        {children}
        <PwaSetup />
      </body>
    </html>
  );
}
