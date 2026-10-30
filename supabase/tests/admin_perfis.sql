-- 20261030140000: admin não lê nem altera o perfil inteiro de outra conta;
-- desativar passa só pela RPC.
--
-- RODA SÓ EM BANCO DE TESTE (GLYX-03). Transação desfeita no fim.
--   psql "$URL_DO_BANCO_DE_TESTE" -v ON_ERROR_STOP=1 -f supabase/tests/admin_perfis.sql
--
-- Contra as policies antigas, o admin lê carb_ratio de B e o altera — é o defeito (GLYX-18).

begin;

create temp table ids (admin uuid, b uuid, comum uuid) on commit drop;
insert into ids values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());
grant select on ids to authenticated;

insert into auth.users (id, email) select admin, admin::text || '@teste.invalid' from ids;
insert into auth.users (id, email) select b, b::text || '@teste.invalid' from ids;
insert into auth.users (id, email) select comum, comum::text || '@teste.invalid' from ids;
insert into public.profiles (id, is_admin) select admin, true from ids on conflict (id) do update set is_admin = true;
insert into public.profiles (id, carb_ratio) select b, 12 from ids on conflict (id) do update set carb_ratio = 12;
insert into public.profiles (id) select comum from ids on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select admin from ids), 'role', 'authenticated')::text, true);

do $$
declare
  v ids%rowtype;
  n int;
begin
  select * into v from ids;

  select count(*) into n from public.profiles where id = v.b;
  if n <> 0 then raise exception 'FALHOU: admin leu o perfil de B'; end if;

  update public.profiles set carb_ratio = 5 where id = v.b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: admin alterou carb_ratio de B'; end if;

  if not public.admin_definir_conta_desativada(v.b, true) then
    raise exception 'FALHOU: admin não conseguiu desativar B pela RPC';
  end if;

  begin
    perform public.admin_definir_conta_desativada(v.admin, true);
    raise exception 'FALHOU: admin desativou a própria conta';
  exception when invalid_parameter_value then
    null;
  end;

  select count(*) into n from public.profiles where id = v.admin;
  if n <> 1 then raise exception 'FALHOU: admin perdeu a leitura do próprio perfil'; end if;
end;
$$;

-- Usuário comum não usa a RPC.
select set_config('request.jwt.claims', json_build_object('sub', (select comum from ids), 'role', 'authenticated')::text, true);
do $$
declare
  v ids%rowtype;
begin
  select * into v from ids;
  begin
    perform public.admin_definir_conta_desativada(v.b, false);
    raise exception 'FALHOU: usuário comum chamou a RPC de admin';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
do $$
begin
  if not (select disabled from public.profiles where id = (select b from ids)) then
    raise exception 'FALHOU: B não ficou desativada';
  end if;
  if (select carb_ratio from public.profiles where id = (select b from ids)) <> 12 then
    raise exception 'FALHOU: carb_ratio de B mudou';
  end if;
  raise notice 'admin e perfis: 7 cenários aprovados';
end;
$$;

rollback;
