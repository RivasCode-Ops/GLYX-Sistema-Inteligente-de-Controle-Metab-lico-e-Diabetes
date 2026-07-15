/**
 * Traduz erros técnicos da sincronização do CGM para uma orientação em
 * português com o próximo passo — "Unsupported state or unable to
 * authenticate data" é jargão do Node/crypto que ninguém tem como agir
 * em cima.
 */
export function friendlyCgmError(raw: string): string {
  if (/unsupported state|unable to authenticate data|bad decrypt/i.test(raw)) {
    return (
      "A senha guardada ficou inválida após uma atualização de segurança do app. " +
      "Informe o e-mail e a senha do LibreLinkUp de novo para voltar a sincronizar."
    );
  }
  return raw;
}
