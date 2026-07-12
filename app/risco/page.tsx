import { AdaRiskTest } from "@/components/risco/ada-risk-test";

export const metadata = {
  title: "Teste de risco de diabetes — GLYX",
  description:
    "Descubra em 1 minuto seu risco de diabetes tipo 2 com o escore validado da ADA. Gratuito e sem cadastro.",
};

// Página pública: qualquer pessoa pode fazer o teste e compartilhar o link
export default function RiscoPage() {
  return (
    <main className="mx-auto max-w-md space-y-6 px-5 py-10">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-2xl font-bold text-emerald-300">
          G
        </div>
        <h1 className="text-2xl font-semibold text-zinc-100">
          Qual o seu risco de diabetes tipo 2?
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          6 perguntas, 1 minuto, sem cadastro — escore oficial da American Diabetes Association.
        </p>
      </div>
      <AdaRiskTest />
    </main>
  );
}
