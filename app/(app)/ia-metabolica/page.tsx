import { IaChat } from "@/components/ia/ia-chat";

export default function IaMetabolicaPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <p className="text-sm text-zinc-400">
        Copiloto racional baseado em linguagem natural. As respostas são informativas e não substituem
        avaliação médica.
      </p>
      <IaChat />
    </div>
  );
}
