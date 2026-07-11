import Link from "next/link";

type Props = { params: Promise<{ id: string }> };

export default async function ExercicioSessaoDetailPage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/exercicios/sessoes" className="text-sm text-emerald-400 hover:underline">
        ← Voltar às sessões
      </Link>
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Sessão</h2>
        <p className="font-mono text-sm text-zinc-500">id = {id}</p>
      </div>
      <p className="text-sm text-zinc-400">
        Detalhe com FC, percepção de esforço e contexto glicêmico (dados reais depois).
      </p>
    </div>
  );
}
