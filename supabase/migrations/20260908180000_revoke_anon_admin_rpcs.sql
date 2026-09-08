-- Endurecimento pós-pentest de 08/09/2026 — defesa em profundidade.
--
-- O advisor do Supabase (lint 0028) aponta quatro funções SECURITY DEFINER
-- executáveis pelo papel `anon`. No pentest cada uma foi chamada como anon e
-- RECUSOU pela verificação interna — `admin_user_stats` exige admin,
-- `record_system_ai_usage` valida o segredo, e assim por diante. Ou seja: não
-- há exposição hoje. Mas "a função se defende sozinha" é uma linha de defesa;
-- "anon nem alcança a função" é outra, e não custa nada tê-la, porque nenhuma
-- das quatro é chamada por anon legitimamente:
--
--   admin_user_stats / admin_ai_spend  -> só a sessão do admin (/admin)
--   cgm_bump_failure                    -> sessão autenticada e service_role
--   record_system_ai_usage              -> service_role no cron
--
-- `is_current_user_admin` fica DE FORA de propósito: ela é chamada dentro das
-- policies de `profiles`, e revogar o EXECUTE do papel que aciona a policy
-- trocaria "0 linhas" (RLS filtrando) por erro 42501. A defesa dela é retornar
-- `false`, e o pentest confirmou que retorna.
--
-- `authenticated` e `service_role` seguem com EXECUTE. Só `anon` e o coringa
-- `public` perdem — e `public` porque grant a `public` alcança `anon` por
-- transitividade, então revogar só de `anon` deixaria a porta pelo `public`.

revoke execute on function public.admin_user_stats() from anon, public;
revoke execute on function public.admin_ai_spend(timestamptz) from anon, public;
revoke execute on function public.cgm_bump_failure(uuid, text, text) from anon, public;
revoke execute on function public.record_system_ai_usage(uuid, text, integer, integer, text, text)
  from anon, public;
