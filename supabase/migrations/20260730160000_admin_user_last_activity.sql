-- `admin_user_stats` passa a responder QUANDO cada conta foi usada.
--
-- O painel já mostrava quantos registros cada usuário tem, mas contagem não
-- distingue "entrou uma vez em julho e sumiu" de "está usando agora" — e é essa
-- a pergunta quando se quer saber se tem mais alguém no sistema.
--
-- Duas datas, porque medem coisas diferentes e podem discordar:
--   last_sign_in_at  — a sessão (vem de auth.users, fora do alcance do RLS)
--   last_activity_at — o dado gravado; alguém pode ficar logado por semanas sem
--                      registrar nada, e o inverso não acontece.

-- `create or replace` não basta: acrescentar colunas muda o tipo de retorno, e
-- o Postgres recusa. Drop e create ficam na mesma transação da migration, então
-- não existe instante em que o painel encontre a função ausente.
drop function if exists public.admin_user_stats();

create function public.admin_user_stats()
returns table(
  id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  disabled boolean,
  is_admin boolean,
  glucose_count bigint,
  meals_count bigint,
  medications_count bigint,
  ai_calls_7d bigint,
  ai_input_tokens bigint,
  ai_output_tokens bigint,
  last_sign_in_at timestamptz,
  last_activity_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_current_user_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select
    p.id,
    p.email,
    p.full_name,
    p.created_at,
    p.disabled,
    p.is_admin,
    (select count(*) from public.glucose_readings g where g.user_id = p.id),
    (select count(*) from public.meals m where m.user_id = p.id),
    (select count(*) from public.medications md where md.user_id = p.id),
    (select count(*) from public.ai_usage a
      where a.user_id = p.id and a.created_at > now() - interval '7 days'),
    coalesce((select sum(a.prompt_tokens) from public.ai_usage a where a.user_id = p.id), 0),
    coalesce((select sum(a.completion_tokens) from public.ai_usage a where a.user_id = p.id), 0),
    (select u.last_sign_in_at from auth.users u where u.id = p.id),
    -- greatest() ignora NULL quando ao menos um argumento tem valor, então
    -- conta nova (sem registro nenhum) devolve NULL em vez de uma data falsa.
    greatest(
      (select max(g.recorded_at) from public.glucose_readings g where g.user_id = p.id),
      (select max(m.eaten_at) from public.meals m where m.user_id = p.id),
      (select max(e.started_at) from public.exercise_sessions e where e.user_id = p.id),
      (select max(a.created_at) from public.ai_usage a where a.user_id = p.id)
    )
  from public.profiles p
  order by p.created_at desc;
end;
$function$;

comment on function public.admin_user_stats is
  'Estatísticas por conta para o painel admin. Não expõe conteúdo clínico — só contagens e datas.';
