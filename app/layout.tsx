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
