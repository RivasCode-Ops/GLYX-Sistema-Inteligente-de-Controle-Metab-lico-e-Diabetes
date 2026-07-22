"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { IaChat } from "@/components/ia/ia-chat";

/**
 * Copiloto metabólico como botão flutuante global — antes era uma tela própria
 * (/ia-metabolica) que reproduzia, em chat, as mesmas análises do módulo
 * /analise. Como FAB, fica acessível de qualquer tela sem ocupar um item de menu.
 */
export function MetabolicChatFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir copiloto metabólico"
        className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 md:bottom-6 md:right-6"
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Copiloto</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-2xl gap-0 overflow-y-auto border-transparent bg-transparent p-0 shadow-none"
        >
          <DialogTitle className="sr-only">Copiloto metabólico</DialogTitle>
          <IaChat />
        </DialogContent>
      </Dialog>
    </>
  );
}
