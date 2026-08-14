"use client";

import { Fragment, type ReactNode } from "react";

/**
 * Renderiza o subconjunto de markdown que o copiloto realmente emite:
 * cabeçalho, negrito, lista e parágrafo. O resto passa como texto.
 *
 * Não usa biblioteca porque o projeto não tinha nenhuma e o caso é pequeno; e
 * **nunca** monta HTML como string — cada pedaço vira nó React. Isso não é
 * estilo: o conteúdo vem de um modelo que recebe texto livre do usuário no
 * contexto (nome de refeição, OCR de rótulo), então tratar a saída como HTML
 * confiável seria reabrir por outro caminho a injeção que `sanitize-context`
 * existe para fechar.
 */

/** Quebra em negrito por `**…**`, preservando o texto fora dos pares. */
function inline(text: string): ReactNode[] {
  const partes = text.split(/(\*\*[^*]+\*\*)/g);
  return partes.filter(Boolean).map((parte, i) =>
    parte.startsWith("**") && parte.endsWith("**") && parte.length > 4 ? (
      <strong key={i} className="font-semibold text-zinc-100">
        {parte.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{parte}</Fragment>
    )
  );
}

export function AssistantMarkdown({ content }: { content: string }) {
  const linhas = content.split("\n");
  const blocos: ReactNode[] = [];
  let lista: string[] = [];

  function fecharLista() {
    if (!lista.length) return;
    blocos.push(
      <ul key={`ul-${blocos.length}`} className="ml-4 list-disc space-y-0.5">
        {lista.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>
    );
    lista = [];
  }

  for (const linha of linhas) {
    const texto = linha.trimEnd();

    const cabecalho = /^(#{1,4})\s+(.*)$/.exec(texto);
    if (cabecalho) {
      fecharLista();
      blocos.push(
        <p key={`h-${blocos.length}`} className="mt-1 font-semibold text-zinc-100">
          {inline(cabecalho[2])}
        </p>
      );
      continue;
    }

    const item = /^\s*[-*]\s+(.*)$/.exec(texto);
    if (item) {
      lista.push(item[1]);
      continue;
    }

    fecharLista();
    // Linha em branco vira espaço entre blocos, não parágrafo vazio.
    if (!texto.trim()) continue;
    blocos.push(<p key={`p-${blocos.length}`}>{inline(texto)}</p>);
  }

  fecharLista();

  return <div className="space-y-2">{blocos}</div>;
}
