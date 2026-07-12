import { InstallGuide } from "@/components/pwa/install-guide";

export const metadata = {
  title: "Instalar o GLYX no celular",
  description: "Guia passo a passo para instalar o GLYX como aplicativo.",
};

// Página pública: pode ser enviada por WhatsApp para qualquer pessoa instalar
export default function InstalarPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-3xl font-bold text-emerald-300">
          G
        </div>
        <h1 className="text-2xl font-semibold text-zinc-100">Instale o GLYX</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Vira um aplicativo de verdade: ícone na tela, tela cheia e alarmes de medicação.
        </p>
      </div>
      <InstallGuide />
    </main>
  );
}
