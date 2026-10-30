-- Admin deixa de ler e alterar o perfil inteiro de outras contas.
--
-- NÃO APLICADA. Criada em 30/10/2026. Tarefa GLYX-18 (P27).
--
-- O que havia (20260713150000):
--   * `profiles_select_admin` — o admin lia TODAS as colunas de todos os
--     perfis: tipo de diabetes, metas, razão carboidrato/insulina, fator de
--     correção, alvo do bolus, histórico familiar.
--   * `profiles_update_admin` — e podia ALTERAR qualquer uma delas. Razão
--     carbo/insulina e fator de correção alimentam a calculadora de dose: uma
--     conta admin comprometida mudava a dose sugerida de outra pessoa.
--
-- O que o app usa de fato (conferido em 30/10/2026): a tela de admin lista
-- contas por `admin_user_stats` e mede custo por `admin_ai_spend` (as duas
-- SECURITY DEFINER, não dependem destas policies); o único uso das policies era
-- `toggleUserDisabled`, que muda só `disabled`.
--
-- Agora: uma função que faz só isso, conferindo admin por dentro. As duas
-- policies amplas saem. O admin continua lendo e alterando o PRÓPRIO perfil
-- pelas policies `_own`, como qualquer usuário.
--
-- O gatilho `profiles_guard_privileged_columns` (20260717140000) continua
-- valendo: dentro desta função `is_current_user_admin()` é verdadeiro, então a
-- troca de `disabled` passa; fora dela, segue revertida.
--
-- Ordem de implantação: o CÓDIGO antes desta migration. O código novo chama a
-- função e, se ela ainda não existir, recua para o caminho antigo.

create or replace function public.admin_definir_conta_desativada(
  p_alvo uuid,
  p_desativada boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_alvo is null or p_desativada is null then
    raise exception 'parâmetros inválidos' using errcode = '22023';
  end if;
  if p_alvo = auth.uid() then
    raise exception 'a própria conta admin não pode ser desativada' using errcode = '22023';
  end if;

  update public.profiles set disabled = p_desativada where id = p_alvo;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

comment on function public.admin_definir_conta_desativada(uuid, boolean) is
  'Única alteração que o admin faz no perfil de outra conta: desativar ou reativar. Substitui profiles_update_admin (GLYX-18).';

revoke all on function public.admin_definir_conta_desativada(uuid, boolean) from public, anon;
grant execute on function public.admin_definir_conta_desativada(uuid, boolean) to authenticated;

drop policy if exists "profiles_select_admin" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
