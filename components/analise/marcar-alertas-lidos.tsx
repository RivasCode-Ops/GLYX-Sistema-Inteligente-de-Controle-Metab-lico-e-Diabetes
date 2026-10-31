"use client";

import { useEffect } from "react";
import { marcarAlertasComoLidos } from "@/app/actions/alerts";

/** Ao abrir a lista de alertas, grava `read_at` (B16). Não renderiza nada. */
export function MarcarAlertasLidos({ haNaoLidos }: { haNaoLidos: boolean }) {
  useEffect(() => {
    if (haNaoLidos) void marcarAlertasComoLidos();
  }, [haNaoLidos]);
  return null;
}
