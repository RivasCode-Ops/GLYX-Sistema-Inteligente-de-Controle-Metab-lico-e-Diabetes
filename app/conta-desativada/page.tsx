export const metadata = { title: "Conta desativada — GLYX" };

export default function ContaDesativadaPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-2xl">
        🔒
      </div>
      <h1 className="text-xl font-semibold text-zinc-100">Conta desativada</h1>
      <p className="text-sm text-zinc-400">
        O acesso a esta conta foi desativado pelo administrador do GLYX. Se você acredita que isso é
        um engano, entre em contato com quem administra o app.
      </p>
    </main>
  );
}
