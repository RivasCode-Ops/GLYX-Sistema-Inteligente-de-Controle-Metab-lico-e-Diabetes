-- Fecha o grant implicito de PUBLIC que sobrou da criacao das funcoes
-- admin_* e is_current_user_admin (o `grant ... to authenticated` nunca
-- revogou o EXECUTE que o Postgres da a PUBLIC por padrao ao criar uma
-- funcao). Mantem authenticated, ja que a checagem interna
-- is_current_user_admin() protege o dado.
revoke execute on function public.admin_ai_spend(timestamptz) from public, anon;
revoke execute on function public.admin_user_stats() from public, anon;
revoke execute on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated;

-- Correcao: is_current_user_admin() e chamada DENTRO das policies de RLS
-- da tabela profiles (que tem GRANT SELECT/UPDATE para anon e
-- authenticated, protegida so pela RLS). Revogar EXECUTE de anon faz a
-- clausula "auth.uid() = id OR is_current_user_admin()" estourar
-- "permission denied for function" em vez de simplesmente retornar
-- vazio. A funcao so retorna um boolean (sem dado sensivel) e para
-- anon (auth.uid() nulo) sempre resulta em false, entao mante-la
-- executavel por anon e seguro e evita quebrar a query.
grant execute on function public.is_current_user_admin() to anon;
