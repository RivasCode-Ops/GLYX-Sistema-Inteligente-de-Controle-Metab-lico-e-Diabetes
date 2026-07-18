-- Duas chamadas concorrentes de sync (duplo clique, app + aba abertos) liam
-- consecutive_failures no início da requisição e escreviam de volta no fim —
-- a segunda sobrescrevia o incremento da primeira (lost update), subcontando
-- falhas seguidas do circuit breaker. Incrementa atomicamente dentro do
-- próprio UPDATE em vez de ler-then-escrever em JS.
create or replace function public.cgm_bump_failure(
  p_user_id uuid,
  p_provider text,
  p_error text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  if auth.uid() is distinct from p_user_id and auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;

  update public.cgm_connections
  set consecutive_failures = coalesce(consecutive_failures, 0) + 1,
      last_error = p_error
  where user_id = p_user_id and provider = p_provider
  returning consecutive_failures into new_count;

  return new_count;
end;
$$;

revoke all on function public.cgm_bump_failure(uuid, text, text) from public, anon;
grant execute on function public.cgm_bump_failure(uuid, text, text) to authenticated, service_role;
