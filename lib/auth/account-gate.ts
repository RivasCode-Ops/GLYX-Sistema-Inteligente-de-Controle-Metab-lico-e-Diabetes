/**
 * O que fazer com uma sessão válida, dado o perfil lido do banco.
 *
 * FALHA FECHADA. Até 14/10/2026 o middleware fazia `if (profile?.disabled)`:
 * se a leitura do perfil FALHASSE, `profile` vinha nulo, a condição dava falso
 * e a conta passava — inclusive uma conta desativada, justamente no momento em
 * que o banco estava instável. Agora erro de leitura é "indisponível" (503), e
 * não "liberado" nem "desativada": dizer a alguém que a conta foi desativada
 * por causa de uma falha de rede seria outra mentira.
 *
 * Perfil ausente sem erro (não deveria existir: o trigger cria no cadastro)
 * continua liberado, como `public.conta_ativa()` no banco.
 *
 * Esta é a camada da interface. A que vale para quem chama o PostgREST direto
 * é a policy restritiva `conta_ativa` (migration 20261015102000).
 */
export type DecisaoDeConta = "liberar" | "desativada" | "indisponivel";

export function decidirAcessoDaConta(leitura: {
  data: { disabled?: boolean | null } | null;
  error: unknown;
}): DecisaoDeConta {
  if (leitura.error) return "indisponivel";
  if (leitura.data?.disabled) return "desativada";
  return "liberar";
}
