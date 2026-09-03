import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { PwaSetup } from "@/components/pwa/pwa-setup";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
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
        className={`${dmSans.variable} ${jetbrains.variable} font-sans glyx-bg`}
        style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}
      >
        {children}
        <PwaSetup />
      </body>
    </html>
  );
}
