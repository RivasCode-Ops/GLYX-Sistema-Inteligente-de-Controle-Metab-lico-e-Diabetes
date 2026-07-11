export default function AppLoading() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 py-8">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-zinc-800/80" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-32 animate-pulse rounded-2xl bg-zinc-800/60 md:col-span-2" />
        <div className="h-32 animate-pulse rounded-2xl bg-zinc-800/60" />
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-zinc-800/40" />
    </div>
  );
}
