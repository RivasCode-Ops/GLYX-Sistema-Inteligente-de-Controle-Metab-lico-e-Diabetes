export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <p className="text-sm font-semibold tracking-wide text-emerald-400">GLYX</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-50">Controle metabólico</h1>
        <p className="mt-2 max-w-md text-sm text-zinc-500">
          Acesso seguro à sua central de dados. O GLYX não substitui orientação médica.
        </p>
      </div>
      <div className="w-full max-w-md">{children}</div>
      <p className="mt-8 text-xs text-zinc-600">
        © {new Date().getFullYear()} Riva&apos;s Alexandre
      </p>
    </div>
  );
}
