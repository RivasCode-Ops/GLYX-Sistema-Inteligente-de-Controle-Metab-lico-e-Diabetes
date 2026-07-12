import { PlateBuilderForm } from "@/components/alimentacao/plate-builder-form";

export const metadata = {
  title: "Montar prato — GLYX",
};

export default function MontarPratoPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p className="text-sm text-zinc-400">
        Fotografe a bancada ou a despensa e a IA monta um prato equilibrado com o que você tem —
        levando em conta suas metas glicêmicas e sua última leitura.
      </p>
      <PlateBuilderForm />
    </div>
  );
}
