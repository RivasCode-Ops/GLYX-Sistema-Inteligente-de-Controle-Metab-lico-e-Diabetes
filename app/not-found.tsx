import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <p className="text-sm text-zinc-500">404</p>
      <h1 className="mt-1 text-2xl font-semibold">Página não encontrada</h1>
      <p className="mt-2 max-w-sm text-center text-sm text-zinc-400">
        O endereço pode ter sido alterado ou o registo já não existe.
      </p>
      <Button asChild className="mt-8">
        <Link href="/dashboard">Ir para o painel</Link>
      </Button>
    </div>
  );
}
