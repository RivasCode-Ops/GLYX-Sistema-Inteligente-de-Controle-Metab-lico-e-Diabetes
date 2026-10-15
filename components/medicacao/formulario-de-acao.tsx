"use client";

import { useActionState, type ReactNode } from "react";

/**
 * Formulário de ação do servidor que NÃO depende de `redirect()` depois da ação.
 *
 * Medido em 15/10/2026 no build de produção (Next 15.5, `next start`): a ação que
 * chama `redirect()` responde 303 com o destino, mas o roteador do cliente nem
 * sempre conclui a navegação — a pergunta de conflito (D14/F2) não abria, o
 * aviso de recusa da frequência (D1) e da ativação de alarme (D3) não aparecia.
 * No servidor de desenvolvimento funcionava, por isso passou na A4.
 *
 * Aqui a ação DEVOLVE o que fazer:
 * - `aviso`: mostrado ao lado do formulário (nada foi gravado);
 * - `ir`: navegação completa do navegador para o destino (pergunta de conflito,
 *   motivo da falha, login);
 * - null: deu certo; a página se atualiza pela revalidação da própria ação.
 */
export type ResultadoDeAcao = { aviso?: string; ir?: string } | null;

export function FormularioDeAcao({
  acao,
  className,
  children,
}: {
  acao: (anterior: ResultadoDeAcao, dados: FormData) => Promise<ResultadoDeAcao>;
  className?: string;
  children: ReactNode;
}) {
  // A navegação sai daqui, assim que o resultado chega — não de um efeito: a
  // revalidação da própria ação pode tirar este formulário da tela (ex.: o botão
  // "Corrigir" some depois da correção) e o efeito nunca rodaria.
  const [resultado, enviar] = useActionState(async (anterior: ResultadoDeAcao, dados: FormData) => {
    const r = await acao(anterior, dados);
    if (r?.ir) window.location.assign(r.ir);
    return r;
  }, null);
  return (
    <form action={enviar} className={className}>
      {resultado?.aviso ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200 sm:col-span-2"
        >
          Não salvei: {resultado.aviso}
        </p>
      ) : null}
      {children}
    </form>
  );
}
