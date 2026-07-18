-- Advisor de seguranca do Supabase apontou que esta funcao de trigger
-- ficou executavel via /rest/v1/rpc/profiles_guard_privileged_columns por
-- anon/authenticated (grant PUBLIC implicito do Postgres na criacao).
-- Ela so precisa disparar como trigger BEFORE UPDATE — nunca deve ser
-- chamada diretamente via RPC.
revoke execute on function public.profiles_guard_privileged_columns() from public, anon, authenticated;
