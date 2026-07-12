-- Painel de administração: papel de admin, desativação de conta e
-- estatísticas agregadas (sem expor conteúdo de saúde de outros
-- usuários — só contagens e uso de IA).

alter table public.profiles
  add column if not exists email text,
  add column if not exists is_admin boolean not null default false,
  add column if not exists disabled boolean not null default false;

update public.profiles p set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- Ajuste manual pontual: define o dono do projeto como admin.
update public.profiles set is_admin = true where id = 'bba28bd7-bbff-4673-8c1d-0caaf318eb35';

-- SECURITY DEFINER evita recursão de RLS ao checar o próprio papel.
create or replace function public.is_current_user_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
  for select using (public.is_current_user_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

-- Estatísticas por usuário: só contagens/uso de IA, nunca o conteúdo
-- clínico (glicemia, refeições etc.) de outra pessoa.
create or replace function public.admin_user_stats()
returns table (
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
  ai_output_tokens bigint
)
language plpgsql
security definer
set search_path = public
as $$
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
    (select count(*) from public.ai_usage a where a.user_id = p.id and a.created_at > now() - interval '7 days'),
    coalesce((select sum(a.prompt_tokens) from public.ai_usage a where a.user_id = p.id), 0),
    coalesce((select sum(a.completion_tokens) from public.ai_usage a where a.user_id = p.id), 0)
  from public.profiles p
  order by p.created_at desc;
end;
$$;

grant execute on function public.admin_user_stats() to authenticated;

-- Gasto agregado de todo o app (base do "relógio de gastos").
create or replace function public.admin_ai_spend(since timestamptz)
returns table (calls bigint, input_tokens bigint, output_tokens bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select
    count(*)::bigint,
    coalesce(sum(prompt_tokens), 0)::bigint,
    coalesce(sum(completion_tokens), 0)::bigint
  from public.ai_usage
  where created_at >= since;
end;
$$;

grant execute on function public.admin_ai_spend(timestamptz) to authenticated;
