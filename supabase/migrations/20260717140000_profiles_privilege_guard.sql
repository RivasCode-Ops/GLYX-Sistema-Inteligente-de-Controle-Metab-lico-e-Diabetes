-- Impede escalonamento de privilégio: a policy profiles_update_own (using
-- auth.uid() = id, sem with check) permitia ao próprio usuário alterar
-- qualquer coluna da própria linha, inclusive is_admin e disabled. Este
-- trigger reverte essas duas colunas para o valor anterior sempre que quem
-- está executando o UPDATE não for admin nem service_role — sem quebrar o
-- caminho legítimo (toggleUserDisabled em app/actions/admin.ts, que já
-- depende de is_current_user_admin() na policy profiles_update_admin).

create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.is_admin is distinct from old.is_admin
      or new.disabled is distinct from old.disabled)
     and auth.role() <> 'service_role'
     and not public.is_current_user_admin() then
    new.is_admin := old.is_admin;
    new.disabled := old.disabled;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
before update on public.profiles
for each row execute function public.profiles_guard_privileged_columns();
