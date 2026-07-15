"use client";

import { useState } from "react";
import { deleteAllMyData } from "@/app/actions/privacy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DataPrivacySection() {
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    setLoading(true);
    setStatus(null);
    const result = await deleteAllMyData();
    setLoading(false);
    setConfirming(false);
    setStatus(
      result.ok
        ? "Todos os seus registros foram apagados. A conta de login permanece ativa."
        : result.error ?? "Falha ao apagar os dados."
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Meus dados (LGPD)</CardTitle>
        <CardDescription>Exporte uma cópia ou apague todos os seus registros.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {status ? (
          <p className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3 text-xs text-zinc-300">
            {status}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline">
            <a href="/api/me/export" download>
              Exportar meus dados (JSON)
            </a>
          </Button>

          {confirming ? (
            <span className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-red-800 text-red-300 hover:bg-red-950/50"
                disabled={loading}
                onClick={() => void onDelete()}
              >
                {loading ? "Apagando…" : "Confirmar exclusão definitiva"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="border-red-900/60 text-red-400 hover:bg-red-950/40"
              onClick={() => setConfirming(true)}
            >
              Apagar todos os meus dados
            </Button>
          )}
        </div>

        <p className="text-xs leading-5 text-zinc-500">
          A exclusão remove glicemia, refeições, água, peso, medicações, exercício, alertas, exames,
          insights, uso de IA, push, conexão CGM e fotos privadas de forma{" "}
          <strong>irreversível</strong>. Para excluir também a conta de login, contate o responsável
          indicado na Política de Privacidade.
        </p>
      </CardContent>
    </Card>
  );
}
