import { looksLikeProviderIssue } from "@/lib/cgm/outage";

/**
 * Quando a falha é do lado do provedor, o usuário precisa de duas coisas que a
 * mensagem de erro sozinha não dá: saber que **não é ele**, e saber que existe
 * um caminho para não perder a semana de dados.
 *
 * Sem isto, o comportamento observado é reconferir a senha várias vezes,
 * concluir que o app quebrou, e nunca descobrir o import por CSV — que já
 * existia logo abaixo na mesma tela, sem nada ligando um ao outro.
 */
export function ProviderIssueNotice({
  libreErrorKind,
  dexcomErrorKind,
}: {
  libreErrorKind?: string | null;
  dexcomErrorKind?: string | null;
}) {
  const libre = looksLikeProviderIssue(libreErrorKind);
  const dexcom = looksLikeProviderIssue(dexcomErrorKind);
  if (!libre && !dexcom) return null;

  const which = libre && dexcom ? "dos sensores" : libre ? "do FreeStyle Libre" : "do Dexcom";
  const isVersion = libreErrorKind === "client_version" || dexcomErrorKind === "client_version";

  return (
    <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4">
      <p className="text-sm font-medium text-amber-200">
        A última falha veio do lado {which}, não da sua conta
      </p>
      <p className="mt-1 text-xs leading-snug text-zinc-300">
        {isVersion
          ? "A API exigiu uma versão de cliente mais nova — isso muda quando o fabricante atualiza o serviço, e nenhuma ação sua resolve. Já estamos sabendo pelo monitoramento."
          : "O serviço do fabricante não respondeu nas últimas tentativas. Costuma se resolver sozinho; o app volta a sincronizar automaticamente quando a pausa de proteção terminar."}
      </p>
      <p className="mt-2 text-xs leading-snug text-zinc-300">
        <strong>Enquanto isso, você não precisa perder leitura:</strong> exporte o CSV no app do
        sensor e importe aqui embaixo. As leituras entram no mesmo histórico, sem duplicar o que já
        foi sincronizado.
      </p>
      <p className="mt-1 text-[11px] text-zinc-500">
        Não reconfigure a senha por causa deste erro — se ela estivesse errada, a mensagem seria
        outra.
      </p>
    </div>
  );
}
