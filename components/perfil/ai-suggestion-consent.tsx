"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { definirSugestaoAutomaticaIA, type ConsentimentoResult } from "@/app/actions/ai-consent";

async function acao(_prev: ConsentimentoResult | undefined, formData: FormData) {
  return definirSugestaoAutomaticaIA(formData);
}

function Enviar({ ligar }: { ligar: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={ligar ? "default" : "outline"} disabled={pending}>
      {pending ? "Salvando…" : ligar ? "Ligar sugestão automática" : "Desligar sugestão automática"}
    </Button>
  );
}

/**
 * Consentimento da sugestão automática de refeição por IA (Etapa 1, A1).
 * `disponivel` é falso quando o banco ainda não tem a coluna (migration
 * 20261031102000 não aplicada): a tela diz isso em vez de oferecer um botão que
 * falharia.
 */
export function AiSuggestionConsent({ ativo, disponivel }: { ativo: boolean; disponivel: boolean }) {
  const [state, action] = useActionState(acao, undefined);
  const atual = state?.ok ? Boolean(state.ativo) : ativo;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sugestão automática de refeição por IA</CardTitle>
        <CardDescription>
          Quando ligada, perto do fim do horário de uma refeição que você ainda não registrou, o GLYX
          envia ao provedor de IA o tipo da refeição, seu objetivo, o tipo de diabetes, a última
          glicemia e o total de calorias e carboidratos do dia, e manda a sugestão por notificação.
          Sem seu nome, e-mail ou identificação. Desligada, nada disso sai do app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {disponivel ? (
          <form action={action} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="ativo" value={atual ? "false" : "true"} />
            <span className="text-sm text-zinc-300">
              Situação: <strong>{atual ? "ligada" : "desligada"}</strong>
            </span>
            <Enviar ligar={!atual} />
          </form>
        ) : (
          <p className="text-xs text-amber-300">
            Desligada. A opção de ligar aparece depois da próxima atualização do banco do app.
          </p>
        )}
        {state?.error ? <p className="text-xs text-red-300">{state.error}</p> : null}
      </CardContent>
    </Card>
  );
}
