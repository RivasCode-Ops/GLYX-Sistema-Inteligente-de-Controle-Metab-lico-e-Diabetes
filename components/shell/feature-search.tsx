"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { searchFeatures, formatWhere, FEATURES } from "@/lib/feature-index";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const MAX_RESULTS = 8;

/** Sugestões de partida: o que abre a lupa antes de qualquer letra digitada.
 * Sem elas o campo vazio não ensina nada sobre o que dá para procurar. */
const SUGESTOES = ["catálogo de exercícios", "exportar meus dados", "alarme", "sensor"];

/**
 * Lupa de funções da barra superior.
 *
 * Responde "onde eu acho X" sem exigir que o usuário saiba em qual módulo o app
 * decidiu guardar a coisa. Boa parte do que ele chama de função não tem tela
 * própria — o catálogo de exercícios é um campo dentro de um formulário — então
 * o resultado mostra o CAMINHO, não só o link: chegar na tela certa sem saber
 * onde olhar dentro dela é meio caminho.
 */
export function FeatureSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const results = useMemo(() => searchFeatures(query).slice(0, MAX_RESULTS), [query]);
  const buscando = query.trim().length >= 2;

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
          aria-label="Buscar função no app"
        >
          <Search className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Buscar</span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto rounded-2xl p-4 sm:rounded-2xl">
        <DialogHeader className="text-left">
          <DialogTitle>O que você procura?</DialogTitle>
          <DialogDescription>
            Digite o nome da função ou como você a chamaria — &quot;supino&quot; acha o catálogo de
            exercícios, &quot;levar pro médico&quot; acha o resumo da semana.
          </DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ex.: catálogo, alarme, exportar dados…"
          aria-label="Buscar função"
          className="mt-1"
        />

        {!buscando ? (
          <div className="mt-3 grid gap-1.5">
            <p className="text-[11px] uppercase tracking-wide text-zinc-600">Exemplos</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQuery(s)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-zinc-500">
              {FEATURES.length} funções indexadas. O copiloto de IA usa esta mesma lista, então
              perguntar a ele onde fica algo dá a mesma resposta.
            </p>
          </div>
        ) : results.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-400">
            Nada com esse nome. Tente outra palavra, ou abra o{" "}
            <Link href="/ajuda" onClick={close} className="text-emerald-300 underline">
              manual do app
            </Link>
            , que explica tela por tela.
          </p>
        ) : (
          <ul className="mt-3 grid gap-1">
            {results.map(({ feature }) => (
              <li key={`${feature.title}-${feature.href}`}>
                <Link
                  href={feature.href}
                  onClick={close}
                  className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-zinc-900"
                >
                  <p className="text-sm font-medium text-zinc-100">{feature.title}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-emerald-400/80">
                    {formatWhere(feature)}
                  </p>
                  <p className="mt-1 text-xs leading-snug text-zinc-500">{feature.what}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
